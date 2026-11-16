import type { TransformHierarchy3D } from '../3d-core.ts';
import type { MeshGeometry3D, TextureResource3D } from '../3d-scene.ts';

import type { FixedSlotPool } from './slot-pool.ts';

/** Private storage contract; the public scene exposes validated operations. */
export type BoundedScene3DState = {
  readonly transforms: TransformHierarchy3D;
  readonly materialData: Float32Array;
  readonly materialFlags: Uint32Array;
  readonly materialTextureHandles: Int32Array;
  readonly skeletonMatrices: Float32Array;
  readonly skeletonJointCounts: Uint32Array;
  readonly jointsPerSkeleton: number;
  readonly meshes: Array<MeshGeometry3D | undefined>;
  readonly meshBounds: Float32Array;
  readonly meshPool: FixedSlotPool;
  readonly materialPool: FixedSlotPool;
  readonly texturePool: FixedSlotPool;
  readonly lightPool: FixedSlotPool;
  readonly instancePool: FixedSlotPool;
  readonly skeletonPool: FixedSlotPool;
  readonly lightTypes: Uint8Array;
  readonly lightData: Float32Array;
  readonly lightLayerMasks: Uint32Array;
  readonly lightEnabled: Uint8Array;
  readonly instanceMeshes: Uint32Array;
  readonly instanceMaterials: Uint32Array;
  readonly instanceTransforms: Uint32Array;
  readonly instanceBounds: Float32Array;
  readonly instanceLayerMasks: Uint32Array;
  readonly instanceVisible: Uint8Array;
  readonly instanceSkeletons: Int32Array;
  instanceAppearance?: Float32Array;
  readonly textures: Array<TextureResource3D | undefined>;
  readonly textureByteLimit: number;
  textureBytes: number;
};
