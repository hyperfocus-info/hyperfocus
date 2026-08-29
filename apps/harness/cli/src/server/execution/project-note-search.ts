import type { ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";
import type {
  PiAgentMemorySearchInput,
  PiAgentMemorySearchResult
} from "../../pi-agent-adapter";
import { retrieveMemorySummaries } from "../../memory-bank";
import type { WorkspaceRepository } from "../../workspace-repository";

type ProjectNoteSearchOwner = "planner" | "main" | "subagent" | "aggregator";

export type ProjectNoteSearch = (
  input: PiAgentMemorySearchInput & { owner: ProjectNoteSearchOwner; subagentId?: string }
) => Promise<PiAgentMemorySearchResult>;

export function createProjectNoteSearch(
  repository: WorkspaceRepository,
  input: { projectId: ProjectId; threadId?: ThreadId; runId: string }
): ProjectNoteSearch | undefined {
  const threadId = input.threadId;
  if (!repository.getMemoryBankEnabledDefault() || !threadId) {
    return undefined;
  }
  return async (search) => {
    const result = retrieveMemorySummaries(repository, {
      projectId: input.projectId,
      threadId,
      runId: input.runId,
      owner: search.owner === "aggregator" ? "main" : search.owner,
      subagentId: search.subagentId,
      queryText: search.queryText,
      tags: search.tags,
      maxEntries: search.maxEntries
    });
    return {
      text: result.memorySummaries.length > 0
        ? result.memorySummaries.map((memory) => `## ${memory.label}\n${memory.content}`).join("\n\n")
        : "No relevant saved project notes matched this query.",
      count: result.memorySummaries.length
    };
  };
}
