import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  parseBrowserProofOptions,
  validateAcceptanceEntries,
  type BrowserAcceptanceEntry,
} from "./browser-proof.ts";

function entry(overrides: Partial<BrowserAcceptanceEntry> = {}): BrowserAcceptanceEntry {
  return {
    fixture: "canonical",
    scenario: "forward",
    capabilities: { leftFootPlanting: true, rightFootPlanting: true },
    metrics: {
      footSlipMeters: 0.019999,
      nanCount: 0,
      plantedVerticalErrorMeters: 1e-4,
    },
    poseChecksums: { aim: "abc", front: "abc", side: "abc" },
    ...overrides,
  };
}

describe("motion-lab browser proof", () => {
  test("parses deterministic artifact defaults and explicit overrides", () => {
    const defaults = parseBrowserProofOptions([], "C:\\workspace");
    expect(defaults.steps).toBe(180);
    expect(defaults.skipBuild).toBe(false);
    expect(defaults.outDir).toBe(path.resolve("C:\\workspace", ".local", "motion-lab"));

    const explicit = parseBrowserProofOptions([
      "--steps", "240",
      "--out-dir", "artifacts/proof",
      "--no-build",
      "--chrome", "tools/chrome.exe",
    ], "C:\\workspace");
    expect(explicit.steps).toBe(240);
    expect(explicit.skipBuild).toBe(true);
    expect(explicit.outDir).toBe(path.resolve("C:\\workspace", "artifacts/proof"));
    expect(explicit.chromePath).toBe(path.resolve("C:\\workspace", "tools/chrome.exe"));
  });

  test("accepts the strict slip threshold and inclusive vertical threshold", () => {
    expect(validateAcceptanceEntries([entry()])).toEqual([]);
    expect(validateAcceptanceEntries([entry({
      fixture: "incomplete",
      capabilities: { leftFootPlanting: false, rightFootPlanting: false },
      metrics: { footSlipMeters: null, nanCount: 0, plantedVerticalErrorMeters: null },
    })])).toEqual([]);
  });

  test("reports every numeric gate without short-circuiting", () => {
    const failures = validateAcceptanceEntries([entry({
      fixture: "ape-proportions",
      scenario: "stairs",
      metrics: {
        footSlipMeters: 0.02,
        nanCount: 2,
        plantedVerticalErrorMeters: 0.000101,
      },
    })]);
    expect(failures).toHaveLength(3);
    expect(failures.join("\n")).toContain("2 non-finite");
    expect(failures.join("\n")).toContain("not below 0.02m");
    expect(failures.join("\n")).toContain("planted vertical error");
  });

  test("rejects missing contact metrics only when a foot solver is enabled", () => {
    const failures = validateAcceptanceEntries([entry({
      capabilities: { leftFootPlanting: true, rightFootPlanting: false },
      metrics: { footSlipMeters: null, nanCount: 0, plantedVerticalErrorMeters: null },
    })]);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("foot-slip metric missing");
    expect(failures[1]).toContain("vertical-error metric missing");
  });

  test("rejects malformed CLI values", () => {
    expect(() => parseBrowserProofOptions(["--steps", "0"])).toThrow("positive integer");
    expect(() => parseBrowserProofOptions(["--wat"])).toThrow("Unknown motion-lab browser-proof option");
  });
});
