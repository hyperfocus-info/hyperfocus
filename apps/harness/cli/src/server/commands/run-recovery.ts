import { resolveExecutionModelIdForRuntime } from "../automation/background-run-policy";
import type { ServerCommandContext } from "./context";
import { resolveProjectAgentRuntime } from "../workspace/preferences";
import { emitMessageAppended, emitRunUpdated } from "../workspace/project-events";
import { handleRunFailure, repairStaleRefreshRun } from "../execution/completion";
import { assertGlobalExecutionNotPaused, executeInlineSubagentRetryLifecycle } from "../execution/lifecycle";
import { continueRunLifecycle, resumeRunLifecycle } from "../execution/planning";
import { requestExecutionRefresh } from "../execution/refresh";
import { assertActiveThread, assertNoOtherWorkingRun, assertProjectCanStartRetry, assertRunCanRefresh, buildExecutionPlanFromRun, buildReadyPlanFromRun, requirePersistedThreadRun, requireRetryablePersistedRun } from "../execution/state";
import { createRunBudgetAdapter } from "../execution/run-context";
import { enforceExecutionPreflight } from "../execution/preflight";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

type RunRecoveryCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "pendingBrowserApprovals" | "connections" | "osAdapters" | "derivedProgressHeartbeatMs" | "tokenUsageSession">;

const RUNRECOVERY_PRIMARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["run.resume"]);
const RUNRECOVERY_SECONDARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["run.retry"]);

export async function handleRunRecoveryCommand(command: ClientCommand, context: RunRecoveryCommandContext) {
  return RUNRECOVERY_PRIMARY_TYPES.has(command.type)
    ? handleRunRecoveryPrimary(command, context)
    : RUNRECOVERY_SECONDARY_TYPES.has(command.type)
      ? handleRunRecoverySecondary(command, context)
      : handleRunRecoveryTertiary(command, context);
}

async function handleRunRecoveryPrimary(command: ClientCommand, context: RunRecoveryCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, osAdapters, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "run.resume": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertNoOtherWorkingRun(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      const activeRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      if (!activeRun.resumable) {
        throw new Error("Run is not resumable");
      }
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const providerBrand = repository.getProviderBrand();
      if (command.payload.guidanceText?.trim()) {
        const guidanceProject = repository.appendMessage(projectId, "user", command.payload.guidanceText, command.payload.threadId);
        runtime.upsertPersistedProject(guidanceProject);
        emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
      }

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, activeRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, activeRun.id, abortController);

      try {
        await resumeRunLifecycle(
          ws,
          command.requestId,
          runtime,
          repository,
          createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, activeRun.id),
          pendingBrowserApprovals,
          connections,
          osAdapters,
          {
            projectId,
            agentId: agentRuntime.id,
            providerBrand,
            debugEnabled: repository.getDebugEnabledDefault(),
            runId: activeRun.id,
            sourceRun: activeRun,
            abortSignal: abortController.signal,
            guidanceText: command.payload.guidanceText,
            subagentIds: command.payload.subagentIds,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode,
            derivedProgressHeartbeatMs,
            tokenUsageSession
          }
        );
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
default:
      throw new Error(`Unsupported run-recovery command: ${command.type}`);
  }
}

