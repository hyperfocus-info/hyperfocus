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

test('animated bend follows the reference plane and preserves the end orientation through changed reach and seeking', () => {
  const rig = createTestRig(), pose = createPoseBuffer(createPoseBufferLayout(3, 4, { includeScales: true }));
  const solver = createPoseTwoBoneIKSolver({ rig, rootIndex: 0, middleIndex: 1, endIndex: 2 });
  for (const angle of [.6, -.7, 1.1, .6]) {
    pose.translations.set(rig.referenceTranslations); pose.rotations.set(rig.referenceRotations);
    pose.rotations.set([Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)], 4);
    const before = evaluateWorldPose(rig, pose, createWorldPose(rig));
    const hand = [...before.rotations.subarray(8,12)];
    const referenceSign = Math.sign(before.translations[8]!);
    const result = solver.apply(pose, [.12, .15, 0], [0,0,-referenceSign], { bendMode: 'animated', targetMode: 'animated-offset', endOrientation: 'preserve-animation' });
    expect(result.reached).toBe(true); expect(result.endError).toBeLessThan(.00001);
    const after = evaluateWorldPose(rig, pose, createWorldPose(rig));
    expect(Math.hypot(...hand.map((v,i) => v - after.rotations[8+i]!))).toBeLessThan(.00001);
    // The midpoint stays on the source bend side, even though the fallback pole points elsewhere.
    expect(Math.sign(after.translations[5]! - (after.translations[8]! / 2))).toBe(-referenceSign);
    expect(Math.hypot(after.translations[3]!,after.translations[4]!,after.translations[5]!)).toBeCloseTo(1,5);
  }
});

test('a neutral animated correction is a true no-op, including a straight source arm', () => {
  const rig = createTestRig(), pose = createPoseBuffer(createPoseBufferLayout(3, 4, { includeScales: true }));
  pose.translations.set(rig.referenceTranslations); pose.rotations.set(rig.referenceRotations);
  const before = [...pose.rotations];
  const solver = createPoseTwoBoneIKSolver({ rig, rootIndex: 0, middleIndex: 1, endIndex: 2 });
  solver.apply(pose, [0,0,0], [0,-1,0], { bendMode: 'animated', targetMode: 'animated-offset', endOrientation: 'preserve-animation' });
  expect([...pose.rotations]).toEqual(before);
});
