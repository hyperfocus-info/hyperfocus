import * as THREE from "three";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

export type ThreeLikeGeometry = object & {
  dispose?(): unknown;
};

export type ThreeLikeBufferAttribute = {
  array: ArrayLike<number>;
  itemSize: number;
  count: number;
  normalized?: boolean;
  isInterleavedBufferAttribute?: boolean;
};

export type ThreeLikeBufferGeometryGroup = {
  start: number;
  count: number;
  materialIndex?: number;
};

export type ThreeLikeBufferGeometry = ThreeLikeGeometry & {
  attributes?: Record<string, unknown>;
  index?: unknown;
  groups?: ThreeLikeBufferGeometryGroup[];
  getAttribute?(name: string): unknown;
  getIndex?(): unknown;
  clone?(): ThreeLikeBufferGeometry;
  computeVertexNormals?(): unknown;
  computeBoundingBox?(): unknown;
  computeBoundingSphere?(): unknown;
};

type WritableThreeLikeBufferGeometry = ThreeLikeBufferGeometry & {
  setAttribute(name: string, attribute: ThreeLikeBufferAttribute): unknown;
  setIndex(index: ThreeLikeBufferAttribute | ArrayLike<number> | null): unknown;
  addGroup?(start: number, count: number, materialIndex?: number): unknown;
  clearGroups?(): unknown;
};

export type ThreeNumericArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export type ThreeLikeBufferAttributeConstructor = new (
  array: ThreeNumericArray,
  itemSize: number,
  normalized?: boolean,
) => ThreeLikeBufferAttribute;

export type ThreeLikeBufferGeometryConstructor = new () => ThreeLikeBufferGeometry;

export type ThreeBufferGeometryModuleLike = {
  BufferAttribute?: ThreeLikeBufferAttributeConstructor;
  BufferGeometry?: ThreeLikeBufferGeometryConstructor;
};

export type ThreeBufferGeometryModuleFor<TGeometry extends ThreeLikeBufferGeometry> = {
  BufferAttribute: ThreeLikeBufferAttributeConstructor;
  BufferGeometry: new () => TGeometry;
};

export type ThreeBufferGeometrySimplifyOptions = {
  THREE?: ThreeBufferGeometryModuleLike;
  ratio: number;
  targetError?: number;
  lockBorder?: boolean;
  minTriangles?: number;
  preserveGroups?: boolean;
  attributes?: readonly string[];
  computeVertexNormals?: boolean;
  computeBounds?: boolean;
};

export function simplifyThreeBufferGeometry(
  geometry: THREE.BufferGeometry,
  options: Omit<ThreeBufferGeometrySimplifyOptions, "THREE"> & { THREE?: undefined },
): Promise<THREE.BufferGeometry>;
export function simplifyThreeBufferGeometry<TGeometry extends ThreeLikeBufferGeometry>(
  geometry: TGeometry,
  options: ThreeBufferGeometrySimplifyOptions & { THREE: ThreeBufferGeometryModuleFor<TGeometry> },
): Promise<TGeometry>;
export function simplifyThreeBufferGeometry(
  geometry: ThreeLikeBufferGeometry,
  options: ThreeBufferGeometrySimplifyOptions,
): Promise<ThreeLikeBufferGeometry>;
export async function simplifyThreeBufferGeometry(
  geometry: ThreeLikeBufferGeometry,
  options: ThreeBufferGeometrySimplifyOptions,
): Promise<ThreeLikeBufferGeometry> {
  const ratio = assertLodRatio(options.ratio, "3D geometry LOD ratio");
  const constructors = resolveBufferGeometryConstructors(options.THREE);
  const position = getBufferGeometryAttribute(geometry, "position");
  if (!position) throw new Error("3D geometry simplification requires a position attribute");
  if (position.isInterleavedBufferAttribute) throw new Error("3D geometry simplification does not support interleaved position attributes");
  if (position.itemSize < 3) throw new Error("3D geometry position attribute must have at least 3 components");
  const sourceIndices = readGeometryIndices(geometry, position.count);
  const targetIndexCount = resolveSimplifiedIndexTarget(sourceIndices.length, ratio, options.minTriangles ?? 1);
  if (targetIndexCount >= sourceIndices.length) return cloneBufferGeometry(geometry);

  await MeshoptSimplifier.ready;
  const positions = readPositionArray(position);
  const flags: ["LockBorder"] | undefined = options.lockBorder ? ["LockBorder"] : undefined;
  const simplified = simplifyGeometryIndices(geometry, sourceIndices, positions, position.itemSize, targetIndexCount, options, flags);
  const compactIndices = new Uint32Array(simplified.indices);
  const [remap, uniqueVertexCount] = MeshoptSimplifier.compactMesh(compactIndices);
  const result = constructors.createGeometry();
  const indexArray = uniqueVertexCount > 65535 ? compactIndices : new Uint16Array(compactIndices);
  result.setIndex?.(constructors.createAttribute(indexArray, 1));
  copySimplifiedAttributes(geometry, result, constructors.createAttribute, remap, uniqueVertexCount, options);
  copySimplifiedGroups(result, simplified.groups);
  if ((options.computeVertexNormals ?? Boolean(getBufferGeometryAttribute(geometry, "normal"))) && result.computeVertexNormals) {
    result.computeVertexNormals();
  }
  if (options.computeBounds ?? true) {
    result.computeBoundingBox?.();
    result.computeBoundingSphere?.();
  }
  return result;
}

