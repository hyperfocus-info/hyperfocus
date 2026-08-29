import { describe, expect, it } from "bun:test";
import { createCapabilityHandle, createSampleCapabilityHandles, publicSampleCapabilities } from "./sample-capabilities";

describe("sample capabilities", () => {
  it("derives stable generic capability handles for any module instance", () => {
    expect(createCapabilityHandle("sample-analysis", "fixture-module")).toBe("fixture-module::sample-analysis::primary");
    expect(createSampleCapabilityHandles("fixture-module")).toEqual({
      haptics: "fixture-module::haptics::primary",
      sampleAnalysis: "fixture-module::sample-analysis::primary",
      sampleSource: "fixture-module::sample-source::primary",
      slicePlayback: "fixture-module::slice-playback::primary",
    });
  });

  it("exposes the public nested capability API expected by user modules", () => {
    expect(typeof publicSampleCapabilities.sampleSource.create).toBe("function");
    expect(typeof publicSampleCapabilities.sampleAnalysis.requestTransientSlices).toBe("function");
    expect(typeof publicSampleCapabilities.slicePlayback.applyState).toBe("function");
    expect(typeof publicSampleCapabilities.haptics.pulse).toBe("function");
  });
});
