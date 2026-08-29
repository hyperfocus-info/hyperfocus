import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import type { AssistantActionIntentDraft, AssistantChatActionResolution } from "../../assistant-chat-actions";
import { createOrUpdateAssistantWithJobs } from "../../assistant-factory";
import type { AssistantFactoryEvents } from "../../assistant-factory";
import { detectAssistantChatIntent } from "../../assistant-intent";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import type { AssistantManager } from "../../assistant-manager";
import { requireBackgroundJobForProject } from "../../background-job-command-guards";
import { previewBackgroundJobSchedule } from "../../background-job-schedule";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { isBackgroundRunLive, repairBackgroundJobRunsForJob, safeLaunchBackgroundJobRun } from "./background-runs";
import { formatActiveBackgroundRunError } from "./background-run-cancellation";
import { emitBackgroundJobRunUpdatedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "./background-events";
import { STREAM_DELTA_FLUSH_MS, STREAM_DELTA_MAX_BUFFERED_BYTES } from "../core/constants";
import type { BackgroundRunControl, HarnessConnection } from "../core/contracts";
import { emitControlEvent, type ControlEventConnections } from "../transport/events";
import { archiveNotificationWithLegacyId } from "./notifications";
import { computeBackgroundJobRiskLevel, resolveBackgroundJobNextRunAt } from "../workspace/preferences";
import type { AssistantCreationResult } from "../workspace/preferences";
import { CHAT_MESSAGE_CONTENT_MAX_CHARS } from "@hyperfocus/ai-core/protocol";
import { emitThreadMessageAppended } from "../workspace/project-events";
import { createStreamPump, DEFAULT_STREAM_MAX_QUEUED_BYTES, type StreamPump } from "../../stream-pump";
import { debugLog } from "../../logging";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import { createAssistantAssetRefId, createAssistantId, createBackgroundJobId, createThreadId } from "@hyperfocus/ai-core/protocol";
import type { AgentId, Assistant, AssistantActionMessageMetadata, AssistantActionPlanningIntent, AssistantLiveThreadMetadata, BackgroundJob, ChatMessage, ComposerReasoningStrength, PlanningQuestion, ProjectId, ProviderBrand, ThreadId, TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export function findExistingAssistantForThreadIntent(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  name: string,
  scope: "project" | "global"
) {
  return repository.findAssistantByIntentIdentity(projectId, name, scope);
}

export function createAssistantFromThreadIntent(input: {
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  projectId: ProjectId;
  threadId: ThreadId;
  sourcePrompt: string;
  name: string;
  scope: "project" | "global";
  purpose?: string;
  agentId?: AgentId;
  providerBrand?: ProviderBrand;
  planningModelId?: string;
  modeId?: string;
  executionModelId?: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  emit?: AssistantFactoryEvents;
}): AssistantCreationResult {
  const project = input.runtime.getProject(input.projectId);
  if (project.activeThreadId !== input.threadId && !project.threads.some((thread) => thread.id === input.threadId)) {
    throw new Error(`Unknown thread: ${input.threadId}`);
  }

  const existing = findExistingAssistantForThreadIntent(input.repository, input.projectId, input.name, input.scope);
  if (existing) {
    return {
      assistant: createOrUpdateAssistantWithJobs({
        repository: input.repository,
        assistant: existing,
        assetRefs: input.repository.getAssistantAssetRefs(existing.id),
        launchDefaults: {
          providerBrand: input.providerBrand ?? input.repository.getProviderBrand(),
          planningModelId: input.planningModelId,
          executionModelId: input.executionModelId,
          reasoningStrength: input.reasoningStrength,
          fastMode: input.fastMode,
          modeId: input.modeId
        },
        emit: input.emit
      }).assistant,
      created: false
    };
  }

  const now = new Date().toISOString();
  const projectScope = input.scope === "project";
  const assistant: Assistant = {
    id: createAssistantId(),
    name: input.name,
    scope: input.scope,
    projectId: projectScope ? input.projectId : undefined,
    description: projectScope
      ? "Project assistant created from thread prompt."
      : "Global assistant created from thread prompt.",
    personalityPrompt:
      "You are a focused assistant operator. Be direct, pragmatic, and careful with existing project conventions. Keep the user informed with concise status and ask when intent is ambiguous.",
    jobPrompt: [
      `Original thread prompt: ${input.sourcePrompt}`,
      input.purpose ? `Assistant purpose: ${input.purpose}` : undefined,
      `Project root: ${project.rootPath}`,
      "Maintain assistant-owned todos, questions, learnings, and logs for ongoing work.",
      "Do not pollute normal project chat with assistant-owned routine output unless the user explicitly asks to promote it."
    ].filter(Boolean).join("\n"),
    agentId: input.agentId ?? "pi",
    providerBrand: input.providerBrand,
    modeId: input.modeId,
    executionModelId: input.executionModelId,
    reasoningStrength: input.reasoningStrength,
    fastMode: input.fastMode,
    runState: "active",
    bootstrapState: "pending",
    bootstrapAttemptId: undefined,
    bootstrapStartedAt: undefined,
    bootstrapFinishedAt: undefined,
    clonedFromAssistantId: undefined,
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    circuitBreakerReason: undefined,
    deletedAt: undefined,
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now
  };

  return {
    assistant: createOrUpdateAssistantWithJobs({
      repository: input.repository,
      assistant,
      launchDefaults: {
        providerBrand: input.providerBrand ?? input.repository.getProviderBrand(),
        planningModelId: input.planningModelId,
        executionModelId: input.executionModelId,
        reasoningStrength: input.reasoningStrength,
        fastMode: input.fastMode,
        modeId: input.modeId
      },
      emit: input.emit
    }).assistant,
    created: true
  };
}

export function appendAssistantCreationMessage(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  result: AssistantCreationResult
) {
  const scopeLabel = result.assistant.scope === "global" ? "global assistant" : "project assistant";
  const content = result.created
    ? `Created ${scopeLabel} "${result.assistant.name}".`
    : `Assistant "${result.assistant.name}" already exists. Opened it in Assistants.`;
  const messageProject = repository.appendMessage(projectId, "assistant", content, {
    threadId,
    metadata: {
      type: "assistant-action",
      assistantId: result.assistant.id,
      assistantName: result.assistant.name,
      actionKind: "create",
      summaryRows: [
        { label: "Assistant", value: result.assistant.name },
        { label: "Action", value: result.created ? "created" : "already existed" },
        { label: "Scope", value: scopeLabel }
      ],
      actions: buildAssistantCreationCardActions(repository, result.assistant)
    }
  });
  runtime.upsertPersistedProject(messageProject);
  emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, threadId);
}

type ExecuteAssistantChatActionInput = {
  ws: Bun.ServerWebSocket<HarnessConnection>;
  requestId: string;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  adapter: PiAgentAdapter;
  runtimeRegistry: AgentRuntimeRegistry;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  assistantManager: AssistantManager;
  projectId: ProjectId;
  threadId: ThreadId;
  action: AssistantActionIntentDraft & { assistant: Assistant };
  tokenUsageSession: TokenUsageTotals;
};

export async function executeAssistantChatAction(input: ExecuteAssistantChatActionInput) {
  const { repository, action } = input;
  let assistant = action.assistant;
  let content = "";
  let metadata: AssistantActionMessageMetadata;
  const rows: AssistantActionMessageMetadata["summaryRows"] = [
    { label: "Assistant", value: assistant.name },
    { label: "Action", value: action.actionKind }
  ];
  let jobId: string | undefined;
  let runId: string | undefined;
  let questionId = action.questionId;

  switch (action.actionKind) {
    case "chat": {
      assistant = requireAssistantForProjectChat(repository, assistant.id);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      await input.assistantManager.sendAssistantChat(assistant.id, action.answerText ?? action.sourcePrompt);
      content = `Sent message to ${assistant.name}.`;
      break;
    }
    case "inspect": {
      const counts = repository.getAssistantOperationalCounts(assistant.id);
      const jobs = readAssistantJobSummary(repository, assistant.id);
      rows.push(
        { label: "Todos", value: String(counts.openTodoCount) }, { label: "Questions", value: String(counts.pendingQuestionCount) },
        { label: "Jobs", value: String(jobs.count) }
      );
      content = `${assistant.name} has ${jobs.count} job(s), ${counts.openTodoCount} open todo(s), and ${counts.pendingQuestionCount} pending question(s).`;
      break;
    }
    case "list-jobs": {
      const jobs = readAssistantJobSummary(repository, assistant.id);
      rows.push(...jobs.items.map((job) => ({ label: job.status, value: job.name })));
      content = jobs.count > 0 ? `${assistant.name} has ${jobs.count} assistant-owned job(s).` : `${assistant.name} has no assistant-owned jobs.`;
      break;
    }
    case "create-job": {
      assistant = requireAssistantForProjectChat(repository, assistant.id);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      assertAssistantOwnsProjectOrGlobal(repository, assistant.id, input.projectId);
      const { job, savedJob, scheduleText } = createAssistantOwnedJob(input, assistant);
      jobId = job.id;
      const profile = savedJob.definition.kind === "ai-routine" ? savedJob.definition.launchProfile : undefined;
      rows.push(
        { label: "Job", value: savedJob.name },
        { label: "Schedule", value: scheduleText },
        { label: "Launch", value: formatLaunchProfileSummary(profile) }
      );
      content = `Created assistant-owned job "${job.name}" for ${assistant.name}.`;
      break;
    }
    case "run-job": {
      assistant = requireAssistantForProjectChat(repository, assistant.id);
      assertAssistantRunnableForLaunch(repository, assistant.id);
      assertAssistantOwnsProjectOrGlobal(repository, assistant.id, input.projectId);
      if (!action.jobId) {
        throw new Error("Background job is required.");
      }
      const loadedJob = requireBackgroundJobForProject(repository, input.projectId, action.jobId);
      const job = repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
      if (job.assistantId !== assistant.id) {
        throw new Error("Background job does not belong to assistant.");
      }
      await repairBackgroundJobRunsForJob(
        repository,
        input.connections,
        action.jobId,
        (run) => isBackgroundRunLive(input.backgroundRunControllers, input.runtime, run)
      );
      const activeRun = repository.getActiveBackgroundJobRuns(action.jobId)[0];
      if (activeRun) {
        throw new Error(formatActiveBackgroundRunError(activeRun));
      }
      const queuedRun = repository.createBackgroundJobRun({
        jobId: job.id,
        projectId: job.projectId,
        assistantId: job.assistantId,
        automationThreadId: job.automationThreadId,
        triggerSource: "manual",
        status: "queued",
        riskLevel: job.riskLevel,
        approvalStatus: "approved"
      });
      repository.appendBackgroundJobRunEvent(queuedRun.id, "queued", "Assistant job queued from project chat");
      emitBackgroundJobsUpdatedToAll(input.connections, repository.loadBackgroundJobsState());
      emitBackgroundJobRunUpdatedToAll(input.connections, queuedRun);
      await safeLaunchBackgroundJobRun(
        input.connections,
        repository,
        input.runtimeRegistry,
        input.runtime,
        input.backgroundRunControllers,
        input.assistantManager,
        queuedRun.id,
        input.tokenUsageSession
      );
      jobId = job.id;
      runId = queuedRun.id;
      rows.push({ label: "Job", value: job.name }, { label: "Run", value: queuedRun.id });
      content = `Queued ${assistant.name} job "${job.name}".`;
      break;
    }
    case "pause": {
      repository.setAssistantRunState(assistant.id, "paused");
      emitAssistantSummaryDeltaToAll(input.connections, repository, [assistant.id]);
      content = `Paused ${assistant.name}.`;
      break;
    }
    case "resume": {
      repository.setAssistantRunState(assistant.id, "active");
      emitAssistantSummaryDeltaToAll(input.connections, repository, [assistant.id]);
      input.assistantManager.scheduleReprioritize(assistant.id, "project-chat-resume");
      content = `Resumed ${assistant.name}.`;
      break;
    }
    case "clone": {
      const clonedAssistant = cloneAssistantForProject(repository, assistant, input.projectId);
      emitAssistantSummaryDeltaToAll(input.connections, repository, [clonedAssistant.id]);
      emitAssistantCreatedCardToAll(input.connections, clonedAssistant);
      rows.push({ label: "Clone", value: clonedAssistant.name });
      content = `Cloned ${assistant.name} to this project.`;
      break;
    }
    case "answer-question": {
      assistant = requireAssistantForProjectChat(repository, assistant.id);
      if (!questionId) {
        throw new Error("Assistant question is required.");
      }
      await input.assistantManager.answerQuestion(assistant.id, questionId, action.answerText ?? action.sourcePrompt, {
        reprioritize: shouldAssistantReprioritize(repository, assistant.id)
      });
      archiveNotificationWithLegacyId(repository, ["assistant-question", assistant.id, questionId]);
      emitAssistantSummaryDeltaToAll(input.connections, repository, [assistant.id], { invalidateDetails: true });
      emitNotificationsUpdatedToAll(input.connections, input.requestId, repository.loadNotificationInboxState());
      content = `Answered ${assistant.name}'s question.`;
      break;
    }
    case "update-todo": {
      assistant = requireAssistantForProjectChat(repository, assistant.id);
      if (!action.todoId) {
        throw new Error("Assistant todo is required.");
      }
      const todo = repository.getAssistantTodoForAssistant(assistant.id, action.todoId);
      const now = new Date().toISOString();
      repository.saveAssistantTodo({ ...todo, state: "completed", completedAt: now, updatedAt: now });
      emitAssistantSummaryDeltaToAll(input.connections, repository, [assistant.id], { invalidateDetails: true });
      scheduleAssistantReprioritizeIfActive(repository, input.assistantManager, assistant.id, "project-chat-todo-update");
      rows.push({ label: "Todo", value: todo.title });
      content = `Marked ${assistant.name} todo complete.`;
      break;
    }
    case "recover": {
      await input.assistantManager.recoverAssistant(assistant.id);
      emitAssistantSummaryDeltaToAll(input.connections, repository, [assistant.id]);
      content = `Recovery started for ${assistant.name}.`;
      break;
    }
    case "create":
      throw new Error("Assistant creation is handled before assistant action execution.");
  }

  metadata = {
    type: "assistant-action",
    assistantId: assistant.id,
    assistantName: assistant.name,
    actionKind: action.actionKind,
    jobId,
    runId,
    questionId,
    summaryRows: rows,
    actions: buildAssistantActionCardActions(repository, assistant, { jobId, questionId })
  };

  const messageProject = repository.appendMessage(input.projectId, "assistant", content, {
    threadId: input.threadId,
    metadata
  });
  input.runtime.upsertPersistedProject(messageProject);
  emitThreadMessageAppended(input.ws, input.requestId, input.runtime, repository, input.projectId, input.threadId);
}

function createAssistantOwnedJob(input: ExecuteAssistantChatActionInput, assistant: Assistant) {
  const { action, repository } = input;
  const scheduleText = action.scheduleText?.trim();
  if (!scheduleText) throw new Error("Schedule input is required.");
  const preview = previewBackgroundJobSchedule(scheduleText);
  if (!preview.schedule) throw new Error(preview.error ?? "Invalid schedule.");
  const now = new Date().toISOString();
  const project = input.runtime.getProject(input.projectId);
  const providerBrand = assistant.providerBrand ?? repository.getProviderBrand();
  const agentRuntime = input.runtimeRegistry.get(assistant.agentId);
  const job: BackgroundJob = {
    id: createBackgroundJobId(), projectId: input.projectId, assistantId: assistant.id,
    automationThreadId: createThreadId(), kind: "ai-routine",
    name: `${assistant.name}: ${summarizeAssistantActionText(action.jobPrompt ?? action.sourcePrompt, 80)}`,
    description: "Assistant-owned job created from project chat.", status: "enabled", riskLevel: "unsafe",
    definition: {
      kind: "ai-routine", prompt: action.jobPrompt ?? action.sourcePrompt,
      modeId: assistant.modeId ?? project.selectedModeId,
      executionModelId: assistant.executionModelId ?? project.session.executionModelId,
      reasoningStrength: assistant.reasoningStrength, fastMode: assistant.fastMode
    },
    schedule: preview.schedule, scheduleInput: scheduleText, timezone: preview.timezone,
    nextRunAt: resolveBackgroundJobNextRunAt(preview.schedule), createdAt: now, updatedAt: now
  };
  const saved = createOrUpdateAssistantWithJobs({
    repository, assistant,
    jobs: [{ ...job, riskLevel: computeBackgroundJobRiskLevel(job, project, input.runtime) }],
    launchDefaults: {
      providerBrand, planningModelId: agentRuntime.getDefaultPlanningModelId(providerBrand),
      executionModelId: assistant.executionModelId ?? project.session.executionModelId,
      reasoningStrength: assistant.reasoningStrength, fastMode: assistant.fastMode,
      modeId: assistant.modeId ?? project.selectedModeId
    },
    emit: createAssistantFactoryEvents(input.connections)
  });
  return { job, savedJob: saved.jobs[0] ?? job, scheduleText };
}

export function cloneAssistantForProject(repository: WorkspaceRepository, source: Assistant, projectId: ProjectId) {
  const now = new Date().toISOString();
  const clonedAssistant: Assistant = {
    ...source,
    id: createAssistantId(),
    scope: "project",
    projectId,
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
  return repository.cloneAssistantToProject(source.id, projectId, clonedAssistant, clonedAssetRefs);
}

export function requireAssistantForProjectChat(repository: WorkspaceRepository, assistantId: string) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  if (assistant.deletedAt) {
    throw new Error(`Assistant ${assistant.name} is deleted`);
  }
  return assistant;
}

export function assertAssistantOwnsProjectOrGlobal(repository: WorkspaceRepository, assistantId: string, projectId: ProjectId) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant || assistant.deletedAt) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  if (assistant.scope === "project" && assistant.projectId !== projectId) {
    throw new Error("Assistant does not belong to project");
  }
  return assistant;
}

