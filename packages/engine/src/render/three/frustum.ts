// Shared by scene view compilation and packet views; no hierarchy dependency.
const MATRIX_LENGTH = 16;
const PLANE_LENGTH = 4;
const FRUSTUM_PLANE_COUNT = 6;
const EPSILON = 1e-12;

export function createFrustumPlanes3D(): Float32Array {
  return new Float32Array(FRUSTUM_PLANE_COUNT * PLANE_LENGTH);
}

/** Plane order: left, right, bottom, top, near, far. */
export function extractFrustumPlanes3D(out: Float32Array, viewProjection: ArrayLike<number>): Float32Array {
  if (out.length < FRUSTUM_PLANE_COUNT * PLANE_LENGTH || viewProjection.length < MATRIX_LENGTH) {
    throw new RangeError("frustum extraction requires 24 output and 16 matrix elements.");
  }
  const rows = [0, 0, 1, 1, 2, 2] as const;
  const signs = [1, -1, 1, -1, 1, -1] as const;
  for (let plane = 0; plane < FRUSTUM_PLANE_COUNT; plane += 1) {
    const row = rows[plane];
    const sign = signs[plane];
    const nx = viewProjection[3] + sign * viewProjection[row];
    const ny = viewProjection[7] + sign * viewProjection[4 + row];
    const nz = viewProjection[11] + sign * viewProjection[8 + row];
    const d = viewProjection[15] + sign * viewProjection[12 + row];
    const length = Math.hypot(nx, ny, nz);
    if (length <= EPSILON) throw new RangeError(`frustum plane ${plane} is degenerate.`);
    const offset = plane * PLANE_LENGTH;
    out[offset] = nx / length;
    out[offset + 1] = ny / length;
    out[offset + 2] = nz / length;
    out[offset + 3] = d / length;
  }
  return out;
}
