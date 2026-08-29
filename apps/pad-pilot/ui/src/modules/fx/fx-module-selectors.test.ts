import { describe, expect, it } from "bun:test";
import { buildFxPresetItems, calculateFxPeakMatchedOutputGain, filterFxPresetCatalogItems } from "./fx-module-selectors";

describe("FX module selectors", () => {
  it("derives searchable preset taxonomy while preserving manifest metadata", () => {
    const items = buildFxPresetItems([
      {
        id: "utility-bass-mono-safe-light",
        name: "Bass · Mono Safe · Light",
        category: "utility",
        description: "center low frequencies",
        intensity: "light",
        jobs: ["improve mono translation"],
        sources: ["808 bass"],
        tags: ["low-end"],
      },
      { id: "curated-1980s-juno-wide-pad", name: "1980s · Juno Wide Pad" },
      { id: "user-1", name: "My Chain" },
    ], ["utility-bass-mono-safe-light"]);

    expect(items[0]).toMatchObject({ category: "utility", favorite: true, kind: "factory" });
    expect(items[0]?.keywords).toEqual(["low-end", "808 bass", "improve mono translation", "light"]);
    expect(items[1]?.category).toBe("era");
    expect(items[2]).toMatchObject({ category: undefined, kind: "user" });
  });

  it("filters preset categories and favorites independently", () => {
    const items = [
      { category: "utility", favorite: true, id: "utility-favorite", kind: "factory" },
      { category: "utility", favorite: false, id: "utility-other", kind: "factory" },
      { category: "era", favorite: true, id: "era-favorite", kind: "factory" },
      { favorite: true, id: "user-favorite", kind: "user" },
    ];

    expect(filterFxPresetCatalogItems(items, "utility", false).map((item) => item.id)).toEqual(["utility-favorite", "utility-other"]);
    expect(filterFxPresetCatalogItems(items, "utility", true).map((item) => item.id)).toEqual(["utility-favorite"]);
    expect(filterFxPresetCatalogItems(items, "user", false).map((item) => item.id)).toEqual(["user-favorite"]);
    expect(filterFxPresetCatalogItems(items, "all", true).map((item) => item.id)).toEqual(["utility-favorite", "era-favorite", "user-favorite"]);
  });

  it("calculates bounded peak-match output gain and rejects silent telemetry", () => {
    const cases = [
      { input: -12, output: -9, current: 0, expected: -3 },
      { input: -6, output: -18, current: 10, expected: 18 },
      { input: -30, output: -10, current: -10, expected: -18 },
    ];

    for (const testCase of cases) {
      expect(calculateFxPeakMatchedOutputGain(testCase.input, testCase.output, testCase.current)).toBe(testCase.expected);
    }
    expect(calculateFxPeakMatchedOutputGain(-120, -12, 0)).toBeNull();
    expect(calculateFxPeakMatchedOutputGain(-12, Number.NaN, 0)).toBeNull();
  });
});
