import { describe, expect, it } from "bun:test";
import { buildRecutAutoSlice } from "./auto-slice";

describe("auto-slice", () => {
  it("admits more interesting transients at high density than low density", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      bucketIndex: 0,
      frame: 1200 + index * 2800,
      intensity: 1 - index * 0.07,
    }));

    const lowDensity = buildRecutAutoSlice(candidates, 0, 36000);
    const highDensity = buildRecutAutoSlice(candidates, 1, 36000);

    expect(highDensity.markers.length).toBeGreaterThan(lowDensity.markers.length);
  });

  it("maps sparse auto slices across pads and leaves unused pads empty", () => {
    const autoSlice = buildRecutAutoSlice([
      { bucketIndex: 0, frame: 1000, intensity: 0.95 },
      { bucketIndex: 0, frame: 9000, intensity: 0.95 },
      { bucketIndex: 0, frame: 18000, intensity: 0.95 },
      { bucketIndex: 0, frame: 30000, intensity: 0.95 },
    ], 1, 36000);

    expect(autoSlice.markers).toHaveLength(4);
    expect(autoSlice.markers.map((marker) => marker.padIndex)).toEqual([0, 5, 10, 15]);
    expect(autoSlice.padAssignments.filter((assignment) => !assignment.isEmpty)).toHaveLength(4);
    expect(autoSlice.padAssignments[1]?.isEmpty).toBe(true);
    expect(autoSlice.padAssignments[15]?.isEmpty).toBe(false);
  });

  it("balances dense auto slices into 16 unique buckets", () => {
    const candidates = Array.from({ length: 32 }, (_, index) => ({
      bucketIndex: 0,
      frame: 500 + index * 1500,
      intensity: 1 - index * 0.015,
    }));

    const autoSlice = buildRecutAutoSlice(candidates, 1, 52000);

    expect(autoSlice.markers).toHaveLength(16);
    expect(new Set(autoSlice.markers.map((marker) => marker.startFrame)).size).toBe(16);
    expect(autoSlice.markers[0]!.startFrame).toBeLessThan(autoSlice.markers[15]!.startFrame);
  });
});
