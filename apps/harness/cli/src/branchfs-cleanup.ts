import { isMissingPathError, lstatIfPresent, statIfPresent, removeBranchfsPath } from "./branchfs/filesystem";
import { mkdir, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import type { BranchfsCleanupSummary } from "@hyperfocus/ai-core/protocol";

const BRANCHFS_DIRNAME = ".local/branchfs";
const activeRoots = new Set<string>();

export function retainBranchfsRoot(rootPath: string) {
  const key = path.resolve(rootPath);
  if (activeRoots.has(key)) throw new Error("BranchFS run already has an active lease");
  activeRoots.add(key);
}

export function releaseBranchfsRoot(rootPath: string) {
  activeRoots.delete(path.resolve(rootPath));
}

export const DEFAULT_BRANCHFS_RETENTION = {
  maxAgeMs: 86400000,
  maxRoots: 3,
  maxBytes: 21474836480,
  partialGraceMs: 600000
};

type PruneInput = {
  repoRoot: string;
  mode: "all" | "retention";
  retention?: {
    maxAgeMs: number;
    maxRoots: number;
    maxBytes: number;
    partialGraceMs?: number;
  };
};

type RootCandidate = {
  path: string;
  name: string;
  createdMs: number;
  bytes: number;
  partial: boolean;
};

export async function pruneBranchfsRoots(input: PruneInput): Promise<BranchfsCleanupSummary> {
  const branchfsRoot = path.join(await realpath(input.repoRoot), BRANCHFS_DIRNAME);
  await mkdir(branchfsRoot, { recursive: true });
  const entries = await readdir(branchfsRoot, { withFileTypes: true });
  const roots: RootCandidate[] = [];
  const warnings: string[] = [];
  const shouldMeasureRoots = input.mode === "retention";
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const rootPath = path.join(branchfsRoot, entry.name);
    if (input.mode === "retention" && activeRoots.has(path.resolve(rootPath))) continue;
    const rootStats = await lstatIfPresent(rootPath);
    if (!rootStats) {
      continue;
    }
    const bytes = shouldMeasureRoots
      ? await measureNoFollow(rootPath).catch((error: unknown) => {
          warnings.push(`Failed to measure ${entry.name}: ${formatError(error)}`);
          return undefined;
        })
      : 0;
    if (bytes === undefined) continue;
    roots.push({
      path: rootPath,
      name: entry.name,
      createdMs: rootStats.birthtimeMs || rootStats.ctimeMs || rootStats.mtimeMs,
      bytes,
      partial: !(await pathExists(path.join(rootPath, "meta", "manifest.json")))
    });
  }

  const deleteNames = new Set<string>();
  if (input.mode === "all") {
    roots.forEach((root) => deleteNames.add(root.name));
  } else {
    const retention = input.retention ?? DEFAULT_BRANCHFS_RETENTION;
    const now = Date.now();
    const partialGraceMs = retention.partialGraceMs ?? DEFAULT_BRANCHFS_RETENTION.partialGraceMs;
    const protectedPartial = (root: RootCandidate) => root.partial && now - root.createdMs <= partialGraceMs;
    for (const root of roots) {
      if (protectedPartial(root)) continue;
      if ((root.partial && now - root.createdMs > partialGraceMs) || now - root.createdMs > retention.maxAgeMs) {
        deleteNames.add(root.name);
      }
    }

    const newestFirst = roots
      .filter((root) => !deleteNames.has(root.name) && !protectedPartial(root))
      .sort((left, right) => right.createdMs - left.createdMs);
    newestFirst.slice(retention.maxRoots).forEach((root) => deleteNames.add(root.name));

    let retainedBytes = 0;
    for (const root of newestFirst) {
      if (deleteNames.has(root.name)) {
        continue;
      }
      if (retainedBytes + root.bytes > retention.maxBytes) {
        deleteNames.add(root.name);
        continue;
      }
      retainedBytes += root.bytes;
    }
  }

  let bytesDeleted = 0;
  let rootsDeleted = 0;
  for (const root of roots) {
    if (!deleteNames.has(root.name)) {
      continue;
    }
    try {
      await removeBranchfsRoot(root.path);
      releaseBranchfsRoot(root.path);
      rootsDeleted += 1;
      bytesDeleted += root.bytes;
    } catch (error) {
      warnings.push(`Failed to delete ${root.name}: ${formatError(error)}`);
    }
  }

  await mkdir(branchfsRoot, { recursive: true });
  return {
    rootsScanned: roots.length,
    rootsDeleted,
    rootsRetained: roots.length - rootsDeleted,
    bytesDeleted,
    warnings
  };
}

async function removeBranchfsRoot(rootPath: string) {
  await unlinkKnownPassthroughs(rootPath);
  await removeBranchfsPath(rootPath);
}

async function unlinkKnownPassthroughs(rootPath: string) {
  for (const passthrough of ["node_modules", "dist", ".bun"]) {
    const target = path.join(rootPath, "mount", passthrough);
    const targetStats = await lstatIfPresent(target);
    if (targetStats?.isSymbolicLink()) {
      await rm(target, { force: true, recursive: false });
    }
  }
}

async function measureNoFollow(rootPath: string): Promise<number> {
  const entryStats = await lstatIfPresent(rootPath);
  if (!entryStats || entryStats.isSymbolicLink()) {
    return 0;
  }
  if (entryStats.isFile()) {
    return entryStats.size;
  }
  if (!entryStats.isDirectory()) {
    return 0;
  }
  const entries = await readdir(rootPath, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingPathError(error)) return [];
    throw error;
  });
  let total = 0;
  for (const entry of entries) {
    total += await measureNoFollow(path.join(rootPath, entry.name));
  }
  return total;
}

async function pathExists(targetPath: string) {
  return (await statIfPresent(targetPath)) !== undefined;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
