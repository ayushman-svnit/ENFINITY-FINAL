import json
import os
import time
from typing import List, Tuple

import cv2
import gradio as gr
import numpy as np
import torch
import torch.nn.functional as F
from huggingface_hub import hf_hub_download
from PIL import Image

from model import DPTDecoder, inject_lora


MODEL_REPO = os.environ.get("MODEL_REPO", "rrrr08/ENFINITY")
CHECKPOINT_NAME = os.environ.get("CHECKPOINT_NAME", "dinov2_dpt_full_lora.pth")
CONFIG_PATH = "config.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BACKBONE = None
DECODER = None
CFG = None
STATUS_MESSAGE = ""


def read_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_scales(raw: str) -> List[float]:
    out: List[float] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        out.append(float(item))
    return out or [1.0]


def ensure_checkpoint() -> str:
    if os.path.exists(CHECKPOINT_NAME):
        return CHECKPOINT_NAME

    token = os.environ.get("HF_TOKEN")
    return hf_hub_download(
        repo_id=MODEL_REPO,
        filename=CHECKPOINT_NAME,
        token=token,
    )


def preprocess(image: Image.Image, height: int, width: int, mean: List[float], std: List[float]) -> torch.Tensor:
    img = image.convert("RGB").resize((width, height), Image.BILINEAR)
    arr = np.asarray(img).astype(np.float32) / 255.0
    arr = (arr - np.array(mean, dtype=np.float32)) / np.array(std, dtype=np.float32)
    arr = np.transpose(arr, (2, 0, 1))
    tensor = torch.from_numpy(arr).unsqueeze(0)
    return tensor


