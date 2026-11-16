import { expect, test } from "bun:test";
import { planPhysicalEffectorTrajectory3D } from "./physical-effector-trajectory-3d.ts";

test("plans a reachable velocity-matched strike from compact chain and contact intent", () => {
  const options = {
    root: [0, 0, 0] as const,
    middle: [.5, 0, 0] as const,
    end: [1, 0, 0] as const,
    contactDisplacement: [.2, 0, 0] as const,
    contactVelocity: [6, 0, 0] as const,
    fps: 30,
    anticipationFrames: 6,
    requestedFollowThroughFrames: 6,
    maxStretch: 1.5,
  };
  const first = planPhysicalEffectorTrajectory3D(options), second = planPhysicalEffectorTrajectory3D(options);
  expect(first).toEqual(second);
  expect(first).toEqual({
    targetFrom: [.6, 0, 0],
    contactTarget: [1.2, 0, 0],
    targetTo: [1.5, 0, 0],
    pole: [0, 0, 1.5],
    contactVelocity: [6, 0, 0],
    strikeStartOffsetFrames: 0,
    strikeFrames: 6,
    followThroughFrames: 3,
    chainLength: 1,
    maximumReach: 1.5,
  });
});

test("rejects contact intent that a two-bone chain cannot reach", () => {
  expect(() => planPhysicalEffectorTrajectory3D({
    root: [0, 0, 0], middle: [.5, 0, 0], end: [1, 0, 0],
    contactDisplacement: [1, 0, 0], contactVelocity: [6, 0, 0],
    fps: 30, anticipationFrames: 6, requestedFollowThroughFrames: 4, maxStretch: 1.05,
  })).toThrow("Move the character root at least 0.95 m closer");
});
