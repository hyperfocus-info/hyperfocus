import { requireCapacity, requireFinite } from "./validation/core-3d.ts";
export { createFrustumPlanes3D, extractFrustumPlanes3D } from "./three/frustum.ts";
/**
 * Dependency-free, data-oriented 3D foundation.
 *
 * Matrices are column-major, coordinates are right-handed, and projection
 * matrices use the WebGL/OpenGL -1..1 clip-space depth range.
 */

export type Vector3Input =
  | ArrayLike<number>
  | Readonly<{ x: number; y: number; z: number }>;

export type QuaternionInput =
  | ArrayLike<number>
  | Readonly<{ x: number; y: number; z: number; w: number }>;

export interface PerspectiveProjection3D {
  fovYRadians: number;
  aspect: number;
  near: number;
  far: number;
}

export interface OrthographicProjection3D {
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
}

export interface InstanceSphereBounds3D {
  /** Packed xyz centers. */
  centers: ArrayLike<number>;
  radii: ArrayLike<number>;
  /** Defaults to radii.length. */
  count?: number;
  /** Zero hides an instance; any other value enables it. */
  enabled?: ArrayLike<number>;
}

export interface InstanceVisibilityBuffer3D {
  /** Original instance indexes, in input order. */
  readonly indices: Uint32Array;
  count: number;
  tested: number;
  visible: number;
  truncated: number;
}

const MATRIX_LENGTH = 16;
const PLANE_LENGTH = 4;
const FRUSTUM_PLANE_COUNT = 6;
const EPSILON = 1e-12;





function isCartesianVector3(value: Vector3Input): value is Readonly<{ x: number; y: number; z: number }> {
  return "x" in value;
}

function vector3Component(value: Vector3Input, index: number, key: "x" | "y" | "z"): number {
  const component = isCartesianVector3(value) ? value[key] : value[index];
  return requireFinite(component, `vector.${key}`);
}

function isCartesianQuaternion(
  value: QuaternionInput
): value is Readonly<{ x: number; y: number; z: number; w: number }> {
  return "x" in value;
}

function quaternionComponent(
  value: QuaternionInput,
  index: number,
  key: "x" | "y" | "z" | "w"
): number {
  const component = isCartesianQuaternion(value) ? value[key] : value[index];
  return requireFinite(component, `quaternion.${key}`);
}

function requireMatrix(out: Float32Array, label: string): Float32Array {
  if (out.length < MATRIX_LENGTH) {
    throw new RangeError(`${label} needs at least 16 elements; received ${out.length}.`);
  }
  return out;
}

export function createMat4(): Float32Array {
  return identityMat4(new Float32Array(MATRIX_LENGTH));
}

