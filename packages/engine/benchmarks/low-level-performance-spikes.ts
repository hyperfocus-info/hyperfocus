// Serial diagnostic spikes; run in isolation so workloads do not contend.
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { heapStats } from "bun:jsc";
import { createRenderFramePool, renderableRecord } from "../src/render/frame-pool.ts";
import { createSpatialHash, type SpatialHashEntity } from "../src/server/replication/spatial-hash.ts";
import { createCollisionKernel, type CollisionKernel } from "../src/wasm/collision-kernel.ts";
import { createRetainedCursor } from "../src/runtime/retained-cursor.ts";
import { createWasmCollisionVariantWorkloads } from "./wasm-collision-variants.ts";
import { readBenchmarkEnvironment } from "@hyperfocus/performance";

type Workload = {
  label: string;
  operations: number;
  retainedBytes?: number;
  run: () => number;
};

type Sample = {
  elapsedMs: number;
  heapSize: number;
  objectCount: number;
};

type WorkloadSummary = {
  label: string;
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  operationsPerSecond: number;
  maxHeapSize: number;
  maxObjectCount: number;
  retainedBytes?: number;
};

const repositoryRoot = resolve(import.meta.dir, "../../..");
const options = parseOptions(process.argv.slice(2));

const { wasm, typescript } = await createKernels(Math.max(...options.batchSizes));
const comparisons = [];
for (const batchSize of options.batchSizes) {
  const workloads = collisionWorkloads(wasm, typescript, batchSize, options.collisionElements);
  comparisons.push(runComparison(`WASM collision crossover / batch ${batchSize}`, workloads.typescript, workloads.wasm));
}
for (const batchSize of options.batchSizes) {
  const variants = await createWasmCollisionVariantWorkloads(batchSize, options.collisionElements);
  comparisons.push(runComparison(`WASM in-module scalar vs SIMD / batch ${batchSize}`, variants.scalar, variants.simd));
}

const particleWorkloads = particleLayoutWorkloads(options.particleCount, options.particleFrames);
comparisons.push(runComparison("particle transform / object AoS vs typed SoA", particleWorkloads.objects, particleWorkloads.soa));
comparisons.push(runComparison("particle transform / interleaved typed AoS vs typed SoA", particleWorkloads.interleaved, particleWorkloads.soa));

const spatialWorkloads = spatialQueryWorkloads(options.spatialEntities, options.spatialQueries);
comparisons.push(runComparison("AOI query / full object scan vs engine spatial hash", spatialWorkloads.scan, spatialWorkloads.grid));

const allocationWorkloads = renderRecordWorkloads(options.renderRecords, options.renderFrames);
comparisons.push(runComparison("render records / fresh allocation vs generic frame pool", allocationWorkloads.fresh, allocationWorkloads.pool));
comparisons.push(runComparison("render records / fresh allocation vs overwrite frame pool", allocationWorkloads.fresh, allocationWorkloads.overwritePool));
comparisons.push(runComparison("render records / fresh allocation vs retained cursor", allocationWorkloads.fresh, allocationWorkloads.retained));

Bun.gc(true);
const retained = heapStats();
const report = {
  generatedAt: new Date().toISOString(),
  experiment: "EXP-020 low-level crossover, locality, spatial, and allocation spikes",
  command: `bun run bench:low-level-spikes${process.argv.slice(2).length ? ` ${process.argv.slice(2).join(" ")}` : ""}`,
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: options,
  comparisons,
  retainedAfterGc: { heapSize: retained.heapSize, objectCount: retained.objectCount }
};

await mkdir(dirname(options.out), { recursive: true });
await Bun.write(options.out, `${JSON.stringify(report, null, 2)}\n`);
for (const comparison of comparisons) {
  const sign = comparison.p95DeltaPercent > 0 ? "+" : "";
  console.log(`${comparison.name}: ${comparison.control.p95Ms}ms -> ${comparison.candidate.p95Ms}ms p95 (${sign}${comparison.p95DeltaPercent}%)`);
}
console.log(`report: ${options.out}`);

