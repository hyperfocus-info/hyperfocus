import { createAssistantLogEntryId, type AssistantLogEntry } from "@hyperfocus/ai-core/protocol";
import { debugLog, normalizeErrorMessage, serializeError } from "../logging";
import type { WorkspaceRepository } from "../workspace-repository";
import { isAssistantRevisionConflictError } from "../persistence/assistant-persistence";

export function settleAssistantCompactionFailure(input: {
  repository: WorkspaceRepository;
  assistantId: string;
  expectedMutationRevision: number;
  modelFallbackDetail?: string;
  error: unknown;
  markDirty: () => void;
  onLog: (entry: AssistantLogEntry) => void;
}) {
  if (isAssistantRevisionConflictError(input.error)) { input.markDirty(); return; }
  try {
    const createdAt = new Date().toISOString();
    const saved = input.repository.recordAssistantLearningCompactionFailure({ assistantId: input.assistantId,
      expectedMutationRevision: input.expectedMutationRevision,
      fallbackLogEntry: input.modelFallbackDetail ? { id: createAssistantLogEntryId(), assistantId: input.assistantId,
        level: "warning", summary: "Assistant model fallback", detail: input.modelFallbackDetail, createdAt } : undefined,
      failureLogEntry: { id: createAssistantLogEntryId(), assistantId: input.assistantId, level: "warning",
        summary: "Assistant learning compaction skipped", detail: normalizeErrorMessage(input.error),
        detailsJson: serializeError(input.error), createdAt } });
    if (!saved) { input.markDirty(); return; }
    if (saved.fallbackLogEntry) input.onLog(saved.fallbackLogEntry);
    input.onLog(saved.failureLogEntry);
  } catch (logError) {
    input.markDirty();
    debugLog("assistant.learning-compaction.log-failed", { assistantId: input.assistantId,
      error: normalizeErrorMessage(logError) });
  }
}
