import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
import { clamp01 as clamp } from "@hyperfocus/utilities/math";
import { artTorsoPoint, sampleArtMotion, type ArtMotion } from './motion.ts';
import type { Point, UniversalLocomotionBank, UniversalPose, UniversalStudyClip } from './universal-locomotion.ts';



const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vector = (p: number[]): Point => [p[0]!, p[1]!, p[2]!];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const direction = (a: number[], b: number[], length: number): Point => {
  const distance = Math.max(.00001, Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!));
  return [(b[0]! - a[0]!) * length / distance, (b[1]! - a[1]!) * length / distance, (b[2]! - a[2]!) * length / distance];
};

/** Warp the source contact to the simulation's startup boundary; never change combat timing. */
export function universalStudyTime(options: { clip: UniversalStudyClip; frame: number; startup?: number; active?: number; recovery?: number }) {
  const { clip, frame } = options;
  if (clip.kind === 'idle') return ((frame / 60) % clip.duration + clip.duration) % clip.duration;
  if (clip.kind === 'hit') return Math.min(clip.duration, Math.max(0, frame / 60));
  const startup = options.startup ?? (clip.kind === 'cross' ? 28 : 14), active = options.active ?? 3, recovery = options.recovery ?? (clip.kind === 'cross' ? 47 : 16);
  const contact = clip.contact * clip.duration;
  if (frame <= startup) return contact * clamp(frame / startup);
  return contact + (clip.duration - contact) * clamp((frame - startup) / (active + recovery));
}
function sample(clip: UniversalStudyClip, time: number): UniversalPose {
  const cursor = clamp(time / clip.duration) * (clip.samples.length - 1), i = Math.floor(cursor), t = cursor - i;
  const a = clip.samples[i]!, b = clip.samples[Math.min(i + 1, clip.samples.length - 1)]!;
  return Object.fromEntries(Object.keys(a).map(name => [name, mix(vector(a[name]!), vector(b[name]!), t)]));
}

/** Transfer useful source motion into the approved fighter; retain combat stance and guard. */
export function sampleUniversalCombat(bank: UniversalLocomotionBank, options: Parameters<typeof sampleArtMotion>[0]): ArtMotion {
  const pose = sampleArtMotion(options), clip = bank.studies?.find(clip => clip.kind === options.kind);
  if (!clip || options.kind !== 'idle' && options.kind !== 'light') return pose;
  const source = sample(clip, universalStudyTime({ clip, ...options })), rest = clip.samples[0]!;
  const pelvis = source.pelvis!, origin = rest.pelvis!;
  if (options.kind === 'idle') {
    const neutral = sampleArtMotion({ kind: 'idle', frame: 0 });
    pose.hip = [neutral.hip[0] + (pelvis[0]! - origin[0]!) * bank.legScale, neutral.hip[1] + (pelvis[1]! - origin[1]!) * bank.legScale, neutral.hip[2]];
    // Keep the fighter's guard: only import small breathing/weight-transfer deltas.
    for (const [hand, bone] of [['left', 'hand_r'], ['right', 'hand_l']] as const) {
      pose[hand] = add(neutral[hand], vector(source[bone]!.map((n, axis) => (n - rest[bone]![axis]!) * .25)));
    }
    return pose;
  }
  const total = (options.startup ?? 14) + (options.active ?? 3) + (options.recovery ?? 16);
  const weight = smooth(options.frame / 5) * (1 - smooth((options.frame - total + 5) / 5));
  const twist = (p: UniversalPose) => -Math.atan2(p.upperarm_l![2]! - p.upperarm_r![2]!, p.upperarm_l![0]! - p.upperarm_r![0]!);
  pose.twist = -.15 + Math.max(-.48, Math.min(.25, twist(source) - twist(rest))) * weight;
  pose.hip[0] = (pelvis[0]! - origin[0]!) * bank.legScale * .6 * weight;
  pose.hip[1] = .97 + (pelvis[1]! - origin[1]!) * bank.legScale * weight;
  const shoulder = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [.285, .55, 0]);
  const elbow = add(shoulder, direction(source.upperarm_l!, source.lowerarm_l!, .31));
  const wrist = add(elbow, direction(source.lowerarm_l!, source.hand_l!, .29));
  const neutral = sampleArtMotion({ kind: 'idle', frame: 0 });
  pose.right = mix(neutral.right, wrist, weight);
  pose.left = mix(neutral.left, artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.13, .49, .32]), weight);
  const leftShoulder = artTorsoPoint(pose.hip, pose.pitch, pose.twist, [-.285, .55, 0]);
  pose.elbows = { left: add(leftShoulder, [-.06, -.26, .035]), right: mix(add(shoulder, [.10, -.25, -.04]), elbow, weight) };
  pose.head = { pitch: .025, twist: pose.twist * .12, roll: 0 };
  return pose;
}
