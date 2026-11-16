import { describe, expect, test } from "bun:test";
import { qualityCompletionBlock, qualityCoverage, qualityEligibility, qualityRules, qualityTraceSchema, ruleReference } from "@hyperfocus/ai-core/quality";
import { createQualitySession, qualityHash } from "./session";

const intent = "Fix Books navigation and workbench recovery";
const candidate = qualityHash("actual candidate");
function fixture(options: { select?: boolean; deliver?: boolean } = {}) {
  const session = createQualitySession({ runId: "run-1", task: { intent, project: "books" } });
  if (options.select !== false) session.select();
  if (options.deliver !== false) session.delivery("main", "sdk-prompt", true, session.context("main"));
  session.implementation(candidate, true);
  return session;
}
function verify(session: ReturnType<typeof fixture>, outcome: "passed" | "failed" | "skipped" | "blocked" | "unknown" = "passed", except?: string) {
  for (const verifierId of new Set(session.trace.rules.filter(rule => rule.eligible === "yes").flatMap(rule => rule.verifierIds))) {
    session.verify({ verifierId, candidateSha256: candidate, outcome: verifierId === except ? outcome : "passed", reason: "Independent fixture evidence.", evidenceRefs: ["fixture:observed"] });
  }
}

test("late child work invalidates parent acceptance until the integrated candidate is reverified", () => {
  const session = fixture();
  verify(session);
  expect(session.finish().technicalVerification).toBe("TECHNICALLY VERIFIED");
  expect(session.finish().outcomeVerification).toBe("UNVERIFIED");
  session.handoff("late-child");
  session.delivery("late-child", "sdk-prompt", true, session.context("late-child"));
  session.emit({ agentId: "late-child", stage: "implementation", outcome: "passed", reason: "Child returned", evidenceRefs: ["child:artifact"] });
  expect(session.finish().state).not.toBe("VERIFIED");
  verify(session); // Repeating old-candidate checks still cannot accept the new child.
  expect(session.finish().state).not.toBe("VERIFIED");
  session.implementation(candidate, true);
  verify(session);
  expect(session.finish()).toMatchObject({ technicalVerification: "TECHNICALLY VERIFIED", outcomeVerification: "UNVERIFIED", domainAcceptance: "HUMAN / DOMAIN ACCEPTANCE REQUIRED" });
});

describe("quality eligibility independent of selection", () => {
  test("presentation titles stay out of persisted traces before and after observed-path routing", () => {
    const session = createQualitySession({ runId: "presentation", task: { intent: "Adjust helper" } });
    expect(qualityRules.some(rule => rule.title)).toBe(true);
    for (const paths of [[], ["src/client/panel.tsx"]]) {
      session.observePaths(paths);
      expect(qualityTraceSchema.safeParse(session.trace).success).toBe(true);
      expect(session.trace.rules.every(rule => !Object.hasOwn(rule, "title"))).toBe(true);
      for (const rule of session.trace.rules) {
        const definition = qualityRules.find(item => item.id === rule.id && item.version === rule.version)!;
        expect(rule.sha256).toBe(qualityHash(definition.content));
      }
    }
  });
  test("task and paths make applicable rules expected without selecting them", () => {
    const session = fixture({ select: false, deliver: false });
    expect(qualityCoverage(session.trace).rules.find(rule => rule.id.endsWith("drawer-recovery"))?.status).toBe("NOT SELECTED");
    expect(qualityEligibility({ intent: "Adjust helper", paths: ["src/client/panel.tsx"] }).rules.some(rule => rule.eligible === "yes")).toBe(true);
  });
  test("unrelated backend work does not inherit game or Books constraints", () => {
    const rules = qualityEligibility({ intent: "Fix the headless API", surface: "backend" }).rules;
    expect(rules.every(rule => rule.eligible === "no")).toBe(true);
  });
  test("overlapping signals deduplicate and the scoped Books journey wins", () => {
    const result = qualityEligibility({ intent, project: "books", paths: ["src/client/app.tsx"] });
    expect(result.rules.filter(rule => rule.definition.id === "experience.primary-journey-complete")).toHaveLength(1);
    expect(result.rules.find(rule => rule.definition.id === "experience.primary-journey-complete")?.definition.version).toBe("books-1");
  });
  test("equally scoped conflicting contracts block rather than silently overwrite", () => {
    expect(() => createQualitySession({ runId: "conflict", task: { intent }, catalog: [qualityRules[0]!, qualityRules[0]!] })).toThrow("Conflicting");
  });
  test("uncertain routing is recorded", () => expect(qualityEligibility({ intent: "Improve it" }).uncertainty).toHaveLength(1));
  test("unknown selected rule is rejected", () => expect(() => fixture().select(["missing.rule"])).toThrow("Unknown selected"));
  test("observed implementation paths expose a missed rule without pretending it was selected", () => {
    const session = createQualitySession({ runId: "observed", task: { intent: "Adjust helper" } });
    session.select(); session.observePaths(["src/client/panel.tsx"]);
    expect(session.finish().rules.find(rule => rule.id.endsWith("drawer-recovery"))?.status).toBe("NOT SELECTED");
  });
});

