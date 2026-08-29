import { DEFAULT_BRANCHFS_RETENTION, pruneBranchfsRoots } from "../../branchfs-cleanup";
import { buildRunDiagnosticsReport } from "../../run-diagnostics";
import type { ServerCommandContext } from "./context";
import { emitExecutionControlUpdatedToAll, sendEvent } from "../transport/events";
import { resolveProjectAgentRuntime } from "../workspace/preferences";
import { emitProjectTrace, emitRunUpdated } from "../workspace/project-events";
import { completeRunWithAssistantMessage, handleRunFailure } from "../execution/completion";
import { assertGlobalExecutionNotPaused, executeRunLifecycle } from "../execution/lifecycle";
import { assertActiveThread, assertNoOtherWorkingRun, buildReadyPlanFromRun, requirePersistedThreadRun, requireRunById } from "../execution/state";
import { createRunBudgetAdapter } from "../execution/run-context";
import { enforceExecutionPreflight } from "../execution/preflight";
import { assertExperimentPromotionPreconditions, createExperimentCommit, createExperimentLease, resolveGitHead, resolveGitRepoRoot, scheduleBranchfsRetentionPrune } from "../workspace/branchfs-guards";
import { createMemoryEntryId, type ClientCommand } from "@hyperfocus/ai-core/protocol";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";

type RunsCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "pendingBrowserApprovals" | "connections" | "osAdapters" | "derivedProgressHeartbeatMs" | "tokenUsageSession">;

const RUNS_PRIMARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["run.execute", "run.complete", "experiment.inspect", "experiment.promote"]);
type MemoryCommand = Extract<ClientCommand, { type: "memory.create" | "memory.list" | "memory.inspect" | "memory.update" | "memory.reorder" | "memory.delete" }>;

function isMemoryCommand(command: ClientCommand): command is MemoryCommand {
  return command.type === "memory.create" || command.type === "memory.list" || command.type === "memory.inspect"
    || command.type === "memory.update" || command.type === "memory.reorder" || command.type === "memory.delete";
}

function handleMemoryCommand(command: MemoryCommand, context: RunsCommandContext) {
  const { ws, repository } = context;
  switch (command.type) {
    case "memory.create": {
      const now = new Date().toISOString();
      const existing = repository.listMemoryEntries(command.payload.projectId)
        .find((entry) => entry.title.trim().toLowerCase() === command.payload.title.trim().toLowerCase());
      const entry = repository.saveMemoryEntry({
        id: existing?.id ?? createMemoryEntryId(), projectId: command.payload.projectId,
        threadId: existing?.threadId, runId: existing?.runId, kind: "repo-fact", status: "active",
        title: command.payload.title, summary: command.payload.summary, evidence: existing?.evidence,
        tags: [...new Set([...(existing?.tags ?? []), ...command.payload.tags])], pathGlobs: existing?.pathGlobs ?? [],
        confidence: "high", freshness: "fresh", pinned: true,
        priority: existing?.priority ?? repository.getNextMemoryPriority(command.payload.projectId),
        hitCount: existing?.hitCount ?? 0, lastHitAt: existing?.lastHitAt, sourceCommitSha: existing?.sourceCommitSha,
        createdAt: existing?.createdAt ?? now, updatedAt: now
      });
      if (!entry) throw new Error("Project note could not be saved");
      sendEvent(ws, { type: "memory.updated", requestId: command.requestId, payload: { entry } });
      return;
    }
    case "memory.list":
      sendEvent(ws, { type: "memory.listed", requestId: command.requestId, payload: {
        projectId: command.payload.projectId,
        entries: repository.listMemoryEntries(command.payload.projectId, {
          query: command.payload.search, kind: command.payload.kind, status: command.payload.status
        })
      } });
      return;
    case "memory.inspect": {
      const entry = repository.getMemoryEntry(command.payload.memoryEntryId);
      if (!entry) throw new Error("Memory entry not found");
      sendEvent(ws, { type: "memory.inspected", requestId: command.requestId, payload: { entry } });
      return;
    }
    case "memory.update": {
      const existing = repository.getMemoryEntry(command.payload.memoryEntryId);
      if (!existing) throw new Error("Memory entry not found");
      const entry = repository.saveMemoryEntry({
        ...existing,
        pinned: command.payload.pinned ?? existing.pinned,
        status: command.payload.status ?? existing.status,
        updatedAt: new Date().toISOString()
      });
      if (!entry) throw new Error("Memory entry could not be updated");
      sendEvent(ws, { type: "memory.updated", requestId: command.requestId, payload: { entry } });
      return;
    }
    case "memory.reorder":
      sendEvent(ws, { type: "memory.reordered", requestId: command.requestId, payload: {
        projectId: command.payload.projectId,
        entries: repository.reorderMemoryEntry(command.payload.projectId, command.payload.memoryEntryId, command.payload.direction)
      } });
      return;
    case "memory.delete":
      repository.deleteMemoryEntry(command.payload.memoryEntryId);
      sendEvent(ws, { type: "memory.deleted", requestId: command.requestId, payload: { memoryEntryId: command.payload.memoryEntryId } });
  }
}

export async function handleRunsCommand(command: ClientCommand, context: RunsCommandContext) {
  return RUNS_PRIMARY_TYPES.has(command.type)
    ? handleRunsPrimary(command, context)
    : handleRunsSecondary(command, context);
}

