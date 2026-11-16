import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorCombatObstructions } from '../../obstructions.ts';

type Vec3 = [number, number, number];
const prefix = 'tod:city:underground:';

/** Two real street openings lead through a bounded service passage below the city. */
export function authorCityUnderground({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  const street = scene?.entities.find(entity => entity.id === 'tod:city:street');
  if (!scene || !street || street.scale[0] < 30 || street.scale[2] < 30) throw Error('Underground passage requires the expanded moving city.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(prefix));
  const add = (id: string, material: string, position: Vec3, scale: Vec3, solid = true) => {
    const entity: typeof scene.entities[number] = { id: prefix + id, meshId: 'tod:box', materialId: `tod:city:${material}`, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}) };
    scene.entities.push(entity);return entity;
  };
  // Keep the existing full-width street identity for map framing and shadows,
  // now as the actual foundation. Five upper slabs leave two physical openings.
  street.position[1] = -6.3;street.scale[1] = .3;
  const west = street.position[0] - street.scale[0], east = street.position[0] + street.scale[0];
  const north = street.position[2] - street.scale[2], south = street.position[2] + street.scale[2];
  add('street:west', 'asphalt', [(west - 25) / 2, -.3, street.position[2]], [(-25 - west) / 2, .3, street.scale[2]]);
  add('street:east', 'asphalt', [(east - 19) / 2, -.3, street.position[2]], [(east + 19) / 2, .3, street.scale[2]]);
  for (const [name, start, end] of [['north', north, -20], ['cover', -10, -3], ['south', 8, south]] as const) add(`street:${name}`, 'asphalt', [-22, -.3, (start + end) / 2], [3, .3, (end - start) / 2]);
  for (const side of [-1, 1]) {
    const x = -22 + side * 3.2;
    add(`wall:${side}`, 'concrete', [x, -3, -6], [.2, 3, 14]);
    for (const [z, half] of [[-15, 5], [2.5, 5.5]]) {
      add(`mouth:curb:${side}:${z}`, 'warning', [x, .12, z!], [.18, .12, half!], false);
      add(`mouth:post:${side}:${z}`, 'paint', [x, 1.1, z! + (z! < 0 ? -half! + .3 : half! - .3)], [.12, 1.1, .12]);
      add(`mouth:lamp:${side}:${z}`, 'lamp', [x, 2.25, z! + (z! < 0 ? -half! + .3 : half! - .3)], [.18, .08, .18], false);
    }
    for (const z of [-10, -6, -2]) {
      add(`light:${side}:${z}`, 'lamp', [-22 + side * 2.96, -1.3, z], [.025, .07, .65], false);
      add(`conduit:${side}:${z}`, 'paint', [-22 + side * 2.94, -4.8, z], [.04, .12, 1.6], false);
    }
  }
  for (const z of [-20.2, 8.2]) add(`end:${z}`, 'concrete', [-22, -3, z], [3.4, 3, .2]);
  // Twelve half-metre risers fit inside the existing mouths and share ordinary
  // auto-step eligibility with the street stairs; the city never needs free wall climbing.
  for (let index = 0; index < 12; index++) {
    const northTop = -(index + 1) * .5, southTop = -5.5 + index * .5;
    if (northTop > -6) add(`north-step:${index}`, 'concrete', [-22, (northTop - 6) / 2, -19.625 + index * .75], [3, (northTop + 6) / 2, .375]);
    add(`south-step:${index}`, 'concrete', [-22, (southTop - 6) / 2, -.625 + index * .75], [3, (southTop + 6) / 2, .375]);
    add(`north-nosing:${index}`, 'warning', [-22, northTop + .018, -19.96 + index * .75], [2.85, .018, .035], false);
    add(`south-nosing:${index}`, 'warning', [-22, southTop + .018, -.96 + index * .75], [2.85, .018, .035], false);
  }
  add('floor-marking', 'paint', [-22, -5.985, -6], [.06, .015, 5.7], false);
  const environment = combat.environment ?? { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => !surface.entityId.startsWith(prefix));
  // A visibly cracked service divider offers an optional breach beside its two
  // already-open aisles. Neither entrance depends on breaking it.
  const divider = add('divider', 'plaster', [-22, -3.6, -6], [.16, 2.4, 1.5]);
  const hideIds: string[] = [], debrisIds: string[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) hideIds.push(add(`crack:${side}:${i}`, 'fracture', [-22 + side * .175, -5 + i, -6 + (i % 2 ? .2 : -.2)], [.01, .035, .2], false).id);
  for (let i = 0; i < 4; i++) debrisIds.push(add(`debris:${i}`, 'plaster', [-22 + (i % 2 ? .6 : -.6), -5.87, -7 + i * .65], [.3, .13, .25], false).id);
  environment.surfaces.push({ entityId: divider.id, trigger: { kind: 'impact', minSpeed: 4 }, hideIds, debrisIds });combat.environment = environment;
  // Street-height trim becomes an overhead obstruction during descent and KO
  // camera orbits. Its absolute height cannot determine cutaway eligibility.
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix)
    && (entity.physics || entity.id.includes(':mouth:curb:') || entity.id.includes('-nosing:'))).map(entity => entity.id)));
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
