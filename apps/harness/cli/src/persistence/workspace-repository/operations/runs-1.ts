import type { AgentRunExperimentRow, ChatAttachmentUploadRow, WorkspaceRepositoryContext } from "../contracts";
import type { AgentRunState, AgentRunStatus, ChatAttachment, ChatMessageKind, ChatMessageMetadata, ChatRole, ExecutionPlan, PlannerReadyTurn, PlanningQuestion, ProjectId, QuestionId, RunFailureCategory, SubagentTaskState, ThreadId, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import type { TerminalRunTransitionInput } from "../../run/terminal-run-transition";
import type { WorkspaceBackgroundReadsOperations2Set } from "./background-reads";
import type { WorkspaceMigrationSupportOperationsSet } from "./migration-support";
import type { WorkspaceProjectReadsOperations3Set, WorkspaceProjectReadsOperationsSet } from "./project-reads";
import type { WorkspaceRepositoryReadsOperations4Set, WorkspaceRepositoryReadsOperationsSet } from "./repository-reads";
import { assertPersistableMessageContent } from "../../message-content-policy";
import { buildRunRuntimeBudget, hashPromptText, parseChatAttachment, toGeneratedThreadTitle } from "../models";
import { createRunId, isTerminalAgentRunStatus } from "@hyperfocus/ai-core/protocol";
import { createStableBoundedId } from "../../../notification-ids";
import { persistBrowserApprovalResolution, persistTerminalRunTransition } from "../../run/terminal-run-transition";

export function createWorkspaceRunsOperations(context: WorkspaceRepositoryContext) {
  const { db } = context;
  function saveChatAttachmentUpload(input: { projectId?: ProjectId; threadId?: ThreadId; attachment: ChatAttachment }) {
      const now = new Date().toISOString();
      db
        .query(
          `INSERT INTO chat_attachment_uploads (key, project_id, thread_id, attachment_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(key) DO UPDATE SET
             project_id = excluded.project_id,
             thread_id = excluded.thread_id,
             attachment_json = excluded.attachment_json`
        )
        .run(input.attachment.key, input.projectId ?? null, input.threadId ?? null, JSON.stringify(input.attachment), now);
    }
  function getChatAttachmentUpload(key: string) {
      const row = db
        .query<ChatAttachmentUploadRow, [string]>(
          `SELECT key, project_id, thread_id, attachment_json, created_at
           FROM chat_attachment_uploads
           WHERE key = ?1`
        )
        .get(key);
      if (!row) {
        return undefined;
      }
  
      const attachment = parseChatAttachment(row.attachment_json, {
        table: "chat_attachment_uploads",
        rowId: row.key,
        field: "attachment_json"
      });
      if (!attachment) {
        return undefined;
      }
  
      return {
        key: row.key,
        projectId: row.project_id ?? undefined,
        threadId: row.thread_id ?? undefined,
        attachment,
        createdAt: row.created_at
      };
    }
  function promoteDeferredPlanningQuestions() {
      const now = new Date().toISOString();
      const deferred = db
        .query<{ project_id: string; thread_id: string; run_id: string }, []>(
          `SELECT agent_runs.project_id, agent_runs.thread_id, agent_run_questions.run_id
           FROM agent_run_questions
           INNER JOIN agent_runs ON agent_runs.id = agent_run_questions.run_id
           WHERE agent_run_questions.status = 'deferred'
             AND agent_runs.status NOT IN ('completed', 'partial-complete', 'stopped', 'failed')
           ORDER BY agent_runs.updated_at ASC, agent_run_questions.ordinal ASC`
        )
        .all();
  
      const tx = db.transaction(() => {
        db
          .query(
            `UPDATE agent_run_questions
             SET status = 'pending'
             WHERE status = 'deferred'
               AND EXISTS (
                 SELECT 1
                 FROM agent_runs
                 WHERE agent_runs.id = agent_run_questions.run_id
                   AND agent_runs.status NOT IN ('completed', 'partial-complete', 'stopped', 'failed')
               )`
          )
          .run();
        db
          .query(
            `UPDATE agent_runs
             SET status = 'awaiting-user-input',
                 summary = (
                   SELECT prompt
                   FROM agent_run_questions
                   WHERE run_id = agent_runs.id AND status = 'pending'
                   ORDER BY ordinal ASC
                   LIMIT 1
                 ),
                 updated_at = ?1,
                 completed_at = NULL
             WHERE status NOT IN ('completed', 'partial-complete', 'stopped', 'failed')
               AND id IN (SELECT DISTINCT run_id FROM agent_run_questions WHERE status = 'pending')`
          )
          .run(now);
      });
      tx();
  
      return [...new Map(
        deferred.map((entry) => [
          entry.run_id,
          {
            projectId: entry.project_id,
            threadId: entry.thread_id,
            runId: entry.run_id
          }
        ])
      ).values()];
    }
  function hasActiveForegroundAgentRun() {
      const row = db
        .query<{ id: string }, []>(
          `SELECT agent_runs.id
           FROM agent_runs
           LEFT JOIN background_job_runs
             ON background_job_runs.linked_agent_run_id = agent_runs.id
            AND background_job_runs.status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
           WHERE agent_runs.status IN ('planning', 'awaiting-user-input', 'running-main', 'running-subagents', 'aggregating')
             AND background_job_runs.id IS NULL
           LIMIT 1`
        )
        .get();
      return Boolean(row);
    }
  function reserveAgentRunTurn(projectId: ProjectId, runId: string) {
      const tx = db.transaction(() => {
        const before = db
          .query<{ max_turns: number | null; turns_used: number }, [string, string]>(
            `SELECT max_turns, turns_used
             FROM agent_runs
             WHERE id = ?1 AND project_id = ?2`
          )
          .get(runId, projectId);
        if (!before) {
          throw new Error(`Unknown agent run: ${runId}`);
        }
        if (before.max_turns === null) {
          return undefined;
        }
  
        const updated = db
          .query(
            `UPDATE agent_runs
             SET turns_used = turns_used + 1,
                 updated_at = ?3
             WHERE id = ?1 AND project_id = ?2
               AND max_turns IS NOT NULL
               AND turns_used < max_turns`
          )
          .run(runId, projectId, new Date().toISOString());
  
        if (updated.changes === 0) {
          throw new Error("Run turn budget exhausted [category=turn-budget-exhausted]");
        }
  
        const after = db
          .query<{ max_turns: number; turns_used: number }, [string, string]>(
            `SELECT max_turns, turns_used
             FROM agent_runs
             WHERE id = ?1 AND project_id = ?2`
          )
          .get(runId, projectId);
        if (!after) {
          throw new Error(`Unknown agent run: ${runId}`);
        }
        return buildRunRuntimeBudget(after.max_turns, after.turns_used, true);
      });
      return tx();
    }
  return {
    operations: {
      saveChatAttachmentUpload,
      getChatAttachmentUpload,
      promoteDeferredPlanningQuestions,
      hasActiveForegroundAgentRun,
      reserveAgentRunTurn,
    },
    publicApi: {
      saveChatAttachmentUpload,
      getChatAttachmentUpload,
      promoteDeferredPlanningQuestions,
      hasActiveForegroundAgentRun,
      reserveAgentRunTurn,
    },
  };
}

export type WorkspaceRunsOperationsSet = ReturnType<typeof createWorkspaceRunsOperations>["operations"];

export function createWorkspaceRunsOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet) {
  function getThreadMessagesForProject(projectId: ProjectId, threadId: ThreadId) { operations.readThreadRow(projectId, threadId); return operations.readMessages(threadId); }
  function getThreadMessages(projectId: ProjectId, threadId: ThreadId) { operations.readThreadRow(projectId, threadId); return operations.readMessages(threadId); }
  return {
    operations: {
      getThreadMessagesForProject,
      getThreadMessages,
    },
    publicApi: {
      getThreadMessagesForProject,
      getThreadMessages,
    },
  };
}

