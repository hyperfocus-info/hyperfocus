import type { Assistant, AssistantLearning, AssistantTodo } from "@hyperfocus/ai-core/protocol";
import type { AssistantBootstrapFlight } from "../../assistant-lifecycle/bootstrap-queue";
import type { AssistantLearningOperations } from "./learning";
import type { AssistantMaintenanceOperations } from "./maintenance";
import type { AssistantManagerContext } from "../shared";
import type { AssistantPromptOperations } from "./prompt";
import { ASSISTANT_JOB_BOOTSTRAP_DELAY_MS, buildAssistantJobBootstrapQuestion, shouldAskAssistantJobBootstrap } from "../../assistant-job-bootstrap";
import { DEFAULT_CODING_STACK_QUESTION, assistantMaintenanceCandidates, buildBootstrapPrompt, unrefTimer } from "../shared";
import { applyAssistantTodoPolicy } from "../../assistant-todo-policy";
import { bootstrapProposalSchema } from "../../assistant-manager-schemas";
import { createAssistantLearningId, createAssistantLogEntryId, createAssistantQuestionId, createAssistantTodoId } from "@hyperfocus/ai-core/protocol";
import { normalizeErrorMessage, serializeError } from "../../logging";
import { queueAssistantBootstrapFlight, recoverStaleAssistantBootstrapRuns, requireBootstrapFlightState } from "../../assistant-lifecycle/bootstrap-queue";

function createAssistantBootstrapSupportOperations(context: AssistantManagerContext) {
  const { repository, callbacks } = context;
  function recoverStaleBootstrapRuns(maxAgeMs: number = 1800000) { recoverStaleAssistantBootstrapRuns(repository,
      callbacks, assistantMaintenanceCandidates(repository), maxAgeMs); }
  function finishConflictedBootstrap(assistantId: string, attemptId: string) {
      const finishedAt = new Date().toISOString();
      const failed = repository.failCurrentAssistantBootstrapAttempt(assistantId, attemptId, finishedAt, {
        id: createAssistantLogEntryId(), assistantId, level: "warning", summary: "Bootstrap state changed",
        detail: "Assistant settings changed while bootstrap was running. Retry bootstrap to use the current settings.",
        createdAt: finishedAt
      });
      if (!failed) return; callbacks.onAssistantLogAppended(failed.logEntry);
      callbacks.onAssistantDetailsChanged([assistantId]);
    }
  return {
    recoverStaleBootstrapRuns,
    finishConflictedBootstrap,
  };
}
type AssistantBootstrapSupportOperationsSet = ReturnType<typeof createAssistantBootstrapSupportOperations>;

function createAssistantBootstrapCoreOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations & AssistantBootstrapSupportOperationsSet) {
  const { repository, callbacks, bootstrapFlights, bootstrapFlightState, queuedBootstrapFlights, jobBootstrapTimers } = context;
  function bootstrapAssistant(assistantId: string, options: { force?: boolean } = {}) {
      if (context.shuttingDown) return Promise.resolve();
      const existingFlight = bootstrapFlights.get(assistantId);
      if (existingFlight && !options.force) {
        return existingFlight;
      }
      const state = { attemptId: crypto.randomUUID(), started: false };
      const flight = runBootstrapAssistant(assistantId, state).finally(() => {
        if (bootstrapFlights.get(assistantId) === flight) {
          bootstrapFlights.delete(assistantId);
        }
      });
      bootstrapFlightState.set(flight, state);
      bootstrapFlights.set(assistantId, flight);
      return flight;
    }
  function queueAssistantBootstrap(assistantId: string, options: { force?: boolean; offerJobBootstrapAfterSuccess?: boolean } = {}) {
      if (context.shuttingDown) return;
      const flight = bootstrapAssistant(assistantId, options); const queued = queuedBootstrapFlights.get(flight);
      if (queued) { queued.offerJobBootstrapAfterSuccess ||= options.offerJobBootstrapAfterSuccess === true; return; }
      queueAssistantBootstrapFlight({ repository: repository, callbacks: callbacks, assistantId, flight,
        flightState: requireBootstrapFlightState(bootstrapFlightState.get(flight), assistantId), queuedFlights: queuedBootstrapFlights,
        offerJobBootstrapAfterSuccess: options.offerJobBootstrapAfterSuccess === true,
        offerJobBootstrap: () => maybeAskJobBootstrap(assistantId, "manual-bootstrap", { immediate: true }) });
    }
  function scheduleJobBootstrapCheck(assistantId: string, _reason: string) {
      if (context.shuttingDown) return;
      const assistant = repository.getAssistant(assistantId);
      if (!assistant || assistant.deletedAt) {
        return;
      }
      const existingTimer = jobBootstrapTimers.get(assistantId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const createdAtMs = Date.parse(assistant.createdAt);
      const delayMs = Number.isFinite(createdAtMs)
        ? Math.max(0, createdAtMs + ASSISTANT_JOB_BOOTSTRAP_DELAY_MS - Date.now())
        : ASSISTANT_JOB_BOOTSTRAP_DELAY_MS;
      const timer = setTimeout(() => {
        jobBootstrapTimers.delete(assistantId);
        maybeAskJobBootstrap(assistantId, "idle-timeout");
      }, delayMs);
      unrefTimer(timer);
      jobBootstrapTimers.set(assistantId, timer);
    }
  function recoverIdleJobBootstrapChecks(now: Date = new Date()) {
      for (const assistant of assistantMaintenanceCandidates(repository)) {
        if (shouldAskAssistantJobBootstrap(repository, assistant, now)) {
          saveJobBootstrapQuestion(assistant);
          continue;
        }
        if (!assistant.deletedAt && assistant.runState === "active" && assistant.circuitBreakerState !== "tripped") {
          scheduleJobBootstrapCheck(assistant.id, "startup-recovery");
        }
      }
    }
  function maybeAskJobBootstrap(assistantId: string, _reason: string, options: { immediate?: boolean } = {}) {
      if (context.shuttingDown) return undefined;
      const assistant = repository.getAssistant(assistantId);
      if (!assistant || !shouldAskAssistantJobBootstrap(repository, assistant, new Date(), options)) {
        return undefined;
      }
      return saveJobBootstrapQuestion(assistant);
    }
  function saveJobBootstrapQuestion(assistant: Assistant) {
      const question = repository.saveAssistantQuestion(
        buildAssistantJobBootstrapQuestion(assistant, repository.getGlobalExecutionPaused() ? "deferred" : "pending")
      );
      operations.appendLog({
        assistantId: assistant.id,
        level: "info",
        summary: "Assistant job bootstrap offered",
        detail: "Assistant has no background jobs after its initial idle window."
      });
      callbacks.onAssistantDetailsChanged([assistant.id]);
      return question;
    }
  async function runBootstrapAssistant(assistantId: string, flight: AssistantBootstrapFlight) {
      const attemptId = flight.attemptId;
      const startedAt = new Date().toISOString();
      const started = repository.startAssistantBootstrapAttempt(assistantId, attemptId, startedAt, {
        id: createAssistantLogEntryId(), assistantId, level: "info", summary: "Bootstrap started",
        detail: "Researching assistant role and initial operating state.", createdAt: startedAt
      });
      if (!started) return; flight.started = true;
      callbacks.onAssistantLogAppended(started.logEntry);
      callbacks.onAssistantsUpdated([assistantId]);
      const { assistant, mutationRevision: expectedMutationRevision } = started; let modelFallbackDetail: string | undefined;
      try {
        const runtime = await operations.resolveRuntime(assistant, {}, false); modelFallbackDetail = runtime.modelFallbackDetail;
        if (!repository.isAssistantBootstrapAttemptCurrent(assistantId, attemptId, expectedMutationRevision)) {
          operations.finishConflictedBootstrap(assistantId, attemptId);
          return;
        }
        const proposal = await operations.runProposalPrompt(runtime, {
          assistant,
          prompt: buildBootstrapPrompt(assistant),
          readOnly: true,
          schema: bootstrapProposalSchema,
          repairInstruction:
            "Previous response failed schema validation. Return only valid JSON with researchSummary, learnings, initialTodos, and remainIdle.",
          errorMessage: "Assistant bootstrap payload invalid"
        });
        const now = new Date().toISOString();
        const learnings: AssistantLearning[] = [];
        if (proposal?.researchSummary) learnings.push({
            id: createAssistantLearningId(),
            assistantId,
            summary: proposal.researchSummary,
            source: "bootstrap-research",
            confidence: "high",
            createdAt: now
          });
        for (const learning of proposal?.learnings ?? []) learnings.push({
            id: createAssistantLearningId(),
            assistantId,
            summary: learning.summary.trim(),
            source: learning.source?.trim() || "bootstrap",
            confidence: learning.confidence ?? "medium",
            createdAt: now
          });
  
        const todoDrafts = applyAssistantTodoPolicy({
          assistant,
          existingTodoCounts: repository.getAssistantTodoPolicyCounts(assistantId),
          drafts: proposal?.initialTodos ?? []
        }).slice(0, 8);
        const todos = todoDrafts.map((todo, index): AssistantTodo => ({
            id: createAssistantTodoId(),
            assistantId,
            title: todo.title.trim(),
            description: todo.description?.trim() || undefined,
            state: "pending",
            sortOrder: index,
            source: "bootstrap",
            workKind: todo.workKind,
            workTarget: todo.workTarget,
            createdAt: now,
            updatedAt: now
          }));
        const codingTodo = todoDrafts.find((todo) => operations.shouldAskDefaultStackPreference(assistantId, todo));
        const completed = repository.applyAssistantBootstrapTransition({ assistantId, expectedAttemptId: attemptId,
          expectedMutationRevision, state: "completed", finishedAt: now, learnings, todos,
          fallbackLogEntry: modelFallbackDetail ? { id: createAssistantLogEntryId(), assistantId, level: "warning",
            summary: "Assistant model fallback", detail: modelFallbackDetail, createdAt: now } : undefined,
          question: codingTodo ? { id: createAssistantQuestionId(), assistantId, prompt: DEFAULT_CODING_STACK_QUESTION,
            status: "pending", linkedTodoIds: [], askedAt: now } : undefined,
          logEntry: { id: createAssistantLogEntryId(), assistantId, level: "info", summary: "Bootstrap completed",
            detail: todos.length > 0 ? `Created ${todos.length} initial todos.` : "Assistant remains reactive until prompted.",
            createdAt: now }
        });
        if (!completed) { operations.finishConflictedBootstrap(assistantId, attemptId); return; }
        if (completed.fallbackLogEntry) callbacks.onAssistantLogAppended(completed.fallbackLogEntry);
        callbacks.onAssistantLogAppended(completed.logEntry);
        callbacks.onAssistantDetailsChanged([assistantId]);
        await operations.maybeCompactAssistantLearnings(assistantId, "bootstrap");
        if (!proposal?.remainIdle && todos.length > 0) {
          operations.scheduleReprioritize(assistantId, "bootstrap");
        }
      } catch (error) {
        const message = normalizeErrorMessage(error);
        const finishedAt = new Date().toISOString();
        const failed = repository.applyAssistantBootstrapTransition({ assistantId, expectedAttemptId: attemptId,
          expectedMutationRevision, state: "failed", finishedAt,
          fallbackLogEntry: modelFallbackDetail ? { id: createAssistantLogEntryId(), assistantId, level: "warning", summary: "Assistant model fallback", detail: modelFallbackDetail, createdAt: finishedAt } : undefined,
          logEntry: { id: createAssistantLogEntryId(), assistantId, level: "error", summary: "Bootstrap failed",
            detail: message, detailsJson: serializeError(error), createdAt: finishedAt }
        });
        if (!failed) { operations.finishConflictedBootstrap(assistantId, attemptId); return; }
        if (failed.fallbackLogEntry) callbacks.onAssistantLogAppended(failed.fallbackLogEntry); callbacks.onAssistantLogAppended(failed.logEntry);
        await operations.recordFailure(assistantId, message, true);
        callbacks.onAssistantDetailsChanged([assistantId]);
      }
    }
  return {
    bootstrapAssistant,
    queueAssistantBootstrap,
    scheduleJobBootstrapCheck,
    recoverIdleJobBootstrapChecks,
    maybeAskJobBootstrap,
    saveJobBootstrapQuestion,
    runBootstrapAssistant,
  };
}
export function createAssistantBootstrapOperations(
  context: AssistantManagerContext,
  operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations
) {
  const operations1 = createAssistantBootstrapSupportOperations(context);
  const operations2 = createAssistantBootstrapCoreOperations(context, { ...operations, ...operations1 });
  return {
    ...operations1,
    ...operations2,
  };
}

export type AssistantBootstrapOperations = ReturnType<typeof createAssistantBootstrapOperations>;
