import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export function isInsideProjectPath(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Resolve every existing ancestor before a host read or write. Missing tails are
 * allowed only for creation; dangling links and I/O failures remain errors. */
export async function resolveTrustedProjectPath(root: string, candidate: string, options: {
  allowMissing?: boolean;
  rejectSymlinks?: boolean;
} = {}) {
  root = path.resolve(root);
  candidate = path.resolve(candidate);
  if (!isInsideProjectPath(root, candidate)) throw new Error("Path is outside the active project");
  const canonicalRoot = await realpath(root);
  const segments = path.relative(root, candidate).split(path.sep).filter(Boolean);
  let current = canonicalRoot;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]!);
    const stats = await lstat(current).catch((error: unknown) => {
      if (options.allowMissing && typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return undefined;
      throw error;
    });
    if (!stats) return path.join(current, ...segments.slice(index + 1));
    if (stats.isSymbolicLink()) {
      if (options.rejectSymlinks) throw new Error(`BranchFS source symlinks are unsupported: ${candidate}`);
      current = await realpath(current);
      if (!isInsideProjectPath(canonicalRoot, current)) throw new Error("Resolved path is outside the active project");
    }
  }
  return current;
}
