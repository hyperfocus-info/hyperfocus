import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createQualitySession } from "@hyperfocus/ai-runtime/quality";
import { qualityCoverage } from "@hyperfocus/ai-core/quality";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../pi-agent-adapter";
import { withQualityContext } from "./quality-adapter";
import { runManagedAgentExecution } from "../managed-agent-execution";
import type { ManagedExecutionState } from "../execution-runtime";

test("parent delegates a narrow UI instruction through the managed execution boundary", async () => {
  const quality = createQualitySession({ runId: "integration", task: { intent: "Fix Books navigation and workbench recovery", project: "books" } });
  quality.select();
  const received: PiAgentPromptRequest[] = [];
  const adapter: PiAgentAdapter = {
    setApiKey() {}, hasApiKey: () => true,
    async runPrompt(request) { return (await this.startExecution(request)).result; },
    async startExecution(request) {
      received.push(request);
      request.onExecutionEvent?.({ type: "context-delivery", boundary: "sdk-prompt", promptSha256: createHash("sha256").update(request.prompt).digest("hex") });
      return { result: Promise.resolve({ text: "Implemented" }), abort: async () => {}, dispose() {}, continueWithPrompt: async () => ({ text: "continued" }) };
    },
  };
  let state: ManagedExecutionState | undefined;
  const request: PiAgentPromptRequest = { kind: "subagent", cwd: ".", modelId: "fixture/worker", prompt: "Implement sidebar" };
  const parentOutcome = JSON.stringify({ outcome: "Bookkeeping stays understandable and draft work is recoverable", constraints: ["Preserve unfinished entries"] });
  const result = await runManagedAgentExecution(withQualityContext(adapter, quality, parentOutcome), { runId: "integration", kind: "subagent", subagentId: "sidebar-worker",
    originalRequest: request, continuationRequest: request, store: { getState: () => state, setState: next => { state = next; }, clearState: () => { state = undefined; } } });
  expect(result.text).toBe("Implemented");
  expect(received[0]?.prompt).toContain(parentOutcome);
  expect(quality.trace.events.some(event => event.stage === "context-delivery" && !event.ruleId && event.outcome === "delivered")).toBe(true);
  expect(qualityCoverage(quality.trace).outcomeVerification).toBe("UNVERIFIED");
  expect(received[0]!.prompt).toContain("ui.interaction.drawer-recovery@1");
  expect(received[0]!.prompt).toContain("experience.primary-journey-complete@books-1");
  expect(received[0]!.prompt).toContain('"schema":"hyperfocus-quality-handoff-v1"');
  expect(quality.trace.handoffs[0]?.childAgentId).toBe("sidebar-worker");
  expect(quality.trace.events.filter(event => event.ruleId && event.agentId === "sidebar-worker" && event.outcome === "delivered")).toHaveLength(7);
  expect(qualityCoverage(quality.trace).state).not.toBe("VERIFIED");
  expect(qualityCoverage(quality.trace).rules.find(rule => rule.id === "ui.interaction.drawer-recovery")?.verifiers[0]?.reason).toContain("has not run");
});

test("adapter rejection records failed delivery and no worker can certify its own compliance", async () => {
  const quality = createQualitySession({ runId: "failure", task: { intent: "Build a UI workbench" } }); quality.select();
  const adapter: PiAgentAdapter = { setApiKey() {}, hasApiKey: () => true, runPrompt: async () => ({ text: "VERIFIED" }), startExecution: async () => { throw new Error("launch failed"); } };
  const wrapped = withQualityContext(adapter, quality);
  await expect(wrapped.startExecution({ kind: "executor", cwd: ".", modelId: "fixture/worker", prompt: "Implement" })).rejects.toThrow("launch failed");
  expect(quality.trace.events.at(-1)?.outcome).toBe("failed");
  await wrapped.runPrompt({ kind: "executor", cwd: ".", modelId: "fixture/worker", prompt: "Implement" });
  expect(qualityCoverage(quality.trace).state).not.toBe("VERIFIED");
});

test("a stopped branch cannot launch a follow-up turn through an existing controller", async () => {
  const quality = createQualitySession({ runId: "stopped", task: { intent: "Inspect backend" } });
  let allowed = true, calls = 0;
  const adapter: PiAgentAdapter = { setApiKey() {}, hasApiKey: () => true, runPrompt: async () => ({ text: "done" }),
    async startExecution() { calls++; return { result: Promise.resolve({ text: "done" }), abort: async () => {}, dispose() {},
      continueWithPrompt: async () => { calls++; return { text: "continued" }; } }; } };
  const wrapped = withQualityContext(adapter, quality, "Parent outcome preserved", () => { if (!allowed) throw Error("Outcome supervision: stop"); });
  const controller = await wrapped.startExecution({ kind: "executor", cwd: ".", modelId: "fixture/worker", prompt: "Inspect" });
  await controller.result;
  allowed = false;
  expect(() => controller.continueWithPrompt("polish more")).toThrow("supervision: stop");
  expect(calls).toBe(1);
  expect(quality.trace.events.some(event => !event.ruleId && event.outcome === "unknown")).toBe(true);
  expect(quality.trace.events.some(event => !event.ruleId && event.outcome === "delivered")).toBe(false);
});
