import { sampleArtMotion, type ArtMotion } from './motion.ts';
import { blendArtMotion } from './transition.ts';
export type Point = [number, number, number];
export type UniversalPose = Record<string, number[]>;
export type UniversalStudyClip = { kind: 'idle' | 'light' | 'cross' | 'hit'; name: string; duration: number; animation: number; contact: number; samples: UniversalPose[] };
export type UniversalLocomotionBank = {
  source: string; sha256: string; license: string; legScale: number; footRestAngle: number;
  clips: Array<{ name: string; duration: number; animation: number; sourceStride: number; stride: number; samples: UniversalPose[] }>;
  studies?: UniversalStudyClip[];
};
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const direction = (a: Point, b: Point, length: number): Point => { const n = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return [(b[0] - a[0]) * length / n, (b[1] - a[1]) * length / n, (b[2] - a[2]) * length / n]; };

export function universalLocomotionProfile(bank: UniversalLocomotionBank, speed: number) {
  const t = Math.max(0, Math.min(1, (speed - 1.7) / 1.3)), run = t * t * (3 - 2 * t);
  return { run, stride: bank.clips[0]!.stride * (1 - run) + bank.clips[1]!.stride * run };
}

/** Transfer authored joint arcs, not new sine-wave targets. C's segment lengths stay fixed. */
export function sampleUniversalLocomotion(bank: UniversalLocomotionBank, options: { cycle: number; speed: number; weight: number }): ArtMotion {
  const { run } = universalLocomotionProfile(bank, options.speed), weight = Math.max(0, Math.min(1, options.weight));
  const reach = (1 - run) * bank.clips[0]!.stride / bank.clips[0]!.sourceStride + run * bank.clips[1]!.stride / bank.clips[1]!.sourceStride;
  const phase = ((options.cycle % 1) + 1) % 1;
  const point = (name: string): Point => {
    const samples = bank.clips.map(clip => {
      const time = phase * clip.samples.length, i = Math.floor(time), a = clip.samples[i]![name]!, b = clip.samples[(i + 1) % clip.samples.length]![name]!;
      return mix([a[0]!, a[1]!, a[2]!], [b[0]!, b[1]!, b[2]!], time - i);
    });
    return mix(samples[0]!, samples[1]!, run);
  };
  const pelvis = mix(point('thigh_l'), point('thigh_r'), .5), shoulders = mix(point('upperarm_l'), point('upperarm_r'), .5);
  // Shortening only forward reach kept the fast source's high knees, deep
  // compression and torso sway at 3m/s. Adapt its effort along with its stride.
  const effort = reach, vertical = effort * (1 - run * .15);
  const pitch = .07 + (Math.atan2(shoulders[2] - pelvis[2], shoulders[1] - pelvis[1]) - .07) * effort;
  const l = point('upperarm_l'), r = point('upperarm_r');
  const twist = -Math.atan2(l[2] - r[2], l[0] - r[0]) * effort, roll = Math.atan2(l[1] - r[1], l[0] - r[0]) * effort * (1 - run * .35);
  const hip: Point = [pelvis[0] * bank.legScale * effort, pelvis[1] * bank.legScale - .025, pelvis[2] * bank.legScale];
  const transform = (x: number, y: number): Point => {
    const rx = x * Math.cos(roll) - y * Math.sin(roll), ry = x * Math.sin(roll) + y * Math.cos(roll);
    return add(hip, [rx * Math.cos(twist) + ry * Math.sin(pitch) * Math.sin(twist), ry * Math.cos(pitch), -rx * Math.sin(twist) + ry * Math.sin(pitch) * Math.cos(twist)]);
  };
  // This presenter calls screen-left "left"; source anatomy labels use the opposite X side.
  const limb = (side: 'l' | 'r', sign: number) => {
    const upper = mix([0, -.31, 0], direction(point(`upperarm_${side}`), point(`lowerarm_${side}`), .31), 1 - run * .3);
    const shoulder = transform(sign * .285, .55), elbow = add(shoulder, direction([0, 0, 0], upper, .31));
    const hand = add(elbow, direction(point(`lowerarm_${side}`), point(`hand_${side}`), .29));
    const foot = point(`foot_${side}`), ball = point(`ball_${side}`), knee = point(`calf_${side}`);
    const hipAnchor = add(hip, [sign * .125 * Math.cos(twist * .3), 0, -sign * .125 * Math.sin(twist * .3)]);
    const targetKnee = add(hipAnchor, direction(point(`thigh_${side}`), knee, .4799));
    const targetFoot = add(targetKnee, direction(knee, foot, .4799));
    targetFoot[2] = hipAnchor[2] + (targetFoot[2] - hipAnchor[2]) * reach;
    // Moving only the ankle invalidates a positional knee hint: its projection
    // can cross the new hip/ankle axis and reverse the knee. Preserve a forward
    // hinge plane instead. Near straight source poses use the sagittal plane.
    let normal = cross(direction(point(`thigh_${side}`), knee, 1), direction(knee, foot, 1));
    if (normal[0] < 0) normal = [-normal[0], -normal[1], -normal[2]];
    if (normal[0] < .05) normal = [1, 0, 0];
    const kneePole = cross(direction(hipAnchor, targetFoot, 1), normal);
    return { hand, elbow, shoulder, knee: targetKnee, kneePole, normal, sign, foot: targetFoot,
      footPitch: bank.footRestAngle - Math.atan2(ball[1] - foot[1], ball[2] - foot[2]) };
  };
  const left = limb('r', -1), right = limb('l', 1);
  // Rigid work boots cannot bend at the source toe joint. Raise the body only to
  // clear their measured sole corners; preserve positive flight clearance.
  const soleBottom = (leg: typeof left) => leg.foot[1] - .088 * Math.cos(leg.footPitch) - (leg.footPitch > 0 ? .188 : -.118) * Math.sin(leg.footPitch);
  const lift = Math.max(0, -Math.min(soleBottom(left), soleBottom(right)));
  const originalHeight = hip[1];
  hip[1] = .97 + (originalHeight + lift - .97) * vertical;
  for (const leg of [left, right]) {
    const clearance = Math.max(0, soleBottom(leg) + lift);
    leg.footPitch *= 1 - run * .5;
    const soleOffset = .088 * Math.cos(leg.footPitch) + (leg.footPitch > 0 ? .188 : -.118) * Math.sin(leg.footPitch);
    leg.foot[1] = soleOffset + clearance * vertical;
    for (const p of [leg.hand, leg.elbow, leg.shoulder, leg.knee]) p[1] += hip[1] - originalHeight;
    const anchor = add(hip, [leg.sign * .125 * Math.cos(twist * .3), 0, -leg.sign * .125 * Math.sin(twist * .3)]);
    leg.kneePole = cross(direction(anchor, leg.foot, 1), leg.normal);
  }
  const idle = sampleArtMotion({ kind: 'idle', frame: 0 });
  return blendArtMotion({ from: idle, weight, to: { hip, pitch, twist, roll,
    head: { pitch: .025 + pitch * .12, twist: twist * .12, roll: -roll * .2 }, left: left.hand, right: right.hand,
    leftFoot: left.foot, rightFoot: right.foot, phase: 'locomotion',
    authored: { leftElbow: left.elbow, rightElbow: right.elbow, leftKnee: left.knee, rightKnee: right.knee, leftKneePole: mix([0, 0, 1], left.kneePole, weight), rightKneePole: mix([0, 0, 1], right.kneePole, weight), leftFootPitch: left.footPitch, rightFootPitch: right.footPitch, weight } } });
}
