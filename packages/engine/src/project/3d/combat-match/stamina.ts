import type { CombatConfig } from '../../../combat/config.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';

/** Recover only a detached interlude/countdown capture; the caller owns its
 * promotion back into simulation. Support contacts are borrowed for this call. */
export function recoverCombatGapStamina(state: CombatSnapshot, config: CombatConfig, grounded: ReadonlySet<string>) {
  for (const fighter of state.fighters) {
    if (fighter.health <= 0 || fighter.moveId) continue;
    // Frozen countdown/result physics and restored saves may have no contacts.
    // Keep the committed airborne state; a fresh support contact marks landing.
    const airborne = fighter.wasAirborne && !grounded.has(fighter.id);
    const regen = fighter.stunFrames > 0 ? fighter.stunKind === 'hit' ? config.hitstunStaminaRegen ?? 0 : 0
      : airborne ? config.airStaminaRegen ?? config.staminaRegen ?? 0 : config.idleStaminaRegen ?? config.staminaRegen ?? 0;
    fighter.stamina = Math.min(config.maxStamina ?? 0, fighter.stamina + regen);
  }
}
