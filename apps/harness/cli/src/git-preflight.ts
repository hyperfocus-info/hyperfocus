import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import type { RunPreflight } from "@hyperfocus/ai-core/protocol";
import { probeInsideWorktree } from "./git-project";
import path from "node:path";

const MAX_DIRTY_FILE_COUNT = 20;

export type GitPreflightResult =
  | { status: "clean"; changedFileCount: 0 }
  | { status: "warning" | "blocked"; changedFileCount: number; preflight: RunPreflight };

type GitPreflightOptions = {
  enabled?: boolean;
  maxDirtyFileCount?: number;
  runGitCommand?: typeof runGit;
};

export async function runGitPreflight(
  rootPath: string,
  { enabled = true, maxDirtyFileCount = MAX_DIRTY_FILE_COUNT, runGitCommand = runGit }: GitPreflightOptions = {}
): Promise<GitPreflightResult> {
  if (!enabled) {
    return {
      status: "clean",
      changedFileCount: 0
    };
  }

  const insideWorktree = await probeInsideWorktree(rootPath);
  if (!insideWorktree) {
    return {
      status: "blocked",
      changedFileCount: 0,
      preflight: {
        severity: "blocking",
        kind: "git-not-repo",
        message: "This project is not a git repository. Dirty-git protection cannot verify run safety.",
        changedFileCount: 0,
        repairSummary: "Initialize git with a baseline commit, disable dirty-git protection, or cancel this run.",
        repairDetail:
          "If you cancel, the run will not start. If you disable the preference, future runs in non-git folders will continue without dirty-state protection."
      }
    };
  }

  const statusResult = await runGitCommand(["status", "--porcelain=v1", "--untracked-files=all"], rootPath);
  if (statusResult.exitCode !== 0) {
    const detail = statusResult.stderr.trim() || statusResult.stdout.trim() || `git status exited with code ${statusResult.exitCode}`;
    throw new Error(`Git preflight could not inspect workspace state: ${detail}`);
  }

  const changedFileCount = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean).length;

  if (changedFileCount === 0) {
    return {
      status: "clean",
      changedFileCount: 0
    };
  }

  const repoResult = await runGitCommand(["rev-parse", "--show-toplevel"], rootPath);
  const repoRoot = repoResult.exitCode === 0 ? repoResult.stdout.trim() : "";
  const nestedGuidance = repoRoot && path.resolve(repoRoot).toLowerCase() !== path.resolve(rootPath).toLowerCase()
    ? ` This folder shares the parent repository ${repoRoot}. For an independent product, choose a folder outside that repository or initialize a separate Git repository in this project folder.`
    : "";

  const preflight: RunPreflight = {
    severity: "warning",
    kind: "git-dirty",
    message:
      changedFileCount > maxDirtyFileCount
        ? `Git dirty: ${changedFileCount} changed files. Refusing run above ${maxDirtyFileCount} files.${nestedGuidance}`
        : `Git dirty. ${changedFileCount} files changed. Run anyway.${nestedGuidance}`,
    changedFileCount
  };

  return {
    status: changedFileCount > maxDirtyFileCount ? "blocked" : "warning",
    changedFileCount,
    preflight
  };
}

async function runGit(args: string[], cwd: string) {
  const command = spawnBackgroundProcess({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited
  ]);

  return {
    stdout,
    stderr,
    exitCode
  };
}
