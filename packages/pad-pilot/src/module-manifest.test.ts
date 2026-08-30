import { describe, expect, test } from "bun:test";
import {
  definePadPilotModuleManifest,
  validatePadPilotModuleManifest,
} from "./module-manifest";

const validManifest = {
  id: "velocity-tools",
  name: "Velocity Tools",
  version: "1.2.3",
  moduleApiVersion: "0.1.0",
  uiEntry: "ui/ui-entry.js",
  scriptEntry: "script/module.js",
  stateSchemaVersion: 2,
  capabilities: ["controller-input", "module-state"],
  minHostVersion: "0.1.0",
};

describe("PadPilot Module manifest", () => {
  test("normalizes a valid public manifest with bounded defaults", () => {
    expect(definePadPilotModuleManifest(validManifest)).toEqual({
      ...validManifest,
      assets: {},
      migrations: [],
    });
  });

  test("rejects traversal, duplicate grants, invalid semver, and unbounded schema versions", () => {
    for (const candidate of [
      { ...validManifest, uiEntry: "../ui.js" },
      { ...validManifest, capabilities: ["module-state", "module-state"] },
      { ...validManifest, version: "next" },
      { ...validManifest, stateSchemaVersion: 65 },
    ]) {
      const result = validatePadPilotModuleManifest(candidate);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  test("accepts only identity-matched reserved factory entries", () => {
    expect(validatePadPilotModuleManifest({
      ...validManifest,
      id: "fx",
      name: "FX",
      uiEntry: "builtin://factory/fx",
    }).success).toBe(true);
    expect(validatePadPilotModuleManifest({
      ...validManifest,
      id: "velocity-tools",
      uiEntry: "builtin://factory/fx",
    }).success).toBe(false);
  });
});
