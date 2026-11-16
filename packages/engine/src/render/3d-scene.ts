import { createFixedSlotPool } from './three/slot-pool.ts';
import { instanceIntersectsFrustum, packLights } from './three/scene-compiler-support.ts';
import type { BoundedScene3DState } from './three/scene-state.ts';
import { TransformHierarchy3D, createTransformHierarchy3D } from "./3d-core.ts";
import { prepareTextureReplacement } from './three/texture-replacement.ts';
export { createParticleSceneBinding3D, particleQuad3D } from './three/particle-scene.ts';
import { createInstanceAppearance3D, DEFAULT_INSTANCE_APPEARANCE_3D, validateInstanceAppearance3D, writeInstanceAppearance3D, type InstanceAppearance3D } from './three/instance-appearance.ts';
export type { InstanceAppearance3D } from './three/instance-appearance.ts';
import {
  LIGHT_KIND_AMBIENT_3D,
  LIGHT_KIND_DIRECTIONAL_3D,
  LIGHT_KIND_SPOT_3D,
  computeMeshBounds,
  copyBounds,
  lightKindCode,
  maxJointIndex,
  validateBounds,
  validateMesh,
  validatePaletteMatrices,
  validateTexture,
  writeBounds
} from "./three/scene-validation.ts";
import {
  MATERIAL_FLAG_CUTAWAY_3D, MATERIAL_FLAG_ADDITIVE_3D, MATERIAL_FLAG_ALPHA_BLEND_3D, MATERIAL_FLAG_ALPHA_MASK_3D, MATERIAL_FLAG_DOUBLE_SIDED_3D, MATERIAL_FLAG_EMISSIVE_TEXTURED_3D, MATERIAL_FLAG_LIT_3D,
  MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D, MATERIAL_FLAG_NORMAL_TEXTURED_3D, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D,
  MATERIAL_FLAG_SHADER_HOLOGRAM_3D, MATERIAL_FLAG_SHADER_RETRO_3D, MATERIAL_FLAG_SHADER_TOON_3D, MATERIAL_FLAG_SKINNED_3D,
  MATERIAL_FLAG_TEXTURED_3D, MATERIAL_FLOAT_STRIDE_3D, MATERIAL_TEXTURE_STRIDE_3D, type Material3D,
} from "./materials/contracts.ts";
import { writePackedMaterial3D } from "./materials/packed-material.ts";
export type { Material3D, MaterialAlphaMode3D, MaterialShading3D, MaterialShader3D, MaterialToon3D } from "./materials/contracts.ts";
export {
  MATERIAL_FLOAT_STRIDE_3D, MATERIAL_TEXTURE_STRIDE_3D,
  MATERIAL_TEXTURE_BASE_COLOR_3D, MATERIAL_TEXTURE_METALLIC_ROUGHNESS_3D, MATERIAL_TEXTURE_NORMAL_3D,
  MATERIAL_TEXTURE_OCCLUSION_3D, MATERIAL_TEXTURE_EMISSIVE_3D,
  MATERIAL_FLAG_DOUBLE_SIDED_3D, MATERIAL_FLAG_ALPHA_MASK_3D, MATERIAL_FLAG_TEXTURED_3D,
  MATERIAL_FLAG_LIT_3D, MATERIAL_FLAG_SKINNED_3D, MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D,
  MATERIAL_FLAG_NORMAL_TEXTURED_3D, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D, MATERIAL_FLAG_EMISSIVE_TEXTURED_3D,
  MATERIAL_FLAG_CUTAWAY_3D, MATERIAL_FLAG_SHADER_TOON_3D, MATERIAL_FLAG_SHADER_RETRO_3D, MATERIAL_FLAG_SHADER_HOLOGRAM_3D, MATERIAL_FLAG_ALPHA_BLEND_3D, MATERIAL_FLAG_ADDITIVE_3D,
} from "./materials/contracts.ts";
export { LIGHT_KIND_AMBIENT_3D, LIGHT_KIND_DIRECTIONAL_3D, LIGHT_KIND_POINT_3D, LIGHT_KIND_SPOT_3D } from "./three/scene-validation.ts";

export type MeshTopology3D = "triangle-list" | "line-list";
export type IndexBuffer3D = Uint16Array | Uint32Array;
export type LightKind3D = "ambient" | "directional" | "point" | "spot";
export type TextureFilter3D = "nearest" | "linear";
export type TextureWrap3D = "clamp" | "repeat";
export type TexturePixels3D = Uint8Array | Uint8ClampedArray;

export interface MeshGeometry3D {
  /** Borrowed immutable data. Keep these arrays alive until the mesh is destroyed. */
  positions: Float32Array;
  indices?: IndexBuffer3D;
  normals?: Float32Array;
  uvs?: Float32Array;
  /** Packed JOINTS_0 uvec4 values. Must be paired with weights. */
  joints?: Uint8Array | Uint16Array;
  /** Packed normalized WEIGHTS_0 vec4 values. Must be paired with joints. */
  weights?: Float32Array;
  /** Up to four packed position-delta targets. Targets are evaluated before skinning. */
  morphPositions?: readonly Float32Array[];
  /** Per-mesh target weights; all instances of this mesh share the current values. */
  morphWeights?: ArrayLike<number>;
  topology?: MeshTopology3D;
  label?: string;
  /** Optional local-space sphere. Computed from positions when omitted. */
  bounds?: Readonly<{ x: number; y: number; z: number; radius: number }>;
}

export interface TextureResource3D {
  width: number;
  height: number;
  /** Borrowed immutable RGBA8 pixels, row-major from the top-left by default. */
  pixels: TexturePixels3D;
  filter?: TextureFilter3D;
  wrapU?: TextureWrap3D;
  wrapV?: TextureWrap3D;
  mipmaps?: boolean;
  flipY?: boolean;
  label?: string;
}

export interface Light3D {
  kind: LightKind3D;
  position?: ArrayLike<number>;
  direction?: ArrayLike<number>;
  color?: ArrayLike<number>;
  intensity?: number;
  range?: number;
  innerConeRadians?: number;
  outerConeRadians?: number;
  layerMask?: number;
  enabled?: boolean;
}

export interface SceneInstance3D {
  appearance?: InstanceAppearance3D;
  mesh: number;
  material: number;
  transform: number;
  bounds?: Readonly<{ x: number; y: number; z: number; radius: number }>;
  layerMask?: number;
  visible?: boolean;
  /** Required for skinned materials and meshes; omitted for static instances. */
  skeleton?: number;
}

export type LodLevel3D = {
  /** Inclusive upper distance for this mesh; the final level may use Infinity. */
  maxDistance: number;
  mesh: number;
};

export type TerrainChunkCoordinate3D = { x: number; z: number };
export type TerrainChunkAsset3D = { geometry: MeshGeometry3D; material: number; y?: number };
export type TerrainStreamer3DOptions = {
  scene: BoundedScene3D;
  chunkSize: number;
  radius: number;
  maxLoadedChunks: number;
  maxConcurrentLoads?: number;
  load(coordinate: TerrainChunkCoordinate3D, signal: AbortSignal): Promise<TerrainChunkAsset3D>;
};
export type TerrainStreamer3DStats = { loaded: number; pending: number; loads: number; unloads: number; failures: number };

