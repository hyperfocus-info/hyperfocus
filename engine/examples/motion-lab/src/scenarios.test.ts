import { describe, expect, test } from "bun:test";
import {
  LAB_SCENARIO_IDS,
  normalizeLabControls,
  resolveLabSignals,
  scenarioFromKeyboard,
  terrainHeightAt,
} from "./scenarios.ts";

describe("motion laboratory scenarios", () => {
  test("all six scenarios resolve deterministic physical velocity requests", () => {
    expect(LAB_SCENARIO_IDS).toEqual(["forward", "backward", "strafe", "aim", "slope", "stairs"]);
    expect(resolveLabSignals("forward", { speedMetersPerSecond: 3 }).desiredVelocity).toEqual([0, 0, 3]);
    expect(resolveLabSignals("backward", { speedMetersPerSecond: 3 }).desiredVelocity).toEqual([0, 0, -2.34]);
    expect(resolveLabSignals("strafe", { speedMetersPerSecond: 3 }).desiredVelocity).toEqual([2.58, 0, 0]);
    expect(resolveLabSignals("aim", { speedMetersPerSecond: 3 }).desiredVelocity).toEqual([0, 0, 0]);
    expect(resolveLabSignals("slope").terrain).toBe("slope");
    expect(resolveLabSignals("stairs").terrain).toBe("stairs");
  });

  test("controls clamp unsafe values and convert aim to radians", () => {
    expect(normalizeLabControls({ aimPitchDegrees: 900, aimYawDegrees: -900, speedMetersPerSecond: 99 })).toEqual({
      aimPitchDegrees: 75,
      aimYawDegrees: -70,
      speedMetersPerSecond: 5,
    });
    const signals = resolveLabSignals("aim", { aimPitchDegrees: 45, aimYawDegrees: -30 });
    expect(signals.aimPitch).toBeCloseTo(Math.PI / 4);
    expect(signals.aimYaw).toBeCloseTo(-Math.PI / 6);
    expect(signals.aimWeight).toBe(1);
  });

  test("terrain samplers produce a 15-degree plane and stable stairs", () => {
    expect(terrainHeightAt("flat", 4, 3)).toBe(0);
    expect(terrainHeightAt("slope", 0, 2)).toBeCloseTo(Math.tan(Math.PI / 12) * 2);
    expect(terrainHeightAt("stairs", 0, 0)).toBe(0);
    expect(terrainHeightAt("stairs", 0, 0.41)).toBeCloseTo(0.12);
    expect(terrainHeightAt("stairs", 0, -0.41)).toBeCloseTo(-0.12);
  });

  test("keyboard shortcuts map only declared laboratory actions", () => {
    expect(scenarioFromKeyboard("KeyW")).toBe("forward");
    expect(scenarioFromKeyboard("KeyS")).toBe("backward");
    expect(scenarioFromKeyboard("KeyD")).toBe("strafe");
    expect(scenarioFromKeyboard("Digit1")).toBe("slope");
    expect(scenarioFromKeyboard("Digit2")).toBe("stairs");
    expect(scenarioFromKeyboard("Escape")).toBeNull();
  });
});