export function scheduleAssistantReprioritizeIfActive(
  repository: WorkspaceRepository,
  assistantManager: AssistantManager,
  assistantId: string,
  reason: string
) {
  if (!shouldAssistantReprioritize(repository, assistantId)) {
    return;
  }
  assistantManager.scheduleReprioritize(assistantId, reason);
}

export function shouldAssistantReprioritize(repository: WorkspaceRepository, assistantId: string) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant || assistant.deletedAt || assistant.runState === "paused" || assistant.circuitBreakerState === "tripped") {
    return false;
  }
  return true;
}

export function buildAssistantActionCardActions(
  repository: WorkspaceRepository,
  assistant: Assistant,
  input: { jobId?: string; questionId?: string }
): AssistantActionMessageMetadata["actions"] {
  const disabledReason =
    repository.getGlobalExecutionPaused()
      ? "Global execution is paused"
      : assistant.circuitBreakerState === "tripped"
        ? "Recover assistant first"
        : assistant.runState === "paused"
          ? "Assistant is paused"
          : undefined;
  const recoverDisabledReason = repository.getGlobalExecutionPaused() ? "Global execution is paused" : undefined;
  return [
    { kind: "open-assistant", label: "Open assistant" },
    { kind: "open-jobs", label: "Open jobs" },
    { kind: "run-job", label: "Run job", disabled: Boolean(disabledReason || !input.jobId), disabledReason: disabledReason ?? "No job selected" },
    { kind: assistant.runState === "paused" ? "resume" : "pause", label: assistant.runState === "paused" ? "Resume" : "Pause" },
    { kind: "answer-question", label: "Answer question", disabled: !input.questionId, disabledReason: "No question selected" },
    { kind: "recover", label: "Recover", disabled: Boolean(recoverDisabledReason), disabledReason: recoverDisabledReason }
  ];
}

