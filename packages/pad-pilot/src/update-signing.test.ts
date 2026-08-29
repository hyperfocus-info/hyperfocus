import { describe, expect, it } from "bun:test";
import { canonicalizeSignedManifestPayload } from "@hyperfocus/pad-pilot/update-signing";

describe("canonicalizeSignedManifestPayload", () => {
  it("matches JUCE case-insensitive ordinal key ordering without locale collation", () => {
    expect(canonicalizeSignedManifestPayload({
      "2": 2,
      "10": 10,
      Zoo: 1,
      alpha: 2,
      Beta: 3,
      _meta: 4,
      ä: 5,
    })).toBe('{"10":10,"2":2,"_meta":4,"alpha":2,"Beta":3,"Zoo":1,"ä":5}');
  });

  it("applies the same ordering recursively while preserving array order", () => {
    expect(canonicalizeSignedManifestPayload({
      values: [{ z: 1, A: 2 }, { b: 3, a: 4 }],
    })).toBe('{"values":[{"A":2,"z":1},{"a":4,"b":3}]}');
  });

  it("rejects case-insensitive duplicate keys whose C++ order would be ambiguous", () => {
    expect(() => canonicalizeSignedManifestPayload({ A: 1, a: 2 })).toThrow("duplicate keys");
  });
});
