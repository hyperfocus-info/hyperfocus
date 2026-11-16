import type { CombatMove } from '../../../combat/config.ts';
import type { CombatFighterState } from '../../../combat/state.ts';

/** Physics and AI share the signed phase speed; travel charge scales startup and active movement without pausing time. */
export function sampleAttackTravel(move: CombatMove, fighter: Pick<CombatFighterState, 'moveFrame' | 'chargeFrames'>) {
  const startup = fighter.moveFrame <= move.startupFrames;
  const active = !startup && fighter.moveFrame <= move.startupFrames + move.activeFrames;
  const charge = Math.min(1, fighter.chargeFrames / Math.max(1, move.chargeFrames ?? 0));
  const heldScale = 1 + charge * (move.chargeSpeedScale ?? 0);
  const speed = startup ? (move.startupMovementSpeed ?? move.movementSpeed ?? 0) * (move.chargeMode === 'travel' ? heldScale : 1)
    : active ? (move.activeMovementSpeed ?? move.movementSpeed ?? 0) * heldScale
    : move.movementSpeed ?? 0;
  return { speed, charge, startup, active };
}
