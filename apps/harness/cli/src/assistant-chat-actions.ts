import type {
  Assistant,
  AssistantActionKind,
  AssistantQuestion,
  AssistantTodo,
  BackgroundJob,
  ProjectId
} from "@hyperfocus/ai-core/protocol";
import { detectAssistantChatIntent } from "./assistant-intent";
import type { WorkspaceRepository } from "./workspace-repository";

export type AssistantActionIntentDraft = {
  actionKind: AssistantActionKind;
  sourcePrompt: string;
  assistantSelector?: string;
  candidateAssistantIds?: string[];
  candidateJobIds?: string[];
  candidateQuestionIds?: string[];
  candidateTodoIds?: string[];
  scheduleText?: string;
  jobPrompt?: string;
  jobId?: string;
  questionId?: string;
  todoId?: string;
  answerText?: string;
};

export type AssistantChatActionResolution =
  | { kind: "none" }
  | { kind: "execute"; action: AssistantActionIntentDraft & { assistant: Assistant } }
  | {
      kind: "clarify";
      intent: AssistantActionIntentDraft;
      prompt: string;
      choices: Array<{ id: string; label: string; description: string; answerText: string; recommended: boolean }>;
    };

type ResolveAssistantChatActionInput = {
  content: string;
  projectId: ProjectId;
  assistants: Assistant[];
  jobs: BackgroundJob[];
  questions: AssistantQuestion[];
  todos: AssistantTodo[];
  priorIntent?: AssistantActionIntentDraft;
};

type ParsedAction = AssistantActionIntentDraft & {
  createName?: string;
  createScope?: "project" | "global";
  requiresExistingTarget?: boolean;
};

export function inspectAssistantChatAction(content: string, priorIntent?: AssistantActionIntentDraft) {
  return mergePriorIntent(parseAssistantAction(content.trim()), priorIntent, content.trim());
}

export function resolveAssistantChatAction(input: ResolveAssistantChatActionInput): AssistantChatActionResolution {
  const sourcePrompt = input.content.trim();
  if (!sourcePrompt || sourcePrompt.includes("```")) {
    return { kind: "none" };
  }

  const parsed = inspectAssistantChatAction(sourcePrompt, input.priorIntent);
  if (!parsed) {
    return { kind: "none" };
  }

  if (parsed.actionKind === "create") {
    return { kind: "none" };
  }

  const target = resolveAssistantTarget(input.assistants, input.projectId, parsed.assistantSelector);
  if (target.kind === "missing") {
    if (parsed.requiresExistingTarget) {
      return { kind: "none" };
    }
    return clarifyAssistantTarget(parsed, "Which assistant should handle this?");
  }
  if (target.kind === "ambiguous") {
    return {
      kind: "clarify",
      intent: {
        ...parsed,
        candidateAssistantIds: target.candidates.map((assistant) => assistant.id)
      },
      prompt: `Which assistant named "${parsed.assistantSelector}" should handle this?`,
      choices: target.candidates.slice(0, 3).map((assistant, index) => ({
        id: `assistant-action:${assistant.id}`,
        label: assistant.scope === "global" ? `${assistant.name} (global)` : assistant.name,
        description: assistant.scope === "global" ? "Use the global assistant." : "Use the project assistant.",
        answerText: assistant.id,
        recommended: index === 0
      }))
    };
  }

  const assistant = target.assistant;
  const completed = completeAction(parsed, assistant, input);
  if (completed.kind === "clarify") {
    return completed;
  }
  return {
    kind: "execute",
    action: {
      ...toAssistantActionIntentDraft(completed.action),
      assistant
    }
  };
}

