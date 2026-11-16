import { roundDecimal } from "@hyperfocus/utilities/math";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createMmoEntityRegistry } from "../src/mmo/entity-registry.ts";
import { createMmoInterestSnapshotter } from "../src/mmo/interest.ts";
import { createMmoOccupancyTester, moveMmoCircle, type MmoRect } from "../src/mmo/movement.ts";
import { createLinearGradientPaint, defaultDrawState, drawRenderable, type Renderable } from "../src/render/draw-data.ts";
import { createCanvasContextFixture, createCanvasGradientFixture, createTextMetricsFixture } from "../src/test-support/canvas.ts";

type BenchSample = {
  label: string;
  samplesMs: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
};

type BenchResult = {
  experiment: string;
  control: BenchSample;
  variant: BenchSample;
  deltaPercent: number;
};

const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const repositoryRoot = resolve(import.meta.dir, "../../..");
const outputPath = resolve(repositoryRoot, outputArg?.slice("--out=".length) ?? ".local/engine-perf/2026-06-06/engine-candidate-bench.json");

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function round(value: number) { return roundDecimal(value, 3); }

function sample(label: string, run: () => void, repeats = 7): BenchSample {
  for (let i = 0; i < 2; i += 1) run();
  const samplesMs: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    Bun.gc(true);
    const start = performance.now();
    run();
    samplesMs.push(performance.now() - start);
  }
  return {
    label,
    samplesMs: samplesMs.map(round),
    medianMs: round(median(samplesMs)),
    minMs: round(Math.min(...samplesMs)),
    maxMs: round(Math.max(...samplesMs))
  };
}

function compare(experiment: string, control: BenchSample, variant: BenchSample): BenchResult {
  return {
    experiment,
    control,
    variant,
    deltaPercent: round(((variant.medianMs - control.medianMs) / Math.max(0.001, control.medianMs)) * 100)
  };
}

function benchInterest(useReadableViews: boolean) {
  const registry = createMmoEntityRegistry();
  for (let i = 0; i < 10000; i += 1) {
    const ownerOnly = i % 31 === 0;
    registry.upsert({
      id: `entity-${i}`,
      type: i % 8 === 0 ? "npc" : "resource",
      x: (i % 100) * 16,
      y: Math.floor(i / 100) * 16,
      radius: i % 5,
      priority: i % 13,
      zoneId: i % 3 === 0 ? "a" : "b",
      ownerId: ownerOnly ? `viewer-${i % 4}` : i % 29 === 0 ? "viewer-0" : undefined,
      visibility: ownerOnly ? "owner" : "public",
      publicData: { hp: i % 100 }
    });
  }
  const snapshotter = createMmoInterestSnapshotter({
    registry,
    defaultRadius: 360,
    maxEntities: 512,
    useReadableViews
  });
  for (let loop = 0; loop < 18; loop += 1) {
    for (let viewer = 0; viewer < 80; viewer += 1) {
      snapshotter.visibleIdsFor(`viewer-${viewer % 4}`, {
        x: (viewer % 20) * 64,
        y: Math.floor(viewer / 20) * 64,
        radius: 360,
        zoneId: viewer % 2 === 0 ? "a" : "b"
      });
    }
  }
}

function benchMovement(cacheSolidRects: boolean) {
  const rects: MmoRect[] = [];
  for (let i = 0; i < 1200; i += 1) {
    rects.push({ x: (i % 60) * 18, y: Math.floor(i / 60) * 18, width: 12, height: 12 });
  }
  const tester = createMmoOccupancyTester({
    bounds: { x: -64, y: -64, width: 1400, height: 800 },
    solidRects: () => rects.map((rect) => ({ ...rect })),
    cacheSolidRects
  });
  for (let loop = 0; loop < 240; loop += 1) {
    const entity = { x: (loop % 40) * 12 + 3, y: Math.floor(loop / 40) * 12 + 3, radius: 5 };
    for (let step = 0; step < 30; step += 1) {
      moveMmoCircle(entity, (step % 3) - 1, step % 2 === 0 ? 1 : -1, tester, { maxDistance: 2 });
    }
  }
}

function createContext() {
  const gradient = createCanvasGradientFixture();
  return createCanvasContextFixture({
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1,
    font: "14px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    fillStyle: "#000",
    strokeStyle: "#000",
    globalCompositeOperation: "source-over",
    lineDashOffset: 0,
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    fillRect() {},
    strokeRect() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    arc() {},
    ellipse() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    fill() {},
    stroke() {},
    drawImage() {},
    fillText() {},
    strokeText() {},
    measureText(text: string) {
      return createTextMetricsFixture(text.length * 7);
    },
    setLineDash() {},
    createLinearGradient() {
      return gradient;
    },
    createRadialGradient() {
      return gradient;
    }
  });
}

function drawCalls(): Renderable[] {
  const gradient = createLinearGradientPaint({
    x0: 0,
    y0: 0,
    x1: 48,
    y1: 48,
    stops: [[0, "#123"], [1, "#fed"]]
  });
  const calls: Renderable[] = [];
  for (let i = 0; i < 600; i += 1) {
    calls.push({
      kind: "text-block",
      x: i % 80,
      y: i % 40,
      text: `Repeated status line ${i % 24} with enough words to wrap cleanly`,
      maxWidth: 160,
      maxLines: 2,
      fill: gradient
    });
    calls.push({
      kind: "label",
      x: i % 100,
      y: i % 50,
      text: `Bench label ${i % 32} with repeatable truncation`,
      maxWidth: 110,
      background: gradient,
      fill: "#fff"
    });
    calls.push({
      kind: "line",
      x1: 0,
      y1: i % 200,
      x2: 80,
      y2: (i % 200) + 3,
      stroke: gradient,
      lineDash: [4, 2, 1]
    });
  }
  return calls;
}

function benchDrawDataCaches(enabled: boolean) {
  const ctx = createContext();
  const calls = drawCalls();
  const drawState = { ...defaultDrawState, drawDataCaches: enabled };
  for (let frame = 0; frame < 36; frame += 1) {
    for (const call of calls) drawRenderable(ctx, call, drawState);
  }
}

const results = [
  compare(
    "EXP-011 mmo interest read-view",
    sample("clone-safe all() path", () => benchInterest(false)),
    sample("internal read-view path", () => benchInterest(true))
  ),
  compare(
    "EXP-013 cached solid rect source",
    sample("dynamic solid rect source", () => benchMovement(false)),
    sample("cached static solid rect source", () => benchMovement(true))
  ),
  compare(
    "EXP-018 render draw-data caches",
    sample("draw caches disabled", () => benchDrawDataCaches(false)),
    sample("draw caches enabled", () => benchDrawDataCaches(true))
  )
];

for (const result of results) {
  const sign = result.deltaPercent > 0 ? "+" : "";
  console.log(`${result.experiment}: ${result.control.medianMs}ms -> ${result.variant.medianMs}ms median (${sign}${result.deltaPercent}%)`);
}

await mkdir(dirname(resolve(outputPath)), { recursive: true });
await Bun.write(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`report: ${outputPath}`);
