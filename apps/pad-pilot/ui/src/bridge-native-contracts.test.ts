import { describe, expect, it } from "bun:test";
import { installedModuleResultSchema, parseNativeJson } from "./bridge-native-contracts";

function installedModulePayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    capabilities: ["midi-output", "script-runtime"],
    id: "user-module-2",
    name: "User Module",
    ...overrides,
  });
}

describe("installed Module native response", () => {
  it("accepts identities representable by the native Module store", () => {
    expect(parseNativeJson(installedModuleResultSchema, installedModulePayload(), "module install").id)
      .toBe("user-module-2");
  });

  it("rejects malformed native Module ids and capabilities", () => {
    for (const payload of [
      installedModulePayload({ id: "Module" }),
      installedModulePayload({ id: "module--name" }),
      installedModulePayload({ id: "m".repeat(129) }),
      installedModulePayload({ capabilities: ["midi_output"] }),
      installedModulePayload({ capabilities: ["a".repeat(65)] }),
      installedModulePayload({ capabilities: ["midi-output", "midi-output"] }),
    ]) {
      expect(() => parseNativeJson(installedModuleResultSchema, payload, "module install"))
        .toThrow("PadPilot native module install returned an invalid response.");
    }
  });
});
