import { compareMotionSignatures } from '@hyperfocus/artifact-review/direction';
import type { CombatConfig, CombatMove } from '@hyperfocus/engine/combat';
import { cityWeapon } from '../../../city/weapons/catalogue.ts';
import { compileWeaponDirection, directedMoveFamily } from '../../../city/weapons/direction/grammar.ts';
import { sampleWeapon } from '../weapons.ts';
import { nunchakuEndpoints } from './nunchaku.ts';

const representative = { blade: 'sword', piercing: 'dagger', blunt: 'baton', long: 'long-pipe', heavy: 'sledgehammer', flexible: 'nunchaku' };
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((n, i) => n - b[i]!));

/** Build-time regression gate, with tolerances scoped to this rig and combat grammar. */
export function auditWeaponMotion(config: CombatConfig, sample = sampleWeapon) {
  const plan = compileWeaponDirection(config), failures: string[] = [], comparisons: { a: string; b: string; mean: number; peak: number }[] = [];
  const signature = (move: CombatMove) => {
    const family = directedMoveFamily(move)!;
    const frames = [0, .5 * move.startupFrames, .85 * move.startupFrames, move.startupFrames, move.startupFrames + move.activeFrames + 3, move.startupFrames + move.activeFrames + move.recoveryFrames * .6];
    return frames.map(frame => { const p = sample(move, cityWeapon(representative[family]), frame); return [...p.hip, ...p.left, ...p.right, p.pitch, p.twist, ...p.weapon!.axis.map(n => n * .4)]; });
  };
  for (const family of Object.keys(representative)) {
    const ids = [`weapon-${family}-light`, `weapon-${family}-heavy`, ...['heavy-toward', 'heavy-away', 'drive-heavy-toward', 'drive-heavy-away'].map(source => `weapon-${family}-heavy:${source}`)];
    const moves = ids.map(id => config.moves.find(move => move.id === id)).filter((move): move is CombatMove => !!move);
    for (let a = 0; a < moves.length; a++) for (let b = a + 1; b < moves.length; b++) {
      const comparison = { a: moves[a]!.id, b: moves[b]!.id, ...compareMotionSignatures(signature(moves[a]!), signature(moves[b]!)) };
      comparisons.push(comparison);
      if (comparison.mean < .045) failures.push(`Recycled motion: ${comparison.a} / ${comparison.b} (${comparison.mean.toFixed(4)})`);
    }
  }
  let worstTransfer = 0, worstHandleStep = 0;
  for (const move of config.moves.filter(move => directedMoveFamily(move) === 'flexible')) {
    let previous: ReturnType<typeof nunchakuEndpoints> | undefined, previousHand = 'right';
    for (let frame = 0; frame <= move.startupFrames + move.activeFrames + move.recoveryFrames; frame += .25) {
      const pose = sample(move, cityWeapon('nunchaku'), frame), ends = nunchakuEndpoints(pose), hand = pose.weapon!.hand ?? 'right';
      if (previous) for (const key of ['a0', 'a1', 'b0', 'b1'] as const) {
        const step = distance(ends[key], previous[key]); worstHandleStep = Math.max(worstHandleStep, step);
        if (hand !== previousHand) worstTransfer = Math.max(worstTransfer, step);
      }
      previous = ends; previousHand = hand;
    }
  }
  if (worstTransfer > .08) failures.push(`Nunchaku hand transfer pops ${worstTransfer.toFixed(3)}m`);
  if (worstHandleStep > .25) failures.push(`Nunchaku handle jumps ${worstHandleStep.toFixed(3)}m in quarter-frame`);
  return { grammar: plan.grammar, comparisons, worstTransfer, worstHandleStep, failures };
}
