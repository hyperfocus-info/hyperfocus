import { expect, test } from "bun:test";
import { createLocalAiRuntime, type AiRuntimeAdapter } from "@hyperfocus/ai-runtime";
import type { AiRunRequest } from "@hyperfocus/ai-core/runtime";
import { runnerFixture } from "../execution/runner-test-fixture";
import { investigateCandidate } from "./reasoning";
import { commandObservation } from "./observations";
import { createSwarmCoordinator } from "../coordinator";
import { createSwarmTaskHandler } from "../execution/runner";

const finish = { action: "finish", diagnosis: "The retained evidence is incomplete; renderer checks remain outstanding.", risks: ["Unvalidated result"], hypothesisSupported: false };
function runtimeFor(action: (request: AiRunRequest) => unknown) {
  const adapter: AiRuntimeAdapter = {
    descriptor: { id: "direct", label: "Reasoning fixture", providerIds: ["test-provider"], supportsReasoning: true, supportsStructuredOutput: true, available: true },
    listCatalog: () => ({ providers: [{ id: "test-provider", label: "Fixture", authenticated: true, credentialSource: "ambient", modelIds: ["test-model"] }], models: [{ id: "test-model", providerId: "test-provider", label: "Fixture", reasoning: true, input: ["text"] }] }),
    async run(request) { return { requestId: request.requestId, profile: request.profile, text: JSON.stringify(action(request)), stopReason: "stop", usage: { inputTokens: 10, outputTokens: 10, costUsd: 0 } }; },
  };
  return createLocalAiRuntime({ adapters: [adapter] });
}
async function investigationFixture() {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  const baseline = fixture.claim()!;
  await fixture.context.workspace(fixture.run, baseline, signal);
  fixture.finish(baseline);
  const task = fixture.claim("investigator", ["reasoning"])!;
  const workspace = await fixture.context.fork(fixture.run, task, signal);
  return { ...fixture, task, workspace, signal, maxTokenPriceUsd: 0 };
}
function lastResult(request: AiRunRequest) {
  const content = request.messages.at(-1)!.content;
  if (typeof content !== "string") throw Error("Expected text context.");
  return JSON.parse(content.split("\nLast result:\n")[1]!.split("\nReturn one action.")[0]!);
}

test("bounded command observations preserve failure metadata and both stream ends", () => {
  const stdout = 'HEAD\n"' + "x".repeat(20_000) + "STDOUT_END", stderr = "ERROR_START" + "e".repeat(8_000) + "ERROR_END";
  const text = commandObservation({ exitCode: 2, timedOut: true, truncated: true, durationMs: 123, stdout, stderr });
  const result = JSON.parse(text);
  expect(result).toMatchObject({ exitCode: 2, timedOut: true, truncated: true, durationMs: 123, stdoutOmittedCharacters: stdout.length - 3_000, stderrOmittedCharacters: stderr.length - 2_000 });
  expect(result.stdout).toStartWith('HEAD\n"'); expect(result.stdout).toEndWith("STDOUT_END");
  expect(result.stderr).toStartWith("ERROR_START"); expect(result.stderr).toEndWith("ERROR_END");
  expect(text.length).toBeLessThan(5_600);
});

test("investigation preserves escaped artifact page offsets and does not replay old tool payloads", async () => {
  const fixture = await investigationFixture(), requests: AiRunRequest[] = [];
  try {
    const pageText = 'PAGE_MARKER\n"\\' + 'x\n"\\'.repeat(3_000);
    const artifact = await fixture.context.artifact(fixture.run, fixture.task, { name: "command-page.log", kind: "log", bytes: pageText });
    const originalExecute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      if (input.task.command !== "large-output") return originalExecute(input);
      const stdout = "PREVIOUS_COMMAND_MARKER" + "x".repeat(20_000);
      input.onOutput?.({ stream: "stdout", text: stdout });
      return { exitCode: 2, timedOut: false, truncated: false, durationMs: 2, stdout, stderr: "failure" };
    };
    const actions = [{ action: "execute", command: "large-output", purpose: "Inspect failure" }, { action: "artifact", artifactId: artifact.id, offset: 0, maxCharacters: 8_000 }, { action: "finding", kind: "evidence", text: "The page records a failure." }, finish];
    const runtime = runtimeFor(request => { requests.push(request); return actions[requests.length - 1]; });
    await investigateCandidate({ ...fixture, runtime });
    expect(lastResult(requests[1]!)).toMatchObject({ exitCode: 2, stderr: "failure", stdoutOmittedCharacters: 17_023 });
    expect(lastResult(requests[2]!)).toMatchObject({ artifactId: artifact.id, offset: 0, nextOffset: 8_000, totalCharacters: pageText.length, text: pageText.slice(0, 8_000), truncated: true });
    expect(requests.every(request => request.messages.length === 1)).toBe(true);
    expect(JSON.stringify(requests[2]!.messages)).not.toContain("PREVIOUS_COMMAND_MARKER");
    expect(JSON.stringify(requests[3]!.messages)).not.toContain("PAGE_MARKER");
  } finally { await fixture.close(); }
});

