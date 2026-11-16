import { z } from "zod";

import {
  intentContractSchema
} from "./conversation";
import {
  planningChoiceSchema,
  runFailureCategorySchema,
  runPromptStatsSchema
} from "./execution";
import {
  agentIdSchema,
  assistantIdSchema,
  assistantQuestionIdSchema,
  backgroundJobIdSchema,
  backgroundJobKindSchema,
  backgroundJobLaneSchema,
  backgroundJobRiskLevelSchema,
  backgroundJobRunIdSchema,
  backgroundJobRunStatusSchema,
  backgroundJobSchedulerStatusSchema,
  backgroundJobStatusSchema,
  boundedPageCursorSchema,
  cliUpdateTargetIdSchema,
  composerReasoningStrengthSchema,
  createBoundedPageSchema,
  executionModelIdSchema,
  modeIdSchema,
  planExecutionModeSchema,
  projectIdSchema,
  providerBrandSchema,
  providerModelIdSchema,
  questionIdSchema,
  runIdSchema,
  sessionIdSchema,
  subagentWorktreeStrategySchema,
  threadIdSchema
} from "./shared";

export const backgroundJobScheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("one-off"),
    runAt: z.string().datetime().or(z.string().min(1)),
    consumedAt: z.string().datetime().or(z.string().min(1)).optional(),
    sourceText: z.string().min(1).max(512)
  }),
  z.object({
    type: z.literal("interval"),
    intervalSeconds: z.number().int().min(60).max(31536000),
    nextRunAt: z.string().datetime().or(z.string().min(1)),
    sourceText: z.string().min(1).max(512)
  }),
  z.object({
    type: z.literal("cron"),
    expression: z.string().min(1).max(256),
    timezone: z.string().min(1).max(128),
    nextRunAt: z.string().datetime().or(z.string().min(1)),
    sourceText: z.string().min(1).max(512)
  })
]);

export const backgroundJobAiRoutineDefinitionSchema = z.object({
  kind: z.literal("ai-routine"),
  prompt: z.string().min(1).max(32000),
  modeId: modeIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  reasoningStrength: composerReasoningStrengthSchema.optional(),
  fastMode: z.boolean().optional(),
  planExecutionMode: planExecutionModeSchema.optional(),
  subagentWorktreeStrategy: subagentWorktreeStrategySchema.optional(),
  launchProfile: z
    .object({
      agentId: agentIdSchema.optional(),
      providerBrand: providerBrandSchema.optional(),
      planningModelId: providerModelIdSchema.optional(),
      executionModelId: executionModelIdSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional(),
      modeId: modeIdSchema.optional()
    })
    .optional()
});

export const backgroundJobShellDefinitionSchema = z.object({
  kind: z.literal("shell"),
  executable: z.string().min(1).max(1024),
  args: z.array(z.string().max(4096)).max(64),
  cwd: z.string().min(1).max(4096).optional(),
  envRefs: z.array(z.string().min(1).max(128)).max(32).optional(),
  timeoutSeconds: z.number().int().min(1).max(86400),
  networkAccess: z.boolean().optional()
});

export const backgroundJobDefinitionSchema = z.discriminatedUnion("kind", [
  backgroundJobAiRoutineDefinitionSchema,
  backgroundJobShellDefinitionSchema
]);

