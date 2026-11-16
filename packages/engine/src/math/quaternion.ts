/** Caller owns normalization and validation. Returns a fresh vector. */
export function rotateQuaternionVector3(rotation: readonly [number, number, number, number], value: readonly [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = rotation, [x, y, z] = value;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

export function conjugateQuaternion(value: readonly [number, number, number, number]): [number, number, number, number] {
  return [-value[0], -value[1], -value[2], value[3]];
}

/** Native presentation math; deterministic simulation keeps its own norm policy. */
export function multiplyNormalizedQuaternions(a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number, number] {
  const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
  const y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
  const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
  const w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  const inverse = 1 / Math.max(1e-12, Math.hypot(x, y, z, w));
  return [x * inverse, y * inverse, z * inverse, w * inverse];
}
