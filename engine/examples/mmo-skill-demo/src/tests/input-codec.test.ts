import { expect, test } from "bun:test";
import { mmoSkillDemoInputCodec } from "../input-codec.ts";

test("MMO skill demo binary input codec round-trips hot movement input", () => {
  const decoded = mmoSkillDemoInputCodec.decode(
    mmoSkillDemoInputCodec.encode({
      action: "space",
      dx: 1,
      dy: -0.5,
      aimX: 120.25,
      aimY: 80.5
    })
  );

  expect(decoded.action).toBe("space");
  expect(decoded.dx).toBeCloseTo(1, 2);
  expect(decoded.dy).toBeCloseTo(-0.5, 2);
  expect(decoded.aimX).toBeCloseTo(120.25, 4);
  expect(decoded.aimY).toBeCloseTo(80.5, 4);
});

test("MMO skill demo binary input codec keeps rare string payloads out of JSON", () => {
  const decoded = mmoSkillDemoInputCodec.decode(
    mmoSkillDemoInputCodec.encode({
      action: "config",
      targetId: "npc-rowan",
      itemId: "glade-berries",
      devField: "weapon",
      devText: "bow",
      devValue: 2
    })
  );

  expect(decoded).toMatchObject({
    action: "config",
    targetId: "npc-rowan",
    itemId: "glade-berries",
    devField: "weapon",
    devText: "bow",
    devValue: 2
  });
});