export const backgroundJobSchema = z.object({
  id: backgroundJobIdSchema,
  projectId: projectIdSchema,
  assistantId: assistantIdSchema.optional(),
  automationThreadId: threadIdSchema,
  templateId: z.string().min(1).max(128).optional(),
  createdFromRunId: runIdSchema.optional(),
  kind: backgroundJobKindSchema,
  name: z.string().min(1).max(256),
  description: z.string().min(1).max(1024).optional(),
  intentContract: intentContractSchema.optional(),
  status: backgroundJobStatusSchema,
  lane: backgroundJobLaneSchema.optional(),
  riskLevel: backgroundJobRiskLevelSchema,
  definition: backgroundJobDefinitionSchema,
  schedule: backgroundJobScheduleSchema,
  scheduleInput: z.string().min(1).max(512),
  timezone: z.string().min(1).max(128).optional(),
  nextRunAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastRunAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastEnqueuedAt: z.string().datetime().or(z.string().min(1)).optional(),
  schedulerStatus: backgroundJobSchedulerStatusSchema.optional(),
  schedulerDetail: z.string().min(1).max(1024).optional(),
  schedulerQueuePosition: z.number().int().min(1).max(100000).optional(),
  schedulerQueueReason: z.string().min(1).max(1024).optional(),
  schedulerBlockedSinceAt: z.string().datetime().or(z.string().min(1)).optional(),
  schedulerActiveRunId: backgroundJobRunIdSchema.optional(),
  schedulerActiveRunStartedAt: z.string().datetime().or(z.string().min(1)).optional(),
  schedulerLastProgressAt: z.string().datetime().or(z.string().min(1)).optional(),
  schedulerOverloaded: z.boolean().optional(),
  schedulerCongested: z.boolean().optional(),
  schedulerCongestionRatio: z.number().min(0).max(1000).optional(),
  consecutiveFailureCount: z.number().int().min(0).max(100000).optional(),
  backoffUntil: z.string().datetime().or(z.string().min(1)).optional(),
  lastFailureCategory: runFailureCategorySchema.optional(),
  lastSchedulerCheckAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastBlockedAt: z.string().datetime().or(z.string().min(1)).optional(),
  blockedReason: z.string().min(1).max(1024).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const backgroundJobRunEventSchema = z.object({
  id: z.string().min(1).max(128),
  stage: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
  detail: z.string().min(1).max(16000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const backgroundJobRunSchema = z.object({
  id: backgroundJobRunIdSchema,
  jobId: backgroundJobIdSchema,
  projectId: projectIdSchema,
  assistantId: assistantIdSchema.optional(),
  automationThreadId: threadIdSchema,
  triggerSource: z.enum(["schedule", "startup-catchup", "manual", "approval-release", "retry"]),
  status: backgroundJobRunStatusSchema,
  riskLevel: backgroundJobRiskLevelSchema,
  approvalStatus: z.enum(["not-needed", "pending", "approved", "rejected"]),
  skippedOccurrenceCount: z.number().int().min(0).max(100000),
  linkedAgentRunId: runIdSchema.optional(),
  summary: z.string().min(1).max(4000).optional(),
  failureMessage: z.string().min(1).max(4000).optional(),
  failureCategory: runFailureCategorySchema.optional(),
  promptStats: runPromptStatsSchema.optional(),
  agentId: agentIdSchema.optional(),
  providerBrand: providerBrandSchema.optional(),
  planningModelId: providerModelIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  reasoningStrength: composerReasoningStrengthSchema.optional(),
  fastMode: z.boolean().optional(),
  controllerInstanceId: z.string().min(1).max(128).optional(),
  controllerLeaseId: z.string().min(1).max(128).optional(),
  controllerLeaseExpiresAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastHeartbeatAt: z.string().datetime().or(z.string().min(1)).optional(),
  heartbeatStage: z.string().min(1).max(64).optional(),
  heartbeatDetail: z.string().min(1).max(1024).optional(),
  timedOutAt: z.string().datetime().or(z.string().min(1)).optional(),
  resumeAttemptCount: z.number().int().min(0).max(1000).optional(),
  queuedAt: z.string().datetime().or(z.string().min(1)),
  startedAt: z.string().datetime().or(z.string().min(1)).optional(),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  events: z.array(backgroundJobRunEventSchema).max(512)
});

export const backgroundJobPageSchema = createBoundedPageSchema(backgroundJobSchema);
export const backgroundJobRunPageSchema = createBoundedPageSchema(backgroundJobRunSchema);

export const backgroundJobTemplateSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  description: z.string().min(1).max(512),
  kind: backgroundJobKindSchema,
  definition: backgroundJobDefinitionSchema
});

export const backgroundJobSchedulePreviewSchema = z.object({
  input: z.string().min(1).max(512),
  timezone: z.string().min(1).max(128).optional(),
  schedule: backgroundJobScheduleSchema.optional(),
  error: z.string().min(1).max(1024).optional()
});

export const backgroundJobsStateSchema = z.object({
  jobs: z.array(backgroundJobSchema).max(512),
  jobsNextCursor: boundedPageCursorSchema.optional(),
  runs: z.array(backgroundJobRunSchema).max(2048),
  runsNextCursor: boundedPageCursorSchema.optional(),
  templates: z.array(backgroundJobTemplateSchema).max(64),
  schedulerHeartbeatAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const notificationInboxItemIdSchema = z.string().min(1).max(128);
export const notificationSeveritySchema = z.enum(["info", "warning", "error"]);

const notificationInboxItemBaseSchema = z.object({
  id: notificationInboxItemIdSchema,
  interactive: z.boolean(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  readAt: z.string().datetime().or(z.string().min(1)).optional(),
  archivedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const planningQuestionNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("planning-question"),
  interactive: z.literal(true),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema,
  questionId: questionIdSchema,
  prompt: z.string().min(1),
  placeholder: z.string().min(1).optional(),
  responseKind: z.enum(["choice", "freeform"]).optional(),
  choices: z.array(z.lazy(() => planningChoiceSchema)).length(3).optional()
});

export const planningQuestionBatchNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("planning-question-batch"),
  interactive: z.literal(true),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema,
  questions: z.array(z.object({
    questionId: questionIdSchema,
    prompt: z.string().min(1),
    placeholder: z.string().min(1).optional(),
    responseKind: z.enum(["choice", "freeform"]).optional(),
    choices: z.array(z.lazy(() => planningChoiceSchema)).length(3).optional()
  })).min(2).max(5)
});

export const assistantQuestionNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("assistant-question"),
  interactive: z.literal(true),
  assistantId: assistantIdSchema,
  questionId: assistantQuestionIdSchema,
  prompt: z.string().min(1).max(8000),
  answerText: z.string().min(1).max(32000).optional()
});

export const assistantQuestionBatchNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("assistant-question-batch"),
  interactive: z.literal(true),
  assistantId: assistantIdSchema,
  questions: z.array(z.object({
    questionId: assistantQuestionIdSchema,
    prompt: z.string().min(1).max(8000),
    answerText: z.string().min(1).max(32000).optional()
  })).min(2).max(5)
});