def predict_tta(
    imgs: torch.Tensor,
    backbone,
    decoder,
    layer_indices: List[int],
    target_h: int,
    target_w: int,
    tta_scales: List[float],
) -> torch.Tensor:
    prob_outputs = []

    def process(imgs_input: torch.Tensor, out_h: int, out_w: int) -> torch.Tensor:
        feats = backbone.get_intermediate_layers(imgs_input, n=layer_indices, return_class_token=False)
        logits = decoder(imgs_input, feats)
        logits = F.interpolate(logits, size=(out_h, out_w), mode="bilinear", align_corners=False)
        return F.softmax(logits, dim=1)

    prob_outputs.append(process(imgs, target_h, target_w))

    imgs_h = torch.flip(imgs, dims=[3])
    probs_h = torch.flip(process(imgs_h, target_h, target_w), dims=[3])
    prob_outputs.append(probs_h)

    imgs_v = torch.flip(imgs, dims=[2])
    probs_v = torch.flip(process(imgs_v, target_h, target_w), dims=[2])
    prob_outputs.append(probs_v)

    imgs_hv = torch.flip(imgs, dims=[2, 3])
    probs_hv = torch.flip(process(imgs_hv, target_h, target_w), dims=[2, 3])
    prob_outputs.append(probs_hv)

    for scale in tta_scales:
        if abs(scale - 1.0) < 1e-6:
            continue

        h_scaled = int((target_h * scale) // 14) * 14
        w_scaled = int((target_w * scale) // 14) * 14
        if h_scaled < 14 or w_scaled < 14:
            continue

        imgs_scaled = F.interpolate(imgs, size=(h_scaled, w_scaled), mode="bilinear", align_corners=False)
        probs_scaled = process(imgs_scaled, target_h, target_w)
        prob_outputs.append(probs_scaled)

    avg_probs = torch.mean(torch.stack(prob_outputs), dim=0)
    return torch.log(avg_probs + 1e-8)


def mask_to_color(mask_np: np.ndarray, color_palette: List[List[int]]) -> np.ndarray:
    h, w = mask_np.shape
    color = np.zeros((h, w, 3), dtype=np.uint8)
    for cid, rgb in enumerate(color_palette):
        color[mask_np == cid] = np.array(rgb, dtype=np.uint8)
    return color


def load_model() -> None:
    global BACKBONE, DECODER, CFG, STATUS_MESSAGE

    try:
        CFG = read_config(CONFIG_PATH)
        h, w = CFG["image_height"], CFG["image_width"]
        th, tw = h // CFG["patch_size"], w // CFG["patch_size"]
        n_classes = CFG["n_classes"]
        layer_indices = CFG["backbone"]["intermediate_layers"]

        checkpoint_path = ensure_checkpoint()

        backbone = torch.hub.load("facebookresearch/dinov2", "dinov2_vitl14")
        inject_lora(backbone, rank=8, target_blocks=CFG["backbone"].get("unfreeze_last_n_blocks", 6))
        backbone.to(DEVICE)

        dummy = torch.randn(1, 3, h, w, device=DEVICE)
        with torch.no_grad():
            test_feats = backbone.get_intermediate_layers(dummy, n=layer_indices, return_class_token=False)
        in_channels = test_feats[0].shape[-1]
        del dummy, test_feats

        decoder = DPTDecoder(in_channels=in_channels, num_classes=n_classes, TH=th, TW=tw).to(DEVICE)

        checkpoint = torch.load(checkpoint_path, map_location=DEVICE)
        if not isinstance(checkpoint, dict) or "backbone" not in checkpoint or "decoder" not in checkpoint:
            raise ValueError("Checkpoint format invalid. Expected keys: backbone, decoder")

        backbone.load_state_dict(checkpoint["backbone"], strict=False)
        decoder.load_state_dict(checkpoint["decoder"])

        backbone.eval()
        decoder.eval()

        BACKBONE = backbone
        DECODER = decoder
        STATUS_MESSAGE = f"Model loaded on {DEVICE.type.upper()} | repo={MODEL_REPO}"
    except Exception as exc:
        BACKBONE = None
        DECODER = None
        STATUS_MESSAGE = f"Model load failed: {exc}"


@torch.inference_mode()
def run_inference(image: Image.Image, alpha: float, use_tta: bool, tta_scales: str) -> Tuple[Image.Image, Image.Image, str]:
    if image is None:
        raise gr.Error("Please upload an image.")

    if BACKBONE is None or DECODER is None or CFG is None:
        raise gr.Error(STATUS_MESSAGE or "Model is not loaded.")

    start = time.time()

    image_rgb = image.convert("RGB")
    orig_np = np.array(image_rgb)
    orig_h, orig_w = orig_np.shape[:2]

    mean = CFG["augmentation"]["normalize_mean"]
    std = CFG["augmentation"]["normalize_std"]
    h = CFG["image_height"]
    w = CFG["image_width"]
    layer_indices = CFG["backbone"]["intermediate_layers"]

    tensor = preprocess(image_rgb, h, w, mean, std).to(DEVICE)

    use_amp = bool(CFG.get("training", {}).get("mixed_precision", True)) and DEVICE.type == "cuda"
    with torch.cuda.amp.autocast(enabled=use_amp):
        if use_tta:
            scales = parse_scales(tta_scales)
            logits = predict_tta(tensor, BACKBONE, DECODER, layer_indices, h, w, scales)
        else:
            feats = BACKBONE.get_intermediate_layers(tensor, n=layer_indices, return_class_token=False)
            logits = DECODER(tensor, feats)

    pred = torch.argmax(logits, dim=1)[0].detach().cpu().numpy().astype(np.uint8)
    pred_resized = cv2.resize(pred, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)

    color_palette = CFG["classes"]["color_palette"]
    names = CFG["classes"]["names"]
    color_mask = mask_to_color(pred_resized, color_palette)
    overlay = cv2.addWeighted(orig_np, 1.0 - alpha, color_mask, alpha, 0)

    unique, counts = np.unique(pred_resized, return_counts=True)
    total = max(pred_resized.size, 1)
    stats = []
    for cid, count in zip(unique.tolist(), counts.tolist()):
        if 0 <= cid < len(names):
            pct = (count / total) * 100.0
            stats.append(f"{names[cid]}: {pct:.1f}%")

    elapsed = time.time() - start
    details = " | ".join(stats[:5]) if stats else "No class stats"
    status = f"{STATUS_MESSAGE} | infer={elapsed:.2f}s | {details}"

    return Image.fromarray(overlay), Image.fromarray(color_mask), status


load_model()

with gr.Blocks(title="ENFINITY Segmentation (DINOv2 + DPT + LoRA)") as demo:
    gr.Markdown("# ENFINITY Offroad Segmentation")
    gr.Markdown("GPU-ready inference using DINOv2 ViT-L backbone + DPT decoder + LoRA checkpoint.")

    with gr.Row():
        input_image = gr.Image(type="pil", label="Input Image")
        output_overlay = gr.Image(type="pil", label="Overlay")
        output_mask = gr.Image(type="pil", label="Colorized Mask")

    with gr.Row():
        alpha_slider = gr.Slider(0.1, 0.9, value=0.45, step=0.05, label="Overlay Alpha")
        tta_toggle = gr.Checkbox(value=True, label="Use TTA")
        tta_scale_text = gr.Textbox(value="0.75,1.0,1.25,1.5", label="TTA Scales")

    status_box = gr.Textbox(label="Status", interactive=False)
    run_button = gr.Button("Run Segmentation", variant="primary")

    run_button.click(
        fn=run_inference,
        inputs=[input_image, alpha_slider, tta_toggle, tta_scale_text],
        outputs=[output_overlay, output_mask, status_box],
    )


demo.queue(max_size=16)
demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
