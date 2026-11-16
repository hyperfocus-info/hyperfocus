import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { RigidBodyState3D } from '../../../physics/rigid-3d.ts';

/** Fixed world-space kill plane below every authored support, including basements.
 * Moving debris never drags the boundary downward. Airborne roof travel stays legal.
 */
export function createCombatFallout3D(options: { runtime: Hyperfocus3DRuntime; fighterIds: readonly string[]; spawnPositions?: readonly (readonly number[])[] }) {
  const { runtime, fighterIds } = options;
  const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
  let minimum = Infinity;
  for (const entity of scene.entities) {
    const body = runtime.physics.body(entity.id);
    if (!body || fighterIds.includes(body.id) || body.type === 'dynamic' || body.trigger || !body.collisionMask) continue;
    minimum = Math.min(minimum, body.y - verticalExtent(body));
  }
  for (const position of options.spawnPositions ?? []) minimum = Math.min(minimum, position[1]!);
  if (!Number.isFinite(minimum)) for (const id of fighterIds) minimum = Math.min(minimum, runtime.physics.body(id)!.y);
  const minimumY = minimum - 4;
  function outside(body: RigidBodyState3D) { return body.y < minimumY; }
  return {
    minimumY,
    outside,
    resolve(state: CombatSnapshot): CombatEvent[] {
      const events: CombatEvent[] = [];
      for (const fighter of state.fighters) {
        if (fighter.health <= 0 || !outside(runtime.physics.body(fighter.id)!)) continue;
        const damage = fighter.health;
        fighter.health = 0;fighter.guarding = false;fighter.moveId = '';fighter.moveFrame = 0;
        fighter.charging = false;fighter.locomotionAllowed = false;
        events.push({ id: `${state.frame}:fallout:${fighter.id}`, frame: state.frame, attackerId: fighter.id, targetId: fighter.id,
          environmentId: 'out-of-bounds', moveId: 'fallout', kind: 'hit', defenseReason: 'out-of-bounds', damage,
          impulse: { x: 0, y: 0, z: 0 } });
      }
      return events;
    },
  };
}

function verticalExtent(body: RigidBodyState3D) {
  if (body.shape.kind === 'sphere') return body.shape.radius;
  const { rotationX: x, rotationY: y, rotationZ: z, rotationW: w } = body;
  const { halfX: hx, halfY: hy, halfZ: hz } = body.shape;
  return Math.abs(2 * (x * y + z * w)) * hx + Math.abs(1 - 2 * (x * x + z * z)) * hy + Math.abs(2 * (y * z - x * w)) * hz;
}
