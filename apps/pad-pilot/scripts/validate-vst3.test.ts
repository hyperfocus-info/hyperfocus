import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
  buildPluginvalCommand,
  buildSteinbergValidatorCommand,
  defaultVst3Path,
  parseValidationArgs,
} from "./validate-vst3";

describe("VST3 validation commands", () => {
  it("defaults to both validators at the strongest pluginval level", () => {
    expect(parseValidationArgs([])).toEqual({
      extensive: true,
      pluginPath: "",
      pluginvalPath: "",
      steinbergValidatorPath: "",
      strictness: 10,
      validator: "all",
    });
    expect(buildPluginvalCommand("pluginval", "PadPilot.vst3", 10)).toEqual([
      "pluginval",
      "--strictness-level",
      "10",
      "PadPilot.vst3",
    ]);
    expect(buildSteinbergValidatorCommand("validator", "PadPilot.vst3", true)).toEqual([
      "validator",
      "-e",
      "PadPilot.vst3",
    ]);
    expect(defaultVst3Path("repository")).toBe(path.join(
      "repository",
      "build",
      "plugin",
      "PadPilot_artefacts",
      "Release",
      "VST3",
      "PadPilot.vst3",
    ));
  });

  it("supports targeted local validation without weakening bounds", () => {
    expect(parseValidationArgs([
      "--plugin", "build/debug/PadPilot.vst3",
      "--pluginval", "tools/pluginval.exe",
      "--only", "pluginval",
      "--strictness", "5",
      "--no-extensive",
    ])).toMatchObject({
      extensive: false,
      pluginPath: "build/debug/PadPilot.vst3",
      pluginvalPath: "tools/pluginval.exe",
      strictness: 5,
      validator: "pluginval",
    });
    expect(() => parseValidationArgs(["--strictness", "0"])).toThrow();
    expect(() => parseValidationArgs(["--strictness", "11"])).toThrow();
    expect(() => parseValidationArgs(["--only", "unknown"])).toThrow();
  });
});
