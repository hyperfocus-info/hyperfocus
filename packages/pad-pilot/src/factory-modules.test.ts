import { describe, expect, it } from "bun:test";
import { factoryModuleCatalog, getFactoryModule } from "@hyperfocus/pad-pilot/factory-modules";

describe("factory module catalog", () => {
  it("owns the complete unique factory inventory", () => {
    expect(factoryModuleCatalog.map((module) => module.id)).toEqual([
      "fx",
      "recut",
      "generator",
      "editor",
      "performance",
      "analyzer",
    ]);
    expect(new Set(factoryModuleCatalog.map((module) => module.uiEntry)).size).toBe(factoryModuleCatalog.length);
  });

  it("resolves a factory manifest from its stable id", () => {
    expect(getFactoryModule("performance")).toMatchObject({
      name: "Performance",
      uiEntry: "builtin://factory/performance",
    });
    expect(() => getFactoryModule("missing")).toThrow("Unknown factory Module");
  });
});
