import { createRenderCommandBuffer3D, type BoundedScene3D, type RenderCommandBuffer3D } from '../3d-scene.ts';

export type TransparencyScratch3D = {
  output: RenderCommandBuffer3D; transparent: number[]; owner: Int32Array; depth: Float64Array;
};
export type TransparencyCopyWork3D = ReturnType<typeof createTransparencyCopyWork3D>;
export function createTransparencyCopyWork3D() {
  return { applications: 0, enabled: 0, observed: 0, inputInstances: 0, copiedInstances: 0, copyRuns: 0,
    matrixSetCalls: 0, matrixSubarrayCalls: 0, matrixValuesCopied: 0, handleWrites: 0,
    appearanceSetCalls: 0, appearanceSubarrayCalls: 0, appearanceDefaultArrays: 0, appearanceValuesCopied: 0,
    commandCount: 0, scratchCapacityBytes: 0, retainedSourceReferences: 0, fallbacks: 0, eligibilityCommandChecks: 0 };
}
export function createTransparencyScratch3D(source: RenderCommandBuffer3D): TransparencyScratch3D {
  const capacity = source.instanceSceneHandles.length;
  return { output: createRenderCommandBuffer3D({ instances: capacity, commands: Math.max(1, capacity), lights: source.lightTypes.length }),
    transparent: [], owner: new Int32Array(capacity), depth: new Float64Array(capacity) };
}

const arrayFields = ['commandMeshHandles', 'commandMaterialHandles', 'commandFirstInstances', 'commandInstanceCounts',
  'commandSkeletonHandles', 'commandFlags', 'instanceSceneHandles', 'instanceMatrices', 'instanceAppearance',
  'lightTypes', 'lightSceneHandles', 'lightData'] as const;
const scalarFields = ['commandCount', 'instanceCount', 'lightCount', 'testedInstances', 'visibleInstances', 'culledInstances',
  'filteredInstances', 'invalidTransformInstances', 'invalidSkeletonInstances', 'truncatedInstances', 'commandLimitedInstances',
  'matchingLights', 'truncatedLights'] as const;
const prototypes = [Uint32Array.prototype, Int32Array.prototype, Float32Array.prototype, Float64Array.prototype];
const methods = prototypes.map(prototype => ({ set: prototype.set, subarray: prototype.subarray }));
const constructors = prototypes.map(prototype => prototype.constructor);
const typedConstructor = Object.getPrototypeOf(Float32Array);
const species = Object.getOwnPropertyDescriptor(typedConstructor, Symbol.species)?.get;
function nativeArray(value: unknown) {
  if (!ArrayBuffer.isView(value)) return false;
  const index = prototypes.indexOf(Object.getPrototypeOf(value));if (index < 0) return false;
  for (const name of ['buffer', 'byteOffset', 'byteLength', 'length', 'constructor', 'set', 'subarray']) if (Object.hasOwn(value, name)) return false;
  const constructor = constructors[index]!;
  if (Object.getOwnPropertyDescriptor(prototypes[index]!, 'constructor')?.value !== constructor
    || Object.getPrototypeOf(constructor) !== typedConstructor || Object.hasOwn(constructor, Symbol.species)
    || Object.getOwnPropertyDescriptor(typedConstructor, Symbol.species)?.get !== species) return false;
  const array: ArrayBufferView & { readonly set?: unknown; readonly subarray?: unknown } = value;
  return array.buffer instanceof ArrayBuffer && array.set === methods[index]!.set && array.subarray === methods[index]!.subarray;
}
function plainCommands(source: RenderCommandBuffer3D) {
  for (const key of scalarFields) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(source, key) ?? {}, 'value')) return false;
  for (const key of arrayFields) {
    const property = Object.getOwnPropertyDescriptor(source, key);
    if (key === 'instanceAppearance' && (!property || Object.hasOwn(property, 'value') && property.value === undefined)) continue;
    if (!property || !Object.hasOwn(property, 'value') || !nativeArray(property.value)) return false;
  }
  return true;
}

/** Runs assume unmodified global native intrinsics and plain non-Proxy renderer
 * records. Arbitrary camera/record getters,
 * overridden typed-array methods, and concurrently mutable shared buffers use
 * the unchanged original implementation instead. No checks are cached by identity. */
export function hasTransparencyRunInputs3D(scene: BoundedScene3D, source: RenderCommandBuffer3D, camera: ArrayLike<number>): camera is Float32Array | Float64Array {
  const flags = Object.getOwnPropertyDescriptor(scene, 'materialFlags');
  return !!flags && Object.hasOwn(flags, 'value') && nativeArray(flags.value) && plainCommands(source)
    && nativeArray(camera) && (camera instanceof Float32Array || camera instanceof Float64Array);
}

