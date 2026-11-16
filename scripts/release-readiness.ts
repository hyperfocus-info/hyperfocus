import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface PackageManifestVersion {
  path: string;
  name: string;
  version: string;
}

export function normalizeRepositoryPath(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function parsePackageManifestVersion(filePath: string, input: unknown): PackageManifestVersion {
  if (!isRecord(input)) throw new Error(`${filePath} must contain a JSON object`);
  if (typeof input.name !== "string" || input.name.trim().length === 0) throw new Error(`${filePath} needs a package name`);
  if (typeof input.version !== "string" || input.version.trim().length === 0) throw new Error(`${filePath} needs a package version`);
  return { path: normalizeRepositoryPath(filePath), name: input.name, version: input.version };
}

export function bumpPatchVersion(version: string) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Expected a plain x.y.z SemVer version, got ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function findPackageVersionViolations(manifests: readonly PackageManifestVersion[]) {
  const violations: string[] = [];
  const expected = manifests.find((manifest) => manifest.path === "package.json")?.version;
  if (!expected) return ["package.json must be part of the versioned manifest set"];

  for (const manifest of manifests) {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      violations.push(`${manifest.path} uses ${manifest.version}; release manifests must use plain x.y.z SemVer`);
      continue;
    }
    if (manifest.version !== expected) {
      violations.push(`${manifest.path} uses ${manifest.version}; expected ${expected} to match package.json`);
    }
  }
  return violations;
}

export function findRepositoryReleaseViolations(paths: readonly string[], submodulePaths: readonly string[] = []) {
  const violations: string[] = [];
  const normalizedPaths = paths.map(normalizeRepositoryPath);

  for (const filePath of normalizedPaths) {
    if (filePath === "audit" || filePath.startsWith("audit/")) {
      violations.push(`${filePath} is audit output; keep audit evidence under ignored .local/audit/`);
    }
    if (filePath === "engine" || filePath.startsWith("engine/")) {
      violations.push(`${filePath} is stranded legacy engine content; use packages/engine/`);
    }
    if (filePath.includes("/.git/") || filePath.endsWith("/.git") || filePath === ".git") {
      violations.push(`${filePath} contains nested Git metadata`);
    }
  }

  for (const submodulePath of submodulePaths.map(normalizeRepositoryPath)) {
    violations.push(`${submodulePath} is a Git submodule; fold child repositories into the monorepo before release`);
  }

  return violations;
}

export async function discoverVersionedManifests({ root = process.cwd() } = {}) {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (!isRecord(manifest) || !Array.isArray(manifest.workspaces) || manifest.workspaces.length === 0) {
    throw new Error("package.json needs a non-empty workspaces array");
  }
  const manifests = new Set(["package.json"]);
  for (const workspace of manifest.workspaces) {
    if (typeof workspace === 'string' && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/.test(workspace)) {
      const parts = workspace.split('/');
      for (let index = 1; index <= parts.length; index++) {
        const directory = parts.slice(0, index).join('/');
        const info = await lstat(path.join(root, directory));
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Workspace ${directory} must be a directory, not a symbolic link`);
      }
      manifests.add(`${workspace}/package.json`);
      continue;
    }
    // Fail closed if workspace syntax changes instead of silently skipping versioned packages.
    if (typeof workspace !== "string" || !/^[a-zA-Z0-9_-]+\/\*$/.test(workspace)) {
      throw new Error(`Unsupported workspace pattern ${JSON.stringify(workspace)}; version discovery supports directory/* and explicit nested directories`);
    }
    const directory = workspace.slice(0, -2);
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`Workspace ${directory}/${entry.name} must not be a symbolic link`);
      // directory/* excludes dot entries; local caches are not workspace packages.
      // Check links first so hidden links cannot bypass the existing policy.
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) manifests.add(`${directory}/${entry.name}/package.json`);
    }
  }
  return [...manifests].sort();
}

export async function readVersionedManifestVersions(root = process.cwd()) {
  const manifests = await discoverVersionedManifests({ root });
  return Promise.all(manifests.map(async (manifestPath) => {
    const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
    return parsePackageManifestVersion(manifestPath, manifest);
  }));
}

async function gitCandidates() {
  const result = spawnBackgroundProcessSync({
    cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`Could not enumerate Git candidates: ${result.stderr.toString()}`);
  return result.stdout.toString().split("\0").filter(Boolean);
}

async function gitSubmodules() {
  const result = spawnBackgroundProcessSync({ cmd: ["git", "ls-files", "-s"], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Could not enumerate Git index: ${result.stderr.toString()}`);
  return result.stdout.toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.split(/\s+/).at(-1) ?? "");
}

async function main() {
  const [manifests, paths, submodules] = await Promise.all([
    readVersionedManifestVersions(),
    gitCandidates(),
    gitSubmodules(),
  ]);
  const violations = [
    ...findPackageVersionViolations(manifests),
    ...findRepositoryReleaseViolations(paths, submodules),
  ];
  if (violations.length) throw new Error(`Release readiness policy failed:\n${violations.join("\n")}`);
  console.log(`Release readiness policy passed for ${manifests.length} versioned manifests and ${paths.length} Git candidates.`);
}

import { isRecord } from '@hyperfocus/utilities/records';

if (import.meta.main) await main();
