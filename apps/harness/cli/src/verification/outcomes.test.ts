import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { executionPlanSchema, plannerReadyTurnSchema } from "@hyperfocus/ai-core/protocol";
import { executePlanPrerequisites, executeReadyRun, buildExecutionPlan } from "../pi-orchestrator";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import { checkOutcomeDispatch } from "@hyperfocus/ai-runtime/quality/execution";
import { createHarnessTestTempPath } from "../test-support/test-temp-root";
import { runCorrectnessReview } from "../server/execution/correctness-review";

const prerequisite = { id: "setup", title: "Setup", instruction: "Prepare setup", reason: "Needed first",
  requiredForTaskIds: ["task"], owner: "main", status: "completed", verificationCommands: ["bun check.ts"] };
function fixture() {
  const cwd = createHarnessTestTempPath("verification-outcome"); mkdirSync(cwd, { recursive: true });
  const readyPlan = plannerReadyTurnSchema.parse({ type: "ready", difficultyScore: 20, summary: "Create output", executionModelId: "openai/gpt-5.4",
    usesSubagents: false, subtasks: [{ id: "task", title: "Create output", instruction: "Create output" }], finalExecutionBrief: "Create output",
    prerequisites: [prerequisite], contracts: [{ taskId: "task", title: "Create output", instruction: "Create output", effortPoints: 2,
      ownedPaths: ["output.txt"], dependsOnPrerequisiteIds: [], deliverables: ["output.txt"], integrationPoints: [],
      verificationScope: "owned-files-only", verificationCommands: ["bun check.ts"], mergeNotes: "Pass the check" }] });
  const executionPlan = executionPlanSchema.parse({ runId: "run", origin: "initial", iteration: 1,
    summary: readyPlan.summary, finalExecutionBrief: readyPlan.finalExecutionBrief, difficultyScore: 20,
    planningModelId: "openai/gpt-5.4", executionModelId: readyPlan.executionModelId, route: "main",
    subagentWorktreeStrategy: "same-worktree", targetSubagentCount: 0, actualSubagentCount: 0,
    gating: { mode: "approve", delaySeconds: 0 }, prerequisites: readyPlan.prerequisites, contracts: readyPlan.contracts,
    correctnessPolicy: "ask-before-iterate" });
  const adapter: PiAgentAdapter = { setApiKey() {}, hasApiKey: () => false,
    async runPrompt() { return { text: "I could not complete setup." }; },
    async startExecution() { return { result: Promise.resolve({ text: "All checks passed." }),
      continueWithPrompt: async () => ({ text: "All checks passed." }), abort: async () => {}, dispose() {} }; } };
  return { cwd, readyPlan, executionPlan, adapter };
}

test("a model completion claim cannot bypass a failing frozen acceptance command", async () => {
  const { cwd, readyPlan, executionPlan, adapter } = fixture();
  executionPlan.prerequisites = [];
  writeFileSync(path.join(cwd, "check.ts"), 'await Bun.write("checked.txt", "yes"); process.exit(9);');
  await expect(executeReadyRun(adapter, { cwd, runId: "run", sessionId: "session", messages: [],
    providerBrand: "gpt", readyPlan, executionPlan, debugEnabled: false })).rejects.toThrow("exit 9");
  expect(await Bun.file(path.join(cwd, "checked.txt")).text()).toBe("yes");
  await expect(executeReadyRun(adapter, { cwd, runId: "run", sessionId: "session", messages: [],
    providerBrand: "gpt", readyPlan: { ...readyPlan, usesSubagents: true },
    executionPlan: { ...executionPlan, route: "pi-subagents" }, debugEnabled: false })).rejects.toThrow("exit 9");
});

test("direct orchestration cannot bypass pending prerequisite acceptance", async () => {
  const { cwd, readyPlan, executionPlan, adapter } = fixture();
  await expect(executeReadyRun(adapter, { cwd, runId: "run", sessionId: "session", messages: [],
    providerBrand: "gpt", readyPlan, executionPlan, debugEnabled: false })).rejects.toThrow("Prerequisite verification pending");
});

test("fresh planner prerequisites reset completion while persisted host completion survives", () => {
  const { executionPlan, readyPlan } = fixture();
  expect(readyPlan.prerequisites?.[0]?.status).toBe("pending");
  const resumed = executionPlanSchema.parse({ ...executionPlan, prerequisites: [prerequisite] });
  expect(resumed.prerequisites[0]?.status).toBe("completed");
  const fresh = buildExecutionPlan({ runId: "fresh", planningModelId: "openai/gpt-5.4", plannerResult: { ...readyPlan, prerequisites: resumed.prerequisites },
    subagentWorktreeStrategy: "same-worktree", planExecutionMode: "approve", planExecutionDelaySeconds: 0,
    correctnessIterationMode: "ask-before-iterate", iteration: 1, origin: "initial" });
  expect(fresh.prerequisites[0]?.status).toBe("pending");
});

test("prerequisite failure prose cannot advance dependencies without passing acceptance", async () => {
  const { cwd, executionPlan, adapter } = fixture();
  writeFileSync(path.join(cwd, "check.ts"), "process.exit(8);");
  let persisted = false;
  const options = { cwd, runId: "run", sessionId: "session", messages: [], executionPlan,
    executionModelId: executionPlan.executionModelId, onPrerequisiteComplete: () => { persisted = true; } };
  await expect(executePlanPrerequisites(adapter, options)).rejects.toThrow("exit 8");
  expect(persisted).toBe(false);
  expect(executionPlan.prerequisites[0]?.status).toBe("pending");
  executionPlan.prerequisites[0]!.verificationCommands = [];
  await expect(executePlanPrerequisites(adapter, options)).rejects.toThrow("verification pending");
});

