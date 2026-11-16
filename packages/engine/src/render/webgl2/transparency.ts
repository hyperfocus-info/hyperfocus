import { createRenderCommandBuffer3D, MATERIAL_FLAG_ALPHA_BLEND_3D, type BoundedScene3D, type RenderCommandBuffer3D } from '../3d-scene.ts';
import { canCopyTransparencyRuns3D, createOriginalTransparencyCopy3D, createTransparencyCopyWork3D, createTransparencyRunCopy3D, createTransparencyScratch3D,
  hasTransparencyRunInputs3D, transparencyScratchBytes3D, type TransparencyScratch3D } from './transparency-copy.ts';

const cache = new WeakMap<RenderCommandBuffer3D, { output: RenderCommandBuffer3D; transparent: number[]; owner: Int32Array; depth: Float64Array }>();
/** Sort transparent instance centres globally; preserve instancing for adjacent equal draw state. Input is untouched. */
export function sortTransparentInstances3D(scene: BoundedScene3D, source: RenderCommandBuffer3D, viewProjection: ArrayLike<number>): RenderCommandBuffer3D {
  let required = false;
  for (let c = 0; c < source.commandCount; c++) if (source.commandInstanceCounts[c] && scene.materialFlags[source.commandMaterialHandles[c]!]! & MATERIAL_FLAG_ALPHA_BLEND_3D) { required = true;break; }
  if (!required) return source;
  let scratch = cache.get(source);
  if (!scratch) {
    const capacity = source.instanceSceneHandles.length;
    scratch = { output: createRenderCommandBuffer3D({ instances: capacity, commands: Math.max(1, capacity), lights: source.lightTypes.length }), transparent: [], owner: new Int32Array(capacity), depth: new Float64Array(capacity) };cache.set(source, scratch);
  }
  const { output, transparent, owner, depth } = scratch;transparent.length = 0;output.commandCount = 0;output.instanceCount = 0;
  if (source.instanceAppearance && !output.instanceAppearance) output.instanceAppearance = new Float32Array(source.instanceAppearance.length);
  let lastCommand = -1;
  function append(instance: number, command: number) {
    if (command !== lastCommand) {
      const c = output.commandCount++;
      for (const key of ['commandMeshHandles', 'commandMaterialHandles', 'commandFlags', 'commandSkeletonHandles'] as const) output[key][c] = source[key][command]!;
      output.commandFirstInstances[c] = output.instanceCount;output.commandInstanceCounts[c] = 0;lastCommand = command;
    }
    const at = output.instanceCount++;output.commandInstanceCounts[output.commandCount - 1]++;
    output.instanceSceneHandles[at] = source.instanceSceneHandles[instance]!;
    output.instanceMatrices.set(source.instanceMatrices.subarray(instance * 16, instance * 16 + 16), at * 16);
    if (output.instanceAppearance) {
      if (source.instanceAppearance) output.instanceAppearance.set(source.instanceAppearance.subarray(instance * 8, instance * 8 + 8), at * 8);
      else output.instanceAppearance.set([1, 1, 1, 1, 0, 0, 1, 1], at * 8);
    }
  }
  for (let command = 0; command < source.commandCount; command++) {
    const blended = Boolean(scene.materialFlags[source.commandMaterialHandles[command]!]! & MATERIAL_FLAG_ALPHA_BLEND_3D);
    for (let i = 0; i < source.commandInstanceCounts[command]!; i++) {
      const instance = source.commandFirstInstances[command]! + i;
      if (!blended) append(instance, command);
      else {
        owner[instance] = command;transparent.push(instance);
        const at = instance * 16, x = source.instanceMatrices[at + 12]!, y = source.instanceMatrices[at + 13]!, z = source.instanceMatrices[at + 14]!;
        const w = viewProjection[3]! * x + viewProjection[7]! * y + viewProjection[11]! * z + viewProjection[15]!;
        depth[instance] = (viewProjection[2]! * x + viewProjection[6]! * y + viewProjection[10]! * z + viewProjection[14]!) / (Math.abs(w) < 1e-12 ? 1 : w);
      }
    }
  }
  transparent.sort((a, b) => depth[b]! - depth[a]! || a - b);
  for (const instance of transparent) append(instance, owner[instance]!);
  for (const key of ['lightCount', 'testedInstances', 'visibleInstances', 'culledInstances', 'filteredInstances', 'invalidTransformInstances', 'invalidSkeletonInstances', 'truncatedInstances', 'commandLimitedInstances', 'matchingLights', 'truncatedLights'] as const) output[key] = source[key];
  output.lightTypes.set(source.lightTypes);output.lightSceneHandles.set(source.lightSceneHandles);output.lightData.set(source.lightData);
  return output;
}

/** Experimental copy strategy; original remains the public renderer default.
 * Both borrow plain renderer command buffers synchronously and leave the input
 * untouched. Live material flags and camera values are read every invocation.
 * Results and diagnostics are borrowed until the next call. Failure exposes
 * observed=0, never inferred partial copy counts. No clock or resource trust. */
