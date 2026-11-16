import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorCityMatchLayouts } from './expansion.ts';
import { authorCombatObstructions } from '../obstructions.ts';
import { authorCityWeaponLayouts } from './weapons/layouts.ts';
import { dressCityVehicles } from './vehicles/models.ts';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
const prefix = 'tod:city:traffic:';

/** Authored depot shuttles, work carts and transfer decks use the ordinary moving-support rules. */
export function authorCityActivity({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('City activity requires an active scene.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith(prefix));
  const box = (id: string, material: string, position: Vec3, scale: Vec3, solid = false, animation?: Entity['animation']) => {
    const entity: Entity = { id: prefix + id, meshId: 'tod:box', materialId: 'tod:city:' + material, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}), ...(animation ? { animation: structuredClone(animation) } : {}) };
    scene.entities.push(entity);return entity;
  };
  const route = (id: string, start: Vec3, offset: Vec3, halfWidth: number) => {
    const alongX = offset[0] !== 0, length = Math.abs(alongX ? offset[0] : offset[2]);
    for (const side of [-1, 1]) box(`${id}:lane:${side}`, 'warning', [start[0] + offset[0] / 2 + (alongX ? 0 : side * halfWidth), .016, start[2] + offset[2] / 2 + (alongX ? side * halfWidth : 0)], alongX ? [length / 2 + 3, .016, .055] : [.055, .016, length / 2 + 3]);
    for (let index = 0; index <= length; index += 5) box(`${id}:dash:${index}`, 'chalk', [start[0] + (alongX ? index : 0), .02, start[2] + (alongX ? 0 : index)], alongX ? [.8, .02, .06] : [.06, .02, .8]);
    for (const end of [0, 1]) {
      const x = start[0] + offset[0] * end, z = start[2] + offset[2] * end;
      box(`${id}:stop:${end}`, 'warning', [x + (alongX ? 0 : halfWidth + .5), 1.1, z + (alongX ? halfWidth + .5 : 0)], [.08, 1.1, .08]);
      box(`${id}:beacon:${end}`, 'lamp', [x + (alongX ? 0 : halfWidth + .5), 2.25, z + (alongX ? halfWidth + .5 : 0)], [.15, .15, .15]);
    }
  };
  const vehicle = (id: string, kind: 'cart' | 'car' | 'bus' | 'train', start: Vec3, offset: Vec3, seconds: number) => {
    const alongX = offset[0] !== 0, length = kind === 'bus' ? 4.6 : kind === 'train' ? 4 : kind === 'car' ? 2.2 : 1.8;
    const width = kind === 'bus' || kind === 'train' ? 1.35 : kind === 'car' ? .95 : 1.15;
    const height = kind === 'bus' || kind === 'train' ? 2.6 : kind === 'car' ? 1.1 : .55;
    const animation: Entity['animation'] = { kind: 'ping-pong', offset, periodSeconds: seconds, phase: 0 };
    if (kind !== 'cart') Object.assign(animation, { travelSeconds: Math.hypot(...offset) / (kind === 'car' ? 20 : kind === 'bus' ? 16 : 18), varyByMatch: true, phase: id === 'car-east' ? .11 : id === 'car-west' ? .37 : kind === 'bus' ? .61 : .83 });
    if (kind === 'car') Object.assign(animation, { travelSeconds: 3.5, periodSeconds: 11, turnRadius: id === 'car-east' ? 1.5 : -1.5, turnPivot: [...start] });
    const at = (forward: number, y: number, side: number): Vec3 => [start[0] + (alongX ? forward : side), y, start[2] + (alongX ? side : forward)];
    const shape = (forward: number, y: number, side: number): Vec3 => alongX ? [forward, y, side] : [side, y, forward];
    const piece = (part: string, material: string, position: Vec3, scale: Vec3, solid = false) => box(`${id}:${part}`, material, position, scale, solid, animation);
    piece('body', kind === 'cart' ? 'rust' : kind === 'bus' ? 'paint' : 'train', at(0, .25 + height / 2, 0), shape(length, height / 2, width), true);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const wheel = piece(`wheel:${side}:${end}`, 'steel', at(end * length * .65, .35, side * (width + .04)), shape(.36, .36, .14));wheel.meshId = 'tod:sphere';
      piece(`light:${side}:${end}`, end < 0 ? 'warning' : 'lamp', at(end * (length + .02), kind === 'cart' ? .5 : .9, side * width * .7), shape(.035, .08, .12));
    }
    if (kind === 'car') {
      piece('cabin', 'paint', at(-.2, 1.55, 0), shape(1.15, .45, width * .9), true);
      for (const side of [-1, 1]) piece(`side-glass:${side}`, 'window', at(-.2, 1.65, side * width * .91), shape(.9, .24, .018));
      for (const end of [-1, 1]) piece(`windshield:${end}`, 'window', at(-.2 + end * 1.16, 1.65, 0), shape(.018, .25, .7));
    } else if (kind === 'cart') {
      piece('load', 'plaster', at(-.7, .98, 0), shape(.55, .18, .8), true);
      for (const side of [-1, 1]) piece(`strap:${side}`, 'steel', at(-.7, 1.17, side * .5), shape(.56, .015, .035));
    } else {
      for (const side of [-1, 1]) for (let index = -2; index <= 2; index++) piece(`window:${side}:${index}`, 'window', at(index * length * .31, 1.95, side * (width + .015)), shape(length * .12, .4, .018));
      for (const end of [-1, 1]) piece(`cab-glass:${end}`, 'window', at(end * (length + .02), 1.95, 0), shape(.02, .42, width * .8));
      if (kind === 'train') for (const side of [-1, 1]) box(`${id}:rail:${side}`, 'steel', [start[0] + offset[0] / 2, .025, start[2] + side * .85], [Math.abs(offset[0]) / 2 + length + 1, .025, .055]);
    }
    if (kind === 'car') route(id, [start[0] + (id === 'car-east' ? -1.5 : 1.5), start[1], start[2]], offset, width + 2.15);
    else route(id, start, offset, width + .65);
  };
  // Cars circulate through separate return lanes; double-ended transit remains reciprocal.
  vehicle('cart-west', 'cart', [-26, 0, 16], [14, 0, 0], 20);
  vehicle('cart-north', 'cart', [18, 0, -42], [12, 0, 0], 20);
  vehicle('car-east', 'car', [32, 0, -22], [0, 0, 44], 9);
  vehicle('car-west', 'car', [-32, 0, -28], [0, 0, 48], 10);
  vehicle('bus-south', 'bus', [-24, 0, 28], [48, 0, 0], 12);
  vehicle('freight-shuttle', 'train', [-20, 0, -30], [40, 0, 0], 11);
  const motion: Entity['animation'] = { kind: 'ping-pong', offset: [0, 0, 12], periodSeconds: 16, phase: 0 };
  box('transfer:deck', 'steel', [25, 2.2, 6], [2.2, .2, 2.2], true, motion);
  for (const side of [-1, 1]) {
    box(`transfer:edge:${side}`, 'warning', [25 + side * 2.13, 2.415, 6], [.06, .015, 2.13], false, motion);
    box(`transfer:rail:${side}`, 'steel', [25 + side * 2, 2.05, 12], [.04, .04, 9]);
    box(`transfer:dock:${side}`, 'concrete', [25, 2.2, side < 0 ? 2 : 22], [2.2, .2, 1.7], true);
  }
  for (const z of [2, 22]) box(`transfer:pier:${z}`, 'steel', [25, 1, z], [.45, 1, .45]);
  authorCityMatchLayouts({ combat });
  dressCityVehicles({ declaration });
  authorCityWeaponLayouts({ declaration, combat });
  const move = combat.config.moves.find(move => move.id === 'heavy-toward') ?? combat.config.moves.find(move => move.id === 'heavy');
  if (move && combat.environment) Object.assign(combat.environment, { traffic: ['car-east', 'car-west', 'bus-south', 'freight-shuttle'].map(id => ({ entityId: `${prefix}${id}:body`, moveId: move.id, minSpeed: 3 })) });
  for (const prop of combat.spawns?.[0]?.props ?? []) { const entity = scene.entities.find(entity => entity.id === prop.entityId);if (entity) entity.position = [...prop.position]; }
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix) && entity.physics).map(entity => entity.id)));
  for (const entity of scene.entities) {
    if (!entity.id.startsWith(prefix) || !entity.animation || entity.physics) continue;
    const group = entity.id.slice(0, entity.id.indexOf(':', prefix.length)), part = entity.id.slice(group.length + 1);
    const owner = `${group}:${group.endsWith(':transfer') ? 'deck' : /glass|windshield/.test(part) && group.includes(':car-') ? 'cabin' : 'body'}`;
    const material = declaration.materials.find(material => material.id === entity.materialId);
    if (!material) continue;
    const id = `${owner}:occlusion-follow:${entity.id}`;
    declaration.materials.push({ ...structuredClone(material), id, alphaMode: 'blend' });entity.materialId = id;
  }
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
