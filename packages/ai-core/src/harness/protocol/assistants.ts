import { z } from "zod";

import {
  chatMessageSchema,
  intentContractSchema,
  memorySummarySchema
} from "./conversation";
import {
  agentIdSchema,
  assistantAssetRefIdSchema,
  assistantAssetRefKindSchema,
  assistantAssetRefProvenanceSchema,
  assistantAssetRefResolutionStatusSchema,
  assistantAssetRefScopeSchema,
  assistantBootstrapStateSchema,
  assistantCircuitBreakerStateSchema,
  assistantIdSchema,
  assistantLearningConfidenceSchema,
  assistantLearningIdSchema,
  assistantLogEntryIdSchema,
  assistantLogLevelSchema,
  assistantQuestionIdSchema,
  assistantQuestionStatusSchema,
  assistantRunStateSchema,
  assistantScopeSchema,
  assistantThreadIdSchema,
  assistantTodoIdSchema,
  assistantTodoStateSchema,
  assistantTodoWorkKindSchema,
  boundedPageCursorSchema,
  boundedPageLimitSchema,
  composerReasoningStrengthSchema,
  createBoundedPageSchema,
  executionModelIdSchema,
  modeIdSchema,
  projectIdSchema,
  providerBrandSchema,
  sessionIdSchema
} from "./shared";

export const ASSISTANT_DETAIL_PAGE_SIZE = 256;
export const ASSISTANT_WORKLOAD_PAGE_SIZE = 60;

