import { smoothstep01 as ease } from "@hyperfocus/utilities/math";
import { clamp01 as clamp } from "@hyperfocus/utilities/math";
import { locomotionProfile, sampleLocomotion } from './locomotion.ts';
type Point = [number, number, number];
export type ArtMotion = {
  hip: Point; pitch: number; twist: number; roll?: number; left: Point; right: Point; leftFoot: Point; rightFoot: Point; phase: string;
  head?: { pitch: number; twist: number; roll: number };
  feet?: { leftPitch: number; rightPitch: number };
  elbows?: { left: Point; right: Point };
  weapon?: { axis: Point; grip: number; hand?: 'left' | 'right'; twoHanded?: boolean; chain?: Point; follow?: Point; releasedPosition?: Point };
  authored?: { leftElbow: Point; rightElbow: Point; leftKnee: Point; rightKnee: Point; leftKneePole?: Point; rightKneePole?: Point; leftFootPitch: number; rightFootPitch: number; weight: number };
};
export const heavyCandidates = [
  { id: 'a', name: 'Rising cross', load: .50, release: .74, twist: .62, crouch: .13, follow: .26 },
  { id: 'b', name: 'Deep rising strike', load: .40, release: .80, twist: .82, crouch: .22, follow: .38 },
  { id: 'c', name: 'Compact counter lift', load: .60, release: .73, twist: .46, crouch: .09, follow: .19 },
] as const;
export type HeavyCandidate = typeof heavyCandidates[number];


const blend = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const arc = (a: Point, control: Point, b: Point, t: number): Point => blend(blend(a, control, t), blend(control, b, t), t);
export function artTorsoPoint(hip: Point, pitch: number, twist: number, offset: Point): Point {
  const y = offset[1] * Math.cos(pitch) - offset[2] * Math.sin(pitch), z = offset[1] * Math.sin(pitch) + offset[2] * Math.cos(pitch);
  return [hip[0] + offset[0] * Math.cos(twist) + z * Math.sin(twist), hip[1] + y, hip[2] - offset[0] * Math.sin(twist) + z * Math.cos(twist)];
}

/** Resolve the elbow in the same torso frame used by rendering and pose blending. */
export function solveArtArm(options: { pose: ArtMotion; side: 'left' | 'right' }) {
  const { pose, side } = options, sign = side === 'left' ? -1 : 1, roll = pose.roll ?? 0;
  const shoulder = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [sign * .285 * Math.cos(roll) - .55 * Math.sin(roll), sign * .285 * Math.sin(roll) + .55 * Math.cos(roll), 0]);
  const elbow = pose.elbows?.[side] ?? (side === 'left' ? pose.authored?.leftElbow : pose.authored?.rightElbow);
  const pole: Point = elbow ? [elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]] : pose.phase === 'locomotion' ? [sign * .3, -.4, -1] : [sign * .5, -.8, -.2];
  return { shoulder, ...solveArtLimb({ start: shoulder, target: pose[side], pole, upper: .31, lower: .29 }) };
}

