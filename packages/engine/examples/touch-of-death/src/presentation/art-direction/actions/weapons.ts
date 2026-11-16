import type { CombatMove } from '@hyperfocus/engine/combat';
import { artTorsoPoint, solveArtArm, type ArtMotion } from '../motion.ts';
import type { cityWeapon } from '../../city/weapons/catalogue.ts';
import { strikeClock } from './attacks.ts';
import { arc, clamp, commitment, mix, phases, ready, smooth, type Point } from './curves.ts';
import { isDirectedFamily } from '../../city/weapons/direction/grammar.ts';
import { sampleDirectedStroke } from './weapon-motion/stroke.ts';
import { articulateNunchaku } from './weapon-motion/nunchaku.ts';
import { map3 } from '@hyperfocus/utilities/tuples';

export type ArtWeapon = Omit<ReturnType<typeof cityWeapon>, 'length' | 'width' | 'depth'> & { length: number; width: number; depth: number };
const normalize = (p: Point): Point => { const d = Math.max(.0001, Math.hypot(...p)); return [p[0] / d, p[1] / d, p[2] / d]; };

export function weaponGrip(pose: ArtMotion, weapon: ArtWeapon, axis: Point) {
  pose.weapon = { ...pose.weapon, axis: normalize(axis), grip: weapon.family === 'long' ? -.20 : ['shield', 'spray', 'ground', 'distraction', 'fragile'].includes(weapon.family) ? 0 : -.70 };
  // Anchor to the solved wrist, then solve the second arm towards that same shaft.
  if (weapon.family === 'long' || weapon.family === 'heavy' || pose.weapon.twoHanded) {
    const gap = weapon.family === 'long' ? .24 : .18;
    const rightShoulder = solveArtArm({ pose, side: 'right' }).shoulder, leftShoulder = solveArtArm({ pose, side: 'left' }).shoulder;
    const shift = map3(pose.weapon.axis, n => n * gap);
    const project = (point: Point, center: Point): Point => { const d = Math.hypot(...point.map((n, i) => n - center[i]!)); return d < .565 ? point : mix(center, point, .565 / d); };
    // Project the common shaft into the intersection of both arms' reach spheres.
    // Clamping each hand independently leaves the second hand floating off the tool.
    const leftCenter: Point = [leftShoulder[0] - shift[0], leftShoulder[1] - shift[1], leftShoulder[2] - shift[2]];
    for (let i = 0; i < 12; i++) pose.right = project(project(pose.right, rightShoulder), leftCenter);
    pose.left = [pose.right[0] + shift[0], pose.right[1] + shift[1], pose.right[2] + shift[2]];
  }
  const hand = pose.weapon.hand ?? 'right';
  pose[hand] = solveArtArm({ pose, side: hand }).end;
  return pose;
}

