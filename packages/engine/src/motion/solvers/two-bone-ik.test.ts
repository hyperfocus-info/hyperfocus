import { expect, test } from "bun:test";
import { createTwoBoneIKResult, solveTwoBoneIK } from "./two-bone-ik.ts";

test("two-bone IK reaches a target while respecting both segment lengths", () => {
  const result = solveTwoBoneIK({
    root: [0, 0, 0],
    target: [1, 0, 1],
    poleDirection: [0, 1, 0],
    upperLength: 1,
    lowerLength: 1,
  });

  expect(result.reached).toBe(true);
  expect(Math.hypot(result.knee[0], result.knee[1], result.knee[2])).toBeCloseTo(1, 5);
  expect(Math.hypot(result.end[0] - result.knee[0], result.end[1] - result.knee[1], result.end[2] - result.knee[2])).toBeCloseTo(1, 5);
  expect([...result.end]).toEqual([1, 0, 1]);
  expect(result.knee[1]).toBeGreaterThan(0);
});

test("two-bone IK clamps unreachable targets without stretching by default", () => {
  const result = solveTwoBoneIK({
    root: [0, 0, 0],
    target: [0, 0, 4],
    poleDirection: [0, 1, 0],
    upperLength: 1,
    lowerLength: 1,
  });

  expect(result.reached).toBe(false);
  expect(result.stretch).toBe(1);
  expect(result.end[2]).toBeCloseTo(2, 5);
});

test("two-bone IK supports explicit bounded stylized stretch and output reuse", () => {
  const out = createTwoBoneIKResult();
  const result = solveTwoBoneIK({
    root: [0, 0, 0],
    target: [0, 0, 2.1],
    poleDirection: [0, 1, 0],
    upperLength: 1,
    lowerLength: 1,
    maxStretch: 1.1,
  }, out);

  expect(result).toBe(out);
  expect(result.reached).toBe(true);
  expect(result.stretch).toBeCloseTo(1.05, 5);
  expect(result.end[2]).toBeCloseTo(2.1, 5);
  expect(() => solveTwoBoneIK({
    root: [0, 0, 0],
    target: [0, 0, 1],
    poleDirection: [0, 1, 0],
    upperLength: 0,
    lowerLength: 1,
  })).toThrow("upper length");
});
