import { readDirtyStatus, computeDirtyFingerprint, type DirtyStatusEntry, type DirtyStatusSnapshot } from "./branchfs/dirty-state";
import { PASSTHROUGH_DIRECTORIES, isExcludedMaterializationPath } from "./branchfs/materialization-paths";
import { copyBranchfsPathRobust, isFileExistsError, isMissingPathError, lstatIfPresent, readFileIfPresent, removeBranchfsPath, statIfPresent, withFsRetry } from "./branchfs/filesystem";
import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { appendFile, mkdir, readdir, readlink, realpath, symlink, writeFile } from "node:fs/promises";
import { resolveTrustedProjectPath } from "./project-filesystem/trust";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AgentTrace, ExperimentInspection, ExperimentRun } from "@hyperfocus/ai-core/protocol";
import { DEFAULT_BRANCHFS_RETENTION, pruneBranchfsRoots, releaseBranchfsRoot, retainBranchfsRoot } from "./branchfs-cleanup";

type BranchfsTrace = {
  stage: AgentTrace["stage"];
  message: string;
  detail?: string;
  subagentId?: string;
};

export type ManagerCallbacks = {
  onTrace?: (trace: BranchfsTrace) => void;
};

type BranchfsManifest = {
  runId: string;
  repoRoot: string;
  projectRelativePath: string;
  baseCommitSha?: string;
  baseBranchName?: string;
  baseDirtyFingerprint: string;
  virtualBranchName: string;
  passthroughDirectories: string[];
  createdAt: string;
};

type BranchfsWarning = {
  kind: "large-materialization";
  message: string;
  estimatedBytes: number;
};

type BranchfsMaterializationPlan = {
  repoRoot: string;
  projectRelativePath: string;
  includedPaths: string[];
  passthroughDirectories: string[];
  estimatedBytes: number;
  estimatedFiles: number;
  warnings: BranchfsWarning[];
};

export type BranchfsExecutionContext = {
  rootPath: string;
  runId: string;
};

export type BranchfsExperimentLease = {
  experiment: ExperimentRun;
  repoRoot: string;
  projectRelativePath: string;
  repoMountPath: string;
  projectMountPath: string;
  baseProjectPath: string;
  manifestPath: string;
  dirtySeedPath: string;
  upperPath: string;
};

const BRANCHFS_DIRNAME = ".local/branchfs";
const GIT_EXECUTABLE = process.platform === "win32" ? "git.exe" : "git";
const LARGE_MATERIALIZATION_BYTES = 2147483648;
const LARGE_MATERIALIZATION_FILES = 50000;
const LARGE_DIRTY_ENTRY_WARNING_COUNT = 1000;
const DIRTY_TRACE_DETAIL_LIMIT = 20;
const MATERIALIZATION_CONCURRENCY = 32;

// Current BranchFS is a local materialized mount shim with isolated diff/flush semantics.
// It preserves the command surface for a future true CoW virtual filesystem.
type BranchfsLeasePreparationTools = {
  context: BranchfsExecutionContext;
  ensureExecutable: (binary: string, label?: string) => Promise<void>;
  emitTrace: (trace: BranchfsTrace) => void;
  emitDirtyStatusWarnings: (snapshot: DirtyStatusSnapshot) => void;
  createMaterializationPlan: (repoRoot: string, projectRelativePath: string) => Promise<BranchfsMaterializationPlan>;
  materializeMount: (plan: BranchfsMaterializationPlan, repoMountPath: string, runRoot: string) => Promise<void>;
  snapshotProjectBaseline: (plan: BranchfsMaterializationPlan, projectMountPath: string, baseProjectPath: string) => Promise<void>;
  seedIsolatedGitRepository: (repoMountPath: string, passthroughDirectories: string[]) => Promise<void>;
  captureDirtySeed: (repoRoot: string, dirtySeedPath: string, entries: DirtyStatusEntry[]) => Promise<void>;
  resolveRepoRoot: (cwd: string) => Promise<string>;
  resolveHeadCommit: (cwd: string) => Promise<string | undefined>;
  resolveBranchName: (cwd: string) => Promise<string | undefined>;
  readDirtyStatus: (repoRoot: string, projectRelativePath: string) => Promise<DirtyStatusSnapshot>;
  computeDirtyFingerprint: (repoRoot: string, entries: DirtyStatusEntry[]) => Promise<string>;
};

