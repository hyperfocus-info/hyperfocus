import { expect, test } from "bun:test";
import { createBackgroundJobId, createThreadId } from "./protocol/factories";
import type { BackgroundJob } from "./protocol/jobs-and-notifications";
import { compileAssistantIntentContract, compileBackgroundJobIntentContract, renderIntentContractPrompt } from "./intent-contract";

function backgroundJobFixture(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  const now = new Date().toISOString();
  return {
    id: createBackgroundJobId(),
    projectId: "project-1",
    automationThreadId: createThreadId(),
    kind: "ai-routine",
    name: "SaaS factory slice",
    description: "Build a usable billing web app slice with proof.",
    status: "enabled",
    riskLevel: "unsafe",
    definition: {
      kind: "ai-routine",
      prompt: "Update docs about possible SaaS ideas."
    },
    schedule: {
      type: "interval",
      intervalSeconds: 3600,
      nextRunAt: now,
      sourceText: "hourly"
    },
    scheduleInput: "hourly",
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("background job intent contract uses edited description over stale prompt", () => {
  const contract = compileBackgroundJobIntentContract(backgroundJobFixture());
  const rendered = renderIntentContractPrompt(contract);

  expect(contract.objective).toBe("Build a usable billing web app slice with proof.");
  expect(contract.artifactTypes).toContain("app-code");
  expect(contract.artifactTypes).toContain("test-evidence");
  expect(rendered).toContain("Objective: Build a usable billing web app slice with proof.");
  expect(rendered).toContain("Definition prompt: Update docs about possible SaaS ideas.");
  expect(rendered).toContain("Docs-only completion unless docs are requested or implementation is blocked.");
});

test("background job intent contract ignores generic display descriptions", () => {
  const contract = compileBackgroundJobIntentContract(
    backgroundJobFixture({
      description: "Assistant-owned job created from project chat.",
      definition: {
        kind: "ai-routine",
        prompt: "Build a SaaS factory that produces usable web app slices with tests."
      }
    })
  );

  expect(contract.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
  expect(contract.artifactTypes).toContain("app-code");
  expect(contract.artifactTypes).toContain("automation-code");
  expect(contract.artifactTypes).toContain("test-evidence");
});

test("assistant and job display labels cannot manufacture automation deliverables", () => {
  const task = "Summarize the supplied transcript.";
  const assistant = compileAssistantIntentContract({ name: "App automation factory", description: "", jobPrompt: task });
  const job = compileBackgroundJobIntentContract(backgroundJobFixture({ name: "Build and deploy app", description: "", definition: { kind: "ai-routine", prompt: task } }));
  expect(assistant.artifactTypes).toEqual(["unknown"]);
  expect(job.artifactTypes).toEqual(["unknown"]);
  expect(assistant.deliverables.join(" ")).not.toContain("Reusable automation");
});

for (const task of [
  "Read-only audit of this app. Do not implement, deploy, or ship anything.",
  "Research the app and API without building automation or shipping a release.",
  "Audit only: compare the app. Never build an app or deploy changes.",
  "Review the implementation. No automation or deployment is requested.",
  "Audit the app and do not build scripts or deploy it."
]) {
  test(`preserves research scope: ${task}`, () => {
    const contract = compileAssistantIntentContract({ name: "Assistant", description: task, jobPrompt: task });
    expect(contract.artifactTypes).toContain("research");
    for (const type of ["app-code", "automation-code", "deployment"]) expect(contract.artifactTypes).not.toContain(type);
    const rendered = renderIntentContractPrompt(contract);
    expect(rendered).not.toContain("Research converted into");
    expect(rendered).not.toContain("Do not stop at catalog notes");
    expect(rendered).toContain("Explicit user requirements and exclusions remain authoritative");
  });
}

test("documentation about an app does not require implementing it", () => {
  const contract = compileAssistantIntentContract({ name: "Documentation", description: "", jobPrompt: "Update documentation for the app API and deployment workflow." });
  expect(contract.artifactTypes).toEqual(["documentation"]);
  expect(contract.deliverables).toContain("Documentation changes that directly satisfy the requested documentation outcome.");
});

test("building a research report is not a coding deliverable", () => {
  const contract = compileAssistantIntentContract({ name: "Research", description: "", jobPrompt: "Build a market research report about the app." });
  expect(contract.artifactTypes).toEqual(["research"]);
});

test("explicit construction and release requests keep their artifact types", () => {
  const contract = compileAssistantIntentContract({ name: "Builder", description: "", jobPrompt: "Build an app. Create a validation script. Ship the release." });
  expect(contract.artifactTypes).toEqual(["app-code", "automation-code", "deployment", "test-evidence"]);
  const assistant = compileAssistantIntentContract({ name: "Notes", description: "", jobPrompt: "Build an assistant for release notes." });
  expect(assistant.artifactTypes).toContain("automation-code");
  expect(assistant.artifactTypes).not.toContain("deployment");
});

test("read-only constraints remain effective across task sections", () => {
  const contract = compileAssistantIntentContract({ name: "App", description: "Build a web app", jobPrompt: "Read-only review of this proposal; report findings only." });
  expect(contract.artifactTypes).toContain("research");
  expect(contract.artifactTypes).not.toContain("app-code");
});

test("an explicit research description is not outranked by implementation keywords in a stale prompt", () => {
  const contract = compileBackgroundJobIntentContract(backgroundJobFixture({ description: "Read-only audit of the current app.", definition: { kind: "ai-routine", prompt: "Build and deploy the app." } }));
  expect(contract.objective).toBe("Read-only audit of the current app.");
  expect(contract.artifactTypes).toContain("research");
  expect(contract.artifactTypes).not.toContain("app-code");
  expect(contract.artifactTypes).not.toContain("deployment");
});
