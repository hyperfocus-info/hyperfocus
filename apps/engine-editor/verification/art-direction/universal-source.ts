import { createHash } from 'node:crypto';
import { parseGltfContainer } from '@hyperfocus/engine/assets/gltf-static';
import { createGltfPoseOutput, evaluateGltfAnimationPose, inspectGltfRigRestPose, resolveAndCookGltfSkinAnimations } from '@hyperfocus/engine/assets/gltf-skin-animation';
import type { UniversalLocomotionBank, UniversalPose, Point, UniversalStudyClip } from '@hyperfocus/touch-of-death/presentation/art-direction/universal-locomotion';

export const universalSourcePath = 'packages/engine/examples/three-arena/assets/usable/animations/universal/UAL1_Standard.glb';
const bones = ['pelvis', 'Head', 'neck_01', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'] as const;

/** Sample the existing licensed source through the engine's actual animation evaluator. */
export async function readUniversalLocomotion() {
  const bytes = new Uint8Array(await Bun.file(universalSourcePath).arrayBuffer());
  const container = parseGltfContainer(bytes);
  const result = await resolveAndCookGltfSkinAnimations(container.document, { embeddedBuffers: container.embeddedBuffers });
  if (!result.ok || !result.rig) throw new Error(JSON.stringify(result.diagnostics));
  const rig = result.rig, pose = createGltfPoseOutput(rig), rest = inspectGltfRigRestPose(rig);
  const index = (name: string) => { const i = rig.nodeIds.indexOf(name); if (i < 0) throw new Error(`Missing source bone ${name}`); return i; };
  const point = (name: string): Point => { const i = index(name) * 16; return [pose.worldMatrices[i + 12]!, pose.worldMatrices[i + 13]!, pose.worldMatrices[i + 14]!]; };
  const restPoint = (name: string): Point => { const i = index(name) * 3; return [rest.positions[i]!, rest.positions[i + 1]!, rest.positions[i + 2]!]; };
  const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const legScale = .96 / (distance(restPoint('thigh_l'), restPoint('calf_l')) + distance(restPoint('calf_l'), restPoint('foot_l')));
  const foot = restPoint('foot_l'), ball = restPoint('ball_l');
  const footRestAngle = Math.atan2(ball[1] - foot[1], ball[2] - foot[2]);
  const palette = new Float32Array(rig.skeletons[0]!.jointNodes.length * 16);
  const clips = (['Walk_Loop', 'Jog_Fwd_Loop'] as const).map(name => {
    const clip = rig.clips.find(item => item.label === name);
    if (!clip) throw new Error(`Missing source clip ${name}`);
    const count = Math.round(clip.duration * 60), samples: UniversalPose[] = [];
    for (let frame = 0; frame < count; frame++) {
      evaluateGltfAnimationPose(rig, { skeleton: 0, clip: clip.animationIndex, timeSeconds: frame * clip.duration / count, loop: true }, pose, palette);
      const sample: UniversalPose = {};
      for (const bone of bones) sample[bone] = point(bone).map(n => Math.round(n * 1_000_000) / 1_000_000);
      samples.push(sample);
    }
    const speeds: number[] = [];
    for (const side of ['l', 'r']) {
      const low = Math.min(...samples.map(sample => sample[`ball_${side}`]![1]!));
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1]![`ball_${side}`]!, b = samples[i]![`ball_${side}`]!;
        const velocity = (a[2]! - b[2]!) * count / clip.duration;
        if (a[1]! < low + .025 && b[1]! < low + .025 && velocity > .2) speeds.push(velocity);
      }
    }
    speeds.sort((a, b) => a - b);
    if (!speeds.length) throw new Error(`No support interval measured for ${name}`);
    const sourceStride = speeds[Math.floor(speeds.length / 2)]! * clip.duration * legScale;
    // The stylized source jog travels much faster than this game's 3 m/s. Keep
    // its authored cadence and shorten reach instead of playing it in slow motion.
    const stride = Math.min(sourceStride, (name === 'Walk_Loop' ? 1.6 : 3) * clip.duration);
    return { name, duration: clip.duration, animation: clip.animationIndex, sourceStride, stride, samples };
  });
  const studies: UniversalStudyClip[] = [];
  for (const [kind, name] of [['idle', 'Idle_Loop'], ['light', 'Punch_Jab'], ['cross', 'Punch_Cross'], ['hit', 'Hit_Chest']] as const) {
    const clip = rig.clips.find(item => item.label === name);
    if (!clip) throw new Error(`Missing source clip ${name}`);
    const count = Math.round(clip.duration * 60), samples: UniversalPose[] = [];
    for (let frame = 0; frame <= count; frame++) {
      evaluateGltfAnimationPose(rig, { skeleton: 0, clip: clip.animationIndex, timeSeconds: frame * clip.duration / count, loop: false }, pose, palette);
      samples.push(Object.fromEntries(bones.map(bone => [bone, point(bone).map(n => Math.round(n * 1_000_000) / 1_000_000)])));
    }
    const hand = kind === 'cross' ? 'hand_r' : 'hand_l';
    const peak = samples.reduce((best, sample, i) => sample[hand]![2]! > samples[best]![hand]![2]! ? i : best, 0);
    studies.push({ kind, name, duration: clip.duration, animation: clip.animationIndex, contact: peak / count, samples });
  }
  const bank: UniversalLocomotionBank = { source: universalSourcePath, sha256: createHash('sha256').update(bytes).digest('hex'), license: 'CC0-1.0 / Quaternius', legScale, footRestAngle, clips, studies };
  return { bytes, rig, bank };
}
