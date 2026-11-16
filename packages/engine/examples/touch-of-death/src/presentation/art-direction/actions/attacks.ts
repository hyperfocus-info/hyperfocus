import type { CombatMove } from '@hyperfocus/engine/combat';
import { sampleUniversalCombat } from '../universal-combat.ts';
import { heavyCandidates, sampleArtMotion, type ArtMotion } from '../motion.ts';
import type { UniversalLocomotionBank } from '../universal-locomotion.ts';
import { blendArtMotion } from '../transition.ts';
import { attackRole } from './catalogue.ts';
import { arc, clamp, commitment, mix, phases, ready, smooth, type Point } from './curves.ts';

/** Every strike in a flurry has its own coil, contact and recoil. */
export function strikeClock(move: CombatMove, frame: number) {
  const offsets = move.strikeFrames ?? [0];
  let strike = 0;
  for (let i = 1; i < offsets.length; i++) if (frame >= move.startupFrames + offsets[i - 1]! + (offsets[i]! - offsets[i - 1]!) * .5) strike = i;
  const offset = offsets[strike]!, previous = offsets[strike - 1];
  const startup = strike === 0 ? move.startupFrames : (offset - (previous ?? 0)) * .5;
  const local = frame - (move.startupFrames + offset - startup);
  const next = offsets[strike + 1];
  return { frame: local, startup, active: next === undefined ? Math.max(1, move.activeFrames - offset) : 1,
    recovery: next === undefined ? move.recoveryFrames : Math.max(1, (next - offset) * .5 - 1), strike };
}

export function sampleAttack(bank: UniversalLocomotionBank, move: CombatMove, frame: number): ArtMotion {
  const role = attackRole(move), clock = strikeClock(move, frame);
  if (move.id === 'heavy' || move.id === 'drive-heavy') return sampleArtMotion({ kind: 'heavy', frame, startup: move.startupFrames, active: move.activeFrames, recovery: move.recoveryFrames, heavy: heavyCandidates[1] });
  if (role === 'jab' || role === 'jolt' || role === 'retreat-jab') {
    const pose = sampleUniversalCombat(bank, { kind: 'light', frame, startup: move.startupFrames, active: move.activeFrames, recovery: move.recoveryFrames });
    if (role === 'retreat-jab') { pose.hip[2] -= .07 * Math.sin(Math.PI * clamp(frame / (move.startupFrames + move.activeFrames + move.recoveryFrames))); pose.pitch -= .07; }
    return pose;
  }
  const p = phases(clock.frame, clock.startup, clock.active, clock.recovery), pose = ready();
  const load = p.load, hit = p.strike, side = role === 'flurry' || role === 'body-blows' ? clock.strike % 2 === 0 ? 1 : -1 : 1;
  pose.phase = p.phase;
  pose.hip = [side * -.035 * load + side * .045 * hit, .97 - .065 * load - .025 * hit, -.04 * load + .035 * hit];
  pose.pitch = .07 + .07 * load + .05 * hit; pose.twist = -.15 + side * (.22 * load - .42 * hit);
  pose.head = { pitch: .03, twist: -.02, roll: 0 };
  const strikeHand = side > 0 ? 'right' : 'left', guardHand = side > 0 ? 'left' : 'right';
  let coil: Point = [side * .37, 1.31, .09], contact: Point = [side * .10, 1.49, .59], control: Point = [side * .39, 1.43, .56];
  if (role === 'hook' || role === 'wheel-kick') { coil = [side * .42, 1.40, .12]; control = [side * .49, 1.48, .44]; contact = [-side * .10, 1.47, .51]; }
  if (role === 'liver-punch' || role === 'body-blows') { pose.hip[1] -= .065 * (load + hit); contact = [side * .05, 1.13, .53]; control = [side * .34, 1.07, .47]; coil[1] = 1.08; }
  if (role === 'uppercut' || role === 'gazelle' || role === 'rising-knee') { pose.hip[1] -= .13 * load; pose.pitch += .12 * load; coil = [side * .27, 1.01, .14]; control = [side * .27, 1.08, .53]; contact = [side * .09, 1.64, .46]; }
  if (role === 'reelback-armor' || role === 'back-hop') { pose.pitch -= .2 * load; pose.hip[2] -= .08 * load; }
  if (role === 'dive') { pose.pitch += .22 * hit; contact = [side * .09, 1.14, .63]; control = [side * .28, 1.65, .46]; }
  // Crosses and body blows must reach beyond the guard silhouette at contact.
  // The short initial target read as another guard even though native damage fired.
  contact[2] += role === 'hook' ? .14 : .18;
  control[2] += .10;
  const commit = role === 'dive' ? smooth((clock.frame - Math.max(0, clock.startup - 4)) / Math.max(1, Math.min(clock.startup, 4))) : commitment(clock.frame, Math.max(1, clock.startup));
  const loaded = mix(ready()[strikeHand], coil, smooth(clock.frame / Math.max(1, clock.startup * .55)));
  pose[strikeHand] = mix(arc(loaded, control, contact, commit), ready()[strikeHand], p.recover);
  pose[guardHand] = [side * -.18, 1.47 - .07 * load, .31];
  pose.feet = { leftPitch: 0, rightPitch: .12 * hit };
  if (role === 'rising-knee') { pose.rightFoot = [.18, .49 * hit + .10, -.25 + .49 * hit]; pose.right = [.25, 1.41, .27]; }
  if (role === 'wheel-kick') {
    pose.hip[0] -= .055 * hit; pose.hip[1] -= .04 * hit; pose.roll = .14 * hit;
    pose.rightFoot = arc([.205, .10, -.25], [.42, .65, .24], [.14, .85, .91], hit);
    pose.right = [.35, 1.30, .12]; pose.left = [-.27, 1.48, .30];
  }
  if (role === 'evade' || role === 'sidestep' || role === 'escape' || role === 'feint') {
    const envelope = Math.sin(Math.PI * clamp(frame / (move.startupFrames + move.activeFrames + move.recoveryFrames)));
    const dodge = ready(); dodge.phase = role; dodge.hip[1] -= .16 * envelope; dodge.hip[0] -= .12 * envelope; dodge.roll = .14 * envelope; dodge.pitch += .12 * envelope;
    dodge.left = [-.25, 1.43 - .10 * envelope, .30]; dodge.right = [.25, 1.40 - .10 * envelope, .28];
    return blendArtMotion({ from: ready(), to: dodge, weight: role === 'feint' ? .45 : 1 });
  }
  return pose;
}
