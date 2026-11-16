import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import type { CombatMove } from '../../../../combat/config.ts';
import { combatRecoveryFrames } from '../../../../combat/combo/timing.ts';
import type { CombatFighterState } from '../../../../combat/state.ts';
import { hypot, sin } from '../../../../math/simulation.ts';

type Point = [number, number, number];
type Pose = { fist: Point; support: Point; kick: boolean; hand: number; coil: number; force: number; heavy: boolean; yaw: number; pitch: number; roll: number };


const styles = {
    jolt: { load: [.38, .3, -.45], pitch: .48, coil: -.14, yaw: .18, roll: 0 },
    'liver-punch': { load: [.7, -.32, -.7], pitch: .25, coil: .38, yaw: .7, roll: -.22 },
    gazelle: { load: [.4, -.22, -.6], pitch: .34, coil: .4, yaw: .26, roll: -.13 },
    dive: { load: [.12, .35, -.3], pitch: -.58, coil: -.15, yaw: 0, roll: 0 },
    'retreat-jab': { load: [.4, .42, -.18], pitch: -.35, coil: -.35, yaw: -.2, roll: .12 },
    'reelback-armor': { load: [.7, .45, -1], pitch: .5, coil: -.72, yaw: .5, roll: .08 },
    hook: { load: [1.15, .48, -.4], pitch: -.24, coil: -.32, yaw: 1.15, roll: -.2 },
    'back-hop': { load: [.42, .55, .16], pitch: -.32, coil: -.25, yaw: 0, roll: .1 },
    'wheel-kick': { load: [.22, .72, -.38], pitch: -.35, coil: -.35, yaw: 0, roll: -.32 },
    'stopping-straight': { load: [.38, .32, -.3], pitch: .15, coil: -.18, yaw: .22, roll: .03 },
    uppercut: { load: [.4, -.6, -.45], pitch: -.12, coil: .36, yaw: .5, roll: -.08 },
    'body-blows': { load: [.6, -.15, -.38], pitch: .28, coil: .2, yaw: .62, roll: -.16 },
    'rising-knee': { load: [.2, .5, .02], pitch: -.28, coil: .22, yaw: 0, roll: .08 },
  } as const;

/** Authored silhouettes share the move's real contact point and fixed-tick phases. */
export function applyDashAttackPose(fighter: CombatFighterState, move: CombatMove, base: Pose): Pose {
  if (!move.pose) return base;
  const startup = fighter.moveFrame < move.startupFrames, active = !startup && fighter.moveFrame < move.startupFrames + move.activeFrames;
  const progress = fighter.moveFrame / Math.max(1, move.startupFrames);
  const load = smooth(progress / .65), release = smooth((progress - .65) / .35);
  const anticipation = startup ? load * (1 - release) : 0;
  const recovery = smooth((fighter.moveFrame - move.startupFrames - move.activeFrames) / Math.max(1, combatRecoveryFrames(move, fighter)));
  const force = startup ? release : active ? 1 : 1 - recovery, side = fighter.attackSide || 1;

  const style = styles[move.pose], pose: Pose = { ...base, fist: [...base.fist], support: [...base.support] };
  pose.kick = move.pose === 'dive' || move.pose === 'wheel-kick' || move.pose === 'rising-knee';
  pose.hand = move.pose === 'hook' ? side : move.pose === 'body-blows' && fighter.strikeIndex % 2 === 1 ? -1 : 1;
  pose.fist[0] *= pose.hand / base.hand;
  pose.force = force;pose.coil = anticipation;
  pose.pitch = style.pitch * force + style.coil * anticipation;
  pose.yaw = style.yaw * (force - anticipation) * pose.hand;pose.roll = style.roll * force * pose.hand;
  if (active) pose.fist = [0, fighter.facing.y * move.reach + (move.hitHeight ?? 0) * Math.min(1, (fighter.moveFrame - move.startupFrames) / Math.max(1, move.activeFrames - 1)), hypot(fighter.facing.x, fighter.facing.z) * move.reach];
  if (startup) {
    const ready: Point = [.46 * pose.hand, .2, .28];
    for (let i = 0; i < 3; i++) pose.fist[i] = ready[i]! + (style.load[i]! * (i === 0 ? pose.hand : 1) - ready[i]!) * load * (1 - release) + (pose.fist[i]! - ready[i]!) * release;
  }
  if (move.pose === 'hook' && active) pose.fist[0] += sin((fighter.moveFrame - move.startupFrames) / Math.max(1, move.activeFrames - 1) * Math.PI) * Math.min(.6, move.hitRadius * .6) * side;
  if (move.pose === 'wheel-kick') {
    // One active sweep: anticipation and recovery only enter and leave the lean.
    const arc = active ? sin((fighter.moveFrame - move.startupFrames) / Math.max(1, move.activeFrames - 1) * Math.PI) : 0;
    pose.roll -= arc * .2;
    if (active) pose.fist[0] += arc * Math.min(.35, move.hitRadius * .35) * side;
  }
  pose.support = [-.4 * pose.hand - .18 * anticipation * pose.hand, .36 + (move.pose === 'back-hop' ? .3 : .15) * force, .22 - .35 * force];
  return pose;
}
