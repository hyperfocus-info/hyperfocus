import { describe, expect, it } from "bun:test";
import path from "node:path";

import {
  parseBootstrapArguments,
  sha256Bytes,
  validatorToolPaths,
  validatorToolPins,
} from "./bootstrap-vst-validators";

describe("VST validator bootstrap contract", () => {
  it("pins official validator inputs and their integrity identities", () => {
    expect(validatorToolPins.pluginval).toEqual({
      archiveSha256: "c08e61ce3b96db41636f8ec7e76f4c7e2c13ebdac7fa1b5a1f52b4f32ec715ab",
      archiveUrl: "https://github.com/Tracktion/pluginval/releases/download/v1.0.4/pluginval_Windows.zip",
      version: "1.0.4",
    });
    expect(validatorToolPins.steinberg).toMatchObject({
      commit: "3cdf9ca5d1f5b1b21e0a86832aa4abe55607bd96",
      repository: "https://github.com/steinbergmedia/vst3sdk.git",
      tag: "v3.8.1_build_84",
    });
    expect(sha256Bytes(new TextEncoder().encode("PadPilot"))).toBe(
      "55ce1b72ca2562eda2930568c60eb47f6f4162615783f659d9bd3df22ed80afe",
    );
  });

  it("keeps tools inside ignored build output and rejects ambiguous mutation flags", () => {
    const paths = validatorToolPaths("repository");
    expect(paths.root).toBe(path.resolve("repository", "build", "vst-validators"));
    expect(paths.pluginval).toBe(path.join(paths.root, "pluginval", "pluginval.exe"));
    expect(paths.steinberg).toBe(path.join(paths.root, "steinberg", "validator.exe"));
    expect(parseBootstrapArguments([])).toEqual({ force: false });
    expect(parseBootstrapArguments(["--force"])).toEqual({ force: true });
    expect(() => parseBootstrapArguments(["--force", "--force"])).toThrow();
    expect(() => parseBootstrapArguments(["--unknown"])).toThrow();
  });
});
