import type { AgentRuntimeRegistry } from "../agent-runtimes/runtime-registry";
import { readAssistantPromptLearnings } from "../assistant-learning-policy";
import type { AssistantCompactionState } from "../assistant-learning-policy";
import type { AssistantBootstrapFlight, QueuedAssistantBootstrap } from "../assistant-lifecycle/bootstrap-queue";
import { createAssistantChatFlight } from "../assistant-lifecycle/manager-shutdown";
import { createAssistantQuestionPolicyEffects, evaluateAssistantQuestionPolicy, visitAssistantQuestionPolicyCandidates } from "../assistant-question-policy";
import { assembleDeterministicPrompt } from "../deterministic-prompt";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import { buildWorkspaceConfigHash } from "../prompt-cache";
import type { PromptCacheIdentity } from "../prompt-cache";
import { DEFAULT_CODING_STACK, DEFAULT_CODING_STACK_GUIDANCE } from "../prompts/coding-stack-defaults";
import type { WorkspaceRepository } from "../workspace-repository";
import { resolveModeById } from "@hyperfocus/ai-core/modes";
import type { Assistant, AssistantLearning, AssistantLiveThreadMetadata, AssistantLogEntry, AssistantQuestion, AssistantThread, ChatMessage, ComposerReasoningStrength, ModeDefinition, ProjectId, ProviderBrand, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type AssistantManagerCallbacks = {
  onAssistantsUpdated: (assistantIds: [string, ...string[]]) => void;
  onAssistantDetailsChanged: (assistantIds: [string, ...string[]]) => void;
  onAssistantChatDelta: (input: { assistantId: string; sessionId: string; delta: string }) => void;
  onAssistantChatMessageAppended: (input: {
    assistantId: string;
    sessionId: string;
    message: ChatMessage;
    thread: AssistantLiveThreadMetadata;
  }) => unknown | Promise<unknown>;
  onAssistantChatComplete: (input: { assistantId: string; sessionId: string; assistantMessage: ChatMessage;
    thread: AssistantLiveThreadMetadata }) => unknown | Promise<unknown>;
  onAssistantChatFailed: (input: { assistantId: string; sessionId: string }) => unknown | Promise<unknown>;
  onAssistantLogAppended: (entry: AssistantLogEntry) => void;
  onAssistantCreatedCard: (assistant: Assistant) => void;
};

export type AssistantManagerOptions = {
  reprioritizeDebounceMs?: number;
};

export const ASSISTANT_LEARNING_COMPACTION_FACT_THRESHOLD = 40;

export const ASSISTANT_LEARNING_COMPACTION_CHAR_THRESHOLD = 24000;

export const DEFAULT_CODING_STACK_QUESTION =
  `Which stack should this coding project use? Recommended default: ${DEFAULT_CODING_STACK}. Reply "default" to use that stack or describe another stack.`;

export const ASSISTANT_ACTIONS_SKILL_PROMPT =
  "For every assistant-chat or project-chat request addressed to this assistant, invoke the assistant-actions skill before acting when the user's prompt does not already include it.";

export type ReprioritizeState = {
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  dirty: boolean;
  lastReason?: string;
};

export type AssistantChatFlight = ReturnType<typeof createAssistantChatFlight>;

export type ResolvedAssistantRuntime = { adapter: PiAgentAdapter; cwd: string; modelId: string; readOnly: boolean;
  reasoningStrength?: ComposerReasoningStrength; fastMode?: boolean; promptCacheIdentity?: PromptCacheIdentity;
  modelFallbackDetail?: string };

export type AssistantManagerContext = {
  repository: WorkspaceRepository;
  runtimeRegistry: AgentRuntimeRegistry;
  callbacks: AssistantManagerCallbacks;
  reprioritizeStates: Map<string, ReprioritizeState>;
  reprioritizeFlights: Set<Promise<void>>;
  bootstrapFlights: Map<string, Promise<void>>;
  bootstrapFlightState: WeakMap<Promise<void>, AssistantBootstrapFlight>;
  queuedBootstrapFlights: WeakMap<Promise<void>, QueuedAssistantBootstrap>;
  jobBootstrapTimers: Map<string, ReturnType<typeof setTimeout>>;
  learningCompactions: Map<string, AssistantCompactionState>;
  pendingLearningCompactions: Map<string, string>;
  invalidatedAssistants: Set<string>;
  chatFlights: Map<string, AssistantChatFlight>;
  chatCompletions: Set<Promise<void>>;
  reprioritizeDebounceMs: number;
  shuttingDown: boolean;
};

export function toAssistantLiveThreadMetadata(thread: AssistantThread, latestMessageId: string): AssistantLiveThreadMetadata {
  return { id: thread.id, assistantId: thread.assistantId, sessionId: thread.sessionId, messageCount: thread.messageCount,
    memorySummary: thread.memorySummary, updatedAt: thread.updatedAt, latestMessageId };
}

export function invalidateAssistantWork(invalidated: Set<string>, states: Map<string, ReprioritizeState>, assistantId: string) {
  invalidated.add(assistantId);
  const state = states.get(assistantId);
  if (state?.timer) clearTimeout(state.timer);
  states.delete(assistantId);
}

export function* assistantMaintenanceCandidates(repository: WorkspaceRepository) {
  let afterId: string | undefined;
  do {
    const page = repository.listAssistantMaintenancePage({ afterId });
    yield* page.items;
    afterId = page.nextCursor;
  } while (afterId !== undefined);
}

export function cleanupStaleAssistantQuestionRecords(repository: WorkspaceRepository, callbacks: AssistantManagerCallbacks,
  scheduleCompaction: (assistantId: string, reason: string) => void) {
  let cleanedCount = 0;
  for (const assistant of assistantMaintenanceCandidates(repository)) {
    const learnings = readAssistantPromptLearnings((cursor) => repository.listAssistantLearnings({ assistantId: assistant.id, cursor, limit: 128 })); visitAssistantQuestionPolicyCandidates((cursor) => repository.listAssistantQuestions({ assistantId: assistant.id, cursor, limit: 128 }),
      (question, context) => {
      const decision = evaluateAssistantQuestionPolicy({ prompt: question.prompt,
        questions: context, learnings, runtimeReadOnly: undefined,
        autoApproveNonBlocking: repository.getAssistantAutoApproveNonBlockingQuestionsDefault() });
      if (decision.kind === "ask") return;
      const effects = createAssistantQuestionPolicyEffects(assistant.id, question.prompt, decision, new Date().toISOString());
      const resolved = repository.resolveAssistantQuestionPolicy(assistant.id, { questionId: question.id,
        resolution: decision.kind === "auto-answer" ? { kind: "answer", answerText: decision.answerText } : { kind: "dismiss" },
        learning: effects.learning, logEntry: effects.log });
      callbacks.onAssistantLogAppended(resolved.logEntry);
      scheduleCompaction(assistant.id, `question-policy:${decision.category}`);
      callbacks.onAssistantDetailsChanged([assistant.id]);
      cleanedCount += 1;
    });
  }
  return cleanedCount;
}

export function extractQuestionPrompt(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 1200 || !normalized.includes("?")) {
    return undefined;
  }

  const directQuestion = normalized.match(
    /\b(?:what|which|who|when|where|why|how|should|could|would|can|do|does|did|is|are|was|were)\b[^?]*\?/i
  )?.[0];
  if (!directQuestion) {
    return undefined;
  }

  return directQuestion.trim();
}

