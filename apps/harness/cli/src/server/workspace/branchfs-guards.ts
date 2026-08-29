import { DEFAULT_BRANCHFS_RETENTION, pruneBranchfsRoots } from "../../branchfs-cleanup";
import type { BranchfsExperimentLease } from "../../branchfs-manager";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { AgentRunState } from "@hyperfocus/ai-core/protocol";
import { createHash } from "node:crypto";
import path from "node:path";

export function createExperimentLease(projectRoot: string, experiment: NonNullable<AgentRunState["experiment"]>): BranchfsExperimentLease {
  const projectRelativePath = path.relative(experiment.repoMountPath, experiment.projectMountPath);
  const depth = projectRelativePath ? projectRelativePath.split(/[\\/]+/).filter(Boolean).map(() => "..") : [];
  const repoRoot = depth.length > 0 ? path.resolve(projectRoot, ...depth) : projectRoot;
  return {
    experiment,
    repoRoot,
    projectRelativePath,
    repoMountPath: experiment.repoMountPath,
    projectMountPath: experiment.projectMountPath,
    baseProjectPath: path.join(
      path.dirname(experiment.repoMountPath),
      "base",
      projectRelativePath
    ),
    manifestPath: path.join(path.dirname(experiment.repoMountPath), "meta", "manifest.json"),
    dirtySeedPath: path.join(path.dirname(experiment.repoMountPath), "dirty-seed"),
    upperPath: path.join(path.dirname(experiment.repoMountPath), "upper")
  };
}

export async function resolveGitRepoRoot(cwd: string) {
  const proc = Bun.spawn({
    cmd: ["git", "rev-parse", "--show-toplevel"],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || "Unable to resolve git repository root");
  }
  return stdout.trim();
}

export async function resolveGitHead(cwd: string) {
  const proc = Bun.spawn({
    cmd: ["git", "rev-parse", "--verify", "HEAD"],
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return exitCode === 0 ? stdout.trim() : undefined;
}

export async function repairBranchfsStateOnStartup(repository: WorkspaceRepository, runtime: WorkspaceRuntimeStore) {
  const workspace = repository.loadWorkspace();
  const repoRoots = new Set<string>();
  for (const project of workspace.projects) {
    const repoRoot = await resolveGitRepoRoot(project.rootPath).catch(() => undefined);
    if (repoRoot) {
      repoRoots.add(repoRoot);
    }
  }
  for (const repoRoot of repoRoots) {
    await pruneBranchfsRoots({ repoRoot, mode: "retention", retention: DEFAULT_BRANCHFS_RETENTION }).catch(() => undefined);
  }
  const stopped = repository.stopInterruptedActiveRuns({
    reason: "BranchFS cleanup stopped stale interrupted run.",
    failureCategory: "shutdown-interrupt"
  });
  if (stopped.stoppedRunIds.length > 0) {
    for (const project of repository.loadWorkspace().projects) {
      runtime.upsertPersistedProject(project);
    }
    for (const run of stopped.stoppedRuns) {
      if (!runtime.hasProject(run.projectId)) {
        continue;
      }

      runtime.abortRun(run.projectId, run.runId);
      runtime.clearProjectTransients(run.projectId, run.threadId);
    }
  }
}

export function scheduleBranchfsRetentionPrune(projectRoot: string) {
  void (async () => {
    const repoRoot = await resolveGitRepoRoot(projectRoot);
    await pruneBranchfsRoots({ repoRoot, mode: "retention", retention: DEFAULT_BRANCHFS_RETENTION });
  })().catch(() => undefined);
}

export async function computeDirtyFingerprint(cwd: string) {
  const proc = Bun.spawn({
    cmd: ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", "."],
    cwd,
    stdout: "pipe",
    stderr: "ignore"
  });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  const hash = createHash("sha256");
  for (const part of stdout.split("\0").filter(Boolean).sort()) {
    const filePath = part.length >= 4 ? part.slice(3).trim() : part.trim();
    hash.update(part.slice(0, 2));
    hash.update(filePath);
    const absolutePath = path.join(cwd, filePath);
    const bytes = await Bun.file(absolutePath).bytes().catch(() => undefined);
    hash.update(bytes ?? Buffer.from("<deleted>"));
  }
  return hash.digest("hex");
}

export async function assertExperimentPromotionPreconditions(
  projectRoot: string,
  experiment: NonNullable<AgentRunState["experiment"]>
) {
  const currentHead = await resolveGitHead(projectRoot);
  if (experiment.baseCommitSha && currentHead !== experiment.baseCommitSha) {
    throw new Error("Base HEAD changed since experiment mount");
  }

  const currentDirtyFingerprint = await computeDirtyFingerprint(projectRoot);
  if (currentDirtyFingerprint !== experiment.baseDirtyFingerprint) {
    throw new Error("Base dirty state changed since experiment mount");
  }
}

export async function createExperimentCommit(projectRoot: string, runId: string) {
  const addProc = Bun.spawn({
    cmd: ["git", "add", "-A", "--", "."],
    cwd: projectRoot,
    stdout: "ignore",
    stderr: "pipe"
  });
  const addExit = await addProc.exited;
  if (addExit !== 0) {
    const detail = await new Response(addProc.stderr).text();
    throw new Error(detail.trim() || "git add failed");
  }

  const commitProc = Bun.spawn({
    cmd: ["git", "-c", "user.name=Pi Harness", "-c", "user.email=pi-harness@local", "commit", "-m", `chore: experiment ${runId}`],
    cwd: projectRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(commitProc.stdout).text(),
    new Response(commitProc.stderr).text(),
    commitProc.exited
  ]);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim();
    if (!detail.includes("nothing to commit")) {
      throw new Error(detail || "git commit failed");
    }
  }
}