export function identityMat4(out: Float32Array): Float32Array {
  requireMatrix(out, "out");
  out.fill(0, 0, MATRIX_LENGTH);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

/** Writes out = a * b. Safe when out aliases either input. */
export function multiplyMat4(
  out: Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  aOffset = 0,
  bOffset = 0,
  outOffset = 0
): Float32Array {
  if (a.length - aOffset < MATRIX_LENGTH || b.length - bOffset < MATRIX_LENGTH || out.length - outOffset < MATRIX_LENGTH) {
    throw new RangeError("multiplyMat4 requires 16 readable and writable elements at the supplied offsets.");
  }

  const a00 = a[aOffset], a01 = a[aOffset + 1], a02 = a[aOffset + 2], a03 = a[aOffset + 3];
  const a10 = a[aOffset + 4], a11 = a[aOffset + 5], a12 = a[aOffset + 6], a13 = a[aOffset + 7];
  const a20 = a[aOffset + 8], a21 = a[aOffset + 9], a22 = a[aOffset + 10], a23 = a[aOffset + 11];
  const a30 = a[aOffset + 12], a31 = a[aOffset + 13], a32 = a[aOffset + 14], a33 = a[aOffset + 15];
  const b00 = b[bOffset], b01 = b[bOffset + 1], b02 = b[bOffset + 2], b03 = b[bOffset + 3];
  const b10 = b[bOffset + 4], b11 = b[bOffset + 5], b12 = b[bOffset + 6], b13 = b[bOffset + 7];
  const b20 = b[bOffset + 8], b21 = b[bOffset + 9], b22 = b[bOffset + 10], b23 = b[bOffset + 11];
  const b30 = b[bOffset + 12], b31 = b[bOffset + 13], b32 = b[bOffset + 14], b33 = b[bOffset + 15];

  out[outOffset] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[outOffset + 1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[outOffset + 2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[outOffset + 3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
  out[outOffset + 4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[outOffset + 5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[outOffset + 6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[outOffset + 7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
  out[outOffset + 8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[outOffset + 9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[outOffset + 10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[outOffset + 11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
  out[outOffset + 12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[outOffset + 13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[outOffset + 14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[outOffset + 15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  return out;
}

export function composeMat4FromTrs(
  out: Float32Array,
  position: Vector3Input,
  rotation: QuaternionInput,
  scale: Vector3Input
): Float32Array {
  requireMatrix(out, "out");
  composeTrsValues(
    out,
    0,
    vector3Component(position, 0, "x"),
    vector3Component(position, 1, "y"),
    vector3Component(position, 2, "z"),
    quaternionComponent(rotation, 0, "x"),
    quaternionComponent(rotation, 1, "y"),
    quaternionComponent(rotation, 2, "z"),
    quaternionComponent(rotation, 3, "w"),
    vector3Component(scale, 0, "x"),
    vector3Component(scale, 1, "y"),
    vector3Component(scale, 2, "z")
  );
  return out;
}

function composeTrsValues(
  out: Float32Array,
  offset: number,
  px: number,
  py: number,
  pz: number,
  x: number,
  y: number,
  z: number,
  w: number,
  sx: number,
  sy: number,
  sz: number
): void {
  const length = Math.hypot(x, y, z, w);
  if (length <= EPSILON) throw new RangeError("rotation quaternion must have non-zero length.");
  const inverseLength = 1 / length;
  const qx = x * inverseLength, qy = y * inverseLength, qz = z * inverseLength, qw = w * inverseLength;
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  out[offset] = (1 - yy - zz) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - xx - zz) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - xx - yy) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = px;
  out[offset + 13] = py;
  out[offset + 14] = pz;
  out[offset + 15] = 1;
}

export function perspectiveMat4(out: Float32Array, projection: PerspectiveProjection3D): Float32Array {
  requireMatrix(out, "out");
  const { fovYRadians, aspect, near, far } = projection;
  requireFinite(fovYRadians, "fovYRadians");
  requireFinite(aspect, "aspect");
  requireFinite(near, "near");
  requireFinite(far, "far");
  if (fovYRadians <= 0 || fovYRadians >= Math.PI) throw new RangeError("fovYRadians must be between 0 and PI.");
  if (aspect <= 0) throw new RangeError("aspect must be greater than zero.");
  if (near <= 0 || far <= near) throw new RangeError("projection requires 0 < near < far.");
  const f = 1 / Math.tan(fovYRadians / 2);
  out.fill(0, 0, MATRIX_LENGTH);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function orthographicMat4(out: Float32Array, projection: OrthographicProjection3D): Float32Array {
  requireMatrix(out, "out");
  const { left, right, bottom, top, near, far } = projection;
  for (const [label, value] of [["left", left], ["right", right], ["bottom", bottom], ["top", top], ["near", near], ["far", far]] as const) {
    requireFinite(value, label);
  }
  if (right === left || top === bottom || far === near) throw new RangeError("orthographic bounds must have non-zero extents.");
  out.fill(0, 0, MATRIX_LENGTH);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function lookAtViewMat4(
  out: Float32Array,
  eye: Vector3Input,
  target: Vector3Input,
  up: Vector3Input = [0, 1, 0]
): Float32Array {
  requireMatrix(out, "out");
  const ex = vector3Component(eye, 0, "x"), ey = vector3Component(eye, 1, "y"), ez = vector3Component(eye, 2, "z");
  const tx = vector3Component(target, 0, "x"), ty = vector3Component(target, 1, "y"), tz = vector3Component(target, 2, "z");
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let length = Math.hypot(zx, zy, zz);
  if (length <= EPSILON) throw new RangeError("lookAt eye and target must be different points.");
  zx /= length; zy /= length; zz /= length;
  const ux = vector3Component(up, 0, "x"), uy = vector3Component(up, 1, "y"), uz = vector3Component(up, 2, "z");
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  length = Math.hypot(xx, xy, xz);
  if (length <= EPSILON) throw new RangeError("lookAt up vector must not be parallel to the viewing direction.");
  xx /= length; xy /= length; xz /= length;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

export function sphereIntersectsFrustum3D(
  planes: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  radius: number
): boolean {
  if (planes.length < FRUSTUM_PLANE_COUNT * PLANE_LENGTH) throw new RangeError("frustum planes need 24 elements.");
  requireFinite(x, "x"); requireFinite(y, "y"); requireFinite(z, "z"); requireFinite(radius, "radius");
  if (radius < 0) throw new RangeError("radius must be non-negative.");
  for (let offset = 0; offset < FRUSTUM_PLANE_COUNT * PLANE_LENGTH; offset += PLANE_LENGTH) {
    if (planes[offset] * x + planes[offset + 1] * y + planes[offset + 2] * z + planes[offset + 3] < -radius) return false;
  }
  return true;
}

export function aabbIntersectsFrustum3D(
  planes: ArrayLike<number>,
  min: Vector3Input,
  max: Vector3Input
): boolean {
  if (planes.length < FRUSTUM_PLANE_COUNT * PLANE_LENGTH) throw new RangeError("frustum planes need 24 elements.");
  const minX = vector3Component(min, 0, "x"), minY = vector3Component(min, 1, "y"), minZ = vector3Component(min, 2, "z");
  const maxX = vector3Component(max, 0, "x"), maxY = vector3Component(max, 1, "y"), maxZ = vector3Component(max, 2, "z");
  if (minX > maxX || minY > maxY || minZ > maxZ) throw new RangeError("AABB minimum must not exceed its maximum.");
  for (let offset = 0; offset < FRUSTUM_PLANE_COUNT * PLANE_LENGTH; offset += PLANE_LENGTH) {
    const nx = planes[offset], ny = planes[offset + 1], nz = planes[offset + 2];
    const x = nx >= 0 ? maxX : minX, y = ny >= 0 ? maxY : minY, z = nz >= 0 ? maxZ : minZ;
    if (nx * x + ny * y + nz * z + planes[offset + 3] < 0) return false;
  }
  return true;
}

export function createInstanceVisibilityBuffer3D(capacity: number): InstanceVisibilityBuffer3D {
  return { indices: new Uint32Array(requireCapacity(capacity, "capacity")), count: 0, tested: 0, visible: 0, truncated: 0 };
}

export function collectVisibleInstanceSpheres3D(
  planes: ArrayLike<number>,
  bounds: InstanceSphereBounds3D,
  out: InstanceVisibilityBuffer3D
): InstanceVisibilityBuffer3D {
  const count = bounds.count ?? bounds.radii.length;
  requireCapacity(count, "bounds.count");
  if (bounds.centers.length < count * 3) throw new RangeError(`centers needs ${count * 3} elements for ${count} instances.`);
  if (bounds.radii.length < count) throw new RangeError(`radii needs ${count} elements.`);
  if (bounds.enabled && bounds.enabled.length < count) throw new RangeError(`enabled needs ${count} elements.`);
  out.count = 0; out.tested = 0; out.visible = 0; out.truncated = 0;
  for (let index = 0; index < count; index += 1) {
    if (bounds.enabled && bounds.enabled[index] === 0) continue;
    const center = index * 3;
    out.tested += 1;
    if (!sphereIntersectsFrustum3D(planes, bounds.centers[center], bounds.centers[center + 1], bounds.centers[center + 2], bounds.radii[index])) continue;
    out.visible += 1;
    if (out.count < out.indices.length) out.indices[out.count++] = index;
  }
  out.truncated = out.visible - out.count;
  return out;
}

export type TransformHierarchy3D = {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly parents: Int32Array;
  readonly positions: Float32Array;
  readonly rotations: Float32Array;
  readonly scales: Float32Array;
  readonly localMatrices: Float32Array;
  readonly worldMatrices: Float32Array;
  readonly count: number;
  create(parent?: number): number;
  destroy(index: number): void;
  setParent(index: number, parent: number): void;
  setPosition(index: number, x: number, y: number, z: number): void;
  setScale(index: number, x: number, y: number, z: number): void;
  setRotationQuaternion(index: number, x: number, y: number, z: number, w: number): void;
  /** Same input/liveness checks as the setters, without renderer storage writes. */
  validateTrs(index: number, position: ArrayLike<number>, rotation: ArrayLike<number>, scale: ArrayLike<number>): void;
  /** Live handle assertion when an exclusive owner already validated numeric input. */
  assertActive(index: number): void;
  updateWorldMatrices(): number;
  copyWorldMatrix(index: number, out: Float32Array): Float32Array;
};

type TransformHierarchy3DFactory = {
  (capacity: number): TransformHierarchy3D;
  new(capacity: number): TransformHierarchy3D;
  readonly prototype: object;
};

const transformHierarchy3DPrototype = {};

export function createTransformHierarchy3D(capacity: number): TransformHierarchy3D {
  capacity = requireCapacity(capacity, "capacity");
  const active = new Uint8Array(capacity);
  const parents = new Int32Array(capacity); parents.fill(-1);
  const positions = new Float32Array(capacity * 3);
  const rotations = new Float32Array(capacity * 4);
  const scales = new Float32Array(capacity * 3);
  const localMatrices = new Float32Array(capacity * MATRIX_LENGTH);
  const worldMatrices = new Float32Array(capacity * MATRIX_LENGTH);
  const dirty = new Uint8Array(capacity);
  const firstChild = new Int32Array(capacity); firstChild.fill(-1);
  const nextSibling = new Int32Array(capacity); nextSibling.fill(-1);
  const previousSibling = new Int32Array(capacity); previousSibling.fill(-1);
  const freeSlots = new Int32Array(capacity);
  const stack = new Int32Array(capacity);
  for (let index = 0; index < capacity; index += 1) freeSlots[index] = capacity - index - 1;
  let freeCount = capacity;
  let count = 0;

  const requireActive = (index: number, label: string): void => {
    if (!Number.isInteger(index) || index < 0 || index >= capacity || active[index] === 0) {
      throw new RangeError(`${label} ${index} is not an active transform.`);
    }
  };
  const validateVector = (index: number, x: number, y: number, z: number) => {
    requireActive(index, "transform");
    requireFinite(x, "x");requireFinite(y, "y");requireFinite(z, "z");
  };
  const validateQuaternion = (index: number, x: number, y: number, z: number, w: number) => {
    requireActive(index, "transform");
    requireFinite(x, "x");requireFinite(y, "y");requireFinite(z, "z");requireFinite(w, "w");
    const length = Math.hypot(x, y, z, w);
    if (length <= EPSILON) throw new RangeError("rotation quaternion must have non-zero length.");
    return length;
  };
  const unlink = (index: number): void => {
    const parent = parents[index];
    const previous = previousSibling[index], next = nextSibling[index];
    if (previous !== -1) nextSibling[previous] = next;
    else if (parent !== -1) firstChild[parent] = next;
    if (next !== -1) previousSibling[next] = previous;
    parents[index] = -1; previousSibling[index] = -1; nextSibling[index] = -1;
  };
  const link = (index: number, parent: number): void => {
    const first = firstChild[parent];
    parents[index] = parent;
    nextSibling[index] = first;
    previousSibling[index] = -1;
    if (first !== -1) previousSibling[first] = index;
    firstChild[parent] = index;
  };
  const markSubtreeDirty = (root: number): void => {
    let length = 1;
    stack[0] = root;
    while (length > 0) {
      const index = stack[--length];
      dirty[index] = 1;
      let child = firstChild[index];
      while (child !== -1) {
        stack[length++] = child;
        child = nextSibling[child];
      }
    }
  };

  const hierarchy: TransformHierarchy3D = {
    capacity,
    active,
    parents,
    positions,
    rotations,
    scales,
    localMatrices,
    worldMatrices,
    get count() { return count; },
    create(parent = -1) {
      if (freeCount === 0) throw new RangeError(`transform hierarchy capacity ${capacity} is exhausted.`);
      if (parent !== -1) requireActive(parent, "parent");
      const index = freeSlots[--freeCount];
      active[index] = 1;
      dirty[index] = 1;
      positions.fill(0, index * 3, index * 3 + 3);
      rotations.fill(0, index * 4, index * 4 + 4); rotations[index * 4 + 3] = 1;
      scales.fill(1, index * 3, index * 3 + 3);
      parents[index] = -1;
      firstChild[index] = -1; nextSibling[index] = -1; previousSibling[index] = -1;
      count += 1;
      if (parent !== -1) link(index, parent);
      return index;
    },
    destroy(index) {
      requireActive(index, "transform");
      if (firstChild[index] !== -1) throw new Error(`transform ${index} has children and cannot be destroyed.`);
      unlink(index);
      active[index] = 0; dirty[index] = 0; parents[index] = -1;
      freeSlots[freeCount++] = index;
      count -= 1;
    },
    setParent(index, parent) {
      requireActive(index, "transform");
      if (parent !== -1) requireActive(parent, "parent");
      if (index === parent) throw new Error(`transform ${index} cannot parent itself.`);
      let ancestor = parent;
      while (ancestor !== -1) {
        if (ancestor === index) throw new Error(`parenting transform ${index} to ${parent} would create a cycle.`);
        ancestor = parents[ancestor];
      }
      if (parents[index] === parent) return;
      unlink(index);
      if (parent !== -1) link(index, parent);
      markSubtreeDirty(index);
    },
    setPosition(index, x, y, z) {
      validateVector(index, x, y, z);
      const offset = index * 3;
      x = Math.fround(x);y = Math.fround(y);z = Math.fround(z);
      if (Object.is(positions[offset], x) && Object.is(positions[offset + 1], y) && Object.is(positions[offset + 2], z)) return;
      positions[offset] = x; positions[offset + 1] = y; positions[offset + 2] = z;
      markSubtreeDirty(index);
    },
    setScale(index, x, y, z) {
      validateVector(index, x, y, z);
      const offset = index * 3;
      x = Math.fround(x);y = Math.fround(y);z = Math.fround(z);
      if (Object.is(scales[offset], x) && Object.is(scales[offset + 1], y) && Object.is(scales[offset + 2], z)) return;
      scales[offset] = x; scales[offset + 1] = y; scales[offset + 2] = z;
      markSubtreeDirty(index);
    },
    setRotationQuaternion(index, x, y, z, w) {
      const length = validateQuaternion(index, x, y, z, w);
      const offset = index * 4, inverseLength = 1 / length;
      x = Math.fround(x * inverseLength);y = Math.fround(y * inverseLength);z = Math.fround(z * inverseLength);w = Math.fround(w * inverseLength);
      if (Object.is(rotations[offset], x) && Object.is(rotations[offset + 1], y) && Object.is(rotations[offset + 2], z) && Object.is(rotations[offset + 3], w)) return;
      rotations[offset] = x; rotations[offset + 1] = y;
      rotations[offset + 2] = z; rotations[offset + 3] = w;
      markSubtreeDirty(index);
    },
    validateTrs(index, position, rotation, scale) {
      validateVector(index, position[0]!, position[1]!, position[2]!);
      validateVector(index, scale[0]!, scale[1]!, scale[2]!);
      validateQuaternion(index, rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!);
    },
    assertActive(index) { requireActive(index, 'transform'); },
    updateWorldMatrices() {
      let updated = 0;
      for (let index = 0; index < capacity; index += 1) {
        if (active[index] === 0 || dirty[index] === 0) continue;
        let depth = 0, cursor = index;
        while (cursor !== -1 && dirty[cursor] !== 0) {
          stack[depth++] = cursor;
          cursor = parents[cursor];
        }
        while (depth > 0) {
          const node = stack[--depth];
          const matrixOffset = node * MATRIX_LENGTH;
          const positionOffset = node * 3, rotationOffset = node * 4;
          composeTrsValues(
            localMatrices,
            matrixOffset,
            positions[positionOffset], positions[positionOffset + 1], positions[positionOffset + 2],
            rotations[rotationOffset], rotations[rotationOffset + 1], rotations[rotationOffset + 2], rotations[rotationOffset + 3],
            scales[positionOffset], scales[positionOffset + 1], scales[positionOffset + 2]
          );
          const parent = parents[node];
          if (parent === -1) {
            for (let component = 0; component < MATRIX_LENGTH; component += 1) {
              worldMatrices[matrixOffset + component] = localMatrices[matrixOffset + component];
            }
          }
          else multiplyMat4(worldMatrices, worldMatrices, localMatrices, parent * MATRIX_LENGTH, matrixOffset, matrixOffset);
          dirty[node] = 0;
          updated += 1;
        }
      }
      return updated;
    },
    copyWorldMatrix(index, out) {
      requireActive(index, "transform");
      requireMatrix(out, "out");
      const offset = index * MATRIX_LENGTH;
      for (let component = 0; component < MATRIX_LENGTH; component += 1) out[component] = worldMatrices[offset + component];
      return out;
    }
  };
  Object.setPrototypeOf(hierarchy, transformHierarchy3DPrototype);
  return hierarchy;
}

// This initializer mutates only its own new compatibility function.
export const TransformHierarchy3D = /* @__PURE__ */ (() => {
  function transformHierarchy3DFactory(capacity: number): TransformHierarchy3D {
    return createTransformHierarchy3D(capacity);
  }

  function isTransformHierarchy3DFactory(value: unknown): value is TransformHierarchy3DFactory {
    if (typeof value !== "function") return false;
    try {
      Reflect.construct(Object, [], value);
      return true;
    } catch {
      return false;
    }
  }

  function requireTransformHierarchy3DFactory(value: unknown): TransformHierarchy3DFactory {
    if (!isTransformHierarchy3DFactory(value)) throw new Error("Transform hierarchy factory must be constructable");
    return value;
  }

  Object.defineProperty(transformHierarchy3DFactory, "prototype", { value: transformHierarchy3DPrototype });
  return requireTransformHierarchy3DFactory(transformHierarchy3DFactory);
})();
