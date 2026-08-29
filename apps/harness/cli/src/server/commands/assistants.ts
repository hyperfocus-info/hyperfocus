import { bootstrapAssistantJobsIfNone, createOrUpdateAssistantWithJobs } from "../../assistant-factory";
import { buildAssistantJobBootstrapJobs, createAssistantJobBootstrapQuestionId } from "../../assistant-job-bootstrap";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import { createAssistantFactoryEvents, createAssistantFromThreadIntent, discardAssistantChatPumps, emitAssistantCreatedCardToAll, emitAssistantSummaryDeltaToAll, emitAssistantsUpdatedToAll, inferAssistantNameFromPrompt, scheduleAssistantReprioritizeIfActive, shouldAssistantReprioritize } from "../automation/assistant-actions";
import { emitBackgroundJobsDeletedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import { commitAssistantDeletion } from "../automation/background-run-cancellation";
import type { ServerCommandContext } from "./context";
import { sendEvent } from "../transport/events";
import { computeBackgroundJobRiskLevel, resolveProjectAgentRuntime } from "../workspace/preferences";
import { assertGlobalExecutionNotPaused } from "../execution/lifecycle";
import { assertActiveThread } from "../execution/state";
import { createAssistantAssetRefId, createAssistantId } from "@hyperfocus/ai-core/protocol";
import type { Assistant, ClientCommand } from "@hyperfocus/ai-core/protocol";

type AssistantCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "runtimeRegistry" | "assistantManager" | "connections" | "backgroundRunControllers" | "pendingBrowserApprovals">;

export async function handleAssistantsCommand(command: ClientCommand, context: AssistantCommandContext) {
  const { ws, repository, assistantManager, connections } = context;
  switch (command.type) {
case "assistant.create": {
      handleAssistantCreate(command, context);
      return;
    }
case "assistant.create-from-thread": {
      handleAssistantCreateFromThread(command, context);
      return;
    }
case "assistant.update": {
      repository.saveAssistant(command.payload.assistant, command.payload.assetRefs ?? []);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistant.id], { invalidateDetails: true });
      return;
    }
case "assistant.delete": {
      await handleAssistantDelete(command, context);
      return;
    }
case "assistant.pause": {
      repository.setAssistantRunState(command.payload.assistantId, "paused");
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId]);
      return;
    }
case "assistant.resume": {
      repository.setAssistantRunState(command.payload.assistantId, "active");
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId]);
      assistantManager.scheduleReprioritize(command.payload.assistantId, "manual-resume");
      return;
    }
case "assistant.clone-to-project": {
      handleAssistantClone(command, context);
      return;
    }
case "assistant.inspect": {
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId]);
      return;
    }
case "assistant.summary.list": {
      sendEvent(ws, {
        type: "assistant.summary.listed",
        requestId: command.requestId,
        payload: {
          assistants: repository.listAssistantSummaries(command.payload ?? {})
        }
      });
      return;
    }
case "assistant.detail.get": {
      sendEvent(ws, {
        type: "assistant.detail.loaded",
        requestId: command.requestId,
        payload: {
          detail: repository.getAssistantDetail({ assistantId: command.payload.assistantId })
        }
      });
      return;
    }
case "assistant.workloads.list": {
      handleAssistantWorkloadsList(command, context);
      return;
    }
case "assistant.thread.messages.list": {
      const messages = repository.listAssistantThreadMessages(command.payload);
      sendEvent(ws, {
        type: "assistant.thread.messages.listed",
        requestId: command.requestId,
        payload: {
          assistantId: command.payload.assistantId,
          threadId: messages.threadId,
          messages
        }
      });
      return;
    }
case "assistant.logs.list": {
      sendEvent(ws, {
        type: "assistant.logs.listed",
        requestId: command.requestId,
        payload: {
          assistantId: command.payload.assistantId,
          logs: repository.listAssistantLogs(command.payload)
        }
      });
      return;
    }
case "assistant.todos.list": {
      sendEvent(ws, {
        type: "assistant.todos.listed",
        requestId: command.requestId,
        payload: {
          assistantId: command.payload.assistantId,
          todos: repository.listAssistantTodos(command.payload)
        }
      });
      return;
    }
