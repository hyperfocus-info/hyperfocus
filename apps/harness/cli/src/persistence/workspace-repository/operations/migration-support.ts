import type { BackgroundJobThreadKind, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";
import type { ProviderCredential } from "../../../provider-credential-store";
import type { ThreadRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceBackgroundReadsOperations2Set } from "./background-reads";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { ACTIVE_THREAD_STATUS, ANTHROPIC_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY } from "../contracts";
import { createFallbackPlanningChoices, normalizeThreadTitle, toGeneratedThreadTitle } from "../models";
import { createThreadId } from "@hyperfocus/ai-core/protocol";
import { debugLog } from "../../../logging";
import { normalizeThreadTitleSource } from "../persisted-values";

export function createWorkspaceMigrationSupportOperations(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet) {
  const { dbPath, providerCredentialStore, db } = context;
  function getWorkspaceMetaValue(key: string) {
      return db
        .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
        .get(key)?.value;
    }
  function setWorkspaceMetaValue(key: string, value: string) {
      db
        .query(
          `INSERT INTO workspace_meta (key, value)
           VALUES (?1, ?2)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(key, value);
    }
  function deleteWorkspaceMetaValue(key: string) {
      db.query(`DELETE FROM workspace_meta WHERE key = ?1`).run(key);
    }
  function migrateLegacyProviderApiKeys() {
      const legacyKeys: Array<{ provider: ProviderCredential; workspaceMetaKey: string }> = [
        { provider: "openai", workspaceMetaKey: OPENAI_API_KEY },
        { provider: "google", workspaceMetaKey: GOOGLE_API_KEY },
        { provider: "anthropic", workspaceMetaKey: ANTHROPIC_API_KEY }
      ];
      const legacyRows = db
        .query<{ key: string; value: string }, []>(
          `SELECT key, value FROM workspace_meta
           WHERE key IN ('openai_api_key', 'google_api_key', 'anthropic_api_key')`
        )
        .all();
      if (legacyRows.length === 0) {
        return;
      }
  
      for (const { provider, workspaceMetaKey } of legacyKeys) {
        const apiKey = legacyRows.find((row) => row.key === workspaceMetaKey)?.value.trim();
        if (apiKey) {
          providerCredentialStore.set(provider, apiKey);
        }
      }
  
      // secure_delete overwrites deleted cell content in the database pages;
      // truncating the WAL removes older page frames that could still contain a
      // key after the logical rows are gone.
      db.exec("PRAGMA secure_delete = ON;");
      const scrubLegacyRows = db.transaction(() => {
        for (const { workspaceMetaKey } of legacyKeys) {
          deleteWorkspaceMetaValue(workspaceMetaKey);
        }
      });
      scrubLegacyRows();
      if (dbPath !== ":memory:") {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      }
    }
  function resolveUniqueProjectName(baseName: string) {
      const existingNames = new Set(
        db
          .query<{ name: string }, []>(`SELECT name FROM projects`)
          .all()
          .map((row) => row.name)
      );
  
      if (!existingNames.has(baseName)) {
        return baseName;
      }
  
      let suffix = 2;
      while (existingNames.has(`${baseName} (${suffix})`)) {
        suffix += 1;
      }
  
      return `${baseName} (${suffix})`;
    }
  function getNextThreadNumber(projectId: ProjectId) {
      const count =
        db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM project_threads WHERE project_id = ?1`).get(projectId)
          ?.count ?? 0;
      return count + 1;
    }
  function insertThread(
      projectId: ProjectId,
      threadId: ThreadId,
      input: {
        kind?: BackgroundJobThreadKind;
        title: string;
        titleSource: "generated" | "custom";
        updatedAt: string;
        forkedFromThreadId?: ThreadId;
      }
    ) {
      db
        .query(
          `INSERT INTO project_threads (
            id, project_id, status, pinned, kind, title, title_source, updated_at, forked_from_thread_id,
            memory_summary_content, memory_summary_updated_at, created_at, archived_at
          ) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?7, NULL)`
        )
        .run(
          threadId,
          projectId,
          ACTIVE_THREAD_STATUS,
          input.kind ?? "user",
          input.title,
          input.titleSource,
          input.updatedAt,
          input.forkedFromThreadId ?? null
        );
    }
  function setActiveThread(projectId: ProjectId, threadId: ThreadId, now: string) {
      db
        .query(
          `UPDATE projects
           SET active_thread_id = ?2, updated_at = ?3, last_opened_at = ?3
           WHERE id = ?1`
        )
        .run(projectId, threadId, now);
    }
  function touchProject(projectId: ProjectId, now: string) {
      db
        .query(
          `UPDATE projects
           SET updated_at = ?2, last_opened_at = ?2
           WHERE id = ?1`
        )
        .run(projectId, now);
    }
  function touchAssistant(assistantId: string, now: string = new Date().toISOString()) {
      db.query(`UPDATE assistants SET updated_at = ?2, latest_activity_at = ?2, mutation_revision = mutation_revision + 1 WHERE id = ?1`).run(assistantId, now);
    }
  function touchAssistantTodos(assistantId: string, now: string) {
      db.query(`UPDATE assistants SET updated_at = ?2, latest_activity_at = ?2, todo_revision = todo_revision + 1, mutation_revision = mutation_revision + 1 WHERE id = ?1`).run(assistantId, now);
    }
  function runAssistantTodoMutation<T>(assistantId: string, now: string, operation: () => T extends PromiseLike<unknown> ? never : T) {
      return db.transaction(() => {
        operations.assertAssistantExists(assistantId);
        const result = operation();
        touchAssistantTodos(assistantId, now);
        return result;
      }).immediate();
    }
  return {
    operations: {
      getWorkspaceMetaValue,
      setWorkspaceMetaValue,
      deleteWorkspaceMetaValue,
      migrateLegacyProviderApiKeys,
      resolveUniqueProjectName,
      getNextThreadNumber,
      insertThread,
      setActiveThread,
      touchProject,
      touchAssistant,
      touchAssistantTodos,
      runAssistantTodoMutation,
    },
    publicApi: {
    },
  };
}

export type WorkspaceMigrationSupportOperationsSet = ReturnType<typeof createWorkspaceMigrationSupportOperations>["operations"];

export function createWorkspaceMigrationSupportOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceMigrationSupportOperationsSet) {
  const { allowDevThreadRecovery, db } = context;
  function ensureProjectHasUsableThread(projectId: ProjectId, now: string) {
      const fallbackThread = db
        .query<{ id: string }, [string]>(
          `SELECT id
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1`
        )
        .get(projectId);
  
      if (fallbackThread) {
        operations.setActiveThread(projectId, fallbackThread.id, now);
        return;
      }
  
      const threadId = createThreadId();
      operations.insertThread(projectId, threadId, {
        title: "Thread 1",
        titleSource: "generated",
        updatedAt: now
      });
      operations.setActiveThread(projectId, threadId, now);
    }
  function deleteThreadForRecovery(projectId: ProjectId, threadId: ThreadId, cause: unknown) {
      const now = new Date().toISOString();
      const message = cause instanceof Error ? cause.message : String(cause);
      debugLog("workspace.thread-recovery.delete", {
        projectId,
        threadId,
        reason: message
      });
  
      const tx = db.transaction(() => {
        db.query(`DELETE FROM project_threads WHERE id = ?1 AND project_id = ?2`).run(threadId, projectId);
        ensureProjectHasUsableThread(projectId, now);
      });
      tx();
    }
  function backfillActiveThreadIds() {
      const projects = db.query<{ id: string; active_thread_id: string | null }, []>(`SELECT id, active_thread_id FROM projects`).all();
      for (const project of projects) {
        if (project.active_thread_id) {
          continue;
        }
  
        const threadId = db
          .query<{ id: string }, [string]>(
            `SELECT id
             FROM project_threads
             WHERE project_id = ?1
             ORDER BY created_at ASC
             LIMIT 1`
          )
          .get(project.id)?.id;
  
        if (threadId) {
          db.query(`UPDATE projects SET active_thread_id = ?2 WHERE id = ?1`).run(project.id, threadId);
        }
      }
    }
  function backfillThreadMetadata() {
      const projectIds = db.query<{ id: string }, []>(`SELECT id FROM projects`).all().map((project) => project.id);
  
      for (const projectId of projectIds) {
        const threads = db
          .query<ThreadRow, [string]>(
            `SELECT
              id, project_id, status, pinned, kind, title, title_source, updated_at, forked_from_thread_id,
              memory_summary_content, memory_summary_updated_at, created_at, archived_at
             FROM project_threads
             WHERE project_id = ?1
             ORDER BY created_at ASC`
          )
          .all(projectId);
  
        threads.forEach((thread, index) => {
          try {
            const firstUserMessage = db
              .query<{ content: string }, [string]>(
                `SELECT content FROM thread_messages WHERE thread_id = ?1 AND role = 'user' ORDER BY created_at ASC LIMIT 1`
              )
              .get(thread.id)?.content;
            const latestMessageAt = db
              .query<{ created_at: string }, [string]>(
                `SELECT created_at FROM thread_messages WHERE thread_id = ?1 ORDER BY created_at DESC LIMIT 1`
              )
              .get(thread.id)?.created_at;
  
            db
              .query(
                `UPDATE project_threads
                 SET title = ?2, title_source = ?3, updated_at = ?4
                 WHERE id = ?1`
              )
              .run(
                thread.id,
                normalizeThreadTitle(thread.title ?? toGeneratedThreadTitle(firstUserMessage, `Thread ${index + 1}`)),
                normalizeThreadTitleSource(thread.title_source),
                thread.updated_at ?? latestMessageAt ?? thread.created_at
              );
          } catch (error) {
            if (!allowDevThreadRecovery) {
              throw error;
            }
  
            deleteThreadForRecovery(projectId, thread.id, error);
          }
        });
      }
    }
  function backfillQuestionChoices() {
      const rows = db
        .query<{ id: string; placeholder: string | null; response_kind: string; choices_json: string | null }, []>(
          `SELECT id, placeholder, response_kind, choices_json FROM agent_run_questions`
        )
        .all();
  
      for (const row of rows) {
        if (row.choices_json || row.response_kind === "freeform") {
          continue;
        }
  
        db
          .query(`UPDATE agent_run_questions SET choices_json = ?2 WHERE id = ?1`)
          .run(row.id, JSON.stringify(createFallbackPlanningChoices(row.placeholder ?? "Provide answer")));
      }
    }
  return {
    operations: {
      ensureProjectHasUsableThread,
      deleteThreadForRecovery,
      backfillActiveThreadIds,
      backfillThreadMetadata,
      backfillQuestionChoices,
    },
    publicApi: {
    },
  };
}

