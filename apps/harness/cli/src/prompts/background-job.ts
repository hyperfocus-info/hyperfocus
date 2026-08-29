import path from "node:path";
import { existsSync } from "node:fs";
import { resolveModeById } from "@hyperfocus/ai-core/modes";
import { compileBackgroundJobIntentContract, renderIntentContractPrompt } from "@hyperfocus/ai-core/intent-contract";
import {
  createChatMessage,
  type AssistantTodo,
  type BackgroundJob,
  type BackgroundJobRun,
  type ModeDefinition,
  type PlanningQuestion,
  type PlanningQuestionBatchNotification,
  type PlanningQuestionNotification,
  type PlannerQuestionTurn,
  type ProviderBrand,
  type WorkspaceRuleSource
} from "@hyperfocus/ai-core/protocol";
import { withAgentsMdRuleSource } from "../agent-rules";
import { readAssistantPromptLearnings } from "../assistant-learning-policy";
import {
  renderAssistantPromptContext,
  renderAssistantPromptMemoryBlock
} from "../assistant-manager";
import { readAssistantPromptQuestions } from "../assistant-question-policy";
import { readActiveAssistantTodosForPrompt } from "../assistant-todo-policy";
import { prepareGeminiCachedAttachmentContext } from "../gemini-cached-contents";
import { createStableBoundedId } from "../notification-ids";
import { buildWorkspaceConfigHash, type PromptCacheIdentity } from "../prompt-cache";
import type { WorkspaceRepository } from "../workspace-repository";

type BackgroundPromptOptions = {
  job: BackgroundJob;
  planningModelId: string;
  providerBrand: ProviderBrand;
  repository: WorkspaceRepository;
  run: Pick<BackgroundJobRun, "linkedAgentRunId">;
};

export function buildBackgroundPromptCacheIdentity(
  options: Pick<BackgroundPromptOptions, "job" | "providerBrand" | "repository">,
  input: {
    projectRootPath: string;
    mode?: ModeDefinition;
    ruleSources?: WorkspaceRuleSource[];
  }
): PromptCacheIdentity {
  return {
    projectId: options.job.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: options.job.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: options.providerBrand,
      selectedModeId: input.mode?.id,
      mode: input.mode,
      ruleSources: input.ruleSources,
      memoryBankEnabledDefault: options.repository.getMemoryBankEnabledDefault()
    })
  };
}

export async function prepareBackgroundAiRoutine(options: BackgroundPromptOptions) {
  const { repository, job } = options;
  if (job.definition.kind !== "ai-routine") {
    throw new Error(`Expected ai-routine definition for ${job.id}`);
  }
  const project = repository.getProject(job.projectId);
  const threadId = job.automationThreadId;
  const mode = resolveModeById(job.definition.modeId ?? project.selectedModeId, project.projectModes);
  const ruleSources = withAgentsMdRuleSource(
    [project.projectRuleSource].filter((value): value is WorkspaceRuleSource => Boolean(value))
  );
  const assistantOwned = Boolean(job.assistantId);
  const projectRootIsGitRepo = existsSync(path.join(project.rootPath, ".git"));
  const basePrompt = buildBackgroundRoutinePrompt(job, repository);
  const prompt =
    assistantOwned && !projectRootIsGitRepo
      ? [
          basePrompt,
          "Workspace note: project root is not a git repository. Use direct file inspection and avoid git status, git diff, and other git-only assumptions for this background job."
        ].join("\n\n")
      : basePrompt;
  const plannerMessages = [
    ...repository.getThreadMessages(job.projectId, threadId),
    ...(assistantOwned && !projectRootIsGitRepo
      ? [
          createChatMessage(
            "system",
            "Project root is not a git repository. Use direct file inspection and avoid git status, git diff, and other git-only assumptions for this background job."
          )
        ]
      : []),
    createChatMessage("system", `Scheduled job ${job.name} started.`),
    createChatMessage("user", prompt)
  ];
  const promptCacheIdentity = buildBackgroundPromptCacheIdentity(options, {
    projectRootPath: project.rootPath,
    mode,
    ruleSources
  });
  const geminiCachedAttachmentContext = await prepareGeminiCachedAttachmentContext({
    repository,
    projectId: job.projectId,
    modelId: options.planningModelId,
    messages: plannerMessages,
    googleApiKey: repository.getStoredGoogleApiKey()
  });
  return {
    assistantOwned,
    geminiCachedAttachmentContext,
    mode,
    plannerMessages,
    projectRoot: project.rootPath,
    prompt,
    promptCacheIdentity,
    resumableRun: options.run.linkedAgentRunId
      ? repository.getRun(job.projectId, options.run.linkedAgentRunId)
      : undefined,
    ruleSources,
    threadId
  };
}

