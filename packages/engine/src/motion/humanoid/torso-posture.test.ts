import { expect, test } from "bun:test";
import { writeHumanoidTorsoPitchShares } from "./torso-posture.ts";

test("walk keeps the established torso distribution", () => {
  const shares = new Float32Array(3);
  const hips = writeHumanoidTorsoPitchShares(.2, shares);

  expect(hips).toBe(.36);
  expect(Array.from(shares)).toEqual([
    expect.closeTo(0.16666666666666666, 6),
    expect.closeTo(0.3333333333333333, 6),
    expect.closeTo(0.5, 6),
  ]);
});

test("sprint projects the lower trunk without folding the head past the catalog", () => {
  const shares = new Float32Array(3);
  const hips = writeHumanoidTorsoPitchShares(1, shares);

  expect(hips).toBe(.58);
  expect(Array.from(shares)).toEqual([
    0,
    expect.closeTo(.38, 6),
    expect.closeTo(.32, 6),
  ]);
  expect(hips + shares[0]! + shares[1]! + shares[2]!).toBeCloseTo(1.28, 6);
});

test("incomplete torso chains retain their established distribution", () => {
  const shares = new Float32Array(2);
  const hips = writeHumanoidTorsoPitchShares(1, shares);

  expect(hips).toBe(.36);
  expect(Array.from(shares)).toEqual([
    expect.closeTo(0.3333333333333333, 6),
    expect.closeTo(0.6666666666666666, 6),
  ]);
});
