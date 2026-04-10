import { NextResponse } from "next/server";
import { fetch as undiciFetch, Agent } from "undici";
import { readFile } from "fs/promises";
import path from "path";

const undiciAgent = new Agent({
  connect: { timeout: 10_000 },
});

export async function GET() {
  const modelId = process.env.HUGGINGFACE_MODEL_ID || "rrrr08/ENFINITY";
  const token = process.env.HUGGINGFACE_TOKEN;

  interface HfData {
    lastModified?: string;
    downloads?: number;
  }
  let hfData: HfData | null = null;
  try {
    const res = await undiciFetch(`https://huggingface.co/api/models/${modelId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      dispatcher: undiciAgent,
    });
    if (res.ok) {
      hfData = (await res.json()) as HfData;
    }
  } catch (e) {
    console.error("HF_METADATA_FETCH_FAILED", e);
  }

  // Dynamic README Parsing
  let readmeContent = "";
  try {
    const readmePath = path.join(process.cwd(), "README.md");
    readmeContent = await readFile(readmePath, "utf-8");
  } catch (err) {
    console.error("README_READ_FAILED", err);
  }

  // Extract Overview Metrics (Val mIoU, etc.)
  let performance = [
    { label: "Val mIoU", value: 66.76, color: "var(--primary)" },
    { label: "Val Dice", value: 78.95, color: "var(--primary)" },
    { label: "Val Accuracy", value: 87.14, color: "var(--primary)" },
    { label: "Test mIoU", value: 30.81, color: "var(--secondary)" },
  ];

  const perfRegex = /\| \*\*(\d+\.\d+)%\*\* \| \*\*(\d+\.\d+)%\*\* \| \*\*(\d+\.\d+)%\*\* \| \*\*(\d+\.\d+)%\*\* \|/;
  const perfMatch = readmeContent.match(perfRegex);
  if (perfMatch) {
    performance = [
      { label: "Val mIoU", value: parseFloat(perfMatch[1]), color: "var(--primary)" },
      { label: "Val Dice", value: parseFloat(perfMatch[2]), color: "var(--primary)" },
      { label: "Val Accuracy", value: parseFloat(perfMatch[3]), color: "var(--primary)" },
      { label: "Test mIoU", value: parseFloat(perfMatch[4]), color: "var(--secondary)" },
    ];
  }

  // Extract Class Benchmarks
  interface BenchmarkItem {
    label: string;
    value: number;
    color: string;
  }
  let benchmarks: BenchmarkItem[] = [];
  // Matches: | 🌲 Trees | ... | ... | **0.4673** |
  const classMetricRegex = /\| (?:\S+\s+)?([^|]+?)\s*\|[^|]*\|[^|]*\|\s*\**(\d+\.\d+)\**\s*\|/g;
  
  // Also extract colors from the Class Definitions table
  // Matches: | ... | ... | **Trees** | `#228B22` |
  const colorRegex = /\|[^|]*\|[^|]*\|\s*\*\*?([^*|]+?)\*\*?\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/g;
  const colorMap: Record<string, string> = {};
  let colorMatch;
  while ((colorMatch = colorRegex.exec(readmeContent)) !== null) {
    colorMap[colorMatch[1].trim()] = colorMatch[2];
  }

  let classMatch;
  while ((classMatch = classMetricRegex.exec(readmeContent)) !== null) {
    const label = classMatch[1].trim();
    const value = parseFloat(classMatch[2]) * 100;
    // Only include if value is meaningful or it's a known class
    if (value > 0 || ["Lush Bushes", "Ground Clutter", "Flowers", "Logs"].includes(label)) {
        benchmarks.push({
          label,
          value: parseFloat(value.toFixed(2)),
          color: colorMap[label] || "var(--primary)"
        });
    }
  }

  // Sort benchmarks by value descending
  benchmarks.sort((a, b) => b.value - a.value);

  // Fallback if parsing failed
  if (benchmarks.length === 0) {
    benchmarks = [
      { label: "Sky", value: 98.86, color: "#87CEEB" },
      { label: "Landscape", value: 68.66, color: "#A0522D" },
      { label: "Dry Grass", value: 48.90, color: "#D2B48C" },
      { label: "Trees", value: 46.73, color: "#228B22" },
      { label: "Dry Bushes", value: 37.75, color: "#8B5A2B" },
      { label: "Rocks", value: 7.16, color: "#808080" },
    ];
  }

  const specs = {
    backbone: readmeContent.match(/Backbone-(.+?)-/)?.[1] || "DINOv2 ViT-L/14",
    throughput: readmeContent.match(/Throughput \(FPS\)\*\* \| \*\*(.+?)\*\*/)?.[1] || "0.76 FPS",
    modelId: modelId,
    lastModified: hfData?.lastModified,
    downloads: hfData?.downloads,
    source: readmeContent ? "README.md" : "Hugging Face API"
  };

  return NextResponse.json({
    performance,
    benchmarks,
    specs
  });
}
