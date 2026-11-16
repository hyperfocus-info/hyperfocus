import { describe, expect, test } from "bun:test";
import { planHumanoidLocomotionIntent } from "./locomotion-intent.ts";
import { getHumanoidLocomotionProfile } from "./locomotion-profile.ts";

describe("humanoid locomotion intent", () => {
  test("turns pace and direction into deterministic controller and gait parameters", () => {
    const first = planHumanoidLocomotionIntent({ direction: [3, 9, 4], pace: "sprint" });
    const second = planHumanoidLocomotionIntent({ direction: [3, 9, 4], pace: "sprint" });
    const profile = getHumanoidLocomotionProfile("sprint");
    expect(first).toEqual(second);
    expect(first.direction).toEqual([.6, 0, .8]);
    expect(first.velocity[0]).toBeCloseTo(profile.speedMetersPerSecond * .6, 10);
    expect(first.velocity[2]).toBeCloseTo(profile.speedMetersPerSecond * .8, 10);
    expect(first.maximumStepDistanceMeters).toBe(2);
    expect(first.stanceRatio).toBeLessThan(planHumanoidLocomotionIntent({ direction: [0, 0, 1], pace: "walk" }).stanceRatio);
    expect(first.liftHeightMeters).toBeGreaterThan(planHumanoidLocomotionIntent({ direction: [0, 0, 1], pace: "walk" }).liftHeightMeters);
  });

  test("turns an explicit speed override into cadence without stretching the selected gait", () => {
    const plan = planHumanoidLocomotionIntent({ direction: [-1, 0, 0], pace: "run", posture: "crouch", speedMetersPerSecond: 6.7 });
    const profile = getHumanoidLocomotionProfile("run");
    expect(plan.velocity).toEqual([-6.7, 0, 0]);
    expect(plan.pace).toBe("run");
    expect(plan.posture).toBe("crouch");
    expect(plan.cycleDistanceScale).toBe(profile.cycleDistanceScale);
    expect(plan.maximumStepDistanceMeters).toBe(profile.maximumStepDistanceMeters);
    expect(plan.cycleSeconds).toBeCloseTo(profile.cycleSeconds / 2, 10);
  });

  test("infers a legacy speed-only intent as the matching gait", () => {
    expect(planHumanoidLocomotionIntent({ direction: [1, 0, 0], speedMetersPerSecond: 1.35 }).pace).toBe("walk");
    expect(planHumanoidLocomotionIntent({ direction: [1, 0, 0], speedMetersPerSecond: 2.6 }).pace).toBe("jog");
    expect(planHumanoidLocomotionIntent({ direction: [1, 0, 0], speedMetersPerSecond: 3.4 }).pace).toBe("run");
    expect(planHumanoidLocomotionIntent({ direction: [1, 0, 0], speedMetersPerSecond: 4 }).pace).toBe("sprint");
    expect(planHumanoidLocomotionIntent({ direction: [1, 0, 0], speedMetersPerSecond: 6.5 }).pace).toBe("sprint");
  });

  test("rejects ambiguous or impossible movement intent", () => {
    expect(() => planHumanoidLocomotionIntent({ direction: [0, 1, 0], pace: "walk" })).toThrow("horizontal");
    expect(() => planHumanoidLocomotionIntent({ direction: [0, 0, 1], pace: "idle", speedMetersPerSecond: 1 })).toThrow("Idle");
    expect(() => planHumanoidLocomotionIntent({ direction: [0, 0, Number.NaN] })).toThrow("finite");
    expect(() => Reflect.apply(planHumanoidLocomotionIntent, undefined, [{ direction: [0, 0, 1], posture: "crawl" }])).toThrow("unsupported");
  });
});
