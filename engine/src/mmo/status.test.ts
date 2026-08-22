import { expect, test } from "bun:test";
import {
  addMmoStatus,
  consumeMmoStatusStack,
  hasMmoStatus,
  hasMmoStatusBit,
  mmoStatusBitmask,
  mmoStatusStacks,
  removeMmoStatus,
  setMmoStatusStacks,
  tickMmoStatusBag
} from "./index.ts";

test("compact status tokens support flags and stacks", () => {
  let value = "";
  value = addMmoStatus(value, "shielded", { maxLength: 32 });
  value = addMmoStatus(value, "shielded", { maxLength: 32 });
  value = setMmoStatusStacks(value, "hex", 3, { maxLength: 32 });

  expect(hasMmoStatus(value, "shielded")).toBe(true);
  expect(mmoStatusStacks(value, "hex")).toBe(3);

  const consumed = consumeMmoStatusStack(value, "hex");
  expect(consumed.consumed).toBe(true);
  expect(mmoStatusStacks(consumed.value, "hex")).toBe(2);
  expect(removeMmoStatus(consumed.value, "shielded")).not.toContain("shielded");
});

test("structured status bag ticks finite durations", () => {
  const statuses = {
    haste: { id: "haste", durationMs: 50 },
    stance: { id: "stance" }
  };

  tickMmoStatusBag(statuses, 60);

  expect(statuses.haste).toBeUndefined();
  expect(statuses.stance).toEqual({ id: "stance" });
});

test("status tokens can be read as exact and prefix bitmasks", () => {
  const bits = { weakened: 1 << 0, enfeebled: 1 << 1, hex: 1 << 2 };
  const mask = mmoStatusBitmask("weakened|hex:3", { exact: { weakened: bits.weakened, enfeebled: bits.enfeebled }, prefixes: { hex: bits.hex } });

  expect(hasMmoStatusBit(mask, bits.weakened)).toBe(true);
  expect(hasMmoStatusBit(mask, bits.hex)).toBe(true);
  expect(hasMmoStatusBit(mask, bits.enfeebled)).toBe(false);
});

test("status bitmask prefix matching does not match exact tokens", () => {
  const bits = { weakened: 1 << 0 };
  const exactOnly = mmoStatusBitmask("weakened:2", { exact: { weakened: bits.weakened } });
  const prefixOnly = mmoStatusBitmask("weakened", { prefixes: { weakened: bits.weakened } });

  expect(hasMmoStatusBit(exactOnly, bits.weakened)).toBe(false);
  expect(hasMmoStatusBit(prefixOnly, bits.weakened)).toBe(false);
});

test("status helpers reject non-finite stacks and durations without creating immortal state", () => {
  expect(setMmoStatusStacks("shielded", "hex", Number.NaN)).toBe("shielded");
  expect(setMmoStatusStacks("shielded", "hex", Number.POSITIVE_INFINITY)).toBe("shielded");
  expect(hasMmoStatusBit(0, 0)).toBe(false);

  const statuses = {
    corrupt: { id: "corrupt", durationMs: Number.NaN },
    valid: { id: "valid", durationMs: 50 }
  };
  tickMmoStatusBag(statuses, Number.NaN);

  expect(statuses.corrupt).toBeUndefined();
  expect(statuses.valid?.durationMs).toBe(50);
});

test("status token length limits retain only complete tokens", () => {
  let value = addMmoStatus("", "first", { maxLength: 8 });
  value = addMmoStatus(value, "second", { maxLength: 8 });

  expect(value).toBe("second");
  expect(hasMmoStatus(value, "second")).toBe(true);
  expect(hasMmoStatus(value, "sec")).toBe(false);
});

test("status stacks support prefixes containing colons and remain exact", () => {
  const value = setMmoStatusStacks("shielded", "damage:fire", 3);

  expect(mmoStatusStacks(value, "damage:fire")).toBe(3);
  expect(consumeMmoStatusStack(value, "damage:fire").value).toContain("damage:fire:2");
  expect(setMmoStatusStacks(value, "damage:fire", Number.MAX_SAFE_INTEGER + 1)).toBe("shielded");
});

test("status durations accumulate fractional milliseconds", () => {
  const statuses = { haste: { id: "haste", durationMs: 1 } };

  tickMmoStatusBag(statuses, 0.4);
  tickMmoStatusBag(statuses, 0.4);
  expect(statuses.haste?.durationMs).toBeCloseTo(0.2);
  tickMmoStatusBag(statuses, 0.2);
  expect(statuses.haste).toBeUndefined();
});
