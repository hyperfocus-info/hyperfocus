import type { Hyperfocus3DDeclaration } from '../project/runtime-3d.ts';
import type { MaterialLook3D } from '../render/materials/3d-presets.ts';

const owned = new WeakSet<MaterialLook3D>();
const slots = ['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive'] as const;
/** Private certificate: only freshly constructed, deeply frozen sampled looks
 * enter this set. An arbitrary frozen outer object is insufficient authority. */
export function retainImmutableMaterialLook3D(look: MaterialLook3D) {
  Object.freeze(look.baseColor);Object.freeze(look.emissive);Object.freeze(look.uv.offset);Object.freeze(look.uv.scale);Object.freeze(look.uv);Object.freeze(look.textures);
  if (look.toon) { Object.freeze(look.toon.shadowColor);Object.freeze(look.toon.rimColor);Object.freeze(look.toon.outlineColor);Object.freeze(look.toon); }
  Object.freeze(look);owned.add(look);return look;
}
export const isRetainedImmutableMaterialLook3D = (look: MaterialLook3D) => owned.has(look);

/** Compare current authored scalars, not object identity or simulation tick.
 * Paused material edits therefore invalidate the baseline without a host hint. */
export function matchesAuthoredMaterialLook3D(source: Hyperfocus3DDeclaration['materials'][number], look: MaterialLook3D) {
  if (!Object.is(source.metallic, look.metallic) || !Object.is(source.roughness, look.roughness) || source.shading !== look.shading
    || (source.shading === 'unlit' ? 'unlit' : source.shader ?? 'pbr') !== look.shader || source.doubleSided !== look.doubleSided
    || !Object.is(source.baseColor[3], look.opacity) || !Object.is(source.uv?.rotation ?? 0, look.uv.rotation) || !!source.toon !== !!look.toon) return false;
  for (let axis = 0; axis < 4; axis++) if (!Object.is(source.baseColor[axis], look.baseColor[axis])) return false;
  for (let axis = 0; axis < 3; axis++) if (!Object.is(source.emissive?.[axis] ?? 0, look.emissive[axis])) return false;
  for (let axis = 0; axis < 2; axis++) if (!Object.is(source.uv?.offset[axis] ?? 0, look.uv.offset[axis]) || !Object.is(source.uv?.scale[axis] ?? 1, look.uv.scale[axis])) return false;
  for (const slot of slots) {
    const id = source.textureIds && Object.hasOwn(source.textureIds, slot) ? source.textureIds[slot] : slot === 'baseColor' ? source.textureId : undefined;
    if (id !== look.textures[slot]) return false;
  }
  if (source.toon && look.toon) {
    if (!Object.is(source.toon.bands, look.toon.bands) || !Object.is(source.toon.rimStrength, look.toon.rimStrength) || !Object.is(source.toon.outlineWidth, look.toon.outlineWidth)) return false;
    for (let axis = 0; axis < 3; axis++) if (!Object.is(source.toon.shadowColor[axis], look.toon.shadowColor[axis]) || !Object.is(source.toon.rimColor[axis], look.toon.rimColor[axis])) return false;
    for (let axis = 0; axis < 4; axis++) if (!Object.is(source.toon.outlineColor[axis], look.toon.outlineColor[axis])) return false;
  }
  return true;
}
