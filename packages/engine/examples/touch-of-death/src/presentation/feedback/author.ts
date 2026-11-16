import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Register every feedback material before renderer construction, including wardrobe variants. */
export function authorCombatFeedback(declaration: Hyperfocus3DDeclaration, fighters: readonly { entityId: string; rigId: string }[]) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  const referenced = new Set<string>();
  for (const fighter of fighters) {
    const ids = new Set(scene.entities.filter(entity => entity.id.startsWith(fighter.rigId + ':') || entity.id.startsWith(fighter.entityId + ':wardrobe:'))
      .flatMap(entity => [entity.materialId, ...(entity.variants?.map(variant => variant.materialId) ?? [])]));
    for (const sourceId of ids) {
      const source = sourceId && materials.get(sourceId), id = `${fighter.entityId}:state:${sourceId}`;
      if (source && !materials.has(id)) { const material = { ...structuredClone(source), id };declaration.materials.push(material);materials.set(id, material); }
      if (source) referenced.add(id);
    }
  }
  for (const suffix of ['smoke', 'flame']) {
    const id = `tod:fire-feedback:${suffix}`;
    referenced.add(id);
    if (!materials.has(id)) declaration.materials.push({ id, shading: 'unlit', baseColor: [1, 1, 1, 1], emissive: suffix === 'smoke' ? [0, 0, 0] : [.4, .12, .015],
      alphaMode: 'blend', metallic: 0, roughness: 1, doubleSided: true });
  }
  declaration.budgets = { ...declaration.budgets, materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
  return [...referenced];
}
