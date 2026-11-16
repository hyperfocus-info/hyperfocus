import { runVerificationCommands } from "@hyperfocus/ai-runtime/quality/commands";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTrace, ComposerReasoningStrength, PlannerSubtask } from "@hyperfocus/ai-core/protocol";
import { createBranchfsManager, type BranchfsExperimentLease, type BranchfsManager } from "./branchfs-manager";
import { copyBranchfsPathRobust, readFileIfPresent, statIfPresent } from "./branchfs/filesystem";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import type { BranchfsSubagentSnapshot } from "./pi-subagents";
import { resolveTrustedProjectPath } from "./project-filesystem/trust";

const CONFLICT_MARKER_START = "<<<<<<< BRANCHFS CURRENT";
const CONFLICT_MARKER_SPLIT = "=======";
const CONFLICT_MARKER_END = ">>>>>>> BRANCHFS INCOMING";

type IntegrationTrace = {
  stage: AgentTrace["stage"];
  message: string;
  detail?: string;
  subagentId?: string;
};

export type BranchfsIntegrationContext = {
  rootPath: string;
  runId: string;
  executionModelId: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  onTrace?: (trace: IntegrationTrace) => void;
};

export type BranchfsIntegrationLease = {
  manager: BranchfsManager;
  lease: BranchfsExperimentLease;
  conflictResolved: boolean;
  appliedTaskIds: string[];
  onTrace?: (trace: IntegrationTrace) => void;
};

type PendingConflict = {
  relativePath: string;
  taskId: string;
  currentSidecarPath: string;
  incomingSidecarPath: string;
};

export async function prepareBranchfsIntegrationLease(
  adapter: PiAgentAdapter,
  context: BranchfsIntegrationContext,
  options: {
    tasks: PlannerSubtask[];
    snapshots: BranchfsSubagentSnapshot[];
    abortSignal?: AbortSignal;
  }
): Promise<BranchfsIntegrationLease | undefined> {
  const orderedSnapshots = options.tasks
    .map((task) => options.snapshots.find((snapshot) => snapshot.taskId === task.id))
    .filter((snapshot): snapshot is BranchfsSubagentSnapshot => Boolean(snapshot));

  if (orderedSnapshots.length === 0) {
    return undefined;
  }

  const manager = createBranchfsManager(
    {
      rootPath: context.rootPath,
      runId: `${context.runId}-integration`
    },
    {
      onTrace(trace) {
        context.onTrace?.(trace);
      }
    }
  );
  const lease = await manager.prepareExperimentLease();
  try {
    emitTrace(context, {
      stage: "merge-start",
      message: "Integrating isolated BranchFS subagent results",
      detail: orderedSnapshots.map((snapshot) => snapshot.taskId).join(", ")
    });

    let conflictResolved = false;
    const appliedTaskIds: string[] = [];

    for (const snapshot of orderedSnapshots) {
      const inspection = await snapshot.manager.readInspection(snapshot.lease);
      if (inspection.changedPaths.length === 0) {
        continue;
      }

      const conflicts = await applySnapshotToIntegrationLease(snapshot, lease, inspection.changedPaths);
      if (conflicts.length > 0) {
        emitTrace(context, {
          stage: "merge-conflict",
          message: `Conflict while integrating ${snapshot.taskId}`,
          detail: conflicts.map((conflict) => conflict.relativePath).join(", ")
        });
        await resolveBranchfsConflicts(adapter, context, lease, options.tasks, snapshot.taskId, conflicts, options.abortSignal);
        conflictResolved = true;
      }

      appliedTaskIds.push(snapshot.taskId);
    }

    emitTrace(context, {
      stage: "merge-complete",
      message: "Integrated isolated BranchFS subagent results",
      detail: appliedTaskIds.join(", ")
    });

    return {
      manager,
      lease,
      conflictResolved,
      appliedTaskIds,
      onTrace: context.onTrace
    };
  } catch (error) {
    try {
      await manager.discardExperiment(lease);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "BranchFS integration and cleanup failed");
    }
    throw error;
  }
}

export async function verifyBranchfsIntegrationLease(integration: BranchfsIntegrationLease, options: {
  commands?: string[]; signal?: AbortSignal;
} = {}) {
  emitTraceFromIntegration(integration, { stage: "verification-start", message: "Running integration verification" });
  const summary = await runVerificationCommands({ cwd: integration.lease.projectMountPath,
    commands: options.commands ?? [], signal: options.signal });
  emitTraceFromIntegration(integration, { stage: "verification-complete", message: summary });
}

export async function flushBranchfsIntegrationLease(integration: BranchfsIntegrationLease) {
  const inspection = await integration.manager.flushExperiment(integration.lease);
  emitTraceFromIntegration(integration, {
    stage: "sync-back",
    message: "Flushed integrated BranchFS result back to project root",
    detail: `${inspection.filesChanged} changed`
  });
}

export async function discardBranchfsIntegrationLease(integration: BranchfsIntegrationLease | undefined) {
  if (!integration) {
    return;
  }

  await integration.manager.discardExperiment(integration.lease);
}

export async function discardBranchfsSnapshots(snapshots: BranchfsSubagentSnapshot[]) {
  const results = await Promise.allSettled(
    snapshots.map((snapshot) => snapshot.manager.discardExperiment(snapshot.lease))
  );
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Failed to discard BranchFS snapshots");
}

