import { describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHarnessTestTempPath } from "../cli/src/test-support/test-temp-root";
import { launcherArtifactName, prepareLauncherRelease } from "./launcher-release";

describe("Harness launcher release", () => {
  const windowsReleaseTest = process.platform === "win32" ? test : test.skip;

  windowsReleaseTest("creates a versioned complete archive and smokes the extracted launcher", async () => {
    const repoRoot = createHarnessTestTempPath("launcher-release");
    const targetDir = path.join(repoRoot, "release", "bun-windows-x64");
    const githubOutputPath = path.join(repoRoot, "github-output.txt");
    const expectedFiles = [
      ".agents/skills/example/SKILL.md",
      "agents.md",
      "bin/rg.exe",
      "dist/ui/app.js",
      "dist/ui/index.html",
      "package.json",
      "pi-harness.exe"
    ];
    await Promise.all(expectedFiles.map(async (relativePath) => {
      const filePath = path.join(targetDir, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, relativePath, "utf8");
    }));

    try {
      const result = await prepareLauncherRelease({
        repoRoot,
        target: "bun-windows-x64",
        version: "0.0.1",
        githubOutputPath,
        smokeCommand: async (binaryPath, cwd) => {
          expect(path.basename(binaryPath)).toBe("pi-harness.exe");
          expect(await readFile(binaryPath, "utf8")).toBe("pi-harness.exe");
          expect(await listFiles(cwd)).toEqual(expectedFiles);
          return { exitCode: 0, stdout: "Usage: pi-harness [--help]", stderr: "" };
        }
      });

      expect(result.artifactName).toBe("hyperfocus-harness-v0.0.1-windows-x64.zip");
      expect(await Bun.file(result.artifactPath).exists()).toBe(true);
      expect(await readFile(githubOutputPath, "utf8")).toBe(
        "artifact_path=release/hyperfocus-harness-v0.0.1-windows-x64.zip\n"
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  test("rejects invalid versions and incomplete launcher directories", async () => {
    expect(() => launcherArtifactName("0.0.1-beta.1", "bun-windows-x64")).toThrow("plain x.y.z");
    const repoRoot = createHarnessTestTempPath("launcher-release-incomplete");
    await mkdir(path.join(repoRoot, "release", "bun-windows-x64"), { recursive: true });
    try {
      await expect(prepareLauncherRelease({
        repoRoot,
        target: "bun-windows-x64",
        version: "0.0.1"
      })).rejects.toThrow("Packaged Harness launcher is incomplete");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

async function listFiles(root: string) {
  const files: string[] = [];
  await visit(root, "");
  return files.sort();

  async function visit(directory: string, relativeDirectory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relativePath);
      else if (entry.isFile()) files.push(relativePath.replaceAll("\\", "/"));
    }
  }
}
