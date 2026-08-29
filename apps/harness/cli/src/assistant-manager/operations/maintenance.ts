import type { Assistant, AssistantLearning, AssistantLogEntry, AssistantQuestion, AssistantThread, AssistantTodo } from "@hyperfocus/ai-core/protocol";
import type { AssistantLearningOperations } from "./learning";
import type { AssistantManagerContext } from "../shared";
import type { AssistantPromptOperations } from "./prompt";
import { DEFAULT_CODING_STACK_QUESTION, buildThreadSummaryPrompt, cleanupStaleAssistantQuestionRecords, invalidateAssistantWork } from "../shared";
import { applyAssistantTodoPolicy, readAllAssistantTodos } from "../../assistant-todo-policy";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import { beginAssistantManagerShutdownWork, settleAssistantManagerShutdownWork, trackAssistantManagerFlight } from "../../assistant-lifecycle/manager-shutdown";
import { createAssistantLearningId, createAssistantLogEntryId, createAssistantQuestionId, createAssistantTodoId } from "@hyperfocus/ai-core/protocol";
import { createAssistantQuestionPolicyEffects, evaluateAssistantQuestionPolicy, readAssistantPendingPromptQuestions, readAssistantPromptQuestions } from "../../assistant-question-policy";
import { debugLog, normalizeErrorMessage, serializeError } from "../../logging";
import { drainDeferredAssistantCompactions } from "../../assistant-learning-policy";
import { isAssistantRevisionConflictError } from "../../persistence/assistant-persistence";
import { normalizeAssistantLearningSource } from "../../workspace-repository";
import { reprioritizeProposalSchema } from "../../assistant-manager-schemas";

function createAssistantReprioritizeOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations) {
  const { repository, callbacks, reprioritizeStates, reprioritizeFlights, invalidatedAssistants, reprioritizeDebounceMs } = context;
  function scheduleReprioritize(assistantId: string, reason: string) {
      if (context.shuttingDown) return;
      if (invalidatedAssistants.has(assistantId)) return;
      try {
        assertAssistantRunnableForLaunch(repository, assistantId, { allowGlobalPauseDeferral: true });
      } catch {
        return;
      }
  
      if (repository.getGlobalExecutionPaused()) {
        repository.markAssistantPendingReprioritize(assistantId, reason);
        callbacks.onAssistantsUpdated([assistantId]);
        return;
      }
  
      const state = reprioritizeStates.get(assistantId) ?? {
        running: false,
        dirty: false
      };
      state.lastReason = reason;
      if (state.running) {
        state.dirty = true;
        reprioritizeStates.set(assistantId, state);
        return;
      }
  
      if (state.timer) {
        clearTimeout(state.timer);
      }
  
      if (reprioritizeDebounceMs === 0) {
        state.timer = undefined;
        reprioritizeStates.set(assistantId, state);
        trackAssistantManagerFlight(reprioritizeFlights, runReprioritize(assistantId, state.lastReason ?? "unknown"));
        return;
      }
  
      state.timer = setTimeout(() => {
        state.timer = undefined;
        trackAssistantManagerFlight(reprioritizeFlights, runReprioritize(assistantId, state.lastReason ?? "unknown"));
      }, reprioritizeDebounceMs);
      reprioritizeStates.set(assistantId, state);
    }
  async function runReprioritize(assistantId: string, reason: string) {
      const state = reprioritizeStates.get(assistantId) ?? {
        running: false,
        dirty: false
      };
      state.running = true;
      state.dirty = false;
      reprioritizeStates.set(assistantId, state);
  
      try {
        const snapshot = repository.getAssistantReprioritizeSnapshot(assistantId);
        const assistant = snapshot.assistant;
        try {
          assertAssistantRunnableForLaunch(repository, assistantId);
        } catch {
          return;
        }
  
        const prompt = operations.buildReprioritizePrompt(assistant, reason, snapshot);
        const runtime = await operations.resolveRuntime(assistant, {}, false);
        const proposal = await operations.runProposalPrompt(runtime, {
          assistant,
          prompt,
          readOnly: runtime.readOnly,
          schema: reprioritizeProposalSchema,
          repairInstruction:
            "Previous response failed schema validation. Return only valid JSON with summary, todoOrder, todoUpdates, newTodos, newLearnings, question, and questions.",
          errorMessage: "Assistant reprioritize payload invalid"
        });
  
        if (invalidatedAssistants.has(assistantId) || !repository.getAssistant(assistantId)) return;
        if (repository.getGlobalExecutionPaused()) {
          repository.markAssistantPendingReprioritize(assistantId, reason);
          callbacks.onAssistantsUpdated([assistantId]);
          return;
        }
        try {
          assertAssistantRunnableForLaunch(repository, assistantId);
        } catch {
          return;
        }
  
        const now = new Date().toISOString(); const todos = readAllAssistantTodos((cursor) => repository.listAssistantTodos({ assistantId, cursor, limit: 128 }));
        const todoUpdates = (proposal.todoUpdates ?? []).flatMap((update) => {
          let todo: AssistantTodo | undefined;
          try { todo = repository.getAssistantTodoForAssistant(assistantId, update.id); } catch { return []; }
          if (!todo) return [];
          const state = update.state ?? todo.state;
          return [{ ...todo, state, blockerReason: update.blockerReason ?? todo.blockerReason,
            workKind: update.workKind ?? todo.workKind, workTarget: update.workTarget ?? todo.workTarget,
            updatedAt: now, completedAt: state === "completed" ? now : todo.completedAt,
            cancelledAt: state === "cancelled" ? now : todo.cancelledAt }];
        });
        const drafts = applyAssistantTodoPolicy({ assistant,
          existingTodoCounts: repository.getAssistantTodoPolicyCounts(assistantId), drafts: proposal.newTodos ?? [] });
        const nextSortOrder = repository.getAssistantNextTodoSortOrder(assistantId);
        const newTodos = drafts.map((todo, index) => ({ id: createAssistantTodoId(), assistantId,
          title: todo.title.trim(), description: todo.description?.trim() || undefined, state: "pending" as const,
          sortOrder: nextSortOrder + index, source: "assistant" as const, workKind: todo.workKind,
          workTarget: todo.workTarget, createdAt: now, updatedAt: now }));
        const learnings: AssistantLearning[] = (proposal.newLearnings ?? []).map((learning) => ({
          id: createAssistantLearningId(), assistantId, summary: learning.summary.trim(),
          source: normalizeAssistantLearningSource(learning.source?.trim() || `reprioritize:${reason}`),
          confidence: learning.confidence ?? "medium", createdAt: now
        }));
        const questions: AssistantQuestion[] = [];
        const logs: AssistantLogEntry[] = [];
        if (runtime.modelFallbackDetail) logs.push({ id: createAssistantLogEntryId(), assistantId, level: "warning",
          summary: "Assistant model fallback", detail: runtime.modelFallbackDetail, createdAt: now });
        if (newTodos.some((todo) => operations.shouldAskDefaultStackPreference(assistantId, todo))) questions.push({
          id: createAssistantQuestionId(), assistantId, prompt: DEFAULT_CODING_STACK_QUESTION,
          status: repository.getGlobalExecutionPaused() ? "deferred" : "pending", linkedTodoIds: [], askedAt: now
        });
        const proposedQuestions = [
          ...(proposal?.questions ?? []),
          ...(proposal?.question ? [proposal.question] : [])
        ].filter((question) => question.prompt.trim());
        const readQuestions = (cursor: string | undefined) =>
          repository.listAssistantQuestions({ assistantId, cursor, limit: 128 });
        const existingQuestions = [...readAssistantPendingPromptQuestions(readQuestions),
          ...readAssistantPromptQuestions(readQuestions)];
        if (questions.length === 0 && !repository.hasAssistantPendingQuestion(assistantId)) {
          for (const question of proposedQuestions) {
            const decision = evaluateAssistantQuestionPolicy({ prompt: question.prompt,
              questions: [...existingQuestions, ...questions], learnings: operations.readPromptLearnings(assistantId),
              runtimeReadOnly: runtime.readOnly,
              autoApproveNonBlocking: repository.getAssistantAutoApproveNonBlockingQuestionsDefault() });
            if (decision.kind === "ask") questions.push({ id: createAssistantQuestionId(), assistantId,
              prompt: question.prompt.trim(), status: repository.getGlobalExecutionPaused() ? "deferred" : "pending",
              linkedTodoIds: question.linkedTodoIds ?? [], askedAt: now });
            else {
              const effects = createAssistantQuestionPolicyEffects(assistantId, question.prompt, decision, now);
              learnings.push(effects.learning); logs.push(effects.log);
            }
          }
        }
        logs.push({ id: createAssistantLogEntryId(), assistantId, level: "info", summary: "Reprioritized assistant state",
          detail: proposal.summary ?? `Trigger: ${reason}`, detailsJson: proposal, createdAt: now });
        const requestedOrder = (proposal.todoOrder ?? []).filter((id) => todos.some((todo) => todo.id === id));
        const allTodoIds = [...todos.map((todo) => todo.id), ...newTodos.map((todo) => todo.id)];
        const applied = repository.applyAssistantReprioritizeMutation(assistantId, {
          expectedMutationRevision: snapshot.mutationRevision, todoUpdates, newTodos,
          todoOrder: requestedOrder.length ? [...requestedOrder, ...allTodoIds.filter((id) => !requestedOrder.includes(id))] : undefined,
          learnings, questions, logs
        });
        for (const log of applied.logs) callbacks.onAssistantLogAppended(log);
        callbacks.onAssistantDetailsChanged([assistantId]);
        operations.scheduleLearningCompaction(assistantId, `reprioritize:${reason}`);
      } catch (error) {
        if (isAssistantRevisionConflictError(error)) {
          state.dirty = true;
          return;
        }
        const message = normalizeErrorMessage(error);
        if (repository.getAssistant(assistantId) && !invalidatedAssistants.has(assistantId)) {
          try {
            operations.appendLog({ assistantId, level: "error", summary: "Reprioritization failed",
              detail: message, detailsJson: serializeError(error) });
            await operations.recordFailure(assistantId, message, false);
            callbacks.onAssistantsUpdated([assistantId]);
          } catch (terminalError) {
            debugLog("assistant.reprioritize.terminal-state-failed", { assistantId,
              error: normalizeErrorMessage(terminalError) });
          }
        }
      } finally {
        const latestState = reprioritizeStates.get(assistantId);
        if (!latestState) {
          return;
        }
        latestState.running = false;
        const shouldRerun = latestState.dirty;
        latestState.dirty = false;
        if (invalidatedAssistants.has(assistantId) || !repository.getAssistant(assistantId)) {
          reprioritizeStates.delete(assistantId);
          return;
        }
        reprioritizeStates.set(assistantId, latestState);
        if (shouldRerun) {
          scheduleReprioritize(assistantId, "coalesced");
        }
      }
    }
  return {
    scheduleReprioritize,
    runReprioritize,
  };
}
type AssistantReprioritizeOperationsSet = ReturnType<typeof createAssistantReprioritizeOperations>;

function createAssistantLifecycleOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations & AssistantReprioritizeOperationsSet) {
  const { repository, callbacks, reprioritizeStates, reprioritizeFlights, bootstrapFlights, jobBootstrapTimers, invalidatedAssistants, chatFlights, chatCompletions, pendingLearningCompactions } = context;
  function beginShutdown() {
      context.shuttingDown = true;
      beginAssistantManagerShutdownWork({ reprioritizeStates: reprioritizeStates, reprioritizeFlights: reprioritizeFlights,
        bootstrapFlights: bootstrapFlights.values(), jobBootstrapTimers: jobBootstrapTimers,
        invalidatedAssistants: invalidatedAssistants, chatFlights: chatFlights.values(), chatCompletions: chatCompletions });
    }
  async function settleShutdown() {
      await settleAssistantManagerShutdownWork({ reprioritizeStates: reprioritizeStates,
        reprioritizeFlights: reprioritizeFlights, bootstrapFlights: bootstrapFlights.values(),
        jobBootstrapTimers: jobBootstrapTimers, invalidatedAssistants: invalidatedAssistants,
        chatFlights: chatFlights.values(), chatCompletions: chatCompletions });
    }
  function drainPendingReprioritizes() {
      for (const pending of repository.consumeAssistantsPendingReprioritize()) operations.scheduleReprioritize(pending.assistantId, pending.reason);
    }
  function drainPendingLearningCompactions() {
      for (const [id, reason] of drainDeferredAssistantCompactions(pendingLearningCompactions, repository.getGlobalExecutionPaused()))
        operations.scheduleLearningCompaction(id, reason);
    }
  function cleanupStaleAssistantQuestions() {
      return cleanupStaleAssistantQuestionRecords(repository, callbacks, (id, reason) => operations.scheduleLearningCompaction(id, reason));
    }
  return {
    beginShutdown,
    settleShutdown,
    drainPendingReprioritizes,
    drainPendingLearningCompactions,
    cleanupStaleAssistantQuestions,
  };
}
function createAssistantThreadMaintenanceOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations) {
  const { repository, callbacks, reprioritizeStates, invalidatedAssistants, chatFlights, learningCompactions, pendingLearningCompactions } = context;
  async function maybeSummarizeThread(assistant: Assistant, thread: AssistantThread, usagePercent: number | undefined,
      abortSignal: AbortSignal, ownsFlight: () => boolean) {
      const shouldSummarize = thread.messages.length > 120 || (usagePercent ?? 0) >= 70;
      if (!shouldSummarize) return;
  
      if (!ownsFlight()) return;
      const runtime = await operations.resolveRuntime(assistant);
      if (!ownsFlight()) return;
      const result = await runtime.adapter.runPrompt({
        kind: "planner",
        cwd: runtime.cwd,
        modelId: runtime.modelId,
        prompt: buildThreadSummaryPrompt(assistant, thread),
        readOnly: true,
        fastMode: runtime.fastMode,
        reasoningStrength: runtime.reasoningStrength,
        promptCacheIdentity: runtime.promptCacheIdentity,
        abortSignal
      });
      if (!ownsFlight()) return;
      const summarizedThread = repository.setAssistantThreadMemorySummary(assistant.id, result.text.trim());
      operations.appendLog({
        assistantId: assistant.id,
        level: "info",
        summary: "Rolled assistant context",
        detail: "Updated assistant thread memory summary."
      });
      callbacks.onAssistantsUpdated([assistant.id]);
      return summarizedThread;
    }
  function invalidateAssistant(assistantId: string) {
      invalidateAssistantWork(invalidatedAssistants, reprioritizeStates, assistantId);
      learningCompactions.delete(assistantId); pendingLearningCompactions.delete(assistantId);
      chatFlights.get(assistantId)?.controller.abort(); chatFlights.delete(assistantId);
    }
  return {
    maybeSummarizeThread,
    invalidateAssistant,
  };
}
export function createAssistantMaintenanceOperations(
  context: AssistantManagerContext,
  operations: AssistantPromptOperations & AssistantLearningOperations
) {
  const operations1 = createAssistantReprioritizeOperations(context, { ...operations });
  const operations2 = createAssistantLifecycleOperations(context, { ...operations, ...operations1 });
  const operations3 = createAssistantThreadMaintenanceOperations(context, { ...operations });
  return {
    ...operations1,
    ...operations2,
    ...operations3,
  };
}

export type AssistantMaintenanceOperations = ReturnType<typeof createAssistantMaintenanceOperations>;
