import { NextResponse } from "next/server";
import { fetch as undiciFetch, Agent } from "undici";

const undiciAgent = new Agent({
  connect: {
    timeout: 60_000, // 60s connect timeout
  },
  headersTimeout: 600_000, // 10 min
  bodyTimeout: 600_000,    // 10 min
});

type HfLabelScore = {
  label: string;
  score: number;
};

type HfMask = {
  label: string;
  score: number;
  mask: string;
};

const MASK_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#f97316", "#a855f7"];

export const runtime = "nodejs";

function toDataUrl(contentType: string, data: ArrayBuffer) {
  const base64 = Buffer.from(data).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMaskArray(value: unknown): value is HfMask[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "mask" in value[0]
  );
}

function isLabelArray(value: unknown): value is HfLabelScore[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "label" in value[0] &&
    "score" in value[0]
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

async function callGradioSpace(endpoint: string, image: File, tta: boolean = true) {
  const arrayBuffer = await image.arrayBuffer();
  const mimeType = image.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;

  const base = endpoint.replace(/\/+$/, "");
  const callEndpoint = `${base}/gradio_api/call/run_inference`;

  console.log(`[Infer] Posting to ${callEndpoint} (TTA: ${tta})...`);

  const queuedCall = await undiciFetch(callEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    dispatcher: undiciAgent,
    signal: AbortSignal.timeout(600_000), // 10 min
    body: JSON.stringify({
      data: [
        {
          path: null,
          url: dataUrl,
          size: image.size,
          orig_name: image.name || "upload.png",
          mime_type: mimeType,
          is_stream: false,
          meta: { _type: "gradio.FileData" },
        },
        0.45,
        tta,
        "0.75,1.0,1.25,1.5",
      ],
    }),
  });

  if (!queuedCall.ok) {
    const errorText = await queuedCall.text();
    throw new Error(`Space API queue call error (${queuedCall.status}): ${errorText}`);
  }

  const queuedMeta = (await queuedCall.json()) as Record<string, unknown>;
  const eventId = queuedMeta.event_id ?? queuedMeta.hash;

  if (typeof eventId !== "string") {
    throw new Error("Space queue call did not return an event id.");
  }

  // --- SSE v3 protocol: read the event stream until we get "complete" ---
  const sseUrl = `${callEndpoint}/${eventId}`;
  console.log(`[Infer] Queued with event ${eventId}. Reading SSE stream from ${sseUrl}...`);

  const sseRes = await undiciFetch(sseUrl, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    dispatcher: undiciAgent,
    signal: AbortSignal.timeout(600_000), // 10 min
  });

  if (!sseRes.ok) {
    const errText = await sseRes.text();
    throw new Error(`Space SSE error (${sseRes.status}): ${errText}`);
  }

  const reader = sseRes.body?.getReader();
  if (!reader) {
    throw new Error("Unable to read SSE stream from Space.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let resultData: unknown = null;
  const startTime = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  while (true) {
    // Check overall timeout
    if (Date.now() - startTime > TIMEOUT_MS) {
      await reader.cancel();
      throw new Error(`Space inference timed out after ${TIMEOUT_MS / 1000}s.`);
    }

    const { value, done } = await reader.read();

    if (done) {
      console.log(`[Infer] SSE stream ended after ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete last line

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Infer] [${elapsed}s] SSE event: ${currentEvent}`);
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "null") continue;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (currentEvent === "complete" || currentEvent === "process_completed") {
          try {
            resultData = JSON.parse(dataStr);
            console.log(`[Infer] [${elapsed}s] ✅ Got result data!`);
          } catch {
            console.error(`[Infer] [${elapsed}s] Failed to parse complete data`);
          }
        } else if (currentEvent === "error") {
          console.error(`[Infer] [${elapsed}s] Space error: ${dataStr}`);
          await reader.cancel();
          throw new Error(`Space returned error: ${dataStr}`);
        } else {
          // heartbeat, process_starts, etc.
          console.log(`[Infer] [${elapsed}s] ${currentEvent}: ${dataStr.substring(0, 150)}`);
        }
      }
    }

    if (resultData !== null) {
      await reader.cancel();
      break;
    }
  }

  if (resultData === null) {
    throw new Error("Space inference completed but returned no data.");
  }

  // --- Parse the result ---
  // The SSE "complete" event data is a raw JSON array: [overlay, mask, statusText]
  // OR it could be {data: [...]} depending on the Gradio version
  let dataArray: unknown[] | null = null;

  if (Array.isArray(resultData)) {
    dataArray = resultData;
  } else {
    const obj = asRecord(resultData);
    if (obj && Array.isArray(obj.data)) {
      dataArray = obj.data as unknown[];
    }
  }

  console.log(`[Infer] Parsed data array with ${dataArray?.length ?? 0} items`);

  const overlay = dataArray?.[0] ? asRecord(dataArray[0]) : null;
  const mask = dataArray?.[1] ? asRecord(dataArray[1]) : null;
  const status = dataArray?.[2];

  // Build full URLs for images (they come as relative paths from the Space)
  const makeFullUrl = (obj: Record<string, unknown> | null): string | undefined => {
    const url = typeof obj?.url === "string" ? obj.url : undefined;
    if (url) return url;
    const path = typeof obj?.path === "string" ? obj.path : undefined;
    if (path) return `${base}/gradio_api/file=${path}`;
    return undefined;
  };

  const outputImageUrl = makeFullUrl(overlay);
  const maskUrl = makeFullUrl(mask);

  console.log(`[Infer] Overlay URL: ${outputImageUrl?.substring(0, 80) ?? "none"}`);
  console.log(`[Infer] Mask URL: ${maskUrl?.substring(0, 80) ?? "none"}`);

  // Download the images and convert to data URLs so the frontend can display them
  const toBase64DataUrl = async (url: string): Promise<string> => {
    const res = await undiciFetch(url, { dispatcher: undiciAgent });
    if (!res.ok) throw new Error(`Failed to fetch image from ${url}: ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "image/webp";
    const buf = await res.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
  };

  const overlayDataUrl = outputImageUrl ? await toBase64DataUrl(outputImageUrl) : undefined;
  const maskDataUrl = maskUrl ? await toBase64DataUrl(maskUrl) : undefined;

  // Parse labels from status text
  const labels: HfLabelScore[] = [];
  if (typeof status === "string") {
    const matches = [...status.matchAll(/([^|:]+):\s*([0-9]+(?:\.[0-9]+)?)%/g)];
    for (const entry of matches) {
      const label = entry[1]?.trim();
      const pct = Number(entry[2]);
      if (label && Number.isFinite(pct)) {
        labels.push({ label, score: Math.max(0, Math.min(1, pct / 100)) });
      }
    }
  }

  return {
    task: "image-segmentation" as const,
    outputImageUrl: overlayDataUrl,
    masks: maskDataUrl
      ? [
          {
            label: "Mask",
            score: 1,
            maskDataUrl,
            color: MASK_COLORS[0],
          },
        ]
      : undefined,
    labels: labels.length ? labels : undefined,
    raw: typeof status === "string" ? status : resultData,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const tta = formData.get("tta") === "true";

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const token = process.env.HUGGINGFACE_TOKEN;
    const modelId = process.env.HUGGINGFACE_MODEL_ID;
    const customEndpoint = process.env.HUGGINGFACE_ENDPOINT;

    if (!customEndpoint && (!token || !modelId)) {
      return NextResponse.json(
        {
          error:
            "Missing HUGGINGFACE_TOKEN or HUGGINGFACE_MODEL_ID in environment. If using a Space, set HUGGINGFACE_ENDPOINT.",
        },
        { status: 500 },
      );
    }

    if (customEndpoint?.includes("hf.space")) {
      const spaceResult = await callGradioSpace(customEndpoint, image, tta);
      return NextResponse.json({
        ...spaceResult,
        modelId: modelId || "space-endpoint",
      });
    }

    const endpoint =
      customEndpoint || `https://router.huggingface.co/hf-inference/models/${modelId}`;
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    const upstream = await undiciFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": image.type || "application/octet-stream",
      },
      dispatcher: undiciAgent,
      body: imageBuffer,
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      const isProviderMissing =
        errorText.toLowerCase().includes("is not supported") ||
        errorText.toLowerCase().includes("not deployed") ||
        errorText.toLowerCase().includes("inference provider");

      const guidance = isProviderMissing
        ? " This model repo currently stores weights/code but is not live on an Inference Provider. Deploy it to a Hugging Face Space or Inference Endpoint, then set HUGGINGFACE_ENDPOINT."
        : "";

      return NextResponse.json(
        {
          error: `Hugging Face API error (${upstream.status}): ${errorText}${guidance}`,
        },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/json";

    if (contentType.includes("application/json")) {
      const data = (await upstream.json()) as unknown;

      if (isMaskArray(data)) {
        const masks = data.map((segment, index) => ({
          label: segment.label,
          score: segment.score,
          maskDataUrl: segment.mask.startsWith("data:")
            ? segment.mask
            : `data:image/png;base64,${segment.mask}`,
          color: MASK_COLORS[index % MASK_COLORS.length],
        }));

        return NextResponse.json({
          task: "image-segmentation",
          masks,
          labels: masks.map((segment) => ({ label: segment.label, score: segment.score })),
          modelId,
        });
      }

      if (isLabelArray(data)) {
        return NextResponse.json({
          task: "image-classification",
          labels: data,
          modelId,
        });
      }

      return NextResponse.json({
        task: "unknown",
        raw: data,
        modelId,
      });
    }

    if (contentType.startsWith("image/")) {
      const imageData = await upstream.arrayBuffer();

      return NextResponse.json({
        task: "image-segmentation",
        outputImageUrl: toDataUrl(contentType, imageData),
        modelId,
      });
    }

    const fallbackText = await upstream.text();
    return NextResponse.json({
      task: "unknown",
      raw: fallbackText,
      modelId,
    });
  } catch (error) {
    console.error("[Infer] Request failed:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const cause =
      error instanceof Error && "cause" in error && error.cause
        ? ` | cause: ${String(error.cause)}`
        : "";
    return NextResponse.json({ error: `${message}${cause}` }, { status: 500 });
  }
}
