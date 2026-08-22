import {
  circleRectOverlap,
  pointInRect,
  rayIntersectMap,
  testOverlapCircle,
  testOverlapRect,
  type CircleLike,
  type RectLike,
  type Vec2,
  vecAngle,
  vecDistance,
  vecNormalize
} from "../math/collision.ts";
import type {
  CircleRectBatch,
  MutableFloatBatch,
  MutableMaskBatch,
  MovementBatch,
  RangeFilterBatch,
  RectRectBatch,
  RotationBatch
} from "../types.ts";

type CircleRectWasmExport = (cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) => number;
type WasmBatchExport = (...args: number[]) => number | void;
type WasmAllocatorExport = (bytes: number) => number;

const MAX_BATCH_COUNT = 0x7fff_ffff;
const MAX_WASM_ALLOCATION_BYTES = 0x7fff_fff0;

export type CollisionKernelBackend = "wasm" | "typescript";

export type CollisionKernel = {
  backend: CollisionKernelBackend;
  testOverlapRect: typeof testOverlapRect;
  testOverlapCircle: typeof testOverlapCircle;
  pointInRect: typeof pointInRect;
  circleRectOverlap: (circle: CircleLike, rect: RectLike) => boolean;
  testCircleRectOverlap: (
    cx: number,
    cy: number,
    radius: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ) => boolean;
  vecDistance: typeof vecDistance;
  vecAngle: typeof vecAngle;
  vecNormalize: <T extends Vec2 = Vec2>(x: number, y: number, out?: T) => T;
  rayIntersectMap: typeof rayIntersectMap;
  integrateMovementBatch: (batch: MovementBatch) => void;
  rotatePointsBatch: (batch: RotationBatch) => void;
  rotateVectorsBatch: (batch: RotationBatch) => void;
  rangeFilterBatch: (batch: RangeFilterBatch) => number;
  predicateFilterMaskBatch: (batch: RangeFilterBatch) => number;
  testRectOverlapBatch: (batch: RectRectBatch) => number;
  testCircleRectOverlapBatch: (batch: CircleRectBatch) => number;
};

export type CollisionKernelWasmUrlOptions = {
  baseUrl?: string | URL;
};

export type CollisionKernelFallbackReason =
  | "fetch"
  | "instantiate"
  | "missing-export";

export type CollisionKernelFallbackDiagnostic = {
  reason: CollisionKernelFallbackReason;
  url: string;
  error?: unknown;
};

export type CollisionKernelOptions = {
  url?: string;
  fetch?: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
  /**
   * Reserve a fixed WASM scratch block while the kernel is created. Batch calls
   * that need more space fail instead of allocating inside the hot path.
   */
  scratchBytes?: number;
};

function isCircleRectExport(value: unknown): value is CircleRectWasmExport {
  return typeof value === "function";
}

function isWasmBatchExport(value: unknown): value is WasmBatchExport {
  return typeof value === "function";
}

function isWasmAllocatorExport(value: unknown): value is WasmAllocatorExport {
  return typeof value === "function";
}

function assertBatchLength(name: string, value: ArrayLike<number>, count: number) {
  if (value.length < count) {
    throw new RangeError(`${name} length ${value.length} is smaller than count ${count}`);
  }
}

function assertFiniteScalar(name: string, value: number) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function resolveBatchCount(name: string, explicitCount: number | undefined, inferredCount: number) {
  const count = explicitCount ?? inferredCount;
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_BATCH_COUNT) {
    throw new RangeError(`${name} count must be a non-negative safe integer no greater than ${MAX_BATCH_COUNT}`);
  }
  return count;
}

function scratchByteLength(name: string, count: number, f32Arrays: number, byteArrays = 0) {
  const bytes = count * f32Arrays * 4 + count * byteArrays;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_WASM_ALLOCATION_BYTES) {
    throw new RangeError(`${name} batch is too large for WASM linear memory`);
  }
  return bytes;
}

function countBatch2(name: string, explicitCount: number | undefined, a: ArrayLike<number>, b: ArrayLike<number>) {
  const count = resolveBatchCount(name, explicitCount, Math.min(a.length, b.length));
  assertBatchLength(`${name}[0]`, a, count);
  assertBatchLength(`${name}[1]`, b, count);
  return count;
}

