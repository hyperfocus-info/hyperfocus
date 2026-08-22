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

async function main() {
  const result = Bun.spawnSync({ cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("Could not enumerate Git candidates");
  const paths = result.stdout.toString().split("\0").filter(Boolean);
  const entries = await Promise.all(paths.map(async (filePath) => ({ path: filePath, size: (await stat(path.resolve(filePath))).size })));
  const violations = findRepositoryPolicyViolations(entries);
  if (violations.length) throw new Error(`Repository size policy failed:\n${violations.join("\n")}`);
  console.log(`Repository size policy passed for ${entries.length} files.`);
}

if (import.meta.main) await main();

