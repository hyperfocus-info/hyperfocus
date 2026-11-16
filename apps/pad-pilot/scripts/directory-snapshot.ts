import { lstatSync, opendirSync, realpathSync, type Dirent } from "node:fs";
import path from "node:path";
import { hashBoundedFile } from "@hyperfocus/pad-pilot/bounded-file";

export type DirectorySnapshotLimits = {
  maxDepth?: number;
  maxEntries?: number;
  maxFileBytes?: number;
  maxFiles?: number;
  maxRelativePathBytes?: number;
  maxTotalBytes?: number;
};

export const defaultDirectorySnapshotLimits = {
  maxDepth: 64,
  maxEntries: 65_536,
  maxFileBytes: 536870912,
  maxFiles: 65_536,
  maxRelativePathBytes: 1024,
  maxTotalBytes: 4294967296,
} as const;

function normalizeLimits(overrides: DirectorySnapshotLimits) {
  const limits = { ...defaultDirectorySnapshotLimits, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Directory snapshot ${name} must be a positive safe integer.`);
    }
  }
  return limits;
}

function containedPath(root: string, candidate: string) {
  const relativePath = path.relative(root, candidate);
  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

export function listRegularDirectoryFiles(
  directory: string,
  limits: ReturnType<typeof normalizeLimits>,
  compare: (left: string, right: string) => number = (left, right) => left.localeCompare(right),
  label = "Directory snapshot",
) {
  const root = path.resolve(directory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`${label} root must be a real directory.`);
  }
  const realRoot = realpathSync(root);
  const files: string[] = [];
  const pending = [{ depth: 0, relativePath: "" }];
  let entriesVisited = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    const currentDirectory = path.join(root, current.relativePath);
    const currentStat = lstatSync(currentDirectory);
    const realCurrent = realpathSync(currentDirectory);
    if (!currentStat.isDirectory() || currentStat.isSymbolicLink() || !containedPath(realRoot, realCurrent)) {
      throw new Error(`${label} contains an unsupported linked directory: ${current.relativePath || "."}`);
    }
    const directoryHandle = opendirSync(currentDirectory);
    const entries: Dirent[] = [];
    try {
      while (true) {
        const entry = directoryHandle.readSync();
        if (!entry) {
          break;
        }
        entriesVisited += 1;
        if (entriesVisited > limits.maxEntries) {
          throw new Error(`${label} exceeded ${limits.maxEntries} filesystem entries.`);
        }
        entries.push(entry);
      }
    } finally {
      directoryHandle.closeSync();
    }
    entries.sort((left, right) => compare(left.name, right.name));

    const childDirectories: Array<{ depth: number; relativePath: string }> = [];
    for (const entry of entries) {
      const relativePath = current.relativePath
        ? path.join(current.relativePath, entry.name)
        : entry.name;
      if (Buffer.byteLength(relativePath, "utf8") > limits.maxRelativePathBytes) {
        throw new Error(`${label} path exceeded ${limits.maxRelativePathBytes} bytes: ${relativePath}`);
      }
      const entryPath = path.join(root, relativePath);
      const entryStat = lstatSync(entryPath);
      if (entryStat.isSymbolicLink()) {
        throw new Error(`${label} contains an unsupported link: ${relativePath}`);
      }
      if (entryStat.isDirectory()) {
        if (current.depth >= limits.maxDepth) {
          throw new Error(`${label} exceeded ${limits.maxDepth} directory levels: ${relativePath}`);
        }
        childDirectories.push({ depth: current.depth + 1, relativePath });
      } else if (entryStat.isFile()) {
        if (!containedPath(realRoot, realpathSync(entryPath))) {
          throw new Error(`${label} file escaped its root: ${relativePath}`);
        }
        files.push(relativePath);
        if (files.length > limits.maxFiles) {
          throw new Error(`${label} exceeded ${limits.maxFiles} files.`);
        }
      } else {
        throw new Error(`${label} contains an unsupported filesystem entry: ${relativePath}`);
      }
    }
    for (let index = childDirectories.length - 1; index >= 0; index -= 1) {
      const child = childDirectories[index];
      if (child) {
        pending.push(child);
      }
    }
  }
  return files.sort(compare);
}

export async function snapshotDirectory(directory: string, overrides: DirectorySnapshotLimits = {}) {
  const root = path.resolve(directory);
  const limits = normalizeLimits(overrides);
  const snapshot = [];
  let totalBytes = 0;
  for (const relativePath of listRegularDirectoryFiles(root, limits)) {
    const filePath = path.join(root, relativePath);
    const fileStat = lstatSync(filePath);
    if (fileStat.size < 0 || fileStat.size > limits.maxFileBytes
        || totalBytes > limits.maxTotalBytes - fileStat.size) {
      throw new Error(`Directory snapshot exceeded its byte budget at: ${relativePath}`);
    }
    const hashed = await hashBoundedFile(
      filePath,
      Math.min(limits.maxFileBytes, limits.maxTotalBytes - totalBytes),
      "Directory snapshot file",
    );
    totalBytes += hashed.size;
    snapshot.push({
      hash: hashed.sha256,
      relativePath: relativePath.replaceAll("\\", "/"),
      size: hashed.size,
    });
  }
  return JSON.stringify(snapshot);
}