async function applySnapshotToIntegrationLease(
  snapshot: BranchfsSubagentSnapshot,
  integrationLease: BranchfsExperimentLease,
  changedPaths: string[]
) {
  const conflicts: PendingConflict[] = [];
  for (const relativePath of changedPaths) {
    const basePath = path.join(snapshot.lease.baseProjectPath, relativePath);
    const incomingPath = path.join(snapshot.lease.projectMountPath, relativePath);
    const integrationPath = path.join(integrationLease.projectMountPath, relativePath);

    await resolveTrustedProjectPath(snapshot.lease.baseProjectPath, basePath, { allowMissing: true, rejectSymlinks: true });
    await resolveTrustedProjectPath(snapshot.lease.projectMountPath, incomingPath, { allowMissing: true, rejectSymlinks: true });
    await resolveTrustedProjectPath(integrationLease.projectMountPath, integrationPath, { allowMissing: true, rejectSymlinks: true });

    const [baseHash, incomingHash, currentHash] = await Promise.all([
      hashPath(basePath),
      hashPath(incomingPath),
      hashPath(integrationPath)
    ]);

    if (incomingHash === currentHash || incomingHash === baseHash) {
      continue;
    }

    if (currentHash === baseHash) {
      await copyBranchfsPathRobust(incomingPath, integrationPath);
      continue;
    }

    conflicts.push(await materializeConflict(snapshot.taskId, relativePath, integrationLease, integrationPath, incomingPath));
  }

  return conflicts;
}

async function materializeConflict(
  taskId: string,
  relativePath: string,
  integrationLease: BranchfsExperimentLease,
  integrationPath: string,
  incomingPath: string
): Promise<PendingConflict> {
  const conflictRoot = path.join(integrationLease.upperPath, "branchfs-conflicts", sanitizeTaskId(taskId));
  const safeName = `${createHash("sha1").update(relativePath).digest("hex")}-${path.basename(relativePath)}`;
  const currentSidecarPath = path.join(conflictRoot, `${safeName}.current`);
  const incomingSidecarPath = path.join(conflictRoot, `${safeName}.incoming`);
  await mkdir(path.dirname(currentSidecarPath), { recursive: true });

  const currentContent = await readPathText(integrationPath);
  const incomingContent = await readPathText(incomingPath);
  await writeFile(currentSidecarPath, currentContent, "utf8");
  await writeFile(incomingSidecarPath, incomingContent, "utf8");

  await mkdir(path.dirname(integrationPath), { recursive: true });
  await writeFile(
    integrationPath,
    [
      CONFLICT_MARKER_START,
      currentContent,
      CONFLICT_MARKER_SPLIT,
      incomingContent,
      CONFLICT_MARKER_END,
      "",
      `Conflict sidecars: ${currentSidecarPath.replace(/\\/g, "/")} | ${incomingSidecarPath.replace(/\\/g, "/")}`
    ].join("\n"),
    "utf8"
  );

  return {
    relativePath,
    taskId,
    currentSidecarPath,
    incomingSidecarPath
  };
}

async function resolveBranchfsConflicts(
  adapter: PiAgentAdapter,
  context: BranchfsIntegrationContext,
  integrationLease: BranchfsExperimentLease,
  tasks: PlannerSubtask[],
  taskId: string,
  conflicts: PendingConflict[],
  abortSignal?: AbortSignal
) {
  const response = await adapter.runPrompt({
    kind: "merge-resolver",
    cwd: integrationLease.projectMountPath,
    modelId: context.executionModelId,
    reasoningStrength: context.reasoningStrength,
    fastMode: context.fastMode,
    prompt: [
      "You are resolving BranchFS integration conflicts inside an isolated mount.",
      "Resolve only the current conflict state.",
      "Preserve both subtask intents when possible.",
      "Remove all BranchFS conflict markers before finishing.",
      "",
      `Conflicting subtask: ${taskId}`,
      `Conflicting files: ${conflicts.map((conflict) => conflict.relativePath).join(", ")}`,
      "Planner subtasks:",
      tasks.map((task) => `${task.id}: ${task.title} :: ${task.instruction}`).join("\n"),
      "",
      "Each conflicting file contains BranchFS markers.",
      "Sidecar files with current/incoming contents live under `.local/branchfs-conflicts/` inside this mount."
    ].join("\n"),
    abortSignal
  });

  const unresolved = [];
  for (const conflict of conflicts) {
    const targetPath = path.join(integrationLease.projectMountPath, conflict.relativePath);
    const targetContent = await readPathText(targetPath);
    if (targetContent.includes(CONFLICT_MARKER_START) || targetContent.includes(CONFLICT_MARKER_END)) {
      unresolved.push(conflict.relativePath);
    }
  }

  if (unresolved.length > 0) {
    throw new Error(`Merge resolver left unresolved files: ${unresolved.join(", ")}`);
  }

  emitTrace(context, {
    stage: "merge-complete",
    message: `Resolved BranchFS conflict for ${taskId}`,
    detail: response.text.slice(0, 240)
  });
}

function emitTrace(context: Pick<BranchfsIntegrationContext, "onTrace">, trace: IntegrationTrace) {
  context.onTrace?.(trace);
}

function emitTraceFromIntegration(integration: BranchfsIntegrationLease, trace: IntegrationTrace) {
  integration.onTrace?.(trace);
}

async function hashPath(targetPath: string) {
  const entry = await statIfPresent(targetPath);
  if (!entry) {
    return "missing";
  }

  if (entry.isDirectory()) {
    const hash = createHash("sha256");
    hash.update("directory");
    return hash.digest("hex");
  }

  const hash = createHash("sha256");
  const content = await readFileIfPresent(targetPath);
  if (content === undefined) {
    return "missing";
  }
  hash.update(content);
  return hash.digest("hex");
}

async function readPathText(targetPath: string) {
  const content = await readFileIfPresent(targetPath);
  return content?.toString("utf8").replace(/\r\n/g, "\n") ?? "";
}

function sanitizeTaskId(taskId: string) {
  return taskId.replace(/[^a-zA-Z0-9._-]/g, "-");
}
