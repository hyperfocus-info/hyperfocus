import { sqrt } from '../../../math/simulation.ts';
import type { CombatVector } from '../../../combat/config.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';

/** A sampled launch corridor rejects solid ceilings and walls before committing. */
export function createCombatJumpClearance(options: { world: RigidWorld3D; bodyIds: readonly string[] }) {
  return (from: CombatVector, to: CombatVector, speed: number, gravity: number, radius: number) => {
    const discriminant = speed * speed - 2 * gravity * (to.y - from.y);
    if (discriminant < 0) return false;
    const duration = (speed + sqrt(discriminant)) / gravity;
    let previous = from;
    for (let step = 1; step <= 24; step++) {
      const progress = step / 24, t = duration * progress, blend = progress * progress * (3 - 2 * progress);
      const point = { x: from.x + (to.x - from.x) * blend, y: from.y + speed * t - gravity * t * t / 2, z: from.z + (to.z - from.z) * blend };
      for (const id of options.bodyIds) {
        const body = options.world.body(id);
        if (!body || body.type === 'dynamic' || body.trigger || !body.collisionMask || body.shape.kind !== 'box') continue;
        const x = -body.rotationX, y = -body.rotationY, z = -body.rotationZ, w = body.rotationW;
        const local = (dx: number, dy: number, dz: number) => {
          const tx = 2 * (y * dz - z * dy), ty = 2 * (z * dx - x * dz), tz = 2 * (x * dy - y * dx);
          return [dx + w * tx + y * tz - z * ty, dy + w * ty + z * tx - x * tz, dz + w * tz + x * ty - y * tx];
        };
        const delta = local(point.x - previous.x, point.y - previous.y, point.z - previous.z), hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
        if (!refineSphereBoxSweep(local(previous.x - body.x, previous.y - body.y, previous.z - body.z), delta, body.shape.halfX, body.shape.halfY, body.shape.halfZ, radius * .98, hit)) continue;
        if (step === 1 && hit.time === 0 && delta[0]! * hit.normalX + delta[1]! * hit.normalY + delta[2]! * hit.normalZ > 0) continue;
        if (step === 24 && hit.time > .98 && hit.normalY > .5) continue;
        return false;
      }
      previous = point;
    }
    return true;
  };
}