export function buildAssistantCreationCardActions(repository: WorkspaceRepository, assistant: Assistant): AssistantActionMessageMetadata["actions"] {
  const retryDisabledReason =
    repository.getGlobalExecutionPaused()
      ? "Global execution is paused"
      : assistant.circuitBreakerState === "tripped"
        ? "Recover assistant first"
        : undefined;
  return [
    { kind: "open-assistant", label: "Open assistant" },
    { kind: "retry-bootstrap", label: "Retry bootstrap", disabled: Boolean(retryDisabledReason), disabledReason: retryDisabledReason },
    { kind: "schedule-job", label: "Schedule job" }
  ];
}

export function summarizeAssistantActionText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized || "Assistant job";
}

export function formatLaunchProfileSummary(profile: {
  agentId?: string;
  providerBrand?: string;
  executionModelId?: string;
  reasoningStrength?: string;
  fastMode?: boolean;
} | undefined) {
  if (!profile) {
    return "project defaults";
  }
  const parts = [
    profile.agentId,
    profile.providerBrand,
    profile.executionModelId,
    profile.reasoningStrength,
    profile.fastMode ? "fast" : undefined
  ].filter(Boolean);
  return parts.join(" / ") || "project defaults";
}

export function inferAssistantNameFromPrompt(sourcePrompt: string) {
  const intent = detectAssistantChatIntent(sourcePrompt);
  if (intent.kind === "create-ready" || intent.kind === "create-needs-purpose") {
    return intent.name;
  }
  return "Thread assistant";
}

