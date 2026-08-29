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
  MovementBatch,
  RangeFilterBatch,
  RectRectBatch,
  RotationBatch
} from "../types.ts";
import {
  createNumericBatchSelector,
  type NumericBatchPolicy,
  type NumericBatchSelector,
  type ResolvedNumericBatchPolicy
} from "../runtime/numeric-batch-policy.ts";
import {
  createWasmMemoryArena,
  type MutableNumericArray,
  type WasmMemoryArena,
  type WasmMemoryLease
} from "./module-memory-arena.ts";

type CircleRectWasmExport = (cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number) => number;
type WasmBatchExport = (...args: number[]) => number | void;
type WasmAllocatorExport = (bytes: number) => number;

const MAX_BATCH_COUNT = 0x7fff_ffff;
const MAX_WASM_ALLOCATION_BYTES = 0x7fff_fff0;
const DEFAULT_FIXED_SCRATCH_BYTES = 64 * 1024;
const SIMD_PROBE = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
]);

export type CollisionKernelBackend = "wasm" | "typescript";
export type CollisionKernelWasmVariant = "scalar" | "simd" | "custom";
export type CollisionKernelWasmPreference = "auto" | "scalar" | "simd";
export type CollisionKernelScratchStrategy = "fixed" | "grow";

export type CollisionKernel = {
  backend: CollisionKernelBackend;
  wasmVariant?: CollisionKernelWasmVariant;
  batchPolicy: ResolvedNumericBatchPolicy;
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
  createResidentCircleRectBatch?: (batch: Omit<CircleRectBatch, "out">) => ResidentCircleRectBatch;
};

export type ResidentCircleRectBatch = {
  readonly count: number;
  readonly byteLength: number;
  readonly released: boolean;
  /** Replaces resident inputs outside the timed kernel loop. The batch count must stay fixed. */
  write(batch: Omit<CircleRectBatch, "out">): void;
  /** Runs directly against module-owned columns and leaves the mask resident. */
  run(): number;
  copyMask(target: MutableNumericArray): void;
  release(): void;
};

export type CollisionKernelWasmUrlOptions = {
  baseUrl?: string | URL;
  variant?: "compatibility" | Exclude<CollisionKernelWasmVariant, "custom">;
};

export type CollisionKernelFallbackReason =
  | "fetch"
  | "instantiate"
  | "missing-export";

export type CollisionKernelFallbackDiagnostic = {
  reason: CollisionKernelFallbackReason;
  url: string;
  variant?: CollisionKernelWasmVariant;
  error?: unknown;
};