function runComparison(name: string, control: Workload, candidate: Workload) {
  const controlChecksum = control.run();
  const candidateChecksum = candidate.run();
  if (controlChecksum !== candidateChecksum) {
    throw new Error(`${name} parity failed: control ${controlChecksum}, candidate ${candidateChecksum}`);
  }
  for (let index = 0; index < options.warmup; index += 1) {
    control.run();
    candidate.run();
  }

  const controlSamples: Sample[] = [];
  const candidateSamples: Sample[] = [];
  for (let round = 0; round < options.rounds; round += 1) {
    Bun.gc(true);
    controlSamples.push(measure(control));
    candidateSamples.push(measure(candidate), measure(candidate));
    controlSamples.push(measure(control));
  }
  const controlSummary = summarize(control, controlSamples);
  const candidateSummary = summarize(candidate, candidateSamples);
  return {
    name,
    control: controlSummary,
    candidate: candidateSummary,
    p50DeltaPercent: percentDelta(candidateSummary.p50Ms, controlSummary.p50Ms),
    p95DeltaPercent: percentDelta(candidateSummary.p95Ms, controlSummary.p95Ms)
  };
}

function measure(workload: Workload): Sample {
  const startedAt = performance.now();
  const checksum = workload.run();
  const elapsedMs = performance.now() - startedAt;
  if (!Number.isFinite(checksum)) throw new Error(`${workload.label} returned a non-finite checksum.`);
  const heap = heapStats();
  return { elapsedMs, heapSize: heap.heapSize, objectCount: heap.objectCount };
}

function summarize(workload: Workload, samples: readonly Sample[]): WorkloadSummary {
  const samplesMs = samples.map((sample) => round(sample.elapsedMs));
  const p50Ms = percentile(samplesMs, 0.5);
  const p95Ms = percentile(samplesMs, 0.95);
  return {
    label: workload.label,
    samplesMs,
    p50Ms,
    p95Ms,
    operationsPerSecond: Math.round(workload.operations / Math.max(0.000001, p50Ms / 1000)),
    maxHeapSize: Math.max(...samples.map((sample) => sample.heapSize)),
    maxObjectCount: Math.max(...samples.map((sample) => sample.objectCount)),
    ...(workload.retainedBytes === undefined ? {} : { retainedBytes: workload.retainedBytes })
  };
}

async function createKernels(maxBatchSize: number) {
  const response = async () => new Response(
    await Bun.file(new URL("../wasm/collision-kernel.wasm", import.meta.url)).arrayBuffer(),
    { headers: { "content-type": "application/wasm" } }
  );
  const wasmFetch = Object.assign(() => response(), { preconnect: globalThis.fetch.preconnect });
  const rejectingFetch = Object.assign(() => Promise.reject(new Error("intentional TypeScript benchmark backend")), {
    preconnect: globalThis.fetch.preconnect
  });
  const wasm = await createCollisionKernel({
    fetch: wasmFetch,
    scratchBytes: maxBatchSize * 29,
    batchPolicy: { backend: "wasm" }
  });
  const typescript = await createCollisionKernel({ fetch: rejectingFetch });
  if (wasm.backend !== "wasm" || typescript.backend !== "typescript") {
    throw new Error(`Expected WASM and TypeScript kernels, got ${wasm.backend} and ${typescript.backend}.`);
  }
  return { wasm, typescript };
}

function collisionWorkloads(wasm: CollisionKernel, typescript: CollisionKernel, batchSize: number, targetElements: number) {
  const cx = new Float32Array(batchSize);
  const cy = new Float32Array(batchSize);
  const radius = new Float32Array(batchSize);
  const rx = new Float32Array(batchSize);
  const ry = new Float32Array(batchSize);
  const rw = new Float32Array(batchSize);
  const rh = new Float32Array(batchSize);
  for (let index = 0; index < batchSize; index += 1) {
    cx[index] = index % 120;
    cy[index] = index % 95;
    radius[index] = 7;
    rx[index] = 40;
    ry[index] = 30;
    rw[index] = 22;
    rh[index] = 18;
  }
  const calls = Math.max(1, Math.ceil(targetElements / batchSize));
  const operations = calls * batchSize;
  const create = (label: string, kernel: CollisionKernel): Workload => {
    const out = new Uint8Array(batchSize);
    return {
      label,
      operations,
      retainedBytes: cx.byteLength * 7 + out.byteLength,
      run() {
        let hits = 0;
        for (let call = 0; call < calls; call += 1) {
          hits += kernel.testCircleRectOverlapBatch({ cx, cy, radius, rx, ry, rw, rh, out, count: batchSize });
        }
        return hits;
      }
    };
  };
  return { typescript: create("TypeScript typed batch", typescript), wasm: create("WASM SIMD through copy bridge", wasm) };
}