async function handleRunsPrimary(command: ClientCommand, context: RunsCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, osAdapters, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "run.execute": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertNoOtherWorkingRun(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      const activeRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      if (activeRun.status !== "ready") {
        throw new Error(`Run status ${activeRun.status} is not executable`);
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const providerBrand = repository.getProviderBrand();
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, activeRun.id, abortController);

      try {
        await executeRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, activeRun.id), pendingBrowserApprovals, connections, osAdapters, {
          projectId,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          runId: activeRun.id,
          sourceRun: activeRun,
          readyPlan: buildReadyPlanFromRun(activeRun),
          executionPlan: activeRun.plan,
          executionTarget: command.payload.target ?? activeRun.executionTarget ?? "current-project",
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          abortSignal: abortController.signal,
          derivedProgressHeartbeatMs,
          tokenUsageSession
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unknown agent error";
        await handleRunFailure(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          message,
          activeRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, activeRun.id, undefined);
      }

      return;
    }
case "run.complete": {
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      assertActiveThread(project, command.payload.threadId);
      await completeRunWithAssistantMessage(ws, command.requestId, runtime, repository, pendingBrowserApprovals, connections, {
        projectId,
        threadId: command.payload.threadId,
        runId: command.payload.runId,
        assistantMessageContent: command.payload.assistantMessageContent,
        partialReason: command.payload.partialReason
      });
      scheduleBranchfsRetentionPrune(project.rootPath);
      return;
    }
case "experiment.inspect": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      const inspection = await manager.readInspection(createExperimentLease(project.rootPath, run.experiment));
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, inspection.experiment);
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      sendEvent(ws, {
        type: "experiment.inspected",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: run.threadId,
          inspection
        }
      });
      return;
    }
case "experiment.promote": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      await assertExperimentPromotionPreconditions(project.rootPath, run.experiment);
      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      const lease = createExperimentLease(project.rootPath, run.experiment);
      const inspection = await manager.flushExperiment(lease);
      await createExperimentCommit(project.rootPath, run.id);
      const now = new Date().toISOString();
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, {
        ...inspection.experiment,
        status: "promoted",
        headCommitSha: await resolveGitHead(project.rootPath),
        promotedAt: now,
        updatedAt: now
      });
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      await manager.unmountExperiment(lease);
      return;
    }
default:
      throw new Error(`Unsupported runs command: ${command.type}`);
  }
}

async function handleRunsSecondary(command: ClientCommand, context: RunsCommandContext) {
  const { ws, runtime, repository, connections, osAdapters } = context;
  if (isMemoryCommand(command)) return handleMemoryCommand(command, context);
  switch (command.type) {
    case "run.detail.get": {
      const chunks = repository.getAgentRunDetailPage(command.payload.projectId, command.payload.threadId,
        command.payload.runId, { cursor: command.payload.cursor, limit: command.payload.limit });
      sendEvent(ws, { type: "run.detail.loaded", requestId: command.requestId, payload: {
        projectId: command.payload.projectId, threadId: command.payload.threadId, runId: command.payload.runId, chunks } });
      return;
    }
    case "experiment.discard": {
      const project = runtime.getProject(command.payload.projectId);
      const run = requireRunById(project, command.payload.runId);
      if (!run.experiment) {
        throw new Error("Experiment not found");
      }

      const now = new Date().toISOString();
      const manager = osAdapters.branchfsManagerFactory({ rootPath: project.rootPath, runId: run.id });
      await manager.discardExperiment(createExperimentLease(project.rootPath, run.experiment));
      const updatedProject = repository.saveExperimentRun(command.payload.projectId, run.id, {
        ...run.experiment,
        status: "discarded",
        discardedAt: now,
        updatedAt: now
      });
      runtime.upsertPersistedProject(updatedProject);
      emitRunUpdated(ws, command.requestId, updatedProject);
      return;
    }
case "branchfs.cleanup": {
      const project = runtime.getProject(command.payload.projectId);
      const repoRoot = await resolveGitRepoRoot(project.rootPath);
      const wasPaused = repository.getGlobalExecutionPaused();
      repository.setGlobalExecutionPaused(true);
      emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      let summary;
      try {
        summary = await pruneBranchfsRoots({
          repoRoot,
          mode: command.payload.mode,
          retention: DEFAULT_BRANCHFS_RETENTION
        });
        if (command.payload.mode === "all") {
          const stopped = repository.stopInterruptedActiveRuns({
            projectIds: [command.payload.projectId],
            reason: "BranchFS cleanup stopped stale interrupted run.",
            failureCategory: "shutdown-interrupt"
          });
          summary.staleRunsStopped = stopped.stoppedRunIds.length;
          const updatedProject = repository.getProject(command.payload.projectId);
          runtime.upsertPersistedProject(updatedProject);
          for (const run of stopped.stoppedRuns) {
            runtime.abortRun(run.projectId, run.runId);
            runtime.clearProjectTransients(run.projectId, run.threadId);
          }
          emitRunUpdated(ws, command.requestId, updatedProject);
          emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
        }
      } finally {
        repository.setGlobalExecutionPaused(wasPaused);
        emitExecutionControlUpdatedToAll(connections, command.requestId, repository.getExecutionControlState());
      }
      sendEvent(ws, {
        type: "branchfs.cleaned",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          summary
        }
      });
      emitProjectTrace(ws, command.requestId, runtime, command.payload.projectId, project.activeThreadId, {
        sessionId: project.session.sessionId,
        stage: "branchfs-cleanup-complete",
        message: "BranchFS cleanup finished",
        detail: `${summary.rootsDeleted}/${summary.rootsScanned} roots deleted`
      });
      return;
    }
case "run-diagnostics.inspect": {
      sendEvent(ws, {
        type: "run-diagnostics.inspected",
        requestId: command.requestId,
        payload: {
          report: buildRunDiagnosticsReport(repository, command.payload?.windowDays ?? 7)
        }
      });
      return;
    }
    default:
      throw new Error(`Unsupported runs command: ${command.type}`);
  }
}
