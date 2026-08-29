type WasmBatchExport = (
  cxPtr: number,
  cyPtr: number,
  radiusPtr: number,
  rxPtr: number,
  ryPtr: number,
  rwPtr: number,
  rhPtr: number,
  outPtr: number,
  count: number
) => number;

type WasmCollisionVariantExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  __new: (bytes: number) => number;
  circle_rect_overlap_batch_f32: WasmBatchExport;
};

export type WasmCollisionVariantWorkload = {
  label: string;
  operations: number;
  retainedBytes: number;
  run: () => number;
};

export async function createWasmCollisionVariantWorkloads(batchSize: number, targetElements: number) {
  const bytes = batchSize * 29;
  const calls = Math.max(1, Math.ceil(targetElements / batchSize));
  const operations = calls * batchSize;
  const create = async (variant: "scalar" | "simd"): Promise<WasmCollisionVariantWorkload & { mask: Uint8Array }> => {
    const source = await Bun.file(new URL(`../wasm/collision-kernel.${variant}.wasm`, import.meta.url)).arrayBuffer();
    const result = await WebAssembly.instantiate(source, { env: { abort() {} } });
    const exports = readVariantExports(result.instance.exports);
    const ptr = exports.__new(bytes);
    if (!Number.isSafeInteger(ptr) || ptr <= 0 || ptr + bytes > exports.memory.buffer.byteLength) {
      throw new Error(`${variant} spike could not allocate a stable WASM input arena.`);
    }
    const f32 = new Float32Array(exports.memory.buffer);
    const u8 = new Uint8Array(exports.memory.buffer);
    const f32Ptr = (column: number) => ptr + column * batchSize * 4;
    const outPtr = ptr + batchSize * 7 * 4;
    for (let index = 0; index < batchSize; index += 1) {
      f32[(f32Ptr(0) >> 2) + index] = index % 120;
      f32[(f32Ptr(1) >> 2) + index] = index % 95;
      f32[(f32Ptr(2) >> 2) + index] = 7;
      f32[(f32Ptr(3) >> 2) + index] = 40;
      f32[(f32Ptr(4) >> 2) + index] = 30;
      f32[(f32Ptr(5) >> 2) + index] = 22;
      f32[(f32Ptr(6) >> 2) + index] = 18;
    }
    const workload = {
      label: `WASM ${variant}, resident inputs`,
      operations,
      retainedBytes: bytes,
      mask: new Uint8Array(batchSize),
      run() {
        let hits = 0;
        for (let call = 0; call < calls; call += 1) {
          hits += exports.circle_rect_overlap_batch_f32(
            f32Ptr(0), f32Ptr(1), f32Ptr(2), f32Ptr(3), f32Ptr(4), f32Ptr(5), f32Ptr(6), outPtr, batchSize
          );
        }
        workload.mask.set(u8.subarray(outPtr, outPtr + batchSize));
        return hits;
      }
    };
    return workload;
  };
  const scalar = await create("scalar");
  const simd = await create("simd");
  scalar.run();
  simd.run();
  for (let index = 0; index < batchSize; index += 1) {
    if (scalar.mask[index] !== simd.mask[index]) {
      throw new Error(`Scalar/SIMD WASM mask parity failed at index ${index}.`);
    }
  }
  return { scalar, simd };
}

function readVariantExports(exports: WebAssembly.Exports): WasmCollisionVariantExports {
  if (!(exports.memory instanceof WebAssembly.Memory)
    || typeof exports.__new !== "function"
    || typeof exports.circle_rect_overlap_batch_f32 !== "function") {
    throw new Error("Collision WASM module is missing scalar/SIMD spike exports.");
  }
  return exports as WasmCollisionVariantExports;
}
