import { describe, expect, it } from "bun:test";
import { compareSemVer, isSemVerInRange, parseSemVer } from "@hyperfocus/pad-pilot/semver";

describe("semver", () => {
  it("compares numeric segments correctly", () => {
    expect(compareSemVer("0.1.9", "0.1.10")).toBeLessThan(0);
    expect(compareSemVer("1.2.0", "1.1.99")).toBeGreaterThan(0);
  });

  it("treats stable releases as newer than prereleases", () => {
    expect(compareSemVer("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareSemVer("1.0.0-alpha.1", "1.0.0-alpha.2")).toBeLessThan(0);
  });

  it("supports inclusive range checks", () => {
    expect(isSemVerInRange("0.1.10", { max: "0.1.10", min: "0.1.9" })).toBe(true);
    expect(isSemVerInRange("0.1.8", { max: "0.1.10", min: "0.1.9" })).toBe(false);
  });

  it("parses missing minor and patch segments as zero", () => {
    expect(parseSemVer("1")?.core).toEqual([1, 0, 0]);
    expect(parseSemVer("1.2")?.core).toEqual([1, 2, 0]);
  });

  it("rejects unsafe or non-canonical numeric identifiers", () => {
    expect(parseSemVer("9007199254740992.0.0")).toBeNull();
    expect(parseSemVer("1.0.0-alpha.01")).toBeNull();
    expect(isSemVerInRange("not-a-version", { max: "2.0.0", min: "1.0.0" })).toBe(false);
  });
});
