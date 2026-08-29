import type { LightKind3D, MeshGeometry3D, TextureResource3D } from "../3d-scene.ts";

const MATRIX_STRIDE = 16;
const UINT32_MAX = 0xffff_ffff;

export const LIGHT_KIND_DIRECTIONAL_3D = 0;
export const LIGHT_KIND_POINT_3D = 1;
export const LIGHT_KIND_SPOT_3D = 2;
export const LIGHT_KIND_AMBIENT_3D = 3;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite; received ${value}.`);
  return value;
}

function requireCapacity(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be a non-negative uint32 integer; received ${value}.`);
  }
  return value;
}

export function validateMesh(geometry: MeshGeometry3D): void {
  const { positions, indices, normals, uvs, joints, weights, morphPositions, morphWeights } = geometry;
  if (geometry.topology !== undefined && geometry.topology !== "triangle-list" && geometry.topology !== "line-list") {
    throw new RangeError(`unsupported mesh topology ${String(geometry.topology)}.`);
  }
  if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 3 !== 0) {
    throw new RangeError("mesh positions must be a non-empty Float32Array of packed xyz values.");
  }
  const vertexCount = positions.length / 3;
  if (normals && (!(normals instanceof Float32Array) || normals.length !== positions.length)) {
    throw new RangeError(`mesh normals must contain ${positions.length} Float32 values.`);
  }
  if (uvs && (!(uvs instanceof Float32Array) || uvs.length !== vertexCount * 2)) {
    throw new RangeError(`mesh uvs must contain ${vertexCount * 2} Float32 values.`);
  }
  if ((joints === undefined) !== (weights === undefined)) {
    throw new RangeError("mesh JOINTS_0 and WEIGHTS_0 streams must be provided together.");
  }
  if (joints && !(joints instanceof Uint8Array) && !(joints instanceof Uint16Array)) {
    throw new TypeError("mesh JOINTS_0 must be Uint8Array or Uint16Array packed uvec4 data.");
  }
  if (joints && joints.length !== vertexCount * 4) {
    throw new RangeError(`mesh JOINTS_0 must contain ${vertexCount * 4} values.`);
  }
  if (weights && (!(weights instanceof Float32Array) || weights.length !== vertexCount * 4)) {
    throw new RangeError(`mesh WEIGHTS_0 must contain ${vertexCount * 4} Float32 values.`);
  }
  if (morphPositions !== undefined) {
    if (!Array.isArray(morphPositions) || morphPositions.length === 0 || morphPositions.length > 4) throw new RangeError("mesh morphPositions must contain one through four position-delta targets.");
    for (const [target, values] of morphPositions.entries()) {
      if (!(values instanceof Float32Array) || values.length !== positions.length) throw new RangeError(`morphPositions[${target}] must contain ${positions.length} Float32 deltas.`);
      for (let index = 0; index < values.length; index += 1) finite(values[index], `morphPositions[${target}][${index}]`);
    }
    if (morphWeights !== undefined && morphWeights.length > morphPositions.length) throw new RangeError("morphWeights cannot exceed the morph target count.");
  } else if (morphWeights !== undefined) throw new RangeError("morphWeights require morphPositions.");
  if (morphWeights) for (let index = 0; index < morphWeights.length; index += 1) finite(morphWeights[index], `morphWeights[${index}]`);
  if (indices && !(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    throw new TypeError("mesh indices must be Uint16Array or Uint32Array.");
  }
  const primitiveSize = geometry.topology === "line-list" ? 2 : 3;
  const elementCount = indices?.length ?? vertexCount;
  if (elementCount % primitiveSize !== 0) throw new RangeError(`${geometry.topology ?? "triangle-list"} element count must be divisible by ${primitiveSize}.`);
  if (indices) {
    for (const index of indices) if (index >= vertexCount) throw new RangeError(`mesh index ${index} exceeds vertex count ${vertexCount}.`);
  }
  if (geometry.bounds) validateBounds(geometry.bounds);
  for (let index = 0; index < positions.length; index += 1) finite(positions[index], `positions[${index}]`);
  if (normals) for (let index = 0; index < normals.length; index += 1) finite(normals[index], `normals[${index}]`);
  if (uvs) for (let index = 0; index < uvs.length; index += 1) finite(uvs[index], `uvs[${index}]`);
  if (weights) {
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 4;
      let total = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        const weight = finite(weights[offset + influence], `weights[${offset + influence}]`);
        if (weight < 0) throw new RangeError(`weights[${offset + influence}] must be non-negative.`);
        total += weight;
      }
      if (Math.abs(total - 1) > 1e-3) throw new RangeError(`WEIGHTS_0 for vertex ${vertex} must sum to 1; received ${total}.`);
    }
  }
}

