import { resolvePersistedAssistantChatAction } from "../../assistant-chat-actions";
import { appendAssistantCreationMessage, classifyAssistantIntentAnswer, classifyAssistantPurposeAnswer, createAssistantActionIntentQuestion, createAssistantFromThreadIntent, emitAssistantCreatedCardToAll, emitAssistantSummaryDeltaToAll, executeAssistantChatAction } from "../automation/assistant-actions";
import { resolveExecutionModelIdForRuntime } from "../automation/background-run-policy";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { ServerCommandContext } from "./context";
import { archiveNotificationWithLegacyId, createPlanningQuestionBatchNotificationId, saveBackgroundRunStatusNotification } from "../automation/notifications";
import { resolveProjectAgentRuntime } from "../workspace/preferences";
import { emitMessageAppended, emitRunUpdatedById, emitThreadMessageAppended } from "../workspace/project-events";
import { handleRunFailure } from "../execution/completion";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { continueRunLifecycle } from "../execution/planning";
import { requirePersistedThreadRun } from "../execution/state";
import { createRunBudgetAdapter, rejectPendingBrowserApprovalsForRun } from "../execution/run-context";
import { appendCapturedCliContext, validatePromptAttachments } from "../execution/preflight";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

type PlanningAnswersCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "adapter" | "runtimeRegistry" | "assistantManager" | "pendingBrowserApprovals" | "connections" | "backgroundRunControllers" | "derivedProgressHeartbeatMs" | "tokenUsageSession">;

const PLANNINGANSWERS_PRIMARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["planning.answer-batch"]);

export async function handlePlanningAnswersCommand(command: ClientCommand, context: PlanningAnswersCommandContext) {
  return PLANNINGANSWERS_PRIMARY_TYPES.has(command.type)
    ? handlePlanningAnswersPrimary(command, context)
    : handlePlanningAnswersSecondary(command, context);
}

async function handlePlanningAnswersPrimary(command: ClientCommand, context: PlanningAnswersCommandContext) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  switch (command.type) {
case "planning.answer-batch": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const answersById = new Map(command.payload.answers.map((answer) => [answer.questionId, answer.content]));
      if (answersById.size !== command.payload.answers.length) {
        throw new Error("Duplicate planning question answers are not allowed");
      }
      const pendingQuestions = command.payload.answers.map((answer) => {
        const question = targetRun.questions.find(
          (entry) => entry.id === answer.questionId && (entry.status === "pending" || entry.status === "deferred")
        );
        if (!question) {
          throw new Error("Planning question is not answerable");
        }
        return question;
      });

      const providerBrand = repository.getProviderBrand();
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const combinedContent = pendingQuestions
        .map((question) => `Q: ${question.prompt}\nA: ${answersById.get(question.id) ?? ""}`)
        .join("\n\n");
      const promptContent = appendCapturedCliContext(combinedContent, capturedCliContext);
      const answerProject = repository.appendMessage(projectId, "user", combinedContent, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(answerProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      let answeredProject = answerProject;
      for (const question of pendingQuestions) {
        answeredProject = repository.answerPlanningQuestion(projectId, targetRun.id, question.id, answersById.get(question.id) ?? "");
        archiveNotificationWithLegacyId(repository, ["planning-question", targetRun.id, question.id]);
      }
      repository.archiveNotification(createPlanningQuestionBatchNotificationId(targetRun.id, pendingQuestions.map((question) => question.id)));
      runtime.upsertPersistedProject(answeredProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());

      const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(targetRun.id);
      if (linkedBackgroundRun?.status === "awaiting-user-input") {
        const resumedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "running", {
          summary: "Resuming after user input"
        });
        saveBackgroundRunStatusNotification(repository, resumedBackgroundRun);
        emitBackgroundJobRunUpdatedToAll(connections, resumedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      }
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, targetRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, targetRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, targetRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: targetRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId: resolveExecutionModelIdForRuntime({
            runtime: agentRuntime,
            capability: agentRuntime.getCapability(),
            providerBrand,
            requestedModelId: targetRun.executionModelId ?? project.session.executionModelId
          }).modelId,
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
          targetRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, targetRun.id, undefined);
      }

      void promptContent;
      return;
    }
