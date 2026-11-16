import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityStationTemplates } from '../neighborhood/stations.ts';
import { cityWeapon } from './catalogue.ts';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Stage actual stock around furniture while checking every structural arrangement. */
export function createCityWeaponStaging({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const solids = scene.entities.filter(entity => entity.physics && entity.physics.type === 'static' && !entity.animation);
  const moving = scene.entities.filter(entity => entity.physics && entity.animation?.kind === 'ping-pong');
  const poses = new Map<string, Vec3[]>();
  for (const layout of combat.arenaLayouts ?? []) for (const variant of layout.variants) for (const prop of variant.props) {
    const list = poses.get(prop.entityId) ?? [];list.push(prop.position);poses.set(prop.entityId, list);
  }
  const used: Vec3[] = [];
  function supported(position: Vec3) {
    return solids.some(entity => (poses.get(entity.id) ?? [entity.position]).every(at =>
      Math.abs(at[0] - position[0]) < entity.scale[0] + .001 && Math.abs(at[2] - position[2]) < entity.scale[2] + .001
      && Math.abs(at[1] + entity.scale[1] + (entity.id.startsWith('tod:city:neighborhood:station:') ? .03 : 0) - position[1]) < .001));
  }
  function clear(position: Vec3, support?: Entity, separation = .72) {
    if (!supported(position)) return false;
    if (used.some(at => Math.abs(at[1] - position[1]) < .4 && Math.hypot(at[0] - position[0], at[2] - position[2]) < separation)) return false;
    if (moving.some(entity => {
      const animation = entity.animation;
      if (animation?.kind !== 'ping-pong') return false;
      return position.every((value, axis) => value + (axis === 1 ? .9 : .5) > Math.min(entity.position[axis]!, entity.position[axis]! + animation.offset[axis]!) - entity.scale[axis]!
        && value - (axis === 1 ? .1 : .5) < Math.max(entity.position[axis]!, entity.position[axis]! + animation.offset[axis]!) + entity.scale[axis]!);
    })) return false;
    return !solids.some(entity => entity !== support && (poses.get(entity.id) ?? [entity.position]).some(at =>
      Math.abs(at[0] - position[0]) < entity.scale[0] + .5 && Math.abs(at[2] - position[2]) < entity.scale[2] + .5
      && at[1] + entity.scale[1] > position[1] + .05 && at[1] - entity.scale[1] < position[1] + 1.45));
  }
  function place(district: number, variant: number, slot: number, key: string): Vec3 {
    if (slot === 0) used.length = 0;
    const signature = key === 'nunchaku' || district === 4 && (key === 'sword' || key === 'dagger');
    const stationIndex = key === 'nunchaku' ? 5 : district === 4 && signature ? 13 : district * 3 + (variant === 2 && slot >= 3 ? 2 : Math.floor(slot / 3));
    const station = cityStationTemplates[stationIndex]!;
    const owner = scene.entities.find(entity => entity.id === `tod:city:neighborhood:station:${station.id}`);
    const item = cityWeapon(key), local = slot % 3;
    if (owner && signature && item.length <= owner.scale[0] * 2 - .2) {
      // Flat signature weapons have a narrow footprint. A clear rear support
      // lane leaves the two forward short-prop slots available on this rack.
      const position: Vec3 = [owner.position[0] + .25, owner.position[1] + owner.scale[1] + .03, owner.position[2] - .3];
      if (clear(position, owner, .35)) { used.push(position);return position; }
      throw Error(`No supported signature pose for ${station.id}/${key}.`);
    }
    if (owner && local < 2 && item.length <= .9) {
      const position: Vec3 = [owner.position[0] + (local ? .42 : -.72), owner.position[1] + owner.scale[1] + .03,
        owner.position[2] + (local ? .16 : -.17)];
      if (clear(position, owner)) { used.push(position);return position; }
    }
    // A loose fan, not another display row. Both near sides remain plausible for
    // long tools, an extinguisher or a box left at a delivery/work station.
    if (owner) {
      const offsets = [[-.75, 1.5], [1.95, .3], [.7, 1.7], [-1.95, -.25], [.2, -1.55]] as const;
      for (let attempt = 0; attempt < offsets.length; attempt++) {
        const offset = offsets[(attempt + local + variant) % offsets.length]!;
        const position: Vec3 = [owner.position[0] + offset[0], station.center[1] - .15, owner.position[2] + offset[1]];
        if (clear(position)) { used.push(position);return position; }
      }
    }
    // Retain the inspected street pocket when a moved structure makes furniture
    // access unsafe. The third offset bends the cluster, so even fallback stock
    // never becomes a ruler-straight row of identical poses.
    const offsets = [[-1.1, 0], [.05, .35], [1.1, -.18]] as const;
    const offset = offsets[local]!;
    const position: Vec3 = [station.center[0] + offset[0], station.center[1] - .15, station.center[2] + offset[1] + (variant === 1 ? .65 : 0)];
    if (!clear(position)) throw Error(`No supported, clear stock pose for ${station.id}/${key}.`);
    used.push(position);return position;
  }
  return { place };
}