export function renderAssistantPromptMemoryBlock(answeredQuestions: AssistantQuestion[], learnings: AssistantLearning[]) {
  const lines = [
    answeredQuestions.length > 0
      ? `Recent durable answers:\n${answeredQuestions.map((question) => `- ${summarize(question.prompt, 120)} => ${summarize(question.answerText ?? "", 120)}`).join("\n")}`
      : undefined,
    learnings.length > 0 ? `Relevant learnings:\n${learnings.map((learning) => `- ${learning.summary}`).join("\n")}` : undefined
  ].filter(Boolean);
  if (lines.length === 0) {
    return "# Durable Guidance\nnone";
  }
  return ["# Durable Guidance", ...lines].join("\n");
}

export function renderAssistantPromptContext(
  assistant: Pick<Assistant, "name" | "description" | "personalityPrompt" | "jobPrompt">,
  activeMission?: string
) {
  return [
    `# IDENTITY: ${assistant.name}`,
    `Personality: ${assistant.personalityPrompt.trim() || "No personality provided."}`,
    `Description: ${assistant.description?.trim() || "No description provided."}`,
    "",
    "# OPERATIONAL LOGIC (The Job)",
    assistant.jobPrompt.trim() || "No job prompt provided.",
    activeMission?.trim() ? ["", "# ACTIVE MISSION (The Request)", activeMission.trim()].join("\n") : undefined
  ]
    .filter((part) => part !== undefined)
    .join("\n");
}

