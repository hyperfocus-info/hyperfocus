import { describe, expect, it } from "bun:test";
import { base64ToBytes, jsonToBase64, textToBase64 } from "./base64";

describe("base64 payload helpers", () => {
  it("encodes UTF-8 text and JSON through one canonical boundary", () => {
    expect(new TextDecoder().decode(base64ToBytes(textToBase64("PadPilot 🎛️")))).toBe("PadPilot 🎛️");
    expect(new TextDecoder().decode(base64ToBytes(jsonToBase64({ enabled: true })))).toBe('{"enabled":true}');
  });

  it("rejects values JSON cannot serialize", () => {
    expect(() => jsonToBase64(undefined)).toThrow("non-serializable JSON value");
  });
});