case "assistant.learnings.list": {
      sendEvent(ws, {
        type: "assistant.learnings.listed",
        requestId: command.requestId,
        payload: {
          assistantId: command.payload.assistantId,
          learnings: repository.listAssistantLearnings(command.payload)
        }
      });
      return;
    }
case "assistant.questions.list": {
      sendEvent(ws, {
        type: "assistant.questions.listed",
        requestId: command.requestId,
        payload: {
          assistantId: command.payload.assistantId,
          questions: repository.listAssistantQuestions(command.payload)
        }
      });
      return;
    }
case "assistant.bootstrap.retry": {
      assertGlobalExecutionNotPaused(repository);
      assertAssistantRunnableForLaunch(repository, command.payload.assistantId);
      const assistant = repository.getAssistant(command.payload.assistantId);
      assistantManager.queueAssistantBootstrap(command.payload.assistantId, {
        force: assistant?.bootstrapState !== "running", offerJobBootstrapAfterSuccess: true });
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId]);
      return;
    }
case "assistant.jobs.bootstrap": {
      handleAssistantJobsBootstrap(command, context);
      return;
    }
case "assistant.circuit-breaker.retry": {
      assertGlobalExecutionNotPaused(repository);
      await assistantManager.recoverAssistant(command.payload.assistantId);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId]);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "assistant.chat.send": {
      assertGlobalExecutionNotPaused(repository);
      assertAssistantRunnableForLaunch(repository, command.payload.assistantId);
      await assistantManager.sendAssistantChat(command.payload.assistantId, command.payload.content, {
        modeId: command.payload.modeId,
        executionModelId: command.payload.executionModelId,
        reasoningStrength: command.payload.reasoningStrength,
        fastMode: command.payload.fastMode
      });
      return;
    }
case "assistant.question.answer": {
      await handleAssistantQuestionAnswer(command, context);
      return;
    }
case "assistant.question.answer-batch": {
      await handleAssistantQuestionBatchAnswer(command, context);
      return;
    }
case "assistant.todo.update": {
      const todo = repository.updateAssistantTodo(command.payload.assistantId, command.payload.todoId, command.payload.patch);
      emitAssistantSummaryDeltaToAll(connections, repository, [todo.assistantId], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, assistantManager, todo.assistantId, "manual-todo-update");
      return;
    }
case "assistant.todo.delete": {
      repository.deleteAssistantTodo(command.payload.assistantId, command.payload.todoId);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, assistantManager, command.payload.assistantId, "manual-todo-delete");
      return;
    }
case "assistant.todo.reorder": {
      repository.reorderAssistantTodos(command.payload.assistantId, command.payload.todoIds);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, assistantManager, command.payload.assistantId, "manual-todo-reorder");
      return;
    }
case "assistant.learning.delete": {
      repository.deleteAssistantLearning(command.payload.assistantId, command.payload.learningId);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, assistantManager, command.payload.assistantId, "manual-learning-delete");
      return;
    }
case "assistant.learning.reorder": {
      repository.reorderAssistantLearnings(command.payload.assistantId, command.payload.learningIds);
      emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, assistantManager, command.payload.assistantId, "manual-learning-reorder");
      return;
    }
    default:
      throw new Error(`Unsupported assistants command: ${command.type}`);
  }
}

function handleAssistantCreate(
  command: Extract<ClientCommand, { type: "assistant.create" }>,
  context: AssistantCommandContext
) {
  const { repository, runtime, runtimeRegistry, assistantManager, connections } = context;
  const project = command.payload.assistant.projectId
    ? runtime.getProject(command.payload.assistant.projectId)
    : undefined;
  const providerBrand = command.payload.assistant.providerBrand ?? repository.getProviderBrand();
  const agentRuntime = runtimeRegistry.get(command.payload.assistant.agentId);
  const result = createOrUpdateAssistantWithJobs({
    repository,
    assistant: command.payload.assistant,
    assetRefs: command.payload.assetRefs ?? [],
    launchDefaults: {
      providerBrand,
      planningModelId: agentRuntime.getDefaultPlanningModelId(providerBrand),
      executionModelId: command.payload.assistant.executionModelId ?? project?.session.executionModelId,
      reasoningStrength: command.payload.assistant.reasoningStrength,
      fastMode: command.payload.assistant.fastMode,
      modeId: command.payload.assistant.modeId ?? project?.selectedModeId
    },
    emit: createAssistantFactoryEvents(connections)
  });
  if (result.created) assistantManager.scheduleJobBootstrapCheck(result.assistant.id, "assistant-create-command");
  assistantManager.queueAssistantBootstrap(result.assistant.id);
}