default:
      throw new Error(`Unsupported planning-answers command: ${command.type}`);
  }
}

async function handlePlanningAnswersSecondary(command: ClientCommand, context: PlanningAnswersCommandContext) {
  const { ws, runtime, repository, adapter, runtimeRegistry, assistantManager, pendingBrowserApprovals,
    connections, backgroundRunControllers, tokenUsageSession } = context;
  switch (command.type) {
case "planning.answer": {
      assertGlobalExecutionNotPaused(repository);
      const projectId = command.payload.projectId;
      const project = runtime.getProject(projectId);
      const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
      const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
      const pendingQuestion = targetRun.questions.find(
        (question) =>
          question.id === command.payload.questionId &&
          (question.status === "pending" || question.status === "deferred")
      );
      if (!pendingQuestion) {
        throw new Error("Planning question is not answerable");
      }

      const providerBrand = repository.getProviderBrand();
      const attachments = validatePromptAttachments(repository, projectId, command.payload.threadId, command.payload.attachments);
      const capturedCliContext = runtime.consumeThreadCapturedCliContext(projectId, command.payload.threadId);
      const promptContent = appendCapturedCliContext(command.payload.content, capturedCliContext);
      const answerProject = repository.appendMessage(projectId, "user", command.payload.content, {
        threadId: command.payload.threadId,
        attachments
      });
      runtime.upsertPersistedProject(answerProject);
      emitMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);

      const answeredProject = repository.answerPlanningQuestion(
        projectId,
        targetRun.id,
        command.payload.questionId,
        promptContent
      );
      runtime.upsertPersistedProject(answeredProject);
      emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
      archiveNotificationWithLegacyId(repository, ["planning-question", targetRun.id, command.payload.questionId]);
      repository.archiveNotification(
        createPlanningQuestionBatchNotificationId(
          targetRun.id,
          targetRun.questions
            .filter((question) => question.status === "pending" || question.status === "deferred")
            .map((question) => question.id)
        )
      );
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());

      if (pendingQuestion.intent?.type === "assistant-create-intent") {
        const assistantAnswer =
          pendingQuestion.responseKind === "freeform"
            ? classifyAssistantPurposeAnswer(command.payload.content)
            : classifyAssistantIntentAnswer(pendingQuestion, command.payload.content);
        if (assistantAnswer === "create") {
          const result = createAssistantFromThreadIntent({
            repository,
            runtime,
            projectId,
            threadId: command.payload.threadId,
            sourcePrompt: pendingQuestion.intent.sourcePrompt,
            name: pendingQuestion.intent.suggestedName,
            scope: pendingQuestion.intent.defaultScope,
            purpose: pendingQuestion.intent.purpose ?? (pendingQuestion.responseKind === "freeform" ? command.payload.content.trim() : undefined),
            agentId: agentRuntime.id,
            providerBrand,
            modeId: project.selectedModeId,
            executionModelId: targetRun.executionModelId ?? project.session.executionModelId,
            reasoningStrength: command.payload.reasoningStrength,
            fastMode: command.payload.fastMode
          });
          const completedProject = rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, projectId,
            targetRun.id, "Run completed", "completed");
          runtime.upsertPersistedProject(completedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
          emitAssistantSummaryDeltaToAll(connections, repository, [result.assistant.id]);
          emitAssistantCreatedCardToAll(connections, result.assistant);
          appendAssistantCreationMessage(ws, command.requestId, runtime, repository, projectId, command.payload.threadId, result);
          if (result.created && result.assistant.bootstrapState === "pending") {
            assistantManager.scheduleJobBootstrapCheck(result.assistant.id, "assistant-create-purpose");
            assistantManager.queueAssistantBootstrap(result.assistant.id);
          }
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }

        if (assistantAnswer === "cancel") {
          const stoppedProject = rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, projectId,
            targetRun.id, "Assistant creation cancelled.", "stopped");
          runtime.upsertPersistedProject(stoppedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
          const cancelProject = repository.appendMessage(projectId, "assistant", "Cancelled.", command.payload.threadId);
          runtime.upsertPersistedProject(cancelProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
      }

      if (pendingQuestion.intent?.type === "assistant-action-intent") {
        if (/^(cancel|never mind|stop)$/i.test(command.payload.content.trim())) {
          const stoppedProject = rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, projectId,
            targetRun.id, "Assistant action cancelled.", "stopped");
          runtime.upsertPersistedProject(stoppedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
          const cancelProject = repository.appendMessage(projectId, "assistant", "Cancelled.", command.payload.threadId);
          runtime.upsertPersistedProject(cancelProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
        const assistantAction = resolvePersistedAssistantChatAction({
          content: command.payload.content,
          projectId,
          repository,
          priorIntent: pendingQuestion.intent
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
          const completedProject = rejectPendingBrowserApprovalsForRun(pendingBrowserApprovals, repository, projectId,
            targetRun.id, "Run completed", "completed");
          runtime.upsertPersistedProject(completedProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
        if (assistantAction.kind === "clarify") {
          const questionProject = repository.appendPlanningQuestion(projectId, targetRun.id, createAssistantActionIntentQuestion(assistantAction));
          runtime.upsertPersistedProject(questionProject);
          emitRunUpdatedById(ws, command.requestId, repository, projectId, targetRun.id);
          const promptProject = repository.appendMessage(projectId, "assistant", assistantAction.prompt, command.payload.threadId);
          runtime.upsertPersistedProject(promptProject);
          emitThreadMessageAppended(ws, command.requestId, runtime, repository, projectId, command.payload.threadId);
          runtime.setProjectStreaming(projectId, false, command.payload.threadId);
          runtime.clearStreaming(projectId, command.payload.threadId);
          return;
        }
      }

      await continueAnsweredRun(command, context);
      return;
    }
    default:
      throw new Error(`Unsupported planning-answers command: ${command.type}`);
  }
}

async function continueAnsweredRun(
  command: Extract<ClientCommand, { type: "planning.answer" }>,
  context: PlanningAnswersCommandContext
) {
  const { ws, runtime, repository, runtimeRegistry, pendingBrowserApprovals, connections, derivedProgressHeartbeatMs, tokenUsageSession } = context;
  const projectId = command.payload.projectId;
  const project = runtime.getProject(projectId);
  const agentRuntime = resolveProjectAgentRuntime(runtimeRegistry, project);
  const targetRun = requirePersistedThreadRun(repository, projectId, command.payload.threadId, command.payload.runId);
  const providerBrand = repository.getProviderBrand();

  const linkedBackgroundRun = repository.getBackgroundJobRunByLinkedAgentRunId(targetRun.id);
      if (linkedBackgroundRun?.status === "awaiting-user-input") {
        archiveNotificationWithLegacyId(repository, ["planning-question", linkedBackgroundRun.id, command.payload.questionId]);
        const resumedBackgroundRun = repository.setBackgroundJobRunStatus(linkedBackgroundRun.id, "running", {
          summary: "Resuming after user input"
        });
        saveBackgroundRunStatusNotification(repository, resumedBackgroundRun);
        emitBackgroundJobRunUpdatedToAll(connections, resumedBackgroundRun);
        emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
        emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      }
      runtime.setProjectError(projectId, undefined, command.payload.threadId);
      runtime.setProjectStreaming(projectId, true, command.payload.threadId);
      runtime.clearStreaming(projectId, command.payload.threadId);
      repository.setAgentRunRuntimeBudget(projectId, targetRun.id, command.payload.runtimeBudget?.maxTurns);

      const abortController = new AbortController();
      runtime.setAbortController(projectId, targetRun.id, abortController);

      try {
        await continueRunLifecycle(ws, command.requestId, runtime, repository, createRunBudgetAdapter(agentRuntime.getAdapter(), repository, projectId, targetRun.id), pendingBrowserApprovals, connections, {
          projectId,
          threadId: command.payload.threadId,
          runId: targetRun.id,
          agentId: agentRuntime.id,
          providerBrand,
          debugEnabled: repository.getDebugEnabledDefault(),
          executionModelId: resolveExecutionModelIdForRuntime({
            runtime: agentRuntime,
            capability: agentRuntime.getCapability(),
            providerBrand,
            requestedModelId: targetRun.executionModelId ?? project.session.executionModelId
          }).modelId,
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
          targetRun.id
        );
      } finally {
        runtime.setProjectStreaming(projectId, false, command.payload.threadId);
        runtime.setAbortController(projectId, targetRun.id, undefined);
      }
}
