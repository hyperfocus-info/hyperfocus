import { hypot, sin } from '../../../math/simulation.ts';
import { combatRecoveryFrames } from '../../../combat/combo/timing.ts';
import type { CombatMove } from '../../../combat/config.ts';
import type { CombatFighterState } from '../../../combat/state.ts';
import { applyDashAttackPose } from './dash/attack.ts';

type Point = [number, number, number];

/** Local pose paths converge on the actual facing-aligned contact sphere. */
export function sampleCombatAttackPose(fighter: CombatFighterState, move: CombatMove) {
  const heavy = move.command[0] === 'heavy' || (move.verticalImpulse ?? 0) > 0;
  const direction = move.direction ?? 'neutral';
  const dive = move.diveAngle !== undefined;
  const windmill = (move.startupMovementSpeed ?? 0) < 0 && (move.strikeFrames?.length ?? 0) > 1;
  const kick = dive || windmill || move.command[0] === 'heavy' && direction === 'away' && !move.drive;
  const side = direction === 'side' ? fighter.attackSide : 1;
  const strike = Math.max(0, fighter.strikeIndex) + (move.stringOnly ? 1 : 0);
  const flurry = (move.strikeFrames?.length ?? 0) > 1;
  const hand = direction === 'side' ? side * (flurry && strike % 2 ? -1 : 1) : strike % 2 ? -1 : 1;
  const drive = move.drive ? heavy ? 1.55 : 1.25 : 1;
  const feint = move.id === 'feint';
  const windup = Math.min(1, fighter.moveFrame / Math.max(1, move.startupFrames));
  const active = fighter.moveFrame >= move.startupFrames && fighter.moveFrame < move.startupFrames + move.activeFrames;
  const recovery = Math.max(0, Math.min(1, (fighter.moveFrame - move.startupFrames - move.activeFrames) / Math.max(1, combatRecoveryFrames(move, fighter))));
  const ready: Point = [.46 * hand, .2, .28];
  const loaded: Point = move.drive && heavy && direction === 'neutral' ? [.92 * hand, -.65, -1.05]
    : direction === 'side' ? [hand * (heavy ? 1.4 : .85) * drive, heavy ? .4 : .25, -.4 * drive]
    : direction === 'toward' ? [.33 * hand, heavy ? .05 : .38, -.85 * drive]
    : direction === 'away' ? [.64 * hand, heavy ? .95 : .6, heavy ? .15 : -.75 * drive]
    : [.58 * hand, heavy ? -.55 : .25, -(heavy ? .85 : .35) * drive];
  const contact: Point = [0, fighter.facing.y * move.reach, hypot(fighter.facing.x, fighter.facing.z) * move.reach];
  // Last quarter of anticipation releases into contact. Active poses never
  // turn sideways with knockback direction: impulseAngle is not hitbox aim.
  const releaseAt = heavy ? .8 : .7;
  const load = Math.min(1, windup / (heavy ? .45 : .7));
  const release = Math.max(0, (windup - releaseAt) / (1 - releaseAt));
  const settle = recovery * recovery * (3 - 2 * recovery);
  let fist = mix(mix(ready, loaded, load), contact, release * release);
  if (active) {
    fist = [...contact];
    fist[1] += (move.hitHeight ?? 0) * Math.min(1, (fighter.moveFrame - move.startupFrames) / Math.max(1, move.activeFrames - 1));
  }
  else if (fighter.moveFrame >= move.startupFrames) {
    fist = mix([contact[0], contact[1] + (move.hitHeight ?? 0), contact[2]], ready, settle);
    fist[0] += sin(recovery * Math.PI) * hand * (direction === 'side' ? .6 : .12);
    fist[1] += sin(recovery * Math.PI) * (heavy && direction !== 'toward' ? .5 : .08);
  }
  if (feint) fist = mix(loaded, ready, active ? .7 : fighter.moveFrame >= move.startupFrames ? .7 + .3 * settle : Math.max(0, windup - .5));
  const force = feint ? 0 : active ? 1 : fighter.moveFrame >= move.startupFrames ? 1 - settle : release * release;
  const coil = fighter.moveFrame < move.startupFrames ? heavy ? Math.min(1, windup / .4) * (1 - release) : sin(windup * Math.PI) : 0;
  const twist = (direction === 'side' ? 1.2 : direction === 'away' ? -.4 : .55) * hand * drive;
  const pitch = direction === 'away' ? (heavy ? -.45 : -.3) : direction === 'toward' ? (heavy ? .6 : .5) : heavy ? .27 : .18;
  const loadPitch = heavy ? direction === 'toward' ? .55 : direction === 'away' ? -.65 : direction === 'side' ? -.08 : -.38 : -.15;
  const supportLift = heavy && direction === 'away' ? .35 * coil : 0;
  const strikeStart = move.strikeFrames?.[Math.max(0, fighter.strikeIndex)] ?? 0;
  const pulse = flurry && active ? Math.max(0, 1 - (fighter.moveFrame - move.startupFrames - strikeStart) / 5) : 0;
  if (windmill && active) {
    const sweep = (fighter.moveFrame - move.startupFrames - strikeStart) / 6 * Math.PI;
    fist = [sin(sweep) * Math.min(.7, move.hitRadius * .6) * hand, contact[1] + Math.max(0, sin(sweep)) * (move.hitHeight ?? 0), contact[2]];
  }
  return applyDashAttackPose(fighter, move, { fist, kick, hand, coil, force, heavy, yaw: kick ? 0 : twist * force - twist * coil,
    pitch: (dive ? -.55 : windmill ? -.3 : pitch) * force + loadPitch * coil,
    roll: direction === 'side' ? -.18 * side * force : direction === 'away' ? .12 * hand * force : 0,
    support: [hand * -(move.drive && heavy ? .62 : .4), .36 + supportLift + force * (move.drive ? .25 : .1) + pulse * .12, .22 - force * .24 - pulse * .48] });
}

function mix(a: Point, b: Point, amount: number): Point {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