export interface SceneLimits3D {
  transforms: number;
  meshes: number;
  materials: number;
  lights: number;
  instances: number;
  /** Defaults to zero for backwards-compatible untextured scenes. */
  textures?: number;
  /** Required and positive when textures is greater than zero. */
  textureBytes?: number;
  /** Defaults to zero for backwards-compatible static scenes. */
  skeletons?: number;
  /** Fixed palette stride for every skeleton slot. Required when skeletons is enabled. */
  jointsPerSkeleton?: number;
}

export interface RenderCommandLimits3D {
  commands: number;
  instances: number;
  lights: number;
}

export interface CompileScene3DOptions {
  /** Omit to disable frustum culling. */
  frustumPlanes?: ArrayLike<number>;
  /** Camera-visible layers. Defaults to all 32 bits. */
  layerMask?: number;
}

export const LIGHT_FLOAT_STRIDE_3D = 16;
export const RENDER_COMMAND_FLAG_SKINNED_3D = 1;
const MATRIX_STRIDE = 16;
const BOUNDS_STRIDE = 4;
const UINT32_MAX = 0xffff_ffff;
const EPSILON = 1e-12;

function requireCapacity(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be a non-negative uint32 integer; received ${value}.`);
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite; received ${value}.`);
  return value;
}

function finiteAt(values: ArrayLike<number> | undefined, index: number, fallback: number, label: string): number {
  if (!values || values[index] === undefined) return fallback;
  return finite(values[index], `${label}[${index}]`);
}

function uintMask(value: number | undefined): number {
  if (value === undefined) return UINT32_MAX;
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`layerMask must be a uint32 integer; received ${value}.`);
  }
  return value >>> 0;
}


interface RenderScratch3D {
  visibleInstances: Uint32Array;
  visibleCommands: Uint32Array;
  commandWriteCursors: Uint32Array;
  hashCommands: Int32Array;
}

const renderScratch = new WeakMap<RenderCommandBuffer3D, RenderScratch3D>();
const boundedScenes = new WeakSet<object>();
const sceneStorage = new WeakMap<BoundedScene3D, BoundedScene3DState>();
const endpointScenes = new WeakSet<BoundedScene3DState>();

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/** Reusable, caller-owned output suitable for direct backend uploads. */
export type RenderCommandBuffer3D = {
  readonly commandMeshHandles: Uint32Array;
  readonly commandMaterialHandles: Uint32Array;
  readonly commandFirstInstances: Uint32Array;
  readonly commandInstanceCounts: Uint32Array;
  readonly commandSkeletonHandles: Int32Array;
  readonly commandFlags: Uint32Array;
  readonly instanceSceneHandles: Uint32Array;
  readonly instanceMatrices: Float32Array;
  /** Allocated lazily only for scenes that use per-instance tint/atlas rectangles. */
  instanceAppearance?: Float32Array;
  readonly lightTypes: Uint32Array;
  readonly lightSceneHandles: Uint32Array;
  readonly lightData: Float32Array;
  commandCount: number;
  instanceCount: number;
  lightCount: number;
  testedInstances: number;
  visibleInstances: number;
  culledInstances: number;
  filteredInstances: number;
  invalidTransformInstances: number;
  invalidSkeletonInstances: number;
  truncatedInstances: number;
  commandLimitedInstances: number;
  matchingLights: number;
  truncatedLights: number;
};

export function RenderCommandBuffer3D(limits: RenderCommandLimits3D): RenderCommandBuffer3D {
  const commandCapacity = requireCapacity(limits.commands, "commands");
  const instanceCapacity = requireCapacity(limits.instances, "instances");
  const lightCapacity = requireCapacity(limits.lights, "lights");
  const commandSkeletonHandles = new Int32Array(commandCapacity);
  commandSkeletonHandles.fill(-1);
  const buffer: RenderCommandBuffer3D = {
    commandMeshHandles: new Uint32Array(commandCapacity), commandMaterialHandles: new Uint32Array(commandCapacity),
    commandFirstInstances: new Uint32Array(commandCapacity), commandInstanceCounts: new Uint32Array(commandCapacity),
    commandSkeletonHandles, commandFlags: new Uint32Array(commandCapacity), instanceSceneHandles: new Uint32Array(instanceCapacity),
    instanceMatrices: new Float32Array(instanceCapacity * MATRIX_STRIDE), lightTypes: new Uint32Array(lightCapacity),
    lightSceneHandles: new Uint32Array(lightCapacity), lightData: new Float32Array(lightCapacity * LIGHT_FLOAT_STRIDE_3D),
    commandCount: 0, instanceCount: 0, lightCount: 0, testedInstances: 0, visibleInstances: 0, culledInstances: 0,
    filteredInstances: 0, invalidTransformInstances: 0, invalidSkeletonInstances: 0, truncatedInstances: 0,
    commandLimitedInstances: 0, matchingLights: 0, truncatedLights: 0
  };
  const hashCapacity = nextPowerOfTwo(Math.max(1, commandCapacity * 2));
  renderScratch.set(buffer, {
    visibleInstances: new Uint32Array(instanceCapacity), visibleCommands: new Uint32Array(instanceCapacity),
    commandWriteCursors: new Uint32Array(commandCapacity), hashCommands: new Int32Array(hashCapacity)
  });
  return buffer;
}

export function createRenderCommandBuffer3D(limits: RenderCommandLimits3D): RenderCommandBuffer3D {
  return RenderCommandBuffer3D(limits);
}