/** Explicit authored phases. Frame counts come from the real move, not wall time. */
export function sampleArtMotion(options: { kind: 'idle' | 'walk' | 'light' | 'heavy' | 'hit'; frame: number; startup?: number; active?: number; recovery?: number; heavy?: HeavyCandidate; travel?: number; elevation?: number; cycle?: number; speed?: number; locomotionWeight?: number; strength?: number; reactionFrames?: number }): ArtMotion {
  const { kind, frame, heavy = heavyCandidates[1] } = options;
  const startup = options.startup ?? (kind === 'heavy' ? 28 : 14), active = options.active ?? 3, recovery = options.recovery ?? (kind === 'heavy' ? 47 : 16);
  let hip: Point = [0, .97, 0], pitch = .07, twist = -.15;
  let left: Point = [-.26, 1.49, .34], right: Point = [.27, 1.40, .28];
  let leftFoot: Point = [-.205, .10, .21], rightFoot: Point = [.205, .10, -.25];
  let phase = 'read', roll = 0;
  let head = { pitch: .025, twist: 0, roll: 0 };
  const feet = { leftPitch: 0, rightPitch: 0 };
  if (kind === 'idle') {
    const breath = Math.sin(frame / 60 * 2.2);
    hip[1] += breath * .004; hip[0] += Math.sin(frame / 60 * 1.1) * .008;
    left[1] += breath * .005; right[1] += Math.sin(frame / 60 * 2.2 - .35) * .004;
    roll = -.008 * Math.sin(frame / 60 * 1.1); head.roll = -roll * .5;
  } else if (kind === 'walk') {
    const speed = options.speed ?? 3, cycle = options.cycle ?? (options.travel ?? frame / 60 * speed) / locomotionProfile(speed).stride;
    const motion = sampleLocomotion({ cycle, speed }), weight = options.locomotionWeight ?? 1;
    hip = blend(hip, motion.hip, weight); left = blend(left, motion.left, weight); right = blend(right, motion.right, weight);
    leftFoot = blend(leftFoot, motion.leftFoot, weight); rightFoot = blend(rightFoot, motion.rightFoot, weight);
    pitch += (motion.pitch - pitch) * weight; twist += (motion.twist - twist) * weight;
    phase = 'locomotion';
  } else if (kind === 'hit') {
    const strength = options.strength ?? 1, duration = options.reactionFrames ?? 36;
    const air = ease(((options.elevation ?? 0) - .02) / .35);
    const t = clamp(frame / duration), recoil = Math.max(air * .7, (.65 + .35 * ease(frame / 3)) * (1 - ease((t - .16) / .84))) * strength;
    const settle = Math.sin(clamp((t - .45) / .55) * Math.PI) * .04 * strength;
    hip[2] -= recoil * .11; hip[1] -= recoil * .06; pitch = .07 - .37 * recoil + settle; twist += .18 * recoil; roll = -.035 * recoil;
    left = blend(left, [-.35, 1.39, .16], recoil); right = blend(right, [.43, 1.23, .08], recoil);
    // Head lags the chest impulse and reacquires the opponent before the guard settles.
    const headRecoil = ease(frame / 5) * (1 - ease((t - .14) / .65)) * strength;
    head = { pitch: .025 - .27 * headRecoil, twist: -.08 * headRecoil, roll: -.04 * headRecoil };
    // A launched body loses support: fold the legs and keep recoil through flight.
    // Height blends back into ground support, avoiding a binary landing pose snap.
    leftFoot = blend(leftFoot, [-.23, .31, .26], air); rightFoot = blend(rightFoot, [.24, .40, -.10], air);
    phase = t < .25 ? 'impact' : 'recovery';
  } else {
    const isHeavy = kind === 'heavy';
    const u = frame / startup, load = ease(u / (isHeavy ? heavy.load : .58));
    const releaseAt = isHeavy ? heavy.release : .67, release = ease((u - releaseAt) / (1 - releaseAt));
    const recovered = ease((frame - startup - active - (isHeavy ? 5 : 2)) / Math.max(1, recovery - (isHeavy ? 5 : 2)));
    const committed = frame >= startup ? 1 - recovered : release;
    const coil = frame < startup ? load * (1 - release) : 0;
    const follow = frame >= startup ? Math.sin(clamp((frame - startup) / (isHeavy ? 12 : 7)) * Math.PI) * (1 - recovered) : 0;
    phase = frame < startup * .15 ? 'read' : frame < startup * releaseAt ? 'anticipation' : frame < startup ? 'commitment' : frame < startup + active ? 'impact' : frame < startup + active + (isHeavy ? 7 : 3) ? 'follow-through' : 'recovery';
    hip = [0, .97 - coil * (isHeavy ? heavy.crouch : .035) - committed * (isHeavy ? .05 : 0), -.10 * coil + (isHeavy ? .23 : .14) * committed];
    pitch = .07 - coil * (isHeavy ? .18 : .07) + committed * (isHeavy ? .19 : .12);
    // A right-handed strike advances the right shoulder; loading turns it away.
    twist = -.15 + coil * (isHeavy ? heavy.twist : .22) - committed * (isHeavy ? .58 : .28);
    const loaded: Point = isHeavy ? [.32, 1.01, -.22] : [.31, 1.43, .08];
    const contact: Point = isHeavy ? [.06, 1.46, 1.02] : [.03, 1.43, .91];
    const guard = artTorsoPoint(hip, pitch, twist, [.27, .41, .26]);
    right = frame < startup ? arc(blend(right, loaded, load), isHeavy ? [.35, .91, .55] : [.29, 1.44, .53], contact, release)
      : arc(contact, isHeavy ? [.31, 1.28, .57] : [.28, 1.39, .46], guard, recovered);
    // Follow through with a bent elbow, then withdraw on a separate arc. The old
    // rising fist continued into a straight overhead salute after contact.
    right[1] += follow * (isHeavy ? heavy.follow * .4 : .035);
    right[2] -= follow * (isHeavy ? .12 : .015);
    left = blend(left, artTorsoPoint(hip, pitch, twist, [-.20, .46, .31]), Math.max(coil, committed));
    roll = (coil * .035 - committed * .025) * (isHeavy ? 1 : .4);
    head = { pitch: .025 + coil * .045, twist: twist * .15, roll: -roll * .4 };
    // Rotate about the planted rear toe, rather than translating a flat boot.
    feet.rightPitch = committed * (isHeavy ? .30 : .15);
    rightFoot = [.205, .012 + .088 * Math.cos(feet.rightPitch) + .188 * Math.sin(feet.rightPitch), -.062 + .088 * Math.sin(feet.rightPitch) - .188 * Math.cos(feet.rightPitch)];
  }
  return { hip, pitch, twist, roll, head, feet, left, right, leftFoot, rightFoot, phase };
}

/** Two fixed lengths and a pole direction; unreachable targets clamp, never stretch. */
export function solveArtLimb(options: { start: Point; target: Point; pole: Point; upper: number; lower: number }) {
  const { start, target, pole, upper, lower } = options;
  const delta = target.map((n, i) => n - start[i]!);
  const requested = Math.hypot(...delta), distance = Math.max(Math.abs(upper - lower) + .0001, Math.min(upper + lower - .0001, requested));
  const direction: Point = requested < .00001 ? [0, -1, 0] : [delta[0]! / requested, delta[1]! / requested, delta[2]! / requested];
  const dot = pole.reduce((sum, n, i) => sum + n * direction[i]!, 0);
  let perpendicular: Point = [pole[0] - direction[0] * dot, pole[1] - direction[1] * dot, pole[2] - direction[2] * dot];
  let norm = Math.hypot(...perpendicular);
  if (norm < .00001) { perpendicular = Math.abs(direction[0]) < .8 ? [0, direction[2], -direction[1]] : [-direction[2], 0, direction[0]]; norm = Math.hypot(...perpendicular); }
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance), height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const joint: Point = [0, 0, 0], end: Point = [0, 0, 0];
  for (let i = 0; i < 3; i++) { joint[i] = start[i]! + direction[i]! * along + perpendicular[i]! / norm * height; end[i] = start[i]! + direction[i]! * distance; }
  return { joint, end, clamped: Math.abs(requested - distance) > .002 };
}
