import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { copyLauncherRuntimeAssets } from "./launcher-assets";
import { createHarnessTestTempPath } from "../cli/src/test-support/test-temp-root";

describe("launcher assets", () => {
  test("copies bundled skills into portable release directory", async () => {
    const root = createHarnessTestTempPath("launcher-assets");
    const repoRoot = path.join(root, "repo");
    const targetDir = path.join(root, "release");
    mkdirSync(path.join(repoRoot, "dist", "ui"), { recursive: true });
    mkdirSync(path.join(repoRoot, ".agents", "skills", "assistant-actions"), { recursive: true });
    mkdirSync(path.join(repoRoot, ".agents", "skills", "grill-me"), { recursive: true });
    writeFileSync(path.join(repoRoot, "dist", "ui", "index.html"), "<!doctype html>\n");
    writeFileSync(path.join(repoRoot, "package.json"), "{}\n");
    writeFileSync(path.join(repoRoot, "agents.md"), "# Agents\n");
    writeFileSync(path.join(repoRoot, ".agents", "skills", "assistant-actions", "SKILL.md"), "# assistant-actions\n");
    writeFileSync(path.join(repoRoot, ".agents", "skills", "grill-me", "SKILL.md"), "# grill-me\n");

    try {
      await copyLauncherRuntimeAssets(repoRoot, targetDir);

      expect(existsSync(path.join(targetDir, "bin", process.platform === "win32" ? "rg.exe" : "rg"))).toBe(true);
      expect(existsSync(path.join(targetDir, ".agents", "skills", "assistant-actions", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(targetDir, ".agents", "skills", "grill-me", "SKILL.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses runtime rules instead of source contributor guidance", async () => {
    const root = createHarnessTestTempPath("launcher-runtime-agents");
    const repoRoot = path.join(root, "repo");
    const harnessRoot = path.join(repoRoot, "apps", "harness");
    const targetDir = path.join(root, "release");
    mkdirSync(path.join(repoRoot, "dist", "ui"), { recursive: true });
    mkdirSync(path.join(harnessRoot, ".agents", "skills"), { recursive: true });
    writeFileSync(path.join(repoRoot, "dist", "ui", "index.html"), "<!doctype html>\n");
    writeFileSync(path.join(repoRoot, "package.json"), "{}\n");
    writeFileSync(path.join(harnessRoot, "AGENTS.md"), "# Contributor rules\n");
    writeFileSync(path.join(harnessRoot, "runtime-agents.md"), "# Runtime rules\n");

    try {
      await copyLauncherRuntimeAssets(repoRoot, targetDir);

      expect(readFileSync(path.join(targetDir, "agents.md"), "utf8")).toBe("# Runtime rules\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
