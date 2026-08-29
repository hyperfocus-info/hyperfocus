import {
  normalizeVector3,
  quaternionFromUnitVectors,
  subtractVector3,
} from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";
import { createTwoBoneIKResult, solveTwoBoneIK, type TwoBoneIKResult } from "./two-bone-ik.ts";
import {
  applyWorldRotationDelta,
  createWorldPose,
  evaluateWorldPose,
  type WorldPose,
} from "./world-pose.ts";

export type PoseTwoBoneIKOptions = {
  rig: CompiledSemanticRig;
  rootIndex: number;
  middleIndex: number;
  endIndex: number;
  maxStretch?: number;
  /** Optional shared FK workspace for sequencing multiple independent limbs. */
  world?: WorldPose;
};

export type PoseTwoBoneIKApplyOptions = {
  /** Set only when `world` already describes the current pose. */
  worldIsCurrent?: boolean;
};

export type PoseTwoBoneIKResult = TwoBoneIKResult & {
  endError: number;
};

export type PoseTwoBoneIKSolver = {
  readonly world: WorldPose;
  readonly result: PoseTwoBoneIKResult;
  apply(
    pose: PoseBuffer,
    targetWorld: ArrayLike<number>,
    poleDirectionWorld: ArrayLike<number>,
    options?: PoseTwoBoneIKApplyOptions,
  ): PoseTwoBoneIKResult;
};

export function createPoseTwoBoneIKSolver(options: PoseTwoBoneIKOptions): PoseTwoBoneIKSolver {
  const { rig, rootIndex, middleIndex, endIndex } = options;
  validateChain(rig, rootIndex, middleIndex, endIndex);
  const maxStretch = finiteAtLeast(options.maxStretch ?? 1, 1, "pose IK maxStretch");
  const world = options.world ?? createWorldPose(rig);
  const rootSubtree = compileSubtree(rig, rootIndex);
  const middleSubtree = compileSubtree(rig, middleIndex);
  const rawResult = createTwoBoneIKResult();
  const result: PoseTwoBoneIKResult = {
    knee: rawResult.knee,
    end: rawResult.end,
    distance: rawResult.distance,
    stretch: rawResult.stretch,
    reached: rawResult.reached,
    endError: 0,
  };
  const rootPosition = new Float32Array(3);
  const middlePosition = new Float32Array(3);
  const endPosition = new Float32Array(3);
  const currentDirection = new Float32Array(3);
  const desiredDirection = new Float32Array(3);
  const delta = new Float32Array(4);

  return {
    world,
    result,
    apply(pose, targetWorld, poleDirectionWorld, applyOptions = {}) {
      requireVector3(targetWorld, "pose IK targetWorld");
      requireVector3(poleDirectionWorld, "pose IK poleDirectionWorld");
      if (!applyOptions.worldIsCurrent) evaluateWorldPose(rig, pose, world);
      readWorldPosition(world, rootIndex, rootPosition);
      readWorldPosition(world, middleIndex, middlePosition);
      readWorldPosition(world, endIndex, endPosition);
      const upperLength = Math.max(1e-6, Math.hypot(
        middlePosition[0] - rootPosition[0],
        middlePosition[1] - rootPosition[1],
        middlePosition[2] - rootPosition[2],
      ));
      const lowerLength = Math.max(1e-6, Math.hypot(
        endPosition[0] - middlePosition[0],
        endPosition[1] - middlePosition[1],
        endPosition[2] - middlePosition[2],
      ));
      solveTwoBoneIK({
        root: rootPosition,
        target: targetWorld,
        poleDirection: poleDirectionWorld,
        upperLength,
        lowerLength,
        maxStretch,
      }, rawResult);
      result.distance = rawResult.distance;
      result.stretch = rawResult.stretch;
      result.reached = rawResult.reached;

      if (rawResult.stretch > 1 + 1e-6) {
        setScaledReferenceTranslation(rig, pose, middleIndex, rawResult.stretch);
        setScaledReferenceTranslation(rig, pose, endIndex, rawResult.stretch);
        evaluateWorldPose(rig, pose, world);
        readWorldPosition(world, rootIndex, rootPosition);
        readWorldPosition(world, middleIndex, middlePosition);
        readWorldPosition(world, endIndex, endPosition);
      }

      directionBetween(rootPosition, middlePosition, currentDirection);
      directionBetween(rootPosition, rawResult.knee, desiredDirection);
      quaternionFromUnitVectors(currentDirection, desiredDirection, delta);
      applyWorldRotationDelta(rig, pose, world, rootIndex, delta);
      applyWorldDeltaToSubtree(world, rootIndex, rootSubtree, delta);
      readWorldPosition(world, middleIndex, middlePosition);
      readWorldPosition(world, endIndex, endPosition);

      directionBetween(middlePosition, endPosition, currentDirection);
      directionBetween(rawResult.knee, rawResult.end, desiredDirection);
      quaternionFromUnitVectors(currentDirection, desiredDirection, delta);
      applyWorldRotationDelta(rig, pose, world, middleIndex, delta);
      applyWorldDeltaToSubtree(world, middleIndex, middleSubtree, delta);
      readWorldPosition(world, endIndex, endPosition);
      result.endError = Math.hypot(
        endPosition[0] - rawResult.end[0],
        endPosition[1] - rawResult.end[1],
        endPosition[2] - rawResult.end[2],
      );
      return result;
    },
  };
}