test("a normal turn that cannot fit uses one report-only turn without promoting incomplete work", async () => {
  const fixture = await investigationFixture(), requests: AiRunRequest[] = [];
  try {
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTokensPerAgent = 30_000; });
    fixture.store.reserveModel(fixture.run.id, fixture.task.id, 21_000, 0);
    fixture.store.settleModel({ runId: fixture.run.id, taskId: fixture.task.id, reservedTokens: 21_000, reservedCost: 0, inputTokens: 21_000, outputTokens: 0, costUsd: 0 });
    const runtime = runtimeFor(request => { requests.push(request); return finish; });
    await expect(investigateCandidate({ ...fixture, run: fixture.store.get(fixture.run.id)!, runtime })).rejects.toThrow("MODEL_BUDGET_EXHAUSTED");
    expect(requests).toHaveLength(1); expect(requests[0]!.systemPrompt).toContain("report-only");
    const run = fixture.store.get(fixture.run.id)!;
    const artifact = run.artifacts.find(value => value.name.endsWith("-budget-finalization.json"))!;
    const report = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: artifact.sha256 })));
    expect(report).toMatchObject({ status: "INCOMPLETE_BUDGET_FINALIZATION", promotable: false, report: finish, scope: { goal: fixture.run.request.goal, doneCriteria: fixture.run.request.doneCriteria } });
    expect(run.candidates.every(candidate => !candidate.patchArtifactId && !candidate.diagnosis)).toBe(true);
    expect(run.budgetRejection).toMatchObject({ scope: "task", dimension: "tokens", used: 21_000, remaining: 9_000 }); expect(run.metrics.modelUnsettledTokens).toBe(0);
  } finally { await fixture.close(); }
});

test("finalization cannot run tools and cannot bypass a reservation refusal", async () => {
  for (const remaining of [9_000, 100]) {
    const fixture = await investigationFixture(); let calls = 0;
    try {
      fixture.store.change(fixture.run.id, run => { run.request.budget.maxTokensPerAgent = 30_000; });
      const used = 30_000 - remaining;
      fixture.store.reserveModel(fixture.run.id, fixture.task.id, used, 0);
      fixture.store.settleModel({ runId: fixture.run.id, taskId: fixture.task.id, reservedTokens: used, reservedCost: 0, inputTokens: used, outputTokens: 0, costUsd: 0 });
      const before = fixture.calls.length;
      const runtime = runtimeFor(() => { calls++; return { action: "execute", command: "must-not-execute", purpose: "Forbidden finalization action" }; });
      await expect(investigateCandidate({ ...fixture, run: fixture.store.get(fixture.run.id)!, runtime })).rejects.toThrow("MODEL_BUDGET_EXHAUSTED");
      expect(fixture.calls).toHaveLength(before); expect(calls).toBe(remaining === 100 ? 0 : 1);
      const run = fixture.store.get(fixture.run.id)!;
      expect(run.artifacts.some(value => value.name.endsWith("-budget-evidence.json"))).toBe(true);
      expect(run.metrics.modelUnsettledTokens).toBe(0);
      if (remaining === 9_000) expect(run.messages.some(message => message.text.includes("no tool action was executed"))).toBe(true);
      if (remaining === 100) { expect(run.budgetRejection).toMatchObject({ scope: "task", dimension: "tokens", remaining: 100 }); expect(fixture.store.modelUsage(run.id, fixture.task.id).calls).toBe(1); }
    } finally { await fixture.close(); }
  }
});

test("coordinator does not retry compact budget finalization or promote its interrupted patches", async () => {
  const fixture = await runnerFixture({ maxRetries: 2 }); let calls = 0;
  const runtime = runtimeFor(() => { calls++; return finish; });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: fixture.provider, handleTask: createSwarmTaskHandler({ context: fixture.context, runtime, maxTokenPriceUsd: 0 }) });
  try {
    fixture.store.change(fixture.run.id, run => { run.request.budget.maxTokensPerAgent = 30_000; });
    const investigators = fixture.store.get(fixture.run.id)!.tasks.filter(task => task.kind === "investigate");
    for (const task of investigators) {
      fixture.store.reserveModel(fixture.run.id, task.id, 21_000, 0);
      fixture.store.settleModel({ runId: fixture.run.id, taskId: task.id, reservedTokens: 21_000, reservedCost: 0, inputTokens: 21_000, outputTokens: 0, costUsd: 0 });
    }
    await coordinator.drain();
    const run = fixture.store.get(fixture.run.id)!;
    expect(calls).toBe(investigators.length);
    expect(run.tasks.filter(task => task.kind === "investigate").every(task => task.status === "FAILED" && task.attempt === 1 && task.error?.includes("MODEL_BUDGET_EXHAUSTED"))).toBe(true);
    expect(run.artifacts.filter(artifact => artifact.name.endsWith("-budget-finalization.json"))).toHaveLength(investigators.length);
    expect(run.candidates.every(candidate => !candidate.patchArtifactId)).toBe(true);
    expect(run.metrics.modelUnsettledTokens).toBe(0); expect(fixture.workspaces.size).toBe(0);
  } finally { await coordinator.close(); await fixture.close(); }
});
