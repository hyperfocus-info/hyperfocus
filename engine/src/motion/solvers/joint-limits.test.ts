import { expect, test } from "bun:test";
import { quaternionFromAxisAngle } from "../math.ts";
import { createPoseBuffer, createPoseBufferLayout } from "../pose-buffer.ts";
import { humanoidSemantics, type CompiledSemanticRig } from "../rig.ts";
import { createHumanoidJointLimitSolver } from "./joint-limits.ts";

function rigWithHead(): CompiledSemanticRig {
  const semanticIndices = new Int32Array(humanoidSemantics.length).fill(-1);
  semanticIndices[humanoidSemantics.indexOf("head")] = 0;
  return {
    deformCount: 1,
    totalCount: 2,
    motionRootIndex: 1,
    sourceParents: new Int32Array([-1]),
    semanticParents: new Int32Array([1, -1]),
    evaluationOrder: new Uint32Array([1, 0]),
    referenceRotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
    referenceTranslations: new Float32Array(6),
    referenceScales: new Float32Array(6).fill(1),
    sourceReferenceRotations: new Float32Array([0, 0, 0, 1]),
    sourceReferenceTranslations: new Float32Array(3),
    sourceReferenceScales: new Float32Array(3).fill(1),
    semanticIndices,
    tags: new Map(),
    capabilities: {
      baseLocomotion: false, aim: true,
      leftArm: false, rightArm: false, leftLeg: false, rightLeg: false,
      leftReach: false, rightReach: false, leftFootPlant: false, rightFootPlant: false,
    },
    diagnostics: [],
    validated: false,
  };
}

test("humanoid joint limits clamp swing and preserve normalized output", () => {
  const rig = rigWithHead();
  const pose = createPoseBuffer(createPoseBufferLayout(1, 2));
  quaternionFromAxisAngle([1, 0, 0], Math.PI, pose.rotations.subarray(0, 4));
  const solver = createHumanoidJointLimitSolver({ rig });
  const result = solver.apply(pose);

  expect(result.clampedJointCount).toBe(1);
  expect(Math.hypot(...pose.rotations.subarray(0, 4))).toBeCloseTo(1, 6);
  const angle = 2 * Math.acos(Math.abs(pose.rotations[3]));
  expect(angle).toBeCloseTo(0.78, 5);
});

test("manual overrides replace preset limits deterministically", () => {
  const rig = rigWithHead();
  const pose = createPoseBuffer(createPoseBufferLayout(1, 2));
  quaternionFromAxisAngle([0, 1, 0], 1, pose.rotations.subarray(0, 4));
  const solver = createHumanoidJointLimitSolver({
    rig,
    overrides: { head: { minTwistRadians: -0.2, maxTwistRadians: 0.2 } },
  });
  solver.apply(pose);

  expect(2 * Math.atan2(pose.rotations[1], pose.rotations[3])).toBeCloseTo(0.2, 5);
});
