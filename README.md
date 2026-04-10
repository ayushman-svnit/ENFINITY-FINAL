# Enfinity Vision Pro (Next.js + Hugging Face)

A premium, production-ready frontend for offroad image segmentation and computer vision models. Optimized for high-precision tasks and long-running inference.

## ✨ Premium Features

- **Deep Space Dark Mode**: Modern, high-contrast aesthetic with glassmorphism and emerald-accented UI.
- **Smart Toggle Explorer**: Interactive view-switching between Input, Colorized Mask, and Final Composite Overlay.
- **Hardened API Stack**: 
    - Full support for **Gradio SSE v3** protocol.
    - **10-Minute Timeouts**: Custom network agent (via `undici`) to handle long-running TTA (Test Time Augmentation) without disconnection.
- **Micro-Animations**: Fluid page transitions and real-time inference status feedback.
- **Deployment-Ready**: Fully configured for Vercel with server-side security for your Hugging Face tokens.

## 1) Configure environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set values:

- `HUGGINGFACE_TOKEN`: your Hugging Face access token
- `HUGGINGFACE_MODEL_ID`: your model ID (e.g. `rrrr08/ENFINITY`)
- `HUGGINGFACE_ENDPOINT`: set this to the URL of your Hugging Face Space or Inference Endpoint (e.g. `https://rrrr08-enfinity.hf.space`)

## 2) Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 3) Deploy on Vercel

1. Push this project to GitHub.
2. Import repo in Vercel.
3. Add environment variables in Vercel project settings:
	 - `HUGGINGFACE_TOKEN`
	 - `HUGGINGFACE_MODEL_ID`
	 - `HUGGINGFACE_ENDPOINT`
4. Deploy.

## API Architecture

- **Endpoint**: `POST /api/infer`
- **Logic**: Implements a robust SSE (Server-Sent Events) stream reader that waits for the "complete" signal from Gradio-hosted models.
- **Timeouts**: Configured with a 600s total window to allow for complex inference tasks.

## Notes

- This project is tailored for **rrrr08/ENFINITY** but supports any model following the Gradio SSE v3 / v5 protocol.
- For private models, ensure your `HUGGINGFACE_TOKEN` has proper repository permissions. 
