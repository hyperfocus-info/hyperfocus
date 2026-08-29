import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_TEMP_ROOT_ENV = "HARNESS_TEST_TMP_ROOT";
let fallbackRoot: string | undefined;
let cleanupRegistered = false;

/**
 * Returns the directory owned by the current harness test run.
 *
 * The normal test runner supplies a unique OS-temp directory and removes it
 * after every segment has exited. Direct `bun test <file>` runs receive a
 * process-owned fallback outside any Git worktree and clean it on exit.
 */
export function resolveHarnessTestTempRoot() {
  const configuredRoot = process.env[TEST_TEMP_ROOT_ENV]?.trim();
  const rootPath = configuredRoot
    ? path.resolve(configuredRoot)
    : (fallbackRoot ??= path.join(os.tmpdir(), `hf-${process.pid}-${shortId()}`));

  mkdirSync(rootPath, { recursive: true });
  if (!configuredRoot && !cleanupRegistered) {
    cleanupRegistered = true;
    process.once("exit", () => {
      rmSync(rootPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
  }
  return rootPath;
}

export function createHarnessTestTempPath(prefix: string, extension = "") {
  return path.join(resolveHarnessTestTempRoot(), `${sanitizePrefix(prefix).slice(0, 24)}-${shortId()}${extension}`);
}

export function isRunnerOwnedHarnessTestPath(targetPath: string) {
  const configuredRoot = process.env[TEST_TEMP_ROOT_ENV]?.trim();
  if (!configuredRoot) {
    return false;
  }
  const relativePath = path.relative(path.resolve(configuredRoot), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function sanitizePrefix(prefix: string) {
  return prefix.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "test";
}

function shortId() {
  return crypto.randomUUID().slice(0, 8);
}
