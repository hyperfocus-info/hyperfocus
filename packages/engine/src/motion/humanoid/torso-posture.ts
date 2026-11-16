import { quaternionFromAxisAngle } from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";
import {
  applyWorldRotationDelta,
  applyWorldTranslationDelta,
  type WorldPose,
} from "../solvers/world-pose.ts";
import type { ProceduralLocomotionFrame } from "./locomotion.ts";

const BASE_HIPS_PITCH_SHARE = .36;
const SPRINT_HIPS_PITCH_SHARE = .58;
const SPRINT_START_INTENSITY = .74;
const UP = new Float32Array([0, 1, 0]);

export function createHumanoidTorsoPosture(options: {
  rig: CompiledSemanticRig;
  legLength: number;
  hipsIndex: number;
  jointIndices: readonly number[];
}) {
  const shares = new Float32Array(options.jointIndices.length);
  return {
    apply(
      pose: PoseBuffer,
      world: WorldPose,
      frame: ProceduralLocomotionFrame,
      facing: { x: number; y: number; z: number },
      scratch: Float32Array,
    ) {
      const weight = frame.locomotionWeight;
      if (weight <= 1e-6) return;
      const right = [facing.z, 0, -facing.x] as const;
      const forward = [facing.x, 0, facing.z] as const;
      const hipsPitchShare = writeHumanoidTorsoPitchShares(frame.paceIntensity, shares);
      if (options.hipsIndex >= 0) {
        const lateral = frame.pelvisOffset[0] * weight;
        const vertical = (frame.pelvisOffset[1] - options.legLength * .03) * weight
          + frame.breath * .006 * (1 - weight);
        scratch[0] = right[0] * lateral;
        scratch[1] = vertical;
        scratch[2] = right[2] * lateral;
        applyWorldTranslationDelta(options.rig, pose, world, options.hipsIndex, scratch);
      }
      for (let index = options.jointIndices.length - 1; index >= 0; index -= 1) {
        const joint = options.jointIndices[index]!, distribution = shares[index]!;
        applyModelAxisRotation(options.rig, pose, world, joint, right, frame.left.torsoPitch * weight * distribution, scratch);
        applyModelAxisRotation(options.rig, pose, world, joint, UP, frame.torsoYaw * distribution, scratch);
        applyModelAxisRotation(options.rig, pose, world, joint, forward, -frame.torsoRoll * distribution, scratch);
      }
      if (options.hipsIndex < 0) return;
      applyModelAxisRotation(options.rig, pose, world, options.hipsIndex, UP, frame.pelvisYaw, scratch);
      applyModelAxisRotation(options.rig, pose, world, options.hipsIndex, right, (frame.left.torsoPitch * weight * hipsPitchShare) + frame.slope[0] * .18, scratch);
      applyModelAxisRotation(options.rig, pose, world, options.hipsIndex, forward, frame.slope[1] * .18 + frame.turnLean + frame.torsoRoll * .35, scratch);
    },
  };
}

/**
 * Writes cumulative gait-pitch shares from the lower to upper torso.
 * Full sprints move pitch into the pelvis and ribcage instead of curling the
 * upper spine to manufacture the same head-to-hip angle. Lower paces retain
 * the established triangular distribution exactly.
 */
export function writeHumanoidTorsoPitchShares(
  paceIntensity: number,
  out: Float32Array,
) {
  const count = out.length;
  const denominator = Math.max(1, count * (count + 1) * .5);
  for (let index = 0; index < count; index += 1) {
    out[index] = (index + 1) / denominator;
  }
  if (count < 3) return BASE_HIPS_PITCH_SHARE;

  const sprintWeight = smoothstep(SPRINT_START_INTENSITY, 1, paceIntensity);
  out[0] = lerp(out[0]!, 0, sprintWeight);
  out[1] = lerp(out[1]!, .38, sprintWeight);
  out[2] = lerp(out[2]!, .32, sprintWeight);
  return lerp(BASE_HIPS_PITCH_SHARE, SPRINT_HIPS_PITCH_SHARE, sprintWeight);
}

function applyModelAxisRotation(
  rig: CompiledSemanticRig,
  pose: PoseBuffer,
  world: WorldPose,
  joint: number,
  axis: ArrayLike<number>,
  angle: number,
  scratch: Float32Array,
) {
  if (Math.abs(angle) <= 1e-8) return;
  quaternionFromAxisAngle(axis, angle, scratch);
  applyWorldRotationDelta(rig, pose, world, joint, scratch);
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const amount = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return amount * amount * (3 - 2 * amount);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}
