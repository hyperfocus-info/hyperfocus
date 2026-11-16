import { hypot } from '../math/simulation.ts';
import type { CombatConfig } from "./config.ts";
import { normalizeFacing, type CombatCollision, type CombatEvent, type CombatFighterState } from "./state.ts";

/** Hosts report new ground/object impacts, not resting contacts. */
export function resolveCollisions(fighters: CombatFighterState[], collisions: CombatCollision[], config: CombatConfig, frame: number) {
  const events: CombatEvent[] = [];
  for (const collision of collisions) {
    const fighter = fighters.find((entry) => entry.id === collision.fighterId);
    if (!fighter || fighter.health <= 0 || fighter.stunKind !== "hit") continue;
    const tech = fighter.techWindowFrames > 0;
    const normal = normalizeFacing(collision.normal);
    const direction = fighter.techDirection;
    const length = hypot(direction.x, direction.y, direction.z);
    const impulse = collision.impulse ?? 6;
    events.push({ id: `${frame}:collision:${fighter.id}`, frame, attackerId: fighter.id, targetId: fighter.id,
      moveId: "", kind: tech ? "tech" : "bounce", defenseReason: tech ? 'surface-recovery' : 'missed-surface-recovery', damage: 0,
      contactNormal: { ...normal },
      ...(collision.contactPoint ? { contactPoint: { ...collision.contactPoint } } : {}),
      impulse: { x: normal.x * impulse + (tech && length ? direction.x / length * impulse : 0),
        y: normal.y * impulse + (tech && length ? direction.y / length * impulse : 0),
        z: normal.z * impulse + (tech && length ? direction.z / length * impulse : 0) } });
    if (tech) {
      fighter.stunFrames = 0; fighter.stunKind = ""; fighter.moveId = ""; fighter.moveFrame = 0;
      fighter.charging = false;
      fighter.techWindowFrames = 0; fighter.protectionFrames = config.techProtectionFrames ?? 12;
    }
  }
  return events;
}