export function createTransparencySorter3D(options: { strategy?: 'original' | 'runs'; diagnostics?: boolean } = {}) {
  const strategy = options.strategy ?? 'original';
  if (strategy !== 'original' && strategy !== 'runs') throw Error('Unsupported transparency copy strategy.');
  const runsCache = new WeakMap<RenderCommandBuffer3D, TransparencyScratch3D>();
  const work = createTransparencyCopyWork3D();
  const selected = strategy === 'runs' ? sortRuns : sortTransparentInstances3D;
  let runCount = 0, usedFallback = false;
  function sortRuns(scene: BoundedScene3D, source: RenderCommandBuffer3D, viewProjection: ArrayLike<number>) {
    const plain = hasTransparencyRunInputs3D(scene, source, viewProjection);
    let required = false;
    for (let c = 0; c < source.commandCount; c++) if (source.commandInstanceCounts[c] && scene.materialFlags[source.commandMaterialHandles[c]!]! & MATERIAL_FLAG_ALPHA_BLEND_3D) { required = true;break; }
    if (!required) return source;
    let scratch = runsCache.get(source);
    if (!scratch) { scratch = createTransparencyScratch3D(source);runsCache.set(source, scratch); }
    const { output, transparent, owner, depth } = scratch;
    transparent.length = 0;output.commandCount = 0;output.instanceCount = 0;
    if (source.instanceAppearance && !output.instanceAppearance) output.instanceAppearance = new Float32Array(source.instanceAppearance.length);
    usedFallback = !plain || !canCopyTransparencyRuns3D(source, output, scene, viewProjection, options.diagnostics ? work : undefined);
    const copy = (usedFallback ? createOriginalTransparencyCopy3D : createTransparencyRunCopy3D)(source, output);
    let lastCommand = -1;
    function append(instance: number, command: number) {
      if (command !== lastCommand) {
        const c = output.commandCount++;
        for (const key of ['commandMeshHandles', 'commandMaterialHandles', 'commandFlags', 'commandSkeletonHandles'] as const) output[key][c] = source[key][command]!;
        output.commandFirstInstances[c] = output.instanceCount;output.commandInstanceCounts[c] = 0;lastCommand = command;
      }
      const at = output.instanceCount++;output.commandInstanceCounts[output.commandCount - 1]++;
      output.instanceSceneHandles[at] = source.instanceSceneHandles[instance]!;
      copy.append(instance, at);
    }
    for (let command = 0; command < source.commandCount; command++) {
      const blended = Boolean(scene.materialFlags[source.commandMaterialHandles[command]!]! & MATERIAL_FLAG_ALPHA_BLEND_3D);
      if (blended) copy.flush();
      for (let i = 0; i < source.commandInstanceCounts[command]!; i++) {
        const instance = source.commandFirstInstances[command]! + i;
        if (!blended) append(instance, command);
        else {
          owner[instance] = command;transparent.push(instance);
          const at = instance * 16, x = source.instanceMatrices[at + 12]!, y = source.instanceMatrices[at + 13]!, z = source.instanceMatrices[at + 14]!;
          const w = viewProjection[3]! * x + viewProjection[7]! * y + viewProjection[11]! * z + viewProjection[15]!;
          depth[instance] = (viewProjection[2]! * x + viewProjection[6]! * y + viewProjection[10]! * z + viewProjection[14]!) / (Math.abs(w) < 1e-12 ? 1 : w);
        }
      }
    }
    copy.flush();
    transparent.sort((a, b) => depth[b]! - depth[a]! || a - b);
    for (const instance of transparent) append(instance, owner[instance]!);
    copy.flush();runCount = copy.runs();
    for (const key of ['lightCount', 'testedInstances', 'visibleInstances', 'culledInstances', 'filteredInstances', 'invalidTransformInstances', 'invalidSkeletonInstances', 'truncatedInstances', 'commandLimitedInstances', 'matchingLights', 'truncatedLights'] as const) output[key] = source[key];
    output.lightTypes.set(source.lightTypes);output.lightSceneHandles.set(source.lightSceneHandles);output.lightData.set(source.lightData);
    return output;
  }
  return Object.assign((scene: BoundedScene3D, source: RenderCommandBuffer3D, viewProjection: ArrayLike<number>) => {
    const counters: Record<string, number> = work;
    for (const key of Object.keys(work)) counters[key] = 0;
    work.applications = 1;work.enabled = Number(strategy === 'runs');runCount = 0;usedFallback = false;
    const output = selected(scene, source, viewProjection);
    if (options.diagnostics) {
      work.observed = 1;work.inputInstances = source.instanceCount;work.fallbacks = Number(usedFallback);
      const scratch = strategy === 'runs' ? runsCache.get(source) : cache.get(source);
      work.scratchCapacityBytes = transparencyScratchBytes3D(scratch);
      if (output !== source) {
        const copied = output.instanceCount, runs = strategy === 'original' || usedFallback ? copied : runCount;
        work.copiedInstances = copied;work.copyRuns = runs;work.matrixSetCalls = work.matrixSubarrayCalls = runs;
        work.matrixValuesCopied = copied * 16;work.handleWrites = copied;work.commandCount = output.commandCount;
        if (output.instanceAppearance) {
          work.appearanceSetCalls = source.instanceAppearance ? runs : copied;
          work.appearanceSubarrayCalls = source.instanceAppearance ? runs : 0;
          work.appearanceDefaultArrays = source.instanceAppearance ? 0 : copied;work.appearanceValuesCopied = copied * 8;
        }
      }
    }
    return output;
  }, { readWork: () => work });
}
