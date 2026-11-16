import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createChatMessage } from "@hyperfocus/ai-core/protocol";
import { aiDesignGuidanceForTask } from "@hyperfocus/ai-core/runtime";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../pi-agent-adapter";
import { planTask } from "../pi-planner";
import { taskDesignGuidance } from "./design-guidance";
import { buildExecutionInput, buildExecutionPrompt } from "./execution-input";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function project() {
  const cwd = mkdtempSync(path.join(tmpdir(), "harness-design-context-"));
  directories.push(cwd);
  return cwd;
}

test("planner uses the task, not incidental UI terms in its schema or project context", async () => {
  const cases = [
    { task: "Create a dashboard UI", expected: true },
    { task: "Build an app that tracks inventory", expected: true },
    { task: "Build a pause menu", expected: true },
    { task: "Add an interactive tutorial", expected: true },
    { task: "Fix the database transaction", expected: false },
    { task: "Build an API-only app", expected: false }
  ];
  for (const entry of cases) {
    const requests: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request) {
        requests.push(request);
        return { text: JSON.stringify({ type: "ready", difficultyScore: 20, summary: "Plan", executionModelId: "openai/gpt-5.4", usesSubagents: false, subtasks: [], finalExecutionBrief: entry.task }) };
      },
      async startExecution() { throw new Error("Unused"); }, setApiKey() {}, hasApiKey() { return false; }
    };
    await planTask(adapter, { cwd: project(), providerBrand: "gpt", latestUserPrompt: entry.task,
      messages: [createChatMessage("system", "The UI dialog is closed"), createChatMessage("user", entry.task)] });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.prompt.includes("Interface guidance for this task:")).toBe(entry.expected);
    if (entry.task.includes('pause menu')) expect(requests[0]?.prompt).toContain('Game menus:');
    if (entry.task.includes('interactive tutorial')) expect(requests[0]?.prompt).toContain('Auto-complete from host evidence');
  }
});

test('execution preserves composition constraints and never injects a product theme', async () => {
  const options = { cwd: project(), messages: [], finalExecutionBrief: 'Build a game menu with an interactive tutorial' };
  for (const prompt of [buildExecutionPrompt(options), (await buildExecutionInput(options)).prompt]) {
    expect(prompt).toContain('Game menus:');expect(prompt).toContain('Tutorials:');
    expect(prompt).toContain('never earn progress');expect(prompt).not.toContain('Touch of Death');
  }
});

test("main and prerequisite prompt builders share task intent gating", async () => {
  for (const finalExecutionBrief of ["Improve dashboard typography", "Fix database transaction retry"]) {
    const options = { cwd: project(), messages: [createChatMessage("system", "UI toolbar diagnostics")],
      finalExecutionBrief };
    const expected = finalExecutionBrief.includes("dashboard");
    expect(buildExecutionPrompt(options).includes("Interface guidance for this task:")).toBe(expected);
    const input = await buildExecutionInput(options);
    expect(input.prompt.includes("Interface guidance for this task:")).toBe(expected);
    expect(input.prompt).toContain(finalExecutionBrief);
  }
});

test("a brief that already carries the canonical hint does not receive another copy", () => {
  const task = "Improve the UI";
  const brief = task + aiDesignGuidanceForTask({ task });
  expect(taskDesignGuidance({ task: brief })).toBe("");
  expect(buildExecutionPrompt({ messages: [], finalExecutionBrief: brief })
    .split("Interface guidance for this task:")).toHaveLength(2);
});
