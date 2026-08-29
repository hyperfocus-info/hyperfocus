import { createAssistantLogEntryId, createAssistantQuestionId, type AssistantLogEntry } from "@hyperfocus/ai-core/protocol";
import { debugLog, normalizeErrorMessage, serializeError } from "../logging";
import type { WorkspaceRepository } from "../workspace-repository";

export type AssistantBootstrapFlight = { attemptId: string; started: boolean };
export type QueuedAssistantBootstrap = { offerJobBootstrapAfterSuccess: boolean };

type BootstrapQueueCallbacks = {
  onAssistantLogAppended: (entry: AssistantLogEntry) => void;
  onAssistantDetailsChanged: (assistantIds: [string, ...string[]]) => void;
};

export function requireBootstrapFlightState(state: AssistantBootstrapFlight | undefined, assistantId: string) {
  if (!state) throw new Error(`Bootstrap flight state missing for assistant ${assistantId}.`);
  return state;
}

export function queueAssistantBootstrapFlight(input: {
  repository: WorkspaceRepository;
  callbacks: BootstrapQueueCallbacks;
  assistantId: string;
  flight: Promise<void>;
  flightState: AssistantBootstrapFlight;
  queuedFlights: WeakMap<Promise<void>, QueuedAssistantBootstrap>;
  offerJobBootstrapAfterSuccess: boolean;
  offerJobBootstrap: () => void;
}) {
  const queued = input.queuedFlights.get(input.flight);
  if (queued) { queued.offerJobBootstrapAfterSuccess ||= input.offerJobBootstrapAfterSuccess; return; }
  const ownership = { offerJobBootstrapAfterSuccess: input.offerJobBootstrapAfterSuccess };
  input.queuedFlights.set(input.flight, ownership);
  void input.flight.then(() => {
    if (!ownership.offerJobBootstrapAfterSuccess) return;
    try { input.offerJobBootstrap(); }
    catch (error) { settleFollowupFailure(input.repository, input.callbacks, input.assistantId, error); }
  }, (error) => settleFlightFailure(input.repository, input.callbacks,
    input.assistantId, input.flightState, error));
}

export function recoverStaleAssistantBootstrapRuns(repository: WorkspaceRepository, callbacks: BootstrapQueueCallbacks,
  assistants: Iterable<{ id: string; bootstrapState: string; bootstrapAttemptId?: string; bootstrapStartedAt?: string }>,
  maxAgeMs: number) {
  const now = Date.now();
  for (const assistant of assistants) {
    if (assistant.bootstrapState !== "running") continue;
    const startedAt = assistant.bootstrapStartedAt ? Date.parse(assistant.bootstrapStartedAt) : Number.NaN;
    if (Number.isFinite(startedAt) && now - startedAt < maxAgeMs) continue;
    const finishedAt = new Date().toISOString();
    const recovered = repository.recoverStaleAssistantBootstrap({ assistantId: assistant.id,
      expectedAttemptId: assistant.bootstrapAttemptId, expectedStartedAt: assistant.bootstrapStartedAt, finishedAt,
      logEntry: { id: createAssistantLogEntryId(), assistantId: assistant.id, level: "error", summary: "Bootstrap stale",
        detail: "Bootstrap was still running after reconnect and can be retried.", createdAt: finishedAt },
      question: { id: createAssistantQuestionId(), assistantId: assistant.id,
        prompt: "Assistant bootstrap was interrupted or stalled. Retry bootstrap when ready?", status: "pending",
        askedAt: finishedAt } });
    if (!recovered) continue;
    callbacks.onAssistantLogAppended(recovered.logEntry); callbacks.onAssistantDetailsChanged([assistant.id]);
  }
}

function settleFlightFailure(repository: WorkspaceRepository, callbacks: BootstrapQueueCallbacks,
  assistantId: string, flight: AssistantBootstrapFlight, error: unknown) {
  const createdAt = new Date().toISOString();
  try {
    const logEntry = { id: createAssistantLogEntryId(), assistantId, level: "error" as const,
      summary: flight.started ? "Bootstrap failed" : "Bootstrap launch failed", detail: normalizeErrorMessage(error),
      detailsJson: serializeError(error), createdAt };
    if (flight.started) {
      const failed = repository.failCurrentAssistantBootstrapAttempt(assistantId, flight.attemptId, createdAt, logEntry);
      if (!failed) return;
      callbacks.onAssistantLogAppended(failed.logEntry); callbacks.onAssistantDetailsChanged([assistantId]);
    } else {
      const assistant = repository.getAssistant(assistantId); if (!assistant) return;
      const saved = repository.appendAssistantLogEntry(logEntry);
      callbacks.onAssistantLogAppended(saved); callbacks.onAssistantDetailsChanged([assistantId]);
    }
  } catch (persistenceError) {
    debugLog("assistant.bootstrap.queue-failure-persist-failed", { assistantId,
      error: normalizeErrorMessage(persistenceError), originalError: normalizeErrorMessage(error) });
  }
}

function settleFollowupFailure(repository: WorkspaceRepository, callbacks: BootstrapQueueCallbacks,
  assistantId: string, error: unknown) {
  try {
    const saved = repository.appendAssistantLogEntry({ id: createAssistantLogEntryId(), assistantId, level: "error",
      summary: "Bootstrap follow-up failed", detail: normalizeErrorMessage(error), detailsJson: serializeError(error),
      createdAt: new Date().toISOString() });
    callbacks.onAssistantLogAppended(saved); callbacks.onAssistantDetailsChanged([assistantId]);
  } catch (persistenceError) {
    debugLog("assistant.bootstrap.followup-failure-persist-failed", { assistantId,
      error: normalizeErrorMessage(persistenceError), originalError: normalizeErrorMessage(error) });
  }
}
