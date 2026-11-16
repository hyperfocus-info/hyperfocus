import { describe, expect, test } from "bun:test";
import { IMPACT_FRAME_PRESET_IDS_3D, IMPACT_FRAME_PRESETS_3D, impactFramePreset3D, isImpactFramePresetId3D } from "./impact-frames-3d.ts";

describe("3D impact-frame presets", () => {
  test("covers exact blank frames, scene-derived graphic treatments, and custom art", () => {
    expect(IMPACT_FRAME_PRESET_IDS_3D).toHaveLength(11);
    expect(new Set(IMPACT_FRAME_PRESET_IDS_3D)).toHaveLength(11);
    expect(Object.values(IMPACT_FRAME_PRESETS_3D).map((item) => item.source)).toContain("scene-threshold");
    expect(impactFramePreset3D("edge-anatomy").source).toBe("scene-edges");
    expect(impactFramePreset3D("custom-still").source).toBe("texture");
    expect(isImpactFramePresetId3D("red-contact-burst")).toBe(true);
    expect(() => impactFramePreset3D("generic-flash")).toThrow("Unknown");
  });
});
