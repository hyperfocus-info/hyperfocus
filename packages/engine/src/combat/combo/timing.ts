import type { CombatMove } from '../config.ts';
import type { CombatFighterState } from '../state.ts';

/** Hits preserve startup/active commitment and shorten only their authored recovery. */
export function combatRecoveryFrames(move: CombatMove, fighter: Pick<CombatFighterState, 'hitConfirmed'>) {
  return fighter.hitConfirmed ? move.hitRecoveryFrames ?? move.recoveryFrames : move.recoveryFrames;
}

export function combatMoveDuration(move: CombatMove, fighter: Pick<CombatFighterState, 'hitConfirmed'>) {
  return move.startupFrames + move.activeFrames + combatRecoveryFrames(move, fighter);
}
