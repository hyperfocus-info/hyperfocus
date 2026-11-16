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
    const sourceScripts = path.join(repoRoot, ".agents", "skills", "assistant-actions", "scripts");
    mkdirSync(path.join(sourceScripts, "__pycache__"), { recursive: true });
    writeFileSync(path.join(sourceScripts, "__pycache__", "helper.cpython-312.pyc"), "generated");
    writeFileSync(path.join(sourceScripts, "helper.pyo"), "generated");
    writeFileSync(path.join(sourceScripts, "compiled.pyc"), "generated");
    writeFileSync(path.join(sourceScripts, "helper.py"), "print('source')\n");
    for (const directory of [".local", ".git", "node_modules"]) {
      mkdirSync(path.join(sourceScripts, directory), { recursive: true });
      writeFileSync(path.join(sourceScripts, directory, "private-state"), "fixture local state");
    }
    writeFileSync(path.join(sourceScripts, ".env"), "FIXTURE_VALUE=local\n");
    writeFileSync(path.join(sourceScripts, ".env.example"), "FIXTURE_VALUE=\n");

    try {
      await copyLauncherRuntimeAssets(repoRoot, targetDir);

      expect(existsSync(path.join(targetDir, "bin", process.platform === "win32" ? "rg.exe" : "rg"))).toBe(true);
      expect(existsSync(path.join(targetDir, ".agents", "skills", "assistant-actions", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(targetDir, ".agents", "skills", "grill-me", "SKILL.md"))).toBe(true);
      const bundledScripts = path.join(targetDir, ".agents", "skills", "assistant-actions", "scripts");
      expect(existsSync(path.join(bundledScripts, "__pycache__"))).toBe(false);
      expect(existsSync(path.join(bundledScripts, "helper.pyo"))).toBe(false);
      expect(existsSync(path.join(bundledScripts, "compiled.pyc"))).toBe(false);
      expect(readFileSync(path.join(bundledScripts, "helper.py"), "utf8")).toBe("print('source')\n");
      for (const directory of [".local", ".git", "node_modules"]) {
        expect(existsSync(path.join(bundledScripts, directory))).toBe(false);
      }
      expect(existsSync(path.join(bundledScripts, ".env"))).toBe(false);
      expect(readFileSync(path.join(bundledScripts, ".env.example"), "utf8")).toBe("FIXTURE_VALUE=\n");
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