export function createAssistantPurposeQuestion(input: {
  projectId: ProjectId;
  threadId: ThreadId;
  sourcePrompt: string;
  suggestedName: string;
  defaultScope: "project" | "global";
}): Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "responseKind" | "required" | "intent"> {
  return {
    id: "assistant-create-purpose",
    prompt: `What should ${input.suggestedName} do for this project?`,
    placeholder: "Use Kojima to triage failed tests, maintain docs, and keep project todos current.",
    responseKind: "freeform",
    required: true,
    intent: {
      type: "assistant-create-intent",
      projectId: input.projectId,
      threadId: input.threadId,
      sourcePrompt: input.sourcePrompt,
      suggestedName: input.suggestedName,
      defaultScope: input.defaultScope,
      requiresPurpose: true
    }
  };
}

export function createAssistantActionIntentQuestion(input: Extract<AssistantChatActionResolution, { kind: "clarify" }>): Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "responseKind" | "choices" | "required" | "intent"> {
  const intent: AssistantActionPlanningIntent = {
    type: "assistant-action-intent",
    actionKind: input.intent.actionKind,
    sourcePrompt: input.intent.sourcePrompt,
    assistantSelector: input.intent.assistantSelector,
    candidateAssistantIds: input.intent.candidateAssistantIds,
    candidateJobIds: input.intent.candidateJobIds,
    candidateQuestionIds: input.intent.candidateQuestionIds,
    candidateTodoIds: input.intent.candidateTodoIds,
    scheduleText: input.intent.scheduleText,
    jobPrompt: input.intent.jobPrompt,
    jobId: input.intent.jobId,
    questionId: input.intent.questionId,
    todoId: input.intent.todoId,
    answerText: input.intent.answerText
  };
  const choices = input.choices.map((choice, index) => ({
    id: choice.id,
    label: choice.label,
    description: choice.description,
    answerText: choice.answerText || choice.label,
    recommended: choice.recommended || index === 0
  }));
  while (choices.length < 3) {
    choices.push({
      id: `assistant-action:fallback:${choices.length}`,
      label: choices.length === 1 ? "Cancel" : "Run once",
      description: choices.length === 1 ? "Do not run an assistant action." : "Use normal project chat instead.",
      answerText: choices.length === 1 ? "cancel" : "run once",
      recommended: false
    });
  }
  return {
    id: "assistant-action-intent",
    prompt: input.prompt,
    placeholder: "Answer with assistant, schedule, job, question, or todo details.",
    responseKind: "choice",
    choices: choices.slice(0, 3),
    required: true,
    intent
  };
}

