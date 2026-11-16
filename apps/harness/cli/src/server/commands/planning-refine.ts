import { resolveExecutionModelIdForRuntime } from "../automation/background-run-policy";
import type { ServerCommandContext } from "./context";
import { assertRuntimeAvailable, resolveProjectAgentRuntime } from "../workspace/preferences";
import { emitMessageAppended, emitRunUpdatedById } from "../workspace/project-events";
import { handleRunFailure } from "../execution/completion";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { continueRunLifecycle } from "../execution/planning";
import { requireActiveRun } from "../execution/state";
import { createRunBudgetAdapter, rejectPendingBrowserApprovalsForRun } from "../execution/run-context";
import { appendCapturedCliContext, enforceExecutionPreflight, validatePromptAttachments } from "../execution/preflight";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";

type PlanningRefineCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "pendingBrowserApprovals" | "connections" | "osAdapters" | "derivedProgressHeartbeatMs" | "tokenUsageSession">;

export async function handlePlanningRefineCommand(command: ClientCommand, context: PlanningRefineCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, osAdapters, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "planning.refine": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const activeRun = requireActiveRun(project, command.payload.runId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project, activeRun);
      if (activeRun.status !== "ready") {
        throw new Error("Only ready runs can be refined");
      }

      assertRuntimeAvailable(agentRuntime);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext);
      const providerBrand = activeRun.launchProfile?.providerBrand ?? repository.getProviderBrand();
      const executionModelId = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentRuntime.getCapability(),
        providerBrand,
        requestedModelId: activeRun.executionModelId
      }).modelId;
      const debugEnabled = repository.getDebugEnabledDefault();

      const refinedMessageProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(refinedMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, projectId, activeRun.id,
        "Plan refined before execution", "stopped");
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      runtime.clearProjectTransients(projectId, command.payload.threadId);

      const runProject = repository.createAgentRun(
        projectId,
        promptContent,
        activeRun.planningModelId ?? agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId,
        command.payload.runtimeBudget?.maxTurns,
        { agentId: agentRuntime.id, providerBrand, reasoningStrength: command.payload.reasoningStrength ?? activeRun.launchProfile?.reasoningStrength, fastMode: command.payload.fastMode ?? activeRun.launchProfile?.fastMode }
      );
      const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
      if (!createdRun) {
        throw new Error("Run was not created");
      }
      runtime.upsertPersistedProject(runProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
      runtime.setProjectExecutionModel(projectId, executionModelId);
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, activeRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, createdRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, createdRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: createdRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId,
          reasoningStrength: command.payload.reasoningStrength ?? activeRun.launchProfile?.reasoningStrength,
          fastMode: command.payload.fastMode ?? activeRun.launchProfile?.fastMode,
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
          createdRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, createdRun.id, undefined);
      }

      return;
    }
    default:
      throw new Error(`Unsupported planning-refine command: ${command.type}`);
  }
}