function parseAssistantAction(sourcePrompt: string): ParsedAction | undefined {
  const createIntent = detectAssistantChatIntent(sourcePrompt);
  if (createIntent.kind === "create-ready" || createIntent.kind === "create-needs-purpose") {
    return {
      actionKind: "create",
      sourcePrompt,
      assistantSelector: createIntent.name,
      createName: createIntent.name,
      createScope: createIntent.scope
    };
  }

  const patterns: Array<[RegExp, (match: RegExpMatchArray) => ParsedAction | undefined]> = [
    [/^pause\s+(?<assistant>.+)$/i, (match) => base("pause", sourcePrompt, match.groups?.assistant)],
    [/^resume\s+(?<assistant>.+)$/i, (match) => base("resume", sourcePrompt, match.groups?.assistant)],
    [/^clone\s+(?<assistant>.+?)\s+to\s+this\s+project$/i, (match) => base("clone", sourcePrompt, match.groups?.assistant)],
    [
      /^(?<assistant>.+?)\s+(?<message>(?:start|begin|continue|keep|maintain|maintaining|build|building|run|running|execute|executing|process|processing|work|working)\b.+)$/i,
      (match) => ({
        ...base("chat", sourcePrompt, match.groups?.assistant)!,
        answerText: match.groups?.message?.trim(),
        requiresExistingTarget: true
      })
    ],
    [/^(?:hey|ask)\s+(?<assistant>.+?)\s+what\s+(?:background\s+)?jobs\s+do\s+you\s+have\s+queued\??$/i, (match) => base("list-jobs", sourcePrompt, match.groups?.assistant)],
    [/^(?:hey|ask)\s+(?<assistant>.+?)\s+(?<message>.+)$/i, (match) => parseAddressed(sourcePrompt, match)],
    [/^what\s+jobs\s+does\s+(?<assistant>.+?)\s+have\s+queued\??$/i, (match) => base("list-jobs", sourcePrompt, match.groups?.assistant)],
    [/^schedule\s+(?<assistant>.+?)\s+to\s+(?<body>.+)$/i, (match) => parseSchedule(sourcePrompt, match)],
    [/^run\s+(?<assistant>.+?)\s+job\s+now$/i, (match) => base("run-job", sourcePrompt, match.groups?.assistant)],
    [
      /^answer\s+(?<assistant>.+?)['’]s\s+question:\s*(?<answer>.+)$/i,
      (match) => ({ ...base("answer-question", sourcePrompt, match.groups?.assistant)!, answerText: match.groups?.answer?.trim() })
    ],
    [
      /^mark\s+(?<assistant>.+?)\s+todo\s+["“]?(?<todo>.+?)["”]?\s+(?:done|complete|completed)$/i,
      (match) => ({ ...base("update-todo", sourcePrompt, match.groups?.assistant)!, todoId: match.groups?.todo?.trim() })
    ]
  ];

  for (const [pattern, build] of patterns) {
    const match = sourcePrompt.match(pattern);
    if (match) {
      return build(match);
    }
  }

  return undefined;
}

function parseAddressed(sourcePrompt: string, match: RegExpMatchArray): ParsedAction | undefined {
  const message = match.groups?.message?.trim();
  const assistant = match.groups?.assistant;
  if (!message) {
    return base("chat", sourcePrompt, assistant);
  }
  if (/^(?:what\s+)?(?:background\s+)?jobs\s+(?:do\s+you\s+have\s+)?queued\??$/i.test(message)) {
    return base("list-jobs", sourcePrompt, assistant);
  }
  if (/^(?:what\s+is\s+blocking\s+you|what\s+questions\s+do\s+you\s+have|status)\??$/i.test(message)) {
    return base("inspect", sourcePrompt, assistant);
  }
  return {
    ...base("chat", sourcePrompt, assistant)!,
    answerText: message
  };
}

function parseSchedule(sourcePrompt: string, match: RegExpMatchArray): ParsedAction | undefined {
  const body = match.groups?.body?.trim() ?? "";
  const everyMatch = body.match(/^(?<prompt>.+?)\s+every\s+(?<schedule>.+)$/i);
  const inMatch = body.match(/^(?<prompt>.+?)\s+in\s+(?<schedule>\d+\s+\w+)$/i);
  const cronMatch = body.match(/^(?<prompt>.+?)\s+cron\s+(?<schedule>.+)$/i);
  const parsed = everyMatch ?? inMatch ?? cronMatch;
  return {
    ...base("create-job", sourcePrompt, match.groups?.assistant)!,
    jobPrompt: parsed?.groups?.prompt?.trim() || body,
    scheduleText: parsed?.groups?.schedule?.trim()
  };
}

function base(actionKind: AssistantActionKind, sourcePrompt: string, assistantSelector: string | undefined): ParsedAction | undefined {
  const selector = normalizeSelector(assistantSelector);
  if (!selector) {
    return undefined;
  }
  return {
    actionKind,
    sourcePrompt,
    assistantSelector: selector
  };
}

function completeAction(
  parsed: AssistantActionIntentDraft,
  assistant: Assistant,
  input: ResolveAssistantChatActionInput
): { kind: "execute"; action: AssistantActionIntentDraft } | Extract<AssistantChatActionResolution, { kind: "clarify" }> {
  if (parsed.actionKind === "create-job" && !parsed.scheduleText) {
    return clarify(parsed, "What schedule should this assistant-owned job use?", "Add schedule", "Use an interval, datetime, or cron expression.");
  }
  if (parsed.actionKind === "run-job" && !parsed.jobId) {
    const jobs = input.jobs.filter((job) => job.assistantId === assistant.id && job.status !== "disabled");
    if (jobs.length === 1) {
      return { kind: "execute", action: { ...parsed, jobId: jobs[0]!.id } };
    }
    if (jobs.length > 1) {
      return {
        kind: "clarify",
        intent: { ...parsed, candidateJobIds: jobs.slice(0, 8).map((job) => job.id) },
        prompt: `Which ${assistant.name} job should run now?`,
        choices: jobs.slice(0, 3).map((job, index) => ({
          id: `assistant-action-job:${job.id}`,
          label: job.name,
          description: job.description || "Run this assistant-owned job.",
          answerText: job.id,
          recommended: index === 0
        }))
      };
    }
    return clarify(parsed, `${assistant.name} has no runnable jobs.`, "Create job", "Give a schedule and prompt for a new assistant-owned job.");
  }
  if (parsed.actionKind === "answer-question" && !parsed.questionId) {
    const pending = input.questions.filter((question) => question.assistantId === assistant.id && question.status === "pending");
    if (pending.length === 1) {
      return { kind: "execute", action: { ...parsed, questionId: pending[0]!.id } };
    }
    return clarify({ ...parsed, candidateQuestionIds: pending.slice(0, 8).map((question) => question.id) },
      `Which ${assistant.name} question should be answered?`, "Answer question", "Name or paste the question id.");
  }
  if (parsed.actionKind === "update-todo" && parsed.todoId && !input.todos.some((todo) => todo.assistantId === assistant.id && todo.id === parsed.todoId)) {
    const needle = parsed.todoId.toLowerCase();
    const matches = input.todos.filter(
      (todo) => todo.assistantId === assistant.id && todo.title.toLowerCase().includes(needle) && todo.state !== "completed"
    );
    if (matches.length === 1) {
      return { kind: "execute", action: { ...parsed, todoId: matches[0]!.id } };
    }
    return clarify({ ...parsed, candidateTodoIds: matches.slice(0, 8).map((todo) => todo.id) },
      `Which ${assistant.name} todo should be updated?`, "Update todo", "Name the todo more exactly.");
  }
  return { kind: "execute", action: parsed };
}

function resolveAssistantTarget(assistants: Assistant[], projectId: ProjectId, selector: string | undefined) {
  const live = assistants.filter((assistant) => !assistant.deletedAt);
  if (!selector) {
    return { kind: "missing" as const };
  }
  const byId = live.find((assistant) => assistant.id === selector);
  if (byId) {
    return { kind: "found" as const, assistant: byId };
  }
  const normalized = selector.toLowerCase();
  const projectExact = live.find(
    (assistant) => assistant.scope === "project" && assistant.projectId === projectId && assistant.name.toLowerCase() === normalized
  );
  if (projectExact) {
    return { kind: "found" as const, assistant: projectExact };
  }
  const globalExact = live.find((assistant) => assistant.scope === "global" && assistant.name.toLowerCase() === normalized);
  if (globalExact) {
    return { kind: "found" as const, assistant: globalExact };
  }
  const fuzzy = live.filter(
    (assistant) =>
      (assistant.scope === "global" || assistant.projectId === projectId) &&
      assistant.name.toLowerCase().includes(normalized)
  );
  if (fuzzy.length === 1) {
    return { kind: "found" as const, assistant: fuzzy[0]! };
  }
  if (fuzzy.length > 1) {
    return { kind: "ambiguous" as const, candidates: fuzzy };
  }
  return { kind: "missing" as const };
}

function mergePriorIntent(
  parsed: ParsedAction | undefined,
  priorIntent: AssistantActionIntentDraft | undefined,
  sourcePrompt: string
): ParsedAction | undefined {
  if (!priorIntent) {
    return parsed;
  }
  return {
    ...priorIntent,
    ...parsed,
    sourcePrompt: priorIntent.sourcePrompt,
    assistantSelector: parsed?.assistantSelector ?? priorIntent.assistantSelector,
    scheduleText: parsed?.scheduleText ?? priorIntent.scheduleText ?? sourcePrompt,
    answerText: parsed?.answerText ?? priorIntent.answerText ?? sourcePrompt
  };
}

function clarifyAssistantTarget(parsed: AssistantActionIntentDraft, prompt: string): Extract<AssistantChatActionResolution, { kind: "clarify" }> {
  return clarify(parsed, prompt, "Choose assistant", "Reply with the assistant name or id.");
}

function clarify(
  intent: AssistantActionIntentDraft,
  prompt: string,
  recommendedLabel: string,
  recommendedDescription: string
): Extract<AssistantChatActionResolution, { kind: "clarify" }> {
  return {
    kind: "clarify",
    intent,
    prompt,
    choices: [
      {
        id: "assistant-action:answer",
        label: recommendedLabel,
        description: recommendedDescription,
        answerText: "",
        recommended: true
      },
      {
        id: "assistant-action:cancel",
        label: "Cancel",
        description: "Do not run an assistant action.",
        answerText: "cancel",
        recommended: false
      },
      {
        id: "assistant-action:run-once",
        label: "Run once",
        description: "Use normal project chat instead.",
        answerText: "run once",
        recommended: false
      }
    ]
  };
}

function normalizeSelector(input: string | undefined) {
  return input?.trim().replace(/^["'`]+|["'`.,:;!?]+$/g, "").replace(/\s+/g, " ") || undefined;
}

function toAssistantActionIntentDraft(action: ParsedAction | AssistantActionIntentDraft): AssistantActionIntentDraft {
  return {
    actionKind: action.actionKind,
    sourcePrompt: action.sourcePrompt,
    assistantSelector: action.assistantSelector,
    candidateAssistantIds: action.candidateAssistantIds,
    candidateJobIds: action.candidateJobIds,
    candidateQuestionIds: action.candidateQuestionIds,
    candidateTodoIds: action.candidateTodoIds,
    scheduleText: action.scheduleText,
    jobPrompt: action.jobPrompt,
    jobId: action.jobId,
    questionId: action.questionId,
    todoId: action.todoId,
    answerText: action.answerText
  };
}

export function resolvePersistedAssistantChatAction(input: { content: string; projectId: ProjectId;
  repository: WorkspaceRepository; priorIntent?: AssistantActionIntentDraft }) {
  let priorIntent = resolvePriorAssistantSelection(input.repository, input.projectId, input.content, input.priorIntent);
  let parsed = inspectAssistantChatAction(input.content, priorIntent);
  if (!parsed?.assistantSelector) return resolveAssistantChatAction({ ...input, assistants: [], jobs: [], questions: [], todos: [] });
  const assistants = findPersistedAssistantCandidates(input.repository, input.projectId, parsed.assistantSelector);
  const assistant = assistants.length === 1 ? assistants[0] : undefined;
  if (assistant) {
    priorIntent = resolvePriorOwnedSelection(input.repository, assistant.id, input.content, priorIntent);
    parsed = inspectAssistantChatAction(input.content, priorIntent)!;
  }
  return resolveAssistantChatAction({ content: input.content, projectId: input.projectId, assistants,
    jobs: assistant && parsed.actionKind === "run-job" ? readRunnableJobs(input.repository, assistant.id) : [],
    questions: assistant && parsed.actionKind === "answer-question" ? readPendingQuestions(input.repository, assistant.id) : [],
    todos: assistant && parsed.actionKind === "update-todo" && parsed.todoId
      ? readMatchingTodos(input.repository, assistant.id, parsed.todoId) : [], priorIntent });
}

function resolvePriorAssistantSelection(repository: WorkspaceRepository, projectId: ProjectId, reply: string,
  prior: AssistantActionIntentDraft | undefined) {
  if (!prior?.candidateAssistantIds?.length) return prior;
  const selected = selectCandidate(reply, prior.candidateAssistantIds.map((id) => repository.getAssistant(id))
    .filter((assistant): assistant is Assistant => Boolean(assistant && (assistant.scope === "global" || assistant.projectId === projectId))),
    (assistant) => [assistant.id, assistant.name, assistant.scope === "global" ? `${assistant.name} (global)` : assistant.name]);
  return selected ? { ...prior, assistantSelector: selected.id, candidateAssistantIds: undefined } : prior;
}

function resolvePriorOwnedSelection(repository: WorkspaceRepository, assistantId: string, reply: string,
  prior: AssistantActionIntentDraft | undefined) {
  if (!prior) return prior;
  if (prior.candidateJobIds?.length) {
    const selected = selectCandidate(reply, prior.candidateJobIds.map((id) => repository.getBackgroundJob(id))
      .filter((job): job is BackgroundJob => Boolean(job && job.assistantId === assistantId)), (job) => [job.id, job.name]);
    if (selected) return { ...prior, jobId: selected.id, candidateJobIds: undefined };
  }
  if (prior.candidateQuestionIds?.length) {
    const selected = selectCandidate(reply, prior.candidateQuestionIds.map((id) => repository.getAssistantQuestion(id))
      .filter((question): question is AssistantQuestion => question?.assistantId === assistantId),
      (question) => [question.id, question.prompt]);
    if (selected) return { ...prior, questionId: selected.id, candidateQuestionIds: undefined };
  }
  if (prior.candidateTodoIds?.length) {
    const candidates = prior.candidateTodoIds.flatMap((id) => {
      try { return [repository.getAssistantTodoForAssistant(assistantId, id)]; } catch { return []; }
    });
    const selected = selectCandidate(reply, candidates, (todo) => [todo.id, todo.title]);
    if (selected) return { ...prior, todoId: selected.id, candidateTodoIds: undefined };
  }
  return prior;
}

function selectCandidate<T>(reply: string, candidates: T[], aliases: (candidate: T) => string[]) {
  const normalized = normalizeSelector(reply)?.toLowerCase();
  if (!normalized) return undefined;
  const matches = candidates.filter((candidate) => aliases(candidate).some((alias) => alias.toLowerCase() === normalized));
  return matches.length === 1 ? matches[0] : undefined;
}

function findPersistedAssistantCandidates(repository: WorkspaceRepository, projectId: ProjectId, selector: string) {
  const byId = repository.getAssistant(selector);
  if (byId && (byId.scope === "global" || byId.projectId === projectId)) return [byId];
  const normalized = selector.toLowerCase(); let projectExact: Assistant | undefined;
  let globalExact: Assistant | undefined; const fuzzy: Assistant[] = [];
  forEachPersistedAssistant(repository, (assistant) => {
    if (assistant.scope !== "global" && assistant.projectId !== projectId) return;
    const name = assistant.name.toLowerCase();
    if (name === normalized) { if (assistant.scope === "project") projectExact ??= assistant; else globalExact ??= assistant; }
    else if (name.includes(normalized) && fuzzy.length < 4) fuzzy.push(assistant);
  });
  return projectExact ? [projectExact] : globalExact ? [globalExact] : fuzzy;
}

function forEachPersistedAssistant(repository: WorkspaceRepository, visit: (assistant: Assistant) => void) {
  let afterId: string | undefined;
  do { const page = repository.listAssistantMaintenancePage({ afterId });
    for (const assistant of page.items) visit(assistant); afterId = page.nextCursor; } while (afterId !== undefined);
}

function readRunnableJobs(repository: WorkspaceRepository, assistantId: string) {
  const matches: BackgroundJob[] = []; let cursor: string | undefined;
  do { const page = repository.listAssistantBackgroundJobs({ assistantId, cursor, limit: 32 });
    matches.push(...page.items.filter((job) => job.status !== "disabled").slice(0, 4 - matches.length));
    cursor = matches.length < 4 ? page.nextCursor : undefined; } while (cursor !== undefined);
  return matches;
}

function readPendingQuestions(repository: WorkspaceRepository, assistantId: string) {
  const matches: AssistantQuestion[] = []; let cursor: string | undefined;
  do { const page = repository.listAssistantQuestions({ assistantId, cursor, limit: 32 });
    matches.push(...page.items.filter((question) => question.status === "pending").slice(0, 2 - matches.length));
    cursor = matches.length < 2 ? page.nextCursor : undefined; } while (cursor !== undefined);
  return matches;
}

function readMatchingTodos(repository: WorkspaceRepository, assistantId: string, selector: string) {
  const normalized = selector.toLowerCase(); const matches: AssistantTodo[] = []; let cursor: string | undefined;
  do { const page = repository.listAssistantTodos({ assistantId, cursor, limit: 32 });
    const exact = page.items.find((todo) => todo.id === selector); if (exact) return [exact];
    matches.push(...page.items.filter((todo) => todo.state !== "completed" && todo.title.toLowerCase().includes(normalized))
      .slice(0, 2 - matches.length)); cursor = matches.length < 2 ? page.nextCursor : undefined;
  } while (cursor !== undefined);
  return matches;
}
