import { z } from "zod";

import type {
  ChatAttachment,
  ChatMessage,
  ChatMessageMetadata,
  MemorySummary,
  ModeDefinition,
  WorkspaceRuleSource
} from "./conversation";
import {
  assistantAssetRefIdSchema,
  assistantIdSchema,
  assistantLearningIdSchema,
  assistantLogEntryIdSchema,
  assistantQuestionIdSchema,
  assistantThreadIdSchema,
  assistantTodoIdSchema,
  experimentIdSchema,
  memoryEntryIdSchema,
  memoryRetrievalIdSchema
} from "./shared";
import type {
  BackgroundJobId,
  BackgroundJobRunId,
  ChatMessageKind,
  ChatRole,
  ModeId,
  PlanningChoiceId,
  ProjectId,
  QuestionId,
  RequestId,
  RunId,
  SessionId,
  ThreadId
} from "./shared";
import type {
  ChatSessionState,
  ProjectThreadSummary,
  WorkspaceProjectState
} from "./workspace";

export function createRequestId(): RequestId {
  return crypto.randomUUID();
}

export function createSessionId(): SessionId {
  return crypto.randomUUID();
}

export function createThreadId(): ThreadId {
  return crypto.randomUUID();
}

export function createProjectId(): ProjectId {
  return crypto.randomUUID();
}

export function createRunId(): RunId {
  return crypto.randomUUID();
}

export function createExperimentId(): z.infer<typeof experimentIdSchema> {
  return crypto.randomUUID();
}

export function createMemoryEntryId(): z.infer<typeof memoryEntryIdSchema> {
  return crypto.randomUUID();
}

export function createMemoryRetrievalId(): z.infer<typeof memoryRetrievalIdSchema> {
  return crypto.randomUUID();
}

export function createBackgroundJobId(): BackgroundJobId {
  return crypto.randomUUID();
}

export function createBackgroundJobRunId(): BackgroundJobRunId {
  return crypto.randomUUID();
}

export function createAssistantId(): z.infer<typeof assistantIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantThreadId(): z.infer<typeof assistantThreadIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantTodoId(): z.infer<typeof assistantTodoIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantLearningId(): z.infer<typeof assistantLearningIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantQuestionId(): z.infer<typeof assistantQuestionIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantLogEntryId(): z.infer<typeof assistantLogEntryIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantAssetRefId(): z.infer<typeof assistantAssetRefIdSchema> {
  return crypto.randomUUID();
}

export function createQuestionId(): QuestionId {
  return crypto.randomUUID();
}

export function createPlanningChoiceId(): PlanningChoiceId {
  return crypto.randomUUID();
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  options: {
    kind?: ChatMessageKind;
    attachments?: ChatAttachment[];
    metadata?: ChatMessageMetadata;
    id?: string;
  } = {}
): ChatMessage {
  return {
    id: options.id ?? crypto.randomUUID(),
    role,
    kind: options.kind ?? "plain",
    content,
    attachments: options.attachments,
    metadata: options.metadata,
    createdAt: new Date().toISOString()
  };
}

export function createEmptySession(sessionId: SessionId = createSessionId()): ChatSessionState {
  return {
    sessionId,
    selectedAgentId: "pi",
    executionModelId: "openai/gpt-5.4",
    messages: [],
    isStreaming: false
  };
}

export function createProjectThreadSummary(
  input: Pick<ProjectThreadSummary, "id" | "title" | "titleSource" | "updatedAt"> &
    Partial<
      Pick<
        ProjectThreadSummary,
        | "kind"
        | "status"
        | "badgeState"
        | "messageCount"
        | "lastMessagePreview"
        | "createdAt"
        | "lastUserMessageAt"
        | "archivedAt"
        | "forkedFromThreadId"
        | "pinned"
      >
    >
): ProjectThreadSummary {
  return {
    id: input.id,
    kind: input.kind ?? "user",
    status: input.status ?? "active",
    pinned: input.pinned ?? false,
    title: input.title,
    titleSource: input.titleSource,
    badgeState: input.badgeState ?? "idle",
    messageCount: input.messageCount ?? 0,
    lastMessagePreview: input.lastMessagePreview,
    createdAt: input.createdAt,
    lastUserMessageAt: input.lastUserMessageAt,
    archivedAt: input.archivedAt,
    updatedAt: input.updatedAt,
    forkedFromThreadId: input.forkedFromThreadId
  };
}

export function createWorkspaceProjectState(
  input: Pick<WorkspaceProjectState, "id" | "name" | "rootPath"> & {
    filePaths?: string[];
    activeThreadId?: ThreadId;
    session?: ChatSessionState;
    threads?: ProjectThreadSummary[];
    selectedModeId?: ModeId;
    projectModes?: ModeDefinition[];
    projectRuleSource?: WorkspaceRuleSource;
    threadMemorySummary?: MemorySummary;
  }
): WorkspaceProjectState {
  const activeThreadId = input.activeThreadId ?? createThreadId();
  return {
    id: input.id,
    name: input.name,
    rootPath: input.rootPath,
    filePaths: input.filePaths,
    activeThreadId,
    selectedModeId: input.selectedModeId ?? "implement",
    projectModes: input.projectModes ?? [],
    projectRuleSource: input.projectRuleSource,
    threadMemorySummary: input.threadMemorySummary,
    threads:
      input.threads ??
      [
        createProjectThreadSummary({
          id: activeThreadId,
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
    session: input.session ?? createEmptySession(),
    activeRun: undefined,
    lastRun: undefined,
    runSummaries: []
  };
}
