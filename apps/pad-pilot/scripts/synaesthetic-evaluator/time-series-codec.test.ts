import { describe, expect, it } from "bun:test";

import { decodeTimeSeries, encodeTimeSeries } from "./time-series-codec";

describe("time-series codec", () => {
  it("round-trips finite values through compact float32 storage", () => {
    const encoded = encodeTimeSeries([0, 0.125, -12.75, 4_000.5]);

    expect(encoded.byteLength).toBe(16);
    expect(decodeTimeSeries(encoded)).toEqual([0, 0.125, -12.75, 4_000.5]);
  });

  it("rejects values that cannot be plotted or serialized safely", () => {
    expect(() => encodeTimeSeries([0, Number.NaN])).toThrow("finite");
    expect(() => encodeTimeSeries([Number.POSITIVE_INFINITY])).toThrow("finite");
  });
});
