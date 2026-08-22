import {
  multiplyQuaternions,
  normalizeQuaternion,
  setQuaternion,
} from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";

export type DistributedAimSolverOptions = {
  jointIndices: ArrayLike<number>;
  weights?: ArrayLike<number>;
  maxYaw?: number;
  maxPitch?: number;
};

export type DistributedAimResult = {
  yaw: number;
  pitch: number;
  weight: number;
};

export type DistributedAimSolver = {
  readonly jointIndices: Uint32Array;
  readonly weights: Float32Array;
  apply(pose: PoseBuffer, yaw: number, pitch: number, weight?: number): DistributedAimResult;
};

export function createDistributedAimSolver(options: DistributedAimSolverOptions): DistributedAimSolver {
  if (!options.jointIndices.length) throw new Error("distributed aim requires at least one spine or head joint");
  const jointIndices = new Uint32Array(options.jointIndices.length);
  const weights = new Float32Array(options.jointIndices.length);
  let weightTotal = 0;
  for (let index = 0; index < jointIndices.length; index += 1) {
    const jointIndex = Number(options.jointIndices[index]);
    if (!Number.isSafeInteger(jointIndex) || jointIndex < 0) throw new RangeError(`aim joint ${index} must be a non-negative safe integer`);
    jointIndices[index] = jointIndex;
    const configuredWeight = options.weights?.[index] ?? index + 1;
    if (!Number.isFinite(configuredWeight) || configuredWeight < 0) throw new RangeError(`aim weight ${index} must be non-negative and finite`);
    weights[index] = configuredWeight;
    weightTotal += configuredWeight;
  }
  if (options.weights && options.weights.length !== jointIndices.length) throw new RangeError("aim weights must match jointIndices length");
  if (weightTotal <= 0) throw new RangeError("distributed aim weights must contain a positive value");
  for (let index = 0; index < weights.length; index += 1) weights[index] /= weightTotal;
  const maxYaw = positiveFinite(options.maxYaw ?? Math.PI * 0.55, "distributed aim maxYaw");
  const maxPitch = positiveFinite(options.maxPitch ?? Math.PI * 0.42, "distributed aim maxPitch");
  const base = new Float32Array(4);
  const yawDelta = new Float32Array(4);
  const pitchDelta = new Float32Array(4);
  const combinedDelta = new Float32Array(4);
  const target = new Float32Array(4);
  const result: DistributedAimResult = { yaw: 0, pitch: 0, weight: 0 };

  return {
    jointIndices,
    weights,
    apply(pose, requestedYaw, requestedPitch, requestedWeight = 1) {
      const yaw = clampFinite(requestedYaw, -maxYaw, maxYaw, "distributed aim yaw");
      const pitch = clampFinite(requestedPitch, -maxPitch, maxPitch, "distributed aim pitch");
      const layerWeight = clampFinite(requestedWeight, 0, 1, "distributed aim weight");
      for (let index = 0; index < jointIndices.length; index += 1) {
        const jointIndex = jointIndices[index];
        if (jointIndex >= pose.totalCount) throw new RangeError(`aim joint ${jointIndex} exceeds PoseBuffer totalCount`);
        const offset = jointIndex * 4;
        base[0] = pose.rotations[offset];
        base[1] = pose.rotations[offset + 1];
        base[2] = pose.rotations[offset + 2];
        base[3] = pose.rotations[offset + 3];
        const jointWeight = weights[index] * layerWeight;
        quaternionFromAxisAngle(0, 1, 0, yaw * jointWeight, yawDelta);
        quaternionFromAxisAngle(1, 0, 0, pitch * jointWeight, pitchDelta);
        multiplyQuaternions(yawDelta, pitchDelta, combinedDelta);
        multiplyQuaternions(base, combinedDelta, target);
        normalizeQuaternion(target, target);
        pose.rotations[offset] = target[0];
        pose.rotations[offset + 1] = target[1];
        pose.rotations[offset + 2] = target[2];
        pose.rotations[offset + 3] = target[3];
      }
      result.yaw = yaw;
      result.pitch = pitch;
      result.weight = layerWeight;
      return result;
    },
  };
}

function quaternionFromAxisAngle(x: number, y: number, z: number, angle: number, out: Float32Array) {
  const half = angle * 0.5;
  const sine = Math.sin(half);
  return setQuaternion(out, x * sine, y * sine, z * sine, Math.cos(half));
}

function positiveFinite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be greater than zero`);
  return number;
}

function clampFinite(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return Math.max(min, Math.min(max, number));
}
