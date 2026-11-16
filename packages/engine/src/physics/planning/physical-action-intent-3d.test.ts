import { describe, expect, test } from "bun:test";
import { planPhysicalActionIntent3D } from "./physical-action-intent-3d.ts";

describe("compressed physical action intent", () => {
  test("plans the same smooth causal phases and articulated drive from the same intent", () => {
    const intent = { frameRate: 30, distanceMeters: 4, speedMetersPerSecond: 30, angularVelocityDegreesPerSecond: [120, 20, 30] as const };
    const first = planPhysicalActionIntent3D(intent), second = planPhysicalActionIntent3D(intent);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ response: "natural", anticipationFrames: 15, travelFrames: 4, contactToleranceFrames: 1, effectorDrive: { supportMode: "auto", contactDistanceMeters: 4, peakSpeedMetersPerSecond: 45 }, step: { speedMetersPerSecond: 5.4, durationFrames: 15 } });
    expect(first.consequenceFrames).toBeGreaterThanOrEqual(15);
    expect(first.recoveryFrames).toBeGreaterThan(first.consequenceFrames);
    expect(first.effectorDrive.orientation).toMatchObject({ mode: "turn", peakAngularSpeedDegreesPerSecond: expect.any(Number) });
    expect(Math.hypot(...first.effectorDrive.orientation!.axisWorld)).toBeCloseTo(1);
  });

  test("keeps automatic phases feasible at their planned actuator speeds", () => {
    for (const response of ["snappy", "natural", "weighty"] as const) {
      const plan = planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: .6, speedMetersPerSecond: 6, angularVelocityDegreesPerSecond: [0, 180, 0], response });
      const drive = plan.effectorDrive, followFrames = Math.min(Math.round(5.3999999999999995), plan.consequenceFrames), returnFrames = plan.consequenceFrames - followFrames;
      for (const [distance, frames] of [[drive.anticipationDistanceMeters, plan.anticipationFrames], [drive.contactDistanceMeters, plan.travelFrames], [drive.followThroughDistanceMeters, followFrames], [drive.recoveryDistanceMeters, returnFrames]] as const) expect(1.5 * distance / (frames / 30)).toBeLessThanOrEqual(drive.peakSpeedMetersPerSecond + 1e-5);
    }
  });

  test("drives the effector across the complete requested contact gap", () => {
    for (const distanceMeters of [.15, .6, 2, 4]) {
      const plan = planPhysicalActionIntent3D({ frameRate: 30, distanceMeters, speedMetersPerSecond: 12, response: "natural" });
      expect(plan.effectorDrive.contactDistanceMeters).toBe(distanceMeters);
    }
  });

  test("scales articulated torque with requested strike speed", () => {
    const slow = planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: .6, speedMetersPerSecond: 4 });
    const fast = planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: .6, speedMetersPerSecond: 24 });
    expect(fast.effectorDrive.maxTorqueImpulse).toBeGreaterThan(slow.effectorDrive.maxTorqueImpulse);
    expect(fast.effectorDrive.maxTorqueImpulse).toBe(6);
  });

  test("makes the default slower than an explicit snappy response and faster than weighty", () => {
    const shared = { frameRate: 30, distanceMeters: 2, speedMetersPerSecond: 12 };
    const snappy = planPhysicalActionIntent3D({ ...shared, response: "snappy" }), natural = planPhysicalActionIntent3D(shared), weighty = planPhysicalActionIntent3D({ ...shared, response: "weighty" });
    expect(snappy.anticipationFrames).toBeLessThan(natural.anticipationFrames);
    expect(natural.anticipationFrames).toBeLessThan(weighty.anticipationFrames);
    expect(snappy.recoveryFrames).toBeLessThan(natural.recoveryFrames);
    expect(natural.recoveryFrames).toBeLessThan(weighty.recoveryFrames);
  });

  test("turns action style into deterministic physical travel rather than a visual label", () => {
    const shared = { frameRate: 30, distanceMeters: .4, speedMetersPerSecond: 8 };
    const straight = planPhysicalActionIntent3D({ ...shared, actionStyle: "straight" }), hook = planPhysicalActionIntent3D({ ...shared, actionStyle: "hook" }), oppositeHook = planPhysicalActionIntent3D({ ...shared, actionStyle: "hook", actionSide: -1 }), weaponSwing = planPhysicalActionIntent3D({ ...shared, actionStyle: "weapon-swing" }), overhand = planPhysicalActionIntent3D({ ...shared, actionStyle: "overhand" }), kick = planPhysicalActionIntent3D({ ...shared, actionStyle: "kick" });
    expect(straight.effectorDrive.path).toBeUndefined();
    expect(hook.effectorDrive.path).toMatchObject({ mode: "arc", plane: "horizontal", side: 1 });
    expect(oppositeHook.effectorDrive.path).toMatchObject({ mode: "arc", plane: "horizontal", side: -1 });
    expect(oppositeHook.effectorDrive.path!.heightMeters).toBe(hook.effectorDrive.path!.heightMeters);
    expect(weaponSwing.effectorDrive.path).toMatchObject({ mode: "arc", plane: "horizontal", side: 1 });
    expect(weaponSwing.effectorDrive.path!.heightMeters).toBeGreaterThan(hook.effectorDrive.path!.heightMeters);
    expect(overhand.effectorDrive.path).toMatchObject({ mode: "arc", plane: "vertical", side: 1 });
    expect(kick.effectorDrive.path).toMatchObject({ mode: "arc", plane: "vertical", side: 1 });
    expect(hook.effectorDrive.peakSpeedMetersPerSecond).toBeGreaterThanOrEqual(straight.effectorDrive.peakSpeedMetersPerSecond);
    expect(planPhysicalActionIntent3D({ ...shared, actionStyle: "hook" })).toEqual(hook);
  });

  test("rejects invalid compact intent instead of emitting broken cues", () => {
    expect(() => planPhysicalActionIntent3D({ frameRate: 0, distanceMeters: 1, speedMetersPerSecond: 2 })).toThrow("frameRate");
    expect(() => planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: 0, speedMetersPerSecond: 2 })).toThrow("distanceMeters");
    expect(() => planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: 1, speedMetersPerSecond: Number.NaN })).toThrow("speedMetersPerSecond");
    expect(() => planPhysicalActionIntent3D({ frameRate: 30, distanceMeters: 1, speedMetersPerSecond: 2, direction: [0, 0, 0] })).toThrow("direction");
    expect(() => Reflect.apply(planPhysicalActionIntent3D, undefined, [{ frameRate: 30, distanceMeters: 1, speedMetersPerSecond: 2, actionSide: 0 }])).toThrow("side");
    expect(() => Reflect.apply(planPhysicalActionIntent3D, undefined, [{ frameRate: 30, distanceMeters: 1, speedMetersPerSecond: 2, response: "instant" }])).toThrow("unsupported");
  });
});
