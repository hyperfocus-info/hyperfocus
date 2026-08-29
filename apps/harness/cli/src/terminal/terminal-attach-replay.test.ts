import { expect, test } from "bun:test";
import { createTerminalAttachReplay } from "../server/transport/attach-ownership";

test("replays only terminal output produced after the attach snapshot", () => {
  const replay = createTerminalAttachReplay();
  replay.register("owner", "session", new Date(Date.now() + 1_000).toISOString());
  replay.appended("session", "-gap");

  expect(replay.take("owner")).toBe("-gap");
  expect(replay.take("owner")).toBeUndefined();
});

test("keeps concurrent attempts distinct across normalized output", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  replay.register("first", "session", expiresAt); replay.appended("session", "a\r\n😀");
  replay.register("second", "session", expiresAt); replay.appended("session", "b\r\n");
  expect(replay.take("first")).toBe("a\r\n😀b\r\n");
  expect(replay.take("second")).toBe("b\r\n");
});

test("failed upgrade revocation removes only that attempt", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  replay.register("failed", "session", expiresAt); replay.register("valid", "session", expiresAt);
  replay.revoke("failed"); replay.appended("session", "tail");
  expect(replay.take("failed")).toBeUndefined();
  expect(replay.take("valid")).toBe("tail");
});

test("shares one bounded replay log across the maximum concurrent attempts", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  for (let index = 0; index < 256; index += 1) replay.register(`owner-${index}`, "session", expiresAt);
  const retained = "😀".repeat(400_000);
  replay.appended("session", retained);
  expect(replay.take("owner-0")).toBe(retained);
  replay.appended("session", "x".repeat(400_001));
  expect(replay.take("owner-255")).toBeUndefined();
});

test("one noisy session cannot expire another session replay", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  replay.register("noisy", "session-a", expiresAt); replay.register("quiet", "session-b", expiresAt);
  replay.appended("session-b", "exact\r\n😀");
  replay.appended("session-a", "x".repeat(2_000_001));
  expect(replay.take("noisy")).toBeUndefined();
  expect(replay.take("quiet")).toBe("exact\r\n😀");
});

test("global replay pressure evicts only least-recently-used session owners", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  for (let index = 0; index < 5; index += 1) {
    replay.register(`owner-${index}`, `session-${index}`, expiresAt);
    replay.appended(`session-${index}`, "😀".repeat(450_000));
  }
  expect(replay.take("owner-0")).toBeUndefined();
  expect(replay.take("owner-4")).toBe("😀".repeat(450_000));
});

test("appends many small chunks without rebuilding retained replay", () => {
  const replay = createTerminalAttachReplay(), expiresAt = new Date(Date.now() + 1_000).toISOString();
  replay.register("many", "session", expiresAt);
  for (let index = 0; index < 10_000; index += 1) replay.appended("session", `${index % 10}`);
  expect(replay.retainedChunkCount("session")).toBe(1);
  expect(replay.take("many")).toBe("0123456789".repeat(1_000));
});
