import type { Assistant } from "@hyperfocus/ai-core/protocol";
import type { AssistantManagerContext, ResolvedAssistantRuntime } from "../shared";
import type { AssistantPromptOperations } from "./prompt";
import type { AssistantQuestionDecision } from "../../assistant-question-policy";
import type { WorkspaceRepository } from "../../workspace-repository";
import { ASSISTANT_LEARNING_COMPACTION_CHAR_THRESHOLD, ASSISTANT_LEARNING_COMPACTION_FACT_THRESHOLD, buildAssistantLearningCompactionPrompt } from "../shared";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import { assistantLearningCompactionSchema } from "../../assistant-manager-schemas";
import { createAssistantLearningId, createAssistantLogEntryId, createAssistantQuestionId } from "@hyperfocus/ai-core/protocol";
import { createAssistantQuestionPolicyEffects, evaluateAssistantQuestionPolicy, readAssistantPromptQuestions } from "../../assistant-question-policy";
import { debugLog, normalizeErrorMessage } from "../../logging";
import { deferAssistantCompaction, normalizeAssistantLearningKey, scheduleAssistantCompaction } from "../../assistant-learning-policy";
import { normalizeAssistantLearningSource } from "../../workspace-repository";
import { settleAssistantCompactionFailure } from "../../assistant-lifecycle/compaction-failure";
import { trackAssistantManagerFlight } from "../../assistant-lifecycle/manager-shutdown";

