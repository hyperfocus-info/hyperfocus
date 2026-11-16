import { extractFrustumPlanes3D } from './frustum.ts';
import { createRenderCommandBuffer3D, MATERIAL_FLAG_SHADER_TOON_3D, MATERIAL_FLOAT_STRIDE_3D, type BoundedScene3D, type RenderCommandBuffer3D } from '../3d-scene.ts';

/** Includes clip-space toon outline expansion; material arrays may change directly. */
export function writeCameraFrustum3D(scene: BoundedScene3D, viewProjection: ArrayLike<number>, planes: Float32Array, paddedMatrix: Float32Array): Float32Array {
  if (viewProjection.length < 16) throw new RangeError('viewProjection needs at least 16 elements.');
  let outline = 0;
  for (let material = 0; material < scene.materialFlags.length; material++) {
    if (scene.materialFlags[material]! & MATERIAL_FLAG_SHADER_TOON_3D) outline = Math.max(outline, scene.materialData[material * MATERIAL_FLOAT_STRIDE_3D + 23]!);
  }
  for (let i = 0; i < 16; i++) paddedMatrix[i] = viewProjection[i]! / (i % 4 < 2 ? 1 + outline : 1);
  return extractFrustumPlanes3D(planes, paddedMatrix);
}

/** Reuses bounded pass buffers. Results are borrowed until the next compile. */
export function createSceneViewCompiler3D(scene: BoundedScene3D, commands: RenderCommandBuffer3D) {
  const cameraPlanes = new Float32Array(24), shadowPlanes = new Float32Array(24), paddedMatrix = new Float32Array(16);
  let shadowCommands: RenderCommandBuffer3D | undefined;
  return (viewProjection: ArrayLike<number>, shadowViewProjection?: ArrayLike<number>) => {
    // The outline shader expands clip-space xy by width * w. Expand the side
    // planes by the largest authored NDC width; near/far planes stay unchanged.
    // Public material arrays support direct writes. A mutation revision cannot
    // observe those writes; keep this bounded scan until that contract changes.
    scene.compile(commands, { frustumPlanes: writeCameraFrustum3D(scene, viewProjection, cameraPlanes, paddedMatrix) });
    if (!shadowViewProjection) return { commands };
    shadowCommands ??= createRenderCommandBuffer3D({ commands: commands.commandMeshHandles.length, instances: commands.instanceSceneHandles.length, lights: commands.lightTypes.length });
    scene.compile(shadowCommands, { frustumPlanes: extractFrustumPlanes3D(shadowPlanes, shadowViewProjection) });
    return { commands, shadowCommands };
  };
}
