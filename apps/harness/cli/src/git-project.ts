import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

type ProjectDirectoryFileSystem = {
  statPath?: (targetPath: string) => Promise<{ isDirectory(): boolean }>;
  createDirectory?: (targetPath: string, options: { recursive: true }) => Promise<unknown>;
};

export async function ensureProjectDirectory(rootPath: string, fileSystem: ProjectDirectoryFileSystem = {}) {
  const statPath = fileSystem.statPath ?? stat;
  const createDirectory = fileSystem.createDirectory ?? mkdir;
  const trimmedPath = rootPath.trim();
  if (!trimmedPath) {
    throw new Error("Project path is required");
  }
  const normalizedPath = path.normalize(trimmedPath);

  if (!path.isAbsolute(normalizedPath)) {
    throw new Error("Project path must be absolute");
  }

  const pathRoot = path.parse(normalizedPath).root;
  let rootStats: { isDirectory(): boolean };
  try {
    rootStats = await statPath(pathRoot);
  } catch (error) {
    throw createUnavailableProjectRootError(pathRoot, error);
  }
  if (!rootStats.isDirectory()) {
    throw createUnavailableProjectRootError(pathRoot);
  }

  let existing: { isDirectory(): boolean } | undefined;
  try {
    existing = normalizedPath === pathRoot ? rootStats : await statPath(normalizedPath);
  } catch (error) {
    if (!hasFileSystemCode(error, "ENOENT")) {
      throw new Error(`Project path is unavailable: ${normalizedPath}`, { cause: error });
    }
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`Project path is not a directory: ${normalizedPath}`);
  }

  if (!existing) {
    try {
      await createDirectory(normalizedPath, { recursive: true });
    } catch (error) {
      throw new Error(`Could not create project folder: ${normalizedPath}`, { cause: error });
    }
  }
  return normalizedPath;
}

function createUnavailableProjectRootError(pathRoot: string, cause?: unknown) {
  const drive = /^[a-z]:[\\/]$/i.test(pathRoot) ? pathRoot.slice(0, 2).toUpperCase() : undefined;
  const message = drive
    ? `Project drive ${drive} is unavailable. Connect the drive or choose another folder.`
    : `Project path root is unavailable: ${pathRoot}`;
  return new Error(message, cause === undefined ? undefined : { cause });
}

function hasFileSystemCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

export async function probeGitAvailable() {
  try {
    return (await runGit(["--version"], process.cwd(), false)).exitCode === 0;
  } catch {
    return false;
  }
}

export async function probeInsideWorktree(rootPath: string) {
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], rootPath, false).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
    detail: "git probe failed"
  }));
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function initializeGitBaseline(rootPath: string) {
  await runGit(["init"], rootPath);
  await runGit(["add", "-A"], rootPath);

  const diffResult = await runGit(["diff", "--cached", "--quiet"], rootPath, false);
  if (diffResult.exitCode === 0) {
    return {
      initialized: true as const,
      baselineCommitCreated: false
    };
  }

  await runGit(
    [
      "-c",
      "user.name=Pi Harness",
      "-c",
      "user.email=pi-harness@local",
      "commit",
      "-m",
      "chore: initial harness baseline"
    ],
    rootPath
  );

  return {
    initialized: true as const,
    baselineCommitCreated: true
  };
}

async function runGit(args: string[], cwd: string, throwOnFailure = true) {
  const process = spawnBackgroundProcess({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  const detail = stderr.trim() || stdout.trim() || `git ${args[0] ?? ""} failed with exit ${exitCode}`;
  if (throwOnFailure && exitCode !== 0) {
    throw new Error(detail);
  }
  return { stdout, stderr, exitCode, detail };
}