test("corrective plans preserve declared checks instead of inventing another stack", async () => {
  const { cwd, executionPlan, readyPlan } = fixture();
  writeFileSync(path.join(cwd, "index.html"), '<script src="app.ts"></script>');
  executionPlan.contracts[0]!.verificationCommands = ["python -m pytest"];
  const review = await runCorrectnessReview(cwd, executionPlan, { partial: false, subagentResults: [],
    assistantMessage: { id: "answer", role: "assistant", content: "Done", createdAt: new Date().toISOString() } }, readyPlan);
  expect(review.recommendedPlan?.contracts[0]?.verificationCommands).toEqual(["python -m pytest"]);
});

test("supervised dispatch rejects drift, stop decisions, expired budgets and skipped pilot checks before any model work", async () => {
  const { cwd, readyPlan, executionPlan, adapter } = fixture();
  const outcome = "A coherent full music film with readable acting and musical progression";
  executionPlan.supervision = { request: readyPlan.finalExecutionBrief, intent: "Reduce owner direction", outcome,
    experience: "Understand the exchange and its consequence", evidence: ["Full-speed sound-on pilot with visible exchange"],
    constraints: ["Preserve music and approved appearance"], budget: "One pilot, no full-song expansion until accepted", decision: "continue", reason: "Pilot tests the defining action" };
  executionPlan.contracts[0]!.contribution = { outcome, limitingFactor: "Unproven exchange", evidence: "Prior full film rejected for acting",
    expectedImprovement: "Reject inadequate acting before expensive expansion", stopWhen: "Pilot cannot establish the exchange" };
  executionPlan.prerequisites[0]!.status = "completed";
  let calls = 0;
  adapter.startExecution = async () => { calls++; throw Error("Unexpected dispatch"); };
  const execute = () => executeReadyRun(adapter, { cwd, runId: "run", sessionId: "session", messages: [], providerBrand: "gpt", readyPlan, executionPlan, debugEnabled: false });
  writeFileSync(path.join(cwd, "check.ts"), 'await Bun.write("pilot-checked.txt", "failed"); process.exit(7);');
  await expect(execute()).rejects.toThrow("exit 7");
  expect(await Bun.file(path.join(cwd, "pilot-checked.txt")).text()).toBe("failed");
  executionPlan.prerequisites[0]!.verificationCommands = [];
  await expect(execute()).rejects.toThrow("lacks verified acceptance");
  executionPlan.contracts[0]!.contribution.outcome = "Polish one wrist trajectory";
  await expect(execute()).rejects.toThrow("Outcome drift");
  executionPlan.contracts[0]!.contribution.outcome = outcome;
  for (const decision of ["stop", "redirect", "escalate"] as const) {
    executionPlan.supervision.decision = decision;
    await expect(execute()).rejects.toThrow(`supervision: ${decision}`);
    executionPlan.prerequisites[0]!.status = "pending";
    await expect(executePlanPrerequisites(adapter, { cwd, runId: "run", sessionId: "session", messages: [], executionPlan,
      executionModelId: executionPlan.executionModelId })).rejects.toThrow(`supervision: ${decision}`);
    executionPlan.prerequisites[0]!.status = "completed";
  }
  executionPlan.supervision.decision = "continue";
  executionPlan.supervision.deadlineAt = Date.now() - 1;
  await expect(execute()).rejects.toThrow("budget expired");
  expect(calls).toBe(0);
  await expect(executeReadyRun(adapter, { cwd, runId: "legacy-control", sessionId: "session", messages: [], providerBrand: "gpt", readyPlan,
    executionPlan: { ...executionPlan, supervision: undefined }, debugEnabled: false })).rejects.toThrow("Unexpected dispatch");
  expect(calls).toBe(1); // Removing admission lets the same persisted completion flag reach execution.
  delete executionPlan.supervision.deadlineAt;
  executionPlan.prerequisites[0]!.verificationCommands = ["bun check.ts"];
  writeFileSync(path.join(cwd, "check.ts"), 'await Bun.write("pilot-checked.txt", "passed");');
  expect(await checkOutcomeDispatch({ cwd, plan: executionPlan, request: readyPlan.finalExecutionBrief })).toContain(outcome);
  expect(await Bun.file(path.join(cwd, "pilot-checked.txt")).text()).toBe("passed");
  writeFileSync(path.join(cwd, "index.html"), '<script src="missing.ts"></script>');
  const review = await runCorrectnessReview(cwd, executionPlan, { partial: false, subagentResults: [],
    assistantMessage: { id: "answer", role: "assistant", content: "Done", createdAt: new Date().toISOString() } }, readyPlan);
  expect(review.recommendedPlan).toBeDefined();
  expect(review.recommendedPlan?.prerequisites).toEqual(executionPlan.prerequisites);
  expect(await checkOutcomeDispatch({ cwd, plan: review.recommendedPlan!, request: readyPlan.finalExecutionBrief })).toContain(outcome);
});

test("difficulty alone cannot create delegation the planner did not select", () => {
  const { readyPlan } = fixture();
  const plan = buildExecutionPlan({ runId: "bounded", planningModelId: "openai/gpt-5.4", plannerResult: { ...readyPlan, difficultyScore: 100, usesSubagents: false },
    subagentWorktreeStrategy: "same-worktree", planExecutionMode: "immediate", planExecutionDelaySeconds: 0, correctnessIterationMode: "ask-before-iterate", iteration: 1, origin: "initial" });
  expect(plan.targetSubagentCount).toBe(0);
  expect(plan.actualSubagentCount).toBe(0);
});