export type WorkspaceRunsOperations2Set = ReturnType<typeof createWorkspaceRunsOperations2>["operations"];

export function createWorkspaceRunsOperations3(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceBackgroundReadsOperations2Set) {
  const { db } = context;
  function getExperimentRun(projectId: ProjectId, runId: string) {
      operations.assertRunExists(projectId, runId);
      const row = db
        .query<AgentRunExperimentRow, [string]>(
          `SELECT
            id,
            run_id,
            status,
            virtual_branch_name,
            repo_mount_path,
            project_mount_path,
            base_commit_sha,
            base_branch_name,
            base_dirty_fingerprint,
            head_commit_sha,
            files_changed,
            insertions,
            deletions,
            promoted_at,
            discarded_at,
            created_at,
            updated_at
           FROM agent_run_experiments
           WHERE run_id = ?1`
        )
        .get(runId);
  
      return row ? operations.hydrateExperimentRun(row) : undefined;
    }
  return {
    operations: {
      getExperimentRun,
    },
    publicApi: {
      getExperimentRun,
    },
  };
}

export type WorkspaceRunsOperations3Set = ReturnType<typeof createWorkspaceRunsOperations3>["operations"];

export function createWorkspaceRunsOperations4(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceRepositoryReadsOperations4Set) {
  function getAgentRun(projectId: ProjectId, threadId: ThreadId, runId: string): AgentRunState | undefined {
      operations.readThreadRow(projectId, threadId);
      const run = operations.readRunRow(projectId, threadId, runId);
      return run ? operations.hydrateRunState(run) : undefined;
    }
  return {
    operations: {
      getAgentRun,
    },
    publicApi: {
      getAgentRun,
    },
  };
}

