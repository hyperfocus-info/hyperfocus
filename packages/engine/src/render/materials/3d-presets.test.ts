import { describe, expect, test } from "bun:test";
import { MATERIAL_PRESETS_3D, applyMaterialPreset3D, materialPreset3D, sampleMaterialTransition3D, searchMaterialPresets3D } from "./3d-presets.ts";

describe("3D material presets", () => {
  test("ships a broad, unique bank across every style family", () => {
    expect(MATERIAL_PRESETS_3D.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MATERIAL_PRESETS_3D.map((item) => item.id)).size).toBe(MATERIAL_PRESETS_3D.length);
    for (const family of ["fantasy", "realistic", "retro", "toon", "photoreal", "effects"] as const) expect(searchMaterialPresets3D({ families: [family] }).length).toBeGreaterThanOrEqual(4);
  });

  test("searches, applies, and samples portable looks", () => {
    expect(searchMaterialPresets3D({ query: "car vehicle" }).map((item) => item.id)).toContain("automotive-paint");
    expect(applyMaterialPreset3D({ roughness: 1 }, "royal-gold")).toMatchObject({ metallic: 1, roughness: 0.18, shading: "lit" });
    expect(applyMaterialPreset3D({}, "clean-glass").alphaMode).toBe("blend");
    const halfway = sampleMaterialTransition3D({ from: materialPreset3D("aged-iron").look, to: materialPreset3D("hologram-blue").look, progress: 0.5 });
    expect(halfway.shader).toBe("hologram");
    expect(halfway.metallic).toBeCloseTo(0.525);
    expect(() => materialPreset3D("missing")).toThrow("Unknown 3D material preset");
  });
});