describe("context evidence", () => {
  test("exact supported payload is delivered", () => expect(qualityCoverage(fixture().trace).rules[0]?.loaded).toBe("delivered"));
  test("selected content without delivery is NOT LOADED", () => expect(qualityCoverage(fixture({ deliver: false }).trace).rules[0]?.status).toBe("NOT LOADED"));
  for (const [name, resolve] of [
    ["missing", () => undefined], ["stale", () => "old content"], ["failed", () => { throw new Error("disk unavailable"); }],
  ] as const) test(`${name} content cannot dispatch`, () => {
    const session = fixture({ deliver: false });
    expect(() => session.context("main", resolve)).toThrow("unavailable or stale");
    expect(session.trace.events.at(-1)?.outcome).toBe("failed");
  });
  test("CLI submission remains UNKNOWN even with a passing verifier", () => {
    const session = fixture(); session.delivery("main", "cli-stdin", true, session.context("main")); verify(session);
    expect(session.finish().state).not.toBe("VERIFIED");
    expect(qualityCoverage(session.trace).rules[0]?.status).toBe("UNKNOWN");
  });
  test("absent content cannot be certified by a matching-looking acknowledgment", () => {
    const session = fixture(); session.delivery("main", "sdk-prompt", true, "I read all rules"); verify(session);
    expect(session.finish().state).not.toBe("VERIFIED");
  });
});

