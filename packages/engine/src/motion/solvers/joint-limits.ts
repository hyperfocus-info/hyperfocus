import {
  invertQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  normalizeVector3,
  quaternionFromAxisAngle,
} from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import {
  getRigSemanticIndex,
  humanoidSemantics,
  type CompiledSemanticRig,
  type HumanoidSemantic,
  type T3RigJointLimitOverride,
} from "../rig.ts";

export type HumanoidJointLimit = Required<T3RigJointLimitOverride>;

export type JointLimitSolverOptions = {
  rig: CompiledSemanticRig;
  overrides?: Readonly<Record<string, T3RigJointLimitOverride>>;
};

export type JointLimitResult = {
  clampedJointCount: number;
};

export type JointLimitSolver = {
  readonly jointIndices: Uint32Array;
  readonly result: JointLimitResult;
  apply(pose: PoseBuffer): JointLimitResult;
};

export const humanoidJointLimitPresetV1: Readonly<Partial<Record<HumanoidSemantic, HumanoidJointLimit>>> = Object.freeze({
  hips: limit(0.42, -0.38, 0.38),
  spine: limit(0.38, -0.32, 0.32),
  chest: limit(0.48, -0.42, 0.42),
  upperChest: limit(0.52, -0.48, 0.48),
  neck: limit(0.62, -0.72, 0.72),
  head: limit(0.78, -0.95, 0.95),
  leftShoulder: limit(1.2, -0.8, 0.8),
  rightShoulder: limit(1.2, -0.8, 0.8),
  leftUpperArm: limit(2.45, -1.55, 1.55),
  rightUpperArm: limit(2.45, -1.55, 1.55),
  leftLowerArm: limit(2.5, -0.35, 0.35),
  rightLowerArm: limit(2.5, -0.35, 0.35),
  leftHand: limit(0.85, -0.75, 0.75),
  rightHand: limit(0.85, -0.75, 0.75),
  leftUpperLeg: limit(1.75, -0.65, 0.65),
  rightUpperLeg: limit(1.75, -0.65, 0.65),
  leftLowerLeg: limit(2.55, -0.28, 0.28),
  rightLowerLeg: limit(2.55, -0.28, 0.28),
  leftFoot: limit(0.9, -0.5, 0.5),
  rightFoot: limit(0.9, -0.5, 0.5),
});

type CompiledLimit = {
  jointIndex: number;
  semantic: HumanoidSemantic;
  axis: Float32Array;
  maxSwingRadians: number;
  minTwistRadians: number;
  maxTwistRadians: number;
};

const childSemantic: Readonly<Partial<Record<HumanoidSemantic, HumanoidSemantic>>> = {
  hips: "spine",
  spine: "chest",
  chest: "upperChest",
  upperChest: "neck",
  neck: "head",
  leftShoulder: "leftUpperArm",
  leftUpperArm: "leftLowerArm",
  leftLowerArm: "leftHand",
  rightShoulder: "rightUpperArm",
  rightUpperArm: "rightLowerArm",
  rightLowerArm: "rightHand",
  leftUpperLeg: "leftLowerLeg",
  leftLowerLeg: "leftFoot",
  rightUpperLeg: "rightLowerLeg",
  rightLowerLeg: "rightFoot",
};

