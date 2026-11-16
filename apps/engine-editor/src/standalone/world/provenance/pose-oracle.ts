import type { BoundedScene3D, RenderCommandBuffer3D } from '@hyperfocus/engine/render/3d-scene';

/** Allocating reference for manual diagnostics only. No retained identity/cache.
 * Reconstructs each submitted instance independently, then canonicalizes order.
 * Immutable mesh geometry is identified by handle, not scanned as animation. */
export function canonicalSubmittedPose(input: { scene: BoundedScene3D; commands: RenderCommandBuffer3D; matrix: Float32Array; camera: readonly number[] }) {
  const { commands, scene } = input;
  const instances: Array<{ handle: number; mesh: number; skeleton: number; matrix: number[]; joints: number[]; morph: number[] }> = [];
  for (let command = 0; command < commands.commandCount; command++) {
    const mesh = commands.commandMeshHandles[command]!, skeleton = commands.commandSkeletonHandles[command]!;
    const geometry = scene.getMesh(mesh), first = commands.commandFirstInstances[command]!, end = first + commands.commandInstanceCounts[command]!;
    for (let instance = first; instance < end; instance++) {
      const offset = skeleton < 0 ? 0 : scene.skeletonMatrixOffset(skeleton);
      instances.push({ handle: commands.instanceSceneHandles[instance]!, mesh, skeleton,
        matrix: Array.from(commands.instanceMatrices.subarray(instance * 16, (instance + 1) * 16)),
        joints: skeleton < 0 ? [] : Array.from(scene.skeletonMatrices.subarray(offset, offset + scene.skeletonJointCounts[skeleton]! * 16)),
        morph: Array.from({ length: 4 }, (_, index) => Math.fround(geometry.morphWeights?.[index] ?? 0)) });
    }
  }
  instances.sort((a, b) => a.handle - b.handle);
  return { camera: [...input.matrix, ...input.camera.map(Math.fround)], instances };
}
