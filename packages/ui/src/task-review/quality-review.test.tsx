import { afterEach, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { appendQualityEvent, qualityRules, type QualityTrace } from "@hyperfocus/ai-core/quality";
import { QualityReview } from "./quality-review";

afterEach(() => document.body.replaceChildren());

function traceWith(outcomes: readonly (readonly [string, "passed" | "failed" | "unknown"])[]): QualityTrace {
  const hash = "a".repeat(64);
  const trace: QualityTrace = {
    schema: "hyperfocus-quality-trace-v1", runId: "run-review", taskId: "task-review", profile: "implementation", intentSha256: hash,
    handoffs: [], events: [], limitations: ["Browser checks do not establish native-host acceptance."],
    rules: outcomes.map(([id]) => {
      const definition = qualityRules.find(rule => rule.id === id);
      if (!definition) throw new Error(`Missing fixture rule ${id}`);
      return { id, version: definition.version, sha256: hash, source: definition.source, scope: definition.scope,
        category: definition.category, severity: definition.severity, verifierIds: definition.verifierIds, eligible: "yes", rationale: "Required for this workflow." };
    }),
  };
  for (const rule of trace.rules) {
    appendQualityEvent(trace, { agentId: "main", stage: "selection", outcome: "selected", ruleId: rule.id, ruleSha256: hash, reason: "Selected", evidenceRefs: [] });
    appendQualityEvent(trace, { agentId: "main", stage: "context-delivery", outcome: "delivered", ruleId: rule.id, ruleSha256: hash, boundary: "sdk-prompt", reason: "Delivered", evidenceRefs: [] });
  }
  appendQualityEvent(trace, { agentId: "main", stage: "implementation", outcome: "passed", candidateSha256: hash, reason: "Candidate completed", evidenceRefs: [] });
  for (const [id, outcome] of outcomes) {
    const rule = trace.rules.find(rule => rule.id === id)!;
    for (const verifierId of rule.verifierIds) appendQualityEvent(trace, { agentId: "main", stage: "verification", outcome, ruleId: id, ruleSha256: hash, candidateSha256: hash,
      verifierId, boundary: "host-verifier", reason: outcome === "failed" ? "Focus did not return to the trigger." : "Recorded verifier result.", evidenceRefs: ["checks/result.json"] });
  }
  return trace;
}

test("quality review leads with failed and unverified requirements while technical IDs stay disclosed", () => {
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <QualityReview trace={traceWith([
    ["ui.navigation.no-duplicate-destinations", "passed"], ["ui.interaction.drawer-recovery", "unknown"], ["ui.interaction.focus-restoration", "failed"],
  ])} />, host);
  try {
    expect(host.querySelector("summary")?.textContent).toContain("Verification incomplete");
    const pending = host.querySelector("[data-quality-pending]")!;
    expect([...pending.querySelectorAll("h4")].map(node => node.textContent)).toEqual([
      "Keyboard focus returns correctly · Failed", "Resume work after closing a panel · Not verified",
    ]);
    expect(host.querySelector("[data-quality-next-step]")?.textContent).toContain("Resolve the failed checks");
    expect([...host.querySelectorAll("summary")].every(node => !node.textContent?.includes("ui."))).toBe(true);
    const technical = [...host.querySelectorAll("p")].find(node => node.textContent?.startsWith("Task task-review"))!;
    expect(technical.closest("details")?.open).toBe(false);
    expect(host.textContent).toContain("Focus did not return to the trigger.");
    expect(host.textContent).toContain("ui.interaction.focus-restoration");
    expect([...host.querySelectorAll("summary")].some(node => node.textContent === "Passed checks (1)")).toBe(true);
  } finally { dispose(); }
});

test("passed automation remains human-review-required and a changed candidate invalidates the headline", () => {
  const host = document.createElement("div"); document.body.append(host);
  const [stale, setStale] = createSignal(false);
  const trace = traceWith([["ui.navigation.no-duplicate-destinations", "passed"], ["ui.composition.approved-reference", "unknown"]]);
  const before = JSON.stringify(trace);
  const dispose = render(() => <QualityReview trace={trace} stale={stale()} />, host);
  try {
    expect(host.querySelector("summary")?.textContent).toContain("Human review required");
    expect(host.querySelector("[data-quality-pending]")?.textContent).toContain("Human design review · Review required");
    expect(host.querySelector("[data-quality-next-step]")?.textContent).toContain("Automated checks do not establish approval");
    setStale(true);
    expect(host.querySelector("summary")?.textContent).toContain("Verification is out of date");
    expect(host.querySelector("[data-quality-next-step]")?.textContent).toContain("Verify the current change again");
    expect(JSON.stringify(trace)).toBe(before);
  } finally { dispose(); }
});
