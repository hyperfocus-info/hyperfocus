import { expect, test } from "bun:test";
import { isNormalizedQuaternion } from "../math.ts";
import { createPoseBuffer, createPoseBufferLayout } from "../pose-buffer.ts";
import { createDistributedAimSolver } from "./aim.ts";

test("distributed aim rotates only declared thoracic joints", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(5));
  const hipsBefore = [...pose.rotations.slice(0, 4)];
  const solver = createDistributedAimSolver({ jointIndices: [1, 2, 3], weights: [1, 2, 3] });

  solver.apply(pose, 0.6, -0.4);

  expect([...pose.rotations.slice(0, 4)]).toEqual(hipsBefore);
  expect([...pose.rotations.slice(4, 8)]).not.toEqual([0, 0, 0, 1]);
  for (const index of solver.jointIndices) {
    expect(isNormalizedQuaternion(pose.rotations.subarray(index * 4, index * 4 + 4))).toBe(true);
  }
  expect([...pose.translations]).toEqual(new Array(15).fill(0));
});

test("distributed aim clamps extreme pitch without rotating the pelvis", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(4));
  const solver = createDistributedAimSolver({ jointIndices: [1, 2, 3], maxPitch: 0.7, maxYaw: 0.8 });
  const result = solver.apply(pose, 10, -10, 2);

  expect(result).toEqual({ yaw: 0.8, pitch: -0.7, weight: 1 });
  expect([...pose.rotations.slice(0, 4)]).toEqual([0, 0, 0, 1]);
});

test("distributed aim validates configuration and PoseBuffer bounds", () => {
  expect(() => createDistributedAimSolver({ jointIndices: [] })).toThrow("at least one");
  expect(() => createDistributedAimSolver({ jointIndices: [1, 2], weights: [1] })).toThrow("match");
  const solver = createDistributedAimSolver({ jointIndices: [2] });
  const pose = createPoseBuffer(createPoseBufferLayout(2));
  expect(() => solver.apply(pose, 0, 0)).toThrow("totalCount");
});