export const browserApprovalNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("browser-approval"),
  interactive: z.literal(true),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema,
  sessionId: sessionIdSchema,
  toolCallId: z.string().min(1).max(256),
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional()
});

export const backgroundRunStatusNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("background-run-status"),
  interactive: z.literal(false),
  backgroundRunId: backgroundJobRunIdSchema,
  jobId: backgroundJobIdSchema,
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(4000),
  severity: notificationSeveritySchema
});

export const branchfsCleanupSummarySchema = z.object({
  rootsScanned: z.number().int().min(0),
  rootsDeleted: z.number().int().min(0),
  rootsRetained: z.number().int().min(0),
  bytesDeleted: z.number().int().min(0),
  staleRunsStopped: z.number().int().min(0).optional(),
  warnings: z.array(z.string().min(1).max(2000)).max(64)
});

export const cliUpdateNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("cli-update"),
  interactive: z.literal(true),
  agentId: cliUpdateTargetIdSchema,
  label: z.string().min(1).max(128),
  currentVersion: z.string().min(1).max(128),
  latestVersion: z.string().min(1).max(128),
  updateCommand: z.string().min(1).max(1024)
});

export const notificationInboxItemSchema = z.discriminatedUnion("kind", [
  planningQuestionNotificationSchema,
  planningQuestionBatchNotificationSchema,
  assistantQuestionNotificationSchema,
  assistantQuestionBatchNotificationSchema,
  browserApprovalNotificationSchema,
  backgroundRunStatusNotificationSchema,
  cliUpdateNotificationSchema
]);

export const notificationInboxStateSchema = z.object({
  items: z.array(notificationInboxItemSchema).max(4096),
  itemsNextCursor: boundedPageCursorSchema.optional(),
  unreadCount: z.number().int().min(0).max(100000),
  interactiveUnreadCount: z.number().int().min(0).max(100000),
  passiveUnreadCount: z.number().int().min(0).max(100000)
});
export const notificationInboxItemPageSchema = createBoundedPageSchema(notificationInboxItemSchema);

export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export type BackgroundJobSchedule = z.infer<typeof backgroundJobScheduleSchema>;
export type BackgroundJobAiRoutineDefinition = z.infer<typeof backgroundJobAiRoutineDefinitionSchema>;
export type BackgroundJobShellDefinition = z.infer<typeof backgroundJobShellDefinitionSchema>;
export type BackgroundJobDefinition = z.infer<typeof backgroundJobDefinitionSchema>;
export type BackgroundJob = z.infer<typeof backgroundJobSchema>;
export type BackgroundJobRunEvent = z.infer<typeof backgroundJobRunEventSchema>;
export type BackgroundJobRun = z.infer<typeof backgroundJobRunSchema>;
export type BackgroundJobPage = z.infer<typeof backgroundJobPageSchema>;
export type BackgroundJobRunPage = z.infer<typeof backgroundJobRunPageSchema>;
export type BackgroundJobTemplate = z.infer<typeof backgroundJobTemplateSchema>;
export type BackgroundJobSchedulePreview = z.infer<typeof backgroundJobSchedulePreviewSchema>;
export type BackgroundJobsState = z.infer<typeof backgroundJobsStateSchema>;
export type PlanningQuestionNotification = z.infer<typeof planningQuestionNotificationSchema>;
export type PlanningQuestionBatchNotification = z.infer<typeof planningQuestionBatchNotificationSchema>;
export type AssistantQuestionNotification = z.infer<typeof assistantQuestionNotificationSchema>;
export type AssistantQuestionBatchNotification = z.infer<typeof assistantQuestionBatchNotificationSchema>;
export type BrowserApprovalNotification = z.infer<typeof browserApprovalNotificationSchema>;
export type BackgroundRunStatusNotification = z.infer<typeof backgroundRunStatusNotificationSchema>;
export type NotificationInboxItem = z.infer<typeof notificationInboxItemSchema>;
export type NotificationInboxState = z.infer<typeof notificationInboxStateSchema>;
export type BranchfsCleanupSummary = z.infer<typeof branchfsCleanupSummarySchema>;
