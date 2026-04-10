"use client";

import { ChangeEvent, FormEvent, useMemo, useState, useEffect } from "react";

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
  latency?: number;
};

const TERRAIN_COLOR_MAP: Record<string, string> = {
  "Trees": "#228B22",
  "Lush Bushes": "#00FF00",
  "Dry Grass": "#D2B48C",
  "Dry Bushes": "#8B5A2B",
  "Ground Clutter": "#808000",
  "Flowers": "#FF69B4",
  "Logs": "#8B4513",
  "Rocks": "#808080",
  "Landscape": "#A0522D",
  "Sky": "#87CEEB",
};

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"input" | "mask" | "overlay">("overlay");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [ttaEnabled, setTtaEnabled] = useState(true);
  const [apiProgress, setApiProgress] = useState(0);

  // API Progress simulation logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setApiProgress(0);
      const expectedTime = ttaEnabled ? 7500 : 1800; // Expected ms based on model complexity
      const intervalTime = 100;
      const increment = (intervalTime / expectedTime) * 100;
      
      interval = setInterval(() => {
        setApiProgress(prev => {
          if (prev >= 96) {
            // Decelerate as we get closer to completion
            return Math.min(prev + 0.1, 99);
          }
          return prev + increment;
        });
      }, intervalTime);
    } else {
      setApiProgress(0);
    }
    return () => clearInterval(interval);
  }, [loading, ttaEnabled]);

  // Prevent hydration mismatch by only showing clock after mount
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const topLabels = useMemo(() => {
    if (!result?.labels?.length) return [];
    return [...result.labels].sort((a, b) => b.score - a.score).slice(0, 10);
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
      setErrorMessage("MISSION_ERROR: NO_INPUT_DATA");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    const start = Date.now();

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("tta", String(ttaEnabled));

      const response = await fetch("/api/infer", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as InferenceResponse;
      if (!response.ok) {
        throw new Error(payload.error || "INFERENCE_FAILED");
      }

      setResult({
        ...payload,
        latency: Date.now() - start
      });
      setViewMode("overlay");
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNEXPECTED_SYSTEM_FAULT";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-[var(--background)] font-sans">
      {/* Top Telemetry Strip */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-black/40 px-6 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[var(--primary)] animate-tactical-pulse shadow-[0_0_8px_var(--primary)]" />
            <h1 className="font-display text-sm font-bold tracking-[0.2em] uppercase">
              Enfinity Vision <span className="text-[var(--primary)]">Pro</span>
            </h1>
          </div>
          <div className="hidden border-l border-[var(--line)] pl-6 text-[10px] font-mono text-[var(--muted)] sm:block">
            SYSTEM_STATUS: <span className={loading ? "text-[var(--secondary)]" : "text-[var(--primary)]"}>
              {loading ? "INFERENCE_ACTIVE" : "READY_FOR_DATA"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6 font-mono text-[10px] text-[var(--muted)]">
          <div className="hidden md:block">LATENCY: {result?.latency ? `${result.latency}ms` : "--"}</div>
          <div className="hidden md:block">COORDS: 40.7128° N, 74.0060° W</div>
          <div className="text-[var(--primary)]">{mounted ? currentTime : "--:--:--"}</div>
        </div>
      </header>

      {/* Main Tactical Interface */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Mission Controls */}
        <aside className="w-80 shrink-0 flex flex-col border-r border-[var(--line)] bg-[var(--surface)] p-6 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest">Input Control</div>
              <div className="h-px w-full bg-gradient-to-r from-[var(--primary)] to-transparent opacity-20" />
            </div>

            <form onSubmit={runDemo} className="flex flex-col gap-6">
              <label className="relative block h-64 w-full cursor-pointer group">
                <input type="file" onChange={handleFileChange} className="hidden" accept="image/*" />
                <div className="tactical-card h-full w-full flex flex-col items-center justify-center p-4 border-dashed border-2 border-[var(--line)] group-hover:border-[var(--primary)] transition-colors">
                  {!previewUrl ? (
                    <>
                      <div className="mb-4 h-12 w-12 flex items-center justify-center text-[var(--primary)] opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-bold uppercase tracking-widest">Load Terrain Data</div>
                        <div className="text-[10px] font-mono text-[var(--muted)] mt-1">SENSORS: IMG/WEBP</div>
                      </div>
                    </>
                  ) : (
                    <img src={previewUrl} className="h-full w-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" alt="Preview" />
                  )}
                  {previewUrl && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="glass-pill">REPLACE_SOURCE</span>
                    </div>
                  )}
                </div>
              </label>

              {/* TTA Toggle */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--muted)] uppercase">Augmentation (TTA)</span>
                  <button 
                    type="button"
                    onClick={() => setTtaEnabled(!ttaEnabled)}
                    className={`relative h-5 w-10 rounded-full transition-colors ${ttaEnabled ? 'bg-[var(--primary)]' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 h-3 w-3 rounded-full bg-black transition-all ${ttaEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <p className="text-[8px] font-mono text-[var(--muted)] leading-relaxed uppercase">
                  Higher accuracy via Test-Time Augmentation. Increases latency by ~4x.
                </p>
              </div>

              <button 
                type="submit" 
                disabled={loading || !imageFile}
                className="relative w-full overflow-hidden bg-[var(--primary)] py-4 text-xs font-bold uppercase tracking-[0.2em] text-black hover:brightness-110 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {loading && <div className="h-3 w-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
                  {loading ? "Analyzing..." : "Run Segmentation"}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10" />
              </button>
            </form>
          </div>

          {errorMessage && (
            <div className="tactical-card border-[var(--secondary)] bg-[var(--secondary)]/5 p-4 animate-tactical-shake">
              <div className="flex gap-3 text-[var(--secondary)]">
                <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                <div className="text-[10px] font-mono uppercase leading-tight">{errorMessage}</div>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-4">
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest">Model Telemetry</div>
            <div className="tactical-card p-4 space-y-3 bg-black/20">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-[var(--muted)]">MODEL:</span>
                <span className="text-[var(--primary)] uppercase">DINOv2 ViT-L/14 + DPT</span>
              </div>
              {loading ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[var(--primary)] animate-tactical-pulse">ANALYZING_STREAM:</span>
                    <span className="text-white">{apiProgress.toFixed(0)}%</span>
                  </div>
                  <div className="relative h-1.5 w-full bg-white/5 overflow-hidden border border-white/5">
                    <div 
                      className="absolute h-full bg-[var(--primary)] shadow-[0_0_12px_var(--primary-glow)] transition-all duration-300 ease-out"
                      style={{ width: `${apiProgress}%` }}
                    />
                    <div className="absolute inset-0 opacity-30 pointer-events-none" 
                         style={{ backgroundImage: 'linear-gradient(90deg, transparent 95%, rgba(0,0,0,0.5) 95%)', backgroundSize: '10% 100%' }} />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-tactical-shimmer" />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[var(--muted)]">NEURAL ACCURACY:</span>
                    <span className="text-white">87.14% VRFY</span>
                  </div>
                  <div className="relative h-1.5 w-full bg-white/5 overflow-hidden">
                    <div 
                      className="absolute h-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary-glow)] transition-all duration-1000 ease-out"
                      style={{ width: `87.14%` }}
                    />
                    <div className="absolute inset-0 opacity-20 pointer-events-none" 
                         style={{ backgroundImage: 'linear-gradient(90deg, transparent 95%, rgba(0,0,0,0.5) 95%)', backgroundSize: '10% 100%' }} />
                  </div>
                </div>
              )}
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-[var(--muted)]">PIPELINE:</span>
                <span className="text-white">TTA {ttaEnabled ? "ACTIVE" : "DISABLED"}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Tactical HUD */}
        <section className="flex-1 flex flex-col relative bg-black overflow-hidden">
          {/* HUD Viewport */}
          <div className="flex-1 relative flex items-center justify-center p-12 overflow-hidden">
            {/* Grid Overlay */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '5% 5%' }} />
            
            {/* Corner Markers */}
            <div className="absolute top-12 left-12 h-8 w-8 border-t-2 border-l-2 border-[var(--primary)] opacity-40" />
            <div className="absolute top-12 right-12 h-8 w-8 border-t-2 border-r-2 border-[var(--primary)] opacity-40" />
            <div className="absolute bottom-12 left-12 h-8 w-8 border-b-2 border-l-2 border-[var(--primary)] opacity-40" />
            <div className="absolute bottom-12 right-12 h-8 w-8 border-b-2 border-r-2 border-[var(--primary)] opacity-40" />

            {!previewUrl && !loading && (
              <div className="text-center space-y-4 animate-tactical-pulse">
                <div className="font-mono text-[var(--muted)] text-[10px] uppercase tracking-[0.3em]">Waiting for terrain input...</div>
                <div className="h-px w-32 bg-[var(--line)] mx-auto" />
              </div>
            )}

            {(previewUrl || result) && (
              <div className="relative w-full h-full flex items-center justify-center group overflow-hidden tactical-card">
                {/* Image Layers */}
                {previewUrl && (viewMode === "input" || viewMode === "overlay") && (
                  <img 
                    src={previewUrl} 
                    className={`max-h-full max-w-full object-contain transition-all duration-700 ${viewMode === "overlay" ? "brightness-50 contrast-125" : ""}`}
                    alt="Source"
                  />
                )}

                {result?.outputImageUrl && viewMode === "overlay" && (
                  <img
                    src={result.outputImageUrl}
                    className="absolute max-h-full max-w-full object-contain mix-blend-screen opacity-80"
                    alt="Overlay"
                  />
                )}

                {result?.masks && (viewMode === "mask" || viewMode === "overlay") && (
                  <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === "overlay" ? "opacity-60" : "opacity-100"}`}>
                    {result.masks.map((mask, idx) => (
                      <img
                        key={idx}
                        src={mask.maskDataUrl}
                        className="absolute max-h-full max-w-full object-contain mix-blend-lighten pointer-events-none"
                        style={{ filter: `drop-shadow(0 0 10px ${mask.color}) brightness(1.5)` }}
                        alt="Mask"
                      />
                    ))}
                  </div>
                )}
                
                {/* Viewport HUD Info */}
                <div className="absolute top-4 left-4 font-mono text-[8px] text-[var(--primary)] flex flex-col gap-1">
                  <div>RESOLUTION: 1024x768</div>
                  <div>SENSORS: Lidar+Visible</div>
                  <div className="flex gap-2 items-center">
                    SIGNAL: <div className="h-1 w-8 bg-white/10 overflow-hidden"><div className="h-full bg-[var(--primary)] w-3/4 animate-tactical-pulse" /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Centered Loading Overlay */}
            {loading && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                <div className="tactical-scan" />
                <div className="text-center space-y-6">
                  <div className="relative h-24 w-24 mx-auto">
                    <div className="absolute inset-0 border-2 border-[var(--primary)] opacity-20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-t-[var(--primary)] animate-spin rounded-full" />
                    <div className="absolute inset-4 border border-[var(--primary)] opacity-40 animate-tactical-pulse rounded-full" />
                  </div>
                  <div className="font-mono text-[var(--primary)] text-xs uppercase tracking-[0.2em] animate-tactical-pulse">
                    Scanning Terrain... {apiProgress.toFixed(0)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mode Switcher Footer */}
          <footer className="h-16 shrink-0 border-t border-[var(--line)] bg-black/40 flex items-center justify-between px-8">
            <div className="flex gap-4">
              {["input", "mask", "overlay"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as any)}
                  disabled={!result && mode !== "input"}
                  className={`relative px-6 py-2 transition-all group disabled:opacity-30`}
                >
                  <div className={`text-[10px] font-mono uppercase tracking-widest ${viewMode === mode ? "text-[var(--primary)]" : "text-[var(--muted)] group-hover:text-white"}`}>
                    {mode}
                  </div>
                  {viewMode === mode && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="font-mono text-[8px] text-[var(--muted)] max-w-xs text-right hidden sm:block">
              WARNING: AI INFERENCE IS EXPERIMENTAL. ALWAYS VERIFY TERRAIN CONDITIONS MANUALLY BEFORE NAVIGATION.
            </div>
          </footer>
        </section>

        {/* Right Sidebar: Data Analytics */}
        <aside className="w-80 shrink-0 flex flex-col border-l border-[var(--line)] bg-[var(--surface)] p-6 gap-6">
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest">Terrain Analytics</div>
            <div className="h-px w-full bg-gradient-to-l from-[var(--primary)] to-transparent opacity-20" />
          </div>

          {!result ? (
            <div className="flex flex-1 items-center justify-center text-center opacity-30">
              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase">No Analysis Data</div>
                <div className="text-[8px] font-mono">Initiate scan to populate results</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {topLabels.map((item) => {
                const terrainColor = TERRAIN_COLOR_MAP[item.label] || "var(--primary)";
                return (
                  <div key={item.label} className="tactical-card p-3 bg-white/[0.02]" style={{ borderLeftWidth: '2px', borderLeftColor: terrainColor }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                      <span className="font-mono text-[10px]" style={{ color: terrainColor }}>{(item.score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 overflow-hidden">
                      <div 
                        className="h-full transition-all duration-1000 ease-out"
                        style={{ 
                          width: `${item.score * 100}%`,
                          backgroundColor: terrainColor,
                          boxShadow: `0 0 8px ${terrainColor}80`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-auto pt-6 border-t border-[var(--line)]">
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase mb-3">Telemetry Log</div>
            <div className="tactical-card h-32 bg-black/40 p-3 font-mono text-[8px] overflow-y-auto text-[var(--primary)]/70 flex flex-col gap-1">
              <div>[SYSTEM] BOOTING_V2.4_KERNEL...</div>
              <div>[SYSTEM] NEURAL_ENGINE_ONLINE</div>
              {ttaEnabled && <div>[SYSTEM] TTA_PIPELINE_STAGED</div>}
              {loading && <div>[INFER] PROCESSING_RASTER_DATA...</div>}
              {result && <div>[INFER] ANALYSIS_COMPLETE_IN_{result.latency}MS</div>}
              {result?.labels && <div>[DATA] IDENTIFIED_{result.labels.length}_SEGMENTS</div>}
              {errorMessage && <div className="text-[var(--secondary)]">[ERROR] {errorMessage}</div>}
              <div className="animate-tactical-pulse">_</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

