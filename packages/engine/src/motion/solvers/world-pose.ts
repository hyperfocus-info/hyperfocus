import {
  invertQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
} from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";

export type WorldPose = {
  readonly rotations: Float32Array;
  readonly translations: Float32Array;
  readonly scales: Float32Array;
  /** Reused implementation workspace; callers should treat these as borrowed. */
  readonly scratchQuaternion0: Float32Array;
  readonly scratchQuaternion1: Float32Array;
  readonly scratchQuaternion2: Float32Array;
};

export function createWorldPose(rig: Pick<CompiledSemanticRig, "totalCount">): WorldPose {
  return {
    rotations: new Float32Array(rig.totalCount * 4),
    translations: new Float32Array(rig.totalCount * 3),
    scales: new Float32Array(rig.totalCount * 3),
    scratchQuaternion0: new Float32Array(4),
    scratchQuaternion1: new Float32Array(4),
    scratchQuaternion2: new Float32Array(4),
  };
}

export function evaluateWorldPose(
  rig: Pick<CompiledSemanticRig, "totalCount" | "semanticParents" | "evaluationOrder">,
  pose: PoseBuffer,
  out: WorldPose,
): WorldPose {
  assertCompatible(rig, pose, out);
  for (const jointIndex of rig.evaluationOrder) {
    const parentIndex = rig.semanticParents[jointIndex];
    const rotationOffset = jointIndex * 4;
    const translationOffset = jointIndex * 3;
    const localScaleX = pose.scales?.[translationOffset] ?? 1;
    const localScaleY = pose.scales?.[translationOffset + 1] ?? 1;
    const localScaleZ = pose.scales?.[translationOffset + 2] ?? 1;
    if (parentIndex < 0) {
      out.rotations.set(pose.rotations.subarray(rotationOffset, rotationOffset + 4), rotationOffset);
      out.translations.set(pose.translations.subarray(translationOffset, translationOffset + 3), translationOffset);
      out.scales[translationOffset] = localScaleX;
      out.scales[translationOffset + 1] = localScaleY;
      out.scales[translationOffset + 2] = localScaleZ;
      continue;
    }

    const parentRotationOffset = parentIndex * 4;
    const parentTranslationOffset = parentIndex * 3;
    const localX = pose.translations[translationOffset] * out.scales[parentTranslationOffset];
    const localY = pose.translations[translationOffset + 1] * out.scales[parentTranslationOffset + 1];
    const localZ = pose.translations[translationOffset + 2] * out.scales[parentTranslationOffset + 2];
    const parentQx = out.rotations[parentRotationOffset];
    const parentQy = out.rotations[parentRotationOffset + 1];
    const parentQz = out.rotations[parentRotationOffset + 2];
    const parentQw = out.rotations[parentRotationOffset + 3];
    const ix = parentQw * localX + parentQy * localZ - parentQz * localY;
    const iy = parentQw * localY + parentQz * localX - parentQx * localZ;
    const iz = parentQw * localZ + parentQx * localY - parentQy * localX;
    const iw = -parentQx * localX - parentQy * localY - parentQz * localZ;
    out.translations[translationOffset] = out.translations[parentTranslationOffset]
      + ix * parentQw + iw * -parentQx + iy * -parentQz - iz * -parentQy;
    out.translations[translationOffset + 1] = out.translations[parentTranslationOffset + 1]
      + iy * parentQw + iw * -parentQy + iz * -parentQx - ix * -parentQz;
    out.translations[translationOffset + 2] = out.translations[parentTranslationOffset + 2]
      + iz * parentQw + iw * -parentQz + ix * -parentQy - iy * -parentQx;
    const localQx = pose.rotations[rotationOffset];
    const localQy = pose.rotations[rotationOffset + 1];
    const localQz = pose.rotations[rotationOffset + 2];
    const localQw = pose.rotations[rotationOffset + 3];
    const worldQx = parentQw * localQx + parentQx * localQw + parentQy * localQz - parentQz * localQy;
    const worldQy = parentQw * localQy - parentQx * localQz + parentQy * localQw + parentQz * localQx;
    const worldQz = parentQw * localQz + parentQx * localQy - parentQy * localQx + parentQz * localQw;
    const worldQw = parentQw * localQw - parentQx * localQx - parentQy * localQy - parentQz * localQz;
    const inverseLength = 1 / Math.max(1e-12, Math.hypot(worldQx, worldQy, worldQz, worldQw));
    out.rotations[rotationOffset] = worldQx * inverseLength;
    out.rotations[rotationOffset + 1] = worldQy * inverseLength;
    out.rotations[rotationOffset + 2] = worldQz * inverseLength;
    out.rotations[rotationOffset + 3] = worldQw * inverseLength;
    out.scales[translationOffset] = out.scales[parentTranslationOffset] * localScaleX;
    out.scales[translationOffset + 1] = out.scales[parentTranslationOffset + 1] * localScaleY;
    out.scales[translationOffset + 2] = out.scales[parentTranslationOffset + 2] * localScaleZ;
  }
  return out;
}

/** Applies a world-space delta while preserving the joint's local bind basis. */
export function applyWorldRotationDelta(
  rig: Pick<CompiledSemanticRig, "totalCount" | "semanticParents">,
  pose: PoseBuffer,
  world: WorldPose,
  jointIndex: number,
  deltaWorld: ArrayLike<number>,
): PoseBuffer {
  if (!Number.isSafeInteger(jointIndex) || jointIndex < 0 || jointIndex >= rig.totalCount) {
    throw new RangeError("world rotation joint index is outside the rig");
  }
  if (deltaWorld.length < 4) throw new RangeError("world rotation delta must contain four values");
  const parentIndex = rig.semanticParents[jointIndex];
  const localDelta = world.scratchQuaternion2;
  if (parentIndex < 0) {
    localDelta.set(deltaWorld);
  } else {
    const parentOffset = parentIndex * 4;
    const parent = world.scratchQuaternion0;
    const scratch = world.scratchQuaternion1;
    parent[0] = world.rotations[parentOffset];
    parent[1] = world.rotations[parentOffset + 1];
    parent[2] = world.rotations[parentOffset + 2];
    parent[3] = world.rotations[parentOffset + 3];
    invertQuaternion(parent, localDelta);
    multiplyQuaternions(localDelta, deltaWorld, scratch);
    multiplyQuaternions(scratch, parent, localDelta);
  }
  const offset = jointIndex * 4;
  const current = world.scratchQuaternion0;
  const target = world.scratchQuaternion1;
  current[0] = pose.rotations[offset];
  current[1] = pose.rotations[offset + 1];
  current[2] = pose.rotations[offset + 2];
  current[3] = pose.rotations[offset + 3];
  multiplyQuaternions(localDelta, current, target);
  normalizeQuaternion(target, target);
  pose.rotations.set(target, offset);
  return pose;
}

function assertCompatible(
  rig: Pick<CompiledSemanticRig, "totalCount" | "semanticParents" | "evaluationOrder">,
  pose: PoseBuffer,
  out: WorldPose,
) {
  if (pose.totalCount !== rig.totalCount) throw new RangeError("pose totalCount must match the semantic rig");
  if (rig.semanticParents.length !== rig.totalCount || rig.evaluationOrder.length !== rig.totalCount) {
    throw new RangeError("semantic rig hierarchy views do not match totalCount");
  }
  if (out.rotations.length !== rig.totalCount * 4
    || out.translations.length !== rig.totalCount * 3
    || out.scales.length !== rig.totalCount * 3) {
    throw new RangeError("world pose views do not match semantic rig totalCount");
  }
}
