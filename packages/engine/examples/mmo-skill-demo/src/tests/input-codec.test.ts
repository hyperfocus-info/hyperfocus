import { expect, test } from "bun:test";
import { mmoSkillDemoInputCodec } from "../input-codec.ts";

test("MMO input codec decodes borrowed ranges without a payload copy or view", () => {
  const encoded = mmoSkillDemoInputCodec.encode({
    action: "interact",
    dx: -0.5,
    dy: 0.25,
    aimX: 12,
    aimY: -4,
    targetId: "sentinél-一"
  });
  const framed = new Uint8Array(encoded.byteLength + 9);
  framed.set(encoded, 4);

  expect(mmoSkillDemoInputCodec.decodeRange?.(framed, 4, encoded.byteLength)).toEqual(
    mmoSkillDemoInputCodec.decode(encoded)
  );
  expect(() => mmoSkillDemoInputCodec.decodeRange?.(framed, 4, encoded.byteLength + 1)).toThrow("trailing bytes");
});

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
