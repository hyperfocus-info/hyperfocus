import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { formatMissingPackageArtifactsMessage, getMissingPackageArtifacts, requiredPackageArtifacts } from "./package-artifacts.ts";

function writeArtifact(rootDir: string, relativePath: string) {
  const target = join(rootDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "");
}

describe("package smoke artifact preflight", () => {
  test("reports exact missing artifacts and rebuild guidance", () => {
    const missingArtifacts = [
      { label: "generated DOM-free core module", relativePath: "dist/core.js" },
      { label: "WASM asset type declaration", relativePath: "wasm/collision-kernel.wasm.d.ts" },
    ];

    expect(formatMissingPackageArtifactsMessage(missingArtifacts)).toBe(
      [
        "package smoke cannot run from a partial engine artifact state.",
        "Missing artifacts:",
        "- generated DOM-free core module: dist/core.js",
        "- WASM asset type declaration: wasm/collision-kernel.wasm.d.ts",
        'Run "bun run build" from ./engine before smoke:package.',
      ].join("\n"),
    );
  });

  test("finds stale generated artifacts before import work", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "catalog-engine-artifacts-"));
    try {
      for (const artifact of requiredPackageArtifacts) {
        if (artifact.relativePath !== "dist/core.js") {
          writeArtifact(rootDir, artifact.relativePath);
        }
      }

      expect(getMissingPackageArtifacts(rootDir)).toEqual([
        { label: "generated DOM-free core module", relativePath: "dist/core.js" },
      ]);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  test("does not accept a directory where a package file is required", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "catalog-engine-artifacts-"));
    try {
      mkdirSync(join(rootDir, "dist", "core.js"), { recursive: true });

      expect(
        getMissingPackageArtifacts(rootDir, [
          { label: "generated DOM-free core module", relativePath: "dist/core.js" },
        ]),
      ).toEqual([{ label: "generated DOM-free core module", relativePath: "dist/core.js" }]);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