export function classifyAssistantIntentAnswer(question: PlanningQuestion, answerText: string) {
  const trimmed = answerText.trim();
  if (trimmed === question.choices?.[0]?.answerText || /^create a project assistant\b/i.test(trimmed)) {
    return "create";
  }
  if (trimmed === question.choices?.[2]?.answerText || /^cancel\b/i.test(trimmed)) {
    return "cancel";
  }
  return "run-once";
}

export function classifyAssistantPurposeAnswer(answerText: string) {
  return /^cancel\b/i.test(answerText.trim()) ? "cancel" : "create";
}

export function emitAssistantsUpdatedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistants: ReturnType<WorkspaceRepository["loadAssistantSummaryState"]>,
  deletedAssistantIds: string[] = []
) {
  const uniqueDeletedIds = [...new Set(deletedAssistantIds)];
  if (uniqueDeletedIds.length === 0) { emitAssistantStateToAll(connections, assistants, [], []); return; }
  for (let offset = 0; offset < uniqueDeletedIds.length; offset += 512) {
    emitAssistantStateToAll(connections, offset === 0 ? assistants : emptyAssistantSummaryState(), [],
      uniqueDeletedIds.slice(offset, offset + 512));
  }
}

export function emitAssistantDetailsChangedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistants: ReturnType<WorkspaceRepository["loadAssistantSummaryState"]>,
  invalidatedDetailAssistantIds: [string, ...string[]]
) {
  emitAssistantStateToAll(connections, assistants, invalidatedDetailAssistantIds, []);
}