async function handleRunRecoverySecondary(command: ClientCommand, context: RunRecoveryCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, osAdapters, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "run.retry": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRetry(repository, runtime, projectId, command.payload.threadId, command.payload.runId);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const retryRun = requireRetryablePersistedRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const providerBrand = repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: retryRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);

      const abortController = new AbortController();
      let executionRunId: string | undefined;

      try {
        if (!command.payload.subagentId) {
          const runProject = repository.createAgentRun(
            projectId,
            retryRun.latestUserPrompt,
            retryRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
            command.payload.threadId,
            command.payload.runtimeBudget?.maxTurns ?? retryRun.runtimeBudget?.maxTurns
          );
          const nextRunId = runProject.activeRun?.id;
          if (!nextRunId) {
            throw new Error("Retry run was not created");
          }
          executionRunId = nextRunId;
          runtime.setAbortController(projectId, nextRunId, abortController);
          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);

          await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, nextRunId), pendingBrowserApprovals, connections, {
            projectId,
            threadId: command.payload.threadId,
            runId: nextRunId,
            agentId: agentRuntime.id,
            providerBrand,
            debugEnabled,
            executionModelId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode,
            abortSignal: abortController.signal,
            derivedProgressHeartbeatMs,
            tokenUsageSession
          });
        } else {
          const readyPlan = buildReadyPlanFromRun(retryRun);
          const targetTask = readyPlan.subtasks.find((task) => task.id === command.payload.subagentId);
          if (!targetTask) {
            throw new Error(`Unknown subagent: ${command.payload.subagentId}`);
          }

          let runProject = repository.createAgentRun(
            projectId,
            retryRun.latestUserPrompt,
            retryRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
            command.payload.threadId,
            command.payload.runtimeBudget?.maxTurns ?? retryRun.runtimeBudget?.maxTurns
          );
          const nextRunId = runProject.activeRun?.id;
          if (!nextRunId) {
            throw new Error("Retry run was not created");
          }
          executionRunId = nextRunId;
          runtime.setAbortController(projectId, nextRunId, abortController);

          const retryExecutionPlan = buildExecutionPlanFromRun(retryRun, nextRunId);
          runProject = repository.setAgentRunReady(
            projectId,
            nextRunId,
            readyPlan,
            retryExecutionPlan,
            readyPlan.subtasks,
            retryRun.planningModelId
          );
          for (const task of retryRun.subtasks) {
            if (task.id === command.payload.subagentId) {
              continue;
            }

            if (task.status === "completed") {
              runProject = repository.markSubtaskCompleted(
                projectId,
                nextRunId,
                task.id,
                task.output ?? "",
                task.attemptCount,
                task.commitSha,
                task.worktreePath,
                task.mountPath
              );
              continue;
            }

            if (task.status === "failed") {
              runProject = repository.markSubtaskFailed(
                projectId,
                nextRunId,
                task.id,
                task.errorMessage ?? "Unknown subagent failure",
                task.attemptCount,
                task.worktreePath,
                task.mountPath
              );
            }
          }

          runtime.upsertPersistedProject(runProject);
          emitRunUpdated(ws, command.requestId, runtime.getProject(projectId));
          runtime.setProjectExecutionModel(projectId, executionModelId);
          await executeInlineSubagentRetryLifecycle(
            ws,
            command.requestId,
            runtime,
            repository,
            createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, nextRunId),
            pendingBrowserApprovals,
            connections,
            {
              projectId,
              agentId: agentRuntime.id,
              providerBrand,
              runId: nextRunId,
              sourceRun: retryRun,
              targetTask,
              readyPlan,
              reasoningStrength: command.payload.reasoningStrength,
              fastMode: command.payload.fastMode,
              abortSignal: abortController.signal,
              derivedProgressHeartbeatMs,
              tokenUsageSession
            }
          );
        }
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
          executionRunId ?? retryRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        if (executionRunId) {
          runtime.setAbortController(projectId, executionRunId, undefined);
        }
      }

      return;
    }
    default:
      throw new Error(`Unsupported run-recovery command: ${command.type}`);
  }
}

async function handleRunRecoveryTertiary(command: ClientCommand, context: RunRecoveryCommandContext) {
  const { ws, runtime, repository, pendingBrowserApprovals, connections } = context;
  switch (command.type) {
    case "run.refresh": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      assertRunCanRefresh(targetRun);

      const executionStates = runtime
        .getRunExecutionStates(projectId, targetRun.id)
        .filter((state) => command.payload.subagentId === undefined || state.subagentId === command.payload.subagentId);

      if (executionStates.length === 0) {
        repairStaleRefreshRun(
          ws,
          command.requestId,
          runtime,
          repository,
          pendingBrowserApprovals,
          connections,
          projectId,
          targetRun
        );
        return;
      }

      for (const executionState of executionStates) {
        await requestExecutionRefresh(
          ws,
          command.requestId,
          runtime,
          repository,
          projectId,
          executionState.threadId,
          executionState
        );
      }

      return;
    }
    default:
      throw new Error(`Unsupported run-recovery command: ${command.type}`);
  }
}
