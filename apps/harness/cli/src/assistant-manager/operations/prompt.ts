import type { Assistant, AssistantLogEntry, AssistantTodo, ComposerReasoningStrength } from "@hyperfocus/ai-core/protocol";
import type { AssistantManagerContext, ResolvedAssistantRuntime } from "../shared";
import type { WorkspaceRepository } from "../../workspace-repository";
import { ASSISTANT_ACTIONS_SKILL_PROMPT, buildAssistantPromptCacheIdentity, extractJsonPayload, isDefaultCodingStackQuestion, projectHasDetectedStack, renderAssistantPromptContext, renderAssistantPromptMemoryBlock, renderMessages, resolveAssistantMode, summarize } from "../shared";
import { DEFAULT_CODING_STACK_GUIDANCE } from "../../prompts/coding-stack-defaults";
import { assembleDeterministicPrompt } from "../../deterministic-prompt";
import { assistantGoalImpliesCoding, isCodingTodoKind } from "../../assistant-todo-policy";
import { createAssistantLogEntryId } from "@hyperfocus/ai-core/protocol";
import { debugLog } from "../../logging";
import { getDefaultExecutionModelId } from "../../pi-planner";
import { modeUsesReadOnlyExecution } from "@hyperfocus/ai-core/modes";
import { readAssistantPendingPromptQuestions, readAssistantPromptQuestions, someAssistantQuestion } from "../../assistant-question-policy";
import { readAssistantPromptLearnings, selectAssistantPromptLearnings, someAssistantLearning } from "../../assistant-learning-policy";
import { resolveAssistantExecutionModel } from "../../assistant-capabilities";
import { z } from "zod";

