import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  createLinearGradientPaint,
  createRenderFramePool,
  createRenderStage,
  createTileChunkDrawData,
  cullRenderCallsToRect,
  cullRenderCallsToRectInto,
  drawRenderable,
  renderArray,
  renderRecord,
  sortRenderCallsByY,
  sortRenderCallsByYInto,
  type Renderable
} from "../src/render/index.ts";
import { defaultDrawState } from "../src/render/draw-data.ts";

type BenchSample = {
  label: string;
  samplesMs: number[];
  p50: number;
  p95: number;
  min: number;
  max: number;
};

type Comparison = {
  name: string;
  control: BenchSample;
  variant: BenchSample;
  p50DeltaPercent: number;
  p95DeltaPercent: number;
};

const options = parseArgs(process.argv.slice(2));
const assertedComparisons = new Set(["cull helpers", "sort helpers", "stage culling", "draw-data caches", "tile chunks"]);
const report = await runAll();
await mkdir(dirname(resolve(options.out)), { recursive: true });
await Bun.write(options.out, JSON.stringify(report, null, 2));
assertReport(report);
console.log(JSON.stringify(report, null, 2));

async function runAll() {
  const comparisons: Comparison[] = [
    compare("cull helpers", "allocating cull", () => benchCullHelpers(false), "reused cull output", () => benchCullHelpers(true)),
    compare("sort helpers", "allocating sort", () => benchSortHelpers(false), "reused sort output", () => benchSortHelpers(true)),
    compare("stage culling", "stage draws all", () => benchStageCulling(false), "stage culls first", () => benchStageCulling(true)),
    compare("draw-data caches", "caches off", () => benchDrawDataCaches(false), "caches on", () => benchDrawDataCaches(true)),
    compare("frame pool", "fresh records", () => benchFramePool(false), "pooled records", () => benchFramePool(true)),
    compare("tile chunks", "fresh chunks", () => benchTileChunks(false), "reused chunk output", () => benchTileChunks(true))
  ];
  return {
    generatedAt: new Date().toISOString(),
    config: options,
    comparisons
  };
}

function compare(name: string, controlLabel: string, controlRun: () => number, variantLabel: string, variantRun: () => number): Comparison {
  for (let index = 0; index < options.warmup; index += 1) {
    controlRun();
    variantRun();
  }
  const controlSamples: number[] = [];
  const variantSamples: number[] = [];
  for (let index = 0; index < options.repeats; index += 1) {
    const order = index % 2 === 0
      ? [[controlRun, controlSamples], [variantRun, variantSamples]] as const
      : [[variantRun, variantSamples], [controlRun, controlSamples]] as const;
    for (const [run, samples] of order) {
      Bun.gc(true);
      const start = performance.now();
      const result = run();
      const elapsed = performance.now() - start;
      if (!Number.isFinite(result)) throw new Error(`${name} produced a non-finite checksum`);
      samples.push(elapsed);
    }
  }
  const control = summarizeSample(controlLabel, controlSamples);
  const variant = summarizeSample(variantLabel, variantSamples);
  return {
    name,
    control,
    variant,
    p50DeltaPercent: round(percentDelta(variant.p50, control.p50)),
    p95DeltaPercent: round(percentDelta(variant.p95, control.p95))
  };
}

function summarizeSample(label: string, samples: number[]): BenchSample {
  return {
    label,
    samplesMs: samples.map(round),
    p50: round(percentile(samples, 0.5)),
    p95: round(percentile(samples, 0.95)),
    min: round(Math.min(...samples)),
    max: round(Math.max(...samples))
  };
}

function benchCullHelpers(reuseOutput: boolean) {
  const calls = makeSpatialCalls(options.spatialCalls);
  const rect = { x: 0, y: 0, width: 960, height: 540 };
  const out: Renderable[] = [];
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    const culled = reuseOutput ? cullRenderCallsToRectInto(calls, rect, out) : cullRenderCallsToRect(calls, rect);
    checksum += culled.length;
  }
  return checksum;
}

