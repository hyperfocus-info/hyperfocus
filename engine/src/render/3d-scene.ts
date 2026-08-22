import {
  TransformHierarchy3D,
  createTransformHierarchy3D,
  sphereIntersectsFrustum3D
} from "./3d-core.ts";

export type MeshTopology3D = "triangle-list" | "line-list";
export type IndexBuffer3D = Uint16Array | Uint32Array;
export type MaterialAlphaMode3D = "opaque" | "mask";
export type MaterialShading3D = "unlit" | "lit";
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

export interface Material3D {
  baseColor?: ArrayLike<number>;
  emissive?: ArrayLike<number>;
  metallic?: number;
  roughness?: number;
  alphaMode?: MaterialAlphaMode3D;
  alphaCutoff?: number;
  doubleSided?: boolean;
  shading?: MaterialShading3D;
  baseColorTexture?: number;
  /** Enables the skeletal shader path and requires skinned mesh streams. */
  skinning?: boolean;
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

export const MATERIAL_FLOAT_STRIDE_3D = 12;
export const LIGHT_FLOAT_STRIDE_3D = 16;
export const MATERIAL_FLAG_DOUBLE_SIDED_3D = 1;
export const MATERIAL_FLAG_ALPHA_MASK_3D = 2;
export const MATERIAL_FLAG_TEXTURED_3D = 4;
export const MATERIAL_FLAG_LIT_3D = 8;
export const MATERIAL_FLAG_SKINNED_3D = 16;
export const RENDER_COMMAND_FLAG_SKINNED_3D = 1;
export const LIGHT_KIND_DIRECTIONAL_3D = 0;
export const LIGHT_KIND_POINT_3D = 1;
export const LIGHT_KIND_SPOT_3D = 2;
export const LIGHT_KIND_AMBIENT_3D = 3;

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

function unitInterval(value: number, label: string): number {
  value = finite(value, label);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1; received ${value}.`);
  return value;
}

function uintMask(value: number | undefined): number {
  if (value === undefined) return UINT32_MAX;
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`layerMask must be a uint32 integer; received ${value}.`);
  }
  return value >>> 0;
}

class FixedSlotPool {
  readonly active: Uint8Array;
  readonly #free: Uint32Array;
  readonly #label: string;
  #freeCount: number;
  #count = 0;

  constructor(capacity: number, label: string) {
    this.active = new Uint8Array(capacity);
    this.#free = new Uint32Array(capacity);
    this.#label = label;
    this.#freeCount = capacity;
    for (let index = 0; index < capacity; index += 1) this.#free[index] = capacity - index - 1;
  }

  get count(): number { return this.#count; }

  allocate(): number {
    if (this.#freeCount === 0) throw new RangeError(`${this.#label} registry capacity ${this.active.length} is exhausted.`);
    const handle = this.#free[--this.#freeCount];
    this.active[handle] = 1;
    this.#count += 1;
    return handle;
  }

  release(handle: number): void {
    this.assert(handle);
    this.active[handle] = 0;
    this.#free[this.#freeCount++] = handle;
    this.#count -= 1;
  }

  assert(handle: number): void {
    if (!Number.isInteger(handle) || handle < 0 || handle >= this.active.length || this.active[handle] === 0) {
      throw new RangeError(`${this.#label} handle ${handle} is not active.`);
    }
  }
}

interface RenderScratch3D {
  visibleInstances: Uint32Array;
  visibleCommands: Uint32Array;
  commandWriteCursors: Uint32Array;
  hashCommands: Int32Array;
}

const renderScratch = new WeakMap<RenderCommandBuffer3D, RenderScratch3D>();

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/** Reusable, caller-owned output suitable for direct backend uploads. */
export class RenderCommandBuffer3D {
  readonly commandMeshHandles: Uint32Array;
  readonly commandMaterialHandles: Uint32Array;
  readonly commandFirstInstances: Uint32Array;
  readonly commandInstanceCounts: Uint32Array;
  readonly commandSkeletonHandles: Int32Array;
  readonly commandFlags: Uint32Array;
  readonly instanceSceneHandles: Uint32Array;
  readonly instanceMatrices: Float32Array;
  readonly lightTypes: Uint32Array;
  readonly lightSceneHandles: Uint32Array;
  /** Packed as position/range, direction/outer-cosine, color/intensity, inner-cosine/reserved. */
  readonly lightData: Float32Array;

  commandCount = 0;
  instanceCount = 0;
  lightCount = 0;
  testedInstances = 0;
  visibleInstances = 0;
  culledInstances = 0;
  filteredInstances = 0;
  invalidTransformInstances = 0;
  invalidSkeletonInstances = 0;
  truncatedInstances = 0;
  commandLimitedInstances = 0;
  matchingLights = 0;
  truncatedLights = 0;

