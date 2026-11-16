import { createHash } from "node:crypto";
import {
  appendQualityEvent, createQualityHandoff, qualityCoverage, qualityEligibility, qualityProfile, ruleReference, validateQualityHandoff,
  type QualityEventInput, type QualityRuleDefinition, type QualityTask, type QualityTrace, type QualityHandoff,
} from "@hyperfocus/ai-core/quality";

export function qualityHash(content: string | Uint8Array) { return createHash("sha256").update(content).digest("hex"); }

/** Host-owned lifecycle. Only hashes and bounded references leave this boundary. */
export function createQualitySession(options: {
  runId: string; taskId?: string; task: QualityTask; catalog?: readonly QualityRuleDefinition[];
  onTrace?: (trace: QualityTrace) => void;
}) {
  const eligibility = qualityEligibility(options.task, options.catalog);
  const definitions = eligibility.rules.map(item => item.definition);
  // Dispatch authority is separate from mutable observation records and caller data.
  const dispatched = new Map<string, QualityHandoff>();
  const trace: QualityTrace = {
    schema: "hyperfocus-quality-trace-v1", runId: options.runId, taskId: options.taskId ?? options.runId,
    intentSha256: qualityHash(options.task.intent), profile: qualityProfile(options.task),
    rules: eligibility.rules.map(({ definition: { content, title: _title, ...metadata }, eligible, rationale }) => ({ ...metadata, sha256: qualityHash(content), eligible, rationale })),
    handoffs: [], events: [], limitations: [...eligibility.uncertainty,
      "Delivery receipts prove the named host/SDK boundary, not model attention or continued retention after provider compaction.",
      "Voluntary skill reads and third-party nested delegation are not observable through this boundary."],
  };
  const emit = (event: QualityEventInput) => { appendQualityEvent(trace, event); options.onTrace?.(trace); };
  for (const rule of trace.rules) emit({ agentId: "main", stage: "eligibility", ruleId: rule.id, ruleSha256: rule.sha256,
    outcome: rule.eligible === "yes" ? "eligible" : "ineligible", reason: rule.rationale, evidenceRefs: [rule.source] });
  if (eligibility.conflicts.length) throw new Error(`Conflicting quality contracts: ${eligibility.conflicts.join(", ")}`);
  const applicable = () => trace.rules.filter(rule => rule.eligible === "yes");
  const observePaths = (paths: readonly string[]) => {
    const observed = qualityEligibility({ ...options.task, paths: [...(options.task.paths ?? []), ...paths] }, options.catalog);
    for (const item of observed.rules.filter(item => item.eligible === "yes")) {
      const old = trace.rules.find(rule => rule.id === item.definition.id);
      if (old?.eligible === "yes" && old.version === item.definition.version) continue;
      const { content, title: _title, ...metadata } = item.definition;
      const rule = { ...metadata, sha256: qualityHash(content), eligible: item.eligible, rationale: "Observed modified UI paths require this contract; prior dirty work was excluded." };
      if (old) Object.assign(old, rule); else trace.rules.push(rule);
      const definition = definitions.findIndex(rule => rule.id === item.definition.id);
      if (definition >= 0) definitions[definition] = item.definition; else definitions.push(item.definition);
      emit({ agentId: "main", stage: "eligibility", ruleId: rule.id, ruleSha256: rule.sha256, outcome: "eligible", reason: rule.rationale, evidenceRefs: [rule.source] });
    }
  };
  const select = (ids = applicable().map(rule => rule.id)) => {
    for (const id of ids) {
      const rule = trace.rules.find(rule => rule.id === id);
      if (!rule) throw new Error(`Unknown selected rule: ${id}`);
      emit({ agentId: "main", stage: "selection", ruleId: id, ruleSha256: rule.sha256, outcome: "selected",
        reason: "Host selected the independently eligible obligation.", evidenceRefs: [rule.source] });
    }
  };
  const context = (agentId: string, resolve = (id: string) => definitions.find(rule => rule.id === id)?.content) => {
    const selected = new Set(trace.events.filter(event => event.stage === "selection").map(event => event.ruleId));
    return applicable().filter(rule => selected.has(rule.id)).map(rule => {
      let content: string | undefined;
      try { content = resolve(rule.id); } catch { /* Loading failure is evidence, never an inferred read. */ }
      if (!content || qualityHash(content) !== rule.sha256) {
        emit({ agentId, stage: "context-delivery", ruleId: rule.id, ruleSha256: rule.sha256, outcome: "failed", boundary: "host-assembly",
          reason: !content ? "Required content failed to load." : "Loaded content has a stale hash.", evidenceRefs: [rule.source] });
        throw new Error(`Quality content unavailable or stale: ${rule.id}`);
      }
      return `[${rule.id}@${rule.version} sha256:${rule.sha256}] ${content}`;
    }).join("\n");
  };
  const handoff = (childAgentId: string, parentAgentId = "main", envelope?: QualityHandoff) => {
    const parent = parentAgentId === "main" ? createQualityHandoff({ taskId: trace.taskId, parentAgentId, childAgentId,
      intentRef: `intent:${trace.intentSha256}`, audienceRef: options.task.project === "books" ? "books.small-business-owner" : undefined,
      journeyRefs: applicable().filter(rule => rule.category === "behavioral").map(rule => rule.id), requiredRules: applicable().map(ruleReference),
      compositionIds: options.task.project === "books" ? ["books.task-workbench"] : [], acceptedDecisionIds: [], verificationProfileId: trace.profile })
      : dispatched.get(parentAgentId);
    if (!parent) throw new Error(`Unknown quality handoff parent: ${parentAgentId}`);
    const contract = createQualityHandoff(envelope ?? { ...parent, parentAgentId, childAgentId });
    if (contract.taskId !== trace.taskId || contract.childAgentId !== childAgentId || contract.parentAgentId !== parentAgentId) throw new Error("Quality handoff identity mismatch.");
    const check = validateQualityHandoff(contract, parent.requiredRules, applicable().map(ruleReference), parent);
    const existing = dispatched.get(childAgentId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(contract)) throw new Error("Conflicting handoff for existing child.");
    const recorded = trace.handoffs.findIndex(item => item.childAgentId === childAgentId);
    if (recorded < 0) trace.handoffs.push(structuredClone(contract));
    else trace.handoffs[recorded] = structuredClone(contract);
    for (const rule of applicable()) emit({ agentId: parentAgentId, childAgentId, ruleId: rule.id, ruleSha256: rule.sha256,
      stage: "handoff", outcome: check.ok ? "delivered" : "blocked", boundary: "host-assembly",
      reason: check.ok ? "Versioned references resolved before dispatch; child verification remains owned by the host." : check.reasons.join(" ").slice(0, 500),
      evidenceRefs: [`handoff:${childAgentId}`] });
    if (!check.ok) throw new Error(check.reasons.join(" "));
    dispatched.set(childAgentId, contract);
    return structuredClone(contract);
  };
  const delivery = (agentId: string, boundary: "sdk-prompt" | "cli-stdin" | "unsupported", delivered: boolean, prompt: string, observedPromptSha256?: string) => {
    const selected = new Set(trace.events.filter(event => event.stage === "selection").map(event => event.ruleId));
    for (const rule of applicable().filter(rule => selected.has(rule.id))) {
      const content = definitions.find(item => item.id === rule.id)?.content;
      const present = Boolean(content && prompt.includes(`[${rule.id}@${rule.version} sha256:${rule.sha256}] ${content}`));
      emit({ agentId, stage: "context-delivery", ruleId: rule.id, ruleSha256: rule.sha256, boundary,
        outcome: !present || !delivered ? "failed" : boundary === "sdk-prompt" ? "delivered" : "unknown",
        reason: !present ? "Required content is absent from the submitted payload." : !delivered ? "Execution adapter rejected dispatch." : boundary === "sdk-prompt" ? "Exact versioned rule content submitted to the SDK prompt API." : "Host submitted context; third-party runtime delivery/retention is not observable.",
        evidenceRefs: [`prompt-sha256:${observedPromptSha256 ?? qualityHash(prompt)}`] });
    }
  };
  const implementation = (candidateSha256: string, succeeded: boolean) => emit({ agentId: "main", stage: "implementation", outcome: succeeded ? "passed" : "failed",
    candidateSha256, reason: succeeded ? "Implementation settled; validation is still required." : "A worker failed or implementation is incomplete.", evidenceRefs: [`candidate:${candidateSha256}`] });
  const verify = (input: { verifierId: string; candidateSha256: string; outcome: "passed" | "failed" | "skipped" | "blocked" | "unknown"; reason: string; evidenceRefs: string[]; durationMs?: number }) => {
    for (const rule of applicable().filter(rule => rule.verifierIds.includes(input.verifierId))) emit({ agentId: "verifier", stage: "verification", boundary: "host-verifier", ruleId: rule.id, ruleSha256: rule.sha256, ...input });
  };
  const finish = () => {
    const report = qualityCoverage(trace);
    emit({ agentId: "main", stage: "acceptance", outcome: report.state === "VERIFIED" ? "passed" : "blocked",
      reason: report.state === "VERIFIED" ? `Deterministic checks passed; acceptance: ${report.acceptance}.` : "Mandatory rule coverage is incomplete; execution is not verified.", evidenceRefs: [`quality:${trace.taskId}`] });
    return qualityCoverage(trace);
  };
  return { trace, select, context, handoff, delivery, implementation, verify, finish, emit, observePaths };
}
export type QualitySession = ReturnType<typeof createQualitySession>;
