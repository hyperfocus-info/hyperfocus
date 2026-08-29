import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readApiProfiles, readPackageManifest, readPackedFilePaths, readTarballFilename } from "./json-boundaries.ts";

test("package manifest decoder validates nested release metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "engine-smoke-json-"));
  const path = join(directory, "package.json");
  try {
    writeFileSync(path, JSON.stringify({
      name: "@hyperfocus/engine",
      version: "0.0.1",
      files: ["dist/core.js"],
      exports: { "./core": { import: "./dist/core.js", types: "./dist/core.d.ts" } },
      peerDependencies: { three: "^0.163.0" },
      peerDependenciesMeta: { three: { optional: true } },
    }));
    expect(readPackageManifest(path)).toMatchObject({
      name: "@hyperfocus/engine",
      exports: { "./core": { import: "./dist/core.js" } },
      peerDependenciesMeta: { three: { optional: true } },
    });

    writeFileSync(path, JSON.stringify({ name: "@hyperfocus/engine", version: "0.0.1", exports: { "./core": "./dist/core.js" } }));
    expect(() => readPackageManifest(path)).toThrow("package export ./core must be an object");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("smoke JSON decoders reject malformed dynamic and pack output", () => {
  expect(readApiProfiles({ movement: { status: "stable", proof: "engine-contract", exposure: "root" } }, "profiles")).toEqual({
    movement: { status: "stable", proof: "engine-contract", promotion: undefined, exposure: "root" },
  });
  expect(() => readApiProfiles({ movement: "stable" }, "profiles")).toThrow("profiles.movement must be an object");
  expect(readPackedFilePaths(JSON.stringify([{ files: [{ path: "dist/core.js" }] }]))).toEqual(["dist/core.js"]);
  expect(readTarballFilename(JSON.stringify([{ filename: "hyperfocus-engine.tgz" }]))).toBe("hyperfocus-engine.tgz");
  expect(() => readPackedFilePaths(JSON.stringify([{ files: [{ bytes: 12 }] }]))).toThrow("packed file 0 path");
});