  constructor(limits: RenderCommandLimits3D) {
    const commandCapacity = requireCapacity(limits.commands, "commands");
    const instanceCapacity = requireCapacity(limits.instances, "instances");
    const lightCapacity = requireCapacity(limits.lights, "lights");
    this.commandMeshHandles = new Uint32Array(commandCapacity);
    this.commandMaterialHandles = new Uint32Array(commandCapacity);
    this.commandFirstInstances = new Uint32Array(commandCapacity);
    this.commandInstanceCounts = new Uint32Array(commandCapacity);
    this.commandSkeletonHandles = new Int32Array(commandCapacity); this.commandSkeletonHandles.fill(-1);
    this.commandFlags = new Uint32Array(commandCapacity);
    this.instanceSceneHandles = new Uint32Array(instanceCapacity);
    this.instanceMatrices = new Float32Array(instanceCapacity * MATRIX_STRIDE);
    this.lightTypes = new Uint32Array(lightCapacity);
    this.lightSceneHandles = new Uint32Array(lightCapacity);
    this.lightData = new Float32Array(lightCapacity * LIGHT_FLOAT_STRIDE_3D);
    const hashCapacity = nextPowerOfTwo(Math.max(1, commandCapacity * 2));
    renderScratch.set(this, {
      visibleInstances: new Uint32Array(instanceCapacity),
      visibleCommands: new Uint32Array(instanceCapacity),
      commandWriteCursors: new Uint32Array(commandCapacity),
      hashCommands: new Int32Array(hashCapacity)
    });
  }
}

export function createRenderCommandBuffer3D(limits: RenderCommandLimits3D): RenderCommandBuffer3D {
  return new RenderCommandBuffer3D(limits);
}

export class BoundedScene3D {
  readonly transforms: TransformHierarchy3D;
  readonly materialData: Float32Array;
  readonly materialFlags: Uint32Array;
  readonly materialTextureHandles: Int32Array;
  /** Caller-writable column-major palettes, with jointsPerSkeleton * 16 floats per skeleton handle. */
  readonly skeletonMatrices: Float32Array;
  readonly skeletonJointCounts: Uint32Array;
  readonly jointsPerSkeleton: number;

  readonly #meshes: Array<MeshGeometry3D | undefined>;
  readonly #meshBounds: Float32Array;
  readonly #meshPool: FixedSlotPool;
  readonly #materialPool: FixedSlotPool;
  readonly #texturePool: FixedSlotPool;
  readonly #lightPool: FixedSlotPool;
  readonly #instancePool: FixedSlotPool;
  readonly #skeletonPool: FixedSlotPool;
  readonly #lightTypes: Uint8Array;
  readonly #lightData: Float32Array;
  readonly #lightLayerMasks: Uint32Array;
  readonly #lightEnabled: Uint8Array;
  readonly #instanceMeshes: Uint32Array;
  readonly #instanceMaterials: Uint32Array;
  readonly #instanceTransforms: Uint32Array;
  readonly #instanceBounds: Float32Array;
  readonly #instanceLayerMasks: Uint32Array;
  readonly #instanceVisible: Uint8Array;
  readonly #instanceSkeletons: Int32Array;
  readonly #textures: Array<TextureResource3D | undefined>;
  readonly #textureByteLimit: number;
  #textureBytes = 0;

  constructor(limits: SceneLimits3D) {
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
    this.transforms = createTransformHierarchy3D(transforms);
    this.#meshPool = new FixedSlotPool(meshes, "mesh");
    this.#materialPool = new FixedSlotPool(materials, "material");
    this.#texturePool = new FixedSlotPool(textures, "texture");
    this.#lightPool = new FixedSlotPool(lights, "light");
    this.#instancePool = new FixedSlotPool(instances, "instance");
    this.#skeletonPool = new FixedSlotPool(skeletons, "skeleton");
    this.#meshes = new Array(meshes);
    this.#meshBounds = new Float32Array(meshes * BOUNDS_STRIDE);
    this.materialData = new Float32Array(materials * MATERIAL_FLOAT_STRIDE_3D);
    this.materialFlags = new Uint32Array(materials);
    this.materialTextureHandles = new Int32Array(materials); this.materialTextureHandles.fill(-1);
    this.jointsPerSkeleton = jointsPerSkeleton;
    this.skeletonMatrices = new Float32Array(skeletons * jointsPerSkeleton * MATRIX_STRIDE);
    this.skeletonJointCounts = new Uint32Array(skeletons);
    this.#lightTypes = new Uint8Array(lights);
    this.#lightData = new Float32Array(lights * LIGHT_FLOAT_STRIDE_3D);
    this.#lightLayerMasks = new Uint32Array(lights);
    this.#lightEnabled = new Uint8Array(lights);
    this.#instanceMeshes = new Uint32Array(instances);
    this.#instanceMaterials = new Uint32Array(instances);
    this.#instanceTransforms = new Uint32Array(instances);
    this.#instanceBounds = new Float32Array(instances * BOUNDS_STRIDE);
    this.#instanceLayerMasks = new Uint32Array(instances);
    this.#instanceVisible = new Uint8Array(instances);
    this.#instanceSkeletons = new Int32Array(instances); this.#instanceSkeletons.fill(-1);
    this.#textures = new Array(textures);
    this.#textureByteLimit = textureBytes;
  }

