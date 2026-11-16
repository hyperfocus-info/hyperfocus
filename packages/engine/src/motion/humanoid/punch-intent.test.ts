import { describe, expect, test } from "bun:test";
import { planHumanoidPunchIntent } from "./punch-intent.ts";

describe("humanoid punch intent", () => {
  test("expands target, hand, style, and power into deterministic smooth phases", () => {
    const intent = { target: [1, 1.1, .2] as const, hand: "right" as const, style: "hook" as const, power: 1.2, speedMetersPerSecond: 9 };
    const first = planHumanoidPunchIntent(intent), second = planHumanoidPunchIntent(intent);
    expect(first).toEqual(second);
    expect(first.phases.anticipation).toBeGreaterThan(0);
    expect(first.phases.contact).toBeGreaterThan(first.phases.anticipation);
    expect(first.phases.followThrough).toBeGreaterThan(first.phases.contact);
    expect(first.physical.effectorDrive.path).toMatchObject({ mode: "arc", plane: "horizontal", side: -1 });
  });

  test("rejects invalid compact punch intent", () => {
    expect(() => planHumanoidPunchIntent({ target: [0, Number.NaN, 0] })).toThrow("finite");
    expect(() => planHumanoidPunchIntent({ target: [0, 1, 0], power: 3 })).toThrow("0.1 through 2");
  });
});
