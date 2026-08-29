export type MotionVec3 = readonly [number, number, number];
export type MotionQuaternion = readonly [number, number, number, number];
export type MutableMotionVector = Float32Array | number[];

const QUATERNION_EPSILON = 1e-12;

function assertOutputLength(out: MutableMotionVector, length: number, label: string) {
  if (out.length < length) throw new RangeError(`${label} output must contain at least ${length} values`);
}

function assertInputLength(input: ArrayLike<number>, length: number, label: string) {
  if (input.length < length) throw new RangeError(`${label} input must contain at least ${length} values`);
}

export function isFiniteVector3(input: ArrayLike<number>): boolean {
  return input.length >= 3 && Number.isFinite(input[0]) && Number.isFinite(input[1]) && Number.isFinite(input[2]);
}

export function isFiniteQuaternion(input: ArrayLike<number>): boolean {
  return input.length >= 4
    && Number.isFinite(input[0])
    && Number.isFinite(input[1])
    && Number.isFinite(input[2])
    && Number.isFinite(input[3]);
}

export function quaternionLengthSquared(input: ArrayLike<number>): number {
  assertInputLength(input, 4, "quaternion");
  return input[0] * input[0] + input[1] * input[1] + input[2] * input[2] + input[3] * input[3];
}

export function isNormalizedQuaternion(input: ArrayLike<number>, tolerance = 1e-4): boolean {
  if (!isFiniteQuaternion(input)) return false;
  const safeTolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 1e-4;
  return Math.abs(quaternionLengthSquared(input) - 1) <= safeTolerance;
}

export function setVector3(out: MutableMotionVector, x: number, y: number, z: number): MutableMotionVector {
  assertOutputLength(out, 3, "vector");
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copyVector3(input: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 3, "vector");
  return setVector3(out, input[0], input[1], input[2]);
}

