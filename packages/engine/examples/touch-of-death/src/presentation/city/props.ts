import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityPropKinds } from './prop-models.ts';
import { cityFightStarts } from './expansion.ts';
import { cityMotionEnvelope } from './vehicles/envelope.ts';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
const prefix = 'tod:city:prop:';
const scales: Record<typeof cityPropKinds[number], Vec3> = { barrel: [.48, .65, .48], crate: [.65, .65, .65], statue: [.55, 1.15, .55], bench: [1.2, .65, .48], table: [.9, .65, .65], ladder: [.5, 1.3, .18], column: [.5, 1.6, .5] };

/** Dense, deterministic worksite props retain their broken forms for the whole match. */
export function authorCityProps({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('City props require an active scene.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith(prefix));
  const environment = combat.environment ?? { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => !surface.entityId.startsWith(prefix));
  const solids = scene.entities.filter(entity => entity.physics && !combat.fighters.some(fighter => fighter.entityId === entity.id));
  const authored: Array<Pick<Entity, 'position' | 'scale' | 'animation'>> = [];
  let serial = 0;
  const add = (x: number, floor: number, z: number, variant: number) => {
    if (serial >= 350) return;
    const kind = cityPropKinds[variant % cityPropKinds.length]!, scale = scales[kind], position: Vec3 = [x, floor + scale[1], z];
    // Preserve the original straight street/cutoff routes, visible traffic corridors,
    // and a small neutral circle around every initial fighter position.
    if (floor === 0 && (Math.abs(z - 7) < 1.8 + scale[2] || Math.abs(x) < 2.3 + scale[0] && z > -11 && z < 9)) return;
    if (combat.spawns?.some(spawn => spawn.positions.some(start => Math.abs(start[1] - floor - 1) < 1 && Math.hypot(start[0] - x, start[2] - z) < 2.5 + Math.max(scale[0], scale[2])))) return;
    if ([...solids, ...authored].some(entity => {
      const { min, max } = cityMotionEnvelope(entity);
      const clearance = entity.animation ? 1.25 : 'id' in entity ? .2 : .8;
      return position.every((value, axis) => value + scale[axis]! + (axis === 1 ? 0 : clearance) > min[axis]! + .02 && value - scale[axis]! - (axis === 1 ? 0 : clearance) < max[axis]! - .02);
    })) return;
    const id = `${prefix}${kind}:${serial++}`, material = declaration.materials.find(material => material.id === `tod:city:${kind === 'barrel' || kind === 'ladder' ? 'rust' : kind === 'statue' || kind === 'column' ? 'concrete-light' : 'tool-wood'}`)!;
    const materialId = `${id}:occlusion`;declaration.materials.push({ ...structuredClone(material), id: materialId, alphaMode: 'blend' });
    const model = `tod:city-prop-model:${kind}`;
    scene.entities.push({ id, meshId: declaration.meshes.some(mesh => mesh.id === model) ? model : kind === 'barrel' ? 'tod:sphere' : 'tod:box', materialId, position, scale: [...scale], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
    const debrisIds: string[] = [];
    for (const side of [-1, 1]) {
      const debris = `${id}:debris:${side < 0 ? 0 : 1}`, brokenModel = model + '-broken';debrisIds.push(debris);
      scene.entities.push({ id: debris, meshId: declaration.meshes.some(mesh => mesh.id === brokenModel) ? brokenModel : 'tod:box', materialId: material.id, position: [x + side * scale[0] * .8, floor + .13, z + side * .25], scale: [scale[0] * .75, .16, Math.max(.25, scale[2] * .8)], rotationY: side * .45 });
    }
    environment.surfaces.push({ entityId: id, trigger: { kind: 'impact', minSpeed: kind === 'column' || kind === 'statue' ? 5 : kind === 'barrel' ? 3 : 2.5 }, debrisIds });
    authored.push({ position, scale });
  };
  // Loading piles, rest areas and salvage courts have different object groupings.
  // Keep their coverage centres while breaking the old repeated display rows.
  const clusters = [
    { kinds: [1, 1, 0, 5, 0], points: [[-3.2, -2.4], [-.5, -3.1], [2.8, -1.8], [-2.7, 2.5], [1.8, 2.9]] },
    { kinds: [3, 4, 3, 1, 0], points: [[-3.3, -2], [0, 0], [3.1, 1.7], [-2.8, 3], [2.4, -3]] },
    { kinds: [2, 6, 6, 3, 2], points: [[-3, -2.8], [.2, -3.1], [3.2, -.5], [-2.9, 2.6], [.9, 3]] },
  ];
  for (let row = 0; row < 6; row++) for (let column = 0; column < 8; column++) {
    const x = -70 + column * 20, z = -50 + row * 20;
    const cluster = clusters[(row + column * 2) % clusters.length]!;
    for (const [index, [dx, dz]] of cluster.points.entries()) add(x + dx!, 0, z + dz!, cluster.kinds[index]!);
  }
  add(-4.5, 0, 11.5, 1);
  for (const side of [-1, 1]) for (const [index, z] of [-4, -.8, 2].entries()) add(side * 5, 0, z, index);
  for (const x of [-60, -40, -20, 20, 40, 60]) for (const offset of [-4, 0, 4]) add(x + offset, 0, -57.5, Math.abs(x + offset) % 7);
  for (const [index, [x, z]] of cityFightStarts.entries()) {
    if (!index) continue;
    for (const [offset, [dx, dz]] of [[-7, -1.8], [-4, -4.4], [0, -4.4], [3, -5], [-7, -5]].entries()) add(x + dx!, 0, z + dz!, index + offset);
  }
  for (const [index, [x, z]] of [[-5, -14], [-2, -14], [2, -14], [5, -14], [0, -17]].entries()) add(x!, 0, z!, index);
  add(0, 0, -11.8, 5);
  add(4, 0, -11.8, 0);
  // Rooftop maintenance/storage clusters remain separate from the drop and stair mouths.
  for (const [index, [x, z]] of cityFightStarts.entries()) {
    const points = index === 0 ? [[-5, 2.8], [-2, 2.8], [1, 2.8], [4, 2.8], [0, -5.2]] : [[x - 8, z - .7], [x - 5, z - .7], [x - 2, z - .7], [x + 1, z - .7], [x - 8, z - 7.3], [x - 3, z - 7.3], [x + 2, z - 7.3]];
    for (const [offset, [px, pz]] of points.entries()) add(px!, 6, pz! + (index === 3 ? 0 : (offset % 3 - 1) * .35), index === 3 ? index + offset : [1, 0, 5, 1, 0, 4, 3][offset % 7]!);
    if (index) add(x - 5.5, 6, z - 3.9, 0);
    if (index === 3) { add(x - 5.5, 6, z - 7.3, 0);add(x - .5, 6, z - 7.3, 1); }
  }
  combat.environment = environment;
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
