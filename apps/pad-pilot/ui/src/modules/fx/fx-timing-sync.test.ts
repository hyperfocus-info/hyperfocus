import { describe, expect, it } from "bun:test";
import {
  beatsToTimingValue,
  buildTimingSyncControlKey,
  clampTimingSyncDivisionIndex,
  findNearestTimingSyncDivisionIndex,
  getTimingSyncBeats,
  getTimingSyncLabel,
  parseTimingSyncControlKey,
  timingValueToBeats,
} from "./timing-sync";

describe("FX timing sync helpers", () => {
  it("keeps the legacy note division labels and beat values aligned", () => {
    expect(getTimingSyncLabel(0)).toBe("1/32");
    expect(getTimingSyncLabel(9)).toBe("1/4");
    expect(getTimingSyncLabel(19)).toBe("16 bars");
    expect(getTimingSyncBeats(8)).toBe(0.75);
    expect(getTimingSyncBeats(19)).toBe(64);
  });

  it("round-trips timing values through beats for each supported mode", () => {
    expect(beatsToTimingValue(1, "period-seconds", 120)).toBeCloseTo(0.5, 6);
    expect(beatsToTimingValue(1, "period-ms", 120)).toBeCloseTo(500, 6);
    expect(beatsToTimingValue(1, "period-hz", 120)).toBeCloseTo(2, 6);

    expect(timingValueToBeats(0.5, "period-seconds", 120)).toBeCloseTo(1, 6);
    expect(timingValueToBeats(500, "period-ms", 120)).toBeCloseTo(1, 6);
    expect(timingValueToBeats(2, "period-hz", 120)).toBeCloseTo(1, 6);
  });

  it("snaps free values to the nearest musical division", () => {
    expect(findNearestTimingSyncDivisionIndex(0.52, "period-seconds", 120)).toBe(9);
    expect(findNearestTimingSyncDivisionIndex(335, "period-ms", 120)).toBe(10);
    expect(findNearestTimingSyncDivisionIndex(1.9, "period-hz", 120)).toBe(9);
  });

  it("clamps delay-bearing divisions to their declared native capacity", () => {
    expect(clampTimingSyncDivisionIndex(19, 10)).toBe(10);
    expect(clampTimingSyncDivisionIndex(8.6, 10)).toBe(9);
    expect(clampTimingSyncDivisionIndex(Number.NaN, 10)).toBe(0);
    expect(clampTimingSyncDivisionIndex(19)).toBe(19);
  });

  it("builds and parses synthetic timing control keys", () => {
    const enabledKey = buildTimingSyncControlKey("rateHz", "enabled");
    const divisionKey = buildTimingSyncControlKey("preDelayMs", "division");

    expect(parseTimingSyncControlKey(enabledKey)).toEqual({ controlKey: "rateHz", action: "enabled" });
    expect(parseTimingSyncControlKey(divisionKey)).toEqual({ controlKey: "preDelayMs", action: "division" });
    expect(parseTimingSyncControlKey("rateHz")).toBeNull();
  });
});
