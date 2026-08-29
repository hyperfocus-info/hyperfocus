import { expect, test } from "bun:test";
import { shouldPersistStreamingCheckpoint } from "./streaming-checkpoint";

test("streaming checkpoints throttle changing chunks until the interval elapses", () => {
  expect(shouldPersistStreamingCheckpoint({ force: false, hasChanges: true, elapsedMs: 999, intervalMs: 1_000 })).toBe(false);
  expect(shouldPersistStreamingCheckpoint({ force: false, hasChanges: true, elapsedMs: 1_000, intervalMs: 1_000 })).toBe(true);
});

test("streaming checkpoints skip unchanged chunks and allow changed final output", () => {
  expect(shouldPersistStreamingCheckpoint({ force: false, hasChanges: false, elapsedMs: 2_000, intervalMs: 1_000 })).toBe(false);
  expect(shouldPersistStreamingCheckpoint({ force: true, hasChanges: false, elapsedMs: 0, intervalMs: 1_000 })).toBe(false);
  expect(shouldPersistStreamingCheckpoint({ force: true, hasChanges: true, elapsedMs: 0, intervalMs: 1_000 })).toBe(true);
});