export function emitAssistantSummaryDeltaToAll(connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  repository: WorkspaceRepository, assistantIds: string[], options: { invalidateDetails?: boolean } = {}) {
  const uniqueIds = [...new Set(assistantIds)];
  for (let offset = 0; offset < uniqueIds.length; offset += 512) { const ids = uniqueIds.slice(offset, offset + 512);
    emitAssistantStateToAll(connections, repository.loadAssistantSummaryDelta(ids),
      options.invalidateDetails ? ids : [], []); }
}

function emptyAssistantSummaryState(): ReturnType<WorkspaceRepository["loadAssistantSummaryState"]> {
  return { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
}

function readAssistantJobSummary(repository: WorkspaceRepository, assistantId: string) {
  const items: BackgroundJob[] = []; let count = 0; let cursor: string | undefined;
  do { const page = repository.listAssistantBackgroundJobs({ assistantId, cursor, limit: 128 }); count += page.items.length;
    items.push(...page.items.slice(0, 6 - items.length)); cursor = page.nextCursor; } while (cursor !== undefined);
  return { items, count };
}

function emitAssistantStateToAll(connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistants: ReturnType<WorkspaceRepository["loadAssistantSummaryState"]>, invalidatedDetailAssistantIds: string[],
  deletedAssistantIds: string[]) {
  const summaryState = {
    ...assistants,
    threads: [],
    todos: [],
    learnings: [],
    questions: [],
    logs: [],
    assetRefs: []
  };
  emitControlEvent(connections, { type: "assistants.updated", requestId: `assistant:auto:${crypto.randomUUID()}`,
    payload: { assistants: summaryState, invalidatedDetailAssistantIds, deletedAssistantIds } });
}

export function createAssistantFactoryEvents(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>
): AssistantFactoryEvents {
  return {
    assistantsUpdated: (state) => emitAssistantsUpdatedToAll(connections, state),
    assistantCreatedCard: (assistant) => emitAssistantCreatedCardToAll(connections, assistant),
    backgroundJobsUpdated: (state) => emitBackgroundJobsUpdatedToAll(connections, state)
  };
}

export function emitAssistantChatDeltaToAll(
  connections: ControlEventConnections,
  input: { assistantId: string; sessionId: string; delta: string }
) {
  const pump = getAssistantChatPump(connections, input.assistantId, input.sessionId);
  pump.push(input.delta);
}

export const assistantChatPumps = new Map<string, StreamPump>();

export function getAssistantChatPump(connections: ControlEventConnections, assistantId: string, sessionId: string) {
  const key = `${assistantId}:${sessionId}`;
  const existing = assistantChatPumps.get(key);
  if (existing) {
    return existing;
  }
  discardAssistantChatPumps(assistantId);
  const pump = createStreamPump({
    flushIntervalMs: STREAM_DELTA_FLUSH_MS,
    maxBufferedBytes: STREAM_DELTA_MAX_BUFFERED_BYTES,
    maxTotalChars: CHAT_MESSAGE_CONTENT_MAX_CHARS,
    maxQueuedBytes: DEFAULT_STREAM_MAX_QUEUED_BYTES,
    onFlush(delta) {
      emitAssistantChatDeltaFrameToAll(connections, { assistantId, sessionId, delta });
    }
  });
  assistantChatPumps.set(key, pump);
  return pump;
}

export function discardAssistantChatPumps(assistantId: string) {
  for (const [key, pump] of assistantChatPumps) if (key.startsWith(`${assistantId}:`)) {
    pump.close();
    assistantChatPumps.delete(key);
  }
}

export function emitAssistantChatDeltaFrameToAll(
  connections: ControlEventConnections,
  input: { assistantId: string; sessionId: string; delta: string }
) {
  emitControlEvent(connections, { type: "assistant.chat.delta", requestId: `assistant:auto:${crypto.randomUUID()}`,
    payload: input });
}

export async function emitAssistantChatMessageAppendedToAll(
  connections: ControlEventConnections,
  input: { assistantId: string; sessionId: string; message: ChatMessage; thread: AssistantLiveThreadMetadata }
) {
  for (const [key, pump] of assistantChatPumps) if (key.startsWith(`${input.assistantId}:`)) {
    await settleAssistantChatPump(key, pump);
  }
  emitControlEvent(connections, { type: "assistant.chat.message-appended",
    requestId: `assistant:auto:${crypto.randomUUID()}`, payload: input });
}

export async function emitAssistantChatCompleteToAll(
  connections: ControlEventConnections,
  input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage; thread: AssistantLiveThreadMetadata }
) {
  const key = `${input.assistantId}:${input.sessionId}`;
  const pump = assistantChatPumps.get(key);
  if (pump) {
    const error = await settleAssistantChatPump(key, pump);
    if (error !== undefined) {
      throw error;
    }
  }
  emitControlEvent(connections, { type: "assistant.chat.complete",
    requestId: `assistant:auto:${crypto.randomUUID()}`, payload: input });
}