  get meshCount(): number { return this.#meshPool.count; }
  get materialCount(): number { return this.#materialPool.count; }
  get lightCount(): number { return this.#lightPool.count; }
  get instanceCount(): number { return this.#instancePool.count; }
  get textureCount(): number { return this.#texturePool.count; }
  get textureBytes(): number { return this.#textureBytes; }
  get textureByteLimit(): number { return this.#textureByteLimit; }
  get skeletonCount(): number { return this.#skeletonPool.count; }

  registerMesh(geometry: MeshGeometry3D): number {
    validateMesh(geometry);
    const handle = this.#meshPool.allocate();
    this.#meshes[handle] = geometry;
    const bounds = geometry.bounds ?? computeMeshBounds(geometry.positions);
    writeBounds(this.#meshBounds, handle * BOUNDS_STRIDE, bounds);
    return handle;
  }

  getMesh(handle: number): MeshGeometry3D {
    this.#meshPool.assert(handle);
    return this.#meshes[handle] as MeshGeometry3D;
  }

  isMaterialActive(handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < this.#materialPool.active.length
      && this.#materialPool.active[handle] !== 0;
  }

  registerTexture(texture: TextureResource3D): number {
    validateTexture(texture);
    const nextBytes = this.#textureBytes + texture.pixels.byteLength;
    if (!Number.isSafeInteger(nextBytes) || nextBytes > this.#textureByteLimit) {
      throw new RangeError(`texture byte budget ${this.#textureByteLimit} would be exceeded by ${texture.pixels.byteLength} bytes (used ${this.#textureBytes}).`);
    }
    const handle = this.#texturePool.allocate();
    this.#textures[handle] = texture;
    this.#textureBytes = nextBytes;
    return handle;
  }

  getTexture(handle: number): TextureResource3D {
    this.#texturePool.assert(handle);
    return this.#textures[handle] as TextureResource3D;
  }

  isTextureActive(handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < this.#texturePool.active.length
      && this.#texturePool.active[handle] !== 0;
  }

  destroyTexture(handle: number): void {
    this.#texturePool.assert(handle);
    for (let material = 0; material < this.#materialPool.active.length; material += 1) {
      if (this.#materialPool.active[material] !== 0 && this.materialTextureHandles[material] === handle) {
        throw new Error(`texture ${handle} is still referenced by material ${material}.`);
      }
    }
    const texture = this.#textures[handle] as TextureResource3D;
    this.#textureBytes -= texture.pixels.byteLength;
    this.#textures[handle] = undefined;
    this.#texturePool.release(handle);
  }

  createSkeleton(jointCount: number, matrices?: ArrayLike<number>): number {
    jointCount = requireCapacity(jointCount, "jointCount");
    if (jointCount === 0 || jointCount > this.jointsPerSkeleton) {
      throw new RangeError(`jointCount must be from 1 through jointsPerSkeleton ${this.jointsPerSkeleton}; received ${jointCount}.`);
    }
    validatePaletteMatrices(matrices, jointCount);
    const handle = this.#skeletonPool.allocate();
    this.skeletonJointCounts[handle] = jointCount;
    const slotOffset = handle * this.jointsPerSkeleton * MATRIX_STRIDE;
    this.skeletonMatrices.fill(0, slotOffset, slotOffset + this.jointsPerSkeleton * MATRIX_STRIDE);
    for (let joint = 0; joint < jointCount; joint += 1) {
      const offset = slotOffset + joint * MATRIX_STRIDE;
      this.skeletonMatrices[offset] = 1; this.skeletonMatrices[offset + 5] = 1;
      this.skeletonMatrices[offset + 10] = 1; this.skeletonMatrices[offset + 15] = 1;
    }
    if (matrices) this.#copyPalette(handle, matrices);
    return handle;
  }

  setSkeletonMatrices(handle: number, matrices: ArrayLike<number>): void {
    this.#skeletonPool.assert(handle);
    validatePaletteMatrices(matrices, this.skeletonJointCounts[handle]);
    this.#copyPalette(handle, matrices);
  }

  skeletonMatrixOffset(handle: number): number {
    this.#skeletonPool.assert(handle);
    return handle * this.jointsPerSkeleton * MATRIX_STRIDE;
  }

  isSkeletonActive(handle: number): boolean {
    return Number.isInteger(handle)
      && handle >= 0
      && handle < this.#skeletonPool.active.length
      && this.#skeletonPool.active[handle] !== 0;
  }

  destroySkeleton(handle: number): void {
    this.#skeletonPool.assert(handle);
    this.#assertResourceUnused(this.#instanceSkeletons, handle, "skeleton");
    this.skeletonJointCounts[handle] = 0;
    this.#skeletonPool.release(handle);
  }

  destroyMesh(handle: number): void {
    this.#meshPool.assert(handle);
    this.#assertResourceUnused(this.#instanceMeshes, handle, "mesh");
    this.#meshes[handle] = undefined;
    this.#meshPool.release(handle);
  }

  createMaterial(material: Material3D = {}): number {
    const handle = this.#materialPool.allocate();
    try {
      this.updateMaterial(handle, material);
      return handle;
    } catch (error) {
      this.#materialPool.release(handle);
      throw error;
    }
  }

  updateMaterial(handle: number, material: Material3D): void {
    this.#materialPool.assert(handle);
    if (material.alphaMode !== undefined && material.alphaMode !== "opaque" && material.alphaMode !== "mask") {
      throw new RangeError(`unsupported alphaMode ${String(material.alphaMode)}.`);
    }
    if (material.shading !== undefined && material.shading !== "unlit" && material.shading !== "lit") {
      throw new RangeError(`unsupported material shading ${String(material.shading)}.`);
    }
    const texture = material.baseColorTexture ?? -1;
    if (texture !== -1) this.#texturePool.assert(texture);
    this.#validateMaterialSkinningForInstances(handle, material.skinning === true);
    const baseR = finiteAt(material.baseColor, 0, 1, "baseColor");
    const baseG = finiteAt(material.baseColor, 1, 1, "baseColor");
    const baseB = finiteAt(material.baseColor, 2, 1, "baseColor");
    const baseA = unitInterval(finiteAt(material.baseColor, 3, 1, "baseColor"), "baseColor[3]");
    const emissiveR = finiteAt(material.emissive, 0, 0, "emissive");
    const emissiveG = finiteAt(material.emissive, 1, 0, "emissive");
    const emissiveB = finiteAt(material.emissive, 2, 0, "emissive");
    const metallic = unitInterval(material.metallic ?? 0, "metallic");
    const roughness = unitInterval(material.roughness ?? 1, "roughness");
    const alphaCutoff = unitInterval(material.alphaCutoff ?? 0.5, "alphaCutoff");
    const offset = handle * MATERIAL_FLOAT_STRIDE_3D;
    this.materialData[offset] = baseR; this.materialData[offset + 1] = baseG;
    this.materialData[offset + 2] = baseB; this.materialData[offset + 3] = baseA;
    this.materialData[offset + 4] = emissiveR; this.materialData[offset + 5] = emissiveG; this.materialData[offset + 6] = emissiveB;
    this.materialData[offset + 7] = metallic; this.materialData[offset + 8] = roughness; this.materialData[offset + 9] = alphaCutoff;
    this.materialData[offset + 10] = 0;
    this.materialData[offset + 11] = 0;
    this.materialFlags[handle] = (material.doubleSided ? MATERIAL_FLAG_DOUBLE_SIDED_3D : 0)
      | (material.alphaMode === "mask" ? MATERIAL_FLAG_ALPHA_MASK_3D : 0)
      | (texture !== -1 ? MATERIAL_FLAG_TEXTURED_3D : 0)
      | (material.shading === "lit" ? MATERIAL_FLAG_LIT_3D : 0)
      | (material.skinning ? MATERIAL_FLAG_SKINNED_3D : 0);
    this.materialTextureHandles[handle] = texture;
  }

  destroyMaterial(handle: number): void {
    this.#materialPool.assert(handle);
    this.#assertResourceUnused(this.#instanceMaterials, handle, "material");
    this.#materialPool.release(handle);
    this.materialTextureHandles[handle] = -1;
  }

  createLight(light: Light3D): number {
    const handle = this.#lightPool.allocate();
    try {
      this.updateLight(handle, light);
      return handle;
    } catch (error) {
      this.#lightPool.release(handle);
      throw error;
    }
  }

  updateLight(handle: number, light: Light3D): void {
    this.#lightPool.assert(handle);
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
    this.#lightTypes[handle] = type;
    this.#lightData[offset] = px; this.#lightData[offset + 1] = py; this.#lightData[offset + 2] = pz; this.#lightData[offset + 3] = range;
    this.#lightData[offset + 4] = dx; this.#lightData[offset + 5] = dy; this.#lightData[offset + 6] = dz; this.#lightData[offset + 7] = Math.cos(outer);
    this.#lightData[offset + 8] = red; this.#lightData[offset + 9] = green; this.#lightData[offset + 10] = blue;
    this.#lightData[offset + 11] = intensity;
    this.#lightData[offset + 12] = Math.cos(inner);
    this.#lightData[offset + 13] = 0; this.#lightData[offset + 14] = 0; this.#lightData[offset + 15] = 0;
    this.#lightLayerMasks[handle] = layerMask;
    this.#lightEnabled[handle] = light.enabled === false ? 0 : 1;
  }

  destroyLight(handle: number): void {
    this.#lightPool.release(handle);
    this.#lightEnabled[handle] = 0;
  }

  createInstance(instance: SceneInstance3D): number {
    this.#meshPool.assert(instance.mesh);
    this.#materialPool.assert(instance.material);
    this.#assertTransform(instance.transform);
    const mesh = this.#meshes[instance.mesh] as MeshGeometry3D;
    const materialSkinned = (this.materialFlags[instance.material] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined;
    const skeleton = instance.skeleton ?? -1;
    if (meshSkinned !== materialSkinned) {
      throw new Error(meshSkinned
        ? `skinned mesh ${instance.mesh} requires a material with skinning enabled.`
        : `skinned material ${instance.material} requires JOINTS_0 and WEIGHTS_0 on mesh ${instance.mesh}.`);
    }
    if (meshSkinned) {
      this.#skeletonPool.assert(skeleton);
      const maximumJoint = maxJointIndex(mesh.joints as Uint8Array | Uint16Array);
      if (maximumJoint >= this.skeletonJointCounts[skeleton]) {
        throw new RangeError(`mesh ${instance.mesh} JOINTS_0 index ${maximumJoint} exceeds skeleton ${skeleton} jointCount ${this.skeletonJointCounts[skeleton]}.`);
      }
    } else if (skeleton !== -1) throw new Error(`static mesh ${instance.mesh} cannot reference skeleton ${skeleton}.`);
    const bounds = instance.bounds;
    if (bounds) validateBounds(bounds);
    const layerMask = uintMask(instance.layerMask);
    const handle = this.#instancePool.allocate();
    this.#instanceMeshes[handle] = instance.mesh;
    this.#instanceMaterials[handle] = instance.material;
    this.#instanceTransforms[handle] = instance.transform;
    this.#instanceSkeletons[handle] = skeleton;
    if (bounds) writeBounds(this.#instanceBounds, handle * BOUNDS_STRIDE, bounds);
    else copyBounds(this.#instanceBounds, handle * BOUNDS_STRIDE, this.#meshBounds, instance.mesh * BOUNDS_STRIDE);
    this.#instanceLayerMasks[handle] = layerMask;
    this.#instanceVisible[handle] = instance.visible === false ? 0 : 1;
    return handle;
  }

  destroyInstance(handle: number): void {
    this.#instancePool.release(handle);
    this.#instanceVisible[handle] = 0;
    this.#instanceSkeletons[handle] = -1;
  }

  setInstanceVisible(handle: number, visible: boolean): void {
    this.#instancePool.assert(handle);
    this.#instanceVisible[handle] = visible ? 1 : 0;
  }

  /** Rebinds an instance to a compatible mesh and refreshes its local bounds. */
  setInstanceMesh(handle: number, meshHandle: number): void {
    this.#instancePool.assert(handle);
    this.#meshPool.assert(meshHandle);
    const mesh = this.#meshes[meshHandle] as MeshGeometry3D;
    const material = this.#instanceMaterials[handle];
    const skeleton = this.#instanceSkeletons[handle];
    const materialSkinned = (this.materialFlags[material] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined && mesh.weights !== undefined;
    if (meshSkinned !== materialSkinned) throw new Error(`LOD mesh ${meshHandle} skinning is incompatible with instance ${handle} material ${material}.`);
    if (meshSkinned) {
      if (skeleton === -1 || !this.isSkeletonActive(skeleton)) throw new Error(`LOD mesh ${meshHandle} requires an active skeleton on instance ${handle}.`);
      const maximumJoint = maxJointIndex(mesh.joints as Uint8Array | Uint16Array);
      if (maximumJoint >= this.skeletonJointCounts[skeleton]) throw new RangeError(`LOD mesh ${meshHandle} JOINTS_0 index ${maximumJoint} exceeds skeleton ${skeleton} jointCount ${this.skeletonJointCounts[skeleton]}.`);
    } else if (skeleton !== -1) throw new Error(`Static LOD mesh ${meshHandle} cannot replace skinned instance ${handle}.`);
    this.#instanceMeshes[handle] = meshHandle;
    copyBounds(this.#instanceBounds, handle * BOUNDS_STRIDE, this.#meshBounds, meshHandle * BOUNDS_STRIDE);
  }

  setInstanceLayerMask(handle: number, layerMask: number): void {
    this.#instancePool.assert(handle);
    this.#instanceLayerMasks[handle] = uintMask(layerMask);
  }

  setInstanceBounds(handle: number, bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
    this.#instancePool.assert(handle);
    writeBounds(this.#instanceBounds, handle * BOUNDS_STRIDE, bounds);
  }

  destroyTransform(handle: number): void {
    this.#assertTransform(handle);
    this.#assertResourceUnused(this.#instanceTransforms, handle, "transform");
    this.transforms.destroy(handle);
  }

  compile(out: RenderCommandBuffer3D, options: CompileScene3DOptions = {}): RenderCommandBuffer3D {
    const scratch = renderScratch.get(out);
    if (!scratch) throw new TypeError("render output must be created with createRenderCommandBuffer3D.");
    resetOutput(out, scratch);
    const layerMask = uintMask(options.layerMask);
    const frustum = options.frustumPlanes;
    if (frustum && frustum.length < 24) throw new RangeError("frustumPlanes needs at least 24 elements.");
    this.transforms.updateWorldMatrices();

    for (let instance = 0; instance < this.#instancePool.active.length; instance += 1) {
      if (this.#instancePool.active[instance] === 0) continue;
      out.testedInstances += 1;
      if (this.#instanceVisible[instance] === 0 || (this.#instanceLayerMasks[instance] & layerMask) === 0) {
        out.filteredInstances += 1;
        continue;
      }
      const transform = this.#instanceTransforms[instance];
      if (transform >= this.transforms.capacity || this.transforms.active[transform] === 0) {
        out.invalidTransformInstances += 1;
        continue;
      }
      const skeleton = this.#instanceSkeletons[instance];
      if (skeleton !== -1 && !this.isSkeletonActive(skeleton)) {
        out.invalidSkeletonInstances += 1;
        continue;
      }
      if (frustum && !this.#instanceIntersectsFrustum(instance, transform, frustum)) {
        out.culledInstances += 1;
        continue;
      }
      out.visibleInstances += 1;
      if (out.instanceCount >= out.instanceSceneHandles.length) {
        out.truncatedInstances += 1;
        continue;
      }
      const mesh = this.#instanceMeshes[instance], material = this.#instanceMaterials[instance];
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
      const transform = this.#instanceTransforms[instance];
      const sourceOffset = transform * MATRIX_STRIDE, targetOffset = target * MATRIX_STRIDE;
      for (let component = 0; component < MATRIX_STRIDE; component += 1) {
        out.instanceMatrices[targetOffset + component] = this.transforms.worldMatrices[sourceOffset + component];
      }
    }
    this.#packLights(out, layerMask);
    return out;
  }

  #assertTransform(handle: number): void {
    if (!Number.isInteger(handle) || handle < 0 || handle >= this.transforms.capacity || this.transforms.active[handle] === 0) {
      throw new RangeError(`transform handle ${handle} is not active.`);
    }
  }

  #assertResourceUnused(handles: ArrayLike<number>, resource: number, label: string): void {
    for (let instance = 0; instance < this.#instancePool.active.length; instance += 1) {
      if (this.#instancePool.active[instance] !== 0 && handles[instance] === resource) {
        throw new Error(`${label} ${resource} is still referenced by instance ${instance}.`);
      }
    }
  }

  #validateMaterialSkinningForInstances(material: number, skinned: boolean): void {
    for (let instance = 0; instance < this.#instancePool.active.length; instance += 1) {
      if (this.#instancePool.active[instance] === 0 || this.#instanceMaterials[instance] !== material) continue;
      const meshHandle = this.#instanceMeshes[instance], mesh = this.#meshes[meshHandle] as MeshGeometry3D;
      const meshSkinned = mesh.joints !== undefined;
      if (meshSkinned !== skinned) {
        throw new Error(`material ${material} skinning change is incompatible with instance ${instance} mesh ${meshHandle}.`);
      }
    }
  }

  #copyPalette(handle: number, matrices: ArrayLike<number>): void {
    const count = this.skeletonJointCounts[handle] * MATRIX_STRIDE;
    const offset = handle * this.jointsPerSkeleton * MATRIX_STRIDE;
    for (let component = 0; component < count; component += 1) this.skeletonMatrices[offset + component] = matrices[component];
  }

  #instanceIntersectsFrustum(instance: number, transform: number, planes: ArrayLike<number>): boolean {
    const matrixOffset = transform * MATRIX_STRIDE, boundsOffset = instance * BOUNDS_STRIDE;
    const matrix = this.transforms.worldMatrices;
    const x = this.#instanceBounds[boundsOffset], y = this.#instanceBounds[boundsOffset + 1], z = this.#instanceBounds[boundsOffset + 2];
    const worldX = matrix[matrixOffset] * x + matrix[matrixOffset + 4] * y + matrix[matrixOffset + 8] * z + matrix[matrixOffset + 12];
    const worldY = matrix[matrixOffset + 1] * x + matrix[matrixOffset + 5] * y + matrix[matrixOffset + 9] * z + matrix[matrixOffset + 13];
    const worldZ = matrix[matrixOffset + 2] * x + matrix[matrixOffset + 6] * y + matrix[matrixOffset + 10] * z + matrix[matrixOffset + 14];
    const scaleX = Math.hypot(matrix[matrixOffset], matrix[matrixOffset + 1], matrix[matrixOffset + 2]);
    const scaleY = Math.hypot(matrix[matrixOffset + 4], matrix[matrixOffset + 5], matrix[matrixOffset + 6]);
    const scaleZ = Math.hypot(matrix[matrixOffset + 8], matrix[matrixOffset + 9], matrix[matrixOffset + 10]);
    const radius = this.#instanceBounds[boundsOffset + 3] * Math.max(scaleX, scaleY, scaleZ);
    return sphereIntersectsFrustum3D(planes, worldX, worldY, worldZ, radius);
  }

  #packLights(out: RenderCommandBuffer3D, layerMask: number): void {
    for (let light = 0; light < this.#lightPool.active.length; light += 1) {
      if (this.#lightPool.active[light] === 0 || this.#lightEnabled[light] === 0 || (this.#lightLayerMasks[light] & layerMask) === 0) continue;
      out.matchingLights += 1;
      if (out.lightCount >= out.lightTypes.length) { out.truncatedLights += 1; continue; }
      const target = out.lightCount++;
      out.lightTypes[target] = this.#lightTypes[light];
      out.lightSceneHandles[target] = light;
      const sourceOffset = light * LIGHT_FLOAT_STRIDE_3D, targetOffset = target * LIGHT_FLOAT_STRIDE_3D;
      for (let component = 0; component < LIGHT_FLOAT_STRIDE_3D; component += 1) {
        out.lightData[targetOffset + component] = this.#lightData[sourceOffset + component];
      }
    }
  }
}

export function createBoundedScene3D(limits: SceneLimits3D): BoundedScene3D {
  return new BoundedScene3D(limits);
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

/** Streams square terrain regions directly into bounded first-party scene resources. */
export function createTerrainStreamer3D(options: TerrainStreamer3DOptions): {
  update(cameraX: number, cameraZ: number): Promise<TerrainStreamer3DStats>;
  stats(): TerrainStreamer3DStats;
  dispose(): void;
} {
  const scene = options.scene;
  if (!(scene instanceof BoundedScene3D)) throw new TypeError("terrain scene must be a BoundedScene3D.");
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

function validateMesh(geometry: MeshGeometry3D): void {
  const { positions, indices, normals, uvs, joints, weights, morphPositions, morphWeights } = geometry;
  if (geometry.topology !== undefined && geometry.topology !== "triangle-list" && geometry.topology !== "line-list") {
    throw new RangeError(`unsupported mesh topology ${String(geometry.topology)}.`);
  }
  if (!(positions instanceof Float32Array) || positions.length === 0 || positions.length % 3 !== 0) {
    throw new RangeError("mesh positions must be a non-empty Float32Array of packed xyz values.");
  }
  const vertexCount = positions.length / 3;
  if (normals && (!(normals instanceof Float32Array) || normals.length !== positions.length)) {
    throw new RangeError(`mesh normals must contain ${positions.length} Float32 values.`);
  }
  if (uvs && (!(uvs instanceof Float32Array) || uvs.length !== vertexCount * 2)) {
    throw new RangeError(`mesh uvs must contain ${vertexCount * 2} Float32 values.`);
  }
  if ((joints === undefined) !== (weights === undefined)) {
    throw new RangeError("mesh JOINTS_0 and WEIGHTS_0 streams must be provided together.");
  }
  if (joints && !(joints instanceof Uint8Array) && !(joints instanceof Uint16Array)) {
    throw new TypeError("mesh JOINTS_0 must be Uint8Array or Uint16Array packed uvec4 data.");
  }
  if (joints && joints.length !== vertexCount * 4) {
    throw new RangeError(`mesh JOINTS_0 must contain ${vertexCount * 4} values.`);
  }
  if (weights && (!(weights instanceof Float32Array) || weights.length !== vertexCount * 4)) {
    throw new RangeError(`mesh WEIGHTS_0 must contain ${vertexCount * 4} Float32 values.`);
  }
  if (morphPositions !== undefined) {
    if (!Array.isArray(morphPositions) || morphPositions.length === 0 || morphPositions.length > 4) throw new RangeError("mesh morphPositions must contain one through four position-delta targets.");
    for (const [target, values] of morphPositions.entries()) {
      if (!(values instanceof Float32Array) || values.length !== positions.length) throw new RangeError(`morphPositions[${target}] must contain ${positions.length} Float32 deltas.`);
      for (let index = 0; index < values.length; index += 1) finite(values[index], `morphPositions[${target}][${index}]`);
    }
    if (morphWeights !== undefined && morphWeights.length > morphPositions.length) throw new RangeError("morphWeights cannot exceed the morph target count.");
  } else if (morphWeights !== undefined) throw new RangeError("morphWeights require morphPositions.");
  if (morphWeights) for (let index = 0; index < morphWeights.length; index += 1) finite(morphWeights[index], `morphWeights[${index}]`);
  if (indices && !(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    throw new TypeError("mesh indices must be Uint16Array or Uint32Array.");
  }
  const primitiveSize = geometry.topology === "line-list" ? 2 : 3;
  const elementCount = indices?.length ?? vertexCount;
  if (elementCount % primitiveSize !== 0) throw new RangeError(`${geometry.topology ?? "triangle-list"} element count must be divisible by ${primitiveSize}.`);
  if (indices) {
    for (const index of indices) if (index >= vertexCount) throw new RangeError(`mesh index ${index} exceeds vertex count ${vertexCount}.`);
  }
  if (geometry.bounds) validateBounds(geometry.bounds);
  for (let index = 0; index < positions.length; index += 1) finite(positions[index], `positions[${index}]`);
  if (normals) for (let index = 0; index < normals.length; index += 1) finite(normals[index], `normals[${index}]`);
  if (uvs) for (let index = 0; index < uvs.length; index += 1) finite(uvs[index], `uvs[${index}]`);
  if (weights) {
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 4;
      let total = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        const weight = finite(weights[offset + influence], `weights[${offset + influence}]`);
        if (weight < 0) throw new RangeError(`weights[${offset + influence}] must be non-negative.`);
        total += weight;
      }
      if (Math.abs(total - 1) > 1e-3) throw new RangeError(`WEIGHTS_0 for vertex ${vertex} must sum to 1; received ${total}.`);
    }
  }
}

function computeMeshBounds(positions: Float32Array): { x: number; y: number; z: number; radius: number } {
  let minX = positions[0], maxX = positions[0], minY = positions[1], maxY = positions[1], minZ = positions[2], maxZ = positions[2];
  for (let index = 3; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]); maxY = Math.max(maxY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]); maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const x = (minX + maxX) / 2, y = (minY + maxY) / 2, z = (minZ + maxZ) / 2;
  let radiusSquared = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const dx = positions[index] - x, dy = positions[index + 1] - y, dz = positions[index + 2] - z;
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  return { x, y, z, radius: Math.sqrt(radiusSquared) };
}

function validateBounds(bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
  finite(bounds.x, "bounds.x"); finite(bounds.y, "bounds.y"); finite(bounds.z, "bounds.z"); finite(bounds.radius, "bounds.radius");
  if (bounds.radius < 0) throw new RangeError("bounds.radius must be non-negative.");
}

function writeBounds(target: Float32Array, offset: number, bounds: Readonly<{ x: number; y: number; z: number; radius: number }>): void {
  validateBounds(bounds);
  target[offset] = bounds.x; target[offset + 1] = bounds.y; target[offset + 2] = bounds.z; target[offset + 3] = bounds.radius;
}

function copyBounds(target: Float32Array, targetOffset: number, source: Float32Array, sourceOffset: number): void {
  target[targetOffset] = source[sourceOffset]; target[targetOffset + 1] = source[sourceOffset + 1];
  target[targetOffset + 2] = source[sourceOffset + 2]; target[targetOffset + 3] = source[sourceOffset + 3];
}

function lightKindCode(kind: LightKind3D): number {
  if (kind === "ambient") return LIGHT_KIND_AMBIENT_3D;
  if (kind === "directional") return LIGHT_KIND_DIRECTIONAL_3D;
  if (kind === "point") return LIGHT_KIND_POINT_3D;
  if (kind === "spot") return LIGHT_KIND_SPOT_3D;
  throw new RangeError(`unsupported light kind ${String(kind)}.`);
}

function validateTexture(texture: TextureResource3D): void {
  const width = requireCapacity(texture.width, "texture.width"), height = requireCapacity(texture.height, "texture.height");
  if (width === 0 || height === 0) throw new RangeError("texture width and height must be positive.");
  if (!(texture.pixels instanceof Uint8Array) && !(texture.pixels instanceof Uint8ClampedArray)) {
    throw new TypeError("texture pixels must be Uint8Array or Uint8ClampedArray RGBA8 data.");
  }
  const expected = width * height * 4;
  if (!Number.isSafeInteger(expected) || texture.pixels.byteLength !== expected) {
    throw new RangeError(`texture pixels must contain exactly ${expected} RGBA8 bytes; received ${texture.pixels.byteLength}.`);
  }
  if (texture.filter !== undefined && texture.filter !== "nearest" && texture.filter !== "linear") {
    throw new RangeError(`unsupported texture filter ${String(texture.filter)}.`);
  }
  if (texture.wrapU !== undefined && texture.wrapU !== "clamp" && texture.wrapU !== "repeat") {
    throw new RangeError(`unsupported texture wrapU ${String(texture.wrapU)}.`);
  }
  if (texture.wrapV !== undefined && texture.wrapV !== "clamp" && texture.wrapV !== "repeat") {
    throw new RangeError(`unsupported texture wrapV ${String(texture.wrapV)}.`);
  }
}

function validatePaletteMatrices(matrices: ArrayLike<number> | undefined, jointCount: number): void {
  if (!matrices) return;
  const expected = jointCount * MATRIX_STRIDE;
  if (matrices.length !== expected) throw new RangeError(`skeleton palette must contain exactly ${expected} values for ${jointCount} joints.`);
  for (let component = 0; component < expected; component += 1) finite(matrices[component], `skeletonMatrices[${component}]`);
}

function maxJointIndex(joints: Uint8Array | Uint16Array): number {
  let maximum = 0;
  for (const joint of joints) maximum = Math.max(maximum, joint);
  return maximum;
}
