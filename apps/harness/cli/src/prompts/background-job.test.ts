import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { compileBackgroundJobIntentContract } from "@hyperfocus/ai-core/intent-contract";
import { createWorkspaceRepository } from "../workspace-repository";
import { createHarnessTestTempPath } from "../test-support/test-temp-root";
import { prepareBackgroundAiRoutine } from "./background-job";

test("launch recompiles legacy inferred intent instead of promoting stale coding requirements", async () => {
  const root = createHarnessTestTempPath("background-intent");
  mkdirSync(root, { recursive: true });
  const repository = createWorkspaceRepository(":memory:", root, { durability: "test-fast" });
  try {
    const projectId = repository.addProject(root).id;
    const now = new Date().toISOString();
    const job = { id: crypto.randomUUID(), projectId, automationThreadId: crypto.randomUUID(),
      kind: "ai-routine" as const, name: "Read API documentation", status: "enabled" as const, riskLevel: "safe" as const,
      definition: { kind: "ai-routine" as const, prompt: "Read-only research: compare the APIs and report findings. Do not implement code." },
      schedule: { type: "one-off" as const, runAt: now, sourceText: "now" }, scheduleInput: "now",
      nextRunAt: now, createdAt: now, updatedAt: now };
    repository.saveBackgroundJob(job);
    const legacy = { ...job, intentContract: { ...compileBackgroundJobIntentContract(job),
      artifactTypes: ["app-code" as const], deliverables: ["LEGACY: implement an unrequested app"] } };
    const prepared = await prepareBackgroundAiRoutine({ repository, job: legacy, run: {},
      planningModelId: "openai/gpt-5.4", providerBrand: "gpt" });
    expect(prepared.prompt).not.toContain("LEGACY: implement an unrequested app");
    expect(prepared.prompt).not.toContain("Artifact types: app-code");
    expect(prepared.prompt).not.toContain("treat the IntentContract as authority");
    expect(prepared.prompt).toContain("explicit user requirements and exclusions");
    expect(prepared.prompt).toContain(job.definition.prompt);
  } finally {
    repository.close();
  }
});