export type WorkspaceRunsOperations4Set = ReturnType<typeof createWorkspaceRunsOperations4>["operations"];

export function createWorkspaceRunsOperations5(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperationsSet & WorkspaceRepositoryReadsOperationsSet & WorkspaceMigrationSupportOperationsSet & WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function appendMessage(
      projectId: ProjectId,
      role: ChatRole,
      content: string,
      threadIdOrOptions?:
        | ThreadId
        | { threadId?: ThreadId; kind?: ChatMessageKind; attachments?: ChatAttachment[]; metadata?: ChatMessageMetadata }
    ): WorkspaceProjectState {
      assertPersistableMessageContent(content); const options =
        typeof threadIdOrOptions === "string" || threadIdOrOptions === undefined ? { threadId: threadIdOrOptions } : threadIdOrOptions;
      const resolvedThreadId = operations.resolveThreadId(projectId, options.threadId);
      const thread = operations.readThreadRow(projectId, resolvedThreadId);
      const message = {
        id: crypto.randomUUID(),
        role,
        kind: options.kind ?? "plain",
        content,
        attachments: options.attachments,
        metadata: options.metadata,
        createdAt: new Date().toISOString()
      };
      const priorMessageCount =
        db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(thread.id)
          ?.count ?? 0;
  
      const tx = db.transaction(() => {
        db
          .query(
            `INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
          )
          .run(
            message.id,
            thread.id,
            message.role,
            message.kind ?? "plain",
            message.content,
            message.attachments ? JSON.stringify(message.attachments) : null,
            message.metadata ? JSON.stringify(message.metadata) : null,
            message.createdAt
          );
        db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(thread.id, message.createdAt);
        operations.touchProject(projectId, message.createdAt);
  
        if (role === "user" && priorMessageCount === 0 && thread.title_source === "generated" && /^Thread \d+$/.test(thread.title)) {
          db
            .query(`UPDATE project_threads SET title = ?3 WHERE id = ?1 AND project_id = ?2`)
            .run(thread.id, projectId, toGeneratedThreadTitle(content, thread.title));
        }
      });
      tx();
  
      return operations.readProjectSnapshot(projectId);
    }
  function updateThreadMessage(
      projectId: ProjectId,
      threadId: ThreadId,
      messageId: string,
      patch: { content: string; metadata?: ChatMessageMetadata; createdAt?: string }
    ) {
      assertPersistableMessageContent(patch.content); operations.readThreadRow(projectId, threadId);
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE thread_messages
           SET content = ?4, metadata_json = ?5, created_at = COALESCE(?6, created_at)
           WHERE id = ?3
             AND thread_id = ?2
             AND EXISTS (SELECT 1 FROM project_threads WHERE id = ?2 AND project_id = ?1)`
        )
        .run(projectId, threadId, messageId, patch.content, patch.metadata ? JSON.stringify(patch.metadata) : null, patch.createdAt ?? null);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown thread message: ${messageId}`);
      }
  
      db.query(`UPDATE project_threads SET updated_at = ?3 WHERE id = ?1 AND project_id = ?2`).run(threadId, projectId, now);
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  function createAgentRun(projectId: ProjectId, latestUserPrompt: string, planningModelId?: string, threadId?: ThreadId, maxTurns?: number) {
      const resolvedThreadId = operations.resolveThreadId(projectId, threadId);
      operations.readThreadRow(projectId, resolvedThreadId);
      const runId = createRunId();
      const now = new Date().toISOString();
  
      db
        .query(
          `INSERT INTO agent_runs (
            id,
            project_id,
            thread_id,
            status,
            execution_target,
            latest_user_prompt,
            prompt_chars,
            prompt_hash,
            transcript_chars,
            latest_task_chars,
            planning_model_id,
            execution_model_id,
            difficulty_score,
            summary,
            final_execution_brief,
            failure_message,
            failure_category,
            max_turns,
            turns_used,
            plan_json,
            correctness_review_json,
            browser_sessions_json,
            tool_activities_json,
            created_at,
            updated_at,
            completed_at
          ) VALUES (?1, ?2, ?3, ?4, 'current-project', ?5, ?6, ?7, NULL, NULL, ?8, NULL, NULL, NULL, NULL, NULL, NULL, ?9, 0, NULL, NULL, NULL, NULL, ?10, ?10, NULL)`
        )
        .run(
          runId,
          projectId,
          resolvedThreadId,
          "planning",
          latestUserPrompt,
          latestUserPrompt.length,
          hashPromptText(latestUserPrompt),
          planningModelId ?? null,
          maxTurns ?? null,
          now
        );
  
      db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(resolvedThreadId, now);
      operations.touchProject(projectId, now);
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      appendMessage,
      updateThreadMessage,
      createAgentRun,
    },
    publicApi: {
      appendMessage,
      updateThreadMessage,
      createAgentRun,
    },
  };
}

export type WorkspaceRunsOperations5Set = ReturnType<typeof createWorkspaceRunsOperations5>["operations"];

export function createWorkspaceRunsOperations6(context: WorkspaceRepositoryContext, operations: WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function appendPlanningQuestions(
      projectId: ProjectId,
      runId: string,
      questions: Array<
        Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "choices" | "required" | "intent"> &
        Partial<Pick<PlanningQuestion, "responseKind">>
      >,
      status: Extract<PlanningQuestion["status"], "pending" | "deferred"> = "pending",
      plannerTurnId: string
    ) {
      if (questions.length === 0) {
        return operations.readProjectSnapshot(projectId);
      }
  
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        const currentRun = db
          .query<{ status: AgentRunStatus }, [string, ProjectId]>(
            `SELECT status
             FROM agent_runs
             WHERE id = ?1 AND project_id = ?2`
          )
          .get(runId, projectId);
        if (!currentRun) {
          throw new Error(`Unknown agent run: ${runId}`);
        }
        if (isTerminalAgentRunStatus(currentRun.status)) {
          return;
        }
        let ordinal =
          db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM agent_run_questions WHERE run_id = ?1`).get(runId)?.count ?? 0;
        const existingQuery = db.query<{ id: string }, [string, string, string, string]>(
          `SELECT id
           FROM agent_run_questions
           WHERE run_id = ?1
             AND planner_turn_id = ?2
             AND (logical_question_id = ?3 OR prompt_hash = ?4)
           LIMIT 1`
        );
  
        for (const question of questions) {
          const promptHash = hashPromptText(question.prompt);
          const existing = existingQuery.get(runId, plannerTurnId, question.id, promptHash);
          if (existing) {
            continue;
          }
  
          ordinal += 1;
          db
            .query(
              `INSERT INTO agent_run_questions (
                id,
                run_id,
                ordinal,
                logical_question_id,
                planner_turn_id,
                prompt_hash,
                prompt,
                placeholder,
                response_kind,
                choices_json,
                intent_json,
                status,
                answer_text,
                asked_at,
                answered_at
              ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13, NULL)`
            )
            .run(
              crypto.randomUUID(),
              runId,
              ordinal,
              question.id,
              plannerTurnId,
              promptHash,
              question.prompt,
              question.placeholder ?? null,
              question.responseKind ?? "choice",
              question.choices ? JSON.stringify(question.choices) : null,
              question.intent ? JSON.stringify(question.intent) : null,
              status,
              now
            );
        }
  
        db
          .query(
            `UPDATE agent_runs
             SET status = 'awaiting-user-input', summary = ?3, updated_at = ?4, completed_at = NULL
             WHERE id = ?1 AND project_id = ?2`
          )
          .run(runId, projectId, questions[0]?.prompt ?? null, now);
      });
      tx();
  
      return operations.readProjectSnapshot(projectId);
    }
  function appendPlanningQuestion(
      projectId: ProjectId,
      runId: string,
      question: Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "choices" | "required" | "intent"> &
        Partial<Pick<PlanningQuestion, "responseKind">>,
      status: Extract<PlanningQuestion["status"], "pending" | "deferred"> = "pending",
      plannerTurnId?: string
    ) {
      return appendPlanningQuestions(
        projectId,
        runId,
        [question],
        status,
        plannerTurnId ?? createStableBoundedId(["legacy-planner-turn", runId, question.id, hashPromptText(question.prompt)])
      );
    }
  function answerPlanningQuestion(projectId: ProjectId, runId: string, questionId: QuestionId, answerText: string) {
      const now = new Date().toISOString();
      const updated = db
        .query(
          `UPDATE agent_run_questions
           SET status = 'answered', answer_text = ?4, answered_at = ?5
           WHERE id = ?1 AND run_id = ?2
             AND status IN ('pending', 'deferred')
             AND EXISTS (
               SELECT 1 FROM agent_runs
               WHERE agent_runs.id = ?2
                 AND agent_runs.project_id = ?3
                 AND agent_runs.status NOT IN ('completed', 'partial-complete', 'stopped', 'failed')
             )`
        )
        .run(questionId, runId, projectId, answerText, now);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown pending planning question: ${questionId}`);
      }
  
      db
        .query(
          `UPDATE agent_runs
           SET status = 'planning', updated_at = ?3, completed_at = NULL
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, now);
  
      return operations.readProjectSnapshot(projectId);
    }
  return {
    operations: {
      appendPlanningQuestions,
      appendPlanningQuestion,
      answerPlanningQuestion,
    },
    publicApi: {
      appendPlanningQuestions,
      appendPlanningQuestion,
      answerPlanningQuestion,
    },
  };
}

