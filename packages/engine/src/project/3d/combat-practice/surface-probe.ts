import { hypot } from '../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';

/** A short trajectory preview against current authored solids, including moving platforms. */
export function createPracticeSurfaceProbe({ world, bodyIds }: { world: RigidWorld3D; bodyIds: readonly string[] }) {
  return (fighterId: string) => {
    const fighter = world.body(fighterId);if (!fighter) return false;
    const radius = fighter.shape.kind === 'sphere' ? fighter.shape.radius : Math.min(fighter.shape.halfX, fighter.shape.halfY, fighter.shape.halfZ);
    const px = fighter.x + fighter.velocityX * .15, py = fighter.y + Math.min(0, fighter.velocityY) * .15, pz = fighter.z + fighter.velocityZ * .15;
    for (const id of bodyIds) {
      const body = world.body(id);if (!body || body.type === 'dynamic' || body.trigger || body.collisionMask === 0) continue;
      const dx = px - body.x, dy = py - body.y, dz = pz - body.z;
      const x = -body.rotationX, y = -body.rotationY, z = -body.rotationZ, w = body.rotationW;
      const tx = 2 * (y * dz - z * dy), ty = 2 * (z * dx - x * dz), tz = 2 * (x * dy - y * dx);
      const lx = dx + w * tx + y * tz - z * ty, ly = dy + w * ty + z * tx - x * tz, lz = dz + w * tz + x * ty - y * tx;
      const shape = body.shape;
      const distance = shape.kind === 'sphere' ? hypot(lx, ly, lz) - shape.radius : hypot(Math.max(0, Math.abs(lx) - shape.halfX), Math.max(0, Math.abs(ly) - shape.halfY), Math.max(0, Math.abs(lz) - shape.halfZ));
      if (distance - radius < .7) return true;
    }
    return false;
  };
}
