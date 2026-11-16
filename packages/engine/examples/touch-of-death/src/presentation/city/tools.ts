import { type CombatProject3D, type Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorDirectedWeaponAttacks } from './weapons/direction/author.ts';
import { cityTrimOwner } from './occlusion.ts';
import { authorInteractableItemOutlines } from '../item-outlines.ts';
import { authorCityWeaponCatalogue } from './weapons/author.ts';

/** Refresh district weapon pools and their wear without touching city geometry. */
export function authorCityWeaponTools(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const { declaration, combat } = options;
  const scene = declaration.scenes.find(value => value.id === declaration.activeSceneId);
  if (!scene) throw new Error('City tools require an active scene.');
  authorCityWeaponCatalogue(options);
  for (const [id, source] of [['weapon-staff-light', 'jab'], ['weapon-staff-heavy', 'heavy']]) {
    const base = combat.config.moves.find(move => move.id === source);
    if (!base) throw new Error(`Worksite tools require ${source}.`);
    const { direction: _direction, airborne: _airborne, drive: _drive, ...move } = base;
    const armed = { ...move, id: id!, command: [id!], damage: move.damage * 1.5, guardDamage: (move.guardDamage ?? move.damage) * 1.5, cancels: [], stringOnly: false };
    const existing = combat.config.moves.findIndex(move => move.id === id);
    if (existing >= 0) combat.config.moves[existing] = armed; else combat.config.moves.push(armed);
  }
  const scar = 'tod:city:tool-scar';
  if (!declaration.materials.some(material => material.id === scar)) declaration.materials.push({ id: scar, shading: 'lit', baseColor: [.075, .05, .035, 1], metallic: 0, roughness: 1, doubleSided: false });
  authorDirectedWeaponAttacks(combat);
  // Legacy authored tools receive the same visible wear without replacing their geometry.
  for (const weapon of combat.interactions!.weapons) {
    const entity = scene.entities.find(entity => entity.id === weapon.entityId);
    if (!entity) continue;
    scene.entities = scene.entities.filter(item => !item.id.startsWith(`${weapon.entityId}:wear:`) && !item.id.startsWith(`${weapon.entityId}:fragment:`));
    for (const kind of ['wear', 'fragment']) for (let index = 0; index < 3; index++) scene.entities.push({ id: `${weapon.entityId}:${kind}:${index}`, meshId: 'tod:box', materialId: kind === 'wear' ? scar : entity.materialId.replace(/:pickup-outline$/, ''), position: [...entity.position], scale: [0, 0, 0], rotationY: 0 });
  }
  authorInteractableItemOutlines(options);
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}

/** Worksite offcuts and visibly cracked infill use the existing shared combat rules. */
export function authorCityTools(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  authorCityWeaponTools(options);
  const { declaration, combat } = options;
  const scene = declaration.scenes.find(value => value.id === declaration.activeSceneId)!;
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith('tod:city:infill:'));
  // Plaster infill on both street fronts can give way; concrete piers and steel lintels remain.
  const surfaces = combat.environment?.surfaces ?? [];
  for (const side of [-1, 1]) for (const z of [-6, 4]) {
    const id = `tod:city:door-jamb:${side}:${z}`, wall = scene.entities.find(entity => entity.id === id);
    if (!wall) continue;
    const hideIds = scene.entities.filter(entity => cityTrimOwner(entity.id) === id).map(entity => entity.id);
    const debrisIds: string[] = [];
    for (let index = 0; index < 6; index++) {
      const crack = `tod:city:infill:${side}:${z}:crack:${index}`;
      scene.entities.push({ id: crack, meshId: 'tod:box', materialId: 'tod:city:fracture', position: [wall.position[0] + (index % 2 ? .12 : -.18), .65 + Math.floor(index / 2) * 1.6 + (index % 2 ? .68 : 0), z + (z > 0 ? .215 : -.215)], scale: index % 2 ? [.32, .018, .012] : [.018, .7, .012], rotationY: 0 });
      hideIds.push(crack);
    }
    for (let index = 0; index < 9; index++) {
      const debris = `tod:city:infill:${side}:${z}:debris:${index}`;
      const meshId = `tod:city-model:fragment-${['a', 'b', 'c'][index % 3]}`;
      scene.entities.push({ id: debris, meshId: declaration.meshes.some(mesh => mesh.id === meshId) ? meshId : 'tod:box', materialId: 'tod:city:plaster', position: [wall.position[0] + (index % 3 - 1) * 1.25, .18 + index % 2 * .06, z + (index % 2 ? 1 : -1) * (.5 + index * .1)], scale: [.27 + index % 3 * .07, .18 + index % 2 * .06, .21], rotationY: index * .71 });
      debrisIds.push(debris);
    }
    const surface = { entityId: id, trigger: { kind: 'impact' as const, minSpeed: 4 }, hideIds, debrisIds };
    const existing = surfaces.findIndex(surface => surface.entityId === id);
    if (existing >= 0) surfaces[existing] = surface; else surfaces.push(surface);
  }
  combat.environment = { surfaces };
}
