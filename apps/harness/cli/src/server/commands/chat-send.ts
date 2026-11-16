import { resolvePersistedAssistantChatAction } from "../../assistant-chat-actions";
import { detectAssistantChatIntent } from "../../assistant-intent";
import { appendAssistantCreationMessage, createAssistantActionIntentQuestion, createAssistantFactoryEvents, createAssistantFromThreadIntent, createAssistantPurposeQuestion, emitAssistantCreatedCardToAll, executeAssistantChatAction, findExistingAssistantForThreadIntent } from "../automation/assistant-actions";
import { resolveExecutionModelIdForRuntime } from "../automation/background-run-policy";
import type { ServerCommandContext } from "./context";
import { assertRuntimeAvailable } from "../workspace/preferences";
import { emitMessageAppended, emitProjectUpdated, emitRunUpdatedById, emitThreadMessageAppended } from "../workspace/project-events";
import { handleRunFailure } from "../execution/completion";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { continueQuickTaskLifecycle, continueRunLifecycle } from "../execution/planning";
import { assertActiveThread, assertProjectCanStartRun } from "../execution/state";
import { createRunBudgetAdapter } from "../execution/run-context";
import { appendSystemStatus } from "../execution/transcript-state";
import { appendCapturedCliContext, enforceExecutionPreflight, validatePromptAttachments } from "../execution/preflight";
import { PLANNER_DIFFICULTY_THRESHOLD, detectAutoMode, estimateTaskDifficulty, isDirectWorkspaceImplementTask } from "@hyperfocus/ai-core/mode-intent";
import { resolveModeById, resolveModeCatalog } from "@hyperfocus/ai-core/modes";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { loadSwarmContinuation } from "../../swarm/continuation";

type ChatSendCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "adapter" | "runtimeRegistry" | "assistantManager" | "pendingBrowserApprovals" | "connections" | "backgroundRunControllers" | "osAdapters" | "derivedProgressHeartbeatMs" | "tokenUsageSession"> & { queuedThreadInput?: boolean };

