import { expect, test } from "bun:test";
import { createPoseBuffer, createPoseBufferLayout, resetPoseBuffer } from "../pose-buffer.ts";
import { createRecoilSolver } from "./recoil.ts";

test("recoil adds a damped thoracic impulse without folding the pelvis", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(4));
  const solver = createRecoilSolver({ jointIndices: [1, 2, 3] });
  const hips = [...pose.rotations.slice(0, 4)];

  solver.impulse();
  solver.update(1 / 60, pose);

  expect(solver.state.angle).toBeGreaterThan(0);
  expect([...pose.rotations.slice(0, 4)]).toEqual(hips);
  expect([...pose.rotations.slice(4, 8)]).not.toEqual([0, 0, 0, 1]);
});

test("recoil spring returns to rest and reuses state", () => {
  const pose = createPoseBuffer(createPoseBufferLayout(3));
  const solver = createRecoilSolver({ jointIndices: [1, 2] });
  const state = solver.state;
  solver.impulse(0.8);
  for (let frame = 0; frame < 240; frame += 1) {
    resetPoseBuffer(pose);
    expect(solver.update(1 / 60, pose)).toBe(state);
  }
  expect(Math.abs(state.angle)).toBeLessThan(0.001);
  expect(Math.abs(state.velocity)).toBeLessThan(0.001);
  solver.reset();
  expect(state).toEqual({ angle: 0, velocity: 0 });
});
