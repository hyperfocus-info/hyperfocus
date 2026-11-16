import { expect, test } from "bun:test";
import { createLocalAiRuntime, type AiRuntimeAdapter } from "@hyperfocus/ai-runtime";
import type { SwarmModelProfiles } from "@hyperfocus/ai-core/swarm";
import { createSwarmCoordinator } from "./coordinator";
import { executionFixture, swarmFixture } from "./test-fixtures";
import { runnerFixture } from "./execution/runner-test-fixture";
import { planSwarm } from "./plan";
import { reasonAboutSwarmPhase } from "./reasoning/phase-reasoning";
import { runSwarmModelTurn } from "./reasoning/model-turn";

const profiles: SwarmModelProfiles = {
  planning: { agentId: "direct", providerId: "test-provider", modelId: "highest", approvalPolicy: "never" },
  implementation: { agentId: "direct", providerId: "test-provider", modelId: "value", approvalPolicy: "never" },
  review: { agentId: "direct", providerId: "test-provider", modelId: "highest", approvalPolicy: "never" },
};

test("steering is durable, scoped and idempotent; follow-ups remain queued on the original source and ceilings", async () => {
  const fixture = swarmFixture(), execution = executionFixture();
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, handleTask: async () => {} });
  try {
    const first = coordinator.steer(fixture.run.id, { requestId: "instruction", text: "Preserve exact images." });
    const repeated = coordinator.steer(fixture.run.id, { requestId: "instruction", text: "Preserve exact images." });
    expect(repeated.messages).toEqual(first.messages); expect(repeated.metrics.humanInterventions).toBe(1);
    expect(() => coordinator.steer(fixture.run.id, { requestId: "instruction", text: "Change semantics." })).toThrow("idempotency");
    expect(() => coordinator.steer(fixture.run.id, { requestId: "other", text: "Inspect", taskId: "foreign-task" })).toThrow("target");
    const next = coordinator.followUp(fixture.run.id, { requestId: "follow-up", goal: "Investigate the remaining allocation evidence." });
    expect(next.parentRunId).toBe(fixture.run.id); expect(next.status).toBe("READY");
    expect(next.request.repository).toEqual(fixture.request.repository); expect(next.request.budget).toEqual(fixture.request.budget);
    expect(execution.workspaces.size).toBe(0);
    coordinator.cancel(fixture.run.id);
    expect(() => coordinator.steer(fixture.run.id, { requestId: "late", text: "Continue" })).toThrow("follow-up");
  } finally { await coordinator.close(); fixture.db.close(); }
});

test("an expired deployment cannot be extended by a 24-hour run request or queued start", async () => {
  const fixture = swarmFixture(), execution = executionFixture();
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: execution.provider, deploymentExpiresAt: Date.now() - 1, handleTask: async () => {} });
  try {
    expect(() => coordinator.create({ ...fixture.request, requestId: "long-run", budget: { ...fixture.request.budget, maxDurationMs: 86_400_000 } })).toThrow("lifetime");
    expect(() => coordinator.start(fixture.run.id)).toThrow("lifetime"); expect(execution.workspaces.size).toBe(0);
  } finally { await coordinator.close(); fixture.db.close(); }
});

test("total token reservations include concurrent agents and actual overages block further work", () => {
  const fixture = swarmFixture();
  try {
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTotalTokens = 500; });
    const first = fixture.run.tasks[1]!, second = fixture.run.tasks[3]!;
    fixture.store.reserveModel(fixture.run.id, first.id, 300, 0);
    expect(() => fixture.store.reserveModel(fixture.run.id, second.id, 201, 0)).toThrow("BUDGET");
    fixture.store.reserveModel(fixture.run.id, second.id, 200, 0);
    expect(()=>fixture.store.settleModel({ runId: fixture.run.id, taskId: first.id, reservedTokens: 300, reservedCost: 0, inputTokens: 301, outputTokens: 0, costUsd: 0, costSource: "estimated" })).toThrow("run tokens");
    expect(fixture.store.get(fixture.run.id)?.status).toBe("BLOCKED"); expect(fixture.store.get(fixture.run.id)?.metrics.modelReportedUsd).toBeNull();
  } finally { fixture.db.close(); }
});

test("weekly allocation tracks shared account percentage-point consumption across verified resets", () => {
  const fixture = swarmFixture();
  const observe = (usedPercent: number, resetsAt = 100) => fixture.store.admitWeeklyQuota(fixture.run.id, { usedPercent, resetsAt, windowDurationMins: 10_080 });
  try {
    expect(fixture.store.admitWeeklyQuota(fixture.run.id, { usedPercent: 10 }).available).toBe(false);
    expect(observe(10).available).toBe(true); expect(observe(25).available).toBe(true);
    expect(observe(24).available).toBe(false);
    expect(observe(4, 200).available).toBe(true); expect(observe(5, 200).available).toBe(false);
    expect(fixture.store.get(fixture.run.id)?.weeklyQuota?.consumedPercent).toBe(20);
    expect(fixture.store.get(fixture.run.id)?.budgetExhausted).toBe(true);
  } finally { fixture.db.close(); }
});

