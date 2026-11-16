import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { AppearanceCatalog3D } from './catalog.ts';

export type ResolvedAppearanceTexture3D = { materialId: string; textureId: string };
/** Declaration-only validation. Mesh UVs and decoded asset pixels require runtime asset validation. */
export function validateAppearanceTextures3D(catalog: AppearanceCatalog3D, declaration: Hyperfocus3DDeclaration): void {
  const materials = new Set<string>(), textures = new Set<string>(), scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  for (const actor of catalog.actors) for (const slot of catalog.textureSlots ?? []) {
    const { materialId, textureId } = resolveAppearanceTexture3D({ catalog, actorId: actor.entityId, slotId: slot.id });
    if (materials.has(materialId) || textures.has(textureId)) throw new Error('Appearance texture targets overlap.');materials.add(materialId);textures.add(textureId);
    const material = declaration.materials.find(value => value.id === materialId), texture = declaration.textures.find(value => value.id === textureId);
    if (!material || material.baseColor[3] !== 1 || material.alphaMode && material.alphaMode !== 'opaque') throw new Error('Appearance texture needs an opaque actor material.');
    if (!texture) throw new Error('Appearance placeholder texture is missing.');
    const belongs = (id: string) => id === actor.entityId || id.startsWith(`${actor.entityId}:`);
    const uses = (entity: Hyperfocus3DDeclaration['scenes'][number]['entities'][number]) => entity.materialId === materialId || entity.variants?.some(variant => variant.materialId === materialId);
    if (!scene?.entities.some(entity => belongs(entity.id) && uses(entity))) throw new Error('Appearance texture material has no actor user in the active scene.');
    if (declaration.scenes.some(scene => scene.entities.some(entity => !belongs(entity.id) && uses(entity)))) throw new Error('Appearance texture material is shared outside its actor.');
    for (const other of declaration.materials) {
      const referenced = other.textureId === textureId || Object.values(other.textureIds ?? {}).includes(textureId);
      if (referenced && other.id !== materialId) throw new Error('Appearance placeholder texture is shared with another material.');
      if (other.id === materialId && Object.entries(other.textureIds ?? {}).some(([channel, id]) => channel !== 'baseColor' && id === textureId)) throw new Error('Appearance placeholder texture must only supply base color.');
    }
  }
}
export function resolveAppearanceTexture3D(options: { catalog: AppearanceCatalog3D; actorId: string; slotId: string }): ResolvedAppearanceTexture3D {
  if (!options.catalog.actors.some(actor => actor.entityId === options.actorId)) throw new Error('Unknown appearance actor.');
  const slot = options.catalog.textureSlots?.find(slot => slot.id === options.slotId);if (!slot) throw new Error('Unknown appearance texture slot.');
  return { materialId: options.actorId + slot.materialSuffix, textureId: options.actorId + slot.textureSuffix };
}
/** Overlay only the base-color texture binding of a freshly evaluated frame. */
export function applyAppearanceTexture3D(options: { frame: Hyperfocus3DEvaluatedFrame; target: ResolvedAppearanceTexture3D }): void {
  const material = options.frame.materials.find(material => material.id === options.target.materialId);
  if (!material || !options.target.textureId) throw new Error('Appearance texture frame target is missing.');
  material.look = { ...material.look, textures: { ...material.look.textures, baseColor: options.target.textureId } };
}
