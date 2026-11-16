import type { Database } from "bun:sqlite";
import type { AgentRunStatus, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";
import { persistTerminalRunTransition } from "./terminal-run-transition";

export type CompleteAgentRunInput = {
  projectId: ProjectId; threadId: ThreadId; runId: string;
  status: "completed" | "partial-complete"; reason: string; assistantMessageContent?: string;
};

export function persistCompletedAgentRun(db: Database, input: CompleteAgentRunInput, appendMessage: (content: string) => void) {
  db.transaction(() => {
    const row = db.query<{ status: AgentRunStatus; thread_id: string }, [string, string]>(
      "SELECT status, thread_id FROM agent_runs WHERE id = ?1 AND project_id = ?2"
    ).get(input.runId, input.projectId);
    if (!row || row.thread_id !== input.threadId) throw new Error("Run does not belong to the completion thread");
    if (!["running-main", "running-subagents", "aggregating"].includes(row.status)) {
      throw new Error(`Run status ${row.status} cannot complete execution`);
    }
    if (input.assistantMessageContent !== undefined) appendMessage(input.assistantMessageContent);
    if (!persistTerminalRunTransition(db, input)) throw new Error("Run changed during completion");
  }).immediate();
}
