import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGitPreflight } from "./git-preflight";
import { ensureProjectDirectory } from "./git-project";

describe("project directory validation", () => {
  const windowsTest = process.platform === "win32" ? test : test.skip;

  windowsTest("rejects an unavailable drive before recursive directory creation", async () => {
    const statPaths: string[] = [];
    const mkdirPaths: string[] = [];
    const unavailable = Object.assign(new Error("drive not found"), { code: "ENOENT" });

    await expect(ensureProjectDirectory("Z:\\missing-project", {
      async statPath(targetPath) {
        statPaths.push(targetPath);
        throw unavailable;
      },
      async createDirectory(targetPath) {
        mkdirPaths.push(targetPath);
      }
    })).rejects.toThrow("Project drive Z: is unavailable");

    expect(statPaths).toEqual([path.parse("Z:\\missing-project").root]);
    expect(mkdirPaths).toEqual([]);
  });

  windowsTest("normalizes an escaped Windows path before creating the missing folder", async () => {
    const statPaths: string[] = [];
    const mkdirPaths: string[] = [];
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const rawPath = "C:\\\\projects\\\\new-project";
    const normalizedPath = path.normalize(rawPath);

    const result = await ensureProjectDirectory(rawPath, {
      async statPath(targetPath) {
        statPaths.push(targetPath);
        if (targetPath === path.parse(normalizedPath).root) {
          return { isDirectory: () => true };
        }
        throw missing;
      },
      async createDirectory(targetPath) {
        mkdirPaths.push(targetPath);
      }
    });

    expect(result).toBe(normalizedPath);
    expect(statPaths).toEqual([path.parse(normalizedPath).root, normalizedPath]);
    expect(mkdirPaths).toEqual([normalizedPath]);
  });

  windowsTest("does not create through a target path that cannot be inspected", async () => {
    const mkdirPaths: string[] = [];
    const denied = Object.assign(new Error("access denied"), { code: "EPERM" });
    const targetPath = "C:\\protected\\project";

    await expect(ensureProjectDirectory(targetPath, {
      async statPath(candidatePath) {
        if (candidatePath === path.parse(targetPath).root) {
          return { isDirectory: () => true };
        }
        throw denied;
      },
      async createDirectory(candidatePath) {
        mkdirPaths.push(candidatePath);
      }
    })).rejects.toThrow(`Project path is unavailable: ${targetPath}`);

    expect(mkdirPaths).toEqual([]);
  });
});

describe("git preflight", () => {
  test("allows non-git folders when dirty-git restriction is disabled", async () => {
    const rootPath = createTempDir();

    await expect(runGitPreflight(rootPath, { enabled: false })).resolves.toEqual({
      status: "clean",
      changedFileCount: 0
    });
  });

  test("blocks non-git folders when dirty-git restriction is enabled", async () => {
    const rootPath = createTempDir();

    const result = await runGitPreflight(rootPath, { enabled: true });

    expect(result.status).toBe("blocked");
    expect(result.changedFileCount).toBe(0);
    expect(result.status === "blocked" ? result.preflight.kind : undefined).toBe("git-not-repo");
  });

  test("keeps dirty warning and blocking behavior for git repos", async () => {
    const rootPath = createTempDir();
    await runGit(["init"], rootPath);
    await runGit(["config", "user.name", "Test User"], rootPath);
    await runGit(["config", "user.email", "test@example.com"], rootPath);
    writeFileSync(path.join(rootPath, "readme.md"), "hello\n");
    await runGit(["add", "."], rootPath);
    await runGit(["commit", "-m", "init"], rootPath);

    writeFileSync(path.join(rootPath, "dirty-one.txt"), "one\n");
    expect((await runGitPreflight(rootPath, { maxDirtyFileCount: 1 })).status).toBe("warning");

    writeFileSync(path.join(rootPath, "dirty-two.txt"), "two\n");
    expect((await runGitPreflight(rootPath, { maxDirtyFileCount: 1 })).status).toBe("blocked");
  });

  test("fails closed when git status cannot inspect the index", async () => {
    const rootPath = createTempDir();
    await runGit(["init"], rootPath);

    await expect(
      runGitPreflight(rootPath, {
        runGitCommand: async () => ({
          stdout: "",
          stderr: "fatal: Unable to create '.git/index.lock': File exists.",
          exitCode: 128
        })
      })
    ).rejects.toThrow("Git preflight could not inspect workspace state: fatal: Unable to create '.git/index.lock': File exists.");
  });

  test("explains an inherited parent repository and the independent-product recovery", async () => {
    const rootPath = createTempDir();
    await runGit(["init"], rootPath);
    writeFileSync(path.join(rootPath, "parent.txt"), "unrelated work");
    const nested = path.join(rootPath, "new-product");
    mkdirSync(nested);
    const result = await runGitPreflight(nested, { maxDirtyFileCount: 0 });
    expect(result.status).toBe("blocked");
    if (result.status === "clean") throw new Error("Expected dirty repository");
    expect(result.preflight.message).toContain("shares the parent repository");
    expect(result.preflight.message).toContain("initialize a separate Git repository");
    await runGit(["init"], nested);
    expect((await runGitPreflight(nested)).status).toBe("clean");
  });
});

function createTempDir() {
  const rootPath = path.join(os.tmpdir(), `harness-git-preflight-${crypto.randomUUID()}`);
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

async function runGit(args: string[], cwd: string) {
  const process = spawnBackgroundProcess({
    cmd: ["git", ...args],
    cwd,
    stdout: "ignore",
    stderr: "pipe"
  });
  const [stderr, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args[0] ?? ""} failed`);
  }
}
