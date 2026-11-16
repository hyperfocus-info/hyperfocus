import { expect, test } from "bun:test";
import { createAssistantId, type Assistant } from "@hyperfocus/ai-core/protocol";
import { buildAssistantJobBootstrapJobs } from "./assistant-job-bootstrap";

function assistantFixture(overrides: Partial<Assistant> = {}): Assistant {
  const now = new Date().toISOString();
  return {
    id: createAssistantId(),
    name: "Builder",
    scope: "project",
    projectId: "project-1",
    description: "Build useful product work.",
    personalityPrompt: "Be direct.",
    jobPrompt: "Build an app and improve repeatable workflows.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("builds the default idle assistant jobs", () => {
  const jobs = buildAssistantJobBootstrapJobs({
    assistant: assistantFixture(),
    projectId: "project-1",
    now: new Date("2026-05-25T12:00:00.000Z")
  });

  expect(jobs.map((job) => job.name)).toEqual(["Research goal", "Maintain todos", "Implement todos"]);
  expect(jobs.map((job) => job.scheduleInput)).toEqual(["15m", "15m", "15m"]);
  expect(jobs.map((job) => job.lane)).toEqual(["concurrent", "exclusive", "exclusive"]);
  expect(jobs.every((job) => job.definition.kind === "ai-routine")).toBe(true);
  expect(jobs.every((job) => job.definition.kind === "ai-routine" && job.definition.planExecutionMode === "immediate")).toBe(true);
  expect(jobs.every((job) => job.definition.kind === "ai-routine" && job.definition.subagentWorktreeStrategy === "separate-worktrees")).toBe(true);
});

test("default job prompts push research toward skills, scripts, todos, and implementation", () => {
  const prompts = buildAssistantJobBootstrapJobs({
    assistant: assistantFixture(),
    projectId: "project-1",
    now: new Date("2026-05-25T12:00:00.000Z")
  }).map((job) => job.definition.kind === "ai-routine" ? job.definition.prompt : "");

  expect(prompts[0]).toContain("/market-research");
  expect(prompts[0]).toContain(".agents/skills/**/SKILL.md");
  expect(prompts[0]).toContain("TypeScript scripts");
  expect(prompts[0]).toContain("smallest usable app behavior");
  expect(prompts[0]).toContain("TypeScript, Bun runtime, bun test");
  expect(prompts[0]).toContain("Bun + Happy DOM");
  expect(prompts.every((prompt) => prompt.includes("SolidJS + StyleX"))).toBe(true);
  expect(prompts.some((prompt) => prompt.includes("Tailwind"))).toBe(false);
  expect(prompts.some((prompt) => prompt.includes("documentation comments for new functions and variables"))).toBe(false);
  expect(prompts[1]).toContain("Clear stale completed or obsolete todos");
  expect(prompts[1]).toContain("TypeScript-script todos");
  expect(prompts[1]).toContain("most active todos should be app-code or automation-code");
  expect(prompts[2]).toContain("Prefer app/code/product behavior and TypeScript automation scripts");
  expect(prompts[2]).toContain("build or change something real");
  expect(prompts[2]).toContain("existing shared primitives where applicable");
});

test("generated jobs preserve research-only and documentation-only deliverables", () => {
  for (const jobPrompt of ["Read-only research: compare the APIs and report findings. Do not implement code.",
    "Documentation-only: update the README guide. Do not create scripts or an app."]) {
    const jobs = buildAssistantJobBootstrapJobs({ assistant: assistantFixture({ description: jobPrompt, jobPrompt }),
      projectId: "project-1", now: new Date("2026-05-25T12:00:00.000Z") });
    expect(jobs[2]?.name).toBe("Work todos");
    for (const job of jobs) {
      expect(job.definition.prompt).toContain(jobPrompt);
      expect(job.definition.prompt).toContain("Explicit user requirements and exclusions remain authoritative");
      expect(job.definition.prompt).not.toContain("most active todos should be app-code");
      expect(job.definition.prompt).not.toContain("Eagerly build");
      expect(job.definition.prompt).not.toContain("convert one todo into a TypeScript script");
      expect(job.definition.prompt).not.toContain("SolidJS + StyleX");
    }
  }
});
