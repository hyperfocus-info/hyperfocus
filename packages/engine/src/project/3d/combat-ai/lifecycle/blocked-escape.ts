import { hypot } from '../../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../../physics/rigid-3d.ts';
import { createCombatObstaclePlanner } from '../../combat-environment/obstacle-route.ts';

/** A short ordinary walking exit, checked against solids and floor support. */
export function createBlockedEscape(options: { world: RigidWorld3D; bodyIds: readonly string[] }) {
  const plan = createCombatObstaclePlanner(options);
  return (fighterId: string, targetId: string, side: number) => {
    const actor = options.world.body(fighterId), target = options.world.body(targetId);
    if (!actor || !target) return undefined;
    const height = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
    const dx = target.x - actor.x, dz = target.z - actor.z, length = hypot(dx, dz) || 1;
    for (const sign of [side, -side]) {
      const destination = { x: actor.x - dz / length * sign * 2, y: actor.y, z: actor.z + dx / length * sign * 2 };
      const supported = [0.5, 1].every(t => options.bodyIds.some(id => {
        const body = options.world.body(id);
        if (!body || body.type !== 'static' || body.trigger || !body.collisionMask || body.shape.kind !== 'box' || Math.abs(body.rotationX) + Math.abs(body.rotationY) + Math.abs(body.rotationZ) > .001) return false;
        const x = actor.x + (destination.x - actor.x) * t, z = actor.z + (destination.z - actor.z) * t;
        return Math.abs(body.y + body.shape.halfY - (actor.y - height)) < .3 && Math.abs(x - body.x) < body.shape.halfX - .3 && Math.abs(z - body.z) < body.shape.halfZ - .3;
      }));
      if (!supported) continue;
      const route = plan(fighterId, targetId, destination, undefined, true);
      // Only a direct clear corridor: the recovery must not choose another complex detour.
      if (route && !route.direction) return { x: (destination.x - actor.x) / 2, y: 0, z: (destination.z - actor.z) / 2 };
    }
    return undefined;
  };
}
