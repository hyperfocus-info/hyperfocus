import type { CombatConfig } from '../config.ts';

/**
 * Frozen 0.0.x compatibility behavior; current game tuning belongs to the example.
 * @deprecated Use @hyperfocus/touch-of-death/combat/combos in workspace consumers.
 */
export function configureTouchOfDeathCombos(config: CombatConfig) {
  config.inputBufferFrames = 10;
  const links = config.moves.filter(move => move.stringOnly && move.command[0] === 'jab' && !move.weaponAttack);
  const heavies = config.moves.filter(move => move.command[0] === 'heavy' && !move.dashAttack && !move.weaponAttack);
  for (const move of config.moves) {
    if (move.damage <= 0 || move.weaponAttack) continue;
    const jab = move.command[0] === 'jab' || move.id === 'flurry';
    const heavy = move.command[0] === 'heavy' || move.pose === 'wheel-kick';
    const recovery = jab ? move.drive || move.dashAttack || move.id === 'flurry' ? 10 : 8
      : heavy ? move.drive ? 16 : move.dashAttack || move.id === 'dash-wheel-kick' ? 14 : 12 : 8;
    move.hitRecoveryFrames = Math.min(move.recoveryFrames, recovery);
    if (!jab && !move.armoredEscape) continue;
    const fromFrame = move.startupFrames + move.activeFrames;
    const toFrame = fromFrame + Math.max(0, move.hitRecoveryFrames - 1);
    // Replace old jab links, including unsafe unconditional links on whiff/block.
    move.cancels = move.cancels.filter(cancel => !config.moves.some(target => target.id === cancel.moveId && (target.command[0] === 'jab' || target.command[0] === 'heavy')));
    move.cancels.push(...[...links, ...heavies].map(target => ({ moveId: target.id, fromFrame, toFrame, hitOnly: true })));
  }
}
