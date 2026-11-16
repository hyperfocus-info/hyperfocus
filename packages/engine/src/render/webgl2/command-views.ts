import { extractFrustumPlanes3D } from '../three/frustum.ts';
import {
  createRenderCommandBuffer3D, LIGHT_FLOAT_STRIDE_3D, MATERIAL_FLOAT_STRIDE_3D,
  MATERIAL_TEXTURE_STRIDE_3D, MATERIAL_FLAG_LIT_3D, MATERIAL_FLAG_SHADER_TOON_3D,
  MATERIAL_FLAG_TEXTURED_3D, MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D,
  MATERIAL_FLAG_NORMAL_TEXTURED_3D, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D,
  MATERIAL_FLAG_EMISSIVE_TEXTURED_3D, MATERIAL_FLAG_SKINNED_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  type BoundedScene3D, type MeshGeometry3D, type RenderCommandBuffer3D,
} from '../3d-scene.ts';
import { transformedSphereIntersectsFrustum3D } from '../three/scene-compiler-support.ts';
import { computeMeshBounds } from '../three/scene-validation.ts';
import { writeCameraFrustum3D } from '../three/view-compiler.ts';

const TEXTURE_FLAGS = MATERIAL_FLAG_TEXTURED_3D | MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D
  | MATERIAL_FLAG_NORMAL_TEXTURED_3D | MATERIAL_FLAG_OCCLUSION_TEXTURED_3D | MATERIAL_FLAG_EMISSIVE_TEXTURED_3D;

/**
 * Stable, bounded views of an already sorted packet, using its matrices rather
 * than the scene's current transforms. Results are borrowed until the next call.
 * Mesh positions/bounds follow the scene's borrowed immutable geometry contract.
 * Unsupported or invalid inputs keep the original packet and its native renderer
 * validation path. Resource liveness is checked every call, including offscreen
 * commands; a cached geometric bound is never a resource-liveness certificate.
 * This favors large offscreen populations. Fully visible packets still incur
 * tests/copies; a deforming or invalid command falls back for the whole packet.
 */
export function createCommandViews3D(scene: BoundedScene3D, template: RenderCommandBuffer3D, maxInstances: number, options: { maxTextureSize?: number } = {}) {
  const camera = createCommandView3D(scene, template, maxInstances, true, options.maxTextureSize);
  let shadow: ReturnType<typeof createCommandView3D> | undefined;
  const result: { commands: RenderCommandBuffer3D; shadowCommands?: RenderCommandBuffer3D } = { commands: template };
  return (source: RenderCommandBuffer3D, viewProjection: ArrayLike<number>, shadowViewProjection?: ArrayLike<number>) => {
    result.commands = camera(source, viewProjection);
    result.shadowCommands = shadowViewProjection
      ? (shadow ??= createCommandView3D(scene, source, maxInstances, false, options.maxTextureSize))(source, shadowViewProjection)
      : undefined;
    return result;
  };
}

