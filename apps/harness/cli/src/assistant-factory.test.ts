import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAssistantAssetRefId, createAssistantId, createAssistantQuestionId, createBackgroundJobId, createProjectId,
  createThreadId, type Assistant, type BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { bootstrapAssistantJobsIfNone, createOrUpdateAssistantWithJobs } from "./assistant-factory";
import { findExistingAssistantForThreadIntent } from "./server/automation/assistant-actions";
import { createWorkspaceRepository } from "./workspace-repository";
import { resolveHarnessTestTempRoot } from "./test-support/test-temp-root";

function createTempDir() {
  const tempRoot = resolveHarnessTestTempRoot();
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const dbPath = path.join(createTempDir(), `assistant-factory-${crypto.randomUUID()}.sqlite`);
  return createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("assistant factory", () => {
  test("finds exact thread-intent identity beyond the bounded assistant summary", () => {
    const repository = createRepository();
    const targetId = createAssistantId();
    const assistant = (id: string, name: string, createdAt: string): Assistant => ({ id, name, scope: "global",
      personalityPrompt: "Be precise.", jobPrompt: "Maintain exact intent identity.", agentId: "pi", runState: "active",
      bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed", unreadQuestionCount: 0,
      createdAt, updatedAt: createdAt });
    repository.saveAssistant(assistant(targetId, "Exact Intent", "2000-01-01T00:00:00.000Z"));
    for (let index = 0; index < 512; index += 1) repository.saveAssistant(assistant(
      createAssistantId(), `Recent ${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()));
    expect(repository.loadAssistantsState().assistants.some(({ id }) => id === targetId)).toBe(false);
    expect(findExistingAssistantForThreadIntent(repository, createProjectId(), "exact intent", "global")?.id).toBe(targetId);
    repository.close();
  });

  test("refreshes intent contract for dialog-created and edited assistant prompts", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistant: Assistant = {
      id: createAssistantId(),
      name: "Factory Builder",
      scope: "project",
      projectId: project.id,
      description: "Short purpose summary.",
      personalityPrompt: "Be concise.",
      jobPrompt: "Build a SaaS factory that produces usable web app slices with tests.",
      agentId: "codex-cli",
      providerBrand: "gpt",
      modeId: "implement",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const created = createOrUpdateAssistantWithJobs({
      repository,
      assistant,
      launchDefaults: {
        providerBrand: "gpt",
        modeId: "implement"
      }
    });
    const edited = createOrUpdateAssistantWithJobs({
      repository,
      assistant: {
        ...created.assistant,
        description: "Build a SaaS factory that produces usable web app slices with tests.",
        jobPrompt: "Keep catalog notes only when they support factory app implementation.",
        updatedAt: new Date(Date.parse(now) + 1000).toISOString()
      },
      launchDefaults: {
        providerBrand: "gpt",
        modeId: "implement"
      }
    });
    const persisted = repository.getAssistant(assistant.id);

    expect(created.created).toBe(true);
    expect(created.assistant.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
    expect(created.assistant.intentContract?.artifactTypes).toContain("app-code");
    expect(edited.created).toBe(false);
    expect(edited.assistant.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("app-code");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("automation-code");
    expect(edited.assistant.intentContract?.artifactTypes).toContain("test-evidence");
    expect(persisted?.intentContract?.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
  });

  test("creates assistant-owned jobs with launch profile snapshot", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistant: Assistant = {
      id: createAssistantId(),
      name: "Omega",
      scope: "project",
      projectId: project.id,
      description: "Builds assistants.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Create assistants and jobs.",
      agentId: "codex-cli",
      providerBrand: "gpt",
      executionModelId: "openai/gpt-5.4",
      reasoningStrength: "high",
      fastMode: true,
      modeId: "implement",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Omega factory",
      status: "enabled",
      riskLevel: "unsafe",
      definition: {
        kind: "ai-routine",
        prompt: "Build an assistant for release notes."
      },
      schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: now, sourceText: "hourly" },
      scheduleInput: "hourly",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };

    const result = createOrUpdateAssistantWithJobs({
      repository,
      assistant,
      jobs: [job],
      launchDefaults: {
        providerBrand: "gpt",
        planningModelId: "openai/gpt-5.4-mini",
        executionModelId: "openai/gpt-5.4",
        modeId: "implement"
      }
    });

    const savedJob = result.jobs[0];
    expect(result.created).toBe(true);
    expect(result.assistant.intentContract?.objective).toBe("Create assistants and jobs.");
    expect(result.assistant.intentContract?.artifactTypes).toContain("automation-code");
    expect(savedJob?.intentContract?.objective).toBe("Build an assistant for release notes.");
    expect(savedJob?.intentContract?.artifactTypes).toContain("automation-code");
    expect(savedJob?.definition.kind).toBe("ai-routine");
    if (savedJob?.definition.kind === "ai-routine") {
      expect(savedJob.definition.launchProfile).toMatchObject({
        agentId: "codex-cli",
        providerBrand: "gpt",
        planningModelId: "openai/gpt-5.4-mini",
        executionModelId: "openai/gpt-5.4",
        reasoningStrength: "high",
        fastMode: true,
        modeId: "implement"
      });
    }
    expect(repository.loadAssistantsState().logs.some((entry) => entry.assistantId === assistant.id && entry.summary === "Assistant created")).toBe(true);
  });

  test("rolls back a partial assistant job bootstrap and dedupes its retry", () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantInput: Assistant = {
      id: createAssistantId(), name: "Atomic bootstrap", scope: "project", projectId: project.id,
      personalityPrompt: "Be careful.", jobPrompt: "Maintain jobs.", agentId: "codex-cli",
      runState: "active", bootstrapState: "completed", failureStreakCount: 0,
      circuitBreakerState: "closed", unreadQuestionCount: 0, createdAt: now, updatedAt: now
    };
    const assistant = repository.saveAssistant(assistantInput, [{
      id: createAssistantAssetRefId(), assistantId: assistantInput.id, kind: "background-template", label: "Scheduled task",
      value: "scheduled-task", resolutionStatus: "resolved", createdAt: now
    }]);
    const job: BackgroundJob = {
      id: createBackgroundJobId(), projectId: project.id, assistantId: assistant.id,
      automationThreadId: createThreadId(), kind: "ai-routine", name: "Atomic job",
      status: "enabled", riskLevel: "safe", definition: { kind: "ai-routine", prompt: "Work." },
      schedule: { type: "one-off", runAt: now, sourceText: now }, scheduleInput: now,
      nextRunAt: now, createdAt: now, updatedAt: now
    };
    const input = { repository, assistant, jobs: [job], launchDefaults: { providerBrand: "gpt" as const } };

    const confirmationQuestionId = createAssistantQuestionId();
    repository.saveAssistantQuestion({
      id: confirmationQuestionId,
      assistantId: assistant.id,
      prompt: "Create default assistant jobs?",
      status: "pending",
      linkedTodoIds: [],
      askedAt: now
    });
    const remainingQuestionId = createAssistantQuestionId();
    repository.saveAssistantQuestion({
      id: remainingQuestionId,
      assistantId: assistant.id,
      prompt: "What should run next?",
      status: "pending",
      linkedTodoIds: [],
      askedAt: new Date(Date.parse(now) + 1).toISOString()
    });
    const confirmation = { confirmation: { questionId: confirmationQuestionId, answerText: "Yes." } };
    expect(() => bootstrapAssistantJobsIfNone(
      { ...input, jobs: [job, { ...job, id: createBackgroundJobId(), projectId: "missing-project" }] },
      confirmation
    ))
      .toThrow("Unknown project");
    expect(repository.hasAssistantBackgroundJobs(assistant.id)).toBe(false);
    expect(repository.getAssistantQuestion(confirmationQuestionId)?.status).toBe("pending");
    const triggerDb = new Database(repository.getDatabasePath(), { strict: true });
    triggerDb.exec(`CREATE TRIGGER reject_bootstrap_question_notification BEFORE INSERT ON notifications
      WHEN NEW.kind IN ('assistant-question', 'assistant-question-batch')
      BEGIN SELECT RAISE(ABORT, 'notification reconcile failed'); END;`);
    triggerDb.close(false);
    expect(() => bootstrapAssistantJobsIfNone(input, confirmation)).toThrow("notification reconcile failed");
    expect(repository.hasAssistantBackgroundJobs(assistant.id)).toBe(false);
    expect(repository.getAssistantQuestion(confirmationQuestionId)?.status).toBe("pending");
    const cleanupDb = new Database(repository.getDatabasePath(), { strict: true });
    cleanupDb.exec("DROP TRIGGER reject_bootstrap_question_notification;");
    cleanupDb.close(false);
    const loadAssistantsState = repository.loadAssistantsState.bind(repository);
    repository.loadAssistantsState = () => { throw new Error("bootstrap must not hydrate assistant details"); };
    expect(bootstrapAssistantJobsIfNone(input, confirmation)?.jobs.map((entry) => entry.id)).toEqual([job.id]);
    repository.loadAssistantsState = loadAssistantsState;
    expect(repository.getAssistantQuestion(confirmationQuestionId)?.status).toBe("answered");
    expect(repository.getAssistantAssetRefs(assistant.id).map((entry) => entry.value)).toEqual(["scheduled-task"]);
    expect(bootstrapAssistantJobsIfNone(input)).toBeUndefined();
    expect(repository.listAssistantBackgroundJobs({ assistantId: assistant.id }).items.map((entry) => entry.id)).toEqual([job.id]);
    expect(repository.loadNotificationInboxState().items.filter((item) =>
      item.kind === "assistant-question" && item.assistantId === assistant.id)).toHaveLength(1);
    expect(bootstrapAssistantJobsIfNone(input, confirmation)).toBeUndefined();
    expect(repository.loadNotificationInboxState().items.filter((item) =>
      item.kind === "assistant-question" && item.assistantId === assistant.id)).toHaveLength(1);

    const oldConfirmationId = createAssistantQuestionId();
    repository.saveAssistantQuestion({ id: oldConfirmationId, assistantId: assistant.id,
      prompt: "Confirm after a large backlog?", status: "pending", linkedTodoIds: [], askedAt: "2000-01-01T00:00:00.000Z" });
    const seedDb = new Database(repository.getDatabasePath(), { strict: true });
    const seedQuestion = seedDb.query(`INSERT INTO assistant_questions
      (id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at)
      VALUES (?1, ?2, ?3, 'pending', NULL, '[]', ?4, NULL)`);
    seedDb.transaction(() => {
      for (let index = 0; index < 4096; index += 1) seedQuestion.run(createAssistantQuestionId(), assistant.id,
        `Backlog question ${index}?`, new Date(Date.parse(now) + index + 2).toISOString());
    }).immediate();
    seedDb.close(false);
    expect(bootstrapAssistantJobsIfNone(input, {
      confirmation: { questionId: oldConfirmationId, answerText: "Yes." }
    })).toBeUndefined();
    expect(repository.getAssistantQuestion(oldConfirmationId)?.status).toBe("answered");
    expect(repository.loadNotificationInboxState().items.some((item) =>
      item.kind === "assistant-question-batch" && item.assistantId === assistant.id)).toBe(true);
  });

  test("assistant deletion atomically archives question notifications", () => {
    const repository = createRepository();
    const now = new Date().toISOString();
    const projectRoot = path.join(createTempDir(), `assistant-delete-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const historicalAssistantId = createAssistantId();
    const assistantId = createAssistantId();
    const questionId = createAssistantQuestionId();
    for (const [id, name] of [[historicalAssistantId, "Historical owner"], [assistantId, "Delete notifications"]] as const)
      repository.saveAssistant({ id, name, scope: "global", personalityPrompt: "Be exact.", jobPrompt: "Test deletion.",
        agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0,
        circuitBreakerState: "closed", unreadQuestionCount: 0, createdAt: now, updatedAt: now });
    const jobInput: BackgroundJob = { id: createBackgroundJobId(), projectId: project.id,
      assistantId: historicalAssistantId, automationThreadId: createThreadId(), kind: "ai-routine", name: "Reassigned job",
      status: "enabled", riskLevel: "safe", definition: { kind: "ai-routine", prompt: "Test deletion." },
      schedule: { type: "one-off", runAt: now, sourceText: "now" }, scheduleInput: "now", createdAt: now, updatedAt: now };
    const job = required(repository.saveBackgroundJob(jobInput).jobs[0], "saved background job");
    repository.createAgentRun(project.id, "linked work", "openai/gpt-5.4", job.automationThreadId);
    const linkedAgentRun = required(repository.getLatestThreadRun(project.id, job.automationThreadId), "linked agent run");
    repository.setAgentRunStatus(project.id, linkedAgentRun.id, "running-main");
    const backgroundRun = repository.createBackgroundJobRun({ jobId: job.id, projectId: project.id,
      assistantId: historicalAssistantId, automationThreadId: job.automationThreadId, triggerSource: "manual",
      status: "running", riskLevel: "safe", approvalStatus: "approved" });
    repository.setBackgroundJobRunStatus(backgroundRun.id, "running", { linkedAgentRunId: linkedAgentRun.id });
    repository.saveBackgroundJob({ ...job, assistantId, updatedAt: new Date(Date.parse(now) + 1).toISOString() });
    const corruptDb = new Database(repository.getDatabasePath(), { strict: true });
    corruptDb.query(`UPDATE background_job_runs SET agent_id = 'corrupt-agent' WHERE id = ?1`).run(backgroundRun.id);
    corruptDb.close(false);
    expect(repository.getBackgroundJobRun(backgroundRun.id)).toBeUndefined();
    repository.saveAssistantQuestion({ id: questionId, assistantId, prompt: "Still needed?", status: "pending", askedAt: now });
    repository.syncAssistantQuestionNotifications(assistantId);
    const hasActiveQuestion = () => repository.loadNotificationInboxState().items.some((item) =>
      item.kind === "assistant-question" && item.questionId === questionId && !item.archivedAt);
    expect(hasActiveQuestion()).toBe(true);
    const triggerDb = new Database(repository.getDatabasePath(), { strict: true });
    triggerDb.exec(`CREATE TRIGGER reject_assistant_notification_archive BEFORE UPDATE OF archived_at ON notifications
      BEGIN SELECT RAISE(ABORT, 'notification archive failed'); END;`);
    triggerDb.close(false);
    expect(() => repository.deleteAssistant(assistantId)).toThrow("notification archive failed");
    expect(repository.getAssistant(assistantId)?.id).toBe(assistantId);
    expect(repository.getRun(project.id, linkedAgentRun.id)?.status).toBe("running-main");
    expect(hasActiveQuestion()).toBe(true);
    const cleanupDb = new Database(repository.getDatabasePath(), { strict: true });
    cleanupDb.exec("DROP TRIGGER reject_assistant_notification_archive;");
    cleanupDb.close(false);
    const deleted = repository.deleteAssistant(assistantId);
    expect(deleted).toEqual({ deletedJobIds: [job.id], deletedRunIds: [backgroundRun.id],
      linkedAgentRuns: [{ projectId: project.id, runId: linkedAgentRun.id, threadId: linkedAgentRun.threadId }] });
    expect(repository.getAssistant(assistantId)).toBeUndefined();
    expect(repository.getRun(project.id, linkedAgentRun.id)?.status).toBe("stopped");
    expect(hasActiveQuestion()).toBe(false);
  });

});