describe("handoff propagation", () => {
  test("returned and submitted handoffs cannot mutate dispatch authority", () => {
    const session = fixture();
    const submitted = fixture().handoff("child");
    const canonical = structuredClone(submitted);
    const returned = session.handoff("child", "main", submitted);
    submitted.intentRef = "intent:submitted-mutation";
    submitted.journeyRefs.length = 0;
    returned.intentRef = "intent:returned-mutation";
    returned.compositionIds.length = 0;
    expect(session.trace.handoffs[0]).toEqual(canonical);
    const nested = session.handoff("grandchild", "child");
    expect(nested.intentRef).toBe(canonical.intentRef);
    expect(nested.journeyRefs).toEqual(canonical.journeyRefs);
    expect(nested.compositionIds).toEqual(canonical.compositionIds);
  });
  test("rejected parents cannot dispatch; corrected retries retain failure history and recover", () => {
    const session = fixture();
    const invalid = fixture().handoff("child");
    invalid.intentRef = "intent:wrong";
    expect(() => session.handoff("child", "main", invalid)).toThrow("purpose");
    expect(() => session.handoff("grandchild", "child")).toThrow("Unknown quality handoff parent");
    verify(session);
    expect(session.finish().state).not.toBe("VERIFIED");
    const corrected = session.handoff("child");
    session.delivery("child", "sdk-prompt", true, session.context("child"));
    expect(session.handoff("grandchild", "child").intentRef).toBe(corrected.intentRef);
    session.delivery("grandchild", "sdk-prompt", true, session.context("grandchild"));
    verify(session);
    expect(session.finish().state).toBe("VERIFIED");
    expect(session.trace.events.some(event => event.stage === "handoff" && event.outcome === "blocked")).toBe(true);
    expect(session.trace.handoffs).toHaveLength(2);
  });
  for (const mutation of ["intent", "audience", "journeys", "compositions", "profile"] as const) test(`${mutation} cannot drift while rule hashes remain intact`, () => {
    const envelope = fixture().handoff("child");
    if (mutation === "intent") envelope.intentRef = "intent:unrelated";
    if (mutation === "audience") envelope.audienceRef = "unrelated-audience";
    if (mutation === "journeys") envelope.journeyRefs = [];
    if (mutation === "compositions") envelope.compositionIds = [];
    if (mutation === "profile") envelope.verificationProfileId = "prototype";
    const session = fixture();
    expect(() => session.handoff("child", "main", envelope)).toThrow("purpose");
    verify(session);
    expect(session.finish().state).not.toBe("VERIFIED");
  });
  test("nested handoffs retain the parent's added composition and accepted decisions", () => {
    const envelope = fixture().handoff("child");
    envelope.acceptedDecisionIds.push("books.keep-recovery");
    envelope.compositionIds.push("books.review-before-posting");
    const session = fixture();
    session.handoff("child", "main", envelope);
    const nested = session.handoff("grandchild", "child");
    expect(nested.acceptedDecisionIds).toEqual(envelope.acceptedDecisionIds);
    expect(nested.compositionIds).toEqual(envelope.compositionIds);
    const missing = { ...nested, childAgentId: "another", acceptedDecisionIds: [] };
    expect(() => session.handoff("another", "child", missing)).toThrow("purpose");
  });
  test("complete and nested handoffs resolve frozen versions and retain verification", () => {
    const session = fixture(), child = session.handoff("child");
    session.delivery("child", "sdk-prompt", true, session.context("child"));
    const nested = session.handoff("grandchild", "child");
    expect(nested.requiredRules).toEqual(child.requiredRules);
    session.delivery("grandchild", "sdk-prompt", true, session.context("grandchild"));
    expect(session.finish().state).not.toBe("VERIFIED");
    verify(session); expect(session.finish().state).toBe("VERIFIED");
  });
  for (const mutation of ["missing", "stale", "conflicting"] as const) test(`${mutation} references block dispatch`, () => {
    const original = fixture(), contract = original.handoff("child");
    const envelope = structuredClone(contract), session = fixture();
    if (mutation === "missing") envelope.requiredRules.shift();
    if (mutation === "stale") envelope.requiredRules[0]!.sha256 = "0".repeat(64);
    if (mutation === "conflicting") envelope.requiredRules.push(envelope.requiredRules[0]!);
    expect(() => session.handoff("child", "main", envelope)).toThrow();
    verify(session); expect(session.finish().state).not.toBe("VERIFIED");
  });
  test("missing content reference cannot be silently added to a child", () => {
    const session = fixture(), contract = session.handoff("child");
    contract.requiredRules.push({ id: "missing.rule", version: "1", sha256: candidate });
    expect(() => fixture().handoff("child", "main", contract)).toThrow("Missing rule content");
  });
  test("failed child execution blocks acceptance even when checks passed", () => {
    const session = fixture(); session.handoff("child"); session.delivery("child", "sdk-prompt", true, session.context("child"));
    session.implementation(candidate, false); verify(session);
    expect(session.finish().state).not.toBe("VERIFIED");
  });
});

