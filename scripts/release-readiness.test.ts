import { afterEach, describe, expect, test } from "bun:test";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  bumpPatchVersion,
  discoverVersionedManifests,
  findPackageVersionViolations,
  findRepositoryReleaseViolations,
  parsePackageManifestVersion,
  readVersionedManifestVersions,
} from "./release-readiness";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyperfocus-version-policy-"));
  temporaryRoots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "fixture", version: "0.0.1", private: true, workspaces: ["apps/*", "packages/*"],
  }));
  await Promise.all([mkdir(path.join(root, "apps")), mkdir(path.join(root, "packages"))]);
  return root;
}

async function addWorkspace(root: string, name: string, manifest: unknown) {
  await mkdir(path.join(root, "packages", name));
  await writeFile(path.join(root, "packages", name, "package.json"), JSON.stringify(manifest));
}

describe("release readiness policy", () => {
  test("workspace wildcard discovery excludes transient dot directories", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "apps", ".local"));
    await addWorkspace(root, ".cache", { name: "transient", version: "not-a-version" });
    await addWorkspace(root, "real", { name: "real", version: "0.0.1" });
    expect(await discoverVersionedManifests({ root })).toEqual(["package.json", "packages/real/package.json"]);
    expect(findPackageVersionViolations(await readVersionedManifestVersions(root))).toEqual([]);
  });
  test("hidden workspace links still fail closed", async () => {
    const root = await createWorkspace();
    const target = path.join(root, "target");await mkdir(target);
    await symlink(target, path.join(root, "apps", ".linked"), "junction");
    await expect(discoverVersionedManifests({ root })).rejects.toThrow("must not be a symbolic link");
  });
  test("discovers new workspaces, including private tooling, without updating a registry", async () => {
    const root = await createWorkspace();
    await addWorkspace(root, "new-runtime", { name: "new-runtime", version: "0.0.2" });
    await addWorkspace(root, "private-tool", { name: "private-tool", version: "0.0.2", private: true });
    expect(await discoverVersionedManifests({ root })).toEqual([
      "package.json", "packages/new-runtime/package.json", "packages/private-tool/package.json",
    ]);
    expect(findPackageVersionViolations(await readVersionedManifestVersions(root))).toEqual([
      "packages/new-runtime/package.json uses 0.0.2; expected 0.0.1 to match package.json",
      "packages/private-tool/package.json uses 0.0.2; expected 0.0.1 to match package.json",
    ]);
  });

  test("rejects a workspace directory with a missing or malformed manifest", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "packages", "broken"));
    await expect(readVersionedManifestVersions(root)).rejects.toThrow();
    const manifestPath = path.join(root, "packages", "broken", "package.json");
    await writeFile(manifestPath, "{");
    await expect(readVersionedManifestVersions(root)).rejects.toThrow();
    await writeFile(manifestPath, JSON.stringify({ name: "broken" }));
    await expect(readVersionedManifestVersions(root)).rejects.toThrow("needs a package version");
  });

  test("rejects missing and unsupported workspace declarations", async () => {
    const root = await createWorkspace();
    const manifestPath = path.join(root, "package.json");
    await writeFile(manifestPath, JSON.stringify({ name: "fixture", version: "0.0.1" }));
    await expect(discoverVersionedManifests({ root })).rejects.toThrow("needs a non-empty workspaces array");
    await writeFile(manifestPath, JSON.stringify({ workspaces: ["../outside/*"] }));
    await expect(discoverVersionedManifests({ root })).rejects.toThrow("Unsupported workspace pattern");
  });

  test("the bump command updates discovered packages and rejects invalid versions before writing", async () => {
    const root = await createWorkspace();
    await addWorkspace(root, "new-runtime", { name: "new-runtime", version: "0.0.1" });
    await addWorkspace(root, "private-tool", { name: "private-tool", version: "0.0.1", private: true });
    const script = path.join(import.meta.dir, "bump-patch-version.ts");
    const invalid = spawnBackgroundProcessSync({
      cmd: [process.execPath, script, "--version=invalid"], cwd: root, stdout: "pipe", stderr: "pipe",
    });
    expect(invalid.exitCode).not.toBe(0);
    expect((await readVersionedManifestVersions(root)).map((manifest) => manifest.version)).toEqual(["0.0.1", "0.0.1", "0.0.1"]);
    const result = spawnBackgroundProcessSync({ cmd: [process.execPath, script], cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
    expect((await readVersionedManifestVersions(root)).map((manifest) => manifest.version)).toEqual(["0.0.2", "0.0.2", "0.0.2"]);
    expect(JSON.parse(await readFile(path.join(root, "packages/private-tool/package.json"), "utf8")).private).toBe(true);
  });

  test("the bump command validates every workspace before modifying any manifest", async () => {
    const root = await createWorkspace();
    await addWorkspace(root, "broken", { name: "broken" });
    const result = spawnBackgroundProcessSync({
      cmd: [process.execPath, path.join(import.meta.dir, "bump-patch-version.ts")], cwd: root, stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version).toBe("0.0.1");
  });

  test("keeps all versioned manifests on the root SemVer", () => {
    expect(findPackageVersionViolations([
      { path: "package.json", name: "hyperfocus", version: "0.0.1" },
      { path: "apps/harness/package.json", name: "@hyperfocus-info/harness", version: "0.0.1" },
    ])).toEqual([]);

    expect(findPackageVersionViolations([
      { path: "package.json", name: "hyperfocus", version: "0.0.1" },
      { path: "apps/harness/package.json", name: "@hyperfocus-info/harness", version: "0.0.2" },
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
