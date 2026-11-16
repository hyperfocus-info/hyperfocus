import type { TransformHierarchy3D } from '../3d-core.ts';
import { LIGHT_FLOAT_STRIDE_3D, type MeshGeometry3D, type RenderCommandBuffer3D } from '../3d-scene.ts';

const MATRIX_STRIDE = 16, BOUNDS_STRIDE = 4;
type SceneCompilationSource3D = {
  transforms: TransformHierarchy3D;
  meshes: Array<MeshGeometry3D | undefined>;
  instanceMeshes: Uint32Array;
  instanceSkeletons: Int32Array;
  instanceBounds: Float32Array;
  lightPool: { active: Uint8Array };
  lightEnabled: Uint8Array;
  lightLayerMasks: Uint32Array;
  lightTypes: Uint8Array;
  lightData: Float32Array;
};

export function instanceIntersectsFrustum(scene: SceneCompilationSource3D, instance: number, transform: number, planes: ArrayLike<number>): boolean {
    // Rest-pose bounds do not enclose arbitrary skin/morph deformation.
    const mesh = scene.meshes[scene.instanceMeshes[instance]];
    if (scene.instanceSkeletons[instance] >= 0 || mesh?.morphPositions?.length) return true;
    return transformedSphereIntersectsFrustum3D(scene.transforms.worldMatrices, transform * MATRIX_STRIDE, scene.instanceBounds, instance * BOUNDS_STRIDE, planes);
  }

/** Conservative sphere support under affine transforms, including hierarchy shear. */
export function transformedSphereIntersectsFrustum3D(matrix: ArrayLike<number>, matrixOffset: number, bounds: ArrayLike<number>, boundsOffset: number, planes: ArrayLike<number>): boolean {
    const x = bounds[boundsOffset], y = bounds[boundsOffset + 1], z = bounds[boundsOffset + 2];
    const worldX = matrix[matrixOffset] * x + matrix[matrixOffset + 4] * y + matrix[matrixOffset + 8] * z + matrix[matrixOffset + 12];
    const worldY = matrix[matrixOffset + 1] * x + matrix[matrixOffset + 5] * y + matrix[matrixOffset + 9] * z + matrix[matrixOffset + 13];
    const worldZ = matrix[matrixOffset + 2] * x + matrix[matrixOffset + 6] * y + matrix[matrixOffset + 10] * z + matrix[matrixOffset + 14];
    const radius = bounds[boundsOffset + 3];
    // Project the transformed sphere onto each plane. This remains conservative
    // under nonuniform scale and hierarchy shear (largest column length does not).
    for (let plane = 0; plane < 24; plane += 4) {
      const nx = planes[plane], ny = planes[plane + 1], nz = planes[plane + 2];
      const distance = nx * worldX + ny * worldY + nz * worldZ + planes[plane + 3];
      if (distance >= 0) continue;
      const ax = nx * matrix[matrixOffset] + ny * matrix[matrixOffset + 1] + nz * matrix[matrixOffset + 2];
      const ay = nx * matrix[matrixOffset + 4] + ny * matrix[matrixOffset + 5] + nz * matrix[matrixOffset + 6];
      const az = nx * matrix[matrixOffset + 8] + ny * matrix[matrixOffset + 9] + nz * matrix[matrixOffset + 10];
      if (distance < -radius * Math.hypot(ax, ay, az) - 1e-5) return false;
    }
    return true;
  }

export function packLights(scene: SceneCompilationSource3D, out: RenderCommandBuffer3D, layerMask: number): void {
    for (let light = 0; light < scene.lightPool.active.length; light += 1) {
      if (scene.lightPool.active[light] === 0 || scene.lightEnabled[light] === 0 || (scene.lightLayerMasks[light] & layerMask) === 0) continue;
      out.matchingLights += 1;
      if (out.lightCount >= out.lightTypes.length) { out.truncatedLights += 1; continue; }
      const target = out.lightCount++;
      out.lightTypes[target] = scene.lightTypes[light];
      out.lightSceneHandles[target] = light;
      const sourceOffset = light * LIGHT_FLOAT_STRIDE_3D, targetOffset = target * LIGHT_FLOAT_STRIDE_3D;
      for (let component = 0; component < LIGHT_FLOAT_STRIDE_3D; component += 1) {
        out.lightData[targetOffset + component] = scene.lightData[sourceOffset + component];
      }
    }
  }
