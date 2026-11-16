import { copyFile, lstat, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export async function statIfPresent(targetPath: string) {
  return stat(targetPath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
}

export async function lstatIfPresent(targetPath: string) {
  return withFsRetry(() => lstat(targetPath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }));
}

export async function readFileIfPresent(targetPath: string) {
  return readFile(targetPath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
}

export function fsErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export function isMissingPathError(error: unknown) {
  const code = fsErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

type CopyRecursiveRobustOptions = {
  onDirectoryEntry?: (sourcePath: string, targetPath: string) => void | Promise<void>;
};

export async function copyBranchfsPathRobust(sourcePath: string, targetPath: string, options: CopyRecursiveRobustOptions = {}) {
  const sourceStats = await lstatIfPresent(sourcePath);
  if (!sourceStats) {
    await removeBranchfsPath(targetPath);
    return;
  }
  const targetStats = await lstatIfPresent(targetPath);
  if (sourceStats.isSymbolicLink()) {
    throw new Error(`BranchFS source symlinks are unsupported: ${sourcePath}`);
  }

  if (sourceStats.isDirectory()) {
    if (targetStats && !targetStats.isDirectory()) {
      await rm(targetPath, { recursive: true, force: true });
    }
    await mkdir(targetPath, { recursive: true });
    const entries = await withFsRetry(() => readdir(sourcePath, { withFileTypes: true })).catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return [];
      }
      throw error;
    });
    for (const entry of entries) {
      const childSourcePath = path.join(sourcePath, entry.name);
      const childTargetPath = path.join(targetPath, entry.name);
      await options.onDirectoryEntry?.(childSourcePath, childTargetPath);
      await copyBranchfsPathRobust(childSourcePath, childTargetPath, options);
    }
    return;
  }

  if (targetStats && !targetStats.isFile()) {
    await rm(targetPath, { recursive: true, force: true });
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await withFsRetry(async () => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return removeBranchfsPath(targetPath);
    }
    throw error;
  });
}

export async function removeBranchfsPath(targetPath: string) {
  await withFsRetry(() => rm(targetPath, { recursive: true, force: true })).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  });
}

export async function withFsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableFsError(error) || attempt === 3) {
        throw error;
      }
      await Bun.sleep(25 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

function isRetryableFsError(error: unknown) {
  const code = fsErrorCode(error);
  return code !== undefined && ["ENOENT", "ENOTDIR", "EBUSY", "EPERM", "EACCES"].includes(code);
}

export function isFileExistsError(error: unknown) {
  return fsErrorCode(error) === "EEXIST";
}
