import { describe, expect, test } from "bun:test";
import { createProceduralLocomotion } from "./locomotion.ts";
import { getHumanoidLocomotionProfile, type HumanoidLocomotionPace } from "./locomotion-profile.ts";

const REFERENCE_LEG_LENGTH_METERS = .83;

describe("catalog-calibrated humanoid locomotion profiles", () => {
  test("explicit sprint intent builds through continuous gait envelopes instead of snapping from standing", () => {
    const locomotion = createProceduralLocomotion();
    const sprint = getHumanoidLocomotionProfile("sprint");
    let previousBlend = 0;
    let previousStance = getHumanoidLocomotionProfile("idle").stanceRatio;
    let maximumBlendStep = 0;
    let maximumStanceStep = 0;
    for (let frame = 0; frame <= 120; frame += 1) {
      const speed = sprint.speedMetersPerSecond * frame / 120;
      const sample = locomotion.update({
        deltaSeconds: 0.016666666666666666,
        resolvedRootDelta: [0, 0, 0],
        velocity: [0, 0, speed],
        facing: [0, 0, 1],
        groundNormal: [0, 1, 0],
        turnRate: 0,
        isGrounded: true,
        legLength: REFERENCE_LEG_LENGTH_METERS,
        hipWidth: .28,
        pace: "sprint",
      });
      maximumBlendStep = Math.max(maximumBlendStep, Math.abs(sample.paceBlend - previousBlend));
      maximumStanceStep = Math.max(maximumStanceStep, Math.abs(sample.stanceRatio - previousStance));
      previousBlend = sample.paceBlend;
      previousStance = sample.stanceRatio;
      if (frame === 0) expect(sample.paceBlend).toBe(0);
    }
    for (let frame = 0; frame < 60; frame += 1) {
      locomotion.update({
        deltaSeconds: 0.016666666666666666,
        resolvedRootDelta: [0, 0, sprint.speedMetersPerSecond / 60],
        velocity: [0, 0, sprint.speedMetersPerSecond],
        facing: [0, 0, 1],
        groundNormal: [0, 1, 0],
        turnRate: 0,
        isGrounded: true,
        legLength: REFERENCE_LEG_LENGTH_METERS,
        hipWidth: .28,
        pace: "sprint",
      });
    }
    expect(locomotion.frame.pace).toBe("sprint");
    expect(locomotion.frame.paceBlend).toBeGreaterThan(3.99);
    expect(maximumBlendStep).toBeLessThan(.2);
    expect(maximumStanceStep).toBeLessThan(.04);
  });

  test("impact-scale motor velocity spikes cannot snap the locomotion silhouette", () => {
    const locomotion = createProceduralLocomotion({ poseSpeedResponse: 8 });
    let previousBlend = 0;
    for (let frame = 0; frame < 12; frame += 1) {
      const instantaneousSpeed = frame === 3 ? 12 : frame < 8 ? 1.2 : .4;
      const sample = locomotion.update({
        deltaSeconds: 0.016666666666666666,
        resolvedRootDelta: [0, 0, instantaneousSpeed / 60],
        velocity: [0, 0, instantaneousSpeed],
        facing: [0, 0, 1],
        groundNormal: [0, 1, 0],
        turnRate: 0,
        isGrounded: true,
        legLength: REFERENCE_LEG_LENGTH_METERS,
        hipWidth: .28,
        pace: "sprint",
      });
      expect(Math.abs(sample.paceBlend - previousBlend)).toBeLessThan(.4);
      previousBlend = sample.paceBlend;
      if (frame === 3) {
        expect(sample.speed).toBe(12);
        expect(sample.poseSpeed).toBeLessThan(1.5);
      }
    }
    expect(locomotion.frame.distanceTravelled).toBeCloseTo(0.36666666666666664, 8);
  });

  test("an instantaneous physical reversal cannot flip the stride in one frame", () => {
    const locomotion = createProceduralLocomotion({ travelDirectionResponse: 10 });
    const input = {
      deltaSeconds: 0.03333333333333333,
      resolvedRootDelta: [0, 0, 0.03333333333333333] as const,
      facing: [0, 0, 1] as const,
      groundNormal: [0, 1, 0] as const,
      turnRate: 0,
      isGrounded: true,
      legLength: REFERENCE_LEG_LENGTH_METERS,
      hipWidth: .28,
      pace: "sprint" as const,
    };
    for (let frame = 0; frame < 12; frame += 1) locomotion.update({ ...input, velocity: [0, 0, 1] });
    const before = locomotion.frame.localTravelDirection[2]!;
    const reversed = locomotion.update({ ...input, velocity: [0, 0, -1], resolvedRootDelta: [0, 0, (-0.03333333333333333)] });
    expect(before).toBeGreaterThan(.99);
    expect(reversed.localTravelDirection[2]).toBeGreaterThan(.8);
    for (let frame = 0; frame < 30; frame += 1) locomotion.update({ ...input, velocity: [0, 0, -1], resolvedRootDelta: [0, 0, (-0.03333333333333333)] });
    expect(locomotion.frame.localTravelDirection[2]).toBeLessThan(-.98);
  });

  test("changing the requested pace at unchanged speed preserves the current pose envelope", () => {
    const locomotion = createProceduralLocomotion();
    const speed = getHumanoidLocomotionProfile("walk").speedMetersPerSecond;
    const input = {
      deltaSeconds: 0,
      resolvedRootDelta: [0, 0, 0] as const,
      velocity: [0, 0, speed] as const,
      facing: [0, 0, 1] as const,
      groundNormal: [0, 1, 0] as const,
      turnRate: 0,
      isGrounded: true,
      legLength: REFERENCE_LEG_LENGTH_METERS,
      hipWidth: .28,
    };
    const walk = { ...locomotion.update({ ...input, pace: "walk" }).left };
    const walkBlend = locomotion.frame.paceBlend;
    const sprint = { ...locomotion.update({ ...input, pace: "sprint" }).left };
    expect(locomotion.frame.pace).toBe("sprint");
    expect(locomotion.frame.paceBlend).toBeCloseTo(walkBlend, 8);
    expect(sprint).toEqual(walk);
  });

  test.each([
    ["walk", 1.333],
    ["jog", .933],
    ["sprint", .667],
  ] as const)("%s cadence matches the cooked editor clip", (pace, expectedSeconds) => {
    const profile = getHumanoidLocomotionProfile(pace), locomotion = createProceduralLocomotion();
    const frames = Math.ceil(expectedSeconds * 600);
    for (let frame = 0; frame < frames; frame += 1) {
      const distance = profile.speedMetersPerSecond / 600;
      locomotion.update({
        deltaSeconds: 0.0016666666666666668,
        resolvedRootDelta: [0, 0, distance],
        velocity: [0, 0, profile.speedMetersPerSecond],
        facing: [0, 0, 1],
        groundNormal: [0, 1, 0],
        turnRate: 0,
        isGrounded: true,
        legLength: REFERENCE_LEG_LENGTH_METERS,
        hipWidth: .28,
        pace,
        cycleDistanceScale: profile.cycleDistanceScale,
      });
    }
    expect(locomotion.frame.gaitCycle).toBe(1);
    expect(locomotion.frame.gaitPhase).toBeLessThan(.015);
    expect(profile.cycleSeconds).toBeCloseTo(expectedSeconds, 3);
  });

  test("distance cadence agrees with the catalog foot travel during planted support", () => {
    expect(getHumanoidLocomotionProfile("walk").cycleDistanceScale).toBeCloseTo(1.209, 3);
    expect(getHumanoidLocomotionProfile("jog").cycleDistanceScale).toBeCloseTo(3.041, 3);
    expect(getHumanoidLocomotionProfile("sprint").cycleDistanceScale).toBeCloseTo(3.106, 3);
  });

  test("pace profiles reproduce the editor catalog's stronger stride and torso commitment", () => {
    const sampleRange = (pace: HumanoidLocomotionPace) => {
      const profile = getHumanoidLocomotionProfile(pace), locomotion = createProceduralLocomotion();
      let footMinimum = Infinity, footMaximum = -Infinity, pitchMinimum = Infinity;
      for (let frame = 0; frame < 480; frame += 1) {
        const distance = profile.speedMetersPerSecond / 240;
        const result = locomotion.update({
          deltaSeconds: 0.004166666666666667,
          resolvedRootDelta: [0, 0, distance],
          velocity: [0, 0, profile.speedMetersPerSecond],
          facing: [0, 0, 1],
          groundNormal: [0, 1, 0],
          turnRate: 0,
          isGrounded: true,
          legLength: REFERENCE_LEG_LENGTH_METERS,
          hipWidth: .28,
          pace,
          cycleDistanceScale: profile.cycleDistanceScale,
        });
        if (frame >= 240) {
          footMinimum = Math.min(footMinimum, result.left.footForward);
          footMaximum = Math.max(footMaximum, result.left.footForward);
          pitchMinimum = Math.min(pitchMinimum, result.left.torsoPitch);
        }
      }
      return { footRange: footMaximum - footMinimum, pitchMinimum };
    };
    const walk = sampleRange("walk"), jog = sampleRange("jog"), sprint = sampleRange("sprint");
    expect(jog.footRange).toBeGreaterThan(walk.footRange * 1.7);
    // Sprint_Loop's measured foot envelope is about 1.55x Walk_Loop. Its
    // higher speed comes primarily from cadence and flight, not a 2x reach.
    expect(sprint.footRange).toBeGreaterThan(walk.footRange * 1.5);
    expect(jog.pitchMinimum).toBeGreaterThan(walk.pitchMinimum + .15);
    expect(sprint.pitchMinimum).toBeGreaterThan(jog.pitchMinimum + .15);
  });

  test("support time decreases into the catalog sprint's measured flight phase", () => {
    const walk = getHumanoidLocomotionProfile("walk");
    const jog = getHumanoidLocomotionProfile("jog");
    const run = getHumanoidLocomotionProfile("run");
    const sprint = getHumanoidLocomotionProfile("sprint");
    expect(walk.stanceRatio).toBeGreaterThan(.5);
    expect(jog.stanceRatio).toBeLessThan(walk.stanceRatio);
    expect(run.stanceRatio).toBeLessThan(jog.stanceRatio);
    // Sprint_Loop's alternating contact analysis measures 17.5% support per
    // foot. The remaining overlap-free interval is genuine aerial recovery;
    // extending support to a generic run ratio drags the foot and folds the
    // knee beneath the pelvis.
    expect(sprint.stanceRatio).toBeCloseTo(.175, 3);
  });

  test("sprint foot folds after toe-off, passes the pelvis, and extends into the next contact", () => {
    const profile = getHumanoidLocomotionProfile("sprint"), locomotion = createProceduralLocomotion();
    const at = (phase: number) => {
      locomotion.reset({ gaitPhase: phase });
      return { ...locomotion.update({
        deltaSeconds: 0,
        resolvedRootDelta: [0, 0, 0],
        velocity: [0, 0, profile.speedMetersPerSecond],
        facing: [0, 0, 1],
        groundNormal: [0, 1, 0],
        turnRate: 0,
        isGrounded: true,
        legLength: REFERENCE_LEG_LENGTH_METERS,
        hipWidth: .28,
        pace: "sprint",
        cycleDistanceScale: profile.cycleDistanceScale,
      }).left };
    };
    const extension = at(.375), folded = at(.625), kneeDrive = at(.75), contact = at(.875);
    expect(extension.footForward).toBeLessThan(-.6);
    expect(folded.footForward).toBeGreaterThan(extension.footForward + .5);
    expect(kneeDrive.footForward).toBeGreaterThan(.35);
    expect(contact.footForward).toBeGreaterThan(kneeDrive.footForward);
    expect(extension.footLift).toBeGreaterThan(.4);
    expect(folded.kneeDrive).toBeGreaterThan(.9);
  });

  test("running counter-rotates the pelvis beneath the shoulders", () => {
    const profile = getHumanoidLocomotionProfile("sprint"), locomotion = createProceduralLocomotion();
    locomotion.reset({ gaitPhase: 0 });
    const frame = locomotion.update({
      deltaSeconds: 1,
      resolvedRootDelta: [0, 0, profile.cycleDistanceScale * REFERENCE_LEG_LENGTH_METERS],
      velocity: [0, 0, profile.speedMetersPerSecond],
      facing: [0, 0, 1],
      groundNormal: [0, 1, 0],
      turnRate: 0,
      isGrounded: true,
      legLength: REFERENCE_LEG_LENGTH_METERS,
      hipWidth: .28,
      pace: "sprint",
      cycleDistanceScale: profile.cycleDistanceScale,
    });
    expect(Math.abs(frame.torsoYaw)).toBeGreaterThan(.12);
    expect(Math.sign(frame.pelvisYaw)).toBe(-Math.sign(frame.torsoYaw));
  });
});