export async function handleChatSendCommand(command: ClientCommand, context: ChatSendCommandContext) {
  const { ws, runtime, repository, adapter, runtimeRegistry, assistantManager, pendingBrowserApprovals, connections, backgroundRunControllers, osAdapters, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "chat.send": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const selectedProject = runtime.getProject(projectId);
      const project = context.queuedThreadInput ? { ...selectedProject, activeThreadId: command.payload.threadId,
        session: { ...selectedProject.session, messages: repository.getThreadMessages(projectId, command.payload.threadId) } } : selectedProject;
      const agentRuntime = runtimeRegistry.get(command.payload.agentId);
      const agentCapability = agentRuntime.getCapability() ?? (await agentRuntime.refreshCapability());
      assertActiveThread(project, command.payload.threadId);
      assertProjectCanStartRun(repository, runtime, projectId, command.payload.threadId);
      assertRuntimeAvailable(agentRuntime, agentCapability);
      await enforceExecutionPreflight(ws, command.requestId, runtime, repository, project, osAdapters);
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const continuation=await loadSwarmContinuation({content:command.payload.content,projectId,rootPath:project.rootPath,threadId:command.payload.threadId});
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext)+(continuation?`\n\n${continuation.context}`:"");
      const providerBrand = repository.getProviderBrand();
      const debugEnabled = command.payload.debug ?? repository.getDebugEnabledDefault();
      const resolvedExecutionModel = resolveExecutionModelIdForRuntime({
        runtime: agentRuntime,
        capability: agentCapability,
        providerBrand,
        requestedModelId: command.payload.executionModelId,
        persistedModelId: project.session.executionModelId
      });
      const effectiveExecutionModelId = resolvedExecutionModel.modelId;
      if (!context.queuedThreadInput) {
        repository.activateProject(projectId);
        runtime.setActiveProject(projectId);
      }
      runtime.clearProjectTransients(projectId, command.payload.threadId);
      runtime.setProjectSelectedAgentId(projectId, command.payload.agentId);

      const resolvedModes = resolveModeCatalog(runtime.getWorkspace().workspaceModes, project.projectModes);
      const modeIntentContext = {
        stickyModeId: project.selectedModeId,
        recentMessages: project.session.messages.slice(-6).map((message) => ({
          role: message.role,
          content: message.content
        }))
      };
      const detectedMode = detectAutoMode(command.payload.content, resolvedModes, modeIntentContext);
      const autoModeRequested = command.payload.modeId === "auto";
      const effectiveModeId =
        command.payload.modeLocked && command.payload.modeId && !autoModeRequested
          ? command.payload.modeId
          : detectedMode?.modeId ?? (autoModeRequested ? undefined : command.payload.modeId) ?? project.selectedModeId;
      const effectiveMode = resolveModeById(effectiveModeId, runtime.getWorkspace().workspaceModes, project.projectModes);
      if (!autoModeRequested && effectiveModeId && effectiveModeId !== project.selectedModeId) {
        const modeProject = repository.setProjectSelectedMode(projectId, effectiveModeId);
        runtime.upsertPersistedProject(modeProject);
        emitProjectUpdated(ws, command.requestId, projectId, modeProject, repository);
      }

      const userMessageProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(userMessageProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      if (handleAssistantCreationIntent(command, context, promptContent, providerBrand, effectiveModeId, effectiveExecutionModelId)) {
        return;
      }

      const assistantAction = resolvePersistedAssistantChatAction({
        content: command.payload.content,
        projectId,
        repository
      });
      if (assistantAction.kind === "execute") {
        await executeAssistantChatAction({
          ws,
          requestId: command.requestId,
          connections,
          repository,
          runtime,
          adapter,
          runtimeRegistry,
          backgroundRunControllers,
          assistantManager,
          projectId,
          threadId: command.payload.threadId,
          action: assistantAction.action,
          tokenUsageSession
        });
        return;
      }

      const runProject = repository.createAgentRun(
        projectId,
        promptContent,
        command.payload.executionModelId
          ? effectiveExecutionModelId
          : agentRuntime.getDefaultPlanningModelId(providerBrand),
        command.payload.threadId,
        command.payload.runtimeBudget?.maxTurns,
        { agentId: agentRuntime.id, providerBrand, reasoningStrength: command.payload.reasoningStrength, fastMode: command.payload.fastMode }
      );
      const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
      if (!createdRun) {
        throw new Error("Run was not created");
      }
      // The event is now stored in the durable run prompt. Failed ack stays replayable.
      if(continuation)await continuation.acknowledge().catch(()=>{appendSystemStatus(ws,command.requestId,runtime,repository,projectId,command.payload.threadId,"Remote result is preserved in this run. Its acknowledgement will retry on the next resume.");});
      runtime.upsertPersistedProject(runProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);

      if (assistantAction.kind === "clarify") {
        const questionProject = repository.appendPlanningQuestion(projectId, createdRun.id, createAssistantActionIntentQuestion(assistantAction));
        runtime.upsertPersistedProject(questionProject);
        emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.clearStreaming(projectId, command.payload.threadId);
        const promptProject = repository.appendMessage(projectId, "assistant", assistantAction.prompt, command.payload.threadId);
        runtime.upsertPersistedProject(promptProject);
        emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
        return;
      }

      runtime.setProjectExecutionModel(projectId, effectiveExecutionModelId);
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      const estimatedDifficulty = estimateTaskDifficulty(command.payload.content, modeIntentContext);
      const quickTaskBypassEligible =
        effectiveMode?.id !== "plan" &&
        (estimatedDifficulty <= PLANNER_DIFFICULTY_THRESHOLD ||
          isDirectWorkspaceImplementTask(command.payload.content, modeIntentContext));
      if (resolvedExecutionModel.requestedModelRejected) {
        appendSystemStatus(
          ws,
          command.requestId,
          runtime,
          repository,
          projectId,
          command.payload.threadId,
          `${agentRuntime.label} does not support ${resolvedExecutionModel.requestedModelRejected} here. Using ${effectiveExecutionModelId}.`
        );
      }

      const abortController = new AbortController();
      runtime.setAbortController(projectId, createdRun.id, abortController);

      try {
        if (quickTaskBypassEligible) {
          await continueQuickTaskLifecycle(ws, command.requestId, runtime, repository, projectId, {
            agentId: agentRuntime.id,
            providerBrand,
            runId: createdRun.id,
            executionModelId: effectiveExecutionModelId,
            latestUserPrompt: promptContent,
            mode: effectiveMode,
            difficultyScore: estimatedDifficulty,
            threadId: command.payload.threadId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode
          });
          return;
        }

        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, createdRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: createdRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled,
          executionModelId: effectiveExecutionModelId,
          reasoningStrength: command.payload.reasoningStrength,
          fastMode: command.payload.fastMode,
          enableGeminiAttachmentCaching: true,
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
      throw new Error(`Unsupported chat-send command: ${command.type}`);
  }
}

function handleAssistantCreationIntent(
  command: Extract<ClientCommand, { type: "chat.send" }>,
  context: ChatSendCommandContext,
  promptContent: string,
  providerBrand: ReturnType<ChatSendCommandContext["repository"]["getProviderBrand"]>,
  effectiveModeId: string | undefined,
  effectiveExecutionModelId: string
) {
  const { ws, runtime, repository, runtimeRegistry, assistantManager, connections } = context;
  const projectId = command.payload.projectId;
  const agentRuntime = runtimeRegistry.get(command.payload.agentId);
  const assistantIntent = detectAssistantChatIntent(command.payload.content);
  if (assistantIntent.kind === "create-ready") {
    const result = createAssistantFromThreadIntent({
      repository, runtime, projectId, threadId: command.payload.threadId,
      sourcePrompt: assistantIntent.sourcePrompt, name: assistantIntent.name,
      scope: assistantIntent.scope, purpose: assistantIntent.purpose, agentId: agentRuntime.id,
      providerBrand, planningModelId: agentRuntime.getDefaultPlanningModelId(providerBrand),
      modeId: effectiveModeId, executionModelId: effectiveExecutionModelId,
      reasoningStrength: command.payload.reasoningStrength, fastMode: command.payload.fastMode,
      emit: createAssistantFactoryEvents(connections)
    });
    appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, result);
    if (result.created && result.assistant.bootstrapState === "pending") {
      assistantManager.scheduleJobBootstrapCheck(result.assistant.id, "assistant-create");
      assistantManager.queueAssistantBootstrap(result.assistant.id);
    }
    return true;
  }
  if (assistantIntent.kind !== "create-needs-purpose") {
    return false;
  }
  const existing = findExistingAssistantForThreadIntent(repository, projectId, assistantIntent.name, assistantIntent.scope);
  if (existing) {
    appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, { assistant: existing, created: false });
    emitAssistantCreatedCardToAll(connections, existing);
    return true;
  }
  const runProject = repository.createAgentRun(projectId, promptContent, agentRuntime.getDefaultPlanningModelId(providerBrand), command.payload.threadId, command.payload.runtimeBudget?.maxTurns, { agentId: agentRuntime.id, providerBrand, reasoningStrength: command.payload.reasoningStrength, fastMode: command.payload.fastMode });
  const createdRun = runProject.activeRun ?? repository.getLatestThreadRun(projectId, command.payload.threadId);
  if (!createdRun) throw new Error("Run was not created");
  runtime.upsertPersistedProject(runProject);
  emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
  const questionProject = repository.appendPlanningQuestion(projectId, createdRun.id, createAssistantPurposeQuestion({
    projectId, threadId: command.payload.threadId, sourcePrompt: assistantIntent.sourcePrompt,
    suggestedName: assistantIntent.name, defaultScope: assistantIntent.scope
  }));
  runtime.upsertPersistedProject(questionProject);
  emitRunUpdatedById(ws, command.requestId, repository, projectId, createdRun.id);
  runtime.setProjectStreaming(projectId, false, command.payload.threadId);
  runtime.clearStreaming(projectId, command.payload.threadId);
  const promptProject = repository.appendMessage(projectId, "assistant", `What should ${assistantIntent.name} do for this project?`, command.payload.threadId);
  runtime.upsertPersistedProject(promptProject);
  emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
  return true;
}
