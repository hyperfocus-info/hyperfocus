import * as assistantPagination from "../../../assistant-pagination";
import type { Assistant, AssistantAssetRef, AssistantLearning, AssistantLogEntry, AssistantQuestion, AssistantsState, AssistantTodo, ChatMessageKind, ChatMessageMetadata, ChatRole, ProjectId } from "@hyperfocus/ai-core/protocol";
import type { AssistantBootstrapTransitionWrite, AssistantStaleBootstrapRecoveryWrite } from "../../assistant-persistence";
import type { BackgroundJobRow, BackgroundJobRunRow, WorkspaceRepositoryContext } from "../contracts";
import type { WorkspaceAssistantReadsOperations2Set, WorkspaceAssistantReadsOperations3Set, WorkspaceAssistantReadsOperations4Set, WorkspaceAssistantReadsOperationsSet } from "./assistant-reads";
import type { WorkspaceAssistantsOperations2Set, WorkspaceAssistantsOperations4Set, WorkspaceAssistantsOperations5Set, WorkspaceAssistantsOperations6Set, WorkspaceAssistantsOperations7Set } from "./assistants-1";
import type { WorkspaceBackgroundReadsOperationsSet } from "./background-reads";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectReadsOperationsSet } from "./project-reads";
import type { WorkspaceRepository } from "../../../workspace-repository";
import type { WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import type { WorkspaceSettingsOperations3Set } from "./settings";
import { ASSISTANT_COMPLETED_TODO_RETENTION_MS } from "../contracts";
import { appendAssistantMessageAfterLatest, createAssistantSummaryState } from "../../assistant-runtime-atomicity";
import { assertResolvedAssistantAssetRefs, resolveAssistantAssetRefs } from "../../../assistant-capabilities";
import { assistantsStateSchema, createAssistantThreadId, createSessionId } from "@hyperfocus/ai-core/protocol";
import { compileAssistantIntentContract } from "@hyperfocus/ai-core/intent-contract";
import { startAssistantBootstrapAttempt as persistAssistantBootstrapAttemptStart, persistAssistantBootstrapTransition, failCurrentAssistantBootstrapAttempt as persistFailedAssistantBootstrapAttempt, recoverStaleAssistantBootstrap as persistStaleAssistantBootstrapRecovery } from "../../assistant-persistence";
import { syncAssistantQuestionNotificationsRaw } from "../../notification-persistence";

export function createWorkspaceAssistantsOperations8(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantReadsOperationsSet & WorkspaceAssistantReadsOperations2Set & WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceAssistantReadsOperations4Set & WorkspaceRepositoryReadsOperationsSet & WorkspaceAssistantsOperations4Set & WorkspaceMigrationSupportOperationsSet & WorkspaceAssistantsOperations7Set) {
  const { db } = context;
  function appendAssistantMessage(
      assistantId: string,
      role: ChatRole,
      content: string,
      options: {
        kind?: ChatMessageKind;
        metadata?: ChatMessageMetadata;
        id?: string;
        createdAt?: string;
      } = {}
    ) {
      return db.transaction(() => operations.appendAssistantMessageRaw(assistantId, role, content, options)).immediate();
    }
  function appendAssistantMessageIfLatest(
      assistantId: string,
      expectedLatestMessageId: string,
      role: ChatRole,
      content: string,
      options: { kind?: ChatMessageKind; metadata?: ChatMessageMetadata; id?: string; createdAt?: string } = {}
    ) {
      return appendAssistantMessageAfterLatest({ db: db, assistantId, expectedLatestMessageId, role, content, options,
        assertExists: () => operations.assertAssistantExists(assistantId), readThreadId: () => operations.readAssistantThreadRowByAssistantId(assistantId).id,
        append: () => operations.appendAssistantMessageRaw(assistantId, role, content, options) });
    }
  function setAssistantThreadMemorySummary(assistantId: string, content: string | undefined) {
      operations.assertAssistantExists(assistantId);
      const thread = operations.readAssistantThreadRowByAssistantId(assistantId);
      const now = new Date().toISOString();
      db
        .query(
          `UPDATE assistant_threads
           SET memory_summary_content = ?2, memory_summary_updated_at = ?3, updated_at = ?3
           WHERE id = ?1`
        )
        .run(thread.id, content?.trim() || null, content?.trim() ? now : null);
      operations.touchAssistant(assistantId, now);
      return operations.getAssistantThread(assistantId)!;
    }
  function pruneCompletedAssistantTodos(now: Date = new Date()) {
      const cutoff = new Date(now.getTime() - ASSISTANT_COMPLETED_TODO_RETENTION_MS).toISOString();
      const activityAt = now.toISOString();
      db.transaction(() => {
        const owners = db.query<{ assistant_id: string }, [string]>(
          `SELECT DISTINCT assistant_id FROM assistant_todos
           WHERE state = 'completed' AND completed_at IS NOT NULL AND completed_at < ?1`
        ).all(cutoff);
        if (owners.length === 0) return;
        db.query(
          `DELETE FROM assistant_todos
           WHERE state = 'completed'
             AND completed_at IS NOT NULL
             AND completed_at < ?1`
        ).run(cutoff);
        for (const { assistant_id: assistantId } of owners) operations.touchAssistantTodos(assistantId, activityAt);
      }).immediate();
    }
  function loadAssistantsState(): AssistantsState {
      pruneCompletedAssistantTodos();
      const assistants = operations.readAssistants(512); const included = new Set(assistants.map((assistant) => assistant.id));
      return assistantsStateSchema.parse({
        assistants, threads: operations.readAssistantThreads(512).filter((item) => included.has(item.assistantId)),
        todos: operations.readAssistantTodos({ limit: 8192 }).filter((item) => included.has(item.assistantId)),
        learnings: operations.readAssistantLearnings({ limit: 8192 }).filter((item) => included.has(item.assistantId)), questions: operations.readAssistantQuestions({ limit: 4096 }).filter((item) => included.has(item.assistantId)), logs: operations.readAssistantLogEntries({ limit: 16384 }).filter((item) => included.has(item.assistantId)),
        assetRefs: operations.readAssistantAssetRefs({ limit: 4096 }).filter((item) => included.has(item.assistantId))
      });
    }
  function loadAssistantSummaryState(limit = 512): AssistantsState {
      pruneCompletedAssistantTodos(); const page = operations.listAssistantSummaries({ limit });
      return { ...createAssistantSummaryState(() => undefined, () => page.items), assistantsNextCursor: page.nextCursor };
    }
  return {
    operations: {
      appendAssistantMessage,
      appendAssistantMessageIfLatest,
      setAssistantThreadMemorySummary,
      pruneCompletedAssistantTodos,
      loadAssistantsState,
      loadAssistantSummaryState,
    },
    publicApi: {
      appendAssistantMessage,
      appendAssistantMessageIfLatest,
      setAssistantThreadMemorySummary,
      pruneCompletedAssistantTodos,
      loadAssistantsState,
      loadAssistantSummaryState,
    },
  };
}

export type WorkspaceAssistantsOperations8Set = ReturnType<typeof createWorkspaceAssistantsOperations8>["operations"];

export function createWorkspaceAssistantsOperations9(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceAssistantsOperations5Set & WorkspaceAssistantsOperations6Set & WorkspaceAssistantsOperations7Set & WorkspaceSettingsOperations3Set) {
  const { db } = context;
  function assistantBootstrapPersistence() { return { getAssistant: (id: string, includeDeleted?: boolean) =>
      operations.getAssistant(id, includeDeleted), isGloballyPaused: () => operations.getGlobalExecutionPaused(),
      setBootstrapState: (id: string, state: Assistant["bootstrapState"], input: Parameters<WorkspaceRepository["setAssistantBootstrapState"]>[2]) => operations.setAssistantBootstrapState(id, state, input),
      saveLearningDeduped: (learning: AssistantLearning) => operations.saveAssistantLearningDeduped(learning),
      saveTodo: (todo: AssistantTodo) => operations.saveAssistantTodo(todo), saveQuestion: (question: AssistantQuestion) =>
        operations.saveAssistantQuestion(question), appendLog: (entry: AssistantLogEntry) => operations.appendAssistantLogEntry(entry), syncQuestionNotifications: (id: string) =>
        syncAssistantQuestionNotificationsRaw(db, id, (row) => operations.hydrateAssistantQuestion(row)) }; }
  function startAssistantBootstrapAttempt(assistantId: string, attemptId: string, startedAt: string, logEntry: AssistantLogEntry) {
      return persistAssistantBootstrapAttemptStart(db, assistantId, attemptId, startedAt, logEntry,
        assistantBootstrapPersistence()); }
  function applyAssistantBootstrapTransition(input: AssistantBootstrapTransitionWrite) { return persistAssistantBootstrapTransition(
      db, input, assistantBootstrapPersistence()); }
  function failCurrentAssistantBootstrapAttempt(assistantId: string, attemptId: string, finishedAt: string, logEntry: AssistantLogEntry) {
      return persistFailedAssistantBootstrapAttempt(db, assistantId, attemptId, finishedAt, logEntry,
        assistantBootstrapPersistence()); }
  function recoverStaleAssistantBootstrap(input: AssistantStaleBootstrapRecoveryWrite) { return persistStaleAssistantBootstrapRecovery(db, input, assistantBootstrapPersistence()); }
  return {
    operations: {
      assistantBootstrapPersistence,
      startAssistantBootstrapAttempt,
      applyAssistantBootstrapTransition,
      failCurrentAssistantBootstrapAttempt,
      recoverStaleAssistantBootstrap,
    },
    publicApi: {
      startAssistantBootstrapAttempt,
      applyAssistantBootstrapTransition,
      failCurrentAssistantBootstrapAttempt,
      recoverStaleAssistantBootstrap,
    },
  };
}

export type WorkspaceAssistantsOperations9Set = ReturnType<typeof createWorkspaceAssistantsOperations9>["operations"];

export function createWorkspaceAssistantsOperations10(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceRepositoryReadsOperationsSet & WorkspaceAssistantsOperations5Set & WorkspaceAssistantsOperations6Set & WorkspaceBackgroundReadsOperationsSet) {
  const { repoRoot, db } = context;
  function listAssistantBackgroundJobs(input: { assistantId: string; cursor?: string; limit?: number }) { operations.assertAssistantExists(input.assistantId); return assistantPagination.listAssistantBackgroundJobsPage(db, input, (row: BackgroundJobRow) => operations.hydrateBackgroundJob(row)); }
  function listAssistantBackgroundJobRuns(input: { assistantId: string; cursor?: string; limit?: number }) { operations.assertAssistantExists(input.assistantId); return assistantPagination.listAssistantBackgroundJobRunsPage(db, input, (row: BackgroundJobRunRow) => operations.hydrateBackgroundJobRun(row, false)); }
  function saveAssistant(assistant: Assistant, assetRefs: AssistantAssetRef[] = []) {
      if (assistant.scope === "project" && assistant.projectId) {
        operations.assertProjectExists(assistant.projectId);
      }
  
      const assistantToSave: Assistant = {
        ...assistant,
        intentContract: compileAssistantIntentContract(assistant)
      };
      const resolvedAssetRefs = resolveAssistantAssetRefs({
        repoRoot: repoRoot,
        assistant: assistantToSave,
        assetRefs,
        workspaceModes: operations.readWorkspaceModes(),
        projectModes: assistant.projectId ? operations.readProjectModes(assistant.projectId) : [],
        backgroundTemplates: operations.readBackgroundJobTemplates()
      });
      assertResolvedAssistantAssetRefs(resolvedAssetRefs);
  
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        db
          .query(
            `INSERT INTO assistants (
              id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id, mode_id,
              intent_contract_json, provider_brand, execution_model_id, reasoning_strength, fast_mode, run_state, bootstrap_state,
              bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at, cloned_from_assistant_id, failure_streak_count,
              circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason, pending_reprioritize_requested_at,
              deleted_at, latest_activity_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, NULL, NULL, ?24, ?25, ?26, ?27)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              scope = excluded.scope,
              project_id = excluded.project_id,
              description = excluded.description,
              personality_prompt = excluded.personality_prompt,
              job_prompt = excluded.job_prompt,
              intent_contract_json = excluded.intent_contract_json,
              agent_id = excluded.agent_id,
              mode_id = excluded.mode_id,
              provider_brand = excluded.provider_brand,
              execution_model_id = excluded.execution_model_id,
              reasoning_strength = excluded.reasoning_strength,
              fast_mode = excluded.fast_mode,
              run_state = excluded.run_state,
              bootstrap_state = excluded.bootstrap_state,
              bootstrap_attempt_id = excluded.bootstrap_attempt_id,
              bootstrap_started_at = excluded.bootstrap_started_at,
              bootstrap_finished_at = excluded.bootstrap_finished_at,
              cloned_from_assistant_id = excluded.cloned_from_assistant_id,
              failure_streak_count = excluded.failure_streak_count,
              circuit_breaker_state = excluded.circuit_breaker_state,
              circuit_breaker_reason = excluded.circuit_breaker_reason,
              deleted_at = excluded.deleted_at,
              latest_activity_at = excluded.latest_activity_at,
              updated_at = excluded.updated_at, mutation_revision = assistants.mutation_revision + 1`
          )
          .run(
            assistantToSave.id,
            assistantToSave.name,
            assistantToSave.scope,
            assistantToSave.projectId ?? null,
            assistantToSave.description ?? null,
            assistantToSave.personalityPrompt,
            assistantToSave.jobPrompt,
            assistantToSave.agentId,
            assistantToSave.modeId ?? null,
            JSON.stringify(assistantToSave.intentContract),
            assistantToSave.providerBrand ?? null,
            assistantToSave.executionModelId ?? null,
            assistantToSave.reasoningStrength ?? null,
            assistantToSave.fastMode === undefined ? null : assistantToSave.fastMode ? 1 : 0,
            assistantToSave.runState,
            assistantToSave.bootstrapState,
            assistantToSave.bootstrapAttemptId ?? null,
            assistantToSave.bootstrapStartedAt ?? null,
            assistantToSave.bootstrapFinishedAt ?? null,
            assistantToSave.clonedFromAssistantId ?? null,
            assistantToSave.failureStreakCount,
            assistantToSave.circuitBreakerState,
            assistantToSave.circuitBreakerReason ?? null,
            assistantToSave.deletedAt ?? null,
            assistantToSave.latestActivityAt ?? now,
            assistantToSave.createdAt,
            now
          );
  
        const existingThread = db
          .query<{ id: string }, [string]>(`SELECT id FROM assistant_threads WHERE assistant_id = ?1`)
          .get(assistant.id);
        if (!existingThread) {
          db
            .query(
              `INSERT INTO assistant_threads (
                id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
              ) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?4)`
            )
            .run(createAssistantThreadId(), assistant.id, createSessionId(), now);
        }
  
        db.query(`DELETE FROM assistant_asset_refs WHERE assistant_id = ?1`).run(assistant.id);
        for (const assetRef of resolvedAssetRefs) {
          db
            .query(
              `INSERT INTO assistant_asset_refs (
                id, assistant_id, kind, label, value, canonical_value, scope, provenance, resolution_status, resolution_error, created_at
              ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
            )
            .run(
              assetRef.id,
              assistant.id,
              assetRef.kind,
              assetRef.label,
              assetRef.value,
              assetRef.canonicalValue ?? null,
              assetRef.scope ?? null,
              assetRef.provenance ?? null,
              assetRef.resolutionStatus,
              assetRef.resolutionError ?? null,
              assetRef.createdAt
            );
        }
      });
      tx();
  
      return operations.getAssistant(assistant.id)!;
    }
  function assertAssistantAssetRefsResolved(assistantId: string) {
      const assistant = operations.getAssistant(assistantId);
      if (!assistant) {
        throw new Error(`Unknown assistant: ${assistantId}`);
      }
  
      const resolvedAssetRefs = resolveAssistantAssetRefs({
        repoRoot: repoRoot,
        assistant,
        assetRefs: operations.getAssistantAssetRefs(assistantId),
        workspaceModes: operations.readWorkspaceModes(),
        projectModes: assistant.projectId ? operations.readProjectModes(assistant.projectId) : [],
        backgroundTemplates: operations.readBackgroundJobTemplates()
      });
      assertResolvedAssistantAssetRefs(resolvedAssetRefs);
      return resolvedAssetRefs;
    }
  function cloneAssistantToProject(assistantId: string, projectId: ProjectId, cloneAssistant: Assistant, assetRefs: AssistantAssetRef[] = []) {
      operations.assertAssistantExists(assistantId);
      operations.assertProjectExists(projectId);
      const sourceLearnings = operations.readAssistantLearningsByAssistantId(assistantId).slice(0, 12);
      const savedAssistant = saveAssistant(cloneAssistant, assetRefs);
      if (sourceLearnings.length > 0) {
        operations.saveAssistantLearning({
          id: crypto.randomUUID(),
          assistantId: savedAssistant.id,
          summary: `Cloned learnings: ${sourceLearnings.map((entry) => entry.summary).join(" | ").slice(0, 3800)}`,
          source: `clone:${assistantId}`,
          confidence: "medium",
          createdAt: new Date().toISOString()
        });
      }
      return savedAssistant;
    }
  return {
    operations: {
      listAssistantBackgroundJobs,
      listAssistantBackgroundJobRuns,
      saveAssistant,
      assertAssistantAssetRefsResolved,
      cloneAssistantToProject,
    },
    publicApi: {
      listAssistantBackgroundJobs,
      listAssistantBackgroundJobRuns,
      saveAssistant,
      assertAssistantAssetRefsResolved,
      cloneAssistantToProject,
    },
  };
}

export type WorkspaceAssistantsOperations10Set = ReturnType<typeof createWorkspaceAssistantsOperations10>["operations"];