test("evidence-driven planning routes auto and max intelligence without provisioning another workspace", async () => {
  for (const mode of ["auto", "max-intelligence"] as const) {
    const fixture = await runnerFixture();
    const observed: string[] = [];
    const adapter: AiRuntimeAdapter = {
      descriptor: { id: "direct", label: "Phase fixture", providerIds: ["test-provider"], supportsReasoning: true, supportsStructuredOutput: true, available: true },
      listCatalog: () => ({ providers: [{ id: "test-provider", label: "Fixture", authenticated: true, credentialSource: "ambient", modelIds: ["highest", "value"] }], models: ["highest", "value"].map(id => ({ id, providerId: "test-provider", label: id, reasoning: true, input: ["text"] })) }),
      async run(request) { observed.push(request.profile.modelId); return { requestId: request.requestId, profile: request.profile, text: JSON.stringify({ difficulty: "bounded", reason: "One measured stage has a narrow owner.", hypotheses: fixture.run.candidates.map(candidate => ({ candidateId: candidate.id, hypothesis: candidate.hypothesis })) }), stopReason: "stop", usage: { inputTokens: 10, outputTokens: 20, costUsd: 0 } }; },
    };
    try {
      fixture.store.change(fixture.run.id, run => { run.request.mode = mode; Object.assign(run, planSwarm({ id: run.id, request: run.request, modelProfiles: profiles })); run.tasks.find(task => task.kind === "baseline")!.status = "SUCCEEDED"; });
      const task = fixture.claim("planner", ["reasoning"]); if (!task) throw Error("Planner not scheduled.");
      await reasonAboutSwarmPhase({ context: fixture.context, runtime: createLocalAiRuntime({ adapters: [adapter] }), run: fixture.store.get(fixture.run.id)!, task, signal: new AbortController().signal, maxTokenPriceUsd: 0 });
      const run = fixture.store.get(fixture.run.id)!;
      expect(observed).toEqual(["highest"]); expect(run.modelPlan?.implementation.modelId).toBe(mode === "auto" ? "value" : "highest");
      expect(run.modelPlan?.difficulty).toBe("bounded"); expect(fixture.calls).toHaveLength(0); expect(run.artifacts.some(artifact => artifact.name === "plan.json")).toBe(true);
    } finally { await fixture.close(); }
  }
});

test("per-call admission stops inference and its reservation when the allowance becomes unavailable", async () => {
  const fixture = await runnerFixture(); let calls = 0;
  const adapter: AiRuntimeAdapter = { descriptor: { id: "direct", label: "Denied fixture", providerIds: ["test-provider"], supportsReasoning: true, supportsStructuredOutput: true, available: true }, listCatalog: () => ({ providers: [], models: [] }), async run() { calls++; throw Error("Must not run"); } };
  try {
    const task = fixture.claim(); if (!task) throw Error("Task not scheduled.");
    await expect(runSwarmModelTurn({ context: fixture.context, runtime: createLocalAiRuntime({ adapters: [adapter] }), run: fixture.run, task, profile: profiles.planning, signal: new AbortController().signal, system: "Bounded task", messages: [{ role: "user", content: "Inspect" }], maxTokenPriceUsd: 0, beforeModelCall: async () => ({ available: false, reason: "Weekly allowance exhausted." }) })).rejects.toThrow("allowance");
    expect(calls).toBe(0); expect(fixture.store.get(fixture.run.id)?.metrics.modelCalls).toBe(0); expect(fixture.store.get(fixture.run.id)?.status).toBe("BLOCKED");
  } finally { await fixture.close(); }
});

test("independent review rejects invented evidence and unmet criteria block human approval", async () => {
  const fixture = await runnerFixture(); let invented = true;
  const adapter: AiRuntimeAdapter = {
    descriptor: { id: "direct", label: "Review fixture", providerIds: ["test-provider"], supportsReasoning: true, supportsStructuredOutput: true, available: true },
    listCatalog: () => ({ providers: [{ id: "test-provider", label: "Fixture", authenticated: true, credentialSource: "ambient", modelIds: ["highest"] }], models: [{ id: "highest", providerId: "test-provider", label: "Highest", reasoning: true, input: ["text"] }] }),
    async run(request) { return { requestId: request.requestId, profile: request.profile, stopReason: "stop", text: JSON.stringify({ summary: "Browser evidence is still unavailable.", criteria: fixture.request.doneCriteria.map(criterion => ({ criterion, status: invented ? "met" : "blocked", artifactIds: invented ? ["invented-artifact"] : [], reason: "No exact-image evidence." })), candidates: fixture.run.candidates.map(candidate => ({ candidateId: candidate.id, approved: true, reason: "Model assertion cannot override deterministic checks." })) }), usage: { inputTokens: 10, outputTokens: 20, costUsd: 0 } }; },
  };
  try {
    fixture.store.change(fixture.run.id, run => { Object.assign(run, planSwarm({ id: run.id, request: run.request, modelProfiles: profiles })); for (const task of run.tasks) if (!["review", "compare"].includes(task.kind)) task.status = "SUCCEEDED"; });
    const task = fixture.claim("reviewer", ["reasoning"]); if (!task) throw Error("Reviewer not scheduled.");
    const input = { context: fixture.context, runtime: createLocalAiRuntime({ adapters: [adapter] }), run: fixture.store.get(fixture.run.id)!, task, signal: new AbortController().signal, maxTokenPriceUsd: 0 };
    await expect(reasonAboutSwarmPhase(input)).rejects.toThrow("existing artifacts"); expect(fixture.store.get(fixture.run.id)?.completion).toBeUndefined();
    invented = false; await reasonAboutSwarmPhase(input);
    expect(fixture.store.get(fixture.run.id)?.completion?.status).toBe("unmet"); expect(fixture.calls).toHaveLength(0);
    fixture.store.change(fixture.run.id, run => { run.status = "AWAITING_APPROVAL"; });
    expect(() => fixture.coordinator.approve(fixture.run.id, "candidate-1")).toThrow("completion criteria");
  } finally { await fixture.close(); }
});