export type CollisionKernelOptions = {
  url?: string;
  scalarUrl?: string;
  simdUrl?: string;
  variant?: CollisionKernelWasmPreference;
  fetch?: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
  /**
   * Reserve a fixed WASM scratch block while the kernel is created. Batch calls
   * that need more space fail instead of allocating inside the hot path.
   */
  scratchBytes?: number;
  /** Fixed is allocation-free after startup; grow preserves the unbounded compatibility path. */
  scratchStrategy?: CollisionKernelScratchStrategy;
  /**
   * Select the batch backend once per call. Auto keeps small batches in
   * TypeScript and crosses into WASM only at the configured minimum size.
   */
  batchPolicy?: NumericBatchPolicy;
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

function countCircleRectInput(name: string, batch: Omit<CircleRectBatch, "out">) {
  const count = resolveBatchCount(name, batch.count,
    Math.min(batch.cx.length, batch.cy.length, batch.radius.length, batch.rx.length,
      batch.ry.length, batch.rw.length, batch.rh.length));
  for (const [field, values] of [
    ["cx", batch.cx], ["cy", batch.cy], ["radius", batch.radius], ["rx", batch.rx],
    ["ry", batch.ry], ["rw", batch.rw], ["rh", batch.rh]
  ] as const) assertBatchLength(`${name}.${field}`, values, count);
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

function createWasmScratchArena(
  memory: WebAssembly.Memory | undefined,
  allocate: WasmAllocatorExport | undefined,
  initialScratchBytes: number,
  fixed: boolean
) {
  if (!memory || !allocate) return undefined;
  return createWasmMemoryArena({
    memory,
    allocate,
    initialCapacityBytes: initialScratchBytes,
    ...(fixed ? { fixedCapacityBytes: initialScratchBytes } : {}),
    maximumCapacityBytes: MAX_WASM_ALLOCATION_BYTES,
    growthFactor: 2,
    label: "WASM scratch"
  });
}

type WasmScratchArena = WasmMemoryArena;

function runRotationScratch(
  scratch: WasmScratchArena,
  rotate: WasmBatchExport,
  batch: RotationBatch,
  count: number
) {
  const stride = count * 4;
  const lease = scratch.lease(scratchByteLength("rotation", count, 4));
  try {
    lease.writeFloat32(stride * 0, batch.x, count);
    lease.writeFloat32(stride * 1, batch.y, count);
    rotate(
      lease.byteOffset + stride * 0,
      lease.byteOffset + stride * 1,
      lease.byteOffset + stride * 2,
      lease.byteOffset + stride * 3,
      Math.sin(batch.angle),
      Math.cos(batch.angle),
      count
    );
    lease.readFloat32(stride * 2, batch.outX, count);
    lease.readFloat32(stride * 3, batch.outY, count);
  } finally {
    lease.release();
  }
}

function leaseScratch(scratch: WasmScratchArena, byteLength: number): WasmMemoryLease {
  return scratch.lease(byteLength);
}

function createWasmBatchBridge(
  exports: WebAssembly.Exports,
  batchSelector: NumericBatchSelector,
  scratchBytes: number,
  scratchStrategy: CollisionKernelScratchStrategy
) {
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
  const scratch = createWasmScratchArena(memory, allocate, scratchBytes, scratchStrategy === "fixed");

  function createResidentCircleRectBatch(batch: Omit<CircleRectBatch, "out">): ResidentCircleRectBatch {
    if (!memory || !allocate || !circleRect) throw new Error("Resident circle/rect batches require WASM memory exports");
    const count = countCircleRectInput("residentCircleRectBatch", batch);
    const byteLength = scratchByteLength("residentCircleRectBatch", count, 7, 1);
    const arena = createWasmMemoryArena({
      memory,
      allocate,
      fixedCapacityBytes: byteLength,
      maximumCapacityBytes: byteLength,
      label: "resident collision batch"
    });
    const lease = arena.lease(byteLength);
    const stride = count * 4;
    const outOffset = stride * 7;
    let released = false;
    const assertActive = () => {
      if (released) throw new Error("Resident collision batch has been released");
    };
    const write = (next: Omit<CircleRectBatch, "out">) => {
      assertActive();
      const nextCount = countCircleRectInput("residentCircleRectBatch", next);
      if (nextCount !== count) throw new RangeError("Resident collision batch count cannot change");
      lease.writeFloat32(stride * 0, next.cx, count);
      lease.writeFloat32(stride * 1, next.cy, count);
      lease.writeFloat32(stride * 2, next.radius, count);
      lease.writeFloat32(stride * 3, next.rx, count);
      lease.writeFloat32(stride * 4, next.ry, count);
      lease.writeFloat32(stride * 5, next.rw, count);
      lease.writeFloat32(stride * 6, next.rh, count);
    };
    const resident: ResidentCircleRectBatch = {
      count,
      byteLength,
      get released() { return released; },
      write,
      run() {
        assertActive();
        return Number(circleRect(
          lease.byteOffset + stride * 0,
          lease.byteOffset + stride * 1,
          lease.byteOffset + stride * 2,
          lease.byteOffset + stride * 3,
          lease.byteOffset + stride * 4,
          lease.byteOffset + stride * 5,
          lease.byteOffset + stride * 6,
          lease.byteOffset + outOffset,
          count
        ));
      },
      copyMask(target) {
        assertActive();
        lease.readUint8(outOffset, target, count);
      },
      release() {
        if (released) return;
        released = true;
        lease.release();
      }
    };
    write(batch);
    return resident;
  }

  function runRangeFilter(batch: RangeFilterBatch) {
    assertFiniteScalar("rangeFilterBatch min", batch.min);
    assertFiniteScalar("rangeFilterBatch max", batch.max);
    const count = countBatch2("rangeFilterBatch", batch.count, batch.values, batch.out);
    if (batchSelector.backendFor(count, true, "range-filter") === "typescript") return rangeFilterFallback(batch);
    if (count === 0 || !scratch || !range) return rangeFilterFallback(batch);
    const lease = leaseScratch(scratch, scratchByteLength("rangeFilterBatch", count, 1, 1));
    try {
      lease.writeFloat32(0, batch.values, count);
      const outOffset = count * 4;
      const hits = Number(range(lease.byteOffset, batch.min, batch.max, lease.byteOffset + outOffset, count));
      lease.readUint8(outOffset, batch.out, count);
      return hits;
    } finally {
      lease.release();
    }
  }

  return {
    integrateMovementBatch(batch: MovementBatch) {
      assertFiniteScalar("integrateMovementBatch dt", batch.dt);
      const count = countBatch4("integrateMovementBatch", batch.count, batch.x, batch.y, batch.vx, batch.vy);
      if (batchSelector.backendFor(count, true, "movement") === "typescript") return integrateMovementFallback(batch);
      if (count === 0 || !scratch || !integrate) return integrateMovementFallback(batch);
      const stride = count * 4;
      const lease = leaseScratch(scratch, scratchByteLength("integrateMovementBatch", count, 4));
      try {
        lease.writeFloat32(stride * 0, batch.x, count);
        lease.writeFloat32(stride * 1, batch.y, count);
        lease.writeFloat32(stride * 2, batch.vx, count);
        lease.writeFloat32(stride * 3, batch.vy, count);
        integrate(
          lease.byteOffset + stride * 0,
          lease.byteOffset + stride * 1,
          lease.byteOffset + stride * 2,
          lease.byteOffset + stride * 3,
          batch.dt,
          count
        );
        lease.readFloat32(stride * 0, batch.x, count);
        lease.readFloat32(stride * 1, batch.y, count);
      } finally {
        lease.release();
      }
    },
    rotatePointsBatch(batch: RotationBatch) {
      assertFiniteScalar("rotatePointsBatch angle", batch.angle);
      const count = countBatch4("rotatePointsBatch", batch.count, batch.x, batch.y, batch.outX, batch.outY);
      if (batchSelector.backendFor(count, true, "rotation") === "typescript") return rotatePointsFallback(batch);
      if (count === 0 || !scratch || !rotate) return rotatePointsFallback(batch);
      runRotationScratch(scratch, rotate, batch, count);
    },
    rotateVectorsBatch(batch: RotationBatch) {
      assertFiniteScalar("rotateVectorsBatch angle", batch.angle);
      const count = countBatch4("rotateVectorsBatch", batch.count, batch.x, batch.y, batch.outX, batch.outY);
      if (batchSelector.backendFor(count, true, "rotation") === "typescript") return rotateVectorsFallback(batch);
      if (count === 0 || !scratch || !rotateVectors) return rotateVectorsFallback(batch);
      runRotationScratch(scratch, rotateVectors, batch, count);
    },
    ...(memory && allocate && circleRect ? { createResidentCircleRectBatch } : {}),
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
      if (batchSelector.backendFor(count, true, "rect-rect-overlap") === "typescript") {
        return testRectOverlapBatchFallback(batch);
      }
      if (count === 0 || !scratch || !rectRect) return testRectOverlapBatchFallback(batch);
      const stride = count * 4;
      const lease = leaseScratch(scratch, scratchByteLength("testRectOverlapBatch", count, 8, 1));
      try {
        lease.writeFloat32(stride * 0, batch.ax, count);
        lease.writeFloat32(stride * 1, batch.ay, count);
        lease.writeFloat32(stride * 2, batch.aw, count);
        lease.writeFloat32(stride * 3, batch.ah, count);
        lease.writeFloat32(stride * 4, batch.bx, count);
        lease.writeFloat32(stride * 5, batch.by, count);
        lease.writeFloat32(stride * 6, batch.bw, count);
        lease.writeFloat32(stride * 7, batch.bh, count);
        const outOffset = stride * 8;
        const hits = Number(
          rectRect(
            lease.byteOffset + stride * 0,
            lease.byteOffset + stride * 1,
            lease.byteOffset + stride * 2,
            lease.byteOffset + stride * 3,
            lease.byteOffset + stride * 4,
            lease.byteOffset + stride * 5,
            lease.byteOffset + stride * 6,
            lease.byteOffset + stride * 7,
            lease.byteOffset + outOffset,
            count
          )
        );
        lease.readUint8(outOffset, batch.out, count);
        return hits;
      } finally {
        lease.release();
      }
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
      if (batchSelector.backendFor(count, true, "circle-rect-overlap") === "typescript") {
        return testCircleRectOverlapBatchFallback(batch);
      }
      if (count === 0 || !scratch || !circleRect) return testCircleRectOverlapBatchFallback(batch);
      const stride = count * 4;
      const lease = leaseScratch(scratch, scratchByteLength("testCircleRectOverlapBatch", count, 7, 1));
      try {
        lease.writeFloat32(stride * 0, batch.cx, count);
        lease.writeFloat32(stride * 1, batch.cy, count);
        lease.writeFloat32(stride * 2, batch.radius, count);
        lease.writeFloat32(stride * 3, batch.rx, count);
        lease.writeFloat32(stride * 4, batch.ry, count);
        lease.writeFloat32(stride * 5, batch.rw, count);
        lease.writeFloat32(stride * 6, batch.rh, count);
        const outOffset = stride * 7;
        const hits = Number(
          circleRect(
            lease.byteOffset + stride * 0,
            lease.byteOffset + stride * 1,
            lease.byteOffset + stride * 2,
            lease.byteOffset + stride * 3,
            lease.byteOffset + stride * 4,
            lease.byteOffset + stride * 5,
            lease.byteOffset + stride * 6,
            lease.byteOffset + outOffset,
            count
          )
        );
        lease.readUint8(outOffset, batch.out, count);
        return hits;
      } finally {
        lease.release();
      }
    }
  };
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
  const suffix = options.variant === "scalar"
    ? ".scalar"
    : options.variant === "simd"
      ? ".simd"
      : "";
  const relativePath = base.includes("/src/wasm/") || base.includes("\\src\\wasm\\")
    ? `../../wasm/collision-kernel${suffix}.wasm`
    : `../wasm/collision-kernel${suffix}.wasm`;
  return new URL(relativePath, baseUrl).href;
}

type NormalizedCollisionKernelOptions = {
  candidates: readonly { url: string; variant: CollisionKernelWasmVariant }[];
  fetch: typeof fetch;
  onFallback?: (diagnostic: CollisionKernelFallbackDiagnostic) => void;
  scratchBytes: number;
  scratchStrategy: CollisionKernelScratchStrategy;
  batchSelector: NumericBatchSelector;
};

function normalizeScratchBytes(value: number | undefined, strategy: CollisionKernelScratchStrategy) {
  if (value === undefined) return strategy === "fixed" ? DEFAULT_FIXED_SCRATCH_BYTES : 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WASM_ALLOCATION_BYTES) {
    throw new RangeError(`Invalid scratchBytes; expected 0..${MAX_WASM_ALLOCATION_BYTES}`);
  }
  return value;
}

