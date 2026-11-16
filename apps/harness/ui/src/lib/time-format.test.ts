import { describe, expect, test } from "bun:test";
import { formatResetCountdown, formatShortTimestamp, resolveBrowserTimezone } from "./time-format";

describe("time formatting", () => {
  test("formats short local timestamp stamps", () => {
    expect(formatShortTimestamp(new Date(2026, 3, 28, 10, 4))).toBe("April 28 '26 - 10:04 AM");
  });

  test("handles empty or invalid timestamps", () => {
    expect(formatShortTimestamp(undefined)).toBe("n/a");
    expect(formatShortTimestamp("not a date")).toBe("n/a");
  });

  test("resolves browser timezone", () => {
    expect(resolveBrowserTimezone()).toBeTruthy();
  });
});

test("account reset countdown distinguishes pending, elapsed and unknown resets", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  expect(formatResetCountdown("2026-11-20T16:00:00Z", now)).toBe("Resets in 5d 4h");
  expect(formatResetCountdown("2026-11-15T13:32:00Z", now)).toBe("Resets in 1h 32m");
  expect(formatResetCountdown("2026-11-15T12:00:01Z", now)).toBe("Resets in 1m");
  expect(formatResetCountdown("2026-11-15T11:00:00Z", now)).toBe("Reset due; refresh usage");
  expect(formatResetCountdown("invalid", now)).toBe("Reset time unavailable");
});
