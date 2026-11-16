import { spawnBackgroundProcess } from '@hyperfocus/desktop-runtime/process';
import path from "node:path";
import {
  terminateAndReapProcess,
  waitForProcessWithDeadline,
} from "./process-runner";
import { readBoundedStreamBytes } from "@hyperfocus/pad-pilot/bounded-stream";

// Common non-code or binary extensions to skip
const IGNORED_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "svg", "webp",
  "mp3", "wav", "mp4", "pdf", "zip", "tar", "gz",
  "ttf", "woff", "woff2", "eot",
]);

// Skip lockfiles as they artificially inflate LOC
const IGNORED_FILES = new Set([
  "package-lock.json",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

async function getGitFiles() {
  // -c: cached (tracked)
  // -o: others (untracked)
  // --exclude-standard: respect .gitignore rules
  const projectRoot = path.resolve(import.meta.dir, "..");
  const proc = spawnBackgroundProcess({ cmd: ["git", "ls-files", "-c", "-o", "--exclude-standard"], ...({
    cwd: projectRoot,
    stderr: "inherit",
    stdout: "pipe",
  }) });
  let bytes: Uint8Array;
  let exitCode: number;
  try {
    [bytes, exitCode] = await Promise.all([
      readBoundedStreamBytes(proc.stdout, { label: "git file inventory", maxBytes: 8388608 }),
      waitForProcessWithDeadline(proc, 30_000, "git file inventory"),
    ]);
  } catch (error) {
    try {
      await terminateAndReapProcess(proc, 5_000, "git file inventory cleanup");
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "git file inventory failed and could not be reaped.");
    }
    throw error;
  }
  if (exitCode !== 0) {
    throw new Error(`git ls-files failed with exit code ${exitCode}.`);
  }
  return new TextDecoder().decode(bytes).split("\n").filter((f) => f.trim().length > 0);
}

export async function countLines(filePath: string) {
  const fileName = filePath.split("/").pop() || "";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Skip binary extensions and massive lockfiles
  if (IGNORED_EXTS.has(ext) || IGNORED_FILES.has(fileName)) {
    return 0;
  }

  try {
    const file = Bun.file(filePath);

    // Skip files larger than 1MB to avoid processing giant minified bundles
    if (file.size > 1048576) return 0;

    const bytes = await readBoundedStreamBytes(file.stream(), {
      label: `source file ${filePath}`,
      maxBytes: 1048576,
    });
    const text = new TextDecoder().decode(bytes);

    // Highly optimized line counting
    let lines = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") lines++;
    }

    return lines + (text.length > 0 && !text.endsWith("\n") ? 1 : 0);
  } catch {
    // File might be a directory, symlink, or unreadable
    return 0;
  }
}

async function main() {
  console.log("Fetching files from git...");
  const files = await getGitFiles();

  console.log(`Found ${files.length} files. Counting lines...`);

  let totalLines = 0;

  // Process in parallel chunks to prevent "too many open files" OS errors
  const chunkSize = 100;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const counts = await Promise.all(chunk.map((file) => countLines(path.join(path.resolve(import.meta.dir, ".."), file))));
    totalLines += counts.reduce((acc, curr) => acc + curr, 0);
  }

  console.log(`\nDone!`);
  console.log(`Files Analyzed: ${files.length.toLocaleString()}`);
  console.log(`Total Lines of Code: ${totalLines.toLocaleString()}`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
