"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type LabelScore = {
  label: string;
  score: number;
};

type SegmentationMask = {
  label: string;
  score: number;
  maskDataUrl: string;
  color: string;
};

type InferenceResponse = {
  task: "image-segmentation" | "image-classification" | "unknown";
  labels?: LabelScore[];
  masks?: SegmentationMask[];
  outputImageUrl?: string;
  raw?: unknown;
  modelId?: string;
  error?: string;
};

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"input" | "mask" | "overlay">("overlay");

  const topLabels = useMemo(() => {
    if (!result?.labels?.length) return [];
    return [...result.labels].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [result]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setResult(null);
    setErrorMessage(null);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      setViewMode("input");
      return;
    }
    setPreviewUrl(null);
  };

  const runDemo = async (event: FormEvent) => {
    event.preventDefault();
    if (!imageFile) {
      setErrorMessage("Please select an image first.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);

      const response = await fetch("/api/infer", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as InferenceResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Inference failed");
      }

      setResult(payload);
      setViewMode("overlay");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error during inference";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl flex-1 flex-col gap-12 px-6 py-12 sm:px-12 sm:py-20 flex">
      {/* Hero Section */}
      <header className="fade-up space-y-6 text-center max-w-4xl mx-auto">
        <div className="flex justify-center">
          <span className="glass-pill text-[var(--accent)] border-[var(--accent)] border-opacity-30 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
            Enfinity Vision Pro
          </span>
        </div>
        <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight text-[var(--foreground)] sm:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-white to-[#888]">
          Offroad Segmentation at Scale
        </h1>
        <p className="text-lg text-[var(--muted)] leading-relaxed max-w-2xl mx-auto">
          High-precision image segmentation for extreme terrains. Upload your terrain data to visualize masks and class confidence in real-time.
        </p>
      </header>

      {/* Main Dashboard */}
      <section className="fade-up-delay grid gap-8 lg:grid-cols-[450px_1fr] flex-1">
        {/* Left Control Panel */}
        <div className="flex flex-col gap-6">
          <div className="glass-card rounded-[2.5rem] p-8 flex flex-col gap-8">
            <h3 className="text-xl font-bold">Input & Controls</h3>
            
            <form className="space-y-6" onSubmit={runDemo}>
              <div className="relative group">
                <label
                  htmlFor="imageUpload"
                  className="block relative aspect-[4/3] rounded-3xl border-2 border-dashed border-[var(--line)] bg-[var(--glass-bg)] hover:border-[var(--accent)] transition-all cursor-pointer overflow-hidden group"
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-4">
                    {!previewUrl ? (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                        </div>
                        <div>
                          <span className="block text-lg font-bold">Upload Terrain Data</span>
                          <span className="text-sm text-[var(--muted)]">Supports JPG, PNG, WEBP</span>
                        </div>
                      </>
                    ) : (
                      <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-20 transition-opacity" />
                    )}
                    {previewUrl && (
                      <div className="relative z-10 glass-pill bg-black/40 backdrop-blur-md">Change Image</div>
                    )}
                  </div>
                  <input
                    id="imageUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !imageFile}
                className="w-full relative group overflow-hidden rounded-2xl bg-[var(--accent)] px-8 py-4 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100"
              >
                <div className="relative z-10 flex items-center justify-center gap-3">
                  {loading && <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
                  {loading ? "Processing Terrain..." : "Start Segmentation"}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>
              </button>
            </form>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-400 flex gap-3 items-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                {errorMessage}
              </div>
            )}
          </div>

          {/* Label Breakdown Card */}
          {result && (
            <div className="glass-card rounded-[2.5rem] p-8 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Inference Results</h3>
                <span className="text-xs text-[var(--muted)] font-mono">DINOv2 + DPT</span>
              </div>
              
              <ul className="grid gap-3">
                {topLabels.map((item) => (
                  <li key={item.label} className="group relative rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04]">
                    <div className="relative z-10 mb-2 flex items-center justify-between text-sm">
                      <span className="font-bold tracking-tight">{item.label}</span>
                      <span className="text-[var(--accent)] font-mono">{(item.score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="relative h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-1000 ease-out shadow-[0_0_8px_var(--accent-glow)]"
                        style={{ width: `${item.score * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-center text-[var(--muted)] uppercase tracking-widest">Confidence Scores</p>
            </div>
          )}
        </div>

        {/* Right Result Panel */}
        <div className="flex flex-col gap-6 min-h-[600px]">
          <div className="glass-card rounded-[2.5rem] flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-[var(--line)] flex items-center justify-between bg-black/20 backdrop-blur-xl">
              <div className="flex gap-2">
                <div className="flex bg-white/5 p-1 rounded-xl">
                  {["input", "mask", "overlay"].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode as any)}
                      disabled={!result && mode !== "input"}
                      className={`px-6 py-2 text-xs font-bold rounded-lg transition-all capitalize ${
                        viewMode === mode 
                        ? "bg-[var(--accent)] text-white shadow-lg" 
                        : "text-[var(--muted)] hover:text-white disabled:opacity-30 disabled:hover:text-[var(--muted)]"
                      }`}
                    >
                      {mode === "overlay" ? "Composite" : mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hidden sm:block">
                <span className="text-[10px] font-mono text-[var(--muted)] px-3">
                  {result ? "Complete" : loading ? "Inference Active" : "Waiting for terrain"}
                </span>
              </div>
            </div>

            {/* Viewport */}
            <div className="relative flex-1 bg-[#050505] overflow-hidden flex items-center justify-center p-8 group">
              {!previewUrl && !loading && (
                <div className="text-center space-y-4 max-w-sm">
                  <div className="w-20 h-20 rounded-full bg-white/5 mx-auto flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                  </div>
                  <p className="text-[var(--muted)] text-sm leading-relaxed">
                    Interactive terrain data visualization will appear here after segmentation process.
                  </p>
                </div>
              )}

              {loading && !result && (
                <div className="text-center space-y-6">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-24 h-24 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin opacity-40"></div>
                    <div className="absolute w-32 h-32 rounded-full border-2 border-[var(--secondary)] border-b-transparent animate-spin-reverse opacity-20"></div>
                    <span className="text-xs font-bold text-[var(--accent)] tracking-widest animate-pulse">SEGMENTING</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">Advanced Inference in Progress</p>
                    <p className="text-xs text-[var(--muted)]">Executing DINOv2 + DPT + TTA pipelines...</p>
                  </div>
                </div>
              )}

              {(previewUrl || result) && (
                <div className="relative w-full h-full flex items-center justify-center transition-opacity duration-500">
                  {/* Original Input Layer */}
                  {previewUrl && (viewMode === "input" || viewMode === "overlay") && (
                    <img 
                      src={previewUrl} 
                      alt="Input" 
                      className={`max-h-full max-w-full rounded-xl object-contain transition-opacity duration-300 ${viewMode === "overlay" ? "brightness-[0.8]" : ""}`}
                    />
                  )}

                  {/* Overlay Result Layer */}
                  {result?.outputImageUrl && viewMode === "overlay" && (
                    <img
                      src={result.outputImageUrl}
                      alt="Composite Overlay"
                      className="absolute max-h-full max-w-full rounded-xl object-contain opacity-70 mix-blend-screen"
                    />
                  )}

                  {/* Masks Layer (Individual segmented pieces) */}
                  {result?.masks && (viewMode === "mask" || viewMode === "overlay") && (
                    <div className={`absolute inset-0 flex items-center justify-center p-8 transition-opacity duration-300 ${viewMode === "overlay" ? "opacity-60" : "opacity-100"}`}>
                      {result.masks.map((mask, idx) => (
                        <img
                          key={idx}
                          src={mask.maskDataUrl}
                          className="absolute max-h-[calc(100%-4rem)] max-w-[calc(100%-4rem)] rounded-xl object-contain mix-blend-lighten pointer-events-none"
                          style={{ filter: `drop-shadow(0 0 10px ${mask.color}) brightness(1.5)` }}
                          alt="Class mask"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-4 items-center px-8 py-4 glass-card rounded-3xl opacity-60 hover:opacity-100 transition-opacity">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-black bg-white/10 ring-1 ring-white/5 overflow-hidden"><img src={`https://i.pravatar.cc/100?u=${i}`} alt="Avatar" /></div>)}
            </div>
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-[0.2em]">Live Session: Enterprise Pipeline v2.4 Active</p>
          </div>
        </div>
      </section>
      
      <style jsx>{`
        .animate-spin-reverse {
          animation: spin-reverse 3s linear infinite;
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
      `}</style>
    </main>
  );
}