function compileSubtree(rig: CompiledSemanticRig, rootIndex: number) {
  const mask = new Uint8Array(rig.totalCount);
  mask[rootIndex] = 1;
  for (const index of rig.evaluationOrder) {
    const parent = rig.semanticParents[index];
    if (parent >= 0 && mask[parent]) mask[index] = 1;
  }
  let count = 0;
  for (const value of mask) count += value;
  const indices = new Uint32Array(count);
  let cursor = 0;
  for (const index of rig.evaluationOrder) {
    if (mask[index]) indices[cursor++] = index;
  }
  return indices;
}

function applyWorldDeltaToSubtree(
  world: WorldPose,
  rootIndex: number,
  subtree: Uint32Array,
  delta: ArrayLike<number>,
) {
  const rootOffset = rootIndex * 3;
  const pivotX = world.translations[rootOffset];
  const pivotY = world.translations[rootOffset + 1];
  const pivotZ = world.translations[rootOffset + 2];
  const qx = delta[0];
  const qy = delta[1];
  const qz = delta[2];
  const qw = delta[3];
  for (const index of subtree) {
    const translationOffset = index * 3;
    if (index !== rootIndex) {
      const x = world.translations[translationOffset] - pivotX;
      const y = world.translations[translationOffset + 1] - pivotY;
      const z = world.translations[translationOffset + 2] - pivotZ;
      const ix = qw * x + qy * z - qz * y;
      const iy = qw * y + qz * x - qx * z;
      const iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      world.translations[translationOffset] = pivotX + ix * qw + iw * -qx + iy * -qz - iz * -qy;
      world.translations[translationOffset + 1] = pivotY + iy * qw + iw * -qy + iz * -qx - ix * -qz;
      world.translations[translationOffset + 2] = pivotZ + iz * qw + iw * -qz + ix * -qy - iy * -qx;
    }
    const rotationOffset = index * 4;
    const bx = world.rotations[rotationOffset];
    const by = world.rotations[rotationOffset + 1];
    const bz = world.rotations[rotationOffset + 2];
    const bw = world.rotations[rotationOffset + 3];
    const rx = qw * bx + qx * bw + qy * bz - qz * by;
    const ry = qw * by - qx * bz + qy * bw + qz * bx;
    const rz = qw * bz + qx * by - qy * bx + qz * bw;
    const rw = qw * bw - qx * bx - qy * by - qz * bz;
    const inverseLength = 1 / Math.max(1e-12, Math.hypot(rx, ry, rz, rw));
    world.rotations[rotationOffset] = rx * inverseLength;
    world.rotations[rotationOffset + 1] = ry * inverseLength;
    world.rotations[rotationOffset + 2] = rz * inverseLength;
    world.rotations[rotationOffset + 3] = rw * inverseLength;
  }
}

function validateChain(rig: CompiledSemanticRig, rootIndex: number, middleIndex: number, endIndex: number) {
  const unique = new Set([rootIndex, middleIndex, endIndex]);
  if (unique.size !== 3) throw new RangeError("pose IK joints must be distinct");
  for (const index of unique) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= rig.totalCount) {
      throw new RangeError("pose IK joint index is outside the rig");
    }
  }
}

function readWorldPosition(world: WorldPose, index: number, out: Float32Array) {
  out[0] = world.translations[index * 3];
  out[1] = world.translations[index * 3 + 1];
  out[2] = world.translations[index * 3 + 2];
  return out;
}

function directionBetween(from: ArrayLike<number>, to: ArrayLike<number>, out: Float32Array) {
  subtractVector3(to, from, out);
  normalizeVector3(out, out);
  return out;
}

function setScaledReferenceTranslation(rig: CompiledSemanticRig, pose: PoseBuffer, index: number, scale: number) {
  const offset = index * 3;
  pose.translations[offset] = rig.referenceTranslations[offset] * scale;
  pose.translations[offset + 1] = rig.referenceTranslations[offset + 1] * scale;
  pose.translations[offset + 2] = rig.referenceTranslations[offset + 2] * scale;
}

function requireVector3(value: ArrayLike<number>, label: string) {
  if (value.length < 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new TypeError(`${label} must contain three finite values`);
  }
}

function finiteAtLeast(value: unknown, minimum: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new RangeError(`${label} must be at least ${minimum}`);
  return number;
}