describe("verification and false completion", () => {
  test("passing machine checks cannot clear qualitative review; scoped human evidence can", () => {
    const session = fixture(); verify(session);
    expect(session.finish()).toMatchObject({ state: "VERIFIED", acceptance: "REVIEW REQUIRED" });
    const rule = session.trace.rules.find(rule => rule.category === "qualitative" && rule.eligible === "yes")!;
    session.emit({ agentId: "reviewer", stage: "verification", boundary: "human-review", ruleId: rule.id,
      ruleSha256: rule.sha256, candidateSha256: candidate, verifierId: "human-composition", outcome: "passed",
      reason: "Synthetic human-boundary fixture, not real artifact approval.", evidenceRefs: ["fixture:scoped-human-review"] });
    expect(session.finish()).toMatchObject({ state: "VERIFIED", acceptance: "VERIFIED" });
    session.implementation(qualityHash("revised candidate"), true);
    expect(session.finish().acceptance).not.toBe("VERIFIED");
  });
  test("an explicit prototype permits implementation without claiming verified production quality", () => {
    const intent = "Prototype: build Books navigation";
    const prototype = createQualitySession({ runId: "prototype", task: { intent } });
    expect(prototype.trace.profile).toBe("prototype");
    expect(prototype.finish().state).toBe("IMPLEMENTED");
    expect(prototype.finish().acceptance).toBe("REVIEW REQUIRED");
    expect(qualityCompletionBlock({ intent, trace: prototype.trace })).toBeUndefined();
    expect(qualityCompletionBlock({ intent: "Ship the Books navigation prototype", trace: prototype.trace })).toBeDefined();
  });
  test("all mandatory checks pass", () => { const session = fixture(); verify(session); expect(session.finish().state).toBe("VERIFIED"); });
  test("a passing report from another run cannot certify this run", () => {
    const session = fixture(); verify(session);
    expect(qualityCompletionBlock({ intent, trace: session.trace, runId: "different-run" })).toContain("another run");
  });
  for (const outcome of ["failed", "skipped", "blocked", "unknown"] as const) test(`${outcome} mandatory verifier blocks completion`, () => {
    const session = fixture(); verify(session, outcome, "recovery");
    expect(session.finish().state).not.toBe("VERIFIED");
    expect(qualityCompletionBlock({ intent, trace: session.trace })).toBeDefined();
  });
  test("advisory failure leaves deterministic verification but requires review", () => {
    const session = fixture(); verify(session, "failed", "human-composition");
    expect(session.finish()).toMatchObject({ state: "VERIFIED", acceptance: "REVIEW REQUIRED" });
  });
  test("changed candidate or stale rule cannot reuse successful receipts", () => {
    const session = fixture(); verify(session); session.implementation(qualityHash("changed"), true);
    expect(session.finish().state).not.toBe("VERIFIED");
    const stale = fixture(); verify(stale); stale.trace.rules[0]!.sha256 = "0".repeat(64);
    expect(stale.finish().state).not.toBe("VERIFIED");
  });
  test("model text and skipped check cannot fabricate VERIFIED", () => {
    const session = fixture();
    expect(qualityCompletionBlock({ intent })).toContain("missing");
    expect(qualityCompletionBlock({ intent, trace: { ...session.trace, verified: true } })).toContain("invalid");
    verify(session, "skipped", "navigation"); expect(session.finish().state).not.toBe("VERIFIED");
  });
  test("omitting the applicable rule from a trace blocks false completion", () => {
    const session = fixture(); session.trace.rules.shift(); verify(session);
    expect(qualityCompletionBlock({ intent, trace: session.trace })).toContain("omitted");
  });
  test("removing a mandatory verifier is also an omitted obligation", () => {
    const session = fixture(); session.trace.rules[0]!.verifierIds = []; verify(session);
    expect(qualityCompletionBlock({ intent, trace: session.trace })).toContain("omitted");
  });
  test("prototype avoids production release requirements but still cannot invent checks", () => {
    const session = createQualitySession({ runId: "prototype", task: { intent, profile: "prototype" } });
    expect(session.trace.profile).toBe("prototype"); expect(session.finish().state).not.toBe("VERIFIED");
  });
});

describe("reporting", () => {
  test("stable JSON round-trip retains exact evidence and no task/prompt/credential text", () => {
    const session = createQualitySession({ runId: "privacy", task: { intent: `${intent}. Token sk-private-never-record` } });
    session.select(); session.delivery("main", "sdk-prompt", true, session.context("main"));
    session.implementation(candidate, true); verify(session);
    const encoded = JSON.stringify(session.trace), restored = qualityTraceSchema.parse(JSON.parse(encoded));
    expect(encoded).not.toContain("sk-private"); expect(encoded).not.toContain(intent);
    expect(qualityCoverage(restored)).toEqual(qualityCoverage(session.trace));
    expect(qualityCoverage(restored).rules[0]?.evidenceRefs).toContain("fixture:observed");
  });
  test("references reject remote credentials and traversal", () => {
    const session = fixture();
    expect(() => session.emit({ agentId: "main", stage: "selection", outcome: "selected", reason: "test", evidenceRefs: ["https://user:secret@host/?token=secret"] })).toThrow();
    expect(() => session.emit({ agentId: "main", stage: "selection", outcome: "selected", reason: "test", evidenceRefs: ["../credentials"] })).toThrow();
  });
  test("handoffs bind reference hashes, not whole documents", () => {
    const session = fixture(); expect(session.handoff("child").requiredRules).toEqual(session.trace.rules.filter(rule => rule.eligible === "yes").map(ruleReference));
  });
});