export async function emitAssistantChatFailedToAll(connections: ControlEventConnections,
  input: { assistantId: string; sessionId: string }) {
  const key = `${input.assistantId}:${input.sessionId}`, pump = assistantChatPumps.get(key);
  if (pump) await settleAssistantChatPump(key, pump);
  emitControlEvent(connections, { type: "assistant.chat.failed", requestId: `assistant:auto:${crypto.randomUUID()}`,
    payload: input });
}

async function settleAssistantChatPump(key: string, pump: StreamPump) {
  try {
    await pump.end();
  } catch (error) {
    debugLog("assistant.chat.stream-pump-failed", {
      key,
      failureMessage: error instanceof Error ? error.message : String(error)
    });
    return error;
  } finally {
    assistantChatPumps.delete(key);
  }
  return undefined;
}

export function emitAssistantLogAppendedToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  entry: ReturnType<WorkspaceRepository["appendAssistantLogEntry"]>
) {
  emitControlEvent(connections, { type: "assistant.log.appended", requestId: `assistant:auto:${crypto.randomUUID()}`,
    payload: { entry } });
}

export function emitAssistantCreatedCardToAll(
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  assistant: Assistant
) {
  emitControlEvent(connections, { type: "assistant.created-card", requestId: `assistant:auto:${crypto.randomUUID()}`,
    payload: { assistant } });
}