function particleLayoutWorkloads(count: number, frames: number) {
  const objects: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  const interleaved = new Float32Array(count * 4);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const item = { x: index % 997, y: index % 613, vx: index % 7 - 3, vy: index % 5 - 2 };
    objects.push(item);
    const offset = index * 4;
    interleaved[offset] = item.x;
    interleaved[offset + 1] = item.y;
    interleaved[offset + 2] = item.vx;
    interleaved[offset + 3] = item.vy;
    x[index] = item.x;
    y[index] = item.y;
    vx[index] = item.vx;
    vy[index] = item.vy;
  }
  const operations = count * frames;
  const outX = new Float32Array(count);
  const outY = new Float32Array(count);
  const checksum = () => Math.round((outX[0] + outY[1] + outX[count - 1] + outY[count - 2]) * 1000);
  return {
    objects: {
      label: "stable-shape object AoS",
      operations,
      run() {
        for (let frame = 0; frame < frames; frame += 1) {
          for (let index = 0; index < count; index += 1) {
            const item = objects[index];
            outX[index] = item.x + item.vx * 0.016;
            outY[index] = item.y + item.vy * 0.016;
          }
        }
        return checksum();
      }
    },
    interleaved: {
      label: "interleaved Float32 AoS",
      operations,
      retainedBytes: interleaved.byteLength + outX.byteLength + outY.byteLength,
      run() {
        for (let frame = 0; frame < frames; frame += 1) {
          for (let index = 0; index < count; index += 1) {
            const offset = index * 4;
            outX[index] = interleaved[offset] + interleaved[offset + 2] * 0.016;
            outY[index] = interleaved[offset + 1] + interleaved[offset + 3] * 0.016;
          }
        }
        return checksum();
      }
    },
    soa: {
      label: "separate Float32 columns",
      operations,
      retainedBytes: x.byteLength + y.byteLength + vx.byteLength + vy.byteLength + outX.byteLength + outY.byteLength,
      run() {
        for (let frame = 0; frame < frames; frame += 1) {
          for (let index = 0; index < count; index += 1) {
            outX[index] = x[index] + vx[index] * 0.016;
            outY[index] = y[index] + vy[index] * 0.016;
          }
        }
        return checksum();
      }
    }
  } satisfies Record<string, Workload>;
}

function spatialQueryWorkloads(entityCount: number, queryCount: number) {
  const entities: SpatialHashEntity<number>[] = [];
  const grid = createSpatialHash<SpatialHashEntity<number>>({ cellSize: 64 });
  for (let index = 0; index < entityCount; index += 1) {
    const entity = { id: index, x: index % 1000, y: Math.floor(index / 1000) * 13, radius: index % 4 };
    entities.push(entity);
    grid.upsert(entity);
  }
  const queries = Array.from({ length: queryCount }, (_, index) => ({
    x: index * 97 % 1000,
    y: index * 53 % Math.max(1, Math.ceil(entityCount / 1000) * 13),
    radius: 48 + index % 17
  }));
  const scanOut: SpatialHashEntity<number>[] = [];
  const gridOut: SpatialHashEntity<number>[] = [];
  const operations = entityCount * queryCount;
  return {
    scan: {
      label: "full object scan with reused output",
      operations,
      run() {
        let hits = 0;
        for (const query of queries) {
          scanOut.length = 0;
          for (const entity of entities) {
            const radius = query.radius + (entity.radius ?? 0);
            const dx = query.x - entity.x;
            const dy = query.y - entity.y;
            if (dx * dx + dy * dy <= radius * radius) scanOut.push(entity);
          }
          hits += scanOut.length;
        }
        return hits;
      }
    },
    grid: {
      label: "packed-key engine spatial hash with reused output",
      operations,
      run() {
        let hits = 0;
        for (const query of queries) hits += grid.queryNearby(query, gridOut).length;
        return hits;
      }
    }
  } satisfies Record<string, Workload>;
}

