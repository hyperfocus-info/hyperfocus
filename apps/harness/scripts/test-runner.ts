import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_TEST_WORKER_CAP = 12;
export const WINDOWS_TEST_WORKER_CAP = 4;
export const DEFAULT_TEST_PARALLEL_DELAY_MS = 0;

export type BunTestPlan = {
  bunArgs: string[];
  workerCount?: number;
  parallelDelayMs?: number;
};

export function normalizeForwardedArgs(args: string[]) {
  const normalizedArgs = [...args];
  if (normalizedArgs[0] === "--") {
    normalizedArgs.shift();
  }
  return normalizedArgs;
}

export function resolveDefaultWorkerCount(logicalCpuCount = detectLogicalCpuCount(), platform = process.platform) {
  const normalizedCpuCount = Number.isFinite(logicalCpuCount) ? Math.max(1, Math.floor(logicalCpuCount)) : 1;
  const workerCap = platform === "win32" ? WINDOWS_TEST_WORKER_CAP : DEFAULT_TEST_WORKER_CAP;
  return Math.min(workerCap, normalizedCpuCount);
}

export function buildBunTestPlan(
  forwardedArgs: string[],
  env: NodeJS.ProcessEnv,
  logicalCpuCount = detectLogicalCpuCount(),
  platform = process.platform
): BunTestPlan {
  const normalizedArgs = normalizeForwardedArgs(forwardedArgs);
  const explicitParallelArg = findFlagValue(normalizedArgs, "--parallel");
  const explicitDelayArg = findFlagValue(normalizedArgs, "--parallel-delay");
  const aliasWorkerArg = findFlagValue(normalizedArgs, "--workers");

  const bunArgs = ["test"];
  const workerCount =
    parsePositiveInteger(explicitParallelArg) ??
    parsePositiveInteger(aliasWorkerArg) ??
    parsePositiveInteger(env.HARNESS_TEST_WORKERS) ??
    resolveDefaultWorkerCount(logicalCpuCount, platform);
  const parallelDelayMs = parseNonNegativeInteger(explicitDelayArg) ?? parseNonNegativeInteger(env.HARNESS_TEST_PARALLEL_DELAY) ?? DEFAULT_TEST_PARALLEL_DELAY_MS;

  if (!hasFlag(normalizedArgs, "--parallel")) {
    bunArgs.push(`--parallel=${workerCount}`);
  }

  if (!hasFlag(normalizedArgs, "--parallel-delay")) {
    bunArgs.push(`--parallel-delay=${parallelDelayMs}`);
  }

  bunArgs.push(...stripFlag(normalizedArgs, "--workers"));

  return {
    bunArgs,
    workerCount: parsePositiveInteger(explicitParallelArg) ?? workerCount,
    parallelDelayMs
  };
}

export async function createHarnessTestRunRoot() {
  return await mkdtemp(path.join(resolveTestTempBaseDir(), "hf-"));
}

export async function removeHarnessTestRunRoot(rootPath: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(rootPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableFilesystemError(error) || attempt === 7) {
        throw error;
      }
      await Bun.sleep(125 * (attempt + 1));
    }
  }
}

function resolveTestTempBaseDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA?.trim()) {
    return path.join(process.env.LOCALAPPDATA, "Temp");
  }
  return os.tmpdir();
}

function isRetryableFilesystemError(error: unknown) {
  return error instanceof Error && "code" in error && ["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"].includes(String(error.code));
}

export function stripFlag(args: string[], flagName: string) {
  const strippedArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];
    if (currentArg === flagName) {
      index += 1;
      continue;
    }
    if (currentArg.startsWith(`${flagName}=`)) {
      continue;
    }
    strippedArgs.push(currentArg);
  }
  return strippedArgs;
}

function detectLogicalCpuCount() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }
  return os.cpus().length;
}

function hasFlag(args: string[], flagName: string) {
  return args.some((arg) => arg === flagName || arg.startsWith(`${flagName}=`));
}

function findFlagValue(args: string[], flagName: string) {
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];
    if (currentArg === flagName) {
      return args[index + 1];
    }
    if (currentArg.startsWith(`${flagName}=`)) {
      return currentArg.slice(flagName.length + 1);
    }
  }
  return undefined;
}

function parsePositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return undefined;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return undefined;
  }
  return parsedValue;
}

function parseNonNegativeInteger(rawValue: string | undefined) {
  if (rawValue === undefined) {
    return undefined;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return undefined;
  }
  return parsedValue;
}
