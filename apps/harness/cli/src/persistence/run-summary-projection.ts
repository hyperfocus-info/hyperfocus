import { agentRunSummarySchema, type AgentRunStatus, type AgentRunSummary, type RunFailureCategory } from "@hyperfocus/ai-core/protocol";

export type AgentRunSummaryRow = { id: string; project_id: string; thread_id: string; status: AgentRunStatus;
  prompt_chars: number | null; prompt_hash: string | null; transcript_chars: number | null; latest_task_chars: number | null;
  final_execution_brief: string | null; failure_message: string | null; failure_category: RunFailureCategory | null;
  max_turns: number | null; turns_used: number; has_subtasks: number; thread_run_sequence: number;
  updated_at: string; completed_at: string | null };

export function toAgentRunSummaryRow(run: AgentRunSummaryRow): AgentRunSummary | undefined {
  const hasExecutionState = Boolean(run.final_execution_brief) || run.has_subtasks > 0;
  const maxTurns = run.max_turns === null ? undefined : Math.min(Math.max(Math.trunc(run.max_turns), 1), 1_000);
  const turnsUsed = maxTurns === undefined ? 0 : Math.min(Math.max(Math.trunc(run.turns_used), 0), maxTurns);
  const remainingTurns = maxTurns === undefined ? 0 : Math.max(0, maxTurns - turnsUsed);
  const parsed = agentRunSummarySchema.safeParse({ id: run.id, threadId: run.thread_id,
    threadRunSequence: run.thread_run_sequence, status: run.status,
    failureMessage: run.failure_message ?? undefined, failureCategory: run.failure_category ?? undefined,
    runtimeBudget: maxTurns === undefined ? undefined : { maxTurns, turnsUsed,
      currentTurn: remainingTurns === 0 ? turnsUsed : turnsUsed + 1, remainingTurns, exhausted: remainingTurns === 0 },
    promptStats: run.prompt_hash && Number.isFinite(run.prompt_chars) ? { promptChars: run.prompt_chars,
      promptHash: run.prompt_hash, transcriptChars: run.transcript_chars ?? undefined,
      latestTaskChars: run.latest_task_chars ?? undefined } : undefined,
    resumable: isRunResumable(run.status, hasExecutionState), retryable: isRunRetryable(run.status, hasExecutionState),
    updatedAt: run.updated_at, completedAt: run.completed_at ?? undefined });
  return parsed.success ? parsed.data : undefined;
}

export function isRunResumable(status: AgentRunStatus, hasExecutionState: boolean) {
  return status === "partial-complete" || status === "stopped" || (status === "failed" && hasExecutionState);
}

export function isRunRetryable(status: AgentRunStatus, hasExecutionState: boolean) {
  return status === "completed" || status === "partial-complete" || status === "stopped" ||
    (status === "failed" && hasExecutionState);
}
