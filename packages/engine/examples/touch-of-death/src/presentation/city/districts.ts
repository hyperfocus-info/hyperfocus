import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorDistrictDetails, type DistrictBox } from './district-details.ts';

const prefix = 'tod:city:district:';

/** Refresh district-owned geometry without changing fighters, traffic, tools or existing damage rules. */
export function authorCityDistricts({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('City districts require an active scene.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(prefix));
  const environment = combat.environment ?? { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => !surface.entityId.startsWith(prefix));
  const add: DistrictBox = (id, material, position, scale, solid = false, owner) => {
    const entity: typeof scene.entities[number] = { id: prefix + id, meshId: 'tod:box', materialId: `tod:city:${material}`, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}) };
    // Thin details inherit the support's camera fade. Large solid pieces receive
    // the regular obstruction pass when the city macro completes.
    if (owner) {
      const source = declaration.materials.find(item => item.id === entity.materialId);
      if (source) {
        entity.materialId = `${owner}:occlusion-follow:${entity.id}`;
        declaration.materials.push({ ...structuredClone(source), id: entity.materialId, alphaMode: 'blend' });
      }
    }
    scene.entities.push(entity);return entity;
  };
  authorDistrictDetails({ add });
  // A physically supported maintenance catwalk connects the worksite roof and
  // north utility roof. Street routes remain open beneath it, including freight.
  for (const [index, z] of [-15, -33].entries()) {
    const owner = `tod:city:district:catwalk:deck:${index}`;
    add(`catwalk:deck:${index}`, 'steel', [-3, 5.8, z], [1.25, .2, 9], true);
    for (const side of [-1, 1]) add(`catwalk:edge:${index}:${side}`, 'warning', [-3 + side * 1.18, 6.015, z], [.07, .015, 9], false, owner);
  }
  // Tall support beside the route, not on either roadway crossing.
  add('catwalk:pier', 'concrete', [-3, 2.8, -21], [.4, 2.8, .45], true);
  add('catwalk:brace', 'steel', [-3, 5.3, -21], [1.2, .3, .15], false, 'tod:city:district:catwalk:pier');
  // Apartments have an interior divider. Choosing the open right-hand corridor
  // preserves the wall; breaking it creates a shorter route through the room.
  const divider = add('residential:divider', 'plaster', [-55, 2.7, -22], [.16, 2.7, 1.8], true);
  const cracks: string[] = [], debris: string[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) cracks.push(add(`residential:crack:${side}:${i}`, 'fracture', [-55 + side * .175, .8 + i * 1.05, -22 + (i % 2 ? .2 : -.1)], [.012, .045, .24], false, divider.id).id);
  for (let i = 0; i < 4; i++) debris.push(add(`residential:debris:${i}`, 'plaster', [-55 + (i % 2 ? .65 : -.65), .12, -23.1 + i * .7], [.3, .12, .25]).id);
  environment.surfaces.push({ entityId: divider.id, trigger: { kind: 'impact', minSpeed: 4 }, hideIds: cracks, debrisIds: debris });
  // Observation equipment lies behind the existing utility infill. It is an
  // environmental clue revealed by a real breach, with no lore popup or reward.
  const cabinet = add('utility:hidden-cabinet', 'steel', [1.4, 4.2, -50.38], [.4, .7, .05]);
  const indicator = add('utility:hidden-indicator', 'lamp', [1.4, 4.3, -50.45], [.24, .06, .02]);
  const lens = add('utility:hidden-lens', 'window', [1.4, 4.6, -50.46], [.12, .12, .04]);
  const panel = environment.surfaces.find(surface => surface.entityId === 'tod:city:expanded:court:3:weak-back');
  if (panel) panel.revealIds = [...(panel.revealIds ?? []).filter(id => !id.startsWith(prefix)), cabinet.id, indicator.id, lens.id];
  combat.environment = environment;
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