export function createHumanoidJointLimitSolver(options: JointLimitSolverOptions): JointLimitSolver {
  const compiled: CompiledLimit[] = [];
  for (const semantic of humanoidSemantics) {
    const preset = humanoidJointLimitPresetV1[semantic];
    if (!preset) continue;
    const jointIndex = getRigSemanticIndex(options.rig, semantic);
    if (jointIndex < 0) continue;
    const override = options.overrides?.[semantic];
    const maxSwingRadians = nonNegative(override?.maxSwingRadians ?? preset.maxSwingRadians, `${semantic} maxSwingRadians`);
    const minTwistRadians = finite(override?.minTwistRadians ?? preset.minTwistRadians, `${semantic} minTwistRadians`);
    const maxTwistRadians = finite(override?.maxTwistRadians ?? preset.maxTwistRadians, `${semantic} maxTwistRadians`);
    if (minTwistRadians > maxTwistRadians) throw new RangeError(`${semantic} minimum twist cannot exceed maximum twist`);
    compiled.push({
      jointIndex,
      semantic,
      axis: resolveTwistAxis(options.rig, semantic),
      maxSwingRadians,
      minTwistRadians,
      maxTwistRadians,
    });
  }
  compiled.sort((a, b) => a.jointIndex - b.jointIndex || a.semantic.localeCompare(b.semantic));
  const jointIndices = Uint32Array.from(compiled, (entry) => entry.jointIndex);
  const result: JointLimitResult = { clampedJointCount: 0 };
  const inverseReference = new Float32Array(4);
  const reference = new Float32Array(4);
  const current = new Float32Array(4);
  const delta = new Float32Array(4);
  const twist = new Float32Array(4);
  const inverseTwist = new Float32Array(4);
  const swing = new Float32Array(4);
  const clampedTwist = new Float32Array(4);
  const clampedSwing = new Float32Array(4);
  const clampedDelta = new Float32Array(4);
  const target = new Float32Array(4);
  const swingAxis = new Float32Array(3);

  return {
    jointIndices,
    result,
    apply(pose) {
      result.clampedJointCount = 0;
      for (const entry of compiled) {
        if (entry.jointIndex >= pose.totalCount) throw new RangeError("joint limit index exceeds PoseBuffer totalCount");
        const rotationOffset = entry.jointIndex * 4;
        current[0] = pose.rotations[rotationOffset];
        current[1] = pose.rotations[rotationOffset + 1];
        current[2] = pose.rotations[rotationOffset + 2];
        current[3] = pose.rotations[rotationOffset + 3];
        reference[0] = options.rig.referenceRotations[rotationOffset];
        reference[1] = options.rig.referenceRotations[rotationOffset + 1];
        reference[2] = options.rig.referenceRotations[rotationOffset + 2];
        reference[3] = options.rig.referenceRotations[rotationOffset + 3];
        invertQuaternion(reference, inverseReference);
        multiplyQuaternions(current, inverseReference, delta);
        normalizeQuaternion(delta, delta);

        const projection = delta[0] * entry.axis[0] + delta[1] * entry.axis[1] + delta[2] * entry.axis[2];
        twist[0] = entry.axis[0] * projection;
        twist[1] = entry.axis[1] * projection;
        twist[2] = entry.axis[2] * projection;
        twist[3] = delta[3];
        if (Math.hypot(twist[0], twist[1], twist[2], twist[3]) <= 1e-8) {
          twist.set([0, 0, 0, 1]);
        } else {
          normalizeQuaternion(twist, twist);
        }
        invertQuaternion(twist, inverseTwist);
        multiplyQuaternions(delta, inverseTwist, swing);
        normalizeQuaternion(swing, swing);

        const twistAngle = wrapAngle(2 * Math.atan2(
          twist[0] * entry.axis[0] + twist[1] * entry.axis[1] + twist[2] * entry.axis[2],
          twist[3],
        ));
        const swingMagnitude = Math.hypot(swing[0], swing[1], swing[2]);
        const swingAngle = 2 * Math.atan2(swingMagnitude, Math.abs(swing[3]));
        const safeTwist = clamp(twistAngle, entry.minTwistRadians, entry.maxTwistRadians);
        const safeSwing = Math.min(swingAngle, entry.maxSwingRadians);
        if (Math.abs(safeTwist - twistAngle) <= 1e-6 && Math.abs(safeSwing - swingAngle) <= 1e-6) continue;

        quaternionFromAxisAngle(entry.axis, safeTwist, clampedTwist);
        if (swingMagnitude <= 1e-8 || safeSwing <= 1e-8) {
          clampedSwing.set([0, 0, 0, 1]);
        } else {
          swingAxis[0] = swing[0] / swingMagnitude;
          swingAxis[1] = swing[1] / swingMagnitude;
          swingAxis[2] = swing[2] / swingMagnitude;
          quaternionFromAxisAngle(swingAxis, safeSwing, clampedSwing);
        }
        multiplyQuaternions(clampedSwing, clampedTwist, clampedDelta);
        multiplyQuaternions(clampedDelta, reference, target);
        normalizeQuaternion(target, target);
        pose.rotations.set(target, rotationOffset);
        result.clampedJointCount += 1;
      }
      return result;
    },
  };
}

function resolveTwistAxis(rig: CompiledSemanticRig, semantic: HumanoidSemantic) {
  const child = childSemantic[semantic];
  const childIndex = child ? getRigSemanticIndex(rig, child) : -1;
  if (childIndex >= 0) {
    const offset = childIndex * 3;
    const axis = new Float32Array([
      rig.referenceTranslations[offset],
      rig.referenceTranslations[offset + 1],
      rig.referenceTranslations[offset + 2],
    ]);
    if (Math.hypot(axis[0], axis[1], axis[2]) > 1e-6) {
      normalizeVector3(axis, axis);
      return axis;
    }
  }
  if (semantic.startsWith("left") && (semantic.includes("Arm") || semantic === "leftHand")) return new Float32Array([-1, 0, 0]);
  if (semantic.startsWith("right") && (semantic.includes("Arm") || semantic === "rightHand")) return new Float32Array([1, 0, 0]);
  if (semantic.includes("Leg") || semantic.includes("Foot")) return new Float32Array([0, -1, 0]);
  return new Float32Array([0, 1, 0]);
}

function limit(maxSwingRadians: number, minTwistRadians: number, maxTwistRadians: number): HumanoidJointLimit {
  return Object.freeze({ maxSwingRadians, minTwistRadians, maxTwistRadians });
}

function finite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function nonNegative(value: unknown, label: string) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative`);
  return number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapAngle(value: number) {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
