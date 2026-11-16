import type { CombatMove } from '../../../combat/config.ts';

/** Rank only the shared accepted-launch context; this never creates that context. */
export function dashAttackCandidates(options: { moves: readonly CombatMove[]; distance: number; above: number; targetAirborne: boolean; targetStun: number; closingSpeed: number; enemyRecovery: number }) {
  const score = (move: CombatMove) => {
    const heavy = move.command[0] === 'heavy';
    if (move.direction === 'toward') {
      if (heavy && !move.drive) return options.targetStun > move.startupFrames + 4 || options.enemyRecovery > move.startupFrames + 4 ? 100 : 10;
      if (heavy) return options.distance > 3 ? 90 : 25;
      return move.drive ? 65 : 55;
    }
    if (move.direction === 'neutral') {
      if (heavy) return options.targetAirborne && options.above > .4 ? move.drive ? 105 : 95 : 35;
      return options.distance < 2 ? move.drive && options.targetStun > move.startupFrames + 4 ? 100 : 85 : 30;
    }
    if (heavy && move.drive && move.damage === 0) return options.targetAirborne && options.above > .4 ? 100 : options.closingSpeed > 2 && options.distance > 2 ? 70 : 5;
    if (heavy) return options.enemyRecovery > move.startupFrames + 4 ? 90 : 20;
    return move.drive ? options.closingSpeed > 1 ? 80 : 40 : 60;
  };
  return options.moves.filter(move => move.dashAttack && !move.weaponAttack && !move.stringOnly)
    .sort((a, b) => score(b) - score(a) || a.startupFrames - b.startupFrames || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