function benchSortHelpers(reuseOutput: boolean) {
  const calls = makeSpatialCalls(options.spatialCalls);
  const out: Renderable[] = [];
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    const sorted = reuseOutput ? sortRenderCallsByYInto(calls, out) : sortRenderCallsByY(calls);
    const first = sorted[0];
    checksum += typeof first === "function" ? 1 : first?.y ?? 0;
  }
  return checksum;
}

function benchStageCulling(enabled: boolean) {
  const ctx = createBenchContext();
  const stage = createRenderStage(ctx, {}, {
    cullRect: enabled ? { x: 0, y: 0, width: 960, height: 540 } : undefined
  });
  stage.addLayer("world", { ignoreCamera: true, sort: "y-axis" });
  stage.pushMany("world", makeSpatialCalls(options.spatialCalls));
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    const result = stage.render();
    checksum += result.drawn + result.skipped;
  }
  return checksum + ctx.stats.draws;
}

function benchDrawDataCaches(enabled: boolean) {
  const ctx = createBenchContext();
  const calls = makeTextAndGradientCalls(options.textCalls);
  const drawState = { ...defaultDrawState, drawDataCaches: enabled };
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    for (const call of calls) {
      if (drawRenderable(ctx, call, drawState)) checksum += 1;
    }
  }
  return checksum + ctx.stats.gradients + ctx.stats.measureText;
}

function benchFramePool(usePool: boolean) {
  const pool = usePool ? createRenderFramePool() : undefined;
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    pool?.beginFrame();
    const calls = renderArray(pool);
    for (let i = 0; i < options.poolRecords; i += 1) {
      const record = renderRecord(pool, "rect");
      record.x = i % 200;
      record.y = Math.floor(i / 200);
      record.width = 3;
      record.height = 3;
      record.fill = "#8cf";
      calls.push(record as Renderable);
    }
    checksum += calls.length;
  }
  return checksum;
}

function benchTileChunks(reuseOutput: boolean) {
  const image = { width: 512, height: 512 } as unknown as CanvasImageSource;
  const tiles = makeTiles(options.tileCount);
  const out: Renderable[] = [];
  let checksum = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    const calls = createTileChunkDrawData({
      tiles,
      image,
      tileWidth: 16,
      tileHeight: 16,
      columns: 32,
      out: reuseOutput ? out : undefined,
      getTileId: (tile) => tile.id,
      getX: (tile) => tile.x,
      getY: (tile) => tile.y,
      getSource: (_tile, id) => ({ x: (Number(id) % 32) * 16, y: Math.floor(Number(id) / 32) * 16, width: 16, height: 16 })
    });
    checksum += calls.length;
  }
  return checksum;
}

function makeSpatialCalls(count: number): Renderable[] {
  const calls: Renderable[] = [];
  for (let i = 0; i < count; i += 1) {
    const visible = i % 10 < 2;
    const x = visible ? (i % 80) * 12 : 2000 + (i % 160) * 8;
    const y = visible ? Math.floor(i / 80) % 45 * 12 : 1800 + Math.floor(i / 160) * 8;
    calls.push({
      kind: "rect",
      x,
      y,
      z: i % 7,
      ySort: y + (i % 3),
      width: 8,
      height: 8,
      fill: i % 4 === 0 ? "#9fd" : "#dca",
      alpha: i % 5 === 0 ? 0.85 : undefined
    });
  }
  return calls;
}

function makeTextAndGradientCalls(count: number): Renderable[] {
  const gradient = createLinearGradientPaint({
    x0: 0,
    y0: 0,
    x1: 120,
    y1: 0,
    stops: [[0, "#112233"], [0.5, "#88ccff"], [1, "#ffeeaa"]]
  });
  const calls: Renderable[] = [];
  for (let i = 0; i < count; i += 1) {
    calls.push({
      kind: "text-block",
      x: i % 120,
      y: i % 60,
      text: `repeatable status phrase ${i % 32} with enough words to wrap`,
      maxWidth: 180,
      maxLines: 2,
      size: 12,
      fill: gradient
    });
    calls.push({
      kind: "label",
      x: i % 200,
      y: i % 100,
      text: `entity label ${i % 48} repeated for cache`,
      maxWidth: 120,
      background: gradient,
      fill: "#ffffff"
    });
  }
  return calls;
}