export type BoundedScene3D = {
  readonly transforms: TransformHierarchy3D;
  readonly materialData: Float32Array;
  readonly materialFlags: Uint32Array;
  readonly materialTextureHandles: Int32Array;
  readonly skeletonMatrices: Float32Array;
  readonly skeletonJointCounts: Uint32Array;
  readonly jointsPerSkeleton: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly lightCount: number;
  readonly instanceCount: number;
  readonly textureCount: number;
  readonly textureBytes: number;
  readonly textureByteLimit: number;
  readonly skeletonCount: number;
  registerMesh(geometry: MeshGeometry3D): number;
  getMesh(handle: number): MeshGeometry3D;
  isMaterialActive(handle: number): boolean;
  registerTexture(texture: TextureResource3D): number;
  replaceTexture(options: { handle: number; width: number; height: number; pixels: Uint8Array | Uint8ClampedArray }): void;
  getTexture(handle: number): TextureResource3D;
  isTextureActive(handle: number): boolean;
  destroyTexture(handle: number): void;
  createSkeleton(jointCount: number, matrices?: ArrayLike<number>): number;
  setSkeletonMatrices(handle: number, matrices: ArrayLike<number>): void;
  skeletonMatrixOffset(handle: number): number;
  isSkeletonActive(handle: number): boolean;
  destroySkeleton(handle: number): void;
  destroyMesh(handle: number): void;
  createMaterial(material?: Material3D): number;
  updateMaterial(handle: number, material: Material3D): void;
  destroyMaterial(handle: number): void;
  createLight(light: Light3D): number;
  updateLight(handle: number, light: Light3D): void;
  destroyLight(handle: number): void;
  createInstance(instance: SceneInstance3D): number;
  destroyInstance(handle: number): void;
  setInstanceVisible(handle: number, visible: boolean): void;
  setInstanceAppearance(handle: number, appearance: InstanceAppearance3D): void;
  setInstanceMesh(handle: number, meshHandle: number): void;
  setInstanceMaterial(handle: number, materialHandle: number): void;
  /** Apply mesh/material/visibility together; unchanged static records avoid repeated validation and writes. Resets mesh bounds like setInstanceMesh. */
  setInstancePresentation(handle: number, meshHandle: number, materialHandle: number, visible: boolean): void;
  setInstanceLayerMask(handle: number, layerMask: number): void;
  setInstanceBounds(handle: number, bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void;
  destroyTransform(handle: number): void;
  compile(out: RenderCommandBuffer3D, options?: CompileScene3DOptions): RenderCommandBuffer3D;
};

export function createBoundedScene3D(limits: SceneLimits3D): BoundedScene3D {
  const transforms = requireCapacity(limits.transforms, "transforms");
  const meshes = requireCapacity(limits.meshes, "meshes");
  const materials = requireCapacity(limits.materials, "materials");
  const lights = requireCapacity(limits.lights, "lights");
  const instances = requireCapacity(limits.instances, "instances");
  const textures = requireCapacity(limits.textures ?? 0, "textures");
  const textureBytes = requireCapacity(limits.textureBytes ?? 0, "textureBytes");
  const skeletons = requireCapacity(limits.skeletons ?? 0, "skeletons");
  const jointsPerSkeleton = requireCapacity(limits.jointsPerSkeleton ?? 0, "jointsPerSkeleton");
  if (textures > 0 && textureBytes === 0) throw new RangeError("textureBytes must be positive when texture capacity is enabled.");
  if (skeletons > 0 && jointsPerSkeleton === 0) throw new RangeError("jointsPerSkeleton must be positive when skeleton capacity is enabled.");
  const materialTextureHandles = new Int32Array(materials * MATERIAL_TEXTURE_STRIDE_3D); materialTextureHandles.fill(-1);
  const instanceSkeletons = new Int32Array(instances); instanceSkeletons.fill(-1);
  const scene: BoundedScene3DState = {
    transforms: createTransformHierarchy3D(transforms),
    meshPool: createFixedSlotPool(meshes, "mesh"), materialPool: createFixedSlotPool(materials, "material"),
    texturePool: createFixedSlotPool(textures, "texture"), lightPool: createFixedSlotPool(lights, "light"),
    instancePool: createFixedSlotPool(instances, "instance"), skeletonPool: createFixedSlotPool(skeletons, "skeleton"),
    meshes: new Array(meshes), meshBounds: new Float32Array(meshes * BOUNDS_STRIDE),
    materialData: new Float32Array(materials * MATERIAL_FLOAT_STRIDE_3D), materialFlags: new Uint32Array(materials),
    materialTextureHandles, jointsPerSkeleton, skeletonMatrices: new Float32Array(skeletons * jointsPerSkeleton * MATRIX_STRIDE),
    skeletonJointCounts: new Uint32Array(skeletons), lightTypes: new Uint8Array(lights), lightData: new Float32Array(lights * LIGHT_FLOAT_STRIDE_3D),
    lightLayerMasks: new Uint32Array(lights), lightEnabled: new Uint8Array(lights), instanceMeshes: new Uint32Array(instances),
    instanceMaterials: new Uint32Array(instances), instanceTransforms: new Uint32Array(instances),
    instanceBounds: new Float32Array(instances * BOUNDS_STRIDE), instanceLayerMasks: new Uint32Array(instances),
    instanceVisible: new Uint8Array(instances), instanceSkeletons, textures: new Array(textures),
    textureByteLimit: textureBytes, textureBytes: 0
  };
  const api: BoundedScene3D = {
    transforms: scene.transforms, materialData: scene.materialData, materialFlags: scene.materialFlags,
    materialTextureHandles: scene.materialTextureHandles, skeletonMatrices: scene.skeletonMatrices,
    skeletonJointCounts: scene.skeletonJointCounts, jointsPerSkeleton: scene.jointsPerSkeleton,
    get meshCount() { return scene.meshPool.count; }, get materialCount() { return scene.materialPool.count; },
    get lightCount() { return scene.lightPool.count; }, get instanceCount() { return scene.instancePool.count; },
    get textureCount() { return scene.texturePool.count; }, get textureBytes() { return scene.textureBytes; },
    get textureByteLimit() { return scene.textureByteLimit; }, get skeletonCount() { return scene.skeletonPool.count; },
    registerMesh: (geometry) => registerMesh(scene, geometry),
    getMesh: (handle) => getMesh(scene, handle),
    isMaterialActive: (handle) => isMaterialActive(scene, handle),
    registerTexture: (texture) => registerTexture(scene, texture),
    replaceTexture: ({ handle, width, height, pixels }) => replaceTexture(scene, handle, width, height, pixels),
    getTexture: (handle) => getTexture(scene, handle),
    isTextureActive: (handle) => isTextureActive(scene, handle),
    destroyTexture: (handle) => destroyTexture(scene, handle),
    createSkeleton: (jointCount, matrices) => createSkeleton(scene, jointCount, matrices),
    setSkeletonMatrices: (handle, matrices) => setSkeletonMatrices(scene, handle, matrices),
    skeletonMatrixOffset: (handle) => skeletonMatrixOffset(scene, handle),
    isSkeletonActive: (handle) => isSkeletonActive(scene, handle),
    destroySkeleton: (handle) => destroySkeleton(scene, handle),
    destroyMesh: (handle) => destroyMesh(scene, handle),
    createMaterial: (material) => createMaterial(scene, material),
    updateMaterial: (handle, material) => updateMaterial(scene, handle, material),
    destroyMaterial: (handle) => destroyMaterial(scene, handle),
    createLight: (light) => createLight(scene, light),
    updateLight: (handle, light) => updateLight(scene, handle, light),
    destroyLight: (handle) => destroyLight(scene, handle),
    createInstance: (instance) => createInstance(scene, instance),
    destroyInstance: (handle) => destroyInstance(scene, handle),
    setInstanceVisible: (handle, visible) => setInstanceVisible(scene, handle, visible),
    setInstanceAppearance: (handle, appearance) => {
      scene.instancePool.assert(handle);validateInstanceAppearance3D(appearance);
      scene.instanceAppearance ??= createInstanceAppearance3D(instances);writeInstanceAppearance3D(scene.instanceAppearance, handle, appearance);
    },
    setInstanceMesh: (handle, meshHandle) => setInstanceMesh(scene, handle, meshHandle),
    setInstancePresentation: (handle, mesh, material, visible) => setInstancePresentation(scene, handle, mesh, material, visible),
    setInstanceMaterial: (handle, materialHandle) => setInstanceMaterial(scene, handle, materialHandle),
    setInstanceLayerMask: (handle, layerMask) => setInstanceLayerMask(scene, handle, layerMask),
    setInstanceBounds: (handle, bounds) => setInstanceBounds(scene, handle, bounds),
    destroyTransform: (handle) => destroyTransform(scene, handle),
    compile: (out, options) => compile(scene, out, options),
  };
  boundedScenes.add(api);
  sceneStorage.set(api, scene);
  return api;
}

/** Exclusive endpoint owner: renderer storage may remain stale after acquisition.
 * Acquisition permanently disables compilation, including previously captured
 * aliases. Bootstrap packet capacities must be captured first. The endpoint
 * consumer owns its own scene and performs full application before rendering.
 */
export function acquireSceneEndpointWriter3D(api: BoundedScene3D) {
  const scene = sceneStorage.get(api);
  if (!scene) throw new TypeError('Endpoint producer requires a bounded scene.');
  if (endpointScenes.has(scene)) throw new Error('Scene already belongs to an endpoint producer.');
  endpointScenes.add(scene);
  const scratch = new Float32Array(MATERIAL_FLOAT_STRIDE_3D);
  return {
    storageBytes: scratch.byteLength,
    instance(handle: number, mesh: number, material: number) {
      validateInstanceMesh(scene, handle, mesh);
      validateInstanceMaterial(scene, handle, material, mesh);
    },
    material(handle: number, value: Material3D) {
      return prepareMaterial(scene, handle, value, scratch, 0);
    },
    materialResources(handle: number, textures: readonly number[], skinned: boolean) {
      scene.materialPool.assert(handle);
      validateMaterialResources(scene, handle, textures, skinned);
    },
  };
}
export type SceneEndpointWriter3D = ReturnType<typeof acquireSceneEndpointWriter3D>;

export function BoundedScene3D(limits: SceneLimits3D): BoundedScene3D {
  return createBoundedScene3D(limits);
}

function registerMesh(scene: BoundedScene3DState, geometry: MeshGeometry3D): number {
    validateMesh(geometry);
    const handle = scene.meshPool.allocate();
    scene.meshes[handle] = geometry;
    const bounds = geometry.bounds ?? computeMeshBounds(geometry.positions);
    writeBounds(scene.meshBounds, handle * BOUNDS_STRIDE, bounds);
    return handle;
  }

function getMesh(scene: BoundedScene3DState, handle: number): MeshGeometry3D {
    return requireMesh(scene, handle);
  }

function requireMesh(scene: BoundedScene3DState, handle: number): MeshGeometry3D {
  scene.meshPool.assert(handle);
  const mesh = scene.meshes[handle];
  if (!mesh) throw new Error(`active mesh ${handle} has no geometry`);
  return mesh;
}

function isMaterialActive(scene: BoundedScene3DState, handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < scene.materialPool.active.length
      && scene.materialPool.active[handle] !== 0;
  }

function registerTexture(scene: BoundedScene3DState, texture: TextureResource3D): number {
    validateTexture(texture);
    const nextBytes = scene.textureBytes + texture.pixels.byteLength;
    if (!Number.isSafeInteger(nextBytes) || nextBytes > scene.textureByteLimit) {
      throw new RangeError(`texture byte budget ${scene.textureByteLimit} would be exceeded by ${texture.pixels.byteLength} bytes (used ${scene.textureBytes}).`);
    }
    const handle = scene.texturePool.allocate();
    scene.textures[handle] = texture;
    scene.textureBytes = nextBytes;
    return handle;
  }

function getTexture(scene: BoundedScene3DState, handle: number): TextureResource3D {
    return requireTexture(scene, handle);
  }

function requireTexture(scene: BoundedScene3DState, handle: number): TextureResource3D {
  scene.texturePool.assert(handle);
  const texture = scene.textures[handle];
  if (!texture) throw new Error(`active texture ${handle} has no resource`);
  return texture;
}

function replaceTexture(scene: BoundedScene3DState, handle: number, width: number, height: number, pixels: Uint8Array | Uint8ClampedArray): void {
  const next = prepareTextureReplacement(requireTexture(scene, handle), width, height, pixels, scene.textureBytes, scene.textureByteLimit);
  scene.textures[handle] = next.resource;scene.textureBytes = next.bytes;
}

function isTextureActive(scene: BoundedScene3DState, handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < scene.texturePool.active.length
      && scene.texturePool.active[handle] !== 0;
  }

function destroyTexture(scene: BoundedScene3DState, handle: number): void {
    scene.texturePool.assert(handle);
    for (let material = 0; material < scene.materialPool.active.length; material += 1) {
      const offset = material * MATERIAL_TEXTURE_STRIDE_3D;
      if (scene.materialPool.active[material] !== 0 && scene.materialTextureHandles.subarray(offset, offset + MATERIAL_TEXTURE_STRIDE_3D).includes(handle)) {
        throw new Error(`texture ${handle} is still referenced by material ${material}.`);
      }
    }
    const texture = requireTexture(scene, handle);
    scene.textureBytes -= texture.pixels.byteLength;
    scene.textures[handle] = undefined;
    scene.texturePool.release(handle);
  }

function createSkeleton(scene: BoundedScene3DState, jointCount: number, matrices?: ArrayLike<number>): number {
    jointCount = requireCapacity(jointCount, "jointCount");
    if (jointCount === 0 || jointCount > scene.jointsPerSkeleton) {
      throw new RangeError(`jointCount must be from 1 through jointsPerSkeleton ${scene.jointsPerSkeleton}; received ${jointCount}.`);
    }
    validatePaletteMatrices(matrices, jointCount);
    const handle = scene.skeletonPool.allocate();
    scene.skeletonJointCounts[handle] = jointCount;
    const slotOffset = handle * scene.jointsPerSkeleton * MATRIX_STRIDE;
    scene.skeletonMatrices.fill(0, slotOffset, slotOffset + scene.jointsPerSkeleton * MATRIX_STRIDE);
    for (let joint = 0; joint < jointCount; joint += 1) {
      const offset = slotOffset + joint * MATRIX_STRIDE;
      scene.skeletonMatrices[offset] = 1; scene.skeletonMatrices[offset + 5] = 1;
      scene.skeletonMatrices[offset + 10] = 1; scene.skeletonMatrices[offset + 15] = 1;
    }
    if (matrices) copyPalette(scene, handle, matrices);
    return handle;
  }

function setSkeletonMatrices(scene: BoundedScene3DState, handle: number, matrices: ArrayLike<number>): void {
    scene.skeletonPool.assert(handle);
    validatePaletteMatrices(matrices, scene.skeletonJointCounts[handle]);
    copyPalette(scene, handle, matrices);
  }

function skeletonMatrixOffset(scene: BoundedScene3DState, handle: number): number {
    scene.skeletonPool.assert(handle);
    return handle * scene.jointsPerSkeleton * MATRIX_STRIDE;
  }

function isSkeletonActive(scene: BoundedScene3DState, handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < scene.skeletonPool.active.length
      && scene.skeletonPool.active[handle] !== 0;
  }

function destroySkeleton(scene: BoundedScene3DState, handle: number): void {
    scene.skeletonPool.assert(handle);
    assertResourceUnused(scene, scene.instanceSkeletons, handle, "skeleton");
    scene.skeletonJointCounts[handle] = 0;
    scene.skeletonPool.release(handle);
  }

function destroyMesh(scene: BoundedScene3DState, handle: number): void {
    scene.meshPool.assert(handle);
    assertResourceUnused(scene, scene.instanceMeshes, handle, "mesh");
    scene.meshes[handle] = undefined;
    scene.meshPool.release(handle);
  }

function createMaterial(scene: BoundedScene3DState, material: Material3D = {}): number {
    const handle = scene.materialPool.allocate();
    try {
      updateMaterial(scene, handle, material);
      return handle;
    } catch (error) {
      scene.materialPool.release(handle);
      throw error;
    }
  }

function updateMaterial(scene: BoundedScene3DState, handle: number, material: Material3D): void {
    const textureHandles = prepareMaterial(scene, handle, material, scene.materialData, handle * MATERIAL_FLOAT_STRIDE_3D);
    writeMaterialFlags(scene, handle, material, textureHandles);
  }

function prepareMaterial(scene: BoundedScene3DState, handle: number, material: Material3D, data: Float32Array, offset: number): number[] {
    scene.materialPool.assert(handle);
    if (material.alphaMode !== undefined && material.alphaMode !== "opaque" && material.alphaMode !== "mask" && material.alphaMode !== "blend" && material.alphaMode !== "additive") {
      throw new RangeError(`unsupported alphaMode ${String(material.alphaMode)}.`);
    }
    if (material.shading !== undefined && material.shading !== "unlit" && material.shading !== "lit") {
      throw new RangeError(`unsupported material shading ${String(material.shading)}.`);
    }
    if (material.shader !== undefined && !["pbr", "toon", "retro", "hologram"].includes(material.shader)) throw new RangeError(`unsupported material shader ${String(material.shader)}.`);
    const textureHandles = [material.baseColorTexture, material.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture].map((texture) => texture ?? -1);
    validateMaterialResources(scene, handle, textureHandles, material.skinning === true);
    writePackedMaterial3D(data, offset, material);
    return textureHandles;
  }

function validateMaterialResources(scene: BoundedScene3DState, handle: number, textures: readonly number[], skinned: boolean) {
    for (const texture of textures) if (texture !== -1) scene.texturePool.assert(texture);
    if (((scene.materialFlags[handle]! & MATERIAL_FLAG_SKINNED_3D) !== 0) !== skinned) validateMaterialSkinningForInstances(scene, handle, skinned);
  }

function writeMaterialFlags(scene: BoundedScene3DState, handle: number, material: Material3D, textureHandles: readonly number[]) {
    scene.materialFlags[handle] = (material.doubleSided ? MATERIAL_FLAG_DOUBLE_SIDED_3D : 0)
      | (material.alphaMode === "mask" ? MATERIAL_FLAG_ALPHA_MASK_3D : 0)
      | (material.alphaMode === "blend" || material.alphaMode === "additive" ? MATERIAL_FLAG_ALPHA_BLEND_3D : 0)
      | (material.alphaMode === "additive" ? MATERIAL_FLAG_ADDITIVE_3D : 0)
      | (material.cutaway ? MATERIAL_FLAG_CUTAWAY_3D : 0)
      | (textureHandles[0] !== -1 ? MATERIAL_FLAG_TEXTURED_3D : 0)
      | (material.shading === "lit" ? MATERIAL_FLAG_LIT_3D : 0)
      | (material.skinning ? MATERIAL_FLAG_SKINNED_3D : 0)
      | (textureHandles[1] !== -1 ? MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D : 0)
      | (textureHandles[2] !== -1 ? MATERIAL_FLAG_NORMAL_TEXTURED_3D : 0)
      | (textureHandles[3] !== -1 ? MATERIAL_FLAG_OCCLUSION_TEXTURED_3D : 0)
      | (textureHandles[4] !== -1 ? MATERIAL_FLAG_EMISSIVE_TEXTURED_3D : 0)
      | (material.shader === "toon" ? MATERIAL_FLAG_SHADER_TOON_3D : 0)
      | (material.shader === "retro" ? MATERIAL_FLAG_SHADER_RETRO_3D : 0)
      | (material.shader === "hologram" ? MATERIAL_FLAG_SHADER_HOLOGRAM_3D : 0);
    scene.materialTextureHandles.set(textureHandles, handle * MATERIAL_TEXTURE_STRIDE_3D);
  }

function destroyMaterial(scene: BoundedScene3DState, handle: number): void {
    scene.materialPool.assert(handle);
    assertResourceUnused(scene, scene.instanceMaterials, handle, "material");
    scene.materialPool.release(handle);
    scene.materialFlags[handle] = 0;
    scene.materialTextureHandles.fill(-1, handle * MATERIAL_TEXTURE_STRIDE_3D, (handle + 1) * MATERIAL_TEXTURE_STRIDE_3D);
  }

function createLight(scene: BoundedScene3DState, light: Light3D): number {
    const handle = scene.lightPool.allocate();
    try {
      updateLight(scene, handle, light);
      return handle;
    } catch (error) {
      scene.lightPool.release(handle);
      throw error;
    }
  }

function updateLight(scene: BoundedScene3DState, handle: number, light: Light3D): void {
    scene.lightPool.assert(handle);
    const type = lightKindCode(light.kind);
    const offset = handle * LIGHT_FLOAT_STRIDE_3D;
    const px = finiteAt(light.position, 0, 0, "position"), py = finiteAt(light.position, 1, 0, "position"), pz = finiteAt(light.position, 2, 0, "position");
    let dx = finiteAt(light.direction, 0, 0, "direction"), dy = finiteAt(light.direction, 1, -1, "direction"), dz = finiteAt(light.direction, 2, 0, "direction");
    const directionLength = Math.hypot(dx, dy, dz);
    if ((type === LIGHT_KIND_DIRECTIONAL_3D || type === LIGHT_KIND_SPOT_3D) && directionLength <= EPSILON) {
      throw new RangeError("directional and spot lights require a non-zero direction.");
    }
    if (directionLength > EPSILON) { dx /= directionLength; dy /= directionLength; dz /= directionLength; }
    const range = type === LIGHT_KIND_DIRECTIONAL_3D || type === LIGHT_KIND_AMBIENT_3D ? 0 : finite(light.range ?? 10, "range");
    if (range < 0) throw new RangeError("light range must be non-negative.");
    const outer = finite(light.outerConeRadians ?? Math.PI / 4, "outerConeRadians");
    const inner = finite(light.innerConeRadians ?? outer * 0.8, "innerConeRadians");
    if (type === LIGHT_KIND_SPOT_3D && (inner < 0 || outer <= 0 || inner > outer || outer > Math.PI / 2)) {
      throw new RangeError("spot cones require 0 <= innerConeRadians <= outerConeRadians <= PI/2.");
    }
    const layerMask = uintMask(light.layerMask);
    const red = finiteAt(light.color, 0, 1, "color"), green = finiteAt(light.color, 1, 1, "color"), blue = finiteAt(light.color, 2, 1, "color");
    const intensity = finite(light.intensity ?? 1, "intensity");
    if (red < 0 || green < 0 || blue < 0) throw new RangeError("light color components must be non-negative.");
    if (intensity < 0) throw new RangeError("light intensity must be non-negative.");
    scene.lightTypes[handle] = type;
    scene.lightData[offset] = px; scene.lightData[offset + 1] = py; scene.lightData[offset + 2] = pz; scene.lightData[offset + 3] = range;
    scene.lightData[offset + 4] = dx; scene.lightData[offset + 5] = dy; scene.lightData[offset + 6] = dz; scene.lightData[offset + 7] = Math.cos(outer);
    scene.lightData[offset + 8] = red; scene.lightData[offset + 9] = green; scene.lightData[offset + 10] = blue;
    scene.lightData[offset + 11] = intensity;
    scene.lightData[offset + 12] = Math.cos(inner);
    scene.lightData[offset + 13] = 0; scene.lightData[offset + 14] = 0; scene.lightData[offset + 15] = 0;
    scene.lightLayerMasks[handle] = layerMask;
    scene.lightEnabled[handle] = light.enabled === false ? 0 : 1;
  }

function destroyLight(scene: BoundedScene3DState, handle: number): void {
    scene.lightPool.release(handle);
    scene.lightEnabled[handle] = 0;
  }

function createInstance(scene: BoundedScene3DState, instance: SceneInstance3D): number {
    scene.meshPool.assert(instance.mesh);
    scene.materialPool.assert(instance.material);
    assertTransform(scene, instance.transform);
    const mesh = requireMesh(scene, instance.mesh);
    const materialSkinned = (scene.materialFlags[instance.material] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined;
    const skeleton = instance.skeleton ?? -1;
    if (meshSkinned !== materialSkinned) {
      throw new Error(meshSkinned
        ? `skinned mesh ${instance.mesh} requires a material with skinning enabled.`
        : `skinned material ${instance.material} requires JOINTS_0 and WEIGHTS_0 on mesh ${instance.mesh}.`);
    }
    if (mesh.joints) {
      scene.skeletonPool.assert(skeleton);
      const maximumJoint = maxJointIndex(mesh.joints);
      if (maximumJoint >= scene.skeletonJointCounts[skeleton]) {
        throw new RangeError(`mesh ${instance.mesh} JOINTS_0 index ${maximumJoint} exceeds skeleton ${skeleton} jointCount ${scene.skeletonJointCounts[skeleton]}.`);
      }
    } else if (skeleton !== -1) throw new Error(`static mesh ${instance.mesh} cannot reference skeleton ${skeleton}.`);
    const bounds = instance.bounds;
    if (bounds) validateBounds(bounds);
    const layerMask = uintMask(instance.layerMask);
    if (instance.appearance) validateInstanceAppearance3D(instance.appearance);
    const handle = scene.instancePool.allocate();
    if (instance.appearance) scene.instanceAppearance ??= createInstanceAppearance3D(scene.instanceVisible.length);
    if (scene.instanceAppearance) writeInstanceAppearance3D(scene.instanceAppearance, handle, instance.appearance ?? {});
    scene.instanceMeshes[handle] = instance.mesh;
    scene.instanceMaterials[handle] = instance.material;
    scene.instanceTransforms[handle] = instance.transform;
    scene.instanceSkeletons[handle] = skeleton;
    if (bounds) writeBounds(scene.instanceBounds, handle * BOUNDS_STRIDE, bounds);
    else copyBounds(scene.instanceBounds, handle * BOUNDS_STRIDE, scene.meshBounds, instance.mesh * BOUNDS_STRIDE);
    scene.instanceLayerMasks[handle] = layerMask;
    scene.instanceVisible[handle] = instance.visible === false ? 0 : 1;
    return handle;
  }

function destroyInstance(scene: BoundedScene3DState, handle: number): void {
    scene.instancePool.release(handle);
    scene.instanceVisible[handle] = 0;
    scene.instanceSkeletons[handle] = -1;
  }

function setInstanceVisible(scene: BoundedScene3DState, handle: number, visible: boolean): void {
    scene.instancePool.assert(handle);
    scene.instanceVisible[handle] = visible ? 1 : 0;
  }

function setInstanceMesh(scene: BoundedScene3DState, handle: number, meshHandle: number): void {
    validateInstanceMesh(scene, handle, meshHandle);
    scene.instanceMeshes[handle] = meshHandle;
    copyBounds(scene.instanceBounds, handle * BOUNDS_STRIDE, scene.meshBounds, meshHandle * BOUNDS_STRIDE);
  }

function validateInstanceMesh(scene: BoundedScene3DState, handle: number, meshHandle: number): void {
    scene.instancePool.assert(handle);
    scene.meshPool.assert(meshHandle);
    const mesh = requireMesh(scene, meshHandle);
    const material = scene.instanceMaterials[handle];
    const skeleton = scene.instanceSkeletons[handle];
    const materialSkinned = (scene.materialFlags[material] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined && mesh.weights !== undefined;
    if (meshSkinned !== materialSkinned) throw new Error(`LOD mesh ${meshHandle} skinning is incompatible with instance ${handle} material ${material}.`);
    if (mesh.joints) {
      if (skeleton === -1 || !isSkeletonActive(scene, skeleton)) throw new Error(`LOD mesh ${meshHandle} requires an active skeleton on instance ${handle}.`);
      const maximumJoint = maxJointIndex(mesh.joints);
      if (maximumJoint >= scene.skeletonJointCounts[skeleton]) throw new RangeError(`LOD mesh ${meshHandle} JOINTS_0 index ${maximumJoint} exceeds skeleton ${skeleton} jointCount ${scene.skeletonJointCounts[skeleton]}.`);
    } else if (skeleton !== -1) throw new Error(`Static LOD mesh ${meshHandle} cannot replace skinned instance ${handle}.`);
  }

function setInstanceLayerMask(scene: BoundedScene3DState, handle: number, layerMask: number): void {
    scene.instancePool.assert(handle);
    scene.instanceLayerMasks[handle] = uintMask(layerMask);
  }

function setInstanceBounds(scene: BoundedScene3DState, handle: number, bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
    scene.instancePool.assert(handle);
    writeBounds(scene.instanceBounds, handle * BOUNDS_STRIDE, bounds);
  }

function destroyTransform(scene: BoundedScene3DState, handle: number): void {
    assertTransform(scene, handle);
    assertResourceUnused(scene, scene.instanceTransforms, handle, "transform");
    scene.transforms.destroy(handle);
  }

function compile(scene: BoundedScene3DState, out: RenderCommandBuffer3D, options: CompileScene3DOptions = {}): RenderCommandBuffer3D {
    if (endpointScenes.has(scene)) throw new Error('Endpoint producer scene cannot compile renderer output.');
    const scratch = renderScratch.get(out);
    if (!scratch) throw new TypeError("render output must be created with createRenderCommandBuffer3D.");
    resetOutput(out, scratch);
    const layerMask = uintMask(options.layerMask);
    const frustum = options.frustumPlanes;
    if (frustum && frustum.length < 24) throw new RangeError("frustumPlanes needs at least 24 elements.");
    scene.transforms.updateWorldMatrices();

    for (let instance = 0; instance < scene.instancePool.active.length; instance += 1) {
      if (scene.instancePool.active[instance] === 0) continue;
      out.testedInstances += 1;
      if (scene.instanceVisible[instance] === 0 || (scene.instanceLayerMasks[instance] & layerMask) === 0) {
        out.filteredInstances += 1;
        continue;
      }
      const transform = scene.instanceTransforms[instance];
      if (transform >= scene.transforms.capacity || scene.transforms.active[transform] === 0) {
        out.invalidTransformInstances += 1;
        continue;
      }
      const skeleton = scene.instanceSkeletons[instance];
      if (skeleton !== -1 && !isSkeletonActive(scene, skeleton)) {
        out.invalidSkeletonInstances += 1;
        continue;
      }
      if (frustum && !instanceIntersectsFrustum(scene, instance, transform, frustum)) {
        out.culledInstances += 1;
        continue;
      }
      out.visibleInstances += 1;
      if (out.instanceCount >= out.instanceSceneHandles.length) {
        out.truncatedInstances += 1;
        continue;
      }
      const mesh = scene.instanceMeshes[instance], material = scene.instanceMaterials[instance];
      const command = findOrCreateCommand(out, scratch, mesh, material, skeleton);
      if (command === -1) {
        out.commandLimitedInstances += 1;
        continue;
      }
      const accepted = out.instanceCount++;
      scratch.visibleInstances[accepted] = instance;
      scratch.visibleCommands[accepted] = command;
      out.commandInstanceCounts[command] += 1;
    }

    let firstInstance = 0;
    for (let command = 0; command < out.commandCount; command += 1) {
      out.commandFirstInstances[command] = firstInstance;
      scratch.commandWriteCursors[command] = firstInstance;
      firstInstance += out.commandInstanceCounts[command];
    }
    for (let accepted = 0; accepted < out.instanceCount; accepted += 1) {
      const instance = scratch.visibleInstances[accepted], command = scratch.visibleCommands[accepted];
      const target = scratch.commandWriteCursors[command]++;
      out.instanceSceneHandles[target] = instance;
      if (scene.instanceAppearance) out.instanceAppearance ??= createInstanceAppearance3D(out.instanceSceneHandles.length);
      if (out.instanceAppearance) for (let i = 0; i < 8; i++) out.instanceAppearance[target * 8 + i] = scene.instanceAppearance?.[instance * 8 + i] ?? DEFAULT_INSTANCE_APPEARANCE_3D[i]!;
      const transform = scene.instanceTransforms[instance];
      const sourceOffset = transform * MATRIX_STRIDE, targetOffset = target * MATRIX_STRIDE;
      for (let component = 0; component < MATRIX_STRIDE; component += 1) {
        out.instanceMatrices[targetOffset + component] = scene.transforms.worldMatrices[sourceOffset + component];
      }
    }
    packLights(scene, out, layerMask);
    return out;
  }

function assertTransform(scene: BoundedScene3DState, handle: number): void {
    if (!Number.isInteger(handle) || handle < 0 || handle >= scene.transforms.capacity || scene.transforms.active[handle] === 0) {
      throw new RangeError(`transform handle ${handle} is not active.`);
    }
  }

function assertResourceUnused(scene: BoundedScene3DState, handles: ArrayLike<number>, resource: number, label: string): void {
    for (let instance = 0; instance < scene.instancePool.active.length; instance += 1) {
      if (scene.instancePool.active[instance] !== 0 && handles[instance] === resource) {
        throw new Error(`${label} ${resource} is still referenced by instance ${instance}.`);
      }
    }
  }

function validateMaterialSkinningForInstances(scene: BoundedScene3DState, material: number, skinned: boolean): void {
    for (let instance = 0; instance < scene.instancePool.active.length; instance += 1) {
      if (scene.instancePool.active[instance] === 0 || scene.instanceMaterials[instance] !== material) continue;
      const meshHandle = scene.instanceMeshes[instance], mesh = requireMesh(scene, meshHandle);
      const meshSkinned = mesh.joints !== undefined;
      if (meshSkinned !== skinned) {
        throw new Error(`material ${material} skinning change is incompatible with instance ${instance} mesh ${meshHandle}.`);
      }
    }
  }

function copyPalette(scene: BoundedScene3DState, handle: number, matrices: ArrayLike<number>): void {
    const count = scene.skeletonJointCounts[handle] * MATRIX_STRIDE;
    const offset = handle * scene.jointsPerSkeleton * MATRIX_STRIDE;
    for (let component = 0; component < count; component += 1) scene.skeletonMatrices[offset + component] = matrices[component];
  }

/** Deterministically selects a first-party scene mesh from ordered distance bands. */
export function selectLodMesh3D(levels: readonly LodLevel3D[], distance: number): number {
  if (!Array.isArray(levels) || levels.length === 0) throw new Error("3D LOD policy requires at least one level.");
  if (!Number.isFinite(distance) || distance < 0) throw new RangeError("3D LOD distance must be non-negative and finite.");
  let previous = 0;
  for (const [index, level] of levels.entries()) {
    if (!Number.isSafeInteger(level.mesh) || level.mesh < 0) throw new RangeError(`3D LOD level ${index} mesh must be a non-negative integer handle.`);
    if (!(Number.isFinite(level.maxDistance) || level.maxDistance === Number.POSITIVE_INFINITY) || level.maxDistance <= previous) {
      throw new RangeError("3D LOD maxDistance values must be positive and strictly increasing.");
    }
    previous = level.maxDistance;
  }
  for (const level of levels) if (distance <= level.maxDistance) return level.mesh;
  return levels[levels.length - 1]!.mesh;
}

function setInstancePresentation(scene: BoundedScene3DState, handle: number, mesh: number, material: number, visible: boolean): void {
  scene.instancePool.assert(handle);
  // Inspect live storage: other consumers can replace resources, bounds and material flags.
  // Skinned meshes retain full joint-range validation because their typed arrays are mutable.
  const geometry = scene.meshes[mesh];
  if (scene.instanceMeshes[handle] !== mesh || scene.instanceMaterials[handle] !== material
    || !geometry || geometry.joints || geometry.weights || scene.instanceSkeletons[handle] !== -1
    || (scene.materialFlags[material]! & MATERIAL_FLAG_SKINNED_3D) !== 0) {
    setInstanceMesh(scene, handle, mesh);setInstanceMaterial(scene, handle, material);
  } else {
    scene.meshPool.assert(mesh);scene.materialPool.assert(material);
    const source = mesh * BOUNDS_STRIDE, target = handle * BOUNDS_STRIDE;
    for (let axis = 0; axis < BOUNDS_STRIDE; axis++) if (!Object.is(scene.instanceBounds[target + axis], scene.meshBounds[source + axis])) scene.instanceBounds[target + axis] = scene.meshBounds[source + axis]!;
  }
  const flag = visible ? 1 : 0;
  if (scene.instanceVisible[handle] !== flag) scene.instanceVisible[handle] = flag;
}

function setInstanceMaterial(scene: BoundedScene3DState, handle: number, materialHandle: number): void {
    validateInstanceMaterial(scene, handle, materialHandle, scene.instanceMeshes[handle]!);
    scene.instanceMaterials[handle] = materialHandle;
  }

function validateInstanceMaterial(scene: BoundedScene3DState, handle: number, materialHandle: number, meshHandle: number): void {
    scene.instancePool.assert(handle); scene.materialPool.assert(materialHandle);
    const mesh = requireMesh(scene, meshHandle);
    const materialSkinned = (scene.materialFlags[materialHandle] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined && mesh.weights !== undefined;
    if (meshSkinned !== materialSkinned) throw new Error(`Material ${materialHandle} skinning is incompatible with instance ${handle} mesh ${scene.instanceMeshes[handle]}.`);
  }

/** Streams square terrain regions directly into bounded first-party scene resources. */
export function createTerrainStreamer3D(options: TerrainStreamer3DOptions): {
  update(cameraX: number, cameraZ: number): Promise<TerrainStreamer3DStats>;
  stats(): TerrainStreamer3DStats;
  dispose(): void;
} {
  const scene = options.scene;
  if (!boundedScenes.has(scene)) throw new TypeError("terrain scene must be a BoundedScene3D.");
  const chunkSize = finite(options.chunkSize, "terrain chunkSize"); if (chunkSize <= 0) throw new RangeError("terrain chunkSize must be positive.");
  const radius = requireCapacity(options.radius, "terrain radius"); if (radius > 64) throw new RangeError("terrain radius cannot exceed 64 chunks.");
  const maximum = requireCapacity(options.maxLoadedChunks, "terrain maxLoadedChunks");
  const required = (radius * 2 + 1) ** 2; if (maximum < required) throw new RangeError(`terrain maxLoadedChunks must be at least ${required} for radius ${radius}.`);
  const concurrency = requireCapacity(options.maxConcurrentLoads ?? 4, "terrain maxConcurrentLoads"); if (concurrency === 0) throw new RangeError("terrain maxConcurrentLoads must be positive.");
  const loaded = new Map<string, { mesh: number; transform: number; instance: number }>();
  const controllers = new Map<string, AbortController>();
  let loads = 0, unloads = 0, failures = 0, generation = 0, disposed = false;
  const snapshot = (): TerrainStreamer3DStats => ({ loaded: loaded.size, pending: controllers.size, loads, unloads, failures });
  const key = (x: number, z: number) => `${x},${z}`;

  async function update(cameraX: number, cameraZ: number): Promise<TerrainStreamer3DStats> {
    if (disposed) throw new Error("terrain streamer is disposed.");
    cameraX = finite(cameraX, "terrain cameraX"); cameraZ = finite(cameraZ, "terrain cameraZ");
    const centerX = Math.floor(cameraX / chunkSize), centerZ = Math.floor(cameraZ / chunkSize), currentGeneration = ++generation;
    const desired = new Map<string, TerrainChunkCoordinate3D>();
    for (let z = centerZ - radius; z <= centerZ + radius; z += 1) for (let x = centerX - radius; x <= centerX + radius; x += 1) desired.set(key(x, z), { x, z });
    for (const [chunkKey, resource] of loaded) if (!desired.has(chunkKey)) {
      scene.destroyInstance(resource.instance); scene.destroyTransform(resource.transform); scene.destroyMesh(resource.mesh); loaded.delete(chunkKey); unloads += 1;
    }
    for (const [chunkKey, controller] of controllers) if (!desired.has(chunkKey)) { controller.abort(); controllers.delete(chunkKey); }
    const queue = [...desired.entries()].filter(([chunkKey]) => !loaded.has(chunkKey) && !controllers.has(chunkKey));
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const [chunkKey, coordinate] = queue[cursor++]!; const controller = new AbortController(); controllers.set(chunkKey, controller); loads += 1;
        try {
          const asset = await options.load(coordinate, controller.signal);
          if (disposed || controller.signal.aborted || generation !== currentGeneration || !desired.has(chunkKey)) continue;
          const mesh = scene.registerMesh(asset.geometry); let transform: number | undefined;
          try {
            transform = scene.transforms.create();
            scene.transforms.setPosition(transform, coordinate.x * chunkSize, finite(asset.y ?? 0, "terrain chunk y"), coordinate.z * chunkSize);
            const instance = scene.createInstance({ mesh, material: asset.material, transform }); loaded.set(chunkKey, { mesh, transform, instance });
          } catch (cause) { if (transform !== undefined) scene.destroyTransform(transform); scene.destroyMesh(mesh); throw cause; }
        } catch (cause) { if (!controller.signal.aborted) { failures += 1; throw cause; } }
        finally { if (controllers.get(chunkKey) === controller) controllers.delete(chunkKey); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    if (loaded.size > maximum) throw new Error("terrain loaded chunk count exceeded its configured bound.");
    return snapshot();
  }

  return {
    update,
    stats: snapshot,
    dispose() {
      if (disposed) return; disposed = true; generation += 1;
      for (const controller of controllers.values()) controller.abort(); controllers.clear();
      for (const resource of loaded.values()) { scene.destroyInstance(resource.instance); scene.destroyTransform(resource.transform); scene.destroyMesh(resource.mesh); }
      unloads += loaded.size; loaded.clear();
    },
  };
}

function resetOutput(out: RenderCommandBuffer3D, scratch: RenderScratch3D): void {
  out.commandCount = 0; out.instanceCount = 0; out.lightCount = 0;
  out.testedInstances = 0; out.visibleInstances = 0; out.culledInstances = 0; out.filteredInstances = 0;
  out.invalidTransformInstances = 0; out.truncatedInstances = 0; out.commandLimitedInstances = 0;
  out.invalidSkeletonInstances = 0;
  out.matchingLights = 0; out.truncatedLights = 0;
  out.commandInstanceCounts.fill(0);
  scratch.hashCommands.fill(-1);
}

function findOrCreateCommand(
  out: RenderCommandBuffer3D,
  scratch: RenderScratch3D,
  mesh: number,
  material: number,
  skeleton: number
): number {
  const hash = (Math.imul(mesh + 1, -1640531527) ^ Math.imul(material + 1, -2048144789) ^ Math.imul(skeleton + 2, -1028477387)) >>> 0;
  const mask = scratch.hashCommands.length - 1;
  let slot = hash & mask;
  while (scratch.hashCommands[slot] !== -1) {
    const command = scratch.hashCommands[slot];
    if (out.commandMeshHandles[command] === mesh
      && out.commandMaterialHandles[command] === material
      && out.commandSkeletonHandles[command] === skeleton) return command;
    slot = (slot + 1) & mask;
  }
  if (out.commandCount >= out.commandMeshHandles.length) return -1;
  const command = out.commandCount++;
  out.commandMeshHandles[command] = mesh;
  out.commandMaterialHandles[command] = material;
  out.commandSkeletonHandles[command] = skeleton;
  out.commandFlags[command] = skeleton === -1 ? 0 : RENDER_COMMAND_FLAG_SKINNED_3D;
  scratch.hashCommands[slot] = command;
  return command;
}
