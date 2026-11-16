import type { BoundedScene3D, RenderCommandBuffer3D } from '@hyperfocus/engine/render/3d-scene';

/** Exact submitted-pose comparison, not pixel equality or proof of visibility.
 * Storage is bounded by the initialized command/scene capacities. Inputs are
 * borrowed only during observe; retained values are copied. Audio, lights,
 * materials and unused capacity do not fabricate motion. */
export function createSubmittedPoseIdentity(options: { commands: RenderCommandBuffer3D; scene: BoundedScene3D }) {
  const capacity = options.commands.instanceSceneHandles.length, scene = options.scene;
  const seen = new Uint32Array(capacity), previousSeen = new Uint8Array(capacity);
  const matrices = new Float32Array(capacity * 16), meshes = new Uint32Array(capacity), skeletons = new Int32Array(capacity);
  const palette = new Float32Array(scene.skeletonMatrices.length), jointCounts = new Uint32Array(scene.skeletonJointCounts.length);
  const skinSeen = new Uint32Array(jointCounts.length), previousSkinSeen = new Uint8Array(jointCounts.length);
  const morphs = new Map<number, Float32Array>();
  const activeMorphs = new Set<number>();
  const camera = new Float32Array(19);
  let serial = 0, version = 0, epoch = -1, previousCount = 0;
  return {
    observe(input: { commands: RenderCommandBuffer3D; matrix: Float32Array; camera: readonly number[]; epoch: number }) {
      const commands = input.commands;
      if (commands.instanceCount > capacity || input.matrix.length !== 16 || input.camera.length !== 3) throw Error('Pose observation exceeds initialized layout');
      const comparable = epoch === input.epoch;
      if (!comparable) { previousSeen.fill(0);previousSkinSeen.fill(0);morphs.clear();version = 0; }
      epoch = input.epoch;serial++;
      activeMorphs.clear();
      if (serial > 0xffffffff) { seen.fill(0);skinSeen.fill(0);serial = 1; }
      let changedInstances = 0, changedSkeletons = 0, changedMorphs = 0, membershipChanged = previousCount !== commands.instanceCount, cameraChanged = false;
      for (let index = 0; index < 19; index++) {
        const value = index < 16 ? input.matrix[index]! : Math.fround(input.camera[index - 16]!);
        if (!Number.isFinite(value)) throw Error('Non-finite observed camera');
        if (camera[index] !== value) cameraChanged = true;
        camera[index] = value;
      }
      for (let command = 0; command < commands.commandCount; command++) {
        const first = commands.commandFirstInstances[command]!, count = commands.commandInstanceCounts[command]!;
        if (!count) continue;
        if (first + count > commands.instanceCount) throw Error('Observed command range exceeds instances');
        const mesh = commands.commandMeshHandles[command]!, skeleton = commands.commandSkeletonHandles[command]!;
        const weights = scene.getMesh(mesh).morphWeights;
        if (weights?.length) {
          activeMorphs.add(mesh);
          if (weights.length > 4) throw Error('Observed morph capacity exceeds renderer contract');
          let stored = morphs.get(mesh);
          if (!stored) { if (morphs.size >= capacity * 2) throw Error('Observed mesh capacity exceeded');stored = new Float32Array(4);morphs.set(mesh, stored); }
          let changed = false;
          for (let axis = 0; axis < 4; axis++) { const value = Math.fround(weights[axis] ?? 0);if (!Number.isFinite(value)) throw Error('Non-finite observed morph');if (stored[axis] !== value) changed = true;stored[axis] = value; }
          if (changed) changedMorphs++;
        } else { const stored = morphs.get(mesh);if (stored?.some(value => value !== 0)) changedMorphs++;morphs.delete(mesh); }
        if (skeleton >= 0 && skinSeen[skeleton] !== serial) {
          if (skeleton >= jointCounts.length) throw Error('Observed skeleton exceeds capacity');
          skinSeen[skeleton] = serial;
          const count = scene.skeletonJointCounts[skeleton]!, offset = scene.skeletonMatrixOffset(skeleton);
          let changed = !previousSkinSeen[skeleton] || jointCounts[skeleton] !== count;
          for (let index = offset; index < offset + count * 16; index++) { const value = scene.skeletonMatrices[index]!;if (!Number.isFinite(value)) throw Error('Non-finite observed joint');if (palette[index] !== value) changed = true;palette[index] = value; }
          jointCounts[skeleton] = count;if (changed) changedSkeletons++;
        }
        for (let instance = first; instance < first + count; instance++) {
          const handle = commands.instanceSceneHandles[instance]!;
          if (handle >= capacity || seen[handle] === serial) throw Error('Observed instance handle is invalid or duplicated');
          seen[handle] = serial;
          if (!previousSeen[handle]) membershipChanged = true;
          let changed = !previousSeen[handle] || meshes[handle] !== mesh || skeletons[handle] !== skeleton;
          for (let axis = 0; axis < 16; axis++) { const value = commands.instanceMatrices[instance * 16 + axis]!;if (!Number.isFinite(value)) throw Error('Non-finite observed transform');if (matrices[handle * 16 + axis] !== value) changed = true;matrices[handle * 16 + axis] = value; }
          meshes[handle] = mesh;skeletons[handle] = skeleton;if (changed) changedInstances++;
        }
      }
      for (let handle = 0; handle < capacity; handle++) { const visible = seen[handle] === serial;if (previousSeen[handle] && !visible) membershipChanged = true;previousSeen[handle] = Number(visible); }
      for (let handle = 0; handle < jointCounts.length; handle++) previousSkinSeen[handle] = Number(skinSeen[handle] === serial);
      for (const mesh of morphs.keys()) if (!activeMorphs.has(mesh)) morphs.delete(mesh);
      const changed = cameraChanged || membershipChanged || changedInstances > 0 || changedSkeletons > 0 || changedMorphs > 0;
      if (!comparable || changed) version++;
      previousCount = commands.instanceCount;
      return { scope: 'submitted-scene' as const, epoch, version, comparable, changed: comparable ? changed : undefined,
        cameraChanged, membershipChanged, changedInstances, changedSkeletons, changedMorphs };
    },
    dispose() { morphs.clear();activeMorphs.clear(); },
  };
}
