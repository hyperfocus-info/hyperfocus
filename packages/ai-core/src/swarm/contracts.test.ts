import { expect, test } from "bun:test";
import { createSwarmRequestSchema, swarmBudgetSchema, swarmCapabilitiesSchema, swarmRunSchema, swarmTaskSchema } from "./contracts";
import { describeSwarmRun } from "./review-model";
import { createSwarmClient } from "./client";

test("public-link client validates scoped requests and rejects unsafe returned links", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  let unsafe = false;
  const receipt = { url: `https://swarm.example.test/swarm#code=${"a".repeat(64)}`, accessId: crypto.randomUUID(), expiresAt: Date.now() + 3_600_000 };
  const client = createSwarmClient({ fetch: async (input, init) => { calls.push({ url: String(input), body: JSON.parse(String(init?.body)) }); return Response.json({ ...receipt, url: unsafe ? "javascript:alert(1)" : receipt.url }); } });
  expect(await client.issueBrowserAccess({ runId: "run-1", access: "view" })).toEqual(receipt);
  expect(calls).toEqual([{ url: "/api/swarm/v1/runs/run-1/browser-access", body: { access: "view", expiresInMs: 604_800_000 } }]);
  await expect(client.issueBrowserAccess({ runId: "run-1", access: "view", expiresInMs: 2_592_000_001 })).rejects.toThrow();
  expect(calls).toHaveLength(1);
  unsafe = true;
  await expect(client.issueBrowserAccess({ runId: "run-1", access: "control" })).rejects.toThrow("Invalid public swarm URL");
});

test("provider outage responses show a bounded service error without schema internals", async () => {
  const deleted = createSwarmClient({fetch:async()=>Response.json({message:"Application unavailable"},{status:404})});
  await expect(deleted.capabilities()).rejects.toThrow("Swarm service unavailable (404).");
  const unavailable = createSwarmClient({fetch:async()=>new Response("upstream HTML",{status:502})});
  await expect(unavailable.capabilities()).rejects.toThrow("Swarm service returned an unreadable response (502).");
});

test("default swarm budgets authorize no separate inference billing and cap compute at ten dollars", () => {
  const request = createSwarmRequestSchema.parse({ requestId: "request-1", projectId: "project-1", goal: "Investigate current performance", repository: { revision: "a".repeat(40) } });
  expect(request.budget.maxComputeUsd).toBe(5);
  expect(request.budget.maxModelUsd).toBe(0);
  expect(request.profile).toBeUndefined();
  expect(swarmBudgetSchema.safeParse({ maxComputeUsd: 10 }).success).toBe(true);
  expect(swarmBudgetSchema.safeParse({ maxComputeUsd: 10.01 }).success).toBe(false);
});

test("paired benchmark tasks preserve up to 512 attributed artifacts", () => {
  const task = { id: "task-1", swarmId: "run-1", agentId: "agent-1", title: "Controlled paired comparison", kind: "benchmark", role: "benchmark-analyst", capability: "benchmark", dependencies: [], acceptanceCriteria: [], status: "SUCCEEDED", attempt: 1, maxAttempts: 1, artifactIds: Array.from({ length: 512 }, (_, index) => `artifact-${index}`) };
  expect(swarmTaskSchema.parse(task).artifactIds).toHaveLength(512);
  expect(swarmTaskSchema.safeParse({ ...task, artifactIds: [...task.artifactIds, "overflow"] }).success).toBe(false);
});

test("Codex subscription usage remains separate from reported inference charges", () => {
  const inference = { provider: "Codex", credentialSource: "Existing subscription", separatelyBilledUsd: 0 };
  expect(swarmCapabilitiesSchema.parse({ available: true, backends: ["railway"], maxWorkers: 3, projects: [], inference }).inference).toEqual(inference);
  const run = swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Investigate current performance", repository: { revision: "a".repeat(40) }, profile: { agentId: "codex-cli", providerId: "codex-account", modelId: "default" } }, status: "READY", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: { modelCalls: 2, inputTokens: 100, outputTokens: 25 } });
  expect(describeSwarmRun(run).facts).toContainEqual({ label: "Codex subscription usage", value: "2 calls · 100 input / 25 output tokens · Account limits apply" });
  expect(describeSwarmRun(run).facts).toContainEqual({ label: "Separate inference estimate / limit", value: "$0.0000 / $0.0000" });
  expect(describeSwarmRun(run).facts).toContainEqual({ label: "Reported inference charges", value: "Not reported" });
});