export type WorkspaceRunsOperations6Set = ReturnType<typeof createWorkspaceRunsOperations6>["operations"];

export function createWorkspaceRunsOperations7(context: WorkspaceRepositoryContext, operations: WorkspaceRepositoryReadsOperationsSet & WorkspaceProjectReadsOperations3Set) {
  const { db } = context;
  function setAgentRunReady(
      projectId: ProjectId,
      runId: string,
      plan: PlannerReadyTurn,
      executionPlan?: ExecutionPlan,
      subtasks: Array<Pick<SubagentTaskState, "id" | "title" | "instruction">> = [],
      planningModelId?: string
    ) {
      const now = new Date().toISOString();
      const resolvedSubtasks = subtasks.length > 0 ? subtasks : plan.subtasks;
      const resolvedExecutionPlan =
        executionPlan ??
        ({
          runId,
          origin: "initial",
          iteration: 1,
          summary: plan.summary,
          finalExecutionBrief: plan.finalExecutionBrief,
          difficultyScore: Math.round(plan.difficultyScore),
          planningModelId: planningModelId ?? "openai/gpt-5.4",
          executionModelId: plan.executionModelId,
          route: resolvedSubtasks.length > 1 ? "pi-subagents" : "main",
          subagentWorktreeStrategy: "same-worktree",
          targetSubagentCount: resolvedSubtasks.length,
          actualSubagentCount: resolvedSubtasks.length > 1 ? resolvedSubtasks.length : 0,
          gating: {
            mode: "countdown",
            delaySeconds: 10
          },
          prerequisites: [],
          contracts: resolvedSubtasks.map((task) => ({
            taskId: task.id,
            title: task.title,
            instruction: task.instruction,
            effortPoints: 2,
            ownedPaths: ["(planner-unspecified)"],
            dependsOnPrerequisiteIds: [],
            deliverables: [task.title],
            integrationPoints: [],
            verificationScope: "owned-files-only",
            verificationCommands: ["bunx tsc --noEmit"],
            mergeNotes: `Merge ${task.title} into final solution.`
          })),
          correctnessPolicy: "ask-before-iterate"
        });
  
      const tx = db.transaction(() => {
        operations.assertRunExists(projectId, runId);
        db.query(`DELETE FROM agent_run_subtasks WHERE run_id = ?1`).run(runId);
  
        for (const task of resolvedSubtasks) {
          db
            .query(
              `INSERT INTO agent_run_subtasks (
                id,
                run_id,
                planner_task_id,
                title,
                instruction,
                status,
                attempt_count,
                output,
                error_message,
                started_at,
                completed_at,
                updated_at
              ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 0, NULL, NULL, NULL, NULL, ?6)`
            )
            .run(crypto.randomUUID(), runId, task.id, task.title, task.instruction, now);
        }
  
        db
          .query(
            `UPDATE agent_runs
             SET status = 'ready',
                 planning_model_id = COALESCE(?3, planning_model_id),
                 execution_model_id = ?4,
                 difficulty_score = ?5,
                 summary = ?6,
                 final_execution_brief = ?7,
                 failure_message = NULL,
                 plan_json = ?8,
                 correctness_review_json = NULL,
                 updated_at = ?9,
                 completed_at = NULL
             WHERE id = ?1 AND project_id = ?2`
          )
          .run(
            runId,
            projectId,
            planningModelId ?? null,
            plan.executionModelId,
            Math.round(plan.difficultyScore),
            plan.summary,
            plan.finalExecutionBrief,
            JSON.stringify(resolvedExecutionPlan),
            now
          );
      });
      tx();
  
      return operations.readProjectSnapshot(projectId);
    }
  function terminalizeAgentRun(input: TerminalRunTransitionInput) { persistTerminalRunTransition(db, input); return operations.readProjectSnapshot(input.projectId); }
  function setAgentRunStatus(
      projectId: ProjectId,
      runId: string,
      status: AgentRunStatus,
      failureMessage?: string,
      failureCategory?: RunFailureCategory,
      allowTerminalRewrite = false
    ) {
      if (isTerminalAgentRunStatus(status)) return terminalizeAgentRun({ projectId, runId, status, reason: failureMessage ?? (status === "completed" ? "Run completed" : status), failureCategory });
      const now = new Date().toISOString();
      const current = db
        .query<{ status: AgentRunStatus }, [string, ProjectId]>(
          `SELECT status
           FROM agent_runs
           WHERE id = ?1 AND project_id = ?2`
        )
        .get(runId, projectId);
      if (
        current &&
        isTerminalAgentRunStatus(current.status) &&
        (!allowTerminalRewrite || !isTerminalAgentRunStatus(status))
      ) {
        return operations.readProjectSnapshot(projectId);
      }
      const completedAt = isTerminalAgentRunStatus(status) ? now : null;
      const updated = db
        .query(
          `UPDATE agent_runs
           SET status = ?3,
               failure_message = ?4,
               failure_category = ?5,
               updated_at = ?6,
               completed_at = CASE WHEN ?7 IS NULL THEN NULL ELSE COALESCE(completed_at, ?7) END
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, status, failureMessage ?? null, failureCategory ?? null, now, completedAt);
  
      if (updated.changes === 0) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
  
      return operations.readProjectSnapshot(projectId);
    }
  function resolveAgentRunBrowserApproval(input: { projectId: ProjectId; runId: string; sessionId: string; toolCallId: string; approved: boolean }) { persistBrowserApprovalResolution(db, input); return operations.readProjectSnapshot(input.projectId); }
  return {
    operations: {
      setAgentRunReady,
      terminalizeAgentRun,
      setAgentRunStatus,
      resolveAgentRunBrowserApproval,
    },
    publicApi: {
      setAgentRunReady,
      terminalizeAgentRun,
      setAgentRunStatus,
      resolveAgentRunBrowserApproval,
    },
  };
}

export type WorkspaceRunsOperations7Set = ReturnType<typeof createWorkspaceRunsOperations7>["operations"];
