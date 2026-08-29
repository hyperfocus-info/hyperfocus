import type { AssistantBootstrapOperations } from "./bootstrap";
import type { AssistantLearningOperations } from "./learning";
import type { AssistantMaintenanceOperations } from "./maintenance";
import type { AssistantManagerContext } from "../shared";
import type { AssistantPromptOperations } from "./prompt";
import type { AssistantThread, ComposerReasoningStrength } from "@hyperfocus/ai-core/protocol";
import { appendPersistableMessageDelta } from "../../persistence/message-content-policy";
import { assertAssistantRunnableForLaunch } from "../../assistant-launch-gate";
import { createAssistantChatFlight } from "../../assistant-lifecycle/manager-shutdown";
import { createAssistantLearningId, createAssistantLogEntryId, createAssistantTodoId } from "@hyperfocus/ai-core/protocol";
import { debugLog, normalizeErrorMessage, serializeError } from "../../logging";
import { extractQuestionPrompt, isDefaultCodingStackQuestion, summarize, toAssistantLiveThreadMetadata } from "../shared";

function createAssistantConversationOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations & AssistantBootstrapOperations) {
  const { repository, callbacks, chatFlights, chatCompletions } = context;
  async function sendAssistantChat(
      assistantId: string,
      content: string,
      controls: {
        modeId?: string;
        executionModelId?: string;
        reasoningStrength?: ComposerReasoningStrength;
        fastMode?: boolean;
      } = {}
    ) {
      if (context.shuttingDown) throw new Error("Assistant manager is shutting down");
      const assistant = assertAssistantRunnableForLaunch(repository, assistantId);
      chatFlights.get(assistantId)?.controller.abort();
      const flight = createAssistantChatFlight(Symbol(assistantId)); chatCompletions.add(flight.completion);
      chatFlights.set(assistantId, flight);
      const ownsFlight = () => chatFlights.get(assistantId)?.token === flight.token && !flight.controller.signal.aborted;
      const releaseFlight = () => { if (chatFlights.get(assistantId)?.token === flight.token) chatFlights.delete(assistantId);
        flight.complete(); chatCompletions.delete(flight.completion); };
      let thread: AssistantThread;
      try {
        thread = repository.appendAssistantMessage(assistantId, "user", content.trim());
      } catch (error) { releaseFlight(); throw error; }
      const userMessage = thread.messages[thread.messages.length - 1];
      if (!userMessage) { releaseFlight(); throw new Error("Assistant user message was not persisted"); }
      try { await callbacks.onAssistantChatMessageAppended({
          assistantId,
          sessionId: thread.sessionId,
          message: userMessage,
          thread: toAssistantLiveThreadMetadata(thread, userMessage.id)
        }); } catch (error) { releaseFlight(); throw error; }
      if (!ownsFlight()) { releaseFlight(); return; }
      let deltaBuffer = "";
      try {
        const runtime = await operations.resolveRuntime(assistant, controls); if (!ownsFlight()) return;
        const prompt = await operations.buildAssistantChatPrompt(assistant, content.trim()); if (!ownsFlight()) return;
        const result = await runtime.adapter.runPrompt({
          kind: "executor",
          cwd: runtime.cwd,
          modelId: runtime.modelId,
          prompt,
          readOnly: runtime.readOnly,
          reasoningStrength: runtime.reasoningStrength,
          fastMode: runtime.fastMode,
          promptCacheIdentity: runtime.promptCacheIdentity,
          abortSignal: flight.controller.signal,
          onTextDelta: (delta) => {
            if (!ownsFlight()) return;
            deltaBuffer = appendPersistableMessageDelta(deltaBuffer, delta);
            callbacks.onAssistantChatDelta({
              assistantId,
              sessionId: thread.sessionId,
              delta
            });
          }
        }); if (!ownsFlight()) return;
        const nextThread = repository.appendAssistantMessageIfLatest(
          assistantId,
          userMessage.id,
          "assistant",
          result.text.trim()
        );
        if (!nextThread || !ownsFlight()) { if (ownsFlight()) await callbacks.onAssistantChatFailed({ assistantId, sessionId: thread.sessionId }); return; }
        const assistantMessage = nextThread.messages[nextThread.messages.length - 1];
        if (!assistantMessage) {
          throw new Error("Assistant response was not persisted");
        }
        const summarizedThread = await operations.maybeSummarizeThread(assistant, nextThread, result.contextUsage?.usagePercent,
          flight.controller.signal, ownsFlight);
        if (!ownsFlight()) return;
        operations.appendLog({
          assistantId,
          level: "info",
          summary: "Chat response completed",
          detail: summarize(result.text),
          detailsJson: {
            usagePercent: result.contextUsage?.usagePercent,
            tokens: result.contextUsage?.tokens
          }
        });
        await callbacks.onAssistantChatComplete({
          assistantId,
          sessionId: nextThread.sessionId,
          assistantMessage,
          thread: toAssistantLiveThreadMetadata(summarizedThread ?? nextThread, assistantMessage.id)
        });
        if (!ownsFlight()) return;
        callbacks.onAssistantsUpdated([assistantId]);
        operations.scheduleReprioritize(assistantId, "chat");
      } catch (error) {
        if (!ownsFlight() || flight.controller.signal.aborted) return;
        try { await callbacks.onAssistantChatFailed({ assistantId, sessionId: thread.sessionId }); }
        catch (callbackError) { debugLog("assistant.chat.failure-publication-failed", { assistantId,
          error: normalizeErrorMessage(callbackError) }); } if (!ownsFlight()) return;
        const message = normalizeErrorMessage(error);
        operations.appendLog({
          assistantId,
          level: "error",
          summary: "Chat response failed",
          detail: message,
          detailsJson: {
            error: serializeError(error),
            partialDelta: deltaBuffer
          }
        });
        await operations.recordFailure(assistantId, message, true);
        throw error;
      } finally {
        releaseFlight();
      }
    }
  return {
    sendAssistantChat,
  };
}
function createAssistantAnswerOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations & AssistantBootstrapOperations) {
  const { repository, callbacks } = context;
  async function answerQuestion(assistantId: string, questionId: string, content: string, options: { reprioritize?: boolean } = {}) {
      return (await answerQuestions(assistantId, [{ questionId, content }], options))[0]!;
    }
  async function answerQuestions(
      assistantId: string,
      answers: Array<{ questionId: string; content: string }>,
      options: { reprioritize?: boolean } = {}
    ) {
      const now = new Date().toISOString();
      const writes = answers.map(({ questionId, content }) => {
        const question = repository.getAssistantQuestion(questionId);
        if (!question || question.assistantId !== assistantId) throw new Error("Unknown assistant question for assistant");
        const answerText = content.trim();
        return {
          questionId,
          answerText,
          logEntry: { id: createAssistantLogEntryId(), assistantId, level: "info" as const,
            summary: "Question answered", detail: summarize(answerText), createdAt: now },
          guidanceLearning: { id: createAssistantLearningId(), assistantId,
            summary: `User answered assistant question "${summarize(question.prompt, 120)}" with "${summarize(answerText, 120)}"; treat this as durable guidance and do not ask the same thing again unless context changes.`,
            source: `question:${question.id}`, confidence: "high" as const, createdAt: now },
          stackLearning: isDefaultCodingStackQuestion(question.prompt) ? { id: createAssistantLearningId(), assistantId,
            summary: `Coding stack preference: ${summarize(answerText || "default", 240)}.`, source: "stack-preference",
            confidence: "high" as const, createdAt: now } : undefined
        };
      });
      const result = repository.saveAssistantQuestionAnswers(assistantId, writes);
      if (result.appliedLogEntries.length > 0) {
        operations.scheduleLearningCompaction(assistantId, "question-answer");
        if (options.reprioritize !== false) operations.scheduleReprioritize(assistantId, "question-answer");
      }
      return result.questions;
    }
  async function retryBootstrap(assistantId: string) {
      const assistant = repository.getAssistant(assistantId);
      await operations.bootstrapAssistant(assistantId, { force: assistant?.bootstrapState !== "running" });
      operations.maybeAskJobBootstrap(assistantId, "manual-bootstrap", { immediate: true });
    }
  async function recoverAssistant(assistantId: string) {
      const assistant = repository.recoverAssistantCircuitBreaker(assistantId);
      operations.appendLog({
        assistantId,
        level: "info",
        summary: "Circuit breaker reset",
        detail: "Recovery retry requested by user."
      });
      callbacks.onAssistantsUpdated([assistantId]);
  
      if (assistant.bootstrapState === "failed" || assistant.bootstrapState === "pending") {
        await retryBootstrap(assistantId);
        return;
      }
  
      operations.scheduleReprioritize(assistantId, "circuit-breaker-recovery");
    }
  return {
    answerQuestion,
    answerQuestions,
    retryBootstrap,
    recoverAssistant,
  };
}
function createAssistantJobOutcomeOperations(context: AssistantManagerContext, operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations & AssistantBootstrapOperations) {
  const { repository, callbacks } = context;
  async function handleBackgroundJobRunOutcome(input: {
      assistantId: string;
      status: "succeeded" | "partial-complete" | "failed" | "cancelled" | "awaiting-user-input";
      summary?: string;
      failureMessage?: string;
    }) {
      const assistant = repository.getAssistant(input.assistantId);
      if (!assistant || assistant.deletedAt) {
        return;
      }
  
      if (input.status === "succeeded") {
        repository.updateAssistantFailureState(input.assistantId, {
          failureStreakCount: 0,
          circuitBreakerState: "closed",
          circuitBreakerReason: undefined
        });
        operations.appendLog({
          assistantId: input.assistantId,
          level: "info",
          summary: "Assistant job succeeded",
          detail: input.summary
        });
        operations.appendLog({
          assistantId: input.assistantId,
          level: "warning",
          summary: "Assistant job state unchanged",
          detail: "No assistant todo, learning, or question delta was needed after this job."
        });
        callbacks.onAssistantDetailsChanged([input.assistantId]);
        operations.scheduleReprioritize(input.assistantId, "job-succeeded");
        return { blocked: false };
      }
  
      if (input.status === "partial-complete") {
        repository.updateAssistantFailureState(input.assistantId, {
          failureStreakCount: 0,
          circuitBreakerState: "closed",
          circuitBreakerReason: undefined
        });
        operations.appendLog({
          assistantId: input.assistantId,
          level: "warning",
          summary: "Assistant job partially completed",
          detail: input.failureMessage ?? input.summary
        });
        if (input.failureMessage) {
          repository.appendAssistantTodo({
            id: createAssistantTodoId(),
            assistantId: input.assistantId,
            title: "Recover partial assistant job",
            description: input.failureMessage,
            state: "pending",
            source: "job",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        callbacks.onAssistantDetailsChanged([input.assistantId]);
        operations.scheduleReprioritize(input.assistantId, "job-partial-complete");
        return { blocked: false };
      }
  
      const rawMessage = input.failureMessage ?? input.summary ?? "";
      const message = rawMessage.trim() || "Unknown assistant job failure. What recovery step should this assistant try next?";
      if (!rawMessage.trim() && input.status === "failed") {
        operations.saveBlockingQuestion(input.assistantId, message, { forceBlocking: true });
      }
      const questionPrompt = extractQuestionPrompt(message);
      if (input.status === "awaiting-user-input" || questionPrompt) {
        const questionResult = operations.saveBlockingQuestion(input.assistantId, questionPrompt ?? message);
        if (questionResult.kind === "policy-resolved") {
          operations.appendLog({
            assistantId: input.assistantId,
            level: "info",
            summary: "Assistant job input auto-resolved",
            detail: questionPrompt ?? message
          });
          callbacks.onAssistantDetailsChanged([input.assistantId]);
          operations.scheduleReprioritize(input.assistantId, "job-question-auto-resolved");
          return { blocked: false };
        }
        operations.appendLog({
          assistantId: input.assistantId,
          level: "warning",
          summary: "Assistant job waiting for input",
          detail: questionPrompt ?? message
        });
        callbacks.onAssistantDetailsChanged([input.assistantId]);
        operations.scheduleReprioritize(input.assistantId, "job-question");
        return { blocked: true };
      }
  
      operations.appendLog({
        assistantId: input.assistantId,
        level: input.status === "cancelled" ? "warning" : "error",
        summary: input.status === "cancelled" ? "Assistant job cancelled" : "Assistant job failed",
        detail: message
      });
      await operations.recordFailure(input.assistantId, message, true);
      callbacks.onAssistantDetailsChanged([input.assistantId]);
      operations.scheduleReprioritize(input.assistantId, `job-${input.status}`);
      return { blocked: false };
    }
  return {
    handleBackgroundJobRunOutcome,
  };
}
export function createAssistantChatOperations(
  context: AssistantManagerContext,
  operations: AssistantPromptOperations & AssistantLearningOperations & AssistantMaintenanceOperations & AssistantBootstrapOperations
) {
  const operations1 = createAssistantConversationOperations(context, { ...operations });
  const operations2 = createAssistantAnswerOperations(context, { ...operations });
  const operations3 = createAssistantJobOutcomeOperations(context, { ...operations });
  return {
    ...operations1,
    ...operations2,
    ...operations3,
  };
}
