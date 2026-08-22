import { stat } from "node:fs/promises";
import path from "node:path";

export const MAX_GIT_FILE_BYTES = 95 * 1024 * 1024;

export function findRepositoryPolicyViolations(entries: readonly { path: string; size: number }[]) {
  const violations: string[] = [];
  for (const entry of entries) {
    const normalized = entry.path.replaceAll("\\", "/");
    if (entry.size > MAX_GIT_FILE_BYTES) violations.push(`${normalized} is ${entry.size} bytes (limit ${MAX_GIT_FILE_BYTES})`);
    if (/^engine\/examples\/[^/]+\/assets\/source\//i.test(normalized)) violations.push(`${normalized} is a licensed source asset and must stay out of Git`);
  }
  return violations;
}

export async function collectExistingRepositoryEntries(
  paths: readonly string[],
  readSize: (filePath: string) => Promise<number> = async (filePath) => (await stat(path.resolve(filePath))).size
) {
  const candidates = await Promise.all(paths.map(async (filePath) => {
    try {
      return { path: filePath, size: await readSize(filePath) };
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }));
  return candidates.filter((entry): entry is { path: string; size: number } => entry !== undefined);
}

async function main() {
  const result = Bun.spawnSync({ cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("Could not enumerate Git candidates");
  const paths = result.stdout.toString().split("\0").filter(Boolean);
  const entries = await collectExistingRepositoryEntries(paths);
  const violations = findRepositoryPolicyViolations(entries);
  if (violations.length) throw new Error(`Repository size policy failed:\n${violations.join("\n")}`);
  console.log(`Repository size policy passed for ${entries.length} files.`);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

if (import.meta.main) await main();
