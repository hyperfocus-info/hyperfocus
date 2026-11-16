import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { ResolvedAppearance3D } from './catalog.ts';

/** Apply after combat posing on every fresh frame. Never changes bodies, authored data, scale or visibility. */
export function applyAppearance3D(frame: Hyperfocus3DEvaluatedFrame, resolved: ResolvedAppearance3D): void {
  const entities = resolved.variants.map(patch => {
    const entity = frame.entities.find(entity => entity.id === patch.entityId);
    if (!entity) throw new Error('Appearance frame entity is missing.');return entity;
  });
  const materials = resolved.colors.map(patch => {
    const material = frame.materials.find(material => material.id === patch.materialId);
    if (!material || patch.baseColor.length !== 4 || patch.baseColor[3] !== 1 || patch.baseColor.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Appearance frame material or opaque color is invalid.');
    return material;
  });
  resolved.variants.forEach((patch, index) => { entities[index]!.variantId = patch.variantId; });
  resolved.colors.forEach((patch, index) => { const material = materials[index]!;material.look = { ...material.look, baseColor: [...patch.baseColor] }; });
}