function makeTiles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index % 256,
    x: (index % 128) * 16,
    y: Math.floor(index / 128) * 16
  }));
}

function createBenchContext() {
  const stats = { draws: 0, gradients: 0, measureText: 0 };
  const gradient = { addColorStop() {} } as unknown as CanvasGradient;
  return {
    stats,
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1,
    font: "12px sans-serif",
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
    clearRect() {},
    fillRect() { stats.draws += 1; },
    strokeRect() { stats.draws += 1; },
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
    fill() { stats.draws += 1; },
    stroke() { stats.draws += 1; },
    drawImage() { stats.draws += 1; },
    fillText() { stats.draws += 1; },
    strokeText() { stats.draws += 1; },
    measureText(text: string) {
      stats.measureText += 1;
      return { width: text.length * 7 } as TextMetrics;
    },
    setLineDash() {},
    createLinearGradient() {
      stats.gradients += 1;
      return gradient;
    },
    createRadialGradient() {
      stats.gradients += 1;
      return gradient;
    }
  } as unknown as CanvasRenderingContext2D & { stats: typeof stats };
}

function assertReport(report: Awaited<ReturnType<typeof runAll>>) {
  const failures: string[] = [];
  for (const comparison of report.comparisons) {
    if (options.timingGate && comparison.variant.p95 > options.assertP95Ms) {
      failures.push(`${comparison.name} variant p95 ${comparison.variant.p95}ms > ${options.assertP95Ms}ms`);
    }
    if (!assertedComparisons.has(comparison.name)) continue;
    if (comparison.p95DeltaPercent > options.assertMaxRegressionPercent) {
      failures.push(`${comparison.name} p95 regression ${comparison.p95DeltaPercent}% > ${options.assertMaxRegressionPercent}%`);
    }
  }
  const stage = report.comparisons.find((item) => item.name === "stage culling");
  if (stage && stage.p95DeltaPercent > -options.assertStageCullImprovementPercent) {
    failures.push(`stage culling improvement ${-stage.p95DeltaPercent}% < ${options.assertStageCullImprovementPercent}%`);
  }
  if (failures.length) throw new Error(`2D render benchmark failed:\n${failures.join("\n")}`);
}

function parseArgs(argv: string[]) {
  return {
    out: argValue(argv, "out", ".local/engine-perf/render-2d-bench.json"),
    repeats: numberArg(argv, "repeats", 7),
    warmup: numberArg(argv, "warmup", 2),
    frames: numberArg(argv, "frames", 32),
    spatialCalls: numberArg(argv, "spatial-calls", 18000),
    textCalls: numberArg(argv, "text-calls", 600),
    poolRecords: numberArg(argv, "pool-records", 24000),
    tileCount: numberArg(argv, "tile-count", 8192),
    assertP95Ms: numberArg(argv, "assert-p95-ms", 250),
    timingGate: argv.includes("--timing-gate"),
    assertMaxRegressionPercent: numberArg(argv, "assert-max-regression-pct", 25),
    assertStageCullImprovementPercent: numberArg(argv, "assert-stage-cull-improvement-pct", 25)
  };
}

function argValue(argv: string[], name: string, fallback: string) {
  const equals = `--${name}=`;
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1] ?? fallback;
  return argv.find((arg) => arg.startsWith(equals))?.slice(equals.length) ?? fallback;
}

function numberArg(argv: string[], name: string, fallback: number) {
  const value = Number(argValue(argv, name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

function percentile(values: readonly number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ?? 0;
}

function percentDelta(value: number, baseline: number) {
  return ((value - baseline) / Math.max(0.001, baseline)) * 100;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