function createBranchfsLeasePreparer(tools: BranchfsLeasePreparationTools) {
  const { context, ensureExecutable, emitTrace, emitDirtyStatusWarnings, createMaterializationPlan, materializeMount,
    snapshotProjectBaseline, seedIsolatedGitRepository, captureDirtySeed, resolveRepoRoot, resolveHeadCommit,
    resolveBranchName, readDirtyStatus, computeDirtyFingerprint } = tools;
  async function prepareExperimentLease(): Promise<BranchfsExperimentLease> {
    await ensureExecutable(GIT_EXECUTABLE, "git");
    assertSafeRunId(context.runId);
    const repoRoot = await canonicalizeExistingPath(await resolveRepoRoot(context.rootPath));
    const resolvedRootPath = await canonicalizeExistingPath(path.resolve(context.rootPath));
    await resolveTrustedProjectPath(repoRoot, resolvedRootPath);
    const projectRelativePath = path.relative(repoRoot, resolvedRootPath);
    const runRoot = path.join(repoRoot, BRANCHFS_DIRNAME, context.runId);
    const repoMountPath = path.join(runRoot, "mount");
    const projectMountPath = projectRelativePath ? path.join(repoMountPath, projectRelativePath) : repoMountPath;
    const baseProjectPath = path.join(runRoot, "base", projectRelativePath);
    const dirtySeedPath = path.join(runRoot, "dirty-seed");
    const upperPath = path.join(runRoot, "upper");
    const metaPath = path.join(runRoot, "meta");
    const manifestPath = path.join(metaPath, "manifest.json");
    retainBranchfsRoot(runRoot);

    try {
      await pruneBranchfsRoots({ repoRoot, mode: "retention", retention: DEFAULT_BRANCHFS_RETENTION }).catch((error: unknown) => {
        emitTrace({
          stage: "branchfs-cleanup-warning",
          message: "BranchFS retention cleanup failed",
          detail: formatError(error)
        });
      });

      await removeBranchfsPath(runRoot);
      await mkdir(repoMountPath, { recursive: true });
      await mkdir(baseProjectPath, { recursive: true });
      await mkdir(dirtySeedPath, { recursive: true });
      await mkdir(upperPath, { recursive: true });
      await mkdir(metaPath, { recursive: true });

      const baseCommitSha = await resolveHeadCommit(repoRoot);
      const baseBranchName = await resolveBranchName(repoRoot);
      const dirtyStatus = await readDirtyStatus(repoRoot, projectRelativePath);
      const dirtyEntries = dirtyStatus.entries;
      emitDirtyStatusWarnings(dirtyStatus);
      const baseDirtyFingerprint = await computeDirtyFingerprint(repoRoot, dirtyEntries);
      const materializationPlan = await createMaterializationPlan(repoRoot, projectRelativePath);
      for (const warning of materializationPlan.warnings) {
        emitTrace({
          stage: "branchfs-size-warning",
          message: warning.message,
          detail: `${formatBytes(warning.estimatedBytes)} across ${materializationPlan.estimatedFiles} files`
        });
      }

      await materializeMount(materializationPlan, repoMountPath, runRoot);
      await captureDirtySeed(repoRoot, dirtySeedPath, dirtyEntries);
      if (dirtyEntries.length > 0) {
        emitTrace({
          stage: "branchfs-inherit-dirty",
          message: "Inherited base dirty state into BranchFS mount",
          detail: formatDirtyTraceDetail(dirtyEntries)
        });
      }

      await snapshotProjectBaseline(materializationPlan, projectMountPath, baseProjectPath);
      await seedIsolatedGitRepository(repoMountPath, materializationPlan.passthroughDirectories);
      const virtualBranchName = `ai-experiment/${context.runId}`;
      const createdAt = new Date().toISOString();
      const experiment: ExperimentRun = {
        id: context.runId,
        runId: context.runId,
        status: "prepared",
        virtualBranchName,
        repoMountPath,
        projectMountPath,
        baseCommitSha,
        baseBranchName,
        baseDirtyFingerprint,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        createdAt,
        updatedAt: createdAt
      };
      const manifest: BranchfsManifest = {
        runId: context.runId,
        repoRoot,
        projectRelativePath,
        baseCommitSha,
        baseBranchName,
        baseDirtyFingerprint,
        virtualBranchName,
        passthroughDirectories: materializationPlan.passthroughDirectories,
        createdAt
      };
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      emitTrace({
        stage: "branchfs-mounted",
        message: "Mounted BranchFS experiment workspace",
        detail: projectMountPath
      });

      return {
        experiment,
        repoRoot,
        projectRelativePath,
        repoMountPath,
        projectMountPath,
        baseProjectPath,
        manifestPath,
        dirtySeedPath,
        upperPath
      };
    } catch (error) {
      await removeBranchfsPath(runRoot)
        .then(() => {
          releaseBranchfsRoot(runRoot);
          emitTrace({
            stage: "branchfs-unmounted",
            message: "Unmounted failed BranchFS experiment workspace"
          });
        })
        .catch((cleanupError: unknown) => {
          emitTrace({
            stage: "branchfs-cleanup-warning",
            message: "Failed to clean up partial BranchFS workspace",
            detail: formatError(cleanupError)
          });
        });
      throw error;
    }
  }

  return prepareExperimentLease;
}