function createCommandView3D(scene: BoundedScene3D, template: RenderCommandBuffer3D, maxInstances: number, outlines: boolean, maxTextureSize = Infinity) {
  const output = createRenderCommandBuffer3D({ commands: template.commandMeshHandles.length, instances: maxInstances, lights: template.lightTypes.length });
  const planes = new Float32Array(24), paddedMatrix = new Float32Array(16);
  // Do not narrow computed centers/radii: midpoint rounding at large coordinates
  // can shift the sphere inward by much more than the intersection epsilon.
  const bounds = new WeakMap<MeshGeometry3D, Float64Array>();
  let appearance: Float32Array | undefined;
  return (source: RenderCommandBuffer3D, viewProjection: ArrayLike<number>): RenderCommandBuffer3D => {
    if (source.commandCount > output.commandMeshHandles.length || source.lightCount > output.lightTypes.length
      || source.commandCount > source.commandMaterialHandles.length || source.commandCount > source.commandSkeletonHandles.length
      || source.commandCount > source.commandFlags.length || source.instanceMatrices.length < source.instanceCount * 16
      || (source.instanceAppearance && source.instanceAppearance.length < source.instanceCount * 8)) return source;
    // Custom matrix accessors and exceptional matrices retain the original path.
    // This optimization must not introduce the frustum extractor's extra errors.
    if (!(viewProjection instanceof Float32Array || viewProjection instanceof Float64Array) || viewProjection.length < 16) return source;
    for (let i = 0; i < 16; i++) if (!Number.isFinite(viewProjection[i])) return source;
    let referenced = 0;
    for (let command = 0; command < source.commandCount; command++) {
      const count = source.commandInstanceCounts[command], first = source.commandFirstInstances[command];
      if (!Number.isSafeInteger(count) || !Number.isSafeInteger(first) || first + count > source.instanceCount) return source;
      referenced += count;
    }
    // Legal packets may reuse ranges. Compacting them must not overflow storage.
    if (referenced > maxInstances) return source;
    try {
      if (outlines) writeCameraFrustum3D(scene, viewProjection, planes, paddedMatrix);
      else extractFrustumPlanes3D(planes, viewProjection);
    } catch { return source; }
    for (let i = 0; i < 24; i++) if (!Number.isFinite(planes[i])) return source;
    output.commandCount = 0; output.instanceCount = 0;
    for (let command = 0; command < source.commandCount; command++) {
      const count = source.commandInstanceCounts[command];
      if (count === 0) continue;
      let mesh: MeshGeometry3D;
      try { mesh = scene.getMesh(source.commandMeshHandles[command]); }
      catch { return source; }
      const material = source.commandMaterialHandles[command], flags = scene.materialFlags[material];
      if (!scene.isMaterialActive(material) || (material + 1) * MATERIAL_FLOAT_STRIDE_3D > scene.materialData.length) return source;
      if (((flags & MATERIAL_FLAG_LIT_3D) || ((flags & MATERIAL_FLAG_SHADER_TOON_3D) && scene.materialData[material * MATERIAL_FLOAT_STRIDE_3D + 23] > 0)) && !mesh.normals) return source;
      if ((flags & TEXTURE_FLAGS) && !mesh.uvs) return source;
      const textureOffset = material * MATERIAL_TEXTURE_STRIDE_3D;
      for (let slot = 0; slot < MATERIAL_TEXTURE_STRIDE_3D; slot++) {
        const handle = scene.materialTextureHandles[textureOffset + slot];
        if (slot === 0 ? !(flags & MATERIAL_FLAG_TEXTURED_3D) : handle === -1) continue;
        try {
          const texture = scene.getTexture(handle);
          if (texture.width > maxTextureSize || texture.height > maxTextureSize) return source;
        } catch { return source; }
      }
      // Keep the whole packet for deformation, including mismatched skin state:
      // rest bounds are insufficient and native errors contain command indices.
      if (source.commandSkeletonHandles[command] >= 0 || (source.commandFlags[command] & RENDER_COMMAND_FLAG_SKINNED_3D)
        || (flags & MATERIAL_FLAG_SKINNED_3D) || mesh.joints || mesh.weights || mesh.morphPositions?.length || mesh.morphWeights) return source;
      let sphere = bounds.get(mesh);
      if (!sphere) {
        const value = mesh.bounds ?? computeMeshBounds(mesh.positions);
        sphere = new Float64Array([value.x, value.y, value.z, value.radius]);
        if (!sphere.every(Number.isFinite) || sphere[3] < 0) return source;
        bounds.set(mesh, sphere);
      }
      const first = source.commandFirstInstances[command], end = first + count, targetFirst = output.instanceCount;
      for (let instance = first; instance < end; instance++) {
        const offset = instance * 16, matrix = source.instanceMatrices;
        // The sphere support formula is affine. Do not reject projective or
        // nonfinite packet transforms whose native GPU behavior is unchanged.
        if (matrix[offset + 3] !== 0 || matrix[offset + 7] !== 0 || matrix[offset + 11] !== 0 || matrix[offset + 15] !== 1) return source;
        for (let axis = 0; axis < 16; axis++) if (!Number.isFinite(matrix[offset + axis])) return source;
        if (!transformedSphereIntersectsFrustum3D(matrix, offset, sphere, 0, planes)) continue;
        const target = output.instanceCount++;
        output.instanceSceneHandles[target] = source.instanceSceneHandles[instance];
        for (let axis = 0; axis < 16; axis++) output.instanceMatrices[target * 16 + axis] = matrix[offset + axis];
        if (source.instanceAppearance) {
          appearance ??= new Float32Array(maxInstances * 8);
          for (let axis = 0; axis < 8; axis++) appearance[target * 8 + axis] = source.instanceAppearance[instance * 8 + axis];
        }
      }
      if (output.instanceCount === targetFirst) continue;
      const target = output.commandCount++;
      output.commandMeshHandles[target] = source.commandMeshHandles[command];
      output.commandMaterialHandles[target] = material;
      output.commandSkeletonHandles[target] = source.commandSkeletonHandles[command];
      output.commandFlags[target] = source.commandFlags[command];
      output.commandFirstInstances[target] = targetFirst;
      output.commandInstanceCounts[target] = output.instanceCount - targetFirst;
    }
    if (output.instanceCount === referenced) return source;
    output.instanceAppearance = source.instanceAppearance ? appearance : undefined;
    output.lightCount = source.lightCount;
    output.lightTypes.set(source.lightTypes.subarray(0, source.lightCount));
    output.lightSceneHandles.set(source.lightSceneHandles.subarray(0, source.lightCount));
    output.lightData.set(source.lightData.subarray(0, source.lightCount * LIGHT_FLOAT_STRIDE_3D));
    output.testedInstances = source.testedInstances; output.visibleInstances = output.instanceCount;
    output.culledInstances = source.culledInstances + referenced - output.instanceCount;
    output.filteredInstances = source.filteredInstances; output.invalidTransformInstances = source.invalidTransformInstances;
    output.invalidSkeletonInstances = source.invalidSkeletonInstances; output.truncatedInstances = source.truncatedInstances;
    output.commandLimitedInstances = source.commandLimitedInstances; output.matchingLights = source.matchingLights;
    output.truncatedLights = source.truncatedLights;
    return output;
  };
}
