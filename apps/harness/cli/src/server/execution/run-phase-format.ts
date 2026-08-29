import type { RunMilestonePhase } from "../../run-milestone-windows";
import type { AgentRunState, AgentTrace } from "@hyperfocus/ai-core/protocol";

export function statusMessageFromTrace(trace: AgentTrace) {
  switch (trace.stage) {
    case "planning":
      return "Planning task.";
    case "routing":
      return trace.message;
    case "merge-start":
    case "merge-conflict":
    case "merge-complete":
    case "verification-start":
    case "verification-complete":
      return trace.message;
    case "refresh-requested":
    case "refresh-deferred":
      return trace.message;
    default:
      return undefined;
  }
}

export function inferTracePhase(trace: AgentTrace, fallback: RunMilestonePhase): RunMilestonePhase {
  if (trace.stage.startsWith("subagent") || trace.stage.startsWith("merge") || trace.stage.startsWith("branchfs")) {
    return "subagents";
  }
  if (trace.stage.startsWith("aggregation")) {
    return "aggregation";
  }
  if (trace.stage.startsWith("correctness") || trace.stage.startsWith("verification")) {
    return "correctness";
  }
  if (trace.stage.startsWith("planning") || trace.stage === "routing" || trace.stage === "plan-presented") {
    return "planning";
  }
  return fallback;
}

export function inferMilestonePhase(line: string, fallback: RunMilestonePhase): RunMilestonePhase {
  if (/correctness|verification|run (?:partial )?complete/i.test(line)) {
    return "correctness";
  }
  if (/aggregat|combining/i.test(line)) {
    return "aggregation";
  }
  if (/subagent|spawning/i.test(line)) {
    return "subagents";
  }
  if (/planning|routing/i.test(line)) {
    return "planning";
  }
  return fallback;
}

export function inferRunPhase(status: AgentRunState["status"]): RunMilestonePhase {
  if (status === "running-subagents") {
    return "subagents";
  }
  if (status === "aggregating") {
    return "aggregation";
  }
  if (status === "running-main" || status === "completed" || status === "partial-complete") {
    return "correctness";
  }
  return "planning";
}

export function formatSubagentDoneStatus(title: string, run: AgentRunState) {
  const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
  return `Subagent done: ${title}. Progress ${completedCount}/${run.subtasks.length}.`;
}

export function formatSubagentFailedStatus(title: string, errorMessage: string | undefined, run: AgentRunState) {
  const completedCount = run.subtasks.filter((task) => task.status === "completed").length;
  const failedCount = run.subtasks.filter((task) => task.status === "failed").length;
  return `Subagent fail: ${title}. ${summarizeSubagentError(errorMessage)}. Progress ${completedCount}/${run.subtasks.length}, ${failedCount} failed.`;
}

export function summarizeSubagentError(errorMessage: string | undefined) {
  const summary = (errorMessage ?? "Unknown subagent failure")
    .split(/\r?\n/, 1)[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
  return summary || "Unknown subagent failure";
}

export function formatExecutionOwner(owner: "main" | "subagent" | "aggregator", subagentId: string | undefined, run?: AgentRunState) {
  if (owner === "subagent") {
    const title = subagentId ? run?.subtasks.find((task) => task.id === subagentId)?.title : undefined;
    return title ? `Subagent ${title}` : subagentId ? `Subagent ${subagentId}` : "Subagent";
  }

  return owner === "aggregator" ? "Aggregator" : "Main execution";
}
