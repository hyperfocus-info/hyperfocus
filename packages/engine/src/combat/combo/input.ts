import type { CombatConfig, CombatMove } from '../config.ts';
import type { CombatFighterState } from '../state.ts';
import { combatMoveDuration } from './timing.ts';

export function matchesCombatCommand(fighter: CombatFighterState, move: CombatMove, config: CombatConfig, frame: number, includeExpired = false) {
  const start = fighter.history.length - move.command.length;
  if (start < 0) return false;
  const last = fighter.history.at(-1);
  if (!last) return false;
  if (last.dashing && !move.dashAttack && config.moves.some(other => other.dashAttack && other.command.join(':') === move.command.join(':') && (other.direction === undefined || other.direction === last.direction) && (other.drive === undefined || other.drive === last.drive))) return false;
  return (!move.dashAttack || last.dashing === true) && (move.direction === undefined || move.direction === last.direction) && (move.drive === undefined || move.drive === last.drive) && (move.airborne === undefined || move.airborne === last.airborne)
    && (includeExpired || frame - last.frame < config.inputBufferFrames) && move.command.every((key, index) => fighter.history[start + index]?.key === key);
}

export function combatCancelAllowed(fighter: CombatFighterState, current: CombatMove | undefined, move: CombatMove) {
  return current?.cancels.some(window => window.moveId === move.id && (!window.hitOnly || fighter.hitConfirmed) && fighter.moveFrame >= window.fromFrame && fighter.moveFrame <= window.toFrame) ?? false;
}

export function combatInputCandidates(fighter: CombatFighterState, config: CombatConfig, frame: number, includeExpired = false) {
  return config.moves.filter(move => matchesCombatCommand(fighter, move, config, frame, includeExpired))
    .sort((a, b) => Number(!!b.dashAttack) - Number(!!a.dashAttack) || Number(!!b.stringOnly) - Number(!!a.stringOnly) || b.command.length - a.command.length);
}

/** Read-only explanation of an unconsumed command; no new simulation state or timing changes. */
export function inspectCombatInput({ config, fighter, frame }: { config: CombatConfig; fighter: CombatFighterState; frame: number }) {
  const last = fighter.history.at(-1);
  if (!last) return undefined;
  const candidates = combatInputCandidates(fighter, config, frame, true);
  const authored = config.moves.find(move => move.id === fighter.moveId);
  const current = authored && fighter.moveFrame < combatMoveDuration(authored, fighter) ? authored : undefined;
  const first = candidates[0];
  let selected = first;
  let contextual = false;
  let reason: 'ready' | 'buffer-expired' | 'outside-cancel-window' | 'hit-not-confirmed' | 'insufficient-stamina' | 'stunned' | 'landing-recovery' | 'parry-followup-required' | 'escape-spent' | 'command-unmatched' | 'defeated' = 'command-unmatched';
  if (fighter.health <= 0) reason = 'defeated';
  else if (frame - last.frame >= config.inputBufferFrames) reason = 'buffer-expired';
  else if (candidates.some(move => move.armoredEscape && fighter.escapeCharges > 0)) reason = 'ready';
  else if (fighter.stunFrames > 0) reason = 'stunned';
  else if (fighter.landingFrames > 0 && !current) reason = 'landing-recovery';
  else for (const move of candidates) {
    const cancel = combatCancelAllowed(fighter, current, move);
    const blocked = move.parryFollowup && fighter.followupFrames === 0 ? 'parry-followup-required'
      : move.armoredEscape ? 'escape-spent'
      : (move.stringOnly && (!current || !cancel)) || (current && !cancel)
        ? current?.cancels.some(window => window.moveId === move.id && window.hitOnly && !fighter.hitConfirmed && fighter.moveFrame >= window.fromFrame && fighter.moveFrame <= window.toFrame) ? 'hit-not-confirmed' : 'outside-cancel-window'
        : (config.maxStamina ?? 0) > 0 && fighter.stamina < (move.staminaCost ?? 0) ? 'insufficient-stamina' : 'ready';
    if (move === first) reason = blocked;
    if (blocked === 'insufficient-stamina' && !contextual) { selected = move;reason = blocked;contextual = true; }
    if (blocked === 'ready') { selected = move;reason = blocked;break; }
  }
  return { key: last.key, pressedFrame: last.frame, moveId: selected?.id, reason };
}
