import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

type RenderReport = {
  config: { map: string };
  frameMs: { p50: number; p95: number; avg: number };
  drawn: { p50: number };
  heapDeltaMb: number;
};

type GroupSummary = {
  label: string;
  mode: string;
  files: string[];
  p50Median: number;
  p95Median: number;
  avgMedian: number;
  heapDeltaMedianMb: number;
};

const DEFAULT_OUT = ".local/engine-perf/2026-06-06/render-draw-cache-bench.json";
const benchScript = "./examples/mmo-skill-demo/scripts/render-call-bench.ts";

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function readReport(path: string): Promise<RenderReport> {
  return await Bun.file(path).json() as RenderReport;
}

function runRenderBench(options: {
  mode: string;
  label: string;
  cacheMode: "auto" | "always" | "never";
  run: number;
  frames: number;
  warmup: number;
  outputDir: string;
}) {
  const out = resolve(options.outputDir, `exp-018-${options.mode}-${options.label}-${options.run}.json`);
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      benchScript,
      `--frames=${options.frames}`,
      `--warmup=${options.warmup}`,
      `--map=${options.mode}`,
      `--draw-caches=${options.cacheMode}`,
      `--experiment=exp-018-${options.label}`,
      `--out=${out}`
    ],
    env: process.env,
    stdout: "inherit",
    stderr: "inherit"
  });
  if (!result.success) throw new Error(`render bench failed for ${options.mode}/${options.label}/${options.run}`);
  return out;
}

async function summarize(label: string, mode: string, files: string[]): Promise<GroupSummary> {
  const reports = await Promise.all(files.map(readReport));
  return {
    label,
    mode,
    files,
    p50Median: round(median(reports.map((report) => report.frameMs.p50))),
    p95Median: round(median(reports.map((report) => report.frameMs.p95))),
    avgMedian: round(median(reports.map((report) => report.frameMs.avg))),
    heapDeltaMedianMb: round(median(reports.map((report) => report.heapDeltaMb)))
  };
}

const repeats = Number(argValue("repeats", "3"));
const frames = Number(argValue("frames", "900"));
const warmup = Number(argValue("warmup", "120"));
const modes = argValue("modes", "none,minimap,world").split(",").map((mode) => mode.trim()).filter(Boolean);
const out = argValue("out", DEFAULT_OUT);
const outputDir = dirname(resolve(out));

await mkdir(outputDir, { recursive: true });

const groups: GroupSummary[] = [];
for (const mode of modes) {
  const controlFiles: string[] = [];
  const variantFiles: string[] = [];
  for (let run = 1; run <= repeats; run += 1) {
    console.log(`EXP018 ${mode} control run ${run}/${repeats}`);
    controlFiles.push(runRenderBench({ mode, label: "control", cacheMode: "never", run, frames, warmup, outputDir }));
  }
  for (let run = 1; run <= repeats; run += 1) {
    console.log(`EXP018 ${mode} variant run ${run}/${repeats}`);
    variantFiles.push(runRenderBench({ mode, label: "variant", cacheMode: "auto", run, frames, warmup, outputDir }));
  }
  const control = await summarize("control", mode, controlFiles);
  const variant = await summarize("variant", mode, variantFiles);
  groups.push(control, variant);
  const p95Delta = round(((variant.p95Median - control.p95Median) / Math.max(0.001, control.p95Median)) * 100);
  const sign = p95Delta > 0 ? "+" : "";
  console.log(`EXP018 ${mode}: p95 ${control.p95Median}ms -> ${variant.p95Median}ms (${sign}${p95Delta}%)`);
}

const comparisons = modes.map((mode) => {
  const control = groups.find((group) => group.mode === mode && group.label === "control");
  const variant = groups.find((group) => group.mode === mode && group.label === "variant");
  if (!control || !variant) throw new Error(`missing summary for ${mode}`);
  return {
    mode,
    p50DeltaPercent: round(((variant.p50Median - control.p50Median) / Math.max(0.001, control.p50Median)) * 100),
    p95DeltaPercent: round(((variant.p95Median - control.p95Median) / Math.max(0.001, control.p95Median)) * 100),
    avgDeltaPercent: round(((variant.avgMedian - control.avgMedian) / Math.max(0.001, control.avgMedian)) * 100),
    heapDeltaMb: round(variant.heapDeltaMedianMb - control.heapDeltaMedianMb)
  };
});

await Bun.write(out, JSON.stringify({
  generatedAt: new Date().toISOString(),
  config: { repeats, frames, warmup, modes },
  groups,
  comparisons
}, null, 2));

console.log(`summary: ${out}`);
