import { describe, expect, test } from "bun:test";
import { createHumanoidJumpPoseSample, sampleHumanoidJumpPose } from "./jump-pose.ts";

describe("procedural humanoid jump pose", () => {
  test("progresses from compressed takeoff through ascent, apex, descent, and landing", () => {
    const out = createHumanoidJumpPoseSample();
    sampleHumanoidJumpPose({ motionPhase: "takeoff", jumpAnticipation: 1, airborneSeconds: 0, verticalSpeed: 0, landingWeight: 0 }, out);
    expect(out.phase).toBe("takeoff");
    expect(out.pelvisDropRatio).toBeGreaterThan(.15);
    expect(out.airborneArmWeight).toBe(0);

    sampleHumanoidJumpPose({ motionPhase: "jump", jumpAnticipation: 0, airborneSeconds: .2, verticalSpeed: 4, landingWeight: 0 }, out);
    expect(out.phase).toBe("ascent");
    expect(out.pelvisDropRatio).toBeLessThan(.02);
    expect(out.airborneArmWeight).toBeGreaterThan(.75);

    sampleHumanoidJumpPose({ motionPhase: "fall", jumpAnticipation: 0, airborneSeconds: .5, verticalSpeed: 0, landingWeight: 0 }, out);
    expect(out.phase).toBe("apex");
    expect(out.pelvisDropRatio).toBeCloseTo(0, 8);

    sampleHumanoidJumpPose({ motionPhase: "fall", jumpAnticipation: 0, airborneSeconds: .8, verticalSpeed: -4, landingWeight: 0 }, out);
    expect(out.phase).toBe("descent");
    expect(out.torsoPitchRadians).toBeGreaterThan(.05);

    sampleHumanoidJumpPose({ motionPhase: "land", jumpAnticipation: 0, airborneSeconds: 0, verticalSpeed: 0, landingWeight: .8 }, out);
    expect(out.phase).toBe("landing");
    expect(out.pelvisDropRatio).toBeCloseTo(.16, 6);
    expect(out.torsoPitchRadians).toBeGreaterThan(.15);
  });

  test("releases launch compression smoothly without owning the physics arc or limbs", () => {
    const early = sampleHumanoidJumpPose({ motionPhase: "jump", jumpAnticipation: 0, airborneSeconds: 0.03333333333333333, verticalSpeed: 4, landingWeight: 0 });
    const settled = sampleHumanoidJumpPose({ motionPhase: "jump", jumpAnticipation: 0, airborneSeconds: .2, verticalSpeed: 4, landingWeight: 0 });
    expect(early.pelvisDropRatio).toBeGreaterThan(settled.pelvisDropRatio);
    expect(early.torsoPitchRadians).toBeGreaterThan(settled.torsoPitchRadians);
    expect(early.airborneArmWeight).toBeLessThan(settled.airborneArmWeight);
    expect(early.airborneArmPhase).toBeGreaterThan(0);
    expect(Object.keys(early).sort()).toEqual(["airborneArmPhase", "airborneArmWeight", "pelvisDropRatio", "phase", "torsoPitchRadians", "weight"]);
  });
});
