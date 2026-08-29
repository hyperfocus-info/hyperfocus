import type { AssistantLogEntry, BackgroundJob } from "@hyperfocus/ai-core/protocol";
import type { WorkspaceAssistantReadsOperations3Set } from "./assistant-reads";
import type { WorkspaceAssistantsOperations2Set, WorkspaceAssistantsOperations4Set, WorkspaceAssistantsOperations7Set } from "./assistants-1";
import type { WorkspaceBackgroundOperations4Set } from "./background-1";
import type { WorkspaceRepositoryContext } from "../contracts";
import { syncAssistantQuestionNotificationsRaw } from "../../notification-persistence";

export function createWorkspaceLifecycleOperations(context: WorkspaceRepositoryContext) {
  const { runDetailSnapshots, dbPath, db } = context;
  function getDatabasePath() { return dbPath; }
  function close() { runDetailSnapshots.clear(); db.close(false); }
  return {
    operations: {
      getDatabasePath,
      close,
    },
    publicApi: {
      getDatabasePath,
      close,
    },
  };
}

export type WorkspaceLifecycleOperationsSet = ReturnType<typeof createWorkspaceLifecycleOperations>["operations"];

export function createWorkspaceLifecycleOperations2(context: WorkspaceRepositoryContext, operations: WorkspaceAssistantsOperations2Set & WorkspaceAssistantReadsOperations3Set & WorkspaceAssistantsOperations4Set & WorkspaceAssistantsOperations7Set & WorkspaceBackgroundOperations4Set) {
  const { db } = context;
  function saveAssistantJobBootstrap(input: {
      assistantId: string;
      jobs: BackgroundJob[];
      logEntry: AssistantLogEntry;
      confirmation?: { questionId: string; answerText: string };
    }) {
      return db.transaction(() => {
        const assistant = operations.getAssistant(input.assistantId, true);
        if (!assistant) throw new Error(`Unknown assistant: ${input.assistantId}`);
        const shouldCreate = !operations.hasAssistantBackgroundJobs(input.assistantId);
        const savedJobs: BackgroundJob[] = [];
        if (shouldCreate) {
          for (const job of input.jobs) {
            operations.saveBackgroundJob(job);
            const savedJob = operations.getBackgroundJob(job.id);
            if (savedJob) savedJobs.push(savedJob);
          }
          operations.appendAssistantLogEntry(input.logEntry);
        }
        const question = input.confirmation
          ? operations.getAssistantQuestion(input.confirmation.questionId)
          : undefined;
        if (input.confirmation && question?.assistantId === input.assistantId
          && (question.status === "pending" || question.status === "deferred")) {
          operations.answerAssistantQuestion(input.assistantId, question.id, input.confirmation.answerText);
        }
        if (input.confirmation) syncAssistantQuestionNotificationsRaw(db, input.assistantId, (row) => operations.hydrateAssistantQuestion(row));
        if (!shouldCreate) return undefined;
        return {
          assistant,
          jobs: savedJobs,
          created: false as const,
          backgroundJobsState: operations.loadBackgroundJobsState()
        };
      }).immediate();
    }
  return {
    operations: {
      saveAssistantJobBootstrap,
    },
    publicApi: {
      saveAssistantJobBootstrap,
    },
  };
}

export type WorkspaceLifecycleOperations2Set = ReturnType<typeof createWorkspaceLifecycleOperations2>["operations"];
