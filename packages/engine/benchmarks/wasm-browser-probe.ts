/** Self-contained: Playwright serializes this complete callback into the browser. */
export async function probeWasmBrowserVariants({ scalarBytes, simdBytes, batchSizes, targetElements, rounds }: { scalarBytes: number[]; simdBytes: number[]; batchSizes: number[]; targetElements: number; rounds: number }) {
  type BatchExport = (
    cx: number,
    cy: number,
    radius: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    out: number,
    count: number
  ) => number;
  type ModuleExports = WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    __new: (bytes: number) => number;
  };
  const scalarSource = Uint8Array.from(scalarBytes);
  const simdSource = Uint8Array.from(simdBytes);
  const moduleValid = { scalar: WebAssembly.validate(scalarSource), simd: WebAssembly.validate(simdSource) };
  const scalarModule = (await WebAssembly.instantiate(scalarSource, { env: { abort() {} } })).instance.exports as ModuleExports;
  const simdModule = (await WebAssembly.instantiate(simdSource, { env: { abort() {} } })).instance.exports as ModuleExports;
  const scalarKernel = scalarModule.circle_rect_overlap_batch_scalar_f32 as BatchExport;
  const simdKernel = simdModule.circle_rect_overlap_batch_simd_f32 as BatchExport;
  for (const [name, module, kernel] of [
    ["scalar", scalarModule, scalarKernel],
    ["simd", simdModule, simdKernel]
  ] as const) {
    if (!(module.memory instanceof WebAssembly.Memory) || typeof module.__new !== "function" || typeof kernel !== "function") {
      throw new Error(`Browser ${name} module is missing collision exports.`);
    }
  }
  const results = [];
  for (const batchSize of batchSizes) {
    const byteLength = batchSize * 29;
    const calls = Math.max(1, Math.ceil(targetElements / batchSize));
    const operations = calls * batchSize;
    const scalarArena = createArena(scalarModule, scalarKernel, batchSize, calls);
    const simdArena = createArena(simdModule, simdKernel, batchSize, calls);
    const scalarHits = scalarArena.invoke();
    const scalarMask = scalarArena.readMask();
    const simdHits = simdArena.invoke();
    if (scalarHits !== simdHits) throw new Error(`Hit parity failed for batch ${batchSize}.`);
    const simdMask = simdArena.readMask();
    for (let index = 0; index < batchSize; index += 1) {
      if (scalarMask[index] !== simdMask[index]) {
        throw new Error(`Mask parity failed for batch ${batchSize} at ${index}.`);
      }
    }
    for (let warmup = 0; warmup < 3; warmup += 1) {
      scalarArena.invoke();
      simdArena.invoke();
    }
    const scalarSamplesMs: number[] = [];
    const simdSamplesMs: number[] = [];
    for (let round = 0; round < rounds; round += 1) {
      scalarSamplesMs.push(measure(scalarArena.invoke));
      simdSamplesMs.push(measure(simdArena.invoke), measure(simdArena.invoke));
      scalarSamplesMs.push(measure(scalarArena.invoke));
    }
    const fourLaneGroupsPerCall = Math.floor(batchSize / 4);
    const scalarTailPerCall = batchSize % 4;
    results.push({
      batchSize,
      calls,
      operations,
      logicalBytesPerOperation: 29,
      timedHostBoundaryBytes: 0,
      residentArenaBytes: byteLength,
      structuralWork: {
        scalarElements: operations,
        simdFourLaneGroups: fourLaneGroupsPerCall * calls,
        simdPackedElements: fourLaneGroupsPerCall * 4 * calls,
        simdScalarTailElements: scalarTailPerCall * calls
      },
      scalar: summarize(scalarSamplesMs, operations),
      simd: summarize(simdSamplesMs, operations)
    });
  }
  return {
    environment: {
      userAgent: navigator.userAgent,
      logicalCpus: navigator.hardwareConcurrency
    },
    moduleValid,
    wasmBytes: { scalar: scalarSource.byteLength, simd: simdSource.byteLength },
    results
  };

  function createArena(module: ModuleExports, kernel: BatchExport, batchSize: number, calls: number) {
    const pointer = module.__new(batchSize * 29);
    const floats = new Float32Array(module.memory.buffer);
    const mask = new Uint8Array(module.memory.buffer);
    const pointerFor = (column: number) => pointer + column * batchSize * 4;
    const outPointer = pointer + batchSize * 7 * 4;
    for (let index = 0; index < batchSize; index += 1) {
      floats[(pointerFor(0) >> 2) + index] = index % 120;
      floats[(pointerFor(1) >> 2) + index] = index % 95;
      floats[(pointerFor(2) >> 2) + index] = 7;
      floats[(pointerFor(3) >> 2) + index] = 40;
      floats[(pointerFor(4) >> 2) + index] = 30;
      floats[(pointerFor(5) >> 2) + index] = 22;
      floats[(pointerFor(6) >> 2) + index] = 18;
    }
    return {
      invoke() {
        let hits = 0;
        for (let call = 0; call < calls; call += 1) {
          hits += kernel(pointerFor(0), pointerFor(1), pointerFor(2), pointerFor(3), pointerFor(4),
            pointerFor(5), pointerFor(6), outPointer, batchSize);
        }
        return hits;
      },
      readMask: () => mask.slice(outPointer, outPointer + batchSize)
    };
  }

  function measure(run: () => number) {
    const startedAt = performance.now();
    const checksum = run();
    if (!Number.isFinite(checksum)) throw new Error("WASM workload returned a non-finite checksum.");
    return performance.now() - startedAt;
  }

  function summarize(samples: number[], operations: number) {
    const sorted = [...samples].sort((left, right) => left - right);
    const p50Ms = percentile(sorted, 0.5);
    const p95Ms = percentile(sorted, 0.95);
    return {
      samplesMs: samples,
      p50Ms,
      p95Ms,
      nanosecondsPerOperationP50: p50Ms * 1_000_000 / operations
    };
  }

  function percentile(sorted: number[], fraction: number) {
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  }
}
