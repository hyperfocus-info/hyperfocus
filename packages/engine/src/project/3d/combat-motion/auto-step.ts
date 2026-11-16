import type { RigidBodyState3D, RigidWorld3D } from '../../../physics/rigid-3d.ts';

function extents(body: RigidBodyState3D): [number, number, number] {
  const s = body.shape;if (s.kind === 'sphere') return [s.radius, s.radius, s.radius];
  const x = body.rotationX, y = body.rotationY, z = body.rotationZ, w = body.rotationW;
  return [Math.abs(1 - 2 * (y * y + z * z)) * s.halfX + Math.abs(2 * (x * y - z * w)) * s.halfY + Math.abs(2 * (x * z + y * w)) * s.halfZ,
    Math.abs(2 * (x * y + z * w)) * s.halfX + Math.abs(1 - 2 * (x * x + z * z)) * s.halfY + Math.abs(2 * (y * z - x * w)) * s.halfZ,
    Math.abs(2 * (x * z - y * w)) * s.halfX + Math.abs(2 * (y * z + x * w)) * s.halfY + Math.abs(1 - 2 * (x * x + y * y)) * s.halfZ];
}

/** Low static risers only. A saturated query refuses the step instead of overlooking clearance. */
export function createCombatAutoStep(options: { physics: RigidWorld3D }) {
  const { physics } = options, nearby = new Float64Array(128);
  return (body: RigidBodyState3D, vx: number, vz: number, height: number, grounded = true) => {
    if (height <= 0 || Math.abs(vx) + Math.abs(vz) < .01) return false;
    const [ex, ey, ez] = extents(body), bottom = body.y - ey;
    const x = body.x + vx / 60, z = body.z + vz / 60;
    const minX = Math.min(body.x, x) - ex, maxX = Math.max(body.x, x) + ex;
    const minZ = Math.min(body.z, z) - ez, maxZ = Math.max(body.z, z) + ez;
    const count = physics.queryAabb(minX, bottom - .03, minZ, maxX, body.y + ey + height, maxZ, nearby);
    if (count >= nearby.length) return false;
    let supported = grounded && body.velocityY <= .1;
    if (!supported && body.shape.kind === 'sphere') {
      for (let i = 0; i < count; i++) {
        const other = physics.body(nearby[i]!);
        if (!other || other.trigger || other.type !== 'static' || other.shape.kind !== 'box' || !(other.collisionLayer & body.collisionMask) || !(body.collisionLayer & other.collisionMask) || Math.abs(other.rotationX) + Math.abs(other.rotationY) + Math.abs(other.rotationZ) > .00001) continue;
        const dy = body.y - (other.y + other.shape.halfY);
        if (dy < body.shape.radius * .25 || dy > body.shape.radius + .03) continue;
        const dx = Math.max(Math.abs(body.x - other.x) - other.shape.halfX, 0), dz = Math.max(Math.abs(body.z - other.z) - other.shape.halfZ, 0);
        if (dx * dx + dy * dy + dz * dz <= (body.shape.radius + .03) ** 2) { supported = true;break; }
      }
    }
    if (!supported) return false;
    let top = bottom;
    for (let i = 0; i < count; i++) {
      const other = physics.body(nearby[i]!);
      if (!other || other.id === body.id || other.trigger || !(other.collisionLayer & body.collisionMask) || !(body.collisionLayer & other.collisionMask)) continue;
      // Inclined/rotating bodies aren't stairs: their high AABB corner isn't a support plane.
      if (other.type !== 'static' || other.shape.kind !== 'box' || Math.abs(other.rotationX) + Math.abs(other.rotationZ) + Math.abs(other.rotationY) > .00001) continue;
      const sx = other.shape.halfX, sy = other.shape.halfY, sz = other.shape.halfZ, surface = other.y + sy;
      if (surface <= bottom + .02 || surface > bottom + height || x + ex <= other.x - sx || x - ex >= other.x + sx || z + ez <= other.z - sz || z - ez >= other.z + sz) continue;
      top = Math.max(top, surface);
    }
    if (top === bottom) return false;
    const destinationY = top + ey + .002;
    for (let i = 0; i < count; i++) {
      const other = physics.body(nearby[i]!);
      if (!other || other.id === body.id || other.trigger || !(other.collisionLayer & body.collisionMask) || !(body.collisionLayer & other.collisionMask)) continue;
      const [sx, sy, sz] = extents(other);
      if (other.y + sy <= top + .001) continue;
      // Sphere corners do not occupy their entire AABB. Short treads otherwise
      // reject a safe step because the next riser touches an empty lower corner.
      if (body.shape.kind === 'sphere' && other.shape.kind === 'box' && Math.abs(other.rotationX) + Math.abs(other.rotationY) + Math.abs(other.rotationZ) < .00001) {
        const dx = Math.max(other.x - sx - Math.max(body.x, x), Math.min(body.x, x) - other.x - sx, 0);
        const dz = Math.max(other.z - sz - Math.max(body.z, z), Math.min(body.z, z) - other.z - sz, 0);
        const dy = Math.max(other.y - sy - destinationY, destinationY - other.y - sy, 0);
        if (dx * dx + dy * dy + dz * dz < body.shape.radius * body.shape.radius - .001) return false;
        continue;
      }
      // Swept full body clearance covers both vertical lift and forward travel.
      if (maxX > other.x - sx + .001 && minX < other.x + sx - .001 && maxZ > other.z - sz + .001 && minZ < other.z + sz - .001 && body.y - ey < other.y + sy && destinationY + ey > other.y - sy) return false;
    }
    physics.setPosition(body.id, body.x, destinationY, body.z);
    return true;
  };
}
