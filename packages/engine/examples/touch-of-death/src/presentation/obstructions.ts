import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Selected scenery includes decorative and moving primitives, not only colliders. */
export function authorCombatObstructions(declaration: Hyperfocus3DDeclaration, entityIds?: ReadonlySet<string>) {
  const scene = declaration.scenes.find(s => s.id === declaration.activeSceneId);
  if (!scene) return;
  if (!declaration.materials.some(m => m.id === 'tod:occlusion-edge')) declaration.materials.push({ id: 'tod:occlusion-edge', shading: 'unlit', baseColor: [.65, .85, .95, .75], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  for (const entity of [...scene.entities]) {
    if (entityIds && !entityIds.has(entity.id)) continue;
    if (!entityIds && (entity.physics?.shape !== 'box' || entity.meshId !== 'tod:box') || entity.id === 'tod:arena') continue;
    const material = declaration.materials.find(m => m.id === entity.materialId);
    if (!material || material.baseColor[3] < .5) continue;
    // Followers retain shared owner/color materials. Presentation tests their
    // actual instances as one group instead of splitting the batch per trim.
    if (material.id.includes(':occlusion-follow:')) continue;
    const id = `${entity.id}:occlusion`;
    if (!declaration.materials.some(m => m.id === id)) declaration.materials.push({ ...structuredClone(material), id, alphaMode: 'blend' });
    entity.materialId = id;
  }
}
