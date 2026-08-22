import type { CompiledPoseMask } from "./masks.ts";
import { poseMaskHasJoint } from "./masks.ts";
import { copyPoseBuffer, type PoseBuffer } from "./pose-buffer.ts";

const LN2 = Math.log(2);
const EPSILON = 1e-8;

export type PoseInertializer = {
  readonly initialized: boolean;
  readonly halfLifeSeconds: number;
  reset(pose?: PoseBuffer): void;
  update(target: PoseBuffer, deltaSeconds: number, output: PoseBuffer, transition?: boolean): PoseBuffer;
};

function normalizeQuaternion(values: Float32Array, offset: number) {
  const length = Math.hypot(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  if (!Number.isFinite(length) || length <= EPSILON) {
    values[offset] = 0;
    values[offset + 1] = 0;
    values[offset + 2] = 0;
    values[offset + 3] = 1;
    return;
  }
  const inverse = 1 / length;
  values[offset] *= inverse;
  values[offset + 1] *= inverse;
  values[offset + 2] *= inverse;
  values[offset + 3] *= inverse;
}

function setRelativeQuaternion(
  from: Float32Array,
  fromOffset: number,
  target: Float32Array,
  targetOffset: number,
  output: Float32Array,
  outputOffset: number,
) {
  const ax = from[fromOffset];
  const ay = from[fromOffset + 1];
  const az = from[fromOffset + 2];
  const aw = from[fromOffset + 3];
  const bx = -target[targetOffset];
  const by = -target[targetOffset + 1];
  const bz = -target[targetOffset + 2];
  const bw = target[targetOffset + 3];
  output[outputOffset] = aw * bx + ax * bw + ay * bz - az * by;
  output[outputOffset + 1] = aw * by - ax * bz + ay * bw + az * bx;
  output[outputOffset + 2] = aw * bz + ax * by - ay * bx + az * bw;
  output[outputOffset + 3] = aw * bw - ax * bx - ay * by - az * bz;
  normalizeQuaternion(output, outputOffset);
  if (output[outputOffset + 3] < 0) {
    output[outputOffset] *= -1;
    output[outputOffset + 1] *= -1;
    output[outputOffset + 2] *= -1;
    output[outputOffset + 3] *= -1;
  }
}

function decayQuaternionTowardIdentity(values: Float32Array, offset: number, decay: number) {
  let x = values[offset];
  let y = values[offset + 1];
  let z = values[offset + 2];
  let w = values[offset + 3];
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  if (w > 0.9995) {
    values[offset] = x * decay;
    values[offset + 1] = y * decay;
    values[offset + 2] = z * decay;
    values[offset + 3] = 1 + (w - 1) * decay;
    normalizeQuaternion(values, offset);
    return;
  }
  const angle = Math.acos(Math.max(-1, Math.min(1, w)));
  const sinAngle = Math.sin(angle);
  const ratio = sinAngle <= EPSILON ? decay : Math.sin(angle * decay) / sinAngle;
  values[offset] = x * ratio;
  values[offset + 1] = y * ratio;
  values[offset + 2] = z * ratio;
  values[offset + 3] = Math.cos(angle * decay);
  normalizeQuaternion(values, offset);
}

function multiplyQuaternionInto(
  a: Float32Array,
  aOffset: number,
  b: Float32Array,
  bOffset: number,
  output: Float32Array,
  outputOffset: number,
) {
  const ax = a[aOffset];
  const ay = a[aOffset + 1];
  const az = a[aOffset + 2];
  const aw = a[aOffset + 3];
  const bx = b[bOffset];
  const by = b[bOffset + 1];
  const bz = b[bOffset + 2];
  const bw = b[bOffset + 3];
  output[outputOffset] = aw * bx + ax * bw + ay * bz - az * by;
  output[outputOffset + 1] = aw * by - ax * bz + ay * bw + az * bx;
  output[outputOffset + 2] = aw * bz + ax * by - ay * bx + az * bw;
  output[outputOffset + 3] = aw * bw - ax * bx - ay * by - az * bz;
  normalizeQuaternion(output, outputOffset);
}

export function createPoseInertializer(template: PoseBuffer, mask: CompiledPoseMask, halfLifeSeconds = 0.08): PoseInertializer {
  if (!Number.isFinite(halfLifeSeconds) || halfLifeSeconds <= 0) throw new RangeError("inertial half-life must be positive");
  if (template.totalCount !== mask.jointCount) throw new RangeError("inertial mask must match the pose joint count");
  const previousOutputRotations = new Float32Array(template.rotations.length);
  const previousOutputTranslations = new Float32Array(template.translations.length);
  const previousTargetTranslations = new Float32Array(template.translations.length);
  const rotationOffsets = new Float32Array(template.rotations.length);
  const translationOffsets = new Float32Array(template.translations.length);
  const translationVelocities = new Float32Array(template.translations.length);
  let initialized = false;
  let previousDeltaSeconds = 1 / 60;

  function snapshot(output: PoseBuffer, target: PoseBuffer, deltaSeconds: number) {
    previousOutputRotations.set(output.rotations);
    previousOutputTranslations.set(output.translations);
    previousTargetTranslations.set(target.translations);
    previousDeltaSeconds = deltaSeconds > EPSILON ? deltaSeconds : previousDeltaSeconds;
  }

  const inertializer: PoseInertializer = {
    get initialized() {
      return initialized;
    },
    halfLifeSeconds,
    reset(pose) {
      initialized = false;
      rotationOffsets.fill(0);
      for (let jointIndex = 0; jointIndex < template.totalCount; jointIndex += 1) rotationOffsets[jointIndex * 4 + 3] = 1;
      translationOffsets.fill(0);
      translationVelocities.fill(0);
      if (pose) {
        previousOutputRotations.set(pose.rotations);
        previousOutputTranslations.set(pose.translations);
        previousTargetTranslations.set(pose.translations);
        initialized = true;
      }
    },
    update(target, deltaSeconds, output, transition = false) {
      if (target.totalCount !== template.totalCount || output.totalCount !== template.totalCount) {
        throw new RangeError("inertial poses must match the template joint count");
      }
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      if (!initialized) {
        copyPoseBuffer(target, output);
        rotationOffsets.fill(0);
        for (let jointIndex = 0; jointIndex < template.totalCount; jointIndex += 1) rotationOffsets[jointIndex * 4 + 3] = 1;
        snapshot(output, target, dt);
        initialized = true;
        return output;
      }

      if (transition) {
        const inversePreviousDt = 1 / Math.max(EPSILON, previousDeltaSeconds);
        for (let jointIndex = 0; jointIndex < template.totalCount; jointIndex += 1) {
          const rotationOffset = jointIndex * 4;
          if (poseMaskHasJoint(mask, "rotation", jointIndex)) {
            setRelativeQuaternion(previousOutputRotations, rotationOffset, target.rotations, rotationOffset, rotationOffsets, rotationOffset);
          }
          const translationOffset = jointIndex * 3;
          if (poseMaskHasJoint(mask, "translation", jointIndex)) {
            for (let axis = 0; axis < 3; axis += 1) {
              const index = translationOffset + axis;
              translationOffsets[index] = previousOutputTranslations[index] - target.translations[index];
              const oldVelocity = (previousOutputTranslations[index] - output.translations[index]) * inversePreviousDt;
              const targetVelocity = (target.translations[index] - previousTargetTranslations[index]) * inversePreviousDt;
              translationVelocities[index] = oldVelocity - targetVelocity;
            }
          }
        }
      }

      copyPoseBuffer(target, output);
      const omega = LN2 / halfLifeSeconds;
      const exponential = Math.exp(-omega * dt);
      for (let jointIndex = 0; jointIndex < template.totalCount; jointIndex += 1) {
        const rotationOffset = jointIndex * 4;
        if (poseMaskHasJoint(mask, "rotation", jointIndex)) {
          decayQuaternionTowardIdentity(rotationOffsets, rotationOffset, exponential);
          multiplyQuaternionInto(rotationOffsets, rotationOffset, target.rotations, rotationOffset, output.rotations, rotationOffset);
        }
        const translationOffset = jointIndex * 3;
        if (poseMaskHasJoint(mask, "translation", jointIndex)) {
          for (let axis = 0; axis < 3; axis += 1) {
            const index = translationOffset + axis;
            const offset = translationOffsets[index];
            const velocity = translationVelocities[index];
            const critical = velocity + omega * offset;
            const nextOffset = (offset + critical * dt) * exponential;
            const nextVelocity = (velocity - omega * critical * dt) * exponential;
            translationOffsets[index] = nextOffset;
            translationVelocities[index] = nextVelocity;
            output.translations[index] = target.translations[index] + nextOffset;
          }
        }
      }
      snapshot(output, target, Math.max(dt, EPSILON));
      return output;
    },
  };
  inertializer.reset();
  return inertializer;
}