function resolveBufferGeometryConstructors(constructors?: ThreeBufferGeometryModuleLike) {
  if (!constructors) {
    return {
      createGeometry: () => requireThreeLikeBufferGeometry(new THREE.BufferGeometry()),
      createAttribute: (array: ArrayLike<number>, itemSize: number, normalized?: boolean) => requireThreeLikeBufferAttribute(
        new THREE.BufferAttribute(requireThreeNumericArray(array), itemSize, normalized),
      ),
    };
  }
  if (!constructors.BufferGeometry) throw new Error("3D geometry simplification requires THREE.BufferGeometry");
  if (!constructors.BufferAttribute) throw new Error("3D geometry simplification requires THREE.BufferAttribute");
  const BufferGeometry = constructors.BufferGeometry;
  const BufferAttribute = constructors.BufferAttribute;
  return {
    createGeometry: () => requireThreeLikeBufferGeometry(new BufferGeometry()),
    createAttribute: (array: ArrayLike<number>, itemSize: number, normalized?: boolean) => new BufferAttribute(
      requireThreeNumericArray(array),
      itemSize,
      normalized,
    ),
  };
}

function requireThreeLikeBufferGeometry(value: unknown): WritableThreeLikeBufferGeometry {
  if (!isThreeLikeBufferGeometry(value)) throw new TypeError("THREE.BufferGeometry did not produce a compatible geometry.");
  return value;
}

function isThreeLikeBufferGeometry(value: unknown): value is WritableThreeLikeBufferGeometry {
  return typeof value === "object" && value !== null
    && "getAttribute" in value && typeof value.getAttribute === "function"
    && "setAttribute" in value && typeof value.setAttribute === "function"
    && "setIndex" in value && typeof value.setIndex === "function";
}

function requireThreeLikeBufferAttribute(value: unknown): ThreeLikeBufferAttribute {
  if (!isThreeLikeBufferAttribute(value)) throw new TypeError("THREE.BufferAttribute did not produce a compatible attribute.");
  return value;
}

function isThreeLikeBufferAttribute(value: unknown): value is ThreeLikeBufferAttribute {
  return typeof value === "object" && value !== null
    && "array" in value && isNumberArrayLike(value.array)
    && "itemSize" in value && typeof value.itemSize === "number"
    && "count" in value && typeof value.count === "number";
}

function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  return typeof value === "object" && value !== null && "length" in value && typeof value.length === "number";
}

function requireThreeNumericArray(value: ArrayLike<number>): ThreeNumericArray {
  if (
    value instanceof Int8Array || value instanceof Uint8Array || value instanceof Uint8ClampedArray
    || value instanceof Int16Array || value instanceof Uint16Array || value instanceof Int32Array
    || value instanceof Uint32Array || value instanceof Float32Array || value instanceof Float64Array
  ) return value;
  return Float32Array.from(value);
}

function getBufferGeometryAttribute(geometry: ThreeLikeBufferGeometry, name: string) {
  const value = geometry.getAttribute?.(name) ?? geometry.attributes?.[name];
  if (value === undefined) return undefined;
  return requireThreeLikeBufferAttribute(value);
}

function cloneBufferGeometry(geometry: ThreeLikeBufferGeometry): ThreeLikeBufferGeometry {
  return geometry.clone?.() ?? geometry;
}

function readGeometryIndices(geometry: ThreeLikeBufferGeometry, vertexCount: number) {
  const value = geometry.getIndex?.() ?? geometry.index ?? null;
  const index = value === null ? null : requireThreeLikeBufferAttribute(value);
  if (index?.array) return toUint32Array(index.array, index.count);
  const result = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) result[index] = index;
  return result;
}

function toUint32Array(values: ArrayLike<number>, count = values.length) {
  const result = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) result[index] = Number(values[index] ?? 0);
  return result;
}

function resolveSimplifiedIndexTarget(indexCount: number, ratio: number, minTriangles: number) {
  const minIndexCount = Math.max(3, Math.floor(minTriangles) * 3);
  const target = Math.floor(indexCount * ratio / 3) * 3;
  return Math.max(minIndexCount, target);
}

function readPositionArray(position: ThreeLikeBufferAttribute) {
  if (position.array instanceof Float32Array && position.itemSize >= 3) return position.array;
  const result = new Float32Array(position.count * position.itemSize);
  for (let index = 0; index < result.length; index += 1) result[index] = Number(position.array[index] ?? 0);
  return result;
}