function createBranchfsMaterializationTools(
  runCommand: (command: string[], cwd: string) => Promise<{ exitCode: number; stdout: string; stderr: string; detail: string }>,
  emitTrace: (trace: BranchfsTrace) => void
) {
  async function createMaterializationPlan(repoRoot: string, projectRelativePath: string): Promise<BranchfsMaterializationPlan> {
    const [includedResult, ignoredResult] = await Promise.all([
      runCommand([GIT_EXECUTABLE, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], repoRoot),
      runCommand([GIT_EXECUTABLE, "ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"], repoRoot)
    ]);
    const includedPaths = includedResult.stdout
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.replace(/\\/g, "/"))
      .filter((entry) => !isExcludedMaterializationPath(entry))
      .sort();
    const passthroughCandidates = new Set([
      ...PASSTHROUGH_DIRECTORIES,
      ...ignoredResult.stdout
        .split("\0")
        .filter(Boolean)
        .map(normalizeRelativeDirectory)
        .filter(isPassthroughDirectoryPath)
    ]);
    const passthroughDirectories: string[] = [];
    await forEachConcurrent([...passthroughCandidates].sort(), MATERIALIZATION_CONCURRENCY, async (entry) => {
      if ((await statIfPresent(path.join(repoRoot, entry)))?.isDirectory()) {
        passthroughDirectories.push(entry);
      }
    });
    passthroughDirectories.sort();
    let estimatedBytes = 0;
    let estimatedFiles = 0;
    await forEachConcurrent(includedPaths, MATERIALIZATION_CONCURRENCY, async (relativePath) => {
      const entryStats = await lstatIfPresent(path.join(repoRoot, relativePath));
      if (!entryStats || entryStats.isSymbolicLink() || !entryStats.isFile()) {
        return;
      }
      estimatedBytes += entryStats.size;
      estimatedFiles += 1;
    });
    const warnings: BranchfsWarning[] = [];
    if (estimatedBytes > LARGE_MATERIALIZATION_BYTES || estimatedFiles > LARGE_MATERIALIZATION_FILES) {
      warnings.push({
        kind: "large-materialization",
        message: "BranchFS materialization is large; continuing automatically",
        estimatedBytes
      });
    }
    return {
      repoRoot,
      projectRelativePath,
      includedPaths,
      passthroughDirectories,
      estimatedBytes,
      estimatedFiles,
      warnings
    };
  }

  async function materializeMount(plan: BranchfsMaterializationPlan, repoMountPath: string, runRoot: string) {
    for (const directory of plan.passthroughDirectories) {
      const sourcePath = path.join(plan.repoRoot, directory);
      const sourceStats = await statIfPresent(sourcePath);
      if (!sourceStats?.isDirectory()) {
        continue;
      }
      const targetPath = path.join(repoMountPath, directory);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await removeBranchfsPath(targetPath);
      await withFsRetry(() => symlink(sourcePath, targetPath, "junction")).catch((error: unknown) => {
        if (isMissingPathError(error) || isFileExistsError(error)) {
          return;
        }
        throw error;
      });
    }

    await forEachConcurrent(plan.includedPaths, MATERIALIZATION_CONCURRENCY, async (relativePath) => {
      if (isWithinPassthrough(relativePath, plan.passthroughDirectories)) return;
      const sourcePath = await resolveTrustedProjectPath(plan.repoRoot, path.join(plan.repoRoot, relativePath), { allowMissing: true, rejectSymlinks: true });
      const sourceStats = await lstatIfPresent(sourcePath);
      if (!sourceStats) return;
      await copyBranchfsPathRobust(sourcePath, path.join(repoMountPath, relativePath));
    });

    await mkdir(path.join(runRoot, "upper"), { recursive: true });
  }

  async function snapshotProjectBaseline(plan: BranchfsMaterializationPlan, projectMountPath: string, baseProjectPath: string) {
    const projectPrefix = normalizeRelativeDirectory(plan.projectRelativePath);
    const baselinePaths = projectPrefix
      ? plan.includedPaths
          .filter((relativePath) => relativePath.startsWith(`${projectPrefix}/`))
          .map((relativePath) => relativePath.slice(projectPrefix.length + 1))
      : plan.includedPaths;
    await forEachConcurrent(baselinePaths, MATERIALIZATION_CONCURRENCY, async (relativePath) => {
      await copyBranchfsPathRobust(path.join(projectMountPath, relativePath), path.join(baseProjectPath, relativePath));
    });
  }

  async function seedIsolatedGitRepository(repoMountPath: string, passthroughDirectories: string[]) {
    await runCommand([GIT_EXECUTABLE, "init"], repoMountPath);
    await appendFile(
      path.join(repoMountPath, ".git", "config"),
      "\n[core]\n\tlongpaths = true\n[user]\n\temail = branchfs@local.invalid\n\tname = BranchFS\n",
      "utf8"
    );
    const excludePath = path.join(repoMountPath, ".git", "info", "exclude");
    const excludeLines = [
      ".local/",
      ...passthroughDirectories.map((directory) => `${directory.replace(/\\/g, "/")}/`)
    ];
    await writeFile(excludePath, `${excludeLines.join("\n")}\n`, "utf8");
    await runCommand([GIT_EXECUTABLE, "add", "-A"], repoMountPath);
    await runCommand([GIT_EXECUTABLE, "commit", "--allow-empty", "-m", "branchfs baseline"], repoMountPath);
    emitTrace({
      stage: "branchfs-mounted",
      message: "Initialized isolated git baseline for BranchFS mount",
      detail: repoMountPath
    });
  }

  async function captureDirtySeed(repoRoot: string, dirtySeedPath: string, entries: DirtyStatusEntry[]) {
    await forEachConcurrent(entries, MATERIALIZATION_CONCURRENCY, async (entry) => {
      const sourcePath = path.join(repoRoot, entry.path);
      const destinationPath = path.join(dirtySeedPath, entry.path);
      if (!(await pathExists(sourcePath))) {
        return;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyBranchfsPathRobust(sourcePath, destinationPath);
    });
  }

  return { createMaterializationPlan, materializeMount, snapshotProjectBaseline, seedIsolatedGitRepository, captureDirtySeed };
}

