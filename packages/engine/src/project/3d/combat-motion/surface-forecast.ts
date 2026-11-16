import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';

/** Short, fallible tech observation against live arena boxes; never moves either body. */
export function createCombatSurfaceForecast({ world, bodyIds }: { world: RigidWorld3D; bodyIds: readonly string[] }) {
  const origin = [0, 0, 0], delta = [0, 0, 0];
  const hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
  return (fighterId: string, gravityY: number, frames: number) => {
    const fighter = world.body(fighterId);
    if (!fighter) return Infinity;
    const shape = fighter.shape;
    const radius = shape.kind === 'sphere' ? shape.radius : Math.min(shape.halfX, shape.halfY, shape.halfZ);
    const offset = shape.kind === 'sphere' ? 0 : Math.max(0, shape.halfY - radius);
    let earliest = Infinity;
    for (const id of bodyIds) {
      const body = world.body(id);
      if (!body || body.type === 'dynamic' || body.trigger || body.collisionMask === 0 || body.shape.kind !== 'box') continue;
      const { halfX, halfY, halfZ } = body.shape;
      const qx = -body.rotationX, qy = -body.rotationY, qz = -body.rotationZ, qw = body.rotationW;
      const local = (x: number, y: number, z: number, out: number[]) => {
        const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
        out[0] = x + qw * tx + qy * tz - qz * ty;
        out[1] = y + qw * ty + qz * tx - qx * tz;
        out[2] = z + qw * tz + qx * ty - qy * tx;
      };
      for (const height of offset ? [-offset, 0, offset] : [0]) {
        let x = fighter.x - body.x, y = fighter.y - body.y + height, z = fighter.z - body.z;
        let vx = fighter.velocityX, vy = fighter.velocityY, vz = fighter.velocityZ;
        for (let frame = 0; frame < Math.min(frames, earliest); frame++) {
          vx *= .985; vz *= .985; vy += gravityY / 60;
          const dx = (vx - body.velocityX) / 60, dy = (vy - body.velocityY) / 60, dz = (vz - body.velocityZ) / 60;
          local(x, y, z, origin); local(dx, dy, dz, delta); hit.time = 0;
          if (refineSphereBoxSweep(origin, delta, halfX, halfY, halfZ, radius, hit)
            && -(delta[0]! * hit.normalX + delta[1]! * hit.normalY + delta[2]! * hit.normalZ) * 60 > 1) {
            earliest = Math.min(earliest, frame + hit.time); break;
          }
          x += dx; y += dy; z += dz;
        }
      }
    }
    return earliest;
  };
}
