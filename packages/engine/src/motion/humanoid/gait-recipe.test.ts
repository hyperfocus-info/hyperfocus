import { expect, test } from "bun:test";
import {
  canonicalHumanoidGaitV1,
  createCanonicalHumanoidGaitSample,
  normalizeGaitPhase,
  planCanonicalHumanoidGaitWindows,
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
  const before = sampleCanonicalHumanoidGait(0.99999);
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

test("canonical gait intent expands into deterministic alternating support and step windows", () => {
  expect(planCanonicalHumanoidGaitWindows({ durationFrames: 24, cycleFrames: 12, stanceRatio: .5 })).toEqual([
    { foot: "left", kind: "support", frameOffset: 0, durationFrames: 6 },
    { foot: "right", kind: "step", frameOffset: 0, durationFrames: 6 },
    { foot: "left", kind: "step", frameOffset: 6, durationFrames: 6 },
    { foot: "right", kind: "support", frameOffset: 6, durationFrames: 6 },
    { foot: "left", kind: "support", frameOffset: 12, durationFrames: 6 },
    { foot: "right", kind: "step", frameOffset: 12, durationFrames: 6 },
    { foot: "left", kind: "step", frameOffset: 18, durationFrames: 6 },
    { foot: "right", kind: "support", frameOffset: 18, durationFrames: 6 },
  ]);
  expect(planCanonicalHumanoidGaitWindows({ durationFrames: 9, cycleFrames: 8, initialPhase: .25, stanceRatio: .5 })).toEqual([
    { foot: "left", kind: "support", frameOffset: 0, durationFrames: 2 },
    { foot: "right", kind: "step", frameOffset: 0, durationFrames: 2 },
    { foot: "left", kind: "step", frameOffset: 2, durationFrames: 4 },
    { foot: "right", kind: "support", frameOffset: 2, durationFrames: 4 },
    { foot: "left", kind: "support", frameOffset: 6, durationFrames: 3 },
    { foot: "right", kind: "step", frameOffset: 6, durationFrames: 3 },
  ]);
});

test("canonical gait intent rejects unusable timing instead of emitting snap cues", () => {
  expect(() => planCanonicalHumanoidGaitWindows({ durationFrames: 0, cycleFrames: 12 })).toThrow("durationFrames");
  expect(() => planCanonicalHumanoidGaitWindows({ durationFrames: 12, cycleFrames: 1 })).toThrow("cycleFrames");
  expect(() => planCanonicalHumanoidGaitWindows({ durationFrames: 12, cycleFrames: 8, stanceRatio: 1 })).toThrow("stanceRatio");
});
