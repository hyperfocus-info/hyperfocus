import type { PlannerSubtask } from "@hyperfocus/ai-core/protocol";
import type { SubagentResult } from "../pi-subagents";

export function formatSubagentResults(subtasks: PlannerSubtask[], subagentResults: SubagentResult[]) {
  return subtasks
    .map((task) => {
      const result = subagentResults.find((entry) => entry.id === task.id);
      return [
        `Subtask ${task.id}: ${task.title}`,
        `Instruction: ${task.instruction}`,
        `Status: ${result?.status ?? "missing"}`,
        result?.output ? `Output: ${result.output}` : "Output: (missing)",
        result?.contractDriftPaths && result.contractDriftPaths.length > 0
          ? `Contract drift paths: ${result.contractDriftPaths.join(", ")}`
          : "",
        describeSharedChanges(result?.unattributedChangePaths ?? []),
        result?.errorMessage ? `Error: ${result.errorMessage}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function formatSubagentCompletionDetail(output: string, unattributedChangePaths: string[]) {
  return [
    output.slice(0, 240),
    describeSharedChanges(unattributedChangePaths)
  ].filter(Boolean).join("\n");
}

function describeSharedChanges(paths: string[]) {
  return paths.length ? `Shared-worktree changes outside this task's scope (author unknown): ${paths.join(", ")}. Snapshot differences may belong to siblings or external writers; inspect before assigning responsibility.` : "";
}

export function buildSubagentRecoveryPrompt(
  task: PlannerSubtask,
  result: SubagentResult,
  contractSettings: { explicitOwnedPaths: string[] },
  strategy: "same-worktree" | "separate-worktrees"
) {
  return [
    "Recovery attempt. Repair this subtask.",
    `Previous failure: ${result.errorMessage ?? "Unknown subagent failure"}`,
    strategy === "same-worktree"
      ? "Work in the same checkout and use owned paths as the primary work area."
      : "Work inside this isolated subagent mount.",
    contractSettings.explicitOwnedPaths.length > 0
      ? `Owned paths: ${contractSettings.explicitOwnedPaths.join(", ")}`
      : "Owned paths: planner did not specify paths. Treat task as exclusive.",
    `Retry subtask title: ${task.title}`,
    "Focus on the previous failure cause, complete the file changes, and return a concise changed-file summary."
  ]
    .filter(Boolean)
    .join("\n");
}
