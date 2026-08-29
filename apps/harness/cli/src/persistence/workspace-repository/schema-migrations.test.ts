import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantTodoId,
  createBackgroundJobId,
  createThreadId,
} from "@hyperfocus/ai-core/protocol";
import { createWorkspaceRepository } from "../../workspace-repository";
import { resolveHarnessTestTempRoot } from "../../test-support/test-temp-root";
import {
  ASSISTANT_PROVIDER_BRAND_MIGRATION_ID,
  BACKGROUND_RUN_HISTORY_MIGRATION_ID,
} from "./schema-migrations";

function createTempPath() {
  const root = resolveHarnessTestTempRoot();
  mkdirSync(root, { recursive: true });
  return path.join(root, `workspace-schema-migration-${crypto.randomUUID()}.sqlite`);
}

function readCreateSql(db: Database, tableName: string) {
  return db.query<{ sql: string }, [string]>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1"
  ).get(tableName)!.sql;
}

function installLegacyConstraints(dbPath: string) {
  const db = new Database(dbPath, { strict: true });
  const currentRunsSql = readCreateSql(db, "background_job_runs");
  const legacyRunsSql = currentRunsSql
    .replace("'awaiting-user-input', ", "")
    .replace("'partial-complete', ", "");
  const currentAssistantsSql = readCreateSql(db, "assistants");
  const legacyAssistantsSql = currentAssistantsSql.replace(", 'claude'", "");

  db.exec("PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;");
  db.transaction(() => {
    db.exec("ALTER TABLE background_job_runs RENAME TO background_job_runs_current;");
    db.exec(legacyRunsSql);
    db.exec("INSERT INTO background_job_runs SELECT * FROM background_job_runs_current;");
    db.exec("DROP TABLE background_job_runs_current;");

    db.exec("ALTER TABLE assistants RENAME TO assistants_current;");
    db.exec(legacyAssistantsSql);
    db.exec("INSERT INTO assistants SELECT * FROM assistants_current;");
    db.exec("DROP TABLE assistants_current;");

    db.query("DELETE FROM repository_migrations WHERE id IN (?1, ?2)")
      .run(BACKGROUND_RUN_HISTORY_MIGRATION_ID, ASSISTANT_PROVIDER_BRAND_MIGRATION_ID);
  }).immediate();
  db.exec("PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;");
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  db.close(false);
}

function createLegacyPopulatedFixture() {
  const dbPath = createTempPath();
  const repository = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
  const projectRoot = path.join(resolveHarnessTestTempRoot(), `migration-project-${crypto.randomUUID()}`);
  mkdirSync(projectRoot, { recursive: true });
  const project = repository.addProject(projectRoot);
  const now = new Date().toISOString();
  const assistantId = createAssistantId();
  const todoId = createAssistantTodoId();
  repository.saveAssistant({
    id: assistantId,
    name: "Legacy assistant",
    scope: "project",
    projectId: project.id,
    personalityPrompt: "Preserve durable state.",
    jobPrompt: "Keep migration evidence.",
    agentId: "pi",
    providerBrand: "gpt",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  repository.saveAssistantTodo({
    id: todoId,
    assistantId,
    title: "Keep me",
    state: "pending",
    sortOrder: 0,
    workKind: "documentation",
    source: "assistant",
    createdAt: now,
    updatedAt: now,
  });
  const job = repository.saveBackgroundJob({
    id: createBackgroundJobId(),
    projectId: project.id,
    assistantId,
    automationThreadId: createThreadId(),
    kind: "ai-routine",
    name: "Legacy populated job",
    status: "enabled",
    riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: "Preserve history." },
    schedule: { type: "one-off", runAt: now, sourceText: "now" },
    scheduleInput: "now",
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  }).jobs[0]!;
  const run = repository.createBackgroundJobRun({
    jobId: job.id,
    projectId: project.id,
    assistantId,
    automationThreadId: job.automationThreadId,
    triggerSource: "manual",
    status: "running",
    riskLevel: "safe",
    approvalStatus: "approved",
  });
  repository.appendBackgroundJobRunEvent(run.id, "execution", "Durable event", "event detail");
  repository.saveNotification({
    id: `background-run:${run.id}`,
    kind: "background-run-status",
    interactive: false,
    projectId: project.id,
    threadId: project.activeThreadId,
    backgroundRunId: run.id,
    jobId: job.id,
    title: "Legacy run",
    summary: "Still running",
    severity: "info",
    createdAt: now,
  });
  repository.close();
  installLegacyConstraints(dbPath);
  return { assistantId, dbPath, runId: run.id, todoId };
}

function expectLegacyRowsIntact(dbPath: string) {
  const db = new Database(dbPath, { readonly: true, strict: true });
  expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM background_job_runs").get()?.count).toBe(1);
  expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM background_job_run_events").get()?.count).toBe(1);
  expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM notifications").get()?.count).toBe(1);
  expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM assistant_todos").get()?.count).toBe(1);
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  db.close(false);
}

function expectMigrationState(dbPath: string, migrationId: string, applied: boolean) {
  const db = new Database(dbPath, { readonly: true, strict: true });
  const count = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM repository_migrations WHERE id = ?1"
  ).get(migrationId)?.count ?? 0;
  expect(count).toBe(applied ? 1 : 0);
  db.close(false);
}