export function computeMeshBounds(positions: Float32Array): { x: number; y: number; z: number; radius: number } {
  let minX = positions[0], maxX = positions[0], minY = positions[1], maxY = positions[1], minZ = positions[2], maxZ = positions[2];
  for (let index = 3; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]); maxY = Math.max(maxY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]); maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const x = (minX + maxX) / 2, y = (minY + maxY) / 2, z = (minZ + maxZ) / 2;
  let radiusSquared = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const dx = positions[index] - x, dy = positions[index + 1] - y, dz = positions[index + 2] - z;
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  return { x, y, z, radius: Math.sqrt(radiusSquared) };
}

export function validateBounds(bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
  finite(bounds.x, "bounds.x"); finite(bounds.y, "bounds.y"); finite(bounds.z, "bounds.z"); finite(bounds.radius, "bounds.radius");
  if (bounds.radius < 0) throw new RangeError("bounds.radius must be non-negative.");
}

export function writeBounds(target: Float32Array, offset: number, bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
  validateBounds(bounds);
  target[offset] = bounds.x; target[offset + 1] = bounds.y; target[offset + 2] = bounds.z; target[offset + 3] = bounds.radius;
}

export function copyBounds(target: Float32Array, targetOffset: number, source: Float32Array, sourceOffset: number): void {
  target[targetOffset] = source[sourceOffset]; target[targetOffset + 1] = source[sourceOffset + 1];
  target[targetOffset + 2] = source[sourceOffset + 2]; target[targetOffset + 3] = source[sourceOffset + 3];
}

export function lightKindCode(kind: LightKind3D): number {
  if (kind === "ambient") return LIGHT_KIND_AMBIENT_3D;
  if (kind === "directional") return LIGHT_KIND_DIRECTIONAL_3D;
  if (kind === "point") return LIGHT_KIND_POINT_3D;
  if (kind === "spot") return LIGHT_KIND_SPOT_3D;
  throw new RangeError(`unsupported light kind ${String(kind)}.`);
}

export function validateTexture(texture: TextureResource3D): void {
  const width = requireCapacity(texture.width, "texture.width"), height = requireCapacity(texture.height, "texture.height");
  if (width === 0 || height === 0) throw new RangeError("texture width and height must be positive.");
  if (!(texture.pixels instanceof Uint8Array) && !(texture.pixels instanceof Uint8ClampedArray)) {
    throw new TypeError("texture pixels must be Uint8Array or Uint8ClampedArray RGBA8 data.");
  }
  const expected = width * height * 4;
  if (!Number.isSafeInteger(expected) || texture.pixels.byteLength !== expected) {
    throw new RangeError(`texture pixels must contain exactly ${expected} RGBA8 bytes; received ${texture.pixels.byteLength}.`);
  }
  if (texture.filter !== undefined && texture.filter !== "nearest" && texture.filter !== "linear") {
    throw new RangeError(`unsupported texture filter ${String(texture.filter)}.`);
  }
  if (texture.wrapU !== undefined && texture.wrapU !== "clamp" && texture.wrapU !== "repeat") {
    throw new RangeError(`unsupported texture wrapU ${String(texture.wrapU)}.`);
  }
  if (texture.wrapV !== undefined && texture.wrapV !== "clamp" && texture.wrapV !== "repeat") {
    throw new RangeError(`unsupported texture wrapV ${String(texture.wrapV)}.`);
  }
}

export function validatePaletteMatrices(matrices: ArrayLike<number> | undefined, jointCount: number): void {
  if (!matrices) return;
  const expected = jointCount * MATRIX_STRIDE;
  if (matrices.length !== expected) throw new RangeError(`skeleton palette must contain exactly ${expected} values for ${jointCount} joints.`);
  for (let component = 0; component < expected; component += 1) finite(matrices[component], `skeletonMatrices[${component}]`);
}

export function maxJointIndex(joints: Uint8Array | Uint16Array): number {
  let maximum = 0;
  for (const joint of joints) maximum = Math.max(maximum, joint);
  return maximum;
}
