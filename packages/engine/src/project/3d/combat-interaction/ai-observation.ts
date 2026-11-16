import { hypot } from '../../../math/simulation.ts';
import type { CombatVector } from '../../../combat/config.ts';

/** Visible object state only; never pending commands or ownership intentions. */
export type CombatWeaponObservation = { owner: string; projectileOwner: string; position: CombatVector; velocity: CombatVector; length: number; lightMoveId: string; heavyMoveId: string };

export function incomingProjectileImpact(weapons: readonly CombatWeaponObservation[], fighterId: string, body: { x: number; y: number; z: number; velocityX: number; velocityY: number; velocityZ: number }, hurtRadius: number) {
  let earliest = Infinity;
  for (const item of weapons) {
    if (!item.projectileOwner || item.projectileOwner === fighterId) continue;
    let x = item.position.x, y = item.position.y, z = item.position.z, vy = item.velocity.y;
    for (let frame = 0; frame < Math.min(90, earliest); frame++) {
      const nx = x + item.velocity.x / 60, ny = y + vy / 60, nz = z + item.velocity.z / 60;
      const time = (frame + 1) / 60, tx = body.x + body.velocityX * time, ty = body.y + body.velocityY * time, tz = body.z + body.velocityZ * time;
      const dx = nx - x, dy = ny - y, dz = nz - z;
      const along = Math.max(0, Math.min(1, ((tx - x) * dx + (ty - y) * dy + (tz - z) * dz) / Math.max(.00001, dx * dx + dy * dy + dz * dz)));
      if (hypot(x + dx * along - tx, y + dy * along - ty, z + dz * along - tz) <= hurtRadius + .2) { earliest = frame; break; }
      x = nx; y = ny; z = nz; vy -= 0.1635;
    }
  }
  return earliest;
}