function handleAssistantCreateFromThread(
  command: Extract<ClientCommand, { type: "assistant.create-from-thread" }>,
  context: AssistantCommandContext
) {
  const { repository, runtime, runtimeRegistry, assistantManager, connections } = context;
  const project = runtime.getProject(command.payload.projectId);
  assertActiveThread(project, command.payload.threadId);
  const result = createAssistantFromThreadIntent({
    repository,
    runtime,
    projectId: command.payload.projectId,
    threadId: command.payload.threadId,
    sourcePrompt: command.payload.sourcePrompt,
    name: command.payload.name ?? inferAssistantNameFromPrompt(command.payload.sourcePrompt),
    scope: command.payload.scope ?? "project",
    agentId: command.payload.agentId,
    providerBrand: repository.getProviderBrand(),
    planningModelId: resolveProjectAgentRuntime(runtimeRegistry, project).getDefaultPlanningModelId(repository.getProviderBrand()),
    modeId: command.payload.modeId ?? project.selectedModeId,
    executionModelId: command.payload.executionModelId ?? project.session.executionModelId,
    reasoningStrength: command.payload.reasoningStrength,
    fastMode: command.payload.fastMode,
    emit: createAssistantFactoryEvents(connections)
  });
  if (result.created && result.assistant.bootstrapState === "pending") {
    assistantManager.scheduleJobBootstrapCheck(result.assistant.id, "assistant-create-from-thread");
    assistantManager.queueAssistantBootstrap(result.assistant.id);
  }
}

function handleAssistantClone(
  command: Extract<ClientCommand, { type: "assistant.clone-to-project" }>,
  context: AssistantCommandContext
) {
  const { repository, assistantManager, connections } = context;
  const source = repository.getAssistant(command.payload.assistantId);
  if (!source) throw new Error(`Unknown assistant: ${command.payload.assistantId}`);
  const now = new Date().toISOString();
  const clonedAssistant: Assistant = {
    ...source,
    id: createAssistantId(),
    scope: "project",
    projectId: command.payload.projectId,
    clonedFromAssistantId: source.id,
    circuitBreakerState: "closed",
    circuitBreakerReason: undefined,
    failureStreakCount: 0,
    unreadQuestionCount: 0,
    latestActivityAt: now,
    deletedAt: undefined,
    createdAt: now,
    updatedAt: now
  };
  const clonedAssetRefs = repository.getAssistantAssetRefs(source.id).map((assetRef) => ({
    ...assetRef,
    id: createAssistantAssetRefId(),
    assistantId: clonedAssistant.id,
    createdAt: now
  }));
  const savedAssistant = repository.cloneAssistantToProject(
    source.id,
    command.payload.projectId,
    clonedAssistant,
    clonedAssetRefs
  );
      emitAssistantSummaryDeltaToAll(connections, repository, [savedAssistant.id]);
  emitAssistantCreatedCardToAll(connections, savedAssistant);
  assistantManager.scheduleJobBootstrapCheck(savedAssistant.id, "assistant-clone");
}

async function handleAssistantDelete(
  command: Extract<ClientCommand, { type: "assistant.delete" }>,
  context: AssistantCommandContext
) {
  const { repository, runtime, assistantManager, connections, backgroundRunControllers } = context;
  const { deletedJobIds } = await commitAssistantDeletion({ repository, runtime, backgroundRunControllers,
    assistantId: command.payload.assistantId, afterCommit: () => {
      assistantManager.invalidateAssistant(command.payload.assistantId);
      discardAssistantChatPumps(command.payload.assistantId);
    } });
  emitBackgroundJobsDeletedToAll(connections, command.requestId,
    [{ kind: "assistant", assistantId: command.payload.assistantId }], deletedJobIds);
  emitAssistantsUpdatedToAll(connections, repository.loadAssistantSummaryDelta([]), [command.payload.assistantId]);
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
}