/** Numeric backing capacity, including the command buffer's private compile
 * scratch. Excludes ordinary object/array/string headers and transparent's JS
 * index array; it is storage evidence, not allocated-heap or RAM-traffic data. */
export function transparencyScratchBytes3D(scratch?: TransparencyScratch3D) {
  if (!scratch) return 0;
  const { output: out } = scratch, instances = out.instanceSceneHandles.length, commands = out.commandMeshHandles.length;
  let hashCapacity = 1;while (hashCapacity < Math.max(1, commands * 2)) hashCapacity *= 2;
  return scratch.owner.byteLength + scratch.depth.byteLength + instances * (76)
    + commands * (28) + hashCapacity * 4 + out.lightTypes.byteLength + out.lightSceneHandles.byteLength
    + out.lightData.byteLength + (out.instanceAppearance?.byteLength ?? 0);
}

/** Preflight is candidate-only. Original accepts repeated ranges even when their
 * expansion eventually overflows its scratch; preserve that path and its errors.
 * Public typed storage and overlapping/aliased input never grant copy authority. */
export function canCopyTransparencyRuns3D(source: RenderCommandBuffer3D, output: RenderCommandBuffer3D,
  scene: BoundedScene3D, camera: Float32Array | Float64Array, work?: TransparencyCopyWork3D) {
  if (!plainCommands(output)) return false;
  const buffers = new Set<ArrayBufferLike>();
  for (const key of arrayFields) if (source[key]) buffers.add(source[key]!.buffer);
  buffers.add(scene.materialFlags.buffer);buffers.add(camera.buffer);
  for (const key of arrayFields) if (output[key]) {
    if (buffers.has(output[key]!.buffer)) return false;
    buffers.add(output[key]!.buffer);
  }
  if (!Number.isSafeInteger(source.commandCount) || source.commandCount < 0 || source.commandCount > source.commandInstanceCounts.length) return false;
  let referenced = 0;
  for (let command = 0; command < source.commandCount; command++) {
    if (work) work.eligibilityCommandChecks++;
    const first = source.commandFirstInstances[command]!, count = source.commandInstanceCounts[command]!;
    if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(count) || count < 0
      || first + count > source.instanceSceneHandles.length || (first + count) * 16 > source.instanceMatrices.length
      || source.instanceAppearance && (first + count) * 8 > source.instanceAppearance.length) return false;
    referenced += count;
    if (referenced > output.instanceSceneHandles.length || referenced * 16 > output.instanceMatrices.length
      || output.instanceAppearance && referenced * 8 > output.instanceAppearance.length) return false;
  }
  return true;
}

/** Same per-record reads/writes as the original append. In particular a mutated
 * borrowed output keeps its identity, aliased fields and partial-failure order;
 * falling back must not switch to an unrelated scratch buffer. */
export function createOriginalTransparencyCopy3D(source: RenderCommandBuffer3D, output: RenderCommandBuffer3D) {
  return { append(instance: number, at: number) {
    output.instanceMatrices.set(source.instanceMatrices.subarray(instance * 16, instance * 16 + 16), at * 16);
    if (output.instanceAppearance) {
      if (source.instanceAppearance) output.instanceAppearance.set(source.instanceAppearance.subarray(instance * 8, instance * 8 + 8), at * 8);
      else output.instanceAppearance.set([1, 1, 1, 1, 0, 0, 1, 1], at * 8);
    }
  }, flush() {}, runs: () => 0 };
}

/** Caller keeps original metadata and handle writes at their original positions.
 * Only consecutive matrix/appearance copies are combined. Flush before any
 * externally observable viewProjection read, and after the final append. */
export function createTransparencyRunCopy3D(source: RenderCommandBuffer3D, output: RenderCommandBuffer3D) {
  let first = 0, target = 0, count = 0, runs = 0;
  const flush = () => {
    if (!count) return;
    output.instanceMatrices.set(source.instanceMatrices.subarray(first * 16, (first + count) * 16), target * 16);
    if (output.instanceAppearance) {
      if (source.instanceAppearance) output.instanceAppearance.set(source.instanceAppearance.subarray(first * 8, (first + count) * 8), target * 8);
      else for (let index = 0; index < count; index++) output.instanceAppearance.set([1, 1, 1, 1, 0, 0, 1, 1], (target + index) * 8);
    }
    runs++;count = 0;
  };
  return { append(instance: number, at: number) {
    if (count && (instance !== first + count || at !== target + count)) flush();
    if (!count) { first = instance;target = at; }
    count++;
  }, flush, runs: () => runs };
}
