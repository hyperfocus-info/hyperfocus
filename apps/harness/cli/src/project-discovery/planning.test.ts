import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PlannerReadyTurn } from "@hyperfocus/ai-core/protocol";
import { buildExecutionPlan } from "../pi-orchestrator";
import { projectVerificationCommands } from "./inspect";
import { planTask } from "../pi-planner";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../pi-agent-adapter";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "project-plan-")); roots.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
  return root;
}
function plan(root: string, verificationScope: "worktree-full" | "owned-files-only", verificationCommands: string[] = []) {
  const plannerResult: PlannerReadyTurn = { type: "ready", summary: "Repair service", difficultyScore: 60, executionModelId: "openai/gpt-5.4", usesSubagents: true,
    subtasks: [{ id: "a", title: "Repair", instruction: "Edit src/service.py" }], finalExecutionBrief: "Repair service",
    contracts: [{ taskId: "a", title: "Repair", instruction: "Edit src/service.py", effortPoints: 2, ownedPaths: ["src/service.py"], dependsOnPrerequisiteIds: [], deliverables: ["service"], integrationPoints: [], verificationScope, verificationCommands, mergeNotes: "Keep sibling work" }] };
  return buildExecutionPlan({ projectRoot: root, runId: "discovery-test", planningModelId: "openai/gpt-5.4", plannerResult, subagentWorktreeStrategy: "separate-worktrees", planExecutionMode: "approve", planExecutionDelaySeconds: 0, correctnessIterationMode: "ask-before-iterate", iteration: 1, origin: "initial" });
}
test("Python plans receive declared Python verification instead of Bun defaults", () => {
  const root = project({ "pyproject.toml": '[tool.pytest.ini_options]\ntestpaths = ["tests"]' });
  expect(plan(root, "worktree-full").contracts[0]?.verificationCommands).toEqual(["python -m pytest"]);
});
test("unknown or file-scoped verification remains pending and preserves explicit commands", () => {
  const root = project({});
  const contract = plan(root, "worktree-full").contracts[0];
  expect(contract?.verificationCommands).toEqual([]);
  expect(contract?.mergeNotes).toContain("Verification pending");
  expect(plan(root, "owned-files-only", ["custom-check src/service.py"]).contracts[0]?.verificationCommands).toEqual(["custom-check src/service.py"]);
});
test("a declared package gate is not expanded into every overlapping test script", () => {
  const root = project({ "package.json": JSON.stringify({ packageManager: "bun@1.4.0", scripts: { test: "bun run test:ui", "test:ui": "bun test", typecheck: "tsc", check: "all" } }) });
  expect(projectVerificationCommands(root)).toEqual(["bun run test", "bun run typecheck"]);
  expect(plan(root, "owned-files-only").contracts[0]?.verificationCommands).toEqual([]);
});
test("the actual planner receives current project declarations before model execution", async () => {
  const root = project({ "pyproject.toml": '[tool.pytest.ini_options]\ntestpaths = ["tests"]' });
  const calls: PiAgentPromptRequest[] = [];
  const adapter: PiAgentAdapter = {
    async runPrompt(request) { calls.push(request); return { text: JSON.stringify({ type: "ready", summary: "Repair", difficultyScore: 10, executionModelId: "openai/gpt-5.4", usesSubagents: false, subtasks: [], finalExecutionBrief: "Repair and run configured tests" }) }; },
    async startExecution() { throw new Error("not used"); }, setApiKey() {}, hasApiKey() { return false; },
  };
  await planTask(adapter, { cwd: root, messages: [], latestUserPrompt: "Repair service.py", providerBrand: "gpt" });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.prompt).toContain('"command":["python","-m","pytest"]');
  expect(calls[0]?.prompt).toContain("never invent Bun/TypeScript checks for another stack");
});
