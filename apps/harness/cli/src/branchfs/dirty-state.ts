import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { createHash } from "node:crypto";
import { readlink } from "node:fs/promises";
import path from "node:path";
import { lstatIfPresent, readFileIfPresent } from "./filesystem";
import { isExcludedMaterializationPath } from "./materialization-paths";
import { resolveTrustedProjectPath } from "../project-filesystem/trust";

export type DirtyStatusEntry = {
  path: string;
  staged: string;
  unstaged: string;
};

export type DirtyStatusSnapshot = {
  entries: DirtyStatusEntry[];
  skippedGeneratedEntries: DirtyStatusEntry[];
  rawEntryCount: number;
};

export async function readDirtyStatus(repoRoot: string, projectRelativePath: string): Promise<DirtyStatusSnapshot> {
  const scope = projectRelativePath ? projectRelativePath.replace(/\\/g, "/") : ".";
  const process = spawnBackgroundProcess({
    cmd: ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", scope],
    cwd: repoRoot, stdout: "pipe", stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || "Unable to read BranchFS dirty state");
  const parts = stdout.split("\0").filter(Boolean);
  const entries: DirtyStatusEntry[] = [];
  const skippedGeneratedEntries: DirtyStatusEntry[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (part.length < 4) {
      continue;
    }

    const staged = part.slice(0, 1);
    const unstaged = part.slice(1, 2);
    const relativePath = part.slice(3);
    // Porcelain -z renames and copies have a second, unprefixed source path.
    if (/[RC]/.test(staged + unstaged)) index++;
    const entry = {
      path: relativePath,
      staged,
      unstaged
    };
    if (isExcludedMaterializationPath(relativePath)) {
      skippedGeneratedEntries.push(entry);
    } else {
      entries.push(entry);
    }
  }
  return {
    entries,
    skippedGeneratedEntries,
    rawEntryCount: entries.length + skippedGeneratedEntries.length
  };
}

export async function computeDirtyFingerprint(repoRoot: string, entries: DirtyStatusEntry[]) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.staged);
    hash.update(entry.unstaged);
    hash.update(entry.path);
    const targetPath = path.join(repoRoot, entry.path);
    await resolveTrustedProjectPath(repoRoot, path.dirname(targetPath), { allowMissing: true, rejectSymlinks: true });
    const stats = await lstatIfPresent(targetPath);
    if (stats?.isSymbolicLink()) hash.update(`symlink:${await readlink(targetPath)}`);
    else hash.update(stats?.isFile() ? await readFileIfPresent(targetPath) ?? "<deleted>" : "<deleted>");
  }
  return hash.digest("hex");
}