function renderRecordWorkloads(recordCount: number, frames: number) {
  type RectRecord = { kind: "rect"; x: number; y: number; width: number; height: number; fill: string };
  const pool = createRenderFramePool();
  const overwritePool = createRenderFramePool({ recordStrategy: "overwrite" });
  const retained = createRetainedCursor({
    capacity: recordCount,
    create: (): RectRecord => ({ kind: "rect", x: 0, y: 0, width: 0, height: 0, fill: "#fff" })
  });
  const operations = recordCount * frames;
  const assign = (record: RectRecord, index: number) => {
    record.x = index % 320;
    record.y = index % 180;
    record.width = 8 + index % 4;
    record.height = 8 + index % 3;
    record.fill = "#fff";
  };
  return {
    fresh: {
      label: "fresh monomorphic objects",
      operations,
      run() {
        let checksum = 0;
        for (let frame = 0; frame < frames; frame += 1) {
          const calls: RectRecord[] = [];
          for (let index = 0; index < recordCount; index += 1) {
            calls.push({ kind: "rect", x: index % 320, y: index % 180, width: 8 + index % 4, height: 8 + index % 3, fill: "#fff" });
          }
          checksum += calls.length + calls[recordCount - 1].x;
        }
        return checksum;
      }
    },
    pool: {
      label: "generic validated render frame pool",
      operations,
      run() {
        let checksum = 0;
        for (let frame = 0; frame < frames; frame += 1) {
          pool.beginFrame();
          const calls = pool.array();
          let lastX = 0;
          for (let index = 0; index < recordCount; index += 1) {
            const record = pool.record("rect");
            const x = index % 320;
            record.x = x;
            record.y = index % 180;
            record.width = 8 + index % 4;
            record.height = 8 + index % 3;
            record.fill = "#fff";
            lastX = x;
            calls.push(renderableRecord(record));
          }
          checksum += calls.length + lastX;
        }
        return checksum;
      }
    },
    overwritePool: {
      label: "generic overwrite render frame pool",
      operations,
      run() {
        let checksum = 0;
        for (let frame = 0; frame < frames; frame += 1) {
          overwritePool.beginFrame();
          const calls = overwritePool.array();
          let lastX = 0;
          for (let index = 0; index < recordCount; index += 1) {
            const record = overwritePool.record("rect");
            const x = index % 320;
            record.x = x;
            record.y = index % 180;
            record.width = 8 + index % 4;
            record.height = 8 + index % 3;
            record.fill = "#fff";
            lastX = x;
            calls.push(renderableRecord(record));
          }
          checksum += calls.length + lastX;
        }
        return checksum;
      }
    },
    retained: {
      label: "typed retained cursor with explicit overwrite",
      operations,
      run() {
        let checksum = 0;
        for (let frame = 0; frame < frames; frame += 1) {
          retained.begin();
          let lastX = 0;
          for (let index = 0; index < recordCount; index += 1) {
            const record = retained.take();
            assign(record, index);
            lastX = record.x;
          }
          checksum += retained.view().count + lastX;
        }
        return checksum;
      }
    }
  } satisfies Record<string, Workload>;
}

function parseOptions(argv: string[]) {
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return {
    out: resolve(repositoryRoot, argument(argv, "out", `.local/engine-perf/${localDate}/low-level-spikes.json`)),
    rounds: integerArgument(argv, "rounds", 4),
    warmup: integerArgument(argv, "warmup", 2),
    batchSizes: argument(argv, "batch-sizes", "1,4,16,64,256,1024,4096,16384").split(",").map((value) => positiveInteger("batch-sizes", value)),
    collisionElements: integerArgument(argv, "collision-elements", 262144),
    particleCount: integerArgument(argv, "particle-count", 100000),
    particleFrames: integerArgument(argv, "particle-frames", 12),
    spatialEntities: integerArgument(argv, "spatial-entities", 50000),
    spatialQueries: integerArgument(argv, "spatial-queries", 160),
    renderRecords: integerArgument(argv, "render-records", 8000),
    renderFrames: integerArgument(argv, "render-frames", 16)
  };
}

function argument(argv: readonly string[], name: string, fallback: string) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function integerArgument(argv: readonly string[], name: string, fallback: number) {
  return positiveInteger(name, argument(argv, name, String(fallback)));
}

function positiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new RangeError(`--${name} must contain positive safe integers.`);
  return parsed;
}

function percentile(values: readonly number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function percentDelta(value: number, baseline: number) {
  return round((value - baseline) / Math.max(0.001, baseline) * 100);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
