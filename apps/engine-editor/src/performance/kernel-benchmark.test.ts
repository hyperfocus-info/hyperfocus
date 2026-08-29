import { expect, test } from "bun:test";
import type { CircleRectBatch } from "@hyperfocus/engine";
import { benchmarkCollisionKernels } from "./kernel-benchmark.ts";

function createKernel() {
  return {
    testCircleRectOverlapBatch(batch: CircleRectBatch) {
      let hits = 0;
      const count = batch.count ?? batch.cx.length;
      for (let index = 0; index < count; index += 1) {
        const closestX = Math.max(batch.rx[index], Math.min(batch.rx[index] + batch.rw[index], batch.cx[index]));
        const closestY = Math.max(batch.ry[index], Math.min(batch.ry[index] + batch.rh[index], batch.cy[index]));
        const dx = batch.cx[index] - closestX;
        const dy = batch.cy[index] - closestY;
        const hit = dx * dx + dy * dy <= batch.radius[index] * batch.radius[index] ? 1 : 0;
        batch.out[index] = hit;
        hits += hit;
      }
      return hits;
    }
  };
}

function createResidentKernel() {
  const kernel = createKernel();
  return {
    ...kernel,
    createResidentCircleRectBatch(batch: Omit<CircleRectBatch, "out">) {
      let released = false;
      const residentBatch = { ...batch, out: new Uint8Array(batch.count ?? batch.cx.length) };
      return {
        count: residentBatch.out.length,
        byteLength: residentBatch.out.length * 29,
        run() {
          if (released) throw new Error("released");
          return kernel.testCircleRectOverlapBatch(residentBatch);
        },
        copyMask(target: Uint8Array) { target.set(residentBatch.out); },
        release() { released = true; }
      };
    }
  };
}

test("collision diagnostics benchmark uses batched parity-checked A/B/B/A samples", () => {
  const result = benchmarkCollisionKernels(createKernel(), createKernel(), {
    batchSize: 32,
    batchesPerSample: 4,
    warmup: 1,
    rounds: 2
  });

  expect(result.batchSize).toBe(32);
  expect(result.operationsPerSample).toBe(128);
  expect(result.samplesPerBackend).toBe(4);
  expect(result.wasmHits).toBe(result.typescriptHits);
  expect(result.wasmMs).toBeGreaterThan(0);
  expect(result.typescriptMs).toBeGreaterThan(0);
});

test("collision diagnostics benchmark rejects empty workloads", () => {
  expect(() => benchmarkCollisionKernels(createKernel(), createKernel(), { batchSize: 0 })).toThrow("batchSize");
});

test("collision diagnostics benchmark separates resident WASM from copied host-boundary work", () => {
  const result = benchmarkCollisionKernels(createResidentKernel(), createKernel(), {
    batchSize: 16,
    batchesPerSample: 3,
    warmup: 1,
    rounds: 2
  });

  expect(result.residentWasmMs).toBeGreaterThan(0);
  expect(result.residentWasmHits).toBe(result.typescriptHits);
  expect(result.residentWasmHostBytesPerSample).toBe(0);
  expect(result.copiedWasmHostBytesPerSample).toBe(16 * 29 * 3);
  expect(result.residentArenaBytes).toBe(16 * 29);
});