export function addVector3(a: ArrayLike<number>, b: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(a, 3, "vector a");
  assertInputLength(b, 3, "vector b");
  return setVector3(out, a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

export function subtractVector3(a: ArrayLike<number>, b: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(a, 3, "vector a");
  assertInputLength(b, 3, "vector b");
  return setVector3(out, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function scaleVector3(input: ArrayLike<number>, scalar: number, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 3, "vector");
  return setVector3(out, input[0] * scalar, input[1] * scalar, input[2] * scalar);
}

export function dotVector3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  assertInputLength(a, 3, "vector a");
  assertInputLength(b, 3, "vector b");
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function crossVector3(a: ArrayLike<number>, b: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(a, 3, "vector a");
  assertInputLength(b, 3, "vector b");
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  return setVector3(out, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

export function vector3LengthSquared(input: ArrayLike<number>): number {
  return dotVector3(input, input);
}

export function vector3Length(input: ArrayLike<number>): number {
  return Math.sqrt(vector3LengthSquared(input));
}

export function normalizeVector3(input: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 3, "vector");
  const lengthSquared = vector3LengthSquared(input);
  if (!Number.isFinite(lengthSquared) || lengthSquared <= QUATERNION_EPSILON) {
    throw new RangeError("vector must be finite and have non-zero length");
  }
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return setVector3(out, input[0] * inverseLength, input[1] * inverseLength, input[2] * inverseLength);
}

export function setQuaternion(
  out: MutableMotionVector,
  x: number,
  y: number,
  z: number,
  w: number,
): MutableMotionVector {
  assertOutputLength(out, 4, "quaternion");
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

export function identityQuaternion(out: MutableMotionVector): MutableMotionVector {
  return setQuaternion(out, 0, 0, 0, 1);
}

export function copyQuaternion(input: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 4, "quaternion");
  return setQuaternion(out, input[0], input[1], input[2], input[3]);
}

export function normalizeQuaternion(input: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 4, "quaternion");
  assertOutputLength(out, 4, "quaternion");
  const lengthSquared = quaternionLengthSquared(input);
  if (!Number.isFinite(lengthSquared) || lengthSquared <= QUATERNION_EPSILON) {
    throw new RangeError("quaternion must be finite and have non-zero length");
  }
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return setQuaternion(
    out,
    input[0] * inverseLength,
    input[1] * inverseLength,
    input[2] * inverseLength,
    input[3] * inverseLength,
  );
}

export function multiplyQuaternions(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  out: MutableMotionVector,
): MutableMotionVector {
  assertInputLength(a, 4, "quaternion a");
  assertInputLength(b, 4, "quaternion b");
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  return setQuaternion(
    out,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

export function invertQuaternion(input: ArrayLike<number>, out: MutableMotionVector): MutableMotionVector {
  assertInputLength(input, 4, "quaternion");
  const lengthSquared = quaternionLengthSquared(input);
  if (!Number.isFinite(lengthSquared) || lengthSquared <= QUATERNION_EPSILON) {
    throw new RangeError("quaternion must be finite and have non-zero length");
  }
  const inverseLengthSquared = 1 / lengthSquared;
  return setQuaternion(
    out,
    -input[0] * inverseLengthSquared,
    -input[1] * inverseLengthSquared,
    -input[2] * inverseLengthSquared,
    input[3] * inverseLengthSquared,
  );
}

export function quaternionFromAxisAngle(
  axis: ArrayLike<number>,
  angleRadians: number,
  out: MutableMotionVector,
): MutableMotionVector {
  assertInputLength(axis, 3, "axis");
  if (!Number.isFinite(angleRadians)) throw new RangeError("axis angle must be finite");
  const lengthSquared = vector3LengthSquared(axis);
  if (!Number.isFinite(lengthSquared) || lengthSquared <= QUATERNION_EPSILON) {
    throw new RangeError("axis must be finite and have non-zero length");
  }
  const halfAngle = angleRadians * 0.5;
  const scale = Math.sin(halfAngle) / Math.sqrt(lengthSquared);
  return setQuaternion(out, axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(halfAngle));
}

export function quaternionFromUnitVectors(
  from: ArrayLike<number>,
  to: ArrayLike<number>,
  out: MutableMotionVector,
): MutableMotionVector {
  assertInputLength(from, 3, "from vector");
  assertInputLength(to, 3, "to vector");
  if (!isFiniteVector3(from) || !isFiniteVector3(to)) throw new RangeError("unit vectors must be finite");
  let w = dotVector3(from, to) + 1;
  if (w < 1e-6) {
    w = 0;
    if (Math.abs(from[0]) > Math.abs(from[2])) {
      setQuaternion(out, -from[1], from[0], 0, w);
    } else {
      setQuaternion(out, 0, -from[2], from[1], w);
    }
  } else {
    setQuaternion(
      out,
      from[1] * to[2] - from[2] * to[1],
      from[2] * to[0] - from[0] * to[2],
      from[0] * to[1] - from[1] * to[0],
      w,
    );
  }
  return normalizeQuaternion(out, out);
}

export function rotateVector3ByQuaternion(
  vector: ArrayLike<number>,
  quaternion: ArrayLike<number>,
  out: MutableMotionVector,
): MutableMotionVector {
  assertInputLength(vector, 3, "vector");
  assertInputLength(quaternion, 4, "quaternion");
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  const qx = quaternion[0];
  const qy = quaternion[1];
  const qz = quaternion[2];
  const qw = quaternion[3];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return setVector3(
    out,
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  );
}

export function slerpQuaternions(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  ratio: number,
  out: MutableMotionVector,
): MutableMotionVector {
  assertInputLength(a, 4, "quaternion a");
  assertInputLength(b, 4, "quaternion b");
  const t = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let cosine = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cosine > 0.9995) {
    setQuaternion(
      out,
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    );
    return normalizeQuaternion(out, out);
  }
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const sinAngle = Math.sin(angle);
  const aWeight = Math.sin((1 - t) * angle) / sinAngle;
  const bWeight = Math.sin(t * angle) / sinAngle;
  return setQuaternion(
    out,
    a[0] * aWeight + bx * bWeight,
    a[1] * aWeight + by * bWeight,
    a[2] * aWeight + bz * bWeight,
    a[3] * aWeight + bw * bWeight,
  );
}
