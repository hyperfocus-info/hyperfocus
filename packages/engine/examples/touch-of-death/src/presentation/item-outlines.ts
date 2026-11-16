import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** A fine ivory pickup edge keeps small silhouettes legible without erasing their faces. */
export function authorInteractableItemOutlines(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const { declaration, combat } = options;
  const ids = new Set(combat.interactions?.weapons.map(weapon => weapon.entityId) ?? []);
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  for (const scene of declaration.scenes) for (const entity of scene.entities) {
    if (!ids.has(entity.id)) continue;
    const source = materials.get(entity.materialId);
    if (!source) continue;
    const id = source.id.endsWith(':pickup-outline') ? source.id : `${source.id}:pickup-outline`;
    let material = materials.get(id);
    if (!material) { material = { ...structuredClone(source), id };declaration.materials.push(material);materials.set(id, material); }
    material.shading = 'lit';material.shader = 'toon';
    material.toon = { bands: 4, shadowColor: [.3, .3, .3], rimColor: [1, 1, 1], rimStrength: 0, ...material.toon, outlineColor: [.72, .69, .59, 1], outlineWidth: .00085 };
    entity.materialId = id;
  }
  declaration.budgets = { ...declaration.budgets, materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
