import type { Material3D } from '../../../render/3d-scene.ts';
import type { MaterialLook3D } from '../../../render/materials/3d-presets.ts';

/** Canonical input resolution shared by renderer and endpoint producers. */
export function runtimeMaterialValue3D(look: MaterialLook3D, alphaMode: Material3D['alphaMode'], texture: (id: string | undefined) => number | undefined): Material3D {
  return {
    baseColor: [look.baseColor[0], look.baseColor[1], look.baseColor[2], look.opacity], emissive: look.emissive,
    metallic: look.metallic, roughness: look.roughness, shading: look.shading, doubleSided: look.doubleSided,
    alphaMode, ...(look.shader === 'unlit' ? {} : { shader: look.shader }),
    baseColorTexture: texture(look.textures.baseColor), metallicRoughnessTexture: texture(look.textures.metallicRoughness),
    normalTexture: texture(look.textures.normal), occlusionTexture: texture(look.textures.occlusion), emissiveTexture: texture(look.textures.emissive),
    uvOffset: look.uv.offset, uvScale: look.uv.scale, uvRotation: look.uv.rotation, toon: look.toon, cutaway: look.cutaway,
  };
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

export function sameRuntimeMaterialLook3D(a: MaterialLook3D, b: MaterialLook3D): boolean {
  if (a.cutaway !== b.cutaway || !Object.is(a.opacity, b.opacity) || !Object.is(a.metallic, b.metallic) || !Object.is(a.roughness, b.roughness)
    || a.shading !== b.shading || a.shader !== b.shader || a.doubleSided !== b.doubleSided || !Object.is(a.uv.rotation, b.uv.rotation)
    || !sameNumbers(a.baseColor, b.baseColor) || !sameNumbers(a.emissive, b.emissive)
    || !sameNumbers(a.uv.offset, b.uv.offset) || !sameNumbers(a.uv.scale, b.uv.scale)) return false;
  if (a.textures.baseColor !== b.textures.baseColor || a.textures.metallicRoughness !== b.textures.metallicRoughness
    || a.textures.normal !== b.textures.normal || a.textures.occlusion !== b.textures.occlusion || a.textures.emissive !== b.textures.emissive) return false;
  if (!a.toon || !b.toon) return a.toon === b.toon;
  return Object.is(a.toon.bands, b.toon.bands) && Object.is(a.toon.rimStrength, b.toon.rimStrength) && Object.is(a.toon.outlineWidth, b.toon.outlineWidth)
    && sameNumbers(a.toon.shadowColor, b.toon.shadowColor) && sameNumbers(a.toon.rimColor, b.toon.rimColor) && sameNumbers(a.toon.outlineColor, b.toon.outlineColor);
}

export function copyRuntimeMaterialLook3D(look: MaterialLook3D): MaterialLook3D {
  return { baseColor: [look.baseColor[0], look.baseColor[1], look.baseColor[2], look.baseColor[3]], emissive: [look.emissive[0], look.emissive[1], look.emissive[2]],
    metallic: look.metallic, roughness: look.roughness, opacity: look.opacity, shading: look.shading, shader: look.shader, doubleSided: look.doubleSided, cutaway: look.cutaway,
    textures: { baseColor: look.textures.baseColor, metallicRoughness: look.textures.metallicRoughness, normal: look.textures.normal, occlusion: look.textures.occlusion, emissive: look.textures.emissive },
    uv: { rotation: look.uv.rotation, offset: [look.uv.offset[0], look.uv.offset[1]], scale: [look.uv.scale[0], look.uv.scale[1]] },
    toon: look.toon ? { bands: look.toon.bands, rimStrength: look.toon.rimStrength, outlineWidth: look.toon.outlineWidth,
      shadowColor: [look.toon.shadowColor[0], look.toon.shadowColor[1], look.toon.shadowColor[2]], rimColor: [look.toon.rimColor[0], look.toon.rimColor[1], look.toon.rimColor[2]],
      outlineColor: [look.toon.outlineColor[0], look.toon.outlineColor[1], look.toon.outlineColor[2], look.toon.outlineColor[3]] } : undefined };
}