export function persistDeferredBackgroundPlanningQuestions(input: {
  activeRunId: string;
  job: BackgroundJob;
  promptHash: string;
  questions: PlannerQuestionTurn["questions"];
  repository: WorkspaceRepository;
}) {
  const { activeRunId, job, repository } = input;
  repository.appendPlanningQuestions(
    job.projectId,
    activeRunId,
    input.questions,
    "deferred",
    createStableBoundedId(["planner-turn", activeRunId, input.promptHash])
  );
  const questionRun = repository.getRun(job.projectId, activeRunId);
  const deferredQuestions = questionRun?.questions.filter((question) => question.status === "deferred") ?? [];
  const deferredQuestion = deferredQuestions[0];
  if (!deferredQuestion) {
    throw new Error("Deferred planning question was not persisted for background run");
  }

  if (deferredQuestions.length > 1) {
    repository.saveNotification(createPlanningQuestionBatchNotification(job, activeRunId, deferredQuestions));
    for (const question of deferredQuestions) {
      repository.archiveNotification(createNotificationId("planning-question", activeRunId, question.id));
    }
  } else {
    repository.saveNotification(createPlanningQuestionNotification(job, activeRunId, deferredQuestion));
  }
  return { deferredQuestion, deferredQuestions };
}

function createPlanningQuestionNotification(
  job: BackgroundJob,
  linkedAgentRunId: string,
  question: PlanningQuestion
): PlanningQuestionNotification {
  return {
    id: createNotificationId("planning-question", linkedAgentRunId, question.id),
    kind: "planning-question",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId: job.projectId,
    threadId: job.automationThreadId,
    runId: linkedAgentRunId,
    questionId: question.id,
    prompt: question.prompt,
    placeholder: question.placeholder,
    choices: question.choices
  };
}

function createPlanningQuestionBatchNotification(
  job: BackgroundJob,
  linkedAgentRunId: string,
  questions: PlanningQuestion[]
): PlanningQuestionBatchNotification {
  return {
    id: createStableBoundedId(["planning-question-batch", linkedAgentRunId, ...questions.map((question) => question.id)]),
    kind: "planning-question-batch",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId: job.projectId,
    threadId: job.automationThreadId,
    runId: linkedAgentRunId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      placeholder: question.placeholder,
      responseKind: question.responseKind,
      choices: question.choices
    }))
  };
}

function createNotificationId(kind: string, primaryId: string, secondaryId: string) {
  return createStableBoundedId([kind, primaryId, secondaryId]);
}

function buildBackgroundRoutinePrompt(job: BackgroundJob, repository: WorkspaceRepository) {
  if (job.definition.kind !== "ai-routine") return "";
  const contract = job.intentContract ?? compileBackgroundJobIntentContract(job);
  const assistantId = job.assistantId;
  const assistant = assistantId ? repository.getAssistant(assistantId) : undefined;
  const activeTodos = assistantId
    ? readActiveAssistantTodosForPrompt((cursor) => repository.listAssistantTodos({ assistantId, cursor, limit: 128 }))
    : [];
  const activeTodoCount = assistantId
    ? repository.getAssistantOperationalCounts(assistantId).openTodoCount
    : 0;
  const answeredQuestions = assistantId
    ? readAssistantPromptQuestions((cursor) => repository.listAssistantQuestions({ assistantId, cursor, limit: 128 }))
    : [];
  const learnings = assistantId
    ? readAssistantPromptLearnings((cursor) => repository.listAssistantLearnings({ assistantId, cursor, limit: 128 }))
    : [];

  return [
    renderIntentContractPrompt(contract),
    "Runtime instruction: treat the IntentContract as authority. Use job prompt, assistant persona, todos, questions, and learnings as supporting context.",
    renderBackgroundJobSupportContext(job),
    assistant ? renderAssistantPromptContext(assistant, job.definition.prompt) : renderUnownedRoutineContext(job),
    renderActiveTodos(activeTodos, activeTodoCount),
    assistantId ? renderAssistantPromptMemoryBlock(answeredQuestions, learnings) : undefined
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

function renderBackgroundJobSupportContext(job: BackgroundJob) {
  return [
    "# BACKGROUND JOB SUPPORTING CONTEXT",
    `Job: ${job.name}`,
    `Description: ${job.description?.trim() || "No description provided."}`,
    `Definition prompt: ${job.definition.kind === "ai-routine" ? job.definition.prompt.trim() : "No AI routine prompt."}`
  ].join("\n");
}

function renderUnownedRoutineContext(job: BackgroundJob) {
  return [
    "# ACTIVE MISSION (The Request)",
    job.definition.kind === "ai-routine" ? job.definition.prompt.trim() : job.name
  ].join("\n");
}

function renderActiveTodos(activeTodos: AssistantTodo[], activeTodoCount: number) {
  if (activeTodoCount === 0) return "Active assistant todos: none";
  const lines = [
    `Active assistant todos: showing ${activeTodos.length} of ${activeTodoCount}`,
    ...activeTodos.map(
      (todo) =>
        `- (${todo.id}) state=${todo.state} workKind=${todo.workKind} target=${todo.workTarget ?? "none"} title=${todo.title}${todo.description ? ` description=${summarizePromptText(todo.description, 240)}` : ""}${todo.blockerReason ? ` blocker=${summarizePromptText(todo.blockerReason, 240)}` : ""}`
    )
  ];
  return lines.join("\n");
}

function summarizePromptText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
