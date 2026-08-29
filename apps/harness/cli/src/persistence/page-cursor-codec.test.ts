import { expect, test } from "bun:test";
import { BOUNDED_PAGE_CURSOR_MAX_LENGTH } from "@hyperfocus/ai-core/protocol";
import { decodePageCursor, encodePageCursor } from "./page-cursor-codec";

test("page cursor codec rejects malformed, oversized, foreign, and versioned envelopes", () => {
  const identity = { scope: "test", owner: "one" };
  expect(() => decodePageCursor({ encoded: "%%%", identity })).toThrow("Invalid or stale");
  expect(() => decodePageCursor({ encoded: "x".repeat(BOUNDED_PAGE_CURSOR_MAX_LENGTH + 1), identity })).toThrow("exceeds");
  const cursor = encodePageCursor({ identity, position: ["a"] });
  expect(decodePageCursor({ encoded: cursor, identity })).toEqual(["a"]);
  expect(() => decodePageCursor({ encoded: cursor, identity: { ...identity, owner: "two" } })).toThrow("does not match");
  const future = Buffer.from(JSON.stringify({ version: 2, ...identity, position: [] })).toString("base64url");
  expect(() => decodePageCursor({ encoded: future, identity })).toThrow("does not match");
});
