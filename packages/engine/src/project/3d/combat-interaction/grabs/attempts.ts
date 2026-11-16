import type { CombatInput, CombatSnapshot } from '../../../../combat/state.ts';
import type { CombatVector } from '../../../../combat/config.ts';
import { hypot } from '../../../../math/simulation.ts';

export type GrabAttempt = { attacker: string; remaining: number; direction: CombatVector };
export const GRAB_RELEASE_RECOVERY = 17;

/** Startup commits only the attacker. The opponent can move or interrupt before contact. */
export function advanceGrabAttempts(attempts: GrabAttempt[], state: CombatSnapshot, inputs: CombatInput[]) {
  const ready = new Set<string>();
  for (const attempt of [...attempts]) {
    const actor = state.fighters.find(fighter => fighter.id === attempt.attacker)!;
    if (actor.health <= 0 || actor.stunKind === 'hit' || actor.moveId) {
      attempts.splice(attempts.indexOf(attempt), 1);continue;
    }
    if (--attempt.remaining > 0) continue;
    attempts.splice(attempts.indexOf(attempt), 1);
    actor.stunFrames = 0;actor.stunKind = '';
    let input = inputs.find(input => input.fighterId === actor.id);
    if (!input) { input = { fighterId: actor.id, direction: attempt.direction };inputs.push(input); }
    input.pressed = ['interact'];ready.add(actor.id);
  }
  return ready;
}

/** Keep analog magnitude; deadzone creates a small upward neutral release. */
export function grabDirection(direction?: CombatVector): CombatVector {
  if (!direction) return { x: 0, y: 0, z: 0 };
  const length = hypot(direction.x, direction.z);
  if (length < .3) return { x: 0, y: 0, z: 0 };
  const scale = 1 / Math.max(1, length);
  return { x: direction.x * scale, y: 0, z: direction.z * scale };
}
