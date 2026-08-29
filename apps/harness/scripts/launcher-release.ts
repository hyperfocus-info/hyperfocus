import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCliUsageError, isCliUsageError, parseCliOptions } from "../cli/src/cli-options";

const RELEASE_TARGETS = ["bun-windows-x64"] as const;
type ReleaseTarget = (typeof RELEASE_TARGETS)[number];
type SmokeCommandResult = { exitCode: number; stdout: string; stderr: string };
type SmokeCommand = (binaryPath: string, cwd: string) => Promise<SmokeCommandResult>;

type PrepareLauncherReleaseOptions = {
  repoRoot: string;
  target: ReleaseTarget;
  version?: string;
  smokeCommand?: SmokeCommand;
  githubOutputPath?: string | null;
};

const HELP = "Usage: bun run launcher-release.ts --target <target> [--help]";

export async function prepareLauncherRelease(options: PrepareLauncherReleaseOptions) {
  const version = options.version ?? await readReleaseVersion(options.repoRoot);
  assertPlainSemver(version);
  const sourceDir = path.join(options.repoRoot, "release", options.target);
  await assertLauncherDirectory(sourceDir, options.target);
  const artifactName = launcherArtifactName(version, options.target);
  const artifactPath = path.join(options.repoRoot, "release", artifactName);

  await archiveDirectory(sourceDir, artifactPath);
  await smokeLauncherArchive({
    archivePath: artifactPath,
    sourceDir,
    target: options.target,
    smokeCommand: options.smokeCommand ?? runLauncherHelp
  });
  await writeGitHubOutput(
    options.githubOutputPath === undefined ? process.env.GITHUB_OUTPUT : options.githubOutputPath,
    options.repoRoot,
    artifactPath
  );
  console.log(`[release:harness] ${path.relative(options.repoRoot, artifactPath)}`);
  return { artifactName, artifactPath };
}

export function launcherArtifactName(version: string, target: ReleaseTarget) {
  assertPlainSemver(version);
  return `hyperfocus-harness-v${version}-${target.replace(/^bun-/, "")}.zip`;
}

async function archiveDirectory(sourceDir: string, artifactPath: string) {
  await rm(artifactPath, { force: true });
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory(",
    "$env:HARNESS_ARCHIVE_SOURCE, $env:HARNESS_ARCHIVE_DESTINATION,",
    "[System.IO.Compression.CompressionLevel]::Optimal, $false)"
  ].join(" ");
  const result = Bun.spawn({
    cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
    env: {
      ...process.env,
      HARNESS_ARCHIVE_SOURCE: sourceDir,
      HARNESS_ARCHIVE_DESTINATION: artifactPath
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stderr] = await Promise.all([result.exited, new Response(result.stderr).text()]);
  if (exitCode !== 0 || !existsSync(artifactPath)) {
    throw new Error(`Could not create Harness archive: ${stderr.trim() || `PowerShell exited ${exitCode}`}`);
  }
}

async function smokeLauncherArchive(options: {
  archivePath: string;
  sourceDir: string;
  target: ReleaseTarget;
  smokeCommand: SmokeCommand;
}) {
  const extractedDir = await mkdtemp(path.join(os.tmpdir(), "hyperfocus-harness-release-"));
  try {
    await extractArchive(options.archivePath, extractedDir);
    const [sourceFiles, extractedFiles] = await Promise.all([
      listRelativeFiles(options.sourceDir),
      listRelativeFiles(extractedDir)
    ]);
    if (sourceFiles.join("\n") !== extractedFiles.join("\n")) {
      throw new Error("Harness archive contents do not match the packaged launcher directory");
    }
    const binaryPath = path.join(extractedDir, launcherBinaryName(options.target));
    const result = await options.smokeCommand(binaryPath, extractedDir);
    if (result.exitCode !== 0 || !result.stdout.includes("Usage: pi-harness")) {
      throw new Error(
        `Extracted Harness launcher smoke failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`
      );
    }
  } finally {
    await rm(extractedDir, { recursive: true, force: true });
  }
}

async function extractArchive(archivePath: string, destination: string) {
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
    "[System.IO.Compression.ZipFile]::ExtractToDirectory(",
    "$env:HARNESS_ARCHIVE_PATH, $env:HARNESS_EXTRACT_DESTINATION)"
  ].join(" ");
  const result = Bun.spawn({
    cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
    env: {
      ...process.env,
      HARNESS_ARCHIVE_PATH: archivePath,
      HARNESS_EXTRACT_DESTINATION: destination
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stderr] = await Promise.all([result.exited, new Response(result.stderr).text()]);
  if (exitCode !== 0) throw new Error(`Could not extract Harness archive: ${stderr.trim()}`);
}

async function runLauncherHelp(binaryPath: string, cwd: string) {
  const result = Bun.spawn({ cmd: [binaryPath, "--help"], cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text()
  ]);
  return { exitCode, stdout, stderr };
}

async function assertLauncherDirectory(sourceDir: string, target: ReleaseTarget) {
  const requiredPaths = [
    launcherBinaryName(target),
    "agents.md",
    "package.json",
    "dist/ui/index.html"
  ];
  const missingPaths = requiredPaths.filter((relativePath) => !existsSync(path.join(sourceDir, relativePath)));
  if (missingPaths.length > 0) {
    throw new Error(`Packaged Harness launcher is incomplete: ${missingPaths.join(", ")}`);
  }
}

async function listRelativeFiles(root: string) {
  const files: string[] = [];
  await visit(root, "");
  return files.sort();

  async function visit(directory: string, relativeDirectory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relativePath);
      else if (entry.isFile()) files.push(relativePath.replaceAll("\\", "/"));
    }
  }
}

async function readReleaseVersion(repoRoot: string) {
  const manifest: unknown = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  if (!isRecord(manifest) || typeof manifest.version !== "string") {
    throw new Error("package.json needs a string version for Harness release packaging");
  }
  return manifest.version;
}

async function writeGitHubOutput(outputPath: string | null | undefined, repoRoot: string, artifactPath: string) {
  if (!outputPath) return;
  const relativePath = path.relative(repoRoot, artifactPath).replaceAll("\\", "/");
  await appendFile(outputPath, `artifact_path=${relativePath}\n`, "utf8");
}

function launcherBinaryName(target: ReleaseTarget) {
  return target.startsWith("bun-windows-") ? "pi-harness.exe" : "pi-harness";
}

function assertPlainSemver(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Expected a plain x.y.z release version, got ${version}`);
}

function isReleaseTarget(value: string): value is ReleaseTarget {
  return new Set<string>(RELEASE_TARGETS).has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2), {
    flags: ["--target", "--help"],
    valueFlags: ["--target"]
  });
  if (options.flags.has("--help")) {
    console.log(HELP);
    return;
  }
  const target = options.values.get("--target");
  if (!target) throw createCliUsageError(`Missing value for --target\n${HELP}`);
  if (!isReleaseTarget(target)) throw createCliUsageError(`Unsupported release target: ${target}`);
  await prepareLauncherRelease({ repoRoot: path.resolve(import.meta.dir, "../../.."), target });
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = isCliUsageError(error) ? 2 : 1;
  }
}
