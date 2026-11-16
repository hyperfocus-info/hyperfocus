import { expect, test } from "bun:test";
import { createHumanoidRotationSpring } from "./rotation-spring.ts";

test("critically damps a discontinuous IK target without exceeding the joint speed gate", () => {
  const spring = createHumanoidRotationSpring({ jointCount: 1, responsePerSecond: 16, maximumAngularSpeedRadiansPerSecond: 6 });
  const output = new Float32Array([0, 0, 0, 1]), target = new Float32Array([1, 0, 0, 0]);
  spring.reset(output);
  let previous = output.slice(), maximumStep = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    spring.update(target, 0.016666666666666666, output);
    const dot = Math.min(1, Math.abs(previous[0]! * output[0]! + previous[1]! * output[1]! + previous[2]! * output[2]! + previous[3]! * output[3]!));
    maximumStep = Math.max(maximumStep, 2 * Math.acos(dot)); previous = output.slice();
  }
  expect(maximumStep).toBeLessThanOrEqual(0.10001);
  expect(output[0]).toBeCloseTo(1, 5);
  expect(Math.abs(output[3]!)).toBeLessThan(1e-4);
});

test("passes the physical root through while filtering articulated joints", () => {
  const spring = createHumanoidRotationSpring({ jointCount: 2, passthroughJointIndex: 0 });
  const output = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  spring.reset(output);
  const target = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0]);
  spring.update(target, 0.016666666666666666, output);
  expect(Array.from(output.subarray(0, 4))).toEqual([0, 1, 0, 0]);
  expect(output[4]).toBeGreaterThan(0);
  expect(output[4]).toBeLessThan(.2);
});
