import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { swapPackageArtifactDirectories } from "./build-package.ts";

const artifactDirectories = ["browser", "dist", "wasm"] as const;

function writeArtifactSet(root: string, marker: string) {
  for (const directoryName of artifactDirectories) {
    const directory = join(root, directoryName);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "marker.txt"), `${marker}-${directoryName}`);
  }
}

function expectArtifactSet(root: string, marker: string) {
  for (const directoryName of artifactDirectories) {
    expect(readFileSync(join(root, directoryName, "marker.txt"), "utf8")).toBe(`${marker}-${directoryName}`);
  }
}

function expectNoBuildBackups(root: string) {
  expect(readdirSync(root).filter((entry) => entry.startsWith(".package-build-backup-"))).toEqual([]);
  const localRoot = join(root, ".local");
  if (existsSync(localRoot)) expect(readdirSync(localRoot).filter((entry) => entry.startsWith("package-build-backup-"))).toEqual([]);
}

describe("atomic package artifact swap", () => {
  test("commits one coherent staged artifact set", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-engine-build-"));
    const staging = join(root, "staging");
    try {
      mkdirSync(staging);
      writeArtifactSet(root, "old");
      writeArtifactSet(staging, "new");

      swapPackageArtifactDirectories(root, staging, { nonce: "commit", beforeInstall() {
        expect(existsSync(join(root, ".local", "package-build-backup-commit"))).toBe(true);
        expect(existsSync(join(root, ".package-build-backup-commit"))).toBe(false);
      } });

      expectArtifactSet(root, "new");
      expectNoBuildBackups(root);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("restores every prior artifact when a late install fails", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-engine-build-"));
    const staging = join(root, "staging");
    try {
      mkdirSync(staging);
      writeArtifactSet(root, "old");
      writeArtifactSet(staging, "new");

      expect(() =>
        swapPackageArtifactDirectories(root, staging, {
          nonce: "rollback",
          beforeInstall(_directoryName, index) {
            if (index === 2) throw new Error("injected late build failure");
          },
        }),
      ).toThrow("injected late build failure");

      expectArtifactSet(root, "old");
      expectNoBuildBackups(root);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("validates the complete stage before moving live artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-engine-build-"));
    const staging = join(root, "staging");
    try {
      mkdirSync(staging);
      writeArtifactSet(root, "old");
      mkdirSync(join(staging, "browser"));
      mkdirSync(join(staging, "dist"));

      expect(() => swapPackageArtifactDirectories(root, staging, { nonce: "incomplete" })).toThrow(
        "staged package artifact directory is missing: wasm",
      );

      expectArtifactSet(root, "old");
      expectNoBuildBackups(root);
      expect(existsSync(join(root, "wasm"))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