/** Tool families differ by grip, inertia, attack plane and recovery, not color. */
export function sampleWeapon(move: CombatMove | undefined, weapon: ArtWeapon, frame: number, base = ready()): ArtMotion {
  if (move && isDirectedFamily(weapon.family)) {
    const pose = sampleDirectedStroke(weapon.family === 'flexible' ? { ...move, strikeFrames: undefined } : move, weapon.family, frame);
    if (weapon.family === 'flexible') return articulateNunchaku(pose, move, frame);
    if (weapon.family === 'blunt' && move.weaponAttack === 'heavy') pose.weapon!.twoHanded = true;
    return weaponGrip(pose, weapon, pose.weapon!.axis);
  }
  const pose = { ...base }, heavy = move ? (move.weaponAttack ?? (move.id.includes('heavy') ? 'heavy' : 'light')) === 'heavy' : false;
  const clock = move ? strikeClock(move, frame) : { frame: 0, startup: 10, active: 1, recovery: 10, strike: 0 };
  const p = phases(clock.frame, clock.startup, clock.active, clock.recovery), load = move ? p.load : 0, hit = move ? p.strike : 0;
  pose.phase = move ? p.phase : 'weapon-ready';
  pose.twist += .24 * load - (heavy ? .47 : .28) * hit; pose.pitch += .07 * load + .07 * hit;
  pose.hip = [...base.hip]; pose.hip[1] -= (weapon.family === 'heavy' ? .13 : .035) * load;
  // A carried tool replaces the gait's arm motion as one chain; retaining its
  // moving bend hints with a held wrist repeats the rejected stop-arm defect.
  if (pose.elbows || pose.authored) pose.elbows = { left: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.40, .25, -.06]), right: artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.40, .25, -.06]) };
  let idle: Point = [.18, 1.25, .34], coil: Point = [.34, 1.45, .08], contact: Point = [.05, 1.26, .53];
  let idleAxis: Point = [.2, .85, .4], coilAxis: Point = [.45, .80, -.4], hitAxis: Point = [-.7, -.20, .65];
  if (weapon.family === 'piercing') { idle = [.26, 1.29, .31]; coil = [.30, 1.29, .10]; contact = [.11, heavy ? 1.25 : 1.44, .60]; idleAxis = [0, .15, 1]; coilAxis = [0, .25, 1]; hitAxis = [0, 0, 1]; }
  if (weapon.family === 'long') { idle = [.21, 1.18, .32]; coil = [.27, 1.25, .12]; contact = [.09, heavy ? 1.27 : 1.18, .47]; idleAxis = [-.6, .25, .7]; coilAxis = [-.2, .85, -.4]; hitAxis = heavy ? [-.8, -.1, .6] : [-.18, .05, 1]; }
  if (weapon.family === 'heavy') { idle = [.18, 1.12, .32]; coil = [.20, 1.53, .16]; contact = [.10, 1.01, .47]; idleAxis = [-.4, .7, .5]; coilAxis = [-.2, .96, -.15]; hitAxis = [-.2, -.45, .85]; }
  if (weapon.family === 'blunt') { coil = [.37, heavy ? 1.61 : 1.45, .08]; hitAxis = heavy ? [-.1, -.3, 1] : [-.8, .1, .6]; }
  if (weapon.family === 'flexible') { coil = [.39, 1.35, .10]; contact = [.14, 1.35, .48]; hitAxis = [Math.sin(clock.strike * 1.7) * .5, -.45, .8]; }
  if (weapon.family === 'shield') { idle = [.04, 1.37, .34]; coil = [.16, 1.35, .23]; contact = [.03, 1.40, .56]; idleAxis = coilAxis = hitAxis = [0, 1, .08]; pose.left = [-.22, 1.45, .25]; }
  if (weapon.family === 'spray') { idle = [.20, 1.19, .34]; coil = [.28, 1.25, .24]; contact = [.20, heavy ? 1.30 : 1.17, .52]; idleAxis = coilAxis = hitAxis = [0, 1, .12]; }
  if (weapon.family === 'fragile') { idle = [.26, 1.29, .26]; coil = [.36, 1.46, .14]; contact = [.08, 1.40, .52]; hitAxis = [-.5, -.2, .8]; }
  if (weapon.family === 'distraction' || weapon.family === 'ground') { idle = [.23, 1.20, .30]; coil = [.28, 1.10, .12]; contact = [.10, weapon.family === 'ground' ? .95 : 1.35, .52]; idleAxis = coilAxis = [0, 1, 0]; hitAxis = [0, .2, 1]; }
  if (clock.strike % 2 === 1) { contact[0] += .10; contact[1] -= .06; hitAxis[0] *= -1; }
  if (move?.pose === 'retreat-jab' || move?.pose === 'reelback-armor' || move?.pose === 'back-hop') { pose.pitch -= .13 * load; pose.hip[2] -= .06 * load; }
  if (move?.pose === 'liver-punch' || move?.pose === 'body-blows') { contact[1] -= .16; pose.hip[1] -= .05 * hit; }
  if (move?.pose === 'uppercut' || move?.pose === 'gazelle') { coil[1] -= .16; contact[1] += .15; hitAxis[1] += .4; pose.hip[1] -= .06 * load; }
  const commit = move ? commitment(clock.frame, Math.max(1, clock.startup)) : 0;
  const loaded = mix(idle, coil, move ? smooth(clock.frame / Math.max(1, clock.startup * .55)) : 0);
  pose.right = mix(arc(loaded, [coil[0], (coil[1] + contact[1]) / 2 + (heavy ? .12 : 0), contact[2]], contact, commit), idle, p.recover);
  const axis = mix(mix(idleAxis, coilAxis, clamp(load)), hitAxis, hit);
  weaponGrip(pose, weapon, axis);
  if (weapon.family === 'flexible') {
    const delayed = move ? phases(clock.frame - 2, clock.startup, clock.active, clock.recovery).strike : 0;
    pose.weapon!.follow = normalize(mix([.12, -.97, .1], hitAxis, delayed * .9));
  }
  return pose;
}
