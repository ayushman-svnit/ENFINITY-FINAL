# ENFINITY Space Template (GPU)

This template is now wired to your real architecture:
- DINOv2 ViT-L backbone
- LoRA injection on top blocks
- DPT decoder
- Checkpoint loading from `rrrr08/ENFINITY`

## 1) Create Space

- SDK: Gradio (Blank)
- Hardware: GPU (start with T4 Small)
- Visibility: Public

## 2) Upload files from this folder to Space root

- `app.py`
- `model.py`
- `config.json`
- `requirements.txt`

## 3) Space Variables / Secrets

Add these in Space Settings:

- `HF_TOKEN` = your Hugging Face token
- `MODEL_REPO` = `rrrr08/ENFINITY` (optional, already defaulted)
- `CHECKPOINT_NAME` = `dinov2_dpt_full_lora.pth` (optional, already defaulted)

## 4) Runtime behavior

- If checkpoint exists locally in Space root, app uses it.
- Otherwise app downloads checkpoint from Hugging Face Hub using `HF_TOKEN`.
- On startup, it loads backbone + LoRA + decoder, then waits for requests.

## 5) Connect to your Next.js frontend

Set this in your Next.js env:

- `HUGGINGFACE_ENDPOINT=https://your-space-name.hf.space`

Then restart Next.js server and test uploads.

## 6) Notes

- First cold start can take time on Spaces because DINOv2 and checkpoint are large.
- If memory issues happen with TTA enabled, disable TTA in UI or use a larger GPU tier.
