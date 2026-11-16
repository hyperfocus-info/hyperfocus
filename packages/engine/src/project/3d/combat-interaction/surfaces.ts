import type { CombatVector } from '../../../combat/config.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';

/** Weapon sweep against live authored box surfaces, including moving platforms. */
export function createWeaponSurfaceProbe(world: RigidWorld3D, ids: readonly string[]) {
  const handles = new Float64Array(world.capacity), order = new Map(ids.map((id, index) => [id, index]));
  return (from: CombatVector, to: CombatVector, sweepRadius = .065, preferredOverlap?: string) => {
    let first = 1, found = '', foundOrder = -1, normal = { x: 0, y: 0, z: 0 };
    const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
    const minZ = Math.min(from.z, to.z), maxZ = Math.max(from.z, to.z);
    const radius = Math.max(0, sweepRadius) + 1e-8;
    const count = world.queryAabb(minX - radius, minY - radius, minZ - radius, maxX + radius, maxY + radius, maxZ + radius, handles);
    for (let index = 0; index < count; index++) {
      const body = world.body(handles[index]!);
      if (!body || body.trigger || body.collisionMask === 0 || body.shape.kind !== 'box') continue;
      const id = body.id, ordinal = order.get(id);
      if (ordinal === undefined) continue;
      // L1 half-extent bounds every rotation, plus the weapon sweep radius.
      // Reject only disjoint swept bounds; endpoints alone miss crossed surfaces.
      const bound = body.shape.halfX + body.shape.halfY + body.shape.halfZ + sweepRadius;
      if (body.x + bound < minX || body.x - bound > maxX || body.y + bound < minY || body.y - bound > maxY || body.z + bound < minZ || body.z - bound > maxZ) continue;
      const local = (x: number, y: number, z: number, inverse = true) => {
        const sign = inverse ? -1 : 1, qx = body.rotationX * sign, qy = body.rotationY * sign, qz = body.rotationZ * sign, qw = body.rotationW;
        const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
        return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
      };
      const hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
      const origin = local(from.x - body.x, from.y - body.y, from.z - body.z);
      const inside = Math.abs(origin[0]!) <= body.shape.halfX && Math.abs(origin[1]!) <= body.shape.halfY && Math.abs(origin[2]!) <= body.shape.halfZ;
      if (inside) {
        const gaps = [body.shape.halfX - Math.abs(origin[0]!), body.shape.halfY - Math.abs(origin[1]!), body.shape.halfZ - Math.abs(origin[2]!)];
        const axis = gaps.indexOf(Math.min(...gaps));
        if (axis === 0) hit.normalX = origin[0]! < 0 ? -1 : 1;
        else if (axis === 1) hit.normalY = origin[1]! < 0 ? -1 : 1;
        else hit.normalZ = origin[2]! < 0 ? -1 : 1;
      }
      // Several boxes may overlap a stationary attack capsule at time zero.
      // Preserve its actual line-of-sight obstruction instead of letting a
      // later-listed prop behind that wall make the entire strike disappear.
      if ((inside || refineSphereBoxSweep(origin, local(to.x - from.x, to.y - from.y, to.z - from.z), body.shape.halfX, body.shape.halfY, body.shape.halfZ, Math.max(1e-8, sweepRadius), hit))
        && (hit.time < first || hit.time === first && (id === preferredOverlap || found !== preferredOverlap && ordinal > foundOrder))) {
        first = hit.time;found = id;foundOrder = ordinal;
        const direction = local(hit.normalX, hit.normalY, hit.normalZ, false);normal = { x: direction[0]!, y: direction[1]!, z: direction[2]! };
      }
    }
    return found ? { id: found, normal, position: { x: from.x + (to.x - from.x) * first, y: from.y + (to.y - from.y) * first, z: from.z + (to.z - from.z) * first } } : undefined;
  };
}
