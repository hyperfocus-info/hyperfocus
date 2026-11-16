import { cos, hypot, sin } from '../../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../../physics/rigid-3d.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import { createWeaponSurfaceProbe } from '../../combat-interaction/surfaces.ts';
import type { CombatEnvironment } from '../config.ts';

export type HazardRouteRegion = { id: string; x: number; z: number; halfX: number; halfZ: number; penalty: number };
type Point = { x: number; z: number };

/** Only active, same-level equipment within local unobstructed sight affects planning. */
export function createObservedHazardRegions(options: { world: RigidWorld3D; entities: readonly Hyperfocus3DDeclaration['scenes'][number]['entities'][number][]; definition: CombatEnvironment; active: (surfaceId: string) => boolean }) {
  const entities = new Map(options.entities.map(entity => [entity.id, entity]));
  const sight = createWeaponSurfaceProbe(options.world, options.entities.filter(entity => entity.physics?.type === 'static').map(entity => entity.id));
  return (fighterId: string): HazardRouteRegion[] => {
    const actor = options.world.body(fighterId);if (!actor) return [];
    const height = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
    const result: HazardRouteRegion[] = [];
    for (const hazard of options.definition.hazards ?? []) {
      if (hazard.activationSurfaceId && !options.active(hazard.activationSurfaceId)) continue;
      const zone = entities.get(hazard.entityId)!;
      if (actor.y - height > zone.position[1] + zone.scale[1] || actor.y + height < zone.position[1] - zone.scale[1] || hypot(actor.x - zone.position[0], actor.z - zone.position[2]) > 24) continue;
      if (sight(actor, { x: zone.position[0], y: actor.y, z: zone.position[2] }, 0)) continue;
      const c = Math.abs(cos(zone.rotationY)), s = Math.abs(sin(zone.rotationY));
      result.push({ id: hazard.entityId, x: zone.position[0], z: zone.position[2], halfX: zone.scale[0] * c + zone.scale[2] * s, halfZ: zone.scale[0] * s + zone.scale[2] * c,
        penalty: hazard.kind === 'fire' ? Math.min(12, 1 + hazard.damage * 60 / hazard.intervalFrames) : 1 / hazard.groundSpeedScale - 1 });
    }
    // Nearest eight bound the corner graph. Unseen/distant zones grant no information.
    return result.sort((a, b) => hypot(actor.x - a.x, actor.z - a.z) - hypot(actor.x - b.x, actor.z - b.z) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 8);
  };
}

/** Finite exposure cost: crossing remains possible when no useful dry route exists. */
export function hazardSegmentCost(a: Point, b: Point, regions: readonly HazardRouteRegion[], radius: number) {
  const length = hypot(b.x - a.x, b.z - a.z);let result = length;
  for (const region of regions) {
    let first = 0, last = 1;
    for (const axis of ['x', 'z'] as const) {
      const delta = b[axis] - a[axis], offset = a[axis] - region[axis], half = (axis === 'x' ? region.halfX : region.halfZ) + radius;
      if (Math.abs(delta) < 1e-8) { if (Math.abs(offset) >= half) { last = -1;break; }continue; }
      const near = (-half - offset) / delta, far = (half - offset) / delta;
      first = Math.max(first, Math.min(near, far));last = Math.min(last, Math.max(near, far));
    }
    if (last > first) result += length * (last - first) * region.penalty;
  }
  return result;
}
