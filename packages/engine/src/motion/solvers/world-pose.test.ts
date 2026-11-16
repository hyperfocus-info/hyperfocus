import { expect, test } from "bun:test";
import { createPoseBuffer, createPoseBufferLayout } from "../pose-buffer.ts";
import { applyWorldTranslationDelta, createWorldPose, evaluateWorldPose } from "./world-pose.ts";

test("world translation delta compensates for parent scale", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(2, 2, { includeScales: true }));
  pose.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
  pose.translations.set([0, 0, 0, 0, 100, 0]);
  pose.scales!.set([.01, .01, .01, 1, 1, 1]);
  const rig = { totalCount: 2, semanticParents: new Int32Array([-1, 0]), evaluationOrder: new Uint32Array([0, 1]) };
  const world = createWorldPose(rig); evaluateWorldPose(rig, pose, world);
  expect(world.translations[4]).toBeCloseTo(1, 6);
  applyWorldTranslationDelta(rig, pose, world, 1, [0, -.15, 0]);
  evaluateWorldPose(rig, pose, world);
  expect(world.translations[4]).toBeCloseTo(.85, 6);
});

test("world translation delta compensates for parent rotation", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(2, 2, { includeScales: true }));
  const half = Math.sin(Math.PI / 4), cosine = Math.cos(Math.PI / 4);
  pose.rotations.set([0, 0, half, cosine, 0, 0, 0, 1]); pose.scales!.fill(1);
  const rig = { totalCount: 2, semanticParents: new Int32Array([-1, 0]), evaluationOrder: new Uint32Array([0, 1]) };
  const world = createWorldPose(rig); evaluateWorldPose(rig, pose, world);
  applyWorldTranslationDelta(rig, pose, world, 1, [0, 1, 0]); evaluateWorldPose(rig, pose, world);
  expect(world.translations[3]).toBeCloseTo(0, 6); expect(world.translations[4]).toBeCloseTo(1, 6);
});
