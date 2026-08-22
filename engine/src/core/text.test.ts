import { expect, test } from "bun:test";
import { truncateUtf8, utf8ByteLength } from "./text.ts";

test("UTF-8 helpers preserve code-point boundaries", () => {
  expect(utf8ByteLength("plain")).toBe(5);
  expect(utf8ByteLength("😀")).toBe(4);
  expect(truncateUtf8("a😀b", 5)).toBe("a😀");
  expect(utf8ByteLength(truncateUtf8("😀".repeat(20), 32))).toBe(32);
  expect(() => truncateUtf8("name", -1)).toThrow("maxBytes");
});