function normalizeCollisionKernelOptions(input: string | CollisionKernelOptions = {}): NormalizedCollisionKernelOptions {
  if (typeof input === "string") {
    return {
      candidates: [{ url: input, variant: "custom" }],
      fetch: globalThis.fetch,
      scratchBytes: DEFAULT_FIXED_SCRATCH_BYTES,
      scratchStrategy: "fixed",
      batchSelector: createNumericBatchSelector()
    };
  }
  const scratchStrategy = input.scratchStrategy ?? "fixed";
  if (scratchStrategy !== "fixed" && scratchStrategy !== "grow") {
    throw new RangeError(`Invalid scratchStrategy: ${String(scratchStrategy)}`);
  }
  return {
    candidates: resolveWasmCandidates(input),
    fetch: input.fetch ?? globalThis.fetch,
    onFallback: input.onFallback,
    scratchBytes: normalizeScratchBytes(input.scratchBytes, scratchStrategy),
    scratchStrategy,
    batchSelector: createNumericBatchSelector(input.batchPolicy)
  };
}

function resolveWasmCandidates(input: CollisionKernelOptions) {
  if (input.url) return [{ url: input.url, variant: "custom" }] as const;
  const preference = input.variant ?? "auto";
  if (preference !== "auto" && preference !== "scalar" && preference !== "simd") {
    throw new RangeError(`Invalid collision kernel variant: ${String(preference)}`);
  }
  const scalar = { url: input.scalarUrl ?? resolveCollisionKernelWasmUrl({ variant: "scalar" }), variant: "scalar" as const };
  const simd = { url: input.simdUrl ?? resolveCollisionKernelWasmUrl({ variant: "simd" }), variant: "simd" as const };
  if (preference === "scalar") return [scalar];
  if (preference === "simd") return [simd];
  return supportsWasmSimd() ? [simd, scalar] : [scalar];
}

