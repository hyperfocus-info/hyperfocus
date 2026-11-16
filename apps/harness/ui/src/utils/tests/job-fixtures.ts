import type { BackgroundJob } from "@hyperfocus/ai-core/protocol";

export function createBackgroundJobForFilter(id: string, projectId: string, name: string, now: string): BackgroundJob {
  return {
    id,
    projectId,
    automationThreadId: `${id}-thread`,
    kind: "ai-routine",
    name,
    status: "enabled",
    riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: `${name} prompt.` },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}

export function createJob(id: string, assistantId: string, name: string = id): BackgroundJob {
  const now = "2026-08-23T12:00:00.000Z";
  return {
    id,
    projectId: "project-one",
    assistantId,
    automationThreadId: `thread-${id}`,
    kind: "ai-routine",
    name,
    status: "enabled",
    riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: `Run ${name}.` },
    schedule: { type: "one-off", runAt: now, sourceText: "manual" },
    scheduleInput: "manual",
    createdAt: now,
    updatedAt: now
  };
}
