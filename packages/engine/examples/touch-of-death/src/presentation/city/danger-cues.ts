import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** In-world perimeter lamps show exactly which surface is about to disappear. */
export function authorCityDangerCues({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) return;
  const prefix = 'tod:city:danger-cue:';
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  const materialId = prefix + 'amber';
  declaration.materials = declaration.materials.filter(material => material.id !== materialId);
  declaration.materials.push({ id: materialId, shading: 'unlit', baseColor: [1, .48, .045, 1], emissive: [1, .22, .015], metallic: 0, roughness: .8, doubleSided: false });
  for (const surface of combat.environment?.surfaces ?? []) {
    if (surface.warningIds) surface.warningIds = surface.warningIds.filter(id => !id.startsWith(prefix));
    if (surface.trigger.kind !== 'scheduled') continue;
    const slab = scene.entities.find(entity => entity.id === surface.entityId);
    if (!slab) continue;
    const [x, y, z] = slab.position, [width, height, depth] = slab.scale;
    const edges: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [
      { position: [x - width + .08, y + height + .055, z], scale: [.055, .025, depth] },
      { position: [x + width - .08, y + height + .055, z], scale: [.055, .025, depth] },
      { position: [x, y + height + .055, z - depth + .08], scale: [width, .025, .055] },
      { position: [x, y + height + .055, z + depth - .08], scale: [width, .025, .055] },
    ];
    for (const [index, edge] of edges.entries()) {
      const id = prefix + surface.entityId + ':' + index;
      const dx = edge.position[0] - x, dz = edge.position[2] - z;
      edge.position[0] = x + dx * Math.cos(slab.rotationY) + dz * Math.sin(slab.rotationY);
      edge.position[2] = z - dx * Math.sin(slab.rotationY) + dz * Math.cos(slab.rotationY);
      scene.entities.push({ id, meshId: 'tod:box', materialId, ...edge, rotationY: slab.rotationY, ...(slab.animation ? { animation: structuredClone(slab.animation) } : {}) });
      (surface.warningIds ??= []).push(id);
    }
  }
}
