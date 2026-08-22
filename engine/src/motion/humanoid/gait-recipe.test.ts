import { expect, test } from "bun:test";
import {
  canonicalHumanoidGaitV1,
  createCanonicalHumanoidGaitSample,
  normalizeGaitPhase,
  sampleCanonicalHumanoidGait,
} from "./gait-recipe.ts";

test("canonical humanoid gait samples the four authored semantic poses", () => {
  const out = createCanonicalHumanoidGaitSample();
  for (const key of canonicalHumanoidGaitV1) {
    expect(sampleCanonicalHumanoidGait(key.phase, out)).toBe(out);
    expect(out.footForward).toBeCloseTo(key.footForward, 6);
    expect(out.footLift).toBeCloseTo(key.footLift, 6);
    expect(out.pelvisVertical).toBeCloseTo(key.pelvisVertical, 6);
    expect(out.armSwing).toBeCloseTo(key.armSwing, 6);
  }
});

test("canonical gait is continuous across cycle boundaries", () => {
  const before = sampleCanonicalHumanoidGait(1 - 1e-5);
  const after = sampleCanonicalHumanoidGait(1e-5);

  expect(Math.abs(before.footForward - after.footForward)).toBeLessThan(0.001);
  expect(Math.abs(before.footLift - after.footLift)).toBeLessThan(0.001);
  expect(normalizeGaitPhase(-0.25)).toBe(0.75);
  expect(() => sampleCanonicalHumanoidGait(Number.NaN)).toThrow("finite");
});

test("canonical gait sampling reuses caller-owned output", () => {
  const out = createCanonicalHumanoidGaitSample();
  const keys = structuredClone(canonicalHumanoidGaitV1);
  sampleCanonicalHumanoidGait(0.33, out);
  sampleCanonicalHumanoidGait(0.66, out);

  expect(canonicalHumanoidGaitV1).toEqual(keys);
});