function handleAssistantJobsBootstrap(
  command: Extract<ClientCommand, { type: "assistant.jobs.bootstrap" }>,
  context: AssistantCommandContext
) {
  const { repository, runtime, runtimeRegistry, connections } = context;
  assertGlobalExecutionNotPaused(repository);
  const assistant = assertAssistantRunnableForLaunch(repository, command.payload.assistantId);
  const projectId = assistant.scope === "project" ? assistant.projectId : command.payload.projectId;
  if (!projectId) throw new Error("Project is required to bootstrap jobs for a global assistant");
  const project = runtime.getProject(projectId);
  const providerBrand = assistant.providerBrand ?? repository.getProviderBrand();
  const agentRuntime = runtimeRegistry.get(assistant.agentId);
  const jobs = buildAssistantJobBootstrapJobs({
    assistant,
    projectId,
    providerExecutionModelId: project.session.executionModelId,
    projectModeId: project.selectedModeId
  }).map((job) => ({ ...job, riskLevel: computeBackgroundJobRiskLevel(job, project, runtime) }));
  bootstrapAssistantJobsIfNone({
    repository,
    assistant,
    jobs,
    launchDefaults: {
      providerBrand,
      planningModelId: agentRuntime.getDefaultPlanningModelId(providerBrand),
      executionModelId: assistant.executionModelId ?? project.session.executionModelId,
      reasoningStrength: assistant.reasoningStrength,
      fastMode: assistant.fastMode,
      modeId: assistant.modeId ?? project.selectedModeId
    },
    emit: createAssistantFactoryEvents(connections)
  }, {
    confirmation: {
      questionId: createAssistantJobBootstrapQuestionId(assistant.id),
      answerText: "Yes, create default assistant-owned jobs."
    }
  });
  emitAssistantSummaryDeltaToAll(connections, repository, [assistant.id], { invalidateDetails: true });
  emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
  emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
}

async function handleAssistantQuestionAnswer(
  command: Extract<ClientCommand, { type: "assistant.question.answer" }>,
  context: AssistantCommandContext
) {
  const { repository, assistantManager, connections } = context;
  assertGlobalExecutionNotPaused(repository);
  await assistantManager.answerQuestion(command.payload.assistantId, command.payload.questionId, command.payload.content, {
    reprioritize: shouldAssistantReprioritize(repository, command.payload.assistantId)
  });
  emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
  emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
}

async function handleAssistantQuestionBatchAnswer(
  command: Extract<ClientCommand, { type: "assistant.question.answer-batch" }>,
  context: AssistantCommandContext
) {
  const { repository, assistantManager, connections } = context;
  assertGlobalExecutionNotPaused(repository);
  await assistantManager.answerQuestions(command.payload.assistantId, command.payload.answers, {
    reprioritize: shouldAssistantReprioritize(repository, command.payload.assistantId)
  });
  emitAssistantSummaryDeltaToAll(connections, repository, [command.payload.assistantId], { invalidateDetails: true });
  emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
}

function handleAssistantWorkloadsList(
  command: Extract<ClientCommand, { type: "assistant.workloads.list" }>,
  context: Pick<AssistantCommandContext, "ws" | "repository">
) {
  const requestJobs = command.payload.jobs ?? (command.payload.runs ? undefined : {});
  const requestRuns = command.payload.runs ?? (command.payload.jobs ? undefined : {});
  sendEvent(context.ws, {
    type: "assistant.workloads.listed",
    requestId: command.requestId,
    payload: {
      assistantId: command.payload.assistantId,
      jobsCursor: requestJobs?.cursor,
      runsCursor: requestRuns?.cursor,
      jobs: requestJobs
        ? context.repository.listAssistantBackgroundJobs({
            assistantId: command.payload.assistantId,
            cursor: requestJobs.cursor,
            limit: requestJobs.limit
          })
        : undefined,
      runs: requestRuns
        ? context.repository.listAssistantBackgroundJobRuns({
            assistantId: command.payload.assistantId,
            cursor: requestRuns.cursor,
            limit: requestRuns.limit
          })
        : undefined
    }
  });
}