function countBatch4(
  name: string,
  explicitCount: number | undefined,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  c: ArrayLike<number>,
  d: ArrayLike<number>
) {
  const count = resolveBatchCount(name, explicitCount, Math.min(a.length, b.length, c.length, d.length));
  assertBatchLength(`${name}[0]`, a, count);
  assertBatchLength(`${name}[1]`, b, count);
  assertBatchLength(`${name}[2]`, c, count);
  assertBatchLength(`${name}[3]`, d, count);
  return count;
}

function countBatch8(
  name: string,
  explicitCount: number | undefined,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  c: ArrayLike<number>,
  d: ArrayLike<number>,
  e: ArrayLike<number>,
  f: ArrayLike<number>,
  g: ArrayLike<number>,
  h: ArrayLike<number>
) {
  const count = resolveBatchCount(name, explicitCount, Math.min(a.length, b.length, c.length, d.length, e.length, f.length, g.length, h.length));
  assertBatchLength(`${name}[0]`, a, count);
  assertBatchLength(`${name}[1]`, b, count);
  assertBatchLength(`${name}[2]`, c, count);
  assertBatchLength(`${name}[3]`, d, count);
  assertBatchLength(`${name}[4]`, e, count);
  assertBatchLength(`${name}[5]`, f, count);
  assertBatchLength(`${name}[6]`, g, count);
  assertBatchLength(`${name}[7]`, h, count);
  return count;
}

function countBatch9(
  name: string,
  explicitCount: number | undefined,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  c: ArrayLike<number>,
  d: ArrayLike<number>,
  e: ArrayLike<number>,
  f: ArrayLike<number>,
  g: ArrayLike<number>,
  h: ArrayLike<number>,
  i: ArrayLike<number>
) {
  const count = resolveBatchCount(
    name,
    explicitCount,
    Math.min(a.length, b.length, c.length, d.length, e.length, f.length, g.length, h.length, i.length)
  );
  assertBatchLength(`${name}[0]`, a, count);
  assertBatchLength(`${name}[1]`, b, count);
  assertBatchLength(`${name}[2]`, c, count);
  assertBatchLength(`${name}[3]`, d, count);
  assertBatchLength(`${name}[4]`, e, count);
  assertBatchLength(`${name}[5]`, f, count);
  assertBatchLength(`${name}[6]`, g, count);
  assertBatchLength(`${name}[7]`, h, count);
  assertBatchLength(`${name}[8]`, i, count);
  return count;
}

function writeF32(target: Float32Array, offset: number, values: ArrayLike<number>, count: number) {
  if (values instanceof Float32Array) {
    target.set(values.subarray(0, count), offset);
    return;
  }
  for (let i = 0; i < count; i += 1) {
    target[offset + i] = values[i];
  }
}

function readF32(source: Float32Array, offset: number, target: MutableFloatBatch, count: number) {
  if (target instanceof Float32Array) {
    target.set(source.subarray(offset, offset + count));
    return;
  }
  for (let i = 0; i < count; i += 1) {
    target[i] = source[offset + i];
  }
}

function readMask(source: Uint8Array, offset: number, target: MutableMaskBatch, count: number) {
  if (target instanceof Uint8Array) {
    target.set(source.subarray(offset, offset + count));
    return;
  }
  for (let i = 0; i < count; i += 1) {
    target[i] = source[offset + i];
  }
}

