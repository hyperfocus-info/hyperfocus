import { describe, expect, test } from "bun:test";
import {
  bumpPatchVersion,
  findPackageVersionViolations,
  findRepositoryReleaseViolations,
  parsePackageManifestVersion,
} from "./release-readiness";

describe("release readiness policy", () => {
  test("keeps all versioned manifests on the root SemVer", () => {
    expect(findPackageVersionViolations([
      { path: "package.json", name: "hyperfocus", version: "0.0.1" },
      { path: "apps/harness/package.json", name: "@hyperfocus/harness", version: "0.0.1" },
    ])).toEqual([]);

    expect(findPackageVersionViolations([
      { path: "package.json", name: "hyperfocus", version: "0.0.1" },
      { path: "apps/harness/package.json", name: "@hyperfocus/harness", version: "0.0.2" },
      { path: "packages/ui/package.json", name: "@hyperfocus/ui", version: "0.0.1-beta.1" },
    ])).toEqual([
      "apps/harness/package.json uses 0.0.2; expected 0.0.1 to match package.json",
      "packages/ui/package.json uses 0.0.1-beta.1; release manifests must use plain x.y.z SemVer",
    ]);
  });

  test("rejects stranded release files outside the monorepo layout", () => {
    expect(findRepositoryReleaseViolations([
      "packages/engine/src/index.ts",
      "audit/editor-first-100/report.md",
      "engine/src/index.ts",
      "packages/plugin/.git/config",
    ], ["vendor/child"])).toEqual([
      "audit/editor-first-100/report.md is audit output; keep audit evidence under ignored .local/audit/",
      "engine/src/index.ts is stranded legacy engine content; use packages/engine/",
      "packages/plugin/.git/config contains nested Git metadata",
      "vendor/child is a Git submodule; fold child repositories into the monorepo before release",
    ]);
  });

  test("parses and bumps plain patch versions", () => {
    expect(parsePackageManifestVersion("package.json", { name: "hyperfocus", version: "0.0.1" })).toEqual({
      path: "package.json",
      name: "hyperfocus",
      version: "0.0.1",
    });
    expect(bumpPatchVersion("0.0.1")).toBe("0.0.2");
    expect(() => bumpPatchVersion("0.0.1-beta.1")).toThrow("Expected a plain x.y.z SemVer version");
  });
});