function createBranchfsRepositoryTools(
  runCommand: (command: string[], cwd: string) => Promise<{ exitCode: number; stdout: string; stderr: string; detail: string }>,
  tryRunCommand: (command: string[], cwd: string) => Promise<{ exitCode: number; stdout: string; stderr: string; detail: string }>
) {
  async function resolveRepoRoot(cwd: string) {
    const result = await runCommand([GIT_EXECUTABLE, "rev-parse", "--show-toplevel"], cwd);
    return result.stdout.trim();
  }

  async function resolveHeadCommit(cwd: string) {
    const result = await tryRunCommand([GIT_EXECUTABLE, "rev-parse", "--verify", "HEAD"], cwd);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  async function resolveBranchName(cwd: string) {
    const result = await tryRunCommand([GIT_EXECUTABLE, "branch", "--show-current"], cwd);
    return result.exitCode === 0 ? result.stdout.trim() || undefined : undefined;
  }


  return { resolveRepoRoot, resolveHeadCommit, resolveBranchName, readDirtyStatus, computeDirtyFingerprint };
}
export function createBranchfsManager(context: BranchfsExecutionContext, callbacks: ManagerCallbacks = {}) {
  const materializationTools = createBranchfsMaterializationTools(runCommand, emitTrace);
  const repositoryTools = createBranchfsRepositoryTools(runCommand, tryRunCommand);
  const prepareExperimentLease = createBranchfsLeasePreparer({
    context, ensureExecutable, emitTrace, emitDirtyStatusWarnings,
    ...materializationTools, ...repositoryTools
  });


  async function readInspection(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    const changedPaths = await collectChangedPaths(lease.baseProjectPath, lease.projectMountPath);
    const diffText = await diffDirectories(lease.baseProjectPath, lease.projectMountPath, changedPaths);
    const { insertions, deletions } = summarizeDiffText(diffText);
    const inspectedAt = new Date().toISOString();
    emitTrace({
      stage: "branchfs-diff-read",
      message: "Read BranchFS diff layer",
      detail: `${changedPaths.length} changed`
    });
    return {
      experiment: {
        ...lease.experiment,
        filesChanged: changedPaths.length,
        insertions,
        deletions,
        updatedAt: inspectedAt
      },
      diffText,
      files: summarizeDiffFiles(diffText, changedPaths),
      inspectedAt,
      filesChanged: changedPaths.length,
      insertions,
      deletions,
      changedPaths
    };
  }

  async function flushExperiment(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    const inspection = await readInspection(lease);
    const projectRoot = path.join(lease.repoRoot, lease.projectRelativePath);
    // Validate the entire edit set before mutating the host, including deletions.
    for (const relativePath of inspection.changedPaths) {
      await resolveTrustedProjectPath(lease.projectMountPath, path.join(lease.projectMountPath, relativePath), { allowMissing: true, rejectSymlinks: true });
      await resolveTrustedProjectPath(projectRoot, path.join(projectRoot, relativePath), { allowMissing: true, rejectSymlinks: true });
    }
    for (const relativePath of inspection.changedPaths) {
      const sourcePath = path.join(lease.projectMountPath, relativePath);
      const destinationPath = path.join(lease.repoRoot, lease.projectRelativePath, relativePath);
      if (!(await pathExists(sourcePath))) {
        await removeBranchfsPath(destinationPath);
        continue;
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyBranchfsPathRobust(sourcePath, destinationPath);
    }

    emitTrace({
      stage: "branchfs-flushed",
      message: "Flushed BranchFS mount back to physical disk",
      detail: `${inspection.filesChanged} changed`
    });
    return inspection;
  }

  async function discardExperiment(lease: BranchfsExperimentLease) {
    await unmountExperiment(lease);
  }

  async function unmountExperiment(lease: BranchfsExperimentLease) {
    const runRoot = path.dirname(lease.repoMountPath);
    await removeBranchfsPath(runRoot);
    releaseBranchfsRoot(runRoot);
    emitTrace({
      stage: "branchfs-unmounted",
      message: "Unmounted BranchFS experiment workspace"
    });
  }



  function emitDirtyStatusWarnings(snapshot: DirtyStatusSnapshot) {
    if (snapshot.rawEntryCount > LARGE_DIRTY_ENTRY_WARNING_COUNT) {
      emitTrace({
        stage: "branchfs-size-warning",
        message: "BranchFS dirty state is large; continuing with capped trace detail",
        detail: `${snapshot.rawEntryCount} raw dirty entries, ${snapshot.entries.length} inherited`
      });
    }

    if (snapshot.skippedGeneratedEntries.length > 0) {
      emitTrace({
        stage: "branchfs-size-warning",
        message: "Skipped generated or passthrough dirty state during BranchFS inherit",
        detail: formatPathSummary(
          snapshot.skippedGeneratedEntries.map((entry) => entry.path),
          "skipped generated path",
          "skipped generated paths"
        )
      });
    }
  }

  async function diffDirectories(baseDir: string, nextDir: string, changedPaths: string[] = []) {
    if (changedPaths.length === 0) {
      return "";
    }
    return createSimpleDiffText(baseDir, nextDir, changedPaths);
  }

  function emitTrace(trace: BranchfsTrace) {
    callbacks.onTrace?.(trace);
  }

  async function ensureExecutable(binary: string, label: string = binary) {
    const result = await tryRunCommand([binary, "--version"], context.rootPath);
    if (result.exitCode !== 0) {
      throw new Error(`${label} is required`);
    }
  }

  async function runCommand(command: string[], cwd: string) {
    const result = await tryRunCommand(command, cwd);
    if (result.exitCode !== 0) {
      throw new Error(result.detail);
    }
    return result;
  }

  async function tryRunCommand(command: string[], cwd: string) {
    const proc = spawnBackgroundProcess({
      cmd: command,
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      detail: stderr.trim() || stdout.trim() || `exit ${exitCode}`
    };
  }

  return { prepareExperimentLease, readInspection, flushExperiment, discardExperiment, unmountExperiment };
}

export type BranchfsManager = ReturnType<typeof createBranchfsManager>;

async function canonicalizeExistingPath(targetPath: string) {
  return await realpath(targetPath);
}

async function collectChangedPaths(baseDir: string, nextDir: string) {
  const baseFiles = await hashTree(baseDir);
  const nextFiles = await hashTree(nextDir);
  const allPaths = new Set([...Object.keys(baseFiles), ...Object.keys(nextFiles)]);
  return [...allPaths].filter((relativePath) => baseFiles[relativePath] !== nextFiles[relativePath]).sort();
}

async function createSimpleDiffText(baseDir: string, nextDir: string, changedPaths: string[]) {
  const diffs: string[] = [];
  for (const relativePath of changedPaths) {
    const basePath = path.join(baseDir, relativePath);
    const nextPath = path.join(nextDir, relativePath);
    const [baseStats, nextStats] = await Promise.all([lstatIfPresent(basePath), lstatIfPresent(nextPath)]);
    if (baseStats?.isDirectory() || nextStats?.isDirectory()) {
      continue;
    }
    const [baseContent, nextContent] = await Promise.all([
      baseStats?.isSymbolicLink() ? readlink(basePath).then(target => Buffer.from(`symlink: ${target}\n`)) : baseStats?.isFile() ? readFileIfPresent(basePath) : undefined,
      nextStats?.isSymbolicLink() ? readlink(nextPath).then(target => Buffer.from(`symlink: ${target}\n`)) : nextStats?.isFile() ? readFileIfPresent(nextPath) : undefined
    ]);
    const lines = [
      `diff --git a/${relativePath} b/${relativePath}`,
      baseContent === undefined ? "--- /dev/null" : `--- a/${relativePath}`,
      nextContent === undefined ? "+++ /dev/null" : `+++ b/${relativePath}`,
      "@@"
    ];
    for (const line of splitDiffLines(baseContent)) {
      lines.push(`-${line}`);
    }
    for (const line of splitDiffLines(nextContent)) {
      lines.push(`+${line}`);
    }
    diffs.push(lines.join("\n"));
  }
  return diffs.join("\n");
}

function splitDiffLines(content: Buffer | undefined) {
  if (!content) {
    return [];
  }
  const lines = content.toString("utf8").split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

async function hashTree(rootPath: string, currentPath: string = rootPath, results: Record<string, string> = {}) {
  const entryStats = await lstatIfPresent(currentPath);
  if (!entryStats) {
    return results;
  }
  if (entryStats.isSymbolicLink()) {
    const relativePath = path.relative(rootPath, currentPath).replace(/\\/g, "/");
    results[relativePath] = `symlink:${await readlink(currentPath)}`;
    return results;
  }
  if (entryStats.isFile()) {
    const relativePath = path.relative(rootPath, currentPath).replace(/\\/g, "/");
    const content = await readFileIfPresent(currentPath);
    if (content === undefined) {
      return results;
    }
    const hash = createHash("sha256");
    hash.update(content);
    results[relativePath] = hash.digest("hex");
    return results;
  }

  const entries = await readdir(currentPath, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  });
  for (const entry of entries) {
    const relativePath = path.relative(rootPath, path.join(currentPath, entry.name)).replace(/\\/g, "/");
    if (isExcludedMaterializationPath(relativePath)) {
      continue;
    }
    await hashTree(rootPath, path.join(currentPath, entry.name), results);
  }
  return results;
}

function summarizeDiffText(diffText: string) {
  let insertions = 0;
  let deletions = 0;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      insertions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  return { insertions, deletions };
}

function summarizeDiffFiles(diffText: string, changedPaths: string[] = []) {
  const summaries: NonNullable<ExperimentInspection["files"]> = [];
  let current: NonNullable<ExperimentInspection["files"]>[number] | undefined;
  let currentHunks: string[] = [];

  const flush = () => {
    if (!current) {
      return;
    }
    current.hunksPreview = currentHunks.slice(0, 8).join("\n");
    summaries.push(current);
    current = undefined;
    currentHunks = [];
  };

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = { path: extractDiffPath(line) ?? "unknown", additions: 0, deletions: 0, hunksPreview: "" };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("+++ b/")) {
      current.path = line.slice("+++ b/".length) || current.path;
      continue;
    }
    if (line.startsWith("@@")) {
      currentHunks.push(line);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      current.additions += 1;
    } else if (line.startsWith("-")) {
      current.deletions += 1;
    }
  }
  flush();

  if (summaries.length > 0) {
    return summaries.map((summary, index) => ({
      ...summary,
      path: summary.path === "unknown" ? changedPaths[index] ?? summary.path : summary.path
    }));
  }

  return changedPaths.map((changedPath) => ({
    path: changedPath,
    additions: 0,
    deletions: 0,
    hunksPreview: ""
  }));
}

function extractDiffPath(line: string) {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
  return match?.[2] ?? match?.[1];
}

async function pathExists(targetPath: string) {
  return (await statIfPresent(targetPath)) !== undefined;
}

function normalizeRelativeDirectory(relativePath: string) { return relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, ""); }