export const assistantSchema = z.object({
  id: assistantIdSchema,
  name: z.string().trim().min(1).max(256),
  scope: assistantScopeSchema,
  projectId: projectIdSchema.optional(),
  description: z.string().min(1).max(1024).optional(),
  personalityPrompt: z.string().min(1).max(8000),
  jobPrompt: z.string().min(1).max(12000),
  intentContract: intentContractSchema.optional(),
  agentId: agentIdSchema,
  providerBrand: providerBrandSchema.optional(),
  modeId: modeIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  reasoningStrength: composerReasoningStrengthSchema.optional(),
  fastMode: z.boolean().optional(),
  runState: assistantRunStateSchema,
  bootstrapState: assistantBootstrapStateSchema,
  bootstrapAttemptId: z.string().min(1).max(128).optional(),
  bootstrapStartedAt: z.string().datetime().or(z.string().min(1)).optional(),
  bootstrapFinishedAt: z.string().datetime().or(z.string().min(1)).optional(),
  clonedFromAssistantId: assistantIdSchema.optional(),
  failureStreakCount: z.number().int().min(0).max(1000),
  circuitBreakerState: assistantCircuitBreakerStateSchema,
  circuitBreakerReason: z.string().min(1).max(4000).optional(),
  deletedAt: z.string().datetime().or(z.string().min(1)).optional(),
  latestActivityAt: z.string().datetime().or(z.string().min(1)).optional(),
  unreadQuestionCount: z.number().int().min(0).max(10000),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const assistantThreadSchema = z.object({
  id: assistantThreadIdSchema,
  assistantId: assistantIdSchema,
  sessionId: sessionIdSchema,
  messageCount: z.number().int().min(0).max(100000),
  memorySummary: memorySummarySchema.optional(),
  messages: z.array(chatMessageSchema).max(4096),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const assistantLiveThreadMetadataSchema = assistantThreadSchema.omit({ messages: true }).extend({
  latestMessageId: chatMessageSchema.shape.id,
  updatedAt: z.string().datetime()
}).superRefine((thread, context) => {
  if (thread.messageCount < 1) context.addIssue({ code: "custom",
    message: "Live thread message count must include its latest message", path: ["messageCount"] });
});

export const assistantTodoSchema = z.object({
  id: assistantTodoIdSchema,
  assistantId: assistantIdSchema,
  title: z.string().trim().min(1).max(512),
  description: z.string().min(1).max(4000).optional(),
  state: assistantTodoStateSchema,
  sortOrder: z.number().int().min(0).max(1000000),
  blockerReason: z.string().min(1).max(4000).optional(),
  source: z.enum(["user", "assistant", "bootstrap", "job", "question"]).optional(),
  workKind: assistantTodoWorkKindSchema.default("unspecified"),
  workTarget: z.string().min(1).max(512).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  cancelledAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const assistantTodoPatchSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  description: z.string().min(1).max(4000).optional().nullable(),
  state: assistantTodoStateSchema.optional(),
  blockerReason: z.string().min(1).max(4000).optional().nullable(),
  workKind: assistantTodoWorkKindSchema.optional(),
  workTarget: z.string().min(1).max(512).optional().nullable()
});

export const assistantLearningSchema = z.object({
  id: assistantLearningIdSchema,
  assistantId: assistantIdSchema,
  summary: z.string().min(1).max(4000),
  source: z.string().min(1).max(256),
  confidence: assistantLearningConfidenceSchema,
  sortOrder: z.number().int().min(0).max(1000000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  kind: z.enum(["fact", "summary"]).optional(),
  supersedesLearningIds: z.array(assistantLearningIdSchema).max(512).optional(),
  compactedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const assistantQuestionSchema = z.object({
  id: assistantQuestionIdSchema,
  assistantId: assistantIdSchema,
  prompt: z.string().min(1).max(8000),
  status: assistantQuestionStatusSchema,
  answerText: z.string().min(1).max(32000).optional(),
  linkedTodoIds: z.array(assistantTodoIdSchema).max(32).optional(),
  askedAt: z.string().datetime().or(z.string().min(1)),
  answeredAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const assistantLogEntrySchema = z.object({
  id: assistantLogEntryIdSchema,
  assistantId: assistantIdSchema,
  level: assistantLogLevelSchema,
  summary: z.string().min(1).max(1024),
  detail: z.string().min(1).max(4000).optional(),
  detailsJson: z.unknown().optional(),
  detailsJsonSummary: z.string().min(1).max(4000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const assistantAssetRefSchema = z.object({
  id: assistantAssetRefIdSchema,
  assistantId: assistantIdSchema,
  kind: assistantAssetRefKindSchema,
  label: z.string().min(1).max(256),
  value: z.string().min(1).max(4096),
  canonicalValue: z.string().min(1).max(4096).optional(),
  scope: assistantAssetRefScopeSchema.optional(),
  provenance: assistantAssetRefProvenanceSchema.optional(),
  resolutionStatus: assistantAssetRefResolutionStatusSchema.default("resolved"),
  resolutionError: z.string().min(1).max(1024).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const assistantsStateSchema = z.object({
  assistants: z.array(assistantSchema).max(512),
  assistantsNextCursor: boundedPageCursorSchema.optional(),
  threads: z.array(assistantThreadSchema).max(512),
  todos: z.array(assistantTodoSchema).max(8192),
  learnings: z.array(assistantLearningSchema).max(8192),
  questions: z.array(assistantQuestionSchema).max(4096),
  logs: z.array(assistantLogEntrySchema).max(16384),
  assetRefs: z.array(assistantAssetRefSchema).max(4096)
}).superRefine((state, context) => {
  const assistantIds = requireUniqueIds(state.assistants, "assistants", context);
  const threadsByAssistantId = new Map<string, number>();
  for (const [collection, items] of [["threads", state.threads], ["todos", state.todos], ["learnings", state.learnings],
    ["questions", state.questions], ["logs", state.logs], ["assetRefs", state.assetRefs]] as const) {
    requireUniqueIds(items, collection, context);
    items.forEach((item, index) => {
      if (!assistantIds.has(item.assistantId)) context.addIssue({ code: "custom",
        message: `${collection} item does not belong to an included assistant`, path: [collection, index, "assistantId"] });
    });
  }
  state.threads.forEach((thread, threadIndex) => {
    if (threadsByAssistantId.has(thread.assistantId)) context.addIssue({ code: "custom",
      message: "Assistant state must contain at most one thread per assistant", path: ["threads", threadIndex, "assistantId"] });
    threadsByAssistantId.set(thread.assistantId, threadIndex);
    addAssistantThreadCorrespondenceIssues(thread, context, ["threads", threadIndex]);
  });
});

function requireUniqueIds(items: ReadonlyArray<{ id: string }>, collection: string, context: z.RefinementCtx,
  path: Array<string | number> = [collection]) {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) context.addIssue({ code: "custom", message: `${collection} must contain unique IDs`, path: [...path, index, "id"] });
    ids.add(item.id);
  });
  return ids;
}

function addAssistantThreadCorrespondenceIssues(thread: { messages: ReadonlyArray<{ id: string }>; messageCount: number },
  context: z.RefinementCtx, path: Array<string | number>) {
  requireUniqueIds(thread.messages, "messages", context, [...path, "messages"]);
  if (thread.messageCount < thread.messages.length) context.addIssue({ code: "custom",
    message: "Thread message count cannot be smaller than included messages", path: [...path, "messageCount"] });
}

export const assistantPageCursorSchema = boundedPageCursorSchema;
export const assistantPageLimitSchema = boundedPageLimitSchema;
export const assistantSummaryPageSchema = createBoundedPageSchema(assistantSchema);
export const assistantThreadMessagePageSchema = createBoundedPageSchema(chatMessageSchema);
export const assistantTodoPageSchema = createBoundedPageSchema(assistantTodoSchema);
export const assistantLearningPageSchema = createBoundedPageSchema(assistantLearningSchema);
export const assistantQuestionPageSchema = createBoundedPageSchema(assistantQuestionSchema);
export const assistantLogPageSchema = createBoundedPageSchema(assistantLogEntrySchema);

function addAssistantOwnershipIssues(items: ReadonlyArray<{ assistantId: string }>, assistantId: string,
  collection: string, context: z.RefinementCtx, paged = true) {
  items.forEach((item, index) => { if (item.assistantId !== assistantId) context.addIssue({ code: "custom",
    message: "Assistant detail item does not belong to detail assistant",
    path: paged ? [collection, "items", index, "assistantId"] : [collection, index, "assistantId"] }); });
}

export const assistantDetailSchema = z.object({
  assistant: assistantSchema,
  thread: assistantThreadSchema.optional(),
  threadMessagesNextCursor: assistantPageCursorSchema.optional(),
  todos: assistantTodoPageSchema,
  learnings: assistantLearningPageSchema,
  questions: assistantQuestionPageSchema,
  logs: assistantLogPageSchema,
  assetRefs: z.array(assistantAssetRefSchema).max(512)
}).superRefine((detail, context) => {
  if (detail.thread?.assistantId !== undefined && detail.thread.assistantId !== detail.assistant.id) context.addIssue({ code: "custom",
    message: "Assistant thread does not belong to detail assistant", path: ["thread", "assistantId"] });
  addAssistantOwnershipIssues(detail.todos.items, detail.assistant.id, "todos", context);
  addAssistantOwnershipIssues(detail.learnings.items, detail.assistant.id, "learnings", context);
  addAssistantOwnershipIssues(detail.questions.items, detail.assistant.id, "questions", context);
  addAssistantOwnershipIssues(detail.logs.items, detail.assistant.id, "logs", context);
  addAssistantOwnershipIssues(detail.assetRefs, detail.assistant.id, "assetRefs", context, false);
  if (detail.thread) addAssistantThreadCorrespondenceIssues(detail.thread, context, ["thread"]);
  requireUniqueIds(detail.assetRefs, "assetRefs", context);
});

export type Assistant = z.infer<typeof assistantSchema>;
export type AssistantThread = z.infer<typeof assistantThreadSchema>;
export type AssistantLiveThreadMetadata = z.infer<typeof assistantLiveThreadMetadataSchema>;
export type AssistantTodo = z.infer<typeof assistantTodoSchema>;
export type AssistantTodoPatch = z.infer<typeof assistantTodoPatchSchema>;
export type AssistantLearning = z.infer<typeof assistantLearningSchema>;
export type AssistantQuestion = z.infer<typeof assistantQuestionSchema>;
export type AssistantLogEntry = z.infer<typeof assistantLogEntrySchema>;
export type AssistantAssetRef = z.infer<typeof assistantAssetRefSchema>;
export type AssistantsState = z.infer<typeof assistantsStateSchema>;
export type AssistantSummaryPage = z.infer<typeof assistantSummaryPageSchema>;
export type AssistantDetail = z.infer<typeof assistantDetailSchema>;
export type AssistantThreadMessagePage = z.infer<typeof assistantThreadMessagePageSchema>;
export type AssistantTodoPage = z.infer<typeof assistantTodoPageSchema>;
export type AssistantLearningPage = z.infer<typeof assistantLearningPageSchema>;
export type AssistantQuestionPage = z.infer<typeof assistantQuestionPageSchema>;
export type AssistantLogPage = z.infer<typeof assistantLogPageSchema>;