function simplifyGeometryIndices(
  geometry: ThreeLikeBufferGeometry,
  sourceIndices: Uint32Array,
  positions: Float32Array,
  positionStride: number,
  targetIndexCount: number,
  options: ThreeBufferGeometrySimplifyOptions,
  flags: ["LockBorder"] | undefined,
) {
  const groups = (options.preserveGroups ?? true) ? validGeometryGroups(geometry, sourceIndices.length) : [];
  if (!groups.length) {
    const indices = MeshoptSimplifier.simplify(sourceIndices, positions, positionStride, targetIndexCount, options.targetError ?? 0.02, flags)[0];
    return { indices, groups: [] };
  }

  const output: number[] = [];
  const outputGroups: ThreeLikeBufferGeometryGroup[] = [];
  let remainingTarget = targetIndexCount;
  let remainingSource = groups.reduce((sum, group) => sum + group.count, 0);
  for (const group of groups) {
    const groupIndices = sourceIndices.slice(group.start, group.start + group.count);
    const groupTarget = Math.min(group.count, resolveSimplifiedIndexTarget(group.count, remainingTarget / Math.max(1, remainingSource), 1));
    const simplified = MeshoptSimplifier.simplify(groupIndices, positions, positionStride, groupTarget, options.targetError ?? 0.02, flags)[0];
    outputGroups.push({ start: output.length, count: simplified.length, materialIndex: group.materialIndex ?? 0 });
    output.push(...simplified);
    remainingTarget -= simplified.length;
    remainingSource -= groupIndices.length;
  }
  return { indices: new Uint32Array(output), groups: outputGroups };
}

function validGeometryGroups(geometry: ThreeLikeBufferGeometry, indexCount: number) {
  const groups = geometry.groups?.filter((group) => group.count >= 3 && group.start >= 0 && group.start + group.count <= indexCount) ?? [];
  return groups.map((group) => ({ ...group }));
}

function copySimplifiedAttributes(
  source: ThreeLikeBufferGeometry,
  target: WritableThreeLikeBufferGeometry,
  createBufferAttribute: (array: ArrayLike<number>, itemSize: number, normalized?: boolean) => ThreeLikeBufferAttribute,
  remap: Uint32Array,
  uniqueVertexCount: number,
  options: ThreeBufferGeometrySimplifyOptions,
) {
  const sourceAttributes = source.attributes ?? {};
  const attributeNames = options.attributes ?? Object.keys(sourceAttributes);
  const recomputeNormals = options.computeVertexNormals ?? Boolean(sourceAttributes.normal);
  const missing = 4294967295;
  for (const name of attributeNames) {
    if (name === "normal" && recomputeNormals) continue;
    const attribute = getBufferGeometryAttribute(source, name);
    if (!attribute || attribute.isInterleavedBufferAttribute) continue;
    const itemSize = attribute.itemSize;
    if (attribute.count < remap.length || itemSize <= 0) continue;
    const array = createRemappedAttributeArray(attribute.array, uniqueVertexCount * itemSize);
    for (let oldIndex = 0; oldIndex < remap.length; oldIndex += 1) {
      const newIndex = remap[oldIndex];
      if (newIndex === missing) continue;
      const oldOffset = oldIndex * itemSize;
      const newOffset = newIndex * itemSize;
      for (let element = 0; element < itemSize; element += 1) array[newOffset + element] = Number(attribute.array[oldOffset + element] ?? 0);
    }
    target.setAttribute?.(name, createBufferAttribute(array, itemSize, attribute.normalized));
  }
}

type MutableNumericArray = ArrayLike<number> & { [index: number]: number };

function createRemappedAttributeArray(source: ArrayLike<number>, length: number): MutableNumericArray {
  if (source instanceof Float32Array) return new Float32Array(length);
  if (source instanceof Float64Array) return new Float64Array(length);
  if (source instanceof Uint8Array) return new Uint8Array(length);
  if (source instanceof Uint8ClampedArray) return new Uint8ClampedArray(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  if (source instanceof Uint32Array) return new Uint32Array(length);
  if (source instanceof Int8Array) return new Int8Array(length);
  if (source instanceof Int16Array) return new Int16Array(length);
  if (source instanceof Int32Array) return new Int32Array(length);
  return new Float32Array(length);
}

function copySimplifiedGroups(target: WritableThreeLikeBufferGeometry, groups: readonly ThreeLikeBufferGeometryGroup[]) {
  if (!groups.length || !target.addGroup) return;
  target.clearGroups?.();
  for (const group of groups) {
    if (group.count >= 3) target.addGroup(group.start, group.count, group.materialIndex ?? 0);
  }
}

function assertLodRatio(value: number, label: string) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) throw new Error(`${label} must be greater than 0 and at most 1`);
  return ratio;
}
