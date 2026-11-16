export type MaterialAlphaMode3D = "opaque" | "mask" | "blend" | "additive";
export type MaterialShading3D = "unlit" | "lit";
export type MaterialShader3D = "pbr" | "toon" | "retro" | "hologram";

export type MaterialToon3D = Readonly<{
  bands?: number;
  shadowColor?: ArrayLike<number>;
  rimColor?: ArrayLike<number>;
  rimStrength?: number;
  outlineColor?: ArrayLike<number>;
  outlineWidth?: number;
}>;

export interface Material3D {
  baseColor?: ArrayLike<number>; emissive?: ArrayLike<number>; metallic?: number; roughness?: number;
  alphaMode?: MaterialAlphaMode3D; alphaCutoff?: number; doubleSided?: boolean; shading?: MaterialShading3D; shader?: MaterialShader3D;
  baseColorTexture?: number; metallicRoughnessTexture?: number; normalTexture?: number; occlusionTexture?: number; emissiveTexture?: number;
  uvOffset?: ArrayLike<number>; uvScale?: ArrayLike<number>; uvRotation?: number;
  /** Portable graphic-cel controls. They are ignored by non-toon shaders. */
  toon?: MaterialToon3D;
  /** Enables the skeletal shader path and requires skinned mesh streams. */
  skinning?: boolean;
  /** Fade solid interiors to shader-rendered mesh edges as base alpha approaches zero. */
  cutaway?: boolean;
}

export const MATERIAL_FLOAT_STRIDE_3D = 28;
export const MATERIAL_TEXTURE_STRIDE_3D = 5;
export const MATERIAL_TEXTURE_BASE_COLOR_3D = 0, MATERIAL_TEXTURE_METALLIC_ROUGHNESS_3D = 1, MATERIAL_TEXTURE_NORMAL_3D = 2, MATERIAL_TEXTURE_OCCLUSION_3D = 3, MATERIAL_TEXTURE_EMISSIVE_3D = 4;
export const MATERIAL_FLAG_DOUBLE_SIDED_3D = 1, MATERIAL_FLAG_ALPHA_MASK_3D = 2, MATERIAL_FLAG_TEXTURED_3D = 4, MATERIAL_FLAG_LIT_3D = 8, MATERIAL_FLAG_SKINNED_3D = 16;
export const MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D = 32, MATERIAL_FLAG_NORMAL_TEXTURED_3D = 64, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D = 128, MATERIAL_FLAG_EMISSIVE_TEXTURED_3D = 256;
export const MATERIAL_FLAG_SHADER_TOON_3D = 512, MATERIAL_FLAG_SHADER_RETRO_3D = 1024, MATERIAL_FLAG_SHADER_HOLOGRAM_3D = 2048;
export const MATERIAL_FLAG_ALPHA_BLEND_3D = 4096;
export const MATERIAL_FLAG_ADDITIVE_3D = 8192;
export const MATERIAL_FLAG_CUTAWAY_3D = 16384;
