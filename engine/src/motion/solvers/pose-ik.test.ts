import { expect, test } from "bun:test";
import { createPoseBuffer, createPoseBufferLayout } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";
import { createPoseTwoBoneIKSolver } from "./pose-ik.ts";
import { createWorldPose, evaluateWorldPose } from "./world-pose.ts";

function createTestRig(): CompiledSemanticRig {
  const totalCount = 4;
  return {
    deformCount: 3,
    totalCount,
    motionRootIndex: 3,
    sourceParents: new Int32Array([-1, 0, 1]),
    semanticParents: new Int32Array([3, 0, 1, -1]),
    evaluationOrder: new Uint32Array([3, 0, 1, 2]),
    referenceRotations: new Float32Array([
      0, 0, 0, 1,
      0, 0, 0, 1,
      0, 0, 0, 1,
      0, 0, 0, 1,
    ]),
    referenceTranslations: new Float32Array([
      0, 0, 0,
      0, -1, 0,
      0, -1, 0,
      0, 0, 0,
    ]),
    referenceScales: new Float32Array(12).fill(1),
    sourceReferenceRotations: new Float32Array(12),
    sourceReferenceTranslations: new Float32Array(9),
    sourceReferenceScales: new Float32Array(9).fill(1),
    semanticIndices: new Int32Array(22).fill(-1),
    tags: new Map(),
    capabilities: {
      baseLocomotion: true,
      aim: false,
      leftArm: false,
      rightArm: false,
      leftLeg: true,
      rightLeg: false,
      leftReach: false,
      rightReach: false,
      leftFootPlant: true,
      rightFootPlant: false,
    },
    diagnostics: [],
    validated: false,
  };
}

test("world pose evaluates the virtual MotionRoot hierarchy", () => {
  const rig = createTestRig();
  const pose = createPoseBuffer(createPoseBufferLayout(3, 4, { includeScales: true }));
  pose.translations.set(rig.referenceTranslations);
  pose.rotations.set(rig.referenceRotations);
  const world = evaluateWorldPose(rig, pose, createWorldPose(rig));
  expect([...world.translations.subarray(6, 9)]).toEqual([0, -2, 0]);

  pose.translations.set([1, 0, 2], rig.motionRootIndex * 3);
  evaluateWorldPose(rig, pose, world);
  expect([...world.translations.subarray(6, 9)]).toEqual([1, -2, 2]);
});

test("pose IK reaches a target without stretching by default", () => {
  const rig = createTestRig();
  const pose = createPoseBuffer(createPoseBufferLayout(3, 4, { includeScales: true }));
  pose.translations.set(rig.referenceTranslations);
  pose.rotations.set(rig.referenceRotations);
  const solver = createPoseTwoBoneIKSolver({ rig, rootIndex: 0, middleIndex: 1, endIndex: 2 });
  const result = solver.apply(pose, [0.8, -1.5, 0.2], [0, 0, 1]);

  expect(result.reached).toBe(true);
  expect(result.stretch).toBe(1);
  expect(result.endError).toBeLessThan(1e-4);
  expect([...pose.rotations].every(Number.isFinite)).toBe(true);
});

test("pose IK clamps unreachable targets and supports explicit stylized stretch", () => {
  const rig = createTestRig();
  const pose = createPoseBuffer(createPoseBufferLayout(3, 4, { includeScales: true }));
  pose.translations.set(rig.referenceTranslations);
  pose.rotations.set(rig.referenceRotations);
  const solver = createPoseTwoBoneIKSolver({
    rig,
    rootIndex: 0,
    middleIndex: 1,
    endIndex: 2,
    maxStretch: 1.1,
  });
  const result = solver.apply(pose, [0, -2.2, 0], [0, 0, 1]);

  expect(result.stretch).toBeCloseTo(1.1, 6);
  expect(result.endError).toBeLessThan(1e-4);
  expect(pose.translations[4]).toBeCloseTo(-1.1, 6);
  expect(pose.translations[7]).toBeCloseTo(-1.1, 6);
});