export function supportsWasmSimd() {
  return typeof WebAssembly.validate === "function" && WebAssembly.validate(SIMD_PROBE);
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
  const normalized = normalizeCollisionKernelOptions(options);
  const { fetch: fetchWasm, onFallback, scratchBytes, scratchStrategy, batchSelector } = normalized;
  for (const candidate of normalized.candidates) {
    const { url, variant } = candidate;
    let response: Response;
    try {
      response = await fetchWasm(url);
    } catch (error) {
      reportFallback(onFallback, { reason: "fetch", url, variant, error });
      continue;
    }
    let exports: WebAssembly.Exports;
    try {
      const instance = await instantiateWasmResponse(response, { env: { abort() {} } });
      exports = instance.instance.exports;
    } catch (error) {
      reportFallback(onFallback, { reason: "instantiate", url, variant, error });
      continue;
    }
    const circleRect = exports.circle_rect_overlap;
    if (isCircleRectExport(circleRect)) {
      const batchBridge = createWasmBatchBridge(exports, batchSelector, scratchBytes, scratchStrategy);
      return {
        backend: "wasm",
        wasmVariant: variant,
        batchPolicy: batchSelector.policy,
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
    reportFallback(onFallback, { reason: "missing-export", url, variant });
  }

  return createTypescriptCollisionKernel(batchSelector.policy);
}

async function instantiateWasmResponse(response: Response, imports: WebAssembly.Imports) {
  if (typeof WebAssembly.instantiateStreaming === "function" && response.headers.get("content-type") === "application/wasm") {
    try {
      return await WebAssembly.instantiateStreaming(Promise.resolve(response.clone()), imports);
    } catch {}
  }
  return await WebAssembly.instantiate(await response.arrayBuffer(), imports);
}

function createTypescriptCollisionKernel(batchPolicy = createNumericBatchSelector().policy): CollisionKernel {
  return {
    backend: "typescript",
    batchPolicy,
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