export type WorkspaceMigrationSupportOperations2Set = ReturnType<typeof createWorkspaceMigrationSupportOperations2>["operations"];

export function createWorkspaceMigrationSupportOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceBackgroundReadsOperations2Set) {
  const { db } = context;
  function rebuildAgentRunQuestionsTableIfNeeded() {
      const createSql = operations.readTableCreateSql("agent_run_questions");
      if (createSql.includes("'deferred'")) {
        return;
      }
  
      db.exec(`
        ALTER TABLE agent_run_questions RENAME TO agent_run_questions_legacy;
        CREATE TABLE agent_run_questions (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          logical_question_id TEXT NULL,
          planner_turn_id TEXT NULL,
          prompt_hash TEXT NULL,
          prompt TEXT NOT NULL,
          placeholder TEXT NULL,
          response_kind TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform')),
          choices_json TEXT NULL,
          intent_json TEXT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered')),
          answer_text TEXT NULL,
          asked_at TEXT NOT NULL,
          answered_at TEXT NULL,
          FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );
        INSERT INTO agent_run_questions (
          id, run_id, ordinal, logical_question_id, planner_turn_id, prompt_hash, prompt, placeholder, response_kind, choices_json, intent_json, status, answer_text, asked_at, answered_at
        )
        SELECT
          id, run_id, ordinal, id, NULL, NULL, prompt, placeholder, 'choice', choices_json, NULL, status, answer_text, asked_at, answered_at
        FROM agent_run_questions_legacy;
        DROP TABLE agent_run_questions_legacy;
        CREATE INDEX IF NOT EXISTS agent_run_questions_run_ordinal_idx
        ON agent_run_questions(run_id, ordinal ASC);
        CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx
        ON agent_run_questions(run_id, planner_turn_id, logical_question_id);
        CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx
        ON agent_run_questions(run_id, planner_turn_id, prompt_hash);
      `);
    }
  function rebuildThreadMessagesTableIfNeeded() {
      const createSql = operations.readTableCreateSql("thread_messages");
      if (createSql.includes("'run-milestones'")) {
        return;
      }
  
      db.exec(`
        ALTER TABLE thread_messages RENAME TO thread_messages_legacy;
        CREATE TABLE thread_messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
          kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
          content TEXT NOT NULL,
          attachments_json TEXT NULL,
          metadata_json TEXT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
        );
        INSERT INTO thread_messages (
          id, thread_id, role, kind, content, attachments_json, metadata_json, created_at
        )
        SELECT
          id, thread_id, role, COALESCE(kind, 'plain'), content, attachments_json, metadata_json, created_at
        FROM thread_messages_legacy;
        DROP TABLE thread_messages_legacy;
        CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
        ON thread_messages(thread_id, created_at);
      `);
    }
  function rebuildAssistantQuestionsTableIfNeeded() {
      const createSql = operations.readTableCreateSql("assistant_questions");
      if (createSql.includes("'deferred'")) {
        return;
      }
  
      db.exec(`
        ALTER TABLE assistant_questions RENAME TO assistant_questions_legacy;
        CREATE TABLE assistant_questions (
          id TEXT PRIMARY KEY,
          assistant_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered', 'dismissed')),
          answer_text TEXT NULL,
          linked_todo_ids_json TEXT NULL,
          asked_at TEXT NOT NULL,
          answered_at TEXT NULL,
          FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
        );
        INSERT INTO assistant_questions (
          id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
        )
        SELECT
          id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
        FROM assistant_questions_legacy;
        DROP TABLE assistant_questions_legacy;
        CREATE INDEX IF NOT EXISTS assistant_questions_assistant_status_idx
        ON assistant_questions(assistant_id, status, asked_at DESC);
      `);
    }
  return {
    operations: {
      rebuildAgentRunQuestionsTableIfNeeded,
      rebuildThreadMessagesTableIfNeeded,
      rebuildAssistantQuestionsTableIfNeeded,
    },
    publicApi: {
    },
  };
}

export type WorkspaceMigrationSupportOperations4Set = ReturnType<typeof createWorkspaceMigrationSupportOperations4>["operations"];
