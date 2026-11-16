import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorCombatObstructions } from '../../obstructions.ts';
import { authorNeighborhoodRoutes } from './routes.ts';
import { cityStationCandidates, cityStationTemplates, type CityStationId } from './stations.ts';
import { stationFootprintSupported } from './support.ts';
import { cityMotionEnvelope } from '../vehicles/envelope.ts';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
const prefix = 'tod:city:neighborhood:';

/** Refresh owned route modules and furniture; inventory selects stock separately. */
export function authorCityNeighborhood({ declaration, combat, seed = 0, density = 1 }: {
  declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; seed?: number; density?: number;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene?.entities.some(entity => entity.id === 'tod:city:street')) throw Error('Neighborhood requires the moving city.');
  if (!Number.isFinite(seed) || !Number.isFinite(density)) throw Error('Neighborhood seed and density must be finite.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  const retainedMaterials = new Set(scene.entities.map(entity => entity.materialId));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(prefix) || retainedMaterials.has(material.id));
  const add = (id: string, material: string, position: Vec3, scale: Vec3, solid = false, owner?: string) => {
    const entity: Entity = { id: prefix + id, meshId: 'tod:box', materialId: `tod:city:${material}`, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}) };
    if (owner) {
      const source = declaration.materials.find(item => item.id === entity.materialId);
      if (source) {
        entity.materialId = `${owner}:occlusion-follow:${entity.id}`;
        declaration.materials.push({ ...structuredClone(source), id: entity.materialId, alphaMode: 'blend' });
      }
    }
    scene.entities.push(entity);return entity;
  };
  const routes = authorNeighborhoodRoutes({ add, seed });
  const stations: Array<{ id: CityStationId; district: string; role: string; position: Vec3; slots: Array<{ position: Vec3; maxLength: number; supportId: string }> }> = [];
  const pickupPositions = (combat.weaponLayouts ?? []).flatMap(district => district.variants.flatMap(variant => variant.props.map(prop => prop.position)));
  const clear = (position: Vec3) => {
    if (combat.spawns?.some(spawn => spawn.positions.some(start => Math.abs(start[1] - position[1]) < 1 && Math.hypot(start[0] - position[0], start[2] - position[2]) < 2))) return false;
    if (!stationFootprintSupported(scene.entities, position)) return false;
    if (pickupPositions.some(prop => Math.abs(prop[0] - position[0]) < 1.76 && Math.abs(prop[2] - position[2]) < 1.01 && position[1] + .45 > prop[1] + .3 && position[1] - .45 < prop[1] + 1)) return false;
    return !scene.entities.some(entity => {
      if (!entity.physics || combat.fighters.some(fighter => fighter.entityId === entity.id)) return false;
      const { min, max } = cityMotionEnvelope(entity);
      const scale = [1.4, .4, .65];
      return position.every((value, axis) => value + scale[axis]! > min[axis]! + .01 && value - scale[axis]! < max[axis]! - .01);
    });
  };
  for (const [index, template] of cityStationTemplates.entries()) {
    const position = cityStationCandidates({ index, seed }).find(clear);
    if (!position) throw new Error(`No clear location for ${template.id}.`);
    const [x, y, z] = position;
    const support = add(`station:${template.id}`, 'warning', position, [1.3, .45, .55], true);
    add(`station:${template.id}:top`, 'steel', [x, y + .465, z], [1.32, .015, .57], true, support.id);
    const slots = [-1.1, 0, 1.1].map(offset => {
      const position: Vec3 = [template.center[0] + offset, template.center[1] - .15, template.center[2]];
      const floor = scene.entities.find(entity => entity.physics && !entity.animation && Math.abs(entity.position[0] - position[0]) <= entity.scale[0] && Math.abs(entity.position[2] - position[2]) <= entity.scale[2] && Math.abs(entity.position[1] + entity.scale[1] - position[1]) < .001);
      if (!floor) throw Error(`No pickup support for ${template.id}.`);
      return { position, maxLength: offset === 0 ? 2.4 : 1.2, supportId: floor.id };
    });
    stations.push({ id: template.id, district: template.district, role: template.role, position: [...template.center], slots });
    // Density changes cosmetic dressing only, never opportunities or collision budgets.
    if (density > .3) {
      add(`station:${template.id}:label`, 'chalk', [x, y + .19, z + .565], [.22, .055, .01], false, support.id);
      if (template.id.includes('equipment') || template.id.includes('maintenance')) {
        add(`station:${template.id}:rack`, 'steel', [x, y + .95, z - .5], [1.2, .45, .06], false, support.id);
        add(`station:${template.id}:rack-light`, 'window', [x, y + 1.35, z - .43], [.6, .04, .01], false, support.id);
      }
      if (template.id.includes('exercise')) {
        add(`station:${template.id}:mat`, 'paint', [template.center[0], y - .432, template.center[2]], [1.7, .018, .9]);
        add(`station:${template.id}:weights`, 'steel', [x - .85, y + .58, z], [.18, .12, .18], false, support.id);
      }
    }
  }
  // Match selection already persists authored nonfighter transforms. Move the
  // whole connector as one module before combat; rounds never reconstruct it.
  const crossing = scene.entities.find(entity => entity.id === `${prefix}route:depot-turn`)!;
  const connector = scene.entities.filter(entity => entity.id === crossing.id || entity.id.startsWith(crossing.id + ':'));
  for (const [index, spawn] of (combat.spawns ?? []).entries()) {
    const z = ((Math.trunc(seed) >>> 0) + index) % 2 ? 44 : 34;
    spawn.props = [...(spawn.props ?? []).filter(prop => !prop.entityId.startsWith(prefix)),
      ...connector.map(entity => {
        const position: Vec3 = [entity.position[0], entity.position[1], entity.position[2] + z - crossing.position[2]];
        return { entityId: entity.id, position };
      })];
  }
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix) && entity.physics).map(entity => entity.id)));
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
  return { stations, routes, seed: Math.trunc(seed) >>> 0 };
}
