import { describe, expect, test } from "bun:test";
import { sampleSwingFootPitchRadians, sampleSwingToePitchRadians } from "./foot-orientation.ts";

describe("procedural swing-foot pitch", () => {
  test("pushes off toe-down, steps in toe-up, and rejoins plants without a snap", () => {
    const stanceRatio = .6;
    const swingPhase = (progress: number) => stanceRatio + (1 - stanceRatio) * progress;
    const samples = Array.from({ length: 101 }, (_, index) => sampleSwingFootPitchRadians(swingPhase(index / 100), stanceRatio));

    expect(sampleSwingFootPitchRadians(swingPhase(0), stanceRatio)).toBeCloseTo(0, 8);
    expect(sampleSwingFootPitchRadians(swingPhase(.25), stanceRatio)).toBeLessThan(-.09);
    expect(sampleSwingFootPitchRadians(swingPhase(.5), stanceRatio)).toBeCloseTo(0, 8);
    expect(sampleSwingFootPitchRadians(swingPhase(.75), stanceRatio)).toBeGreaterThan(.09);
    expect(sampleSwingFootPitchRadians(swingPhase(1), stanceRatio)).toBeCloseTo(0, 8);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(.200001);
  });

  test("rolls through the toe only during swing and rejoins contact smoothly", () => {
    const stanceRatio = .6;
    const swingPhase = (progress: number) => stanceRatio + (1 - stanceRatio) * progress;
    expect(sampleSwingToePitchRadians(.2, stanceRatio, true)).toBe(0);
    expect(sampleSwingToePitchRadians(swingPhase(0), stanceRatio)).toBeCloseTo(0, 8);
    expect(sampleSwingToePitchRadians(swingPhase(.24), stanceRatio)).toBeGreaterThan(.25);
    expect(sampleSwingToePitchRadians(swingPhase(.53), stanceRatio)).toBeCloseTo(0, 8);
    expect(sampleSwingToePitchRadians(swingPhase(.79), stanceRatio)).toBeGreaterThan(.06);
    expect(sampleSwingToePitchRadians(swingPhase(1), stanceRatio)).toBeCloseTo(0, 8);
  });
});
