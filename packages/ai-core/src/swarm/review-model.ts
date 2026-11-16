import type { SwarmCandidate, SwarmRun, SwarmStatus } from "./contracts";
import { describeSwarmOutcome } from "./outcome-review";

const statusLabels: Record<SwarmStatus, string> = {
  CREATED: "Preparing", PLANNING: "Planning", READY: "Plan ready", RUNNING: "Running",
  VALIDATING: "Validating", COMPARING: "Comparing", AWAITING_APPROVAL: "Waiting for approval",
  COMPLETED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled", TIMED_OUT: "Timed out", BLOCKED: "Blocked",
};

export function swarmStatusLabel(run: Pick<SwarmRun, "status" | "budgetExhausted" | "completion" | "connectionWait">) {
  if(run.status==="READY"&&run.connectionWait)return "Waiting for connection";
  return run.budgetExhausted ? "Budget exhausted" : run.status === "COMPLETED" && run.completion?.status === "unmet" ? "Completed · criteria unmet" : statusLabels[run.status];
}

export function describeSwarmActivity(runs: readonly SwarmRun[], selectedId = "") {
  const active = runs.filter(run => ["CREATED", "PLANNING", "RUNNING", "VALIDATING", "COMPARING"].includes(run.status));
  const run = active[0] ?? runs.find(run => run.status === "AWAITING_APPROVAL") ?? runs.find(run => run.id === selectedId) ?? runs[0];
  return {runId:run?.id,activeCount:active.length,label:run ? `Swarm: ${swarmStatusLabel(run)} (${run.tasks.filter(task => task.status === "SUCCEEDED").length}/${run.tasks.length})${active.length > 1 ? ` - ${active.length} active` : ""}` : "Run with Swarm"};
}

export function canApproveSwarmCandidate(run: SwarmRun, candidate: SwarmCandidate) {
  return run.status === "AWAITING_APPROVAL" && candidate.correctness === "passed" && candidate.blockers.length === 0
    && (!run.outcome || run.outcome.outcomeSuccess === "demonstrated")
    && Boolean(candidate.patchArtifactId) && candidate.disposition === "recommended" && candidate.comparison?.decision === (run.executionKind === "engineering" ? "VERIFIED" : "IMPROVED");
}

/** Human-readable evidence summaries shared by app hosts and command-line inspection. */
export function describeSwarmRun(run: SwarmRun) {
  const usd = (value: number | null) => value === null ? "Not reported" : `$${value.toFixed(4)}`;
  const subscription = run.request.profile?.providerId === "codex-account";
  return {
    status: swarmStatusLabel(run),
    outcome: describeSwarmOutcome(run),
    facts: [
      { label: "Source revision", value: run.request.repository.revision },
      { label: "Intelligence / difficulty", value: `${run.request.mode} / ${run.modelPlan?.difficulty ?? run.request.difficulty}` },
      ...(run.modelPlan ? [{label:"Model decision",value:run.modelPlan.reason}, ...(["planning","implementation","review"] as const).map(phase => ({label:phase,value:`${run.modelPlan![phase].modelId} / ${run.modelPlan![phase].reasoning ?? "default"}`}))] : []),
      { label: "Time ceiling", value: `${run.request.budget.maxDurationMs / 60_000} minutes; deployment expiry may stop work earlier` },
      { label: "Tokens used / run ceiling", value: `${run.metrics.inputTokens + run.metrics.outputTokens} / ${run.request.budget.maxTotalTokens}` },
      { label: "Reserved or unreported tokens", value: `${run.metrics.modelUnsettledTokens} additional tokens held for admission; these are not reported usage` },
      ...(run.budgetRejection ? [{ label: "Last budget refusal", value: `${run.budgetRejection.scope} ${run.budgetRejection.dimension}: requested ${run.budgetRejection.requested}, used ${run.budgetRejection.used}, remaining ${run.budgetRejection.remaining}, limit ${run.budgetRejection.limit}` }] : []),
      { label: "Weekly quota allocation", value: `${run.request.budget.maxWeeklyQuotaPercent} percentage points; ${run.weeklyQuota ? `${run.weeklyQuota.consumedPercent.toFixed(1)} observed since start` : "provider observation not yet available"}. Shared account activity may count.` },
      { label: "Execution", value: `${run.request.backend} · ${run.request.maxWorkers} maximum workers` },
      { label: "Reasoning profile", value: run.request.profile ? `${run.request.profile.providerId} / ${run.request.profile.modelId}${run.request.profile.reasoning ? ` · ${run.request.profile.reasoning}` : ""}` : "Coordinator default" },
      { label: "Compute estimate / limit", value: `${usd(run.metrics.computeEstimatedUsd)} / ${usd(run.request.budget.maxComputeUsd)}` },
      { label: "Compute reported charges", value: usd(run.metrics.computeReportedUsd) },
      { label: "Separate inference estimate / limit", value: `${usd(run.metrics.modelEstimatedUsd)} / ${usd(run.request.budget.maxModelUsd)}` },
      { label: "Reported inference charges", value: usd(run.metrics.modelReportedUsd) },
      { label: subscription ? "Codex subscription usage" : "Inference usage", value: `${run.metrics.modelCalls} calls · ${run.metrics.inputTokens} input / ${run.metrics.outputTokens} output tokens${subscription ? " · Account limits apply" : ""}` },
      { label: "Execution / validation / benchmark", value: `${(run.metrics.executionMs / 1_000).toFixed(1)} / ${(run.metrics.validationMs / 1_000).toFixed(1)} / ${(run.metrics.benchmarkMs / 1_000).toFixed(1)} seconds` },
      { label: "Orphaned resources", value: String(run.metrics.orphanedResources) },
    ],
    tasks: run.tasks.map(task => ({
      id: task.id, label: task.title, status: task.status.toLowerCase(),
      detail: `${task.role} · ${task.agentId} · attempt ${task.attempt}/${task.maxAttempts}${task.workspaceId ? ` · workspace ${task.workspaceId}` : ""}${task.error ? ` · ${task.error}` : ""}`,
      dependencies: task.dependencies.map(id => run.tasks.find(value => value.id === id)?.title ?? id),
      criteria: task.acceptanceCriteria,
    })),
    candidates: run.candidates.map(candidate => ({
      id: candidate.id, label: candidate.hypothesis, status: candidate.disposition,
      summary: candidate.diagnosis || "Investigation has not returned a diagnosis yet.",
      facts: [
        { label: "Correctness", value: !candidate.patchArtifactId && candidate.validationArtifactIds.length === 0 ? "Not run — no patch" : candidate.correctness },
        { label: "Performance", value: candidate.comparison?.decision ?? "Not measured" },
        { label: "Reasons", value: [...candidate.blockers, ...(candidate.comparison?.reasons ?? [])].join(" · ") || "No decision yet" },
        ...(candidate.comparison?.improvementPercent === undefined || candidate.comparison.improvementPercent === null ? [] : [{ label: "Measured speedup", value: `${candidate.comparison.improvementPercent.toFixed(2)}%` }]),
        ...(candidate.comparison?.baselineMedian === undefined ? [] : [{ label: "Paired baseline median", value: String(candidate.comparison.baselineMedian) }]),
        ...(candidate.comparison?.candidateMedian === undefined ? [] : [{ label: "Paired candidate median", value: String(candidate.comparison.candidateMedian) }]),
      ],
    })),
    artifacts: run.artifacts.map(artifact => ({ id: artifact.id, label: artifact.name, detail: `${artifact.kind} · ${artifact.bytes.toLocaleString()} bytes · ${artifact.agentId} · SHA-256 ${artifact.sha256}` })),
  };
}
