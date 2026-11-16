import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';

type Body = NonNullable<ReturnType<RigidWorld3D['body']>>;
export type CombatObstacleBounds = { body: Body; minX: number; maxX: number; minZ: number; maxZ: number };

/** Conservative world bounds, computed once per live body rather than per graph edge. */
export function combatObstacleBounds(body: Body): CombatObstacleBounds {
  if (body.shape.kind !== 'box') throw new Error('Combat obstacle bounds require a box.');
  const { rotationX: x, rotationY: y, rotationZ: z, rotationW: w } = body;
  const { halfX, halfY, halfZ } = body.shape;
  const extentX = Math.abs(1 - 2 * (y * y + z * z)) * halfX + Math.abs(2 * (x * y - z * w)) * halfY + Math.abs(2 * (x * z + y * w)) * halfZ;
  const extentZ = Math.abs(2 * (x * z - y * w)) * halfX + Math.abs(2 * (y * z + x * w)) * halfY + Math.abs(1 - 2 * (x * x + y * y)) * halfZ;
  return { body, minX: body.x - extentX, maxX: body.x + extentX, minZ: body.z - extentZ, maxZ: body.z + extentZ };
}

/** A miss is definitive; a hit still requires the existing exact rounded-box sweep. */
export function combatSegmentMayMeetBox(ax: number, az: number, bx: number, bz: number, radius: number, box: CombatObstacleBounds): boolean {
  // Keep grazing contacts in the narrow phase despite floating-point bounds error.
  const padding = radius + 1e-8;
  const minX = box.minX - padding, maxX = box.maxX + padding, minZ = box.minZ - padding, maxZ = box.maxZ + padding;
  if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(az, bz) < minZ || Math.min(az, bz) > maxZ) return false;
  const dx = bx - ax, dz = bz - az;
  let enter = 0, exit = 1;
  if (dx !== 0) {
    const a = (minX - ax) / dx, b = (maxX - ax) / dx;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  if (dz !== 0) {
    const a = (minZ - az) / dz, b = (maxZ - az) / dz;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  return enter <= exit;
}