export function buildBootstrapPrompt(assistant: Assistant) {
  return [
    "Return only JSON.",
    renderAssistantPromptContext(assistant, "Bootstrap assistant operating state and propose initial durable guidance."),
    `Respond with JSON object:
{
  "researchSummary": "what role success looks like",
  "learnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
  "initialTodos": [{"title":"todo title","description":"optional","workKind":"app-code|automation-code|documentation|research|blocked|unspecified","workTarget":"optional file/component/API/script target"}],
  "remainIdle": true
}`,
    "Only create initialTodos when the job prompt implies proactive work, backlog maintenance, implementation, or recurring execution.",
    "Do not ask questions during bootstrap unless role setup cannot proceed without user input; prefer durable assumptions and learnings.",
    "First discovery todos may be research or documentation. If the assistant is for building a coding project, later todos should mostly be app-code or automation-code.",
    DEFAULT_CODING_STACK_GUIDANCE
  ].join("\n\n");
}

export function buildAssistantLearningCompactionPrompt(assistant: Assistant, reason: string, learnings: AssistantLearning[]) {
  const summaryLearning = learnings.find((learning) => (learning.kind ?? "fact") === "summary");
  const highConfidenceGuidance = learnings.filter((learning) => {
    const source = learning.source.toLowerCase();
    return (
      learning.confidence === "high" &&
      (source.startsWith("question:") || source.startsWith("question-policy:") || source.startsWith("user"))
    );
  });
  const recentLearnings = learnings
    .filter((learning) => (learning.kind ?? "fact") === "fact")
    .slice(0, 40);
  const compactInput = [...(summaryLearning ? [summaryLearning] : []), ...highConfidenceGuidance, ...recentLearnings]
    .filter((learning, index, source) => source.findIndex((entry) => entry.id === learning.id) === index)
    .slice(0, 80);

  return [
    "Return only JSON.",
    `Compaction reason: ${reason}`,
    renderAssistantPromptContext(assistant, `Compact assistant learnings because: ${reason}`),
    "Merge assistant learnings into compact durable guidance. Remove duplicates and stale phrasing. Preserve user/question guidance unless contradicted.",
    "Never return placeholder labels such as merged durable assistant guidance or compacted summary; summary must contain the actual durable guidance.",
    `Current learnings:\n${compactInput.map((learning) => `- id=${learning.id} kind=${learning.kind ?? "fact"} confidence=${learning.confidence} source=${learning.source}: ${learning.summary}`).join("\n")}`,
    `Respond with JSON object:
{
  "summary": "Prefer concise durable guidance and preserve user constraints.",
  "retainedFacts": [{"summary":"important fact","source":"source","confidence":"low|medium|high"}]
}`
  ].join("\n\n");
}

export function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (typeof timer === "object" && timer && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

export function buildThreadSummaryPrompt(assistant: Assistant, thread: AssistantThread) {
  return assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        `Summarize the assistant memory for ${assistant.name}.`,
        "Preserve user commitments, unresolved blockers, active priorities, and open loops."
      ]
    },
    {
      kind: "dynamic",
      content: renderMessages(thread.messages.slice(-80))
    }
  ]);
}

export function buildAssistantPromptCacheIdentity(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  projectRootPath: string;
  providerBrand: ProviderBrand;
  mode?: ModeDefinition;
}): PromptCacheIdentity {
  return {
    projectId: input.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: input.providerBrand,
      selectedModeId: input.mode?.id,
      mode: input.mode,
      memoryBankEnabledDefault: input.repository.getMemoryBankEnabledDefault()
    })
  };
}

export function resolveAssistantMode(modeId: string | undefined, workspaceModes: ModeDefinition[], project?: WorkspaceProjectState) {
  return resolveModeById(modeId ?? project?.selectedModeId, workspaceModes, project?.projectModes ?? []);
}

export function isDefaultCodingStackQuestion(prompt: string) {
  return prompt.includes("Recommended default: TypeScript, Bun runtime");
}

export function projectHasDetectedStack(project: Pick<WorkspaceProjectState, "rootPath">) {
  const packageJsonPath = path.join(project.rootPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }
  try {
    const text = readFileSync(packageJsonPath, "utf8");
    return /\b(bun|solid-js|tailwindcss|@happy-dom|typescript|bun:sqlite)\b/i.test(text);
  } catch {
    return false;
  }
}

export function renderMessages(messages: ChatMessage[]) {
  if (messages.length === 0) {
    return "(no recent transcript)";
  }

  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

export function extractJsonPayload(text: string): unknown {
  const fencedMatch = text.match(/```json\s*([\s\S]+?)```/i);
  const source = fencedMatch?.[1] ?? text;
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Assistant JSON payload missing");
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

export function summarize(value: string, maxLength: number = 240) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