function rangeFilterFallback(batch: RangeFilterBatch) {
  assertFiniteScalar("rangeFilterBatch min", batch.min);
  assertFiniteScalar("rangeFilterBatch max", batch.max);
  const count = countBatch2("rangeFilterBatch", batch.count, batch.values, batch.out);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = batch.values[i] >= batch.min && batch.values[i] <= batch.max ? 1 : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function integrateMovementFallback(batch: MovementBatch) {
  assertFiniteScalar("integrateMovementBatch dt", batch.dt);
  const count = countBatch4("integrateMovementBatch", batch.count, batch.x, batch.y, batch.vx, batch.vy);
  for (let i = 0; i < count; i += 1) {
    const x = batch.x[i];
    const y = batch.y[i];
    const vx = batch.vx[i];
    const vy = batch.vy[i];
    batch.x[i] = x + vx * batch.dt;
    batch.y[i] = y + vy * batch.dt;
  }
}

function rotatePointsFallback(batch: RotationBatch) {
  assertFiniteScalar("rotatePointsBatch angle", batch.angle);
  const count = countBatch4("rotatePointsBatch", batch.count, batch.x, batch.y, batch.outX, batch.outY);
  const sin = Math.sin(batch.angle);
  const cos = Math.cos(batch.angle);
  for (let i = 0; i < count; i += 1) {
    const x = batch.x[i];
    const y = batch.y[i];
    batch.outX[i] = x * cos - y * sin;
    batch.outY[i] = x * sin + y * cos;
  }
}

function rotateVectorsFallback(batch: RotationBatch) {
  rotatePointsFallback(batch);
}

function testRectOverlapBatchFallback(batch: RectRectBatch) {
  const count = countBatch9(
    "testRectOverlapBatch",
    batch.count,
    batch.ax,
    batch.ay,
    batch.aw,
    batch.ah,
    batch.bx,
    batch.by,
    batch.bw,
    batch.bh,
    batch.out
  );
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = testOverlapRect(batch.ax[i], batch.ay[i], batch.aw[i], batch.ah[i], batch.bx[i], batch.by[i], batch.bw[i], batch.bh[i])
      ? 1
      : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function testCircleRectOverlapBatchFallback(batch: CircleRectBatch) {
  const count = countBatch8(
    "testCircleRectOverlapBatch",
    batch.count,
    batch.cx,
    batch.cy,
    batch.radius,
    batch.rx,
    batch.ry,
    batch.rw,
    batch.rh,
    batch.out
  );
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const hit = testCircleRectOverlap(batch.cx[i], batch.cy[i], batch.radius[i], batch.rx[i], batch.ry[i], batch.rw[i], batch.rh[i])
      ? 1
      : 0;
    batch.out[i] = hit;
    hits += hit;
  }
  return hits;
}

function createWasmBatchBridge(exports: WebAssembly.Exports, fixedScratchBytes?: number) {
  const memory = exports.memory instanceof WebAssembly.Memory ? exports.memory : undefined;
  const allocate = isWasmAllocatorExport(exports.__new) ? exports.__new : undefined;
  const integrate = isWasmBatchExport(exports.integrate_movement_f32) ? exports.integrate_movement_f32 : undefined;
  const rotate = isWasmBatchExport(exports.rotate_points_f32) ? exports.rotate_points_f32 : undefined;
  const rotateVectors = isWasmBatchExport(exports.rotate_vectors_f32) ? exports.rotate_vectors_f32 : rotate;
  const range = isWasmBatchExport(exports.range_filter_f32)
    ? exports.range_filter_f32
    : isWasmBatchExport(exports.predicate_filter_mask_f32)
      ? exports.predicate_filter_mask_f32
      : undefined;
  const rectRect = isWasmBatchExport(exports.rect_rect_overlap_batch_f32) ? exports.rect_rect_overlap_batch_f32 : undefined;
  const circleRect = isWasmBatchExport(exports.circle_rect_overlap_batch_f32) ? exports.circle_rect_overlap_batch_f32 : undefined;
  let scratchPtr = 0;
  let scratchBytes = 0;

  function allocateScratch(bytes: number) {
    if (!memory || !allocate || bytes === 0) return;
    const allocated = allocate(bytes);
    if (!Number.isSafeInteger(allocated) || allocated < 0 || allocated % 4 !== 0) {
      throw new RangeError("WASM allocator returned an invalid scratch pointer");
    }
    scratchPtr = allocated;
    scratchBytes = bytes;
  }

  allocateScratch(fixedScratchBytes ?? 0);

  function ensureScratch(bytes: number) {
    if (!memory || !allocate) return undefined;
    if (bytes > scratchBytes) {
      if (fixedScratchBytes !== undefined) {
        throw new RangeError(`WASM scratch capacity ${scratchBytes} bytes exceeded by ${bytes}-byte batch`);
      }
      allocateScratch(bytes);
    }
    if (bytes > 0 && scratchPtr === 0) throw new RangeError("WASM allocator failed to allocate scratch memory");
    if (!Number.isSafeInteger(scratchPtr + bytes) || scratchPtr + bytes > memory.buffer.byteLength) {
      throw new RangeError("WASM allocator returned scratch memory outside linear memory");
    }
    return scratchPtr;
  }

  function f32View() {
    if (!memory) throw new Error("WASM memory export missing");
    return new Float32Array(memory.buffer);
  }

  function u8View() {
    if (!memory) throw new Error("WASM memory export missing");
    return new Uint8Array(memory.buffer);
  }

  function f32Ptr(base: number, index: number, count: number) {
    return base + index * count * 4;
  }

  function u8Ptr(base: number, f32Count: number, index: number) {
    return base + f32Count * 4 + index;
  }

  function runRangeFilter(batch: RangeFilterBatch) {
    assertFiniteScalar("rangeFilterBatch min", batch.min);
    assertFiniteScalar("rangeFilterBatch max", batch.max);
    const count = countBatch2("rangeFilterBatch", batch.count, batch.values, batch.out);
    const ptr = ensureScratch(scratchByteLength("rangeFilterBatch", count, 1, 1));
    if (count === 0 || ptr === undefined || !range) return rangeFilterFallback(batch);
    let heap = f32View();
    writeF32(heap, ptr >> 2, batch.values, count);
    const outPtr = u8Ptr(ptr, count, 0);
    const hits = Number(range(ptr, batch.min, batch.max, outPtr, count));
    readMask(u8View(), outPtr, batch.out, count);
    return hits;
  }

  return {
    integrateMovementBatch(batch: MovementBatch) {
      assertFiniteScalar("integrateMovementBatch dt", batch.dt);
      const count = countBatch4("integrateMovementBatch", batch.count, batch.x, batch.y, batch.vx, batch.vy);
      const ptr = ensureScratch(scratchByteLength("integrateMovementBatch", count, 4));
      if (count === 0 || ptr === undefined || !integrate) return integrateMovementFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      writeF32(heap, (ptr >> 2) + count * 2, batch.vx, count);
      writeF32(heap, (ptr >> 2) + count * 3, batch.vy, count);
      integrate(f32Ptr(ptr, 0, count), f32Ptr(ptr, 1, count), f32Ptr(ptr, 2, count), f32Ptr(ptr, 3, count), batch.dt, count);
      heap = f32View();
      readF32(heap, ptr >> 2, batch.x, count);
      readF32(heap, (ptr >> 2) + count, batch.y, count);
    },
    rotatePointsBatch(batch: RotationBatch) {
      assertFiniteScalar("rotatePointsBatch angle", batch.angle);
      const count = countBatch4("rotatePointsBatch", batch.count, batch.x, batch.y, batch.outX, batch.outY);
      const ptr = ensureScratch(scratchByteLength("rotatePointsBatch", count, 4));
      if (count === 0 || ptr === undefined || !rotate) return rotatePointsFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      rotate(
        f32Ptr(ptr, 0, count),
        f32Ptr(ptr, 1, count),
        f32Ptr(ptr, 2, count),
        f32Ptr(ptr, 3, count),
        Math.sin(batch.angle),
        Math.cos(batch.angle),
        count
      );
      heap = f32View();
      readF32(heap, (ptr >> 2) + count * 2, batch.outX, count);
      readF32(heap, (ptr >> 2) + count * 3, batch.outY, count);
    },
    rotateVectorsBatch(batch: RotationBatch) {
      assertFiniteScalar("rotateVectorsBatch angle", batch.angle);
      const count = countBatch4("rotateVectorsBatch", batch.count, batch.x, batch.y, batch.outX, batch.outY);
      const ptr = ensureScratch(scratchByteLength("rotateVectorsBatch", count, 4));
      if (count === 0 || ptr === undefined || !rotateVectors) return rotateVectorsFallback(batch);
      let heap = f32View();
      writeF32(heap, ptr >> 2, batch.x, count);
      writeF32(heap, (ptr >> 2) + count, batch.y, count);
      rotateVectors(
        f32Ptr(ptr, 0, count),
        f32Ptr(ptr, 1, count),
        f32Ptr(ptr, 2, count),
        f32Ptr(ptr, 3, count),
        Math.sin(batch.angle),
        Math.cos(batch.angle),
        count
      );
      heap = f32View();
      readF32(heap, (ptr >> 2) + count * 2, batch.outX, count);
      readF32(heap, (ptr >> 2) + count * 3, batch.outY, count);
    },
    rangeFilterBatch: runRangeFilter,
    predicateFilterMaskBatch: runRangeFilter,
    testRectOverlapBatch(batch: RectRectBatch) {
      const count = countBatch9(
        "testRectOverlapBatch",
        batch.count,
        batch.ax,
        batch.ay,
        batch.aw,
        batch.ah,
        batch.bx,
        batch.by,
        batch.bw,
        batch.bh,
        batch.out
      );
      const ptr = ensureScratch(scratchByteLength("testRectOverlapBatch", count, 8, 1));
      if (count === 0 || ptr === undefined || !rectRect) return testRectOverlapBatchFallback(batch);
      let heap = f32View();
      writeF32(heap, (ptr >> 2) + count * 0, batch.ax, count);
      writeF32(heap, (ptr >> 2) + count * 1, batch.ay, count);
      writeF32(heap, (ptr >> 2) + count * 2, batch.aw, count);
      writeF32(heap, (ptr >> 2) + count * 3, batch.ah, count);
      writeF32(heap, (ptr >> 2) + count * 4, batch.bx, count);
      writeF32(heap, (ptr >> 2) + count * 5, batch.by, count);
      writeF32(heap, (ptr >> 2) + count * 6, batch.bw, count);
      writeF32(heap, (ptr >> 2) + count * 7, batch.bh, count);
      const outPtr = u8Ptr(ptr, count * 8, 0);
      const hits = Number(
        rectRect(
          f32Ptr(ptr, 0, count),
          f32Ptr(ptr, 1, count),
          f32Ptr(ptr, 2, count),
          f32Ptr(ptr, 3, count),
          f32Ptr(ptr, 4, count),
          f32Ptr(ptr, 5, count),
          f32Ptr(ptr, 6, count),
          f32Ptr(ptr, 7, count),
          outPtr,
          count
        )
      );
      readMask(u8View(), outPtr, batch.out, count);
      return hits;
    },
    testCircleRectOverlapBatch(batch: CircleRectBatch) {
      const count = countBatch8(
        "testCircleRectOverlapBatch",
        batch.count,
        batch.cx,
        batch.cy,
        batch.radius,
        batch.rx,
        batch.ry,
        batch.rw,
        batch.rh,
        batch.out
      );
      const ptr = ensureScratch(scratchByteLength("testCircleRectOverlapBatch", count, 7, 1));
      if (count === 0 || ptr === undefined || !circleRect) return testCircleRectOverlapBatchFallback(batch);
      let heap = f32View();
      writeF32(heap, (ptr >> 2) + count * 0, batch.cx, count);
      writeF32(heap, (ptr >> 2) + count * 1, batch.cy, count);
      writeF32(heap, (ptr >> 2) + count * 2, batch.radius, count);
      writeF32(heap, (ptr >> 2) + count * 3, batch.rx, count);
      writeF32(heap, (ptr >> 2) + count * 4, batch.ry, count);
      writeF32(heap, (ptr >> 2) + count * 5, batch.rw, count);
      writeF32(heap, (ptr >> 2) + count * 6, batch.rh, count);
      const outPtr = u8Ptr(ptr, count * 7, 0);
      const hits = Number(
        circleRect(
          f32Ptr(ptr, 0, count),
          f32Ptr(ptr, 1, count),
          f32Ptr(ptr, 2, count),
          f32Ptr(ptr, 3, count),
          f32Ptr(ptr, 4, count),
          f32Ptr(ptr, 5, count),
          f32Ptr(ptr, 6, count),
          outPtr,
          count
        )
      );
      readMask(u8View(), outPtr, batch.out, count);
      return hits;
    }
  } satisfies Pick<
    CollisionKernel,
    | "integrateMovementBatch"
    | "rotatePointsBatch"
    | "rotateVectorsBatch"
    | "rangeFilterBatch"
    | "predicateFilterMaskBatch"
    | "testRectOverlapBatch"
    | "testCircleRectOverlapBatch"
  >;
}

export function testCircleRectOverlap(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) {
  const closestX = Math.max(rx, Math.min(rx + rw, cx));
  const closestY = Math.max(ry, Math.min(ry + rh, cy));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function resolveCollisionKernelWasmUrl(options: CollisionKernelWasmUrlOptions = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const base = String(baseUrl);
  const relativePath = base.includes("/src/wasm/") || base.includes("\\src\\wasm\\")
    ? "../../wasm/collision-kernel.wasm"
    : "../wasm/collision-kernel.wasm";
  return new URL(relativePath, baseUrl).href;
}

type NormalizedCollisionKernelOptions = {
  url: string;
  fetch: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
  scratchBytes?: number;
};

function normalizeScratchBytes(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WASM_ALLOCATION_BYTES) {
    throw new RangeError(`scratchBytes must be a non-negative safe integer no greater than ${MAX_WASM_ALLOCATION_BYTES}`);
  }
  return value;
}

function normalizeCollisionKernelOptions(input: string | CollisionKernelOptions = {}): NormalizedCollisionKernelOptions {
  if (typeof input === "string") {
    return { url: input, fetch: globalThis.fetch };
  }
  return {
    url: input.url ?? resolveCollisionKernelWasmUrl(),
    fetch: input.fetch ?? globalThis.fetch,
    onFallback: input.onFallback,
    scratchBytes: normalizeScratchBytes(input.scratchBytes)
  };
}

function reportFallback(
  listener: ((diagnostic: CollisionKernelFallbackDiagnostic) => void) | undefined,
  diagnostic: CollisionKernelFallbackDiagnostic
) {
  try {
    listener?.(diagnostic);
  } catch {
    // Diagnostics must not prevent the deterministic TypeScript fallback.
  }
}

export async function createCollisionKernel(options: string | CollisionKernelOptions = {}): Promise<CollisionKernel> {
  const { url, fetch: fetchWasm, onFallback, scratchBytes } = normalizeCollisionKernelOptions(options);
  try {
    const response = await fetchWasm(url);
    let exports: WebAssembly.Exports;
    try {
      const imports = { env: { abort() {} } };
      const instance = await instantiateWasmResponse(response, imports);
      exports = instance.instance.exports;
    } catch (error) {
      reportFallback(onFallback, { reason: "instantiate", url, error });
      return createTypescriptCollisionKernel();
    }
    const circleRect = exports.circle_rect_overlap;
    if (isCircleRectExport(circleRect)) {
      const batchBridge = createWasmBatchBridge(exports, scratchBytes);
      return {
        backend: "wasm",
        testOverlapRect,
        testOverlapCircle,
        pointInRect,
        circleRectOverlap(circle, rect) {
          return Boolean(circleRect(circle.x, circle.y, circle.r, rect.x, rect.y, rect.w, rect.h));
        },
        testCircleRectOverlap(cx, cy, radius, rx, ry, rw, rh) {
          return Boolean(circleRect(cx, cy, radius, rx, ry, rw, rh));
        },
        vecDistance,
        vecAngle,
        vecNormalize,
        rayIntersectMap,
        ...batchBridge
      };
    }
    reportFallback(onFallback, { reason: "missing-export", url });
  } catch (error) {
    reportFallback(onFallback, { reason: "fetch", url, error });
    // Static file hosting can omit the wasm artifact; the deterministic TS path remains authoritative.
  }

  return createTypescriptCollisionKernel();
}

async function instantiateWasmResponse(response: Response, imports: WebAssembly.Imports) {
  if (typeof WebAssembly.instantiateStreaming === "function" && response.headers.get("content-type") === "application/wasm") {
    try {
      return await WebAssembly.instantiateStreaming(Promise.resolve(response.clone()), imports);
    } catch {}
  }
  return await WebAssembly.instantiate(await response.arrayBuffer(), imports);
}

function createTypescriptCollisionKernel(): CollisionKernel {
  return {
    backend: "typescript",
    testOverlapRect,
    testOverlapCircle,
    pointInRect,
    circleRectOverlap,
    testCircleRectOverlap,
    vecDistance,
    vecAngle,
    vecNormalize,
    rayIntersectMap,
    integrateMovementBatch: integrateMovementFallback,
    rotatePointsBatch: rotatePointsFallback,
    rotateVectorsBatch: rotateVectorsFallback,
    rangeFilterBatch: rangeFilterFallback,
    predicateFilterMaskBatch: rangeFilterFallback,
    testRectOverlapBatch: testRectOverlapBatchFallback,
    testCircleRectOverlapBatch: testCircleRectOverlapBatchFallback
  };
}