describe("workspace schema migrations", () => {
  test("preserves populated background history and widens stale assistant provider constraints", () => {
    const fixture = createLegacyPopulatedFixture();
    const repository = createWorkspaceRepository(fixture.dbPath, process.cwd(), { durability: "test-fast" });

    expect(repository.getBackgroundJobRun(fixture.runId)?.events).toContainEqual(expect.objectContaining({
      message: "Durable event",
      detail: "event detail",
    }));
    expect(repository.loadNotificationInboxState().items).toContainEqual(expect.objectContaining({
      id: `background-run:${fixture.runId}`,
    }));
    expect(repository.getAssistantTodos(fixture.assistantId)).toContainEqual(expect.objectContaining({ id: fixture.todoId }));
    const now = new Date().toISOString();
    expect(() => repository.saveAssistant({
      id: createAssistantId(),
      name: "Claude assistant",
      scope: "global",
      personalityPrompt: "Use Claude.",
      jobPrompt: "Validate the migrated constraint.",
      agentId: "pi",
      providerBrand: "claude",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now,
    })).not.toThrow();
    repository.close();
    expectLegacyRowsIntact(fixture.dbPath);
  });

  test("rolls back a failed background-history migration and completes it on reopen", () => {
    const fixture = createLegacyPopulatedFixture();
    expect(() => createWorkspaceRepository(fixture.dbPath, process.cwd(), {
      durability: "test-fast",
      instrumentation: {
        onBeforePersistenceMigrationCommit(migrationId) {
          if (migrationId === BACKGROUND_RUN_HISTORY_MIGRATION_ID) throw new Error("injected background migration failure");
        },
      },
    })).toThrow("injected background migration failure");
    expectLegacyRowsIntact(fixture.dbPath);
    expectMigrationState(fixture.dbPath, BACKGROUND_RUN_HISTORY_MIGRATION_ID, false);

    const reopened = createWorkspaceRepository(fixture.dbPath, process.cwd(), { durability: "test-fast" });
    expect(reopened.getBackgroundJobRun(fixture.runId)?.events).toHaveLength(1);
    reopened.close();
    expectLegacyRowsIntact(fixture.dbPath);
    expectMigrationState(fixture.dbPath, BACKGROUND_RUN_HISTORY_MIGRATION_ID, true);
  });

  test("rolls back a failed assistant migration and completes it on reopen", () => {
    const fixture = createLegacyPopulatedFixture();
    expect(() => createWorkspaceRepository(fixture.dbPath, process.cwd(), {
      durability: "test-fast",
      instrumentation: {
        onBeforePersistenceMigrationCommit(migrationId) {
          if (migrationId === ASSISTANT_PROVIDER_BRAND_MIGRATION_ID) throw new Error("injected assistant migration failure");
        },
      },
    })).toThrow("injected assistant migration failure");
    expectLegacyRowsIntact(fixture.dbPath);
    expectMigrationState(fixture.dbPath, ASSISTANT_PROVIDER_BRAND_MIGRATION_ID, false);

    const reopened = createWorkspaceRepository(fixture.dbPath, process.cwd(), { durability: "test-fast" });
    expect(reopened.getAssistantTodos(fixture.assistantId)).toContainEqual(expect.objectContaining({ id: fixture.todoId }));
    reopened.close();
    expectLegacyRowsIntact(fixture.dbPath);
    expectMigrationState(fixture.dbPath, ASSISTANT_PROVIDER_BRAND_MIGRATION_ID, true);
  });
});
