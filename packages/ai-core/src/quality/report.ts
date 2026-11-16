import { qualityTraceSchema, type QualityEvent, type QualityRule, type QualityTrace } from "./contracts";

export type QualityRuleStatus = "NOT APPLICABLE" | "NOT SELECTED" | "NOT LOADED" | "NOT PROPAGATED" | "NOT VERIFIED" | "FAILED" | "PASSED" | "UNKNOWN";
export function qualityCoverage(input: QualityTrace) {
  const trace = qualityTraceSchema.parse(input);
  const candidate = trace.events.filter(event => event.stage === "implementation" && event.agentId === "main").at(-1);
  const rows = trace.rules.map(rule => coverRule(trace, rule, candidate));
  const required = rows.filter(row => row.eligibility !== "no" && row.severity === "blocking");
  const checked = required.some(row => row.verifiers.some(verifier => ["passed", "failed"].includes(verifier.result)));
  const verified = required.length > 0 && candidate?.outcome === "passed" && required.every(row => row.status === "PASSED");
  const review = rows.some(row => row.eligibility !== "no" && row.category === "qualitative" && row.status !== "PASSED");
  // Execution completion and quality acceptance are separate. Never infer human approval.
  return {
    schema: "hyperfocus-quality-report-v1" as const, runId: trace.runId, taskId: trace.taskId,
    state: verified ? "VERIFIED" as const : checked ? "CHECKED" as const : "IMPLEMENTED" as const,
    // These receipts cover rule checks, never the whole user goal by inference.
    technicalVerification: verified ? "TECHNICALLY VERIFIED" as const : "UNVERIFIED" as const,
    outcomeVerification: "UNVERIFIED" as const,
    domainAcceptance: review ? "HUMAN / DOMAIN ACCEPTANCE REQUIRED" as const : "UNVERIFIED" as const,
    acceptance: verified ? review ? "REVIEW REQUIRED" as const : "VERIFIED" as const : required.length ? "BLOCKED" as const : "REVIEW REQUIRED" as const,
    candidateSha256: candidate?.candidateSha256,
    counts: { applicable: rows.filter(row => row.eligibility === "yes").length, passed: rows.filter(row => row.status === "PASSED").length,
      failed: rows.filter(row => row.status === "FAILED").length, unverified: rows.filter(row => row.eligibility !== "no" && row.status !== "PASSED" && row.status !== "FAILED").length },
    rules: rows, handoffs: trace.handoffs, events: trace.events, limitations: trace.limitations,
  };
}
export type QualityReport = ReturnType<typeof qualityCoverage>;

function coverRule(trace: QualityTrace, rule: QualityRule, candidate?: QualityEvent) {
  const events = trace.events.filter(event => event.ruleId === rule.id);
  const selected = events.some(event => event.stage === "selection" && event.outcome === "selected" && event.ruleSha256 === rule.sha256);
  const deliveries = events.filter(event => event.stage === "context-delivery");
  const agents = ["main", ...trace.handoffs.filter(handoff => handoff.requiredRules.some(ref => ref.id === rule.id)).map(handoff => handoff.childAgentId)];
  const delivery = agents.map(agentId => ({ agentId, event: deliveries.filter(event => event.agentId === agentId).at(-1) }));
  const loaded = delivery.every(item => item.event?.outcome === "delivered" && item.event.ruleSha256 === rule.sha256);
  const unknown = delivery.some(item => item.event?.outcome === "unknown");
  const propagation = trace.handoffs.map(handoff => {
    const attached = handoff.requiredRules.find(ref => ref.id === rule.id);
    const delivered = events.filter(event => event.stage === "handoff" && event.childAgentId === handoff.childAgentId).at(-1);
    return { childAgentId: handoff.childAgentId, passed: Boolean(attached && attached.sha256 === rule.sha256 && delivered?.outcome === "delivered") };
  });
  const verifiers = rule.verifierIds.map(id => {
    const event = events.filter(event => event.stage === "verification" && event.verifierId === id).at(-1);
    const childWork = trace.events.filter(item => item.stage === "implementation" && item.agentId !== "main").at(-1);
    const contextBoundary = events.filter(item => item.stage === "handoff" || item.stage === "context-delivery").at(-1);
    const fresh = event && event.ruleSha256 === rule.sha256 && event.candidateSha256 === candidate?.candidateSha256
      && event.sequence > Math.max(candidate?.sequence ?? Infinity, contextBoundary?.sequence ?? -1)
      && (candidate?.sequence ?? -1) > (childWork?.sequence ?? -1);
    const humanRequired = rule.category === "qualitative" && event?.outcome === "passed";
    const trusted = (event?.outcome !== "passed" || Boolean(event.evidenceRefs.length)) && (humanRequired
      ? event?.boundary === "human-review"
      : event?.boundary === "host-verifier" || (rule.category === "qualitative" && event?.boundary === "human-review"));
    return { id, result: fresh && trusted ? event.outcome : "unknown", reason: !event ? "Required verifier has not run." : !fresh ? "Evidence does not match the current implementation and rule version." : !trusted ? humanRequired ? "Qualitative acceptance requires scoped human-review evidence." : "Verification has no independent host boundary." : event.reason, evidenceRefs: event?.evidenceRefs ?? [] };
  });
  let status: QualityRuleStatus;
  let reason: string;
  if (rule.eligible === "no") { status = "NOT APPLICABLE"; reason = rule.rationale; }
  else if (rule.eligible === "unknown") { status = "UNKNOWN"; reason = rule.rationale; }
  else if (verifiers.some(verifier => verifier.result === "failed")) { status = "FAILED"; reason = verifiers.find(verifier => verifier.result === "failed")!.reason; }
  else if (!selected) { status = "NOT SELECTED"; reason = "Eligible rule was omitted by selection."; }
  else if (propagation.some(item => !item.passed)) { status = "NOT PROPAGATED"; reason = "A delegated worker is missing the mandatory versioned obligation."; }
  else if (unknown) { status = "UNKNOWN"; reason = "Adapter delivery is unobservable; host assembly alone is not proof of runtime context."; }
  else if (!loaded) { status = "NOT LOADED"; reason = "No matching delivery receipt for each required execution context."; }
  else if (candidate?.outcome !== "passed") { status = "NOT VERIFIED"; reason = "Implementation has not settled successfully."; }
  else if (verifiers.some(verifier => verifier.result !== "passed")) { status = events.some(event => event.stage === "verification" && event.outcome === "unknown") ? "UNKNOWN" : "NOT VERIFIED"; reason = verifiers.find(verifier => verifier.result !== "passed")!.reason; }
  else { status = "PASSED"; reason = "Required host checks passed for this candidate within the recorded scope."; }
  return { id: rule.id, version: rule.version, severity: rule.severity, category: rule.category, source: rule.source, eligibility: rule.eligible,
    eligibilityRationale: rule.rationale, selected, loaded: loaded ? "delivered" : unknown ? "unknown" : "missing", propagation,
    verifiers, status, unresolvedReason: status === "PASSED" || status === "NOT APPLICABLE" ? undefined : reason,
    evidenceRefs: [...new Set(events.flatMap(event => event.evidenceRefs))] };
}