function createAssistantPromptBuilderOperations(context: AssistantManagerContext) {
  const { repository } = context;
  function shouldAskDefaultStackPreference(assistantId: string, todo: Pick<AssistantTodo, "workKind" | "workTarget" | "title" | "description">) {
      if (!isCodingTodoKind(todo.workKind)) return false;
      const assistant = repository.getAssistant(assistantId);
      if (!assistant || assistant.scope !== "project" || !assistantGoalImpliesCoding(assistant)) return false;
      if (repository.hasAssistantCodingTodo(assistantId)) return false;
      if (hasStackPreferenceOrDetectedStack(assistant)) return false;
      return !someAssistantQuestion((cursor) => repository.listAssistantQuestions({ assistantId, cursor, limit: 128 }),
        (question) => isDefaultCodingStackQuestion(question.prompt));
    }
  function hasStackPreferenceOrDetectedStack(assistant: Assistant) {
      if (
        someAssistantLearning((cursor) => repository.listAssistantLearnings({ assistantId: assistant.id, cursor, limit: 128 }), (learning) => learning.source === "stack-preference" || /stack.+typescript|bun|solid|tailwind|sqlite/i.test(learning.summary))
      ) {
        return true;
      }
      if (assistant.scope !== "project") {
        return false;
      }
      const project = repository.getProject(assistant.projectId!);
      return projectHasDetectedStack(project);
    }
  function readPromptLearnings(assistantId: string) { return readAssistantPromptLearnings((cursor) => repository.listAssistantLearnings({ assistantId, cursor, limit: 128 })); }
  async function buildAssistantChatPrompt(assistant: Assistant, activeMission: string) {
      const state = getAssistantOperatingState(assistant.id);
      return assembleDeterministicPrompt([
        {
          kind: "system",
          content: [
            renderAssistantPromptContext(assistant, activeMission),
            ASSISTANT_ACTIONS_SKILL_PROMPT,
            "Reply directly to the user. Keep answer grounded in the assistant role and current priorities.",
            "Ask questions only when missing information blocks useful progress. If multiple questions are necessary, batch them in one response."
          ]
        },
        {
          kind: "workspace",
          content: [
            state.summary ? `Thread summary:\n${state.summary}` : undefined,
            state.assetRefs.length > 0
              ? `Linked assets:\n${state.assetRefs.map((asset) => `- [${asset.kind}] ${asset.label}: ${asset.canonicalValue ?? asset.value}`).join("\n")}`
              : undefined,
            state.activeTodos.length > 0
              ? `Active todos (showing ${state.activeTodos.length} of ${state.activeTodoCount}):\n${state.activeTodos.map((todo) => `- (${todo.id}) ${todo.state} ${todo.workKind}${todo.workTarget ? ` target=${todo.workTarget}` : ""}: ${todo.title}${todo.blockerReason ? ` | blocker: ${todo.blockerReason}` : ""}`).join("\n")}`
              : "Active todos: none",
            state.pendingQuestions.length > 0
              ? `Pending questions:\n${state.pendingQuestions.map((question) => `- (${question.id}) ${question.prompt}`).join("\n")}`
              : "Pending questions: none",
            renderAssistantPromptMemoryBlock(state.answeredQuestions, state.learnings)
          ]
        },
        {
          kind: "dynamic",
          content: `Recent transcript:\n${renderMessages(state.recentMessages)}`
        }
      ]);
    }
  function buildReprioritizePrompt(assistant: Assistant, reason: string,
      snapshot: ReturnType<WorkspaceRepository["getAssistantReprioritizeSnapshot"]>) {
      const state = getAssistantOperatingState(assistant.id, snapshot);
      return assembleDeterministicPrompt([
        {
          kind: "system",
          content: [
            "Return only JSON.",
            `Reason: ${reason}`,
            renderAssistantPromptContext(assistant, `Reprioritize assistant operating state because: ${reason}`),
            `Respond with JSON object:
  {
    "summary": "short summary",
    "todoOrder": ["todo-id"],
    "todoUpdates": [{"id":"todo-id","state":"pending|in-progress|blocked|completed|failed|cancelled","blockerReason":"optional","workKind":"app-code|automation-code|documentation|research|blocked|unspecified","workTarget":"optional file/component/API/script target"}],
    "newTodos": [{"title":"todo title","description":"optional","workKind":"app-code|automation-code|documentation|research|blocked|unspecified","workTarget":"optional file/component/API/script target"}],
    "newLearnings": [{"summary":"learning","source":"optional","confidence":"low|medium|high"}],
    "questions": [{"prompt":"optional blocking question","linkedTodoIds":["todo-id"]}]
  }`,
            "Ask questions only when missing information blocks useful progress. If multiple questions are necessary, batch them in questions. Prefer no questions when a reasonable default exists.",
            "Do not include completed, failed, or cancelled todos unless you are explicitly changing a currently active todo into one of those states.",
            "After early discovery, build-oriented assistants should keep most active todos as app-code or automation-code. Docs-only todos should support a concrete code change.",
            DEFAULT_CODING_STACK_GUIDANCE
          ]
        },
        {
          kind: "workspace",
          content: [
            state.summary ? `Thread summary:\n${state.summary}` : undefined,
            state.activeTodos.length > 0
              ? `Current active todos (showing ${state.activeTodos.length} of ${state.activeTodoCount}):\n${state.activeTodos.map((todo) => `- id=${todo.id} state=${todo.state} workKind=${todo.workKind} target=${todo.workTarget ?? "none"} title=${todo.title}${todo.blockerReason ? ` blocker=${todo.blockerReason}` : ""}`).join("\n")}`
              : "Current active todos: none",
            state.pendingQuestions.length > 0
              ? `Pending questions:\n${state.pendingQuestions.map((question) => `- id=${question.id} prompt=${question.prompt}`).join("\n")}`
              : undefined,
            renderAssistantPromptMemoryBlock(state.answeredQuestions, state.learnings),
            state.recentLogs.length > 0
              ? `Recent assistant logs:\n${state.recentLogs
                  .map((log) => `- ${log.createdAt} ${log.summary}${log.detail ? `: ${summarize(log.detail, 300)}` : ""}`)
                  .join("\n")}`
              : undefined
          ]
        },
        {
          kind: "dynamic",
          content: `Recent transcript:\n${renderMessages(state.recentMessages.slice(-8))}`
        }
      ]);
    }
  function getAssistantOperatingState(assistantId: string,
      snapshot?: ReturnType<WorkspaceRepository["getAssistantReprioritizeSnapshot"]>) {
      const thread = snapshot?.thread ?? repository.getAssistantThread(assistantId);
      const todoSnapshot = repository.getAssistantActiveTodoPromptSnapshot(assistantId);
      const questions = readAssistantPendingPromptQuestions((cursor) => repository.listAssistantQuestions({ assistantId, cursor, limit: 128 }));
      const answeredQuestions = readAssistantPromptQuestions((cursor) =>
        repository.listAssistantQuestions({ assistantId, cursor, limit: 128 }));
      const learnings = snapshot ? selectAssistantPromptLearnings(snapshot.learnings) : readPromptLearnings(assistantId);
      const recentLogs = (snapshot?.logs ?? repository.getAssistantLogEntries(assistantId)).slice(0, 8);
      const assetRefs = (snapshot?.assetRefs ?? repository.getAssistantAssetRefs(assistantId))
        .filter((assetRef) => assetRef.resolutionStatus === "resolved");
  
      return {
        summary: thread.memorySummary?.content,
        activeTodos: todoSnapshot.items,
        activeTodoCount: todoSnapshot.count,
        pendingQuestions: questions,
        answeredQuestions,
        learnings,
        recentLogs,
        assetRefs,
        recentMessages: thread.messages.slice(-16)
      };
    }
  return {
    shouldAskDefaultStackPreference,
    hasStackPreferenceOrDetectedStack,
    readPromptLearnings,
    buildAssistantChatPrompt,
    buildReprioritizePrompt,
    getAssistantOperatingState,
  };
}
function createAssistantPromptRuntimeOperations(context: AssistantManagerContext) {
  const { repository, runtimeRegistry, callbacks } = context;
  async function runProposalPrompt<T>(
      runtime: ResolvedAssistantRuntime,
      input: {
        assistant: Assistant;
        prompt: string;
        readOnly: boolean;
        schema: z.ZodType<T>;
        repairInstruction: string;
        errorMessage: string;
      }
    ) {
      const firstPayload = await runJsonProposalAttempt(runtime, input);
      const first = input.schema.safeParse(firstPayload);
      if (first.success) {
        return first.data;
      }
  
      const repairedPayload = await runJsonProposalAttempt(runtime, {
        assistant: input.assistant,
        prompt: `${input.prompt}\n\n${input.repairInstruction}`,
        readOnly: input.readOnly
      });
      const repaired = input.schema.safeParse(repairedPayload);
      if (repaired.success) {
        return repaired.data;
      }
      throw new Error(input.errorMessage);
    }
  async function runCompactionAttempt(
      runtime: ResolvedAssistantRuntime,
      input: { assistant: Assistant; prompt: string; readOnly: boolean }
    ) {
      try {
        return await runJsonPrompt(runtime, input);
      } catch {
        return undefined;
      }
    }
  async function runJsonProposalAttempt(
      runtime: ResolvedAssistantRuntime,
      input: { assistant: Assistant; prompt: string; readOnly: boolean }
    ) {
      try {
        return await runJsonPrompt(runtime, input);
      } catch {
        return undefined;
      }
    }
  async function runJsonPrompt(
      runtime: ResolvedAssistantRuntime,
      input: {
        assistant: Assistant;
        prompt: string;
        readOnly: boolean;
      }
    ) {
      const result = await runtime.adapter.runPrompt({
        kind: "planner",
        cwd: runtime.cwd,
        modelId: runtime.modelId,
        prompt: input.prompt,
        readOnly: input.readOnly,
        reasoningStrength: runtime.reasoningStrength,
        fastMode: runtime.fastMode,
        promptCacheIdentity: runtime.promptCacheIdentity
      });
      return extractJsonPayload(result.text);
    }
  async function resolveRuntime(
      assistant: Assistant,
      controls: {
        modeId?: string;
        executionModelId?: string;
        reasoningStrength?: ComposerReasoningStrength;
        fastMode?: boolean;
      } = {},
      persistModelFallbackLog: boolean = true
    ) {
      repository.assertAssistantAssetRefsResolved(assistant.id);
      const providerBrand = assistant.providerBrand ?? repository.getProviderBrand();
      const runtime = runtimeRegistry.get(assistant.agentId);
      const capability = runtime.getCapability() ?? (await runtime.refreshCapability());
      if (!capability.installed) {
        throw new Error(capability.healthMessage ?? `${runtime.label} is not installed`);
      }
      if (assistant.agentId !== "pi" && !capability.authenticated) {
        throw new Error(capability.healthMessage ?? `${runtime.label} is not authenticated`);
      }
  
      const cwd = assistant.projectId ? repository.getProject(assistant.projectId).rootPath : process.cwd();
      const project = assistant.projectId ? repository.getProject(assistant.projectId) : undefined;
      const resolvedModel = resolveAssistantExecutionModel({
        agentId: assistant.agentId,
        capability,
        providerBrand,
        runtimeDefaultModelId: runtime.getDefaultExecutionModelId(providerBrand) ?? getDefaultExecutionModelId(providerBrand),
        requestedModelId: controls.executionModelId,
        persistedModelId: assistant.executionModelId
      });
      const modelFallbackDetail = resolvedModel.rejectedModelId ?
        `${resolvedModel.rejectedModelId} is not available for ${runtime.label}; using ${resolvedModel.modelId}.` : undefined;
      if (modelFallbackDetail && persistModelFallbackLog) appendLog({ assistantId: assistant.id, level: "warning",
        summary: "Assistant model fallback", detail: modelFallbackDetail });
      const mode = resolveAssistantMode(controls.modeId ?? assistant.modeId, repository.loadWorkspace().workspaceModes ?? [], project);
      const readOnly = modeUsesReadOnlyExecution(mode) || !assistant.projectId;
      debugLog("assistant.runtime.resolved", {
        assistantId: assistant.id,
        projectId: assistant.projectId,
        readOnly
      });
      return {
        adapter: runtime.getAdapter(),
        cwd,
        modelId: resolvedModel.modelId,
        readOnly,
        reasoningStrength: controls.reasoningStrength ?? assistant.reasoningStrength,
        fastMode: controls.fastMode ?? assistant.fastMode,
        promptCacheIdentity: project
          ? buildAssistantPromptCacheIdentity({
              repository: repository,
              projectId: project.id,
              projectRootPath: project.rootPath,
              providerBrand,
              mode
            })
          : undefined,
        modelFallbackDetail
      };
    }
  function appendLog(input: Omit<AssistantLogEntry, "id" | "createdAt"> & Partial<Pick<AssistantLogEntry, "id" | "createdAt">>) {
      const entry = repository.appendAssistantLogEntry({
        id: input.id ?? createAssistantLogEntryId(),
        assistantId: input.assistantId,
        level: input.level,
        summary: input.summary,
        detail: input.detail,
        detailsJson: input.detailsJson,
        createdAt: input.createdAt ?? new Date().toISOString()
      });
      callbacks.onAssistantLogAppended(entry);
      return entry;
    }
  return {
    runProposalPrompt,
    runCompactionAttempt,
    runJsonProposalAttempt,
    runJsonPrompt,
    resolveRuntime,
    appendLog,
  };
}
export function createAssistantPromptOperations(
  context: AssistantManagerContext
) {
  const operations1 = createAssistantPromptBuilderOperations(context);
  const operations2 = createAssistantPromptRuntimeOperations(context);
  return {
    ...operations1,
    ...operations2,
  };
}

export type AssistantPromptOperations = ReturnType<typeof createAssistantPromptOperations>;
