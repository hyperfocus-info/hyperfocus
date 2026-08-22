import { expect, test } from "bun:test";
import { truncateUtf8 } from "./text-utils.ts";

test("truncateUtf8 respects byte limits without splitting Unicode code points", () => {
  expect(truncateUtf8("plain", 5)).toBe("plain");
  expect(truncateUtf8("a😀b", 5)).toBe("a😀");
  expect(new TextEncoder().encode(truncateUtf8("😀".repeat(20), 32)).byteLength).toBe(32);
  expect(() => truncateUtf8("name", -1)).toThrow("maxBytes");
});