function isPassthroughDirectoryPath(relativePath: string) { return PASSTHROUGH_DIRECTORIES.includes(relativePath.split("/").at(-1) ?? ""); }

function isWithinPassthrough(relativePath: string, passthroughDirectories: readonly string[]) { return passthroughDirectories.some((directory) => relativePath === directory || relativePath.startsWith(`${directory}/`)); }

async function forEachConcurrent<T>(items: readonly T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const settled = await Promise.allSettled(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(items[index]!);
    }
  }));
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function formatDirtyTraceDetail(entries: DirtyStatusEntry[]) {
  return formatPathSummary(
    entries.map((entry) => entry.path),
    "dirty path",
    "dirty paths"
  );
}

function formatPathSummary(paths: string[], singularLabel: string, pluralLabel: string) {
  const sortedPaths = [...paths].sort((left, right) => left.localeCompare(right));
  const shownPaths = sortedPaths.slice(0, DIRTY_TRACE_DETAIL_LIMIT);
  const remainingCount = sortedPaths.length - shownPaths.length;
  const label = sortedPaths.length === 1 ? singularLabel : pluralLabel;
  const suffix = remainingCount > 0 ? `, ... (+${remainingCount} more)` : "";
  return `${sortedPaths.length} ${label}: ${shownPaths.join(", ")}${suffix}`;
}

function assertSafeRunId(runId: string) {
  if (
    !runId.trim() ||
    runId === "." ||
    runId === ".." ||
    path.isAbsolute(runId) ||
    runId.includes("/") ||
    runId.includes("\\") ||
    !/^[A-Za-z0-9._-]+$/.test(runId)
  ) {
    throw new Error("BranchFS runId must be a single safe path segment");
  }
}

function formatBytes(bytes: number) {
  if (bytes >= 1073741824) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (bytes >= 1048576) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${bytes} bytes`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const testExports = {
  copyRecursiveRobust: copyBranchfsPathRobust,
  formatDirtyTraceDetail,
  forEachConcurrent
};
