import type { CircleRectBatch } from "@hyperfocus/engine";

type BatchCollisionKernel = {
  testCircleRectOverlapBatch(batch: CircleRectBatch): number;
  createResidentCircleRectBatch?(batch: CollisionBatchFixture): ResidentCollisionBatch;
};

type ResidentCollisionBatch = {
  readonly count: number;
  readonly byteLength: number;
  run(): number;
  copyMask(target: Uint8Array): void;
  release(): void;
};

export type CollisionKernelBenchmarkOptions = {
  batchSize?: number;
  batchesPerSample?: number;
  warmup?: number;
  rounds?: number;
};

export type CollisionKernelBenchmarkResult = {
  wasmMs: number;
  residentWasmMs?: number;
  typescriptMs: number;
  batchSize: number;
  operationsPerSample: number;
  wasmHits: number;
  residentWasmHits?: number;
  typescriptHits: number;
  samplesPerBackend: number;
  copiedWasmHostBytesPerSample: number;
  residentWasmHostBytesPerSample?: number;
  residentArenaBytes?: number;
};

type CollisionBatchFixture = Omit<CircleRectBatch, "out">;

const DEFAULT_BATCH_SIZE = 4096;
const DEFAULT_BATCHES_PER_SAMPLE = 256;
const DEFAULT_WARMUP = 2;
const DEFAULT_ROUNDS = 3;

export function createCollisionBatchFixture(count: number): CollisionBatchFixture {
  assertPositiveInteger("batchSize", count);
  const cx = new Float32Array(count);
  const cy = new Float32Array(count);
  const radius = new Float32Array(count);
  const rx = new Float32Array(count);
  const ry = new Float32Array(count);
  const rw = new Float32Array(count);
  const rh = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    cx[index] = index % 120;
    cy[index] = index % 95;
    radius[index] = 7;
    rx[index] = 40;
    ry[index] = 30;
    rw[index] = 22;
    rh[index] = 18;
  }
  return { cx, cy, radius, rx, ry, rw, rh, count };
}

export function benchmarkCollisionKernels(
  wasm: BatchCollisionKernel,
  typescript: BatchCollisionKernel,
  options: CollisionKernelBenchmarkOptions = {}
): CollisionKernelBenchmarkResult {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const batchesPerSample = options.batchesPerSample ?? DEFAULT_BATCHES_PER_SAMPLE;
  const warmup = options.warmup ?? DEFAULT_WARMUP;
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  assertPositiveInteger("batchSize", batchSize);
  assertPositiveInteger("batchesPerSample", batchesPerSample);
  assertNonNegativeInteger("warmup", warmup);
  assertPositiveInteger("rounds", rounds);

  const fixture = createCollisionBatchFixture(batchSize);
  const wasmBatch = { ...fixture, out: new Uint8Array(batchSize) };
  const typescriptBatch = { ...fixture, out: new Uint8Array(batchSize) };
  const resident = wasm.createResidentCircleRectBatch?.(fixture);
  try {
    for (let index = 0; index < warmup; index += 1) {
      runKernelSample(wasm, wasmBatch, batchesPerSample);
      if (resident) runResidentSample(resident, batchesPerSample);
      runKernelSample(typescript, typescriptBatch, batchesPerSample);
    }

    const wasmSamples: number[] = [];
    const residentSamples: number[] = [];
    const typescriptSamples: number[] = [];
    let wasmHits = 0;
    let residentWasmHits: number | undefined;
    let typescriptHits = 0;
    for (let round = 0; round < rounds; round += 1) {
      const copiedFirst = measureKernel(wasm, wasmBatch, batchesPerSample);
      const residentFirst = resident && measureResident(resident, batchesPerSample);
      const typescriptFirst = measureKernel(typescript, typescriptBatch, batchesPerSample);
      const typescriptSecond = measureKernel(typescript, typescriptBatch, batchesPerSample);
      const residentSecond = resident && measureResident(resident, batchesPerSample);
      const copiedSecond = measureKernel(wasm, wasmBatch, batchesPerSample);
      wasmSamples.push(copiedFirst.elapsedMs, copiedSecond.elapsedMs);
      if (residentFirst && residentSecond) residentSamples.push(residentFirst.elapsedMs, residentSecond.elapsedMs);
      typescriptSamples.push(typescriptFirst.elapsedMs, typescriptSecond.elapsedMs);
      wasmHits = copiedSecond.hits;
      residentWasmHits = residentSecond?.hits;
      typescriptHits = typescriptSecond.hits;
    }

    const residentMask = resident ? new Uint8Array(batchSize) : undefined;
    resident?.copyMask(residentMask!);
    if (wasmHits !== typescriptHits
      || (residentWasmHits !== undefined && residentWasmHits !== typescriptHits)
      || !masksEqual(wasmBatch.out, typescriptBatch.out)
      || (residentMask && !masksEqual(residentMask, typescriptBatch.out))) {
      throw new Error(`Collision kernel benchmark parity failed: copied WASM ${wasmHits} hits, resident WASM ${residentWasmHits ?? "unavailable"} hits, TypeScript ${typescriptHits} hits.`);
    }
    return {
      wasmMs: percentile(wasmSamples, 0.95),
      ...(resident ? { residentWasmMs: percentile(residentSamples, 0.95) } : {}),
      typescriptMs: percentile(typescriptSamples, 0.95),
      batchSize,
      operationsPerSample: batchSize * batchesPerSample,
      wasmHits,
      ...(residentWasmHits === undefined ? {} : { residentWasmHits }),
      typescriptHits,
      samplesPerBackend: rounds * 2,
      copiedWasmHostBytesPerSample: batchSize * 29 * batchesPerSample,
      ...(resident ? { residentWasmHostBytesPerSample: 0, residentArenaBytes: resident.byteLength } : {})
    };
  } finally {
    resident?.release();
  }
}

function measureKernel(kernel: BatchCollisionKernel, batch: CircleRectBatch, batches: number) {
  const startedAt = performance.now();
  const hits = runKernelSample(kernel, batch, batches);
  return { elapsedMs: Math.max(0.001, performance.now() - startedAt), hits };
}

function runKernelSample(kernel: BatchCollisionKernel, batch: CircleRectBatch, batches: number) {
  let hits = 0;
  for (let index = 0; index < batches; index += 1) hits += kernel.testCircleRectOverlapBatch(batch);
  return hits;
}

function measureResident(batch: ResidentCollisionBatch, batches: number) {
  const startedAt = performance.now();
  const hits = runResidentSample(batch, batches);
  return { elapsedMs: Math.max(0.001, performance.now() - startedAt), hits };
}

function runResidentSample(batch: ResidentCollisionBatch, batches: number) {
  let hits = 0;
  for (let index = 0; index < batches; index += 1) hits += batch.run();
  return hits;
}

function masksEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function percentile(values: readonly number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
}

function assertNonNegativeInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
}
