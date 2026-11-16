type Vec = readonly [number, number, number];
type Box = { position: Vec; rotation: readonly [number, number, number, number]; scale: Vec };
/** Optional bulk owner. prepare borrows immutable targets until release; test
 * remains synchronous and preserves ordered-prefix semantics. The caller owns
 * backend selection, initialization and disposal outside the query loop. */
export type PreparedTargetRayQuery3D = {
  prepare(eye: Vec, aim: Vec, targets: readonly Vec[]): void;
  test(localEye: Vec, box: Box, count: number, padding: number): boolean;
  release(): void;
};
type Work = { queries: number; axisAlignedQueries: number; targetTests: number; quaternionTransforms: number; fallbacks: number };

/** Synchronous, allocation-free segment/box queries. Eye is already in box-local
 * coordinates; targets are world coordinates. Arrays are borrowed only for the
 * call. The strategy is selected once; general quaternion arithmetic remains the
 * reference for rotated and exceptional inputs. No gameplay state is retained.
 */
export function createTargetRayQuery3D(options: { strategy?: 'general' | 'axis-aligned'; diagnostics?: boolean } = {}) {
  if (options.strategy !== undefined && options.strategy !== 'general' && options.strategy !== 'axis-aligned') throw new TypeError('Unsupported target-ray strategy');
  const work: Work = { queries: 0, axisAlignedQueries: 0, targetTests: 0, quaternionTransforms: 0, fallbacks: 0 };
  const observed = options.diagnostics ? work : undefined;
  const test = options.strategy === 'axis-aligned' ? axisAligned : general;
  return {
    work,
    test(eye: Vec, targets: readonly Vec[], count: number, box: Box, padding: number) {
      if (!Number.isInteger(count) || count < 0 || count > targets.length) throw new RangeError('Invalid target prefix count');
      if (observed) observed.queries++;
      return test(eye, targets, count, box, padding, observed);
    },
    reset() { work.queries = work.axisAlignedQueries = work.targetTests = work.quaternionTransforms = work.fallbacks = 0; },
  };
}

/** Original leaf remains usable without diagnostics or factory allocation. */
export const anyTargetIntersects = general;

function axisAligned(eye: Vec, targets: readonly Vec[], count: number, box: Box, padding: number, work?: Work): boolean {
  if (box.rotation[0] !== 0 || box.rotation[1] !== 0 || box.rotation[2] !== 0 || !Number.isFinite(box.rotation[3])
    || !Number.isFinite(eye[0]) || !Number.isFinite(eye[1]) || !Number.isFinite(eye[2])) {
    if (work) work.fallbacks++;
    return general(eye, targets, count, box, padding, work);
  }
  if (work) work.axisAlignedQueries++;
  if (!count) return false;
  const ex = eye[0], ey = eye[1], ez = eye[2], hx = box.scale[0], hy = box.scale[1], hz = box.scale[2];
  if (Math.abs(ex) <= hx + padding && Math.abs(ey) <= hy + padding && Math.abs(ez) <= hz + padding) return true;
  const px = box.position[0], py = box.position[1], pz = box.position[2];
  const minX = -hx - padding - ex, maxX = hx + padding - ex;
  const minY = -hy - padding - ey, maxY = hy + padding - ey;
  const minZ = -hz - padding - ez, maxZ = hz + padding - ez;
  for (let index = 0; index < count; index++) {
    const target = targets[index]!, a = target[0] - px, b = target[1] - py, c = target[2] - pz;
    // Zero quaternion components multiplied by infinity produce NaN in the
    // reference. Preserve its result rather than assuming finite scene inputs.
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      if (work) { work.fallbacks++;work.targetTests += index; }
      return general(eye, targets, count, box, padding, work);
    }
    const dx = a - ex, dy = b - ey, dz = c - ez;
    let near = .015, far = .985;
    if (Math.abs(dx) < 1e-8) { if (Math.abs(ex) > hx + padding) continue; }
    else { const lo = minX / dx, hi = maxX / dx;near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));if (near > far) continue; }
    if (Math.abs(dy) < 1e-8) { if (Math.abs(ey) > hy + padding) continue; }
    else { const lo = minY / dy, hi = maxY / dy;near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));if (near > far) continue; }
    if (Math.abs(dz) < 1e-8) { if (Math.abs(ez) > hz + padding) continue; }
    else { const lo = minZ / dz, hi = maxZ / dz;near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));if (near > far) continue; }
    return record(work, true, index + 1, 0);
  }
  return record(work, false, count, 0);
}

/** Test one box against this call's sight samples. Hoist box invariants, preserving
 * the quaternion transform and slab arithmetic used by the single-ray oracle.
 * Inputs are borrowed synchronously; nothing is retained or allocated per ray.
 */
function general(eye: Vec, targets: readonly Vec[], count: number, box: Box, padding: number, work?: Work): boolean {
  if (!count) return false;
  const ex = eye[0], ey = eye[1], ez = eye[2], hx = box.scale[0], hy = box.scale[1], hz = box.scale[2];
  if (Math.abs(ex) <= hx + padding && Math.abs(ey) <= hy + padding && Math.abs(ez) <= hz + padding) return true;
  const x = -box.rotation[0], y = -box.rotation[1], z = -box.rotation[2], w = box.rotation[3];
  const px = box.position[0], py = box.position[1], pz = box.position[2];
  const minX = -hx - padding - ex, maxX = hx + padding - ex;
  const minY = -hy - padding - ey, maxY = hy + padding - ey;
  const minZ = -hz - padding - ez, maxZ = hz + padding - ez;
  for (let index = 0; index < count; index++) {
    const target = targets[index]!, a = target[0] - px, b = target[1] - py, c = target[2] - pz;
    const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
    const dx = (a + w * tx + y * tz - z * ty) - ex;
    const dy = (b + w * ty + z * tx - x * tz) - ey;
    const dz = (c + w * tz + x * ty - y * tx) - ez;
    let near = .015, far = .985;
    if (Math.abs(dx) < 1e-8) { if (Math.abs(ex) > hx + padding) continue; }
    else {
      const lo = minX / dx, hi = maxX / dx;
      near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));
      if (near > far) continue;
    }
    if (Math.abs(dy) < 1e-8) { if (Math.abs(ey) > hy + padding) continue; }
    else {
      const lo = minY / dy, hi = maxY / dy;
      near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));
      if (near > far) continue;
    }
    if (Math.abs(dz) < 1e-8) { if (Math.abs(ez) > hz + padding) continue; }
    else {
      const lo = minZ / dz, hi = maxZ / dz;
      near = Math.max(near, Math.min(lo, hi));far = Math.min(far, Math.max(lo, hi));
      if (near > far) continue;
    }
    return record(work, true, index + 1, index + 1);
  }
  return record(work, false, count, count);
}

function record(work: Work | undefined, result: boolean, targets: number, transforms: number) {
  if (work) { work.targetTests += targets;work.quaternionTransforms += transforms; }
  return result;
}