export function createAssistantLearningOperations(
  context: AssistantManagerContext,
  operations: AssistantPromptOperations
) {
  const { repository, callbacks, learningCompactions, pendingLearningCompactions, reprioritizeFlights, invalidatedAssistants } = context;
  async function maybeCompactAssistantLearnings(assistantId: string, reason: string) {
    if (deferLearningCompaction(assistantId, reason)) return;
    try { assertAssistantRunnableForLaunch(repository, assistantId, { allowGlobalPauseDeferral: true }); }
    catch { return; }
    let snapshot: ReturnType<WorkspaceRepository["getAssistantLearningCompactionSnapshot"]>;
    try {
      snapshot = repository.getAssistantLearningCompactionSnapshot(assistantId);
      assertAssistantRunnableForLaunch(repository, assistantId, { allowGlobalPauseDeferral: true });
    } catch { return; }
    const active = snapshot.learnings.filter((learning) => !learning.compactedAt);
    const activeFactCount = active.filter((learning) => (learning.kind ?? "fact") === "fact").length;
    if (activeFactCount <= ASSISTANT_LEARNING_COMPACTION_FACT_THRESHOLD &&
      active.reduce((total, learning) => total + learning.summary.length, 0) <= ASSISTANT_LEARNING_COMPACTION_CHAR_THRESHOLD) return;
    let modelFallbackDetail: string | undefined;
    try {
      const runtime = await operations.resolveRuntime(snapshot.assistant, {}, false);
      modelFallbackDetail = runtime.modelFallbackDetail;
      if (deferLearningCompaction(assistantId, reason)) return;
      try { assertAssistantRunnableForLaunch(repository, assistantId, { allowGlobalPauseDeferral: true }); }
      catch { return; }
      const learnings = snapshot.learnings;
      const compaction = await runAssistantLearningCompaction(runtime, {
        assistant: snapshot.assistant,
        prompt: buildAssistantLearningCompactionPrompt(snapshot.assistant, reason, learnings),
        readOnly: runtime.readOnly
      });
      const now = new Date().toISOString();
      const retainedKeys = new Set((compaction.retainedFacts ?? []).map((learning) => normalizeAssistantLearningKey(learning.summary)));
      const supersededIds = learnings
        .filter((learning) => (learning.kind ?? "fact") === "fact")
        .filter((learning) => {
          if (learning.confidence !== "high") {
            return true;
          }
          const source = learning.source.toLowerCase();
          const isUserGuidance = source.startsWith("question:") || source.startsWith("question-policy:") || source.startsWith("user");
          return !isUserGuidance || retainedKeys.has(normalizeAssistantLearningKey(learning.summary));
        })
        .map((learning) => learning.id);

      const retainedLearnings = (compaction.retainedFacts ?? []).map((learning) => ({
        id: createAssistantLearningId(), assistantId, summary: learning.summary,
        source: normalizeAssistantLearningSource(learning.source ?? `compaction:${reason}:retained`),
        confidence: learning.confidence ?? "medium" as const, createdAt: now, kind: "fact" as const
      }));
      const logEntry = { id: createAssistantLogEntryId(), assistantId, level: "info" as const,
        summary: "Compacted assistant learnings", detail: `Merged ${supersededIds.length} learning rows.`, createdAt: now };
      const saved = repository.compactAssistantLearningsWithRetained({
        assistantId, expectedMutationRevision: snapshot.mutationRevision, compactedLearning: {
          id: createAssistantLearningId(),
          assistantId,
          summary: compaction.summary,
          source: normalizeAssistantLearningSource(`compaction:${reason}`),
          confidence: "high",
          createdAt: now,
          kind: "summary",
          supersedesLearningIds: supersededIds,
          compactedAt: now
        }, supersededIds, retainedLearnings,
        fallbackLogEntry: runtime.modelFallbackDetail ? { id: createAssistantLogEntryId(), assistantId, level: "warning",
          summary: "Assistant model fallback", detail: runtime.modelFallbackDetail, createdAt: now } : undefined,
        logEntry
      });
      if (saved) {
        if (saved.fallbackLogEntry) callbacks.onAssistantLogAppended(saved.fallbackLogEntry);
        callbacks.onAssistantLogAppended(saved.logEntry);
        callbacks.onAssistantDetailsChanged([assistantId]);
      }
    } catch (error) {
      settleAssistantCompactionFailure({ repository: repository, assistantId,
        expectedMutationRevision: snapshot.mutationRevision, modelFallbackDetail, error,
        markDirty: () => markLearningCompactionDirtyIfRunnable(assistantId, reason),
        onLog: (entry) => callbacks.onAssistantLogAppended(entry) });
    }
  }
  function scheduleLearningCompaction(assistantId: string, reason: string) {
    if (context.shuttingDown) return;
    if (invalidatedAssistants.has(assistantId)) return;
    if (deferLearningCompaction(assistantId, reason)) return;
    const flight = scheduleAssistantCompaction(learningCompactions, assistantId, reason,
      async (nextReason) => maybeCompactAssistantLearnings(assistantId, nextReason)
        .catch((error) => debugLog("assistant.learning-compaction.failed", { assistantId,
          error: normalizeErrorMessage(error) })),
      () => !invalidatedAssistants.has(assistantId) && Boolean(repository.getAssistant(assistantId)));
    if (flight) trackAssistantManagerFlight(reprioritizeFlights, flight);
  }
  function markLearningCompactionDirtyIfRunnable(assistantId: string, reason: string) {
    try { assertAssistantRunnableForLaunch(repository, assistantId, { allowGlobalPauseDeferral: true }); }
    catch { return; }
    if (deferLearningCompaction(assistantId, reason)) return;
    const state = learningCompactions.get(assistantId);
    if (state) { state.dirty = true; state.lastReason = `concurrent:${reason}`; }
    else scheduleLearningCompaction(assistantId, `concurrent:${reason}`);
  }
  function deferLearningCompaction(assistantId: string, reason: string) {
    return deferAssistantCompaction(pendingLearningCompactions, assistantId, reason,
      repository.getGlobalExecutionPaused());
  }
  async function runAssistantLearningCompaction(
    runtime: ResolvedAssistantRuntime,
    input: { assistant: Assistant; prompt: string; readOnly: boolean }
  ) {
    const firstPayload = await operations.runCompactionAttempt(runtime, input);
    const first = assistantLearningCompactionSchema.safeParse(firstPayload);
    if (first.success) {
      return first.data;
    }

    const repairedPayload = await operations.runCompactionAttempt(runtime, {
      ...input,
      prompt: `${input.prompt}\n\nPrevious response failed schema validation. Return only valid JSON with summary and retainedFacts.`
    });
    const repaired = assistantLearningCompactionSchema.safeParse(repairedPayload);
    if (repaired.success) {
      return repaired.data;
    }
    throw new Error("Assistant learning compaction payload invalid");
  }
  async function recordFailure(assistantId: string, message: string, createQuestion: boolean) {
    const failure = repository.recordAssistantFailure(assistantId, message);
    if (!failure) return;
    if (failure.shouldTrip) {
      operations.appendLog({
        assistantId,
        level: "critical",
        summary: "Circuit breaker tripped",
        detail: message,
        detailsJson: {
          failureStreakCount: failure.failureStreakCount
        }
      });
      if (createQuestion) {
        if (!repository.hasAssistantPendingQuestion(assistantId)) {
          saveBlockingQuestion(assistantId, `Assistant paused itself after repeated failures. How should it proceed? Latest error: ${message}`, {
            forceBlocking: true
          });
        }
      }
      return;
    }

  }
  function saveBlockingQuestion(assistantId: string, prompt: string, options: { forceBlocking?: boolean; runtimeReadOnly?: boolean } = {}) {
    if (repository.hasAssistantPendingQuestion(assistantId)) return { kind: "already-pending" as const };

    const decision = evaluateAssistantQuestionPolicy({
      prompt,
      questions: readAssistantPromptQuestions((cursor) =>
        repository.listAssistantQuestions({ assistantId, cursor, limit: 128 })),
      learnings: operations.readPromptLearnings(assistantId),
      runtimeReadOnly: options.runtimeReadOnly,
      forceBlocking: options.forceBlocking,
      autoApproveNonBlocking: repository.getAssistantAutoApproveNonBlockingQuestionsDefault()
    });
    if (decision.kind !== "ask") {
      applyQuestionPolicyDecision(assistantId, prompt, decision);
      return { kind: "policy-resolved" as const };
    }

    return repository.saveAssistantQuestionIfNoPending({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: prompt.trim(),
      status: repository.getGlobalExecutionPaused() ? "deferred" : "pending",
      askedAt: new Date().toISOString()
    });
  }
  function applyQuestionPolicyDecision(assistantId: string, prompt: string, decision: AssistantQuestionDecision) {
    if (decision.kind === "ask") {
      return;
    }
    const effects = createAssistantQuestionPolicyEffects(assistantId, prompt, decision, new Date().toISOString());
    repository.saveAssistantLearningDeduped(effects.learning);
    scheduleLearningCompaction(assistantId, `question-policy:${decision.category}`);
    const log = repository.appendAssistantLogEntry(effects.log);
    callbacks.onAssistantLogAppended(log);
  }
  return {
    maybeCompactAssistantLearnings,
    scheduleLearningCompaction,
    markLearningCompactionDirtyIfRunnable,
    deferLearningCompaction,
    runAssistantLearningCompaction,
    recordFailure,
    saveBlockingQuestion,
    applyQuestionPolicyDecision,
  };
}

export type AssistantLearningOperations = ReturnType<typeof createAssistantLearningOperations>;
