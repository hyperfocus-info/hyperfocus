import { expect, test } from "bun:test";
import { addFlags, createBitEnum, createFlags, displayFlags, hasAllFlags, hasAnyFlag, hasFlag, subtractFlags } from "./flags.ts";

test("bit flag helpers combine, check, remove, and display masks", () => {
  const Flags = createBitEnum("READ", "WRITE", "EXECUTE");
  const mask = createFlags(Flags.READ, Flags.EXECUTE);

  expect(Flags.NONE).toBe(0);
  expect(mask).toBe(5);
  expect(addFlags(mask, Flags.WRITE)).toBe(7);
  expect(subtractFlags(mask, Flags.READ)).toBe(4);
  expect(hasFlag(mask, Flags.READ)).toBe(true);
  expect(hasAllFlags(mask, Flags.READ, Flags.EXECUTE)).toBe(true);
  expect(hasAnyFlag(mask, Flags.WRITE, Flags.EXECUTE)).toBe(true);
  expect(displayFlags(mask, Flags)).toBe("READ | EXECUTE");
});
