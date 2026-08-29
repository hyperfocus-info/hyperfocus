import { z } from "zod";

export const RUN_DETAIL_MAX_BYTES = 96 * 1024 * 1024;
export const RUN_DETAIL_CHUNK_MAX_BYTES = 8_192;

import {
  correctnessReviewSchema,
  executionPlanSchema,
  experimentRunSchema,
  memoryRetrievalSchema,
  planPrerequisiteSchema,
  subagentContractSchema
} from "./conversation";
import {
  agentIdSchema,
  agentTraceStageSchema,
  assistantActionKindSchema,
  assistantIdSchema,
  assistantQuestionIdSchema,
  assistantScopeSchema,
  assistantTodoIdSchema,
  backgroundJobIdSchema,
  executionModelIdSchema,
  planningChoiceIdSchema,
  projectIdSchema,
  providerModelIdSchema,
  questionIdSchema,
  runExecutionTargetSchema,
  runIdSchema,
  sessionIdSchema,
  threadIdSchema
} from "./shared";

export const runFailureCategorySchema = z.enum([
  "empty-response",
  "stream-disconnect",
  "invalid-json",
  "question-persist-conflict",
  "manual-abort",
  "shutdown-interrupt",
  "controller-lost",
  "heartbeat-timeout",
  "max-runtime-timeout",
  "turn-budget-exhausted",
  "launch-failure",
  "runtime-contract-mismatch",
  "partial-subagent-failure",
  "planner-question",
  "workspace-context",
  "unknown"
]);

export const runRuntimeBudgetSchema = z.object({
  maxTurns: z.number().int().min(1).max(1000),
  turnsUsed: z.number().int().min(0).max(1000),
  currentTurn: z.number().int().min(0).max(1000),
  remainingTurns: z.number().int().min(0).max(1000),
  exhausted: z.boolean()
});

export const runLaunchRuntimeBudgetSchema = z.object({
  maxTurns: z.number().int().min(1).max(1000)
});

export const runPromptStatsSchema = z.object({
  promptChars: z.number().int().min(0).max(2_000_000),
  promptHash: z.string().min(1).max(64),
  transcriptChars: z.number().int().min(0).max(2_000_000).optional(),
  latestTaskChars: z.number().int().min(0).max(2_000_000).optional()
});

export const runDiagnosticsWindowDaysSchema = z.union([z.literal(1), z.literal(7), z.literal(30)]);

export const runDiagnosticsSummarySchema = z.object({
  activeBackoffJobs: z.number().int().min(0).max(100000),
  questionPersistConflictCount: z.number().int().min(0).max(100000),
  agentEmptyResponseCount: z.number().int().min(0).max(100000),
  backgroundFailureCount: z.number().int().min(0).max(100000),
  lifecycleFailureCount: z.number().int().min(0).max(100000),
  lifecycleFailureShare: z.number().min(0).max(1),
  dominantBackgroundFailureCategory: runFailureCategorySchema.optional()
});

export const runDiagnosticsPromptHashSchema = z.object({
  sourceType: z.enum(["agent-run", "background-job-run"]),
  promptHash: z.string().min(1).max(64),
  assistantId: assistantIdSchema.optional(),
  jobId: backgroundJobIdSchema.optional(),
  runCount: z.number().int().min(0).max(100000),
  averagePromptChars: z.number().int().min(0).max(2_000_000),
  latestSeenAt: z.string().datetime().or(z.string().min(1))
});

export const runDiagnosticsOwnerPromptSchema = z.object({
  assistantId: assistantIdSchema.optional(),
  jobId: backgroundJobIdSchema.optional(),
  runCount: z.number().int().min(0).max(100000),
  averagePromptChars: z.number().int().min(0).max(2_000_000),
  latestSeenAt: z.string().datetime().or(z.string().min(1))
});

export const runDiagnosticsFailureBreakdownSchema = z.object({
  sourceType: z.enum(["agent-run", "background-job-run"]),
  failureCategory: runFailureCategorySchema,
  count: z.number().int().min(0).max(100000),
  share: z.number().min(0).max(1),
  assistantId: assistantIdSchema.optional(),
  jobId: backgroundJobIdSchema.optional()
});

export const runDiagnosticsBackoffJobSchema = z.object({
  jobId: backgroundJobIdSchema,
  jobName: z.string().min(1).max(256),
  assistantId: assistantIdSchema.optional(),
  consecutiveFailureCount: z.number().int().min(0).max(100000),
  backoffUntil: z.string().datetime().or(z.string().min(1)),
  lastFailureCategory: runFailureCategorySchema.optional()
});

export const runDiagnosticsReportSchema = z.object({
  windowDays: runDiagnosticsWindowDaysSchema,
  generatedAt: z.string().datetime().or(z.string().min(1)),
  summary: runDiagnosticsSummarySchema,
  topPromptHashes: z.array(runDiagnosticsPromptHashSchema).max(64),
  promptSizeByOwner: z.array(runDiagnosticsOwnerPromptSchema).max(128),
  failureBreakdown: z.array(runDiagnosticsFailureBreakdownSchema).max(256),
  dailyFailureSeries: z.array(
    z.object({
      day: z.string().min(1).max(32),
      sourceType: z.enum(["agent-run", "background-job-run"]),
      failureCategory: runFailureCategorySchema,
      count: z.number().int().min(0).max(100000),
      jobId: backgroundJobIdSchema.optional()
    })
  ).max(512),
  activeBackoffJobRows: z.array(runDiagnosticsBackoffJobSchema).max(128)
});

export const agentPlanSchema = z.object({
  sessionId: sessionIdSchema,
  agentId: agentIdSchema,
  planningModelId: providerModelIdSchema,
  difficultyScore: z.number().min(0).max(100),
  usesSubagents: z.boolean(),
  executionModelId: executionModelIdSchema,
  subtaskCount: z.number().int().min(0),
  executionPlan: executionPlanSchema.optional()
});

export const agentTraceSchema = z.object({
  sessionId: sessionIdSchema,
  stage: agentTraceStageSchema,
  message: z.string().min(1),
  detail: z.string().min(1).optional(),
  subagentId: z.string().min(1).max(128).optional(),
  modelId: executionModelIdSchema.optional(),
  durationMs: z.number().int().min(0).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const projectContextSourceKindSchema = z.enum(["planner", "main", "subagent", "aggregator"]);

export const browserApprovalStatusSchema = z.enum(["pending", "deferred", "approved", "rejected"]);
export const browserSessionStatusSchema = z.enum(["idle", "awaiting-approval", "running", "blocked", "completed", "failed"]);
export const browserActivityKindSchema = z.enum(["navigate", "click", "input", "capture", "extract", "verify", "tool", "unknown"]);
export const browserActivityStatusSchema = z.enum(["pending-approval", "running", "completed", "blocked", "failed"]);
export const executionToolActivityCategorySchema = z.enum(["shell", "browser", "web", "mcp", "other"]);
export const executionToolActivityStatusSchema = z.enum(["running", "completed", "failed", "timed-out"]);

export const browserApprovalSchema = z.object({
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(128),
  kind: browserActivityKindSchema,
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional(),
  status: browserApprovalStatusSchema,
  requestedAt: z.string().datetime().or(z.string().min(1)),
  resolvedAt: z.string().datetime().or(z.string().min(1)).optional(),
  resolutionReason: z.string().min(1).max(4000).optional()
});

export const browserReplayEntrySchema = z.object({
  id: z.string().min(1).max(128),
  status: browserActivityStatusSchema,
  summary: z.string().min(1).max(4000),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const browserVerificationSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  status: z.enum(["passed", "failed", "unknown"]),
  detail: z.string().min(1).max(4000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const browserActivitySchema = z.object({
  id: z.string().min(1).max(128),
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(128),
  kind: browserActivityKindSchema,
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional(),
  outputSummary: z.string().min(1).max(4000).optional(),
  status: browserActivityStatusSchema,
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  errorMessage: z.string().min(1).max(4000).optional(),
  approval: browserApprovalSchema.optional(),
  replay: z.array(browserReplayEntrySchema).max(64),
  verification: z.array(browserVerificationSchema).max(32)
});

export function deriveBrowserSessionStatus(activities: Array<z.infer<typeof browserActivitySchema>>) {
  if (activities.some((activity) => activity.status === "pending-approval" && activity.approval?.status === "pending"))
    return "awaiting-approval" as const;
  if (activities.some((activity) => activity.status === "running" ||
    (activity.status === "pending-approval" && activity.approval?.status === "deferred"))) return "running" as const;
  if (activities.some((activity) => activity.status === "failed")) return "failed" as const;
  if (activities.some((activity) => activity.status === "blocked")) return "blocked" as const;
  return activities.length > 0 ? "completed" as const : "idle" as const;
}

export const browserSessionSchema = z.object({
  id: z.string().min(1).max(128),
  runId: runIdSchema,
  owner: z.enum(["main", "subagent", "aggregator"]),
  subagentId: z.string().min(1).max(128).optional(),
  status: browserSessionStatusSchema,
  approvalMode: z.literal("per-tool"),
  lastActivityLabel: z.string().min(1).max(256).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  pendingApproval: browserApprovalSchema.optional(),
  activities: z.array(browserActivitySchema).max(256)
});

export const executionToolActivitySchema = z.object({
  id: z.string().min(1).max(128),
  runId: runIdSchema,
  owner: z.enum(["main", "subagent", "aggregator"]),
  subagentId: z.string().min(1).max(128).optional(),
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(128),
  category: executionToolActivityCategorySchema,
  command: z.string().min(1).max(4000).optional(),
  argsSummary: z.string().min(1).max(4000).optional(),
  outputPreview: z.string().min(1).max(4000).optional(),
  stdoutPreview: z.string().min(1).max(4000).optional(),
  stderrPreview: z.string().min(1).max(4000).optional(),
  rawArgsJson: z.string().min(1).max(65536).optional(),
  rawArgsTruncated: z.boolean().optional(),
  rawArgsRedacted: z.boolean().optional(),
  rawArgsOmittedReason: z.enum(["run-budget-exceeded", "unserializable"]).optional(),
  rawArgsDebugArtifactPath: z.string().min(1).max(1024).optional(),
  rawResultJson: z.string().min(1).max(65536).optional(),
  rawResultTruncated: z.boolean().optional(),
  rawResultRedacted: z.boolean().optional(),
  rawResultOmittedReason: z.enum(["run-budget-exceeded", "unserializable"]).optional(),
  rawResultDebugArtifactPath: z.string().min(1).max(1024).optional(),
  rawResultStatus: z.enum(["partial", "final"]).optional(),
  exitCode: z.number().int().optional(),
  status: executionToolActivityStatusSchema,
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const projectContextUsageSchema = z.object({
  sourceKind: projectContextSourceKindSchema,
  sourceLabel: z.string().min(1).max(128),
  modelId: executionModelIdSchema,
  tokens: z.number().int().min(0).optional(),
  contextWindow: z.number().int().min(1),
  usagePercent: z.number().min(0).max(100).optional(),
  totalProcessedTokens: z.number().int().min(0).optional(),
  cachedInputTokens: z.number().int().min(0).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const runPreflightSchema = z.discriminatedUnion("kind", [
  z.object({
    severity: z.literal("warning"),
    kind: z.literal("git-dirty"),
    message: z.string().min(1),
    changedFileCount: z.number().int().min(1)
  }),
  z.object({
    severity: z.literal("blocking"),
    kind: z.literal("git-not-repo"),
    message: z.string().min(1),
    changedFileCount: z.literal(0),
    repairSummary: z.string().min(1).max(512),
    repairDetail: z.string().min(1).max(2048).optional()
  })
]);

export const plannerSubtaskSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1)
});

export const planningChoiceSchema = z.object({
  id: planningChoiceIdSchema,
  label: z.string().min(1).max(128),
  description: z.string().min(1).max(256),
  answerText: z.string().min(1).max(32000),
  recommended: z.boolean()
});

export const assistantActionPlanningIntentSchema = z.object({
  type: z.literal("assistant-action-intent"),
  actionKind: assistantActionKindSchema,
  sourcePrompt: z.string().min(1).max(32000),
  assistantSelector: z.string().min(1).max(256).optional(),
  candidateAssistantIds: z.array(assistantIdSchema).max(8).optional(),
  candidateJobIds: z.array(backgroundJobIdSchema).max(8).optional(),
  candidateQuestionIds: z.array(assistantQuestionIdSchema).max(8).optional(),
  candidateTodoIds: z.array(assistantTodoIdSchema).max(8).optional(),
  scheduleText: z.string().min(1).max(512).optional(),
  jobPrompt: z.string().min(1).max(32000).optional(),
  jobId: backgroundJobIdSchema.optional(),
  questionId: assistantQuestionIdSchema.optional(),
  todoId: assistantTodoIdSchema.optional(),
  answerText: z.string().min(1).max(32000).optional()
});

export const planningQuestionIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assistant-create-intent"),
    projectId: projectIdSchema,
    threadId: threadIdSchema,
    sourcePrompt: z.string().min(1).max(32000),
    suggestedName: z.string().min(1).max(256),
    defaultScope: assistantScopeSchema,
    purpose: z.string().min(1).max(12000).optional(),
    requiresPurpose: z.boolean().optional()
  }),
  assistantActionPlanningIntentSchema
]);

export const agentRunStatusSchema = z.enum([
  "planning",
  "awaiting-user-input",
  "ready",
  "running-main",
  "running-subagents",
  "aggregating",
  "partial-complete",
  "completed",
  "stopped",
  "failed"
]);

export function isTerminalAgentRunStatus(status: z.infer<typeof agentRunStatusSchema>) {
  return status === "partial-complete" || status === "completed" || status === "stopped" || status === "failed";
}

export const planningQuestionStatusSchema = z.enum(["pending", "deferred", "answered"]);

const planningChoicesSchema = z
  .array(planningChoiceSchema)
  .length(3)
  .refine((choices) => choices.filter((choice) => choice.recommended).length === 1, {
    message: "Planning questions must include exactly one recommended choice"
  });

export const planningQuestionSchema = z.object({
  id: questionIdSchema,
  logicalQuestionId: questionIdSchema.optional(),
  prompt: z.string().min(1),
  placeholder: z.string().min(1).optional(),
  responseKind: z.enum(["choice", "freeform"]).optional(),
  choices: planningChoicesSchema.optional(),
  required: z.boolean(),
  status: planningQuestionStatusSchema,
  answerText: z.string().min(1).optional(),
  intent: planningQuestionIntentSchema.optional(),
  askedAt: z.string().datetime().or(z.string().min(1)),
  answeredAt: z.string().datetime().or(z.string().min(1)).optional()
}).superRefine((question, ctx) => {
  if (question.responseKind === "freeform") {
    if (!question.placeholder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["placeholder"],
        message: "Freeform planning questions require a placeholder"
      });
    }
    return;
  }
  if (!question.choices) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["choices"],
      message: "Choice planning questions require choices"
    });
  }
});

export const subagentTaskStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const subagentTaskStateSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: subagentTaskStatusSchema,
  attemptCount: z.number().int().min(0),
  output: z.string().min(1).optional(),
  errorMessage: z.string().min(1).optional(),
  commitSha: z.string().min(1).optional(),
  mountPath: z.string().min(1).optional(),
  worktreePath: z.string().min(1).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)).optional(),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const threadRunSequenceSchema = z.number().int().positive().safe();
const agentRunStateShapeSchema = z.object({
  id: runIdSchema,
  threadId: threadIdSchema,
  threadRunSequence: threadRunSequenceSchema.optional(),
  status: agentRunStatusSchema,
  latestUserPrompt: z.string().min(1),
  planningModelId: providerModelIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  difficultyScore: z.number().min(0).max(100).optional(),
  summary: z.string().min(1).optional(),
  finalExecutionBrief: z.string().min(1).optional(),
  failureMessage: z.string().min(1).optional(),
  failureCategory: runFailureCategorySchema.optional(),
  runtimeBudget: runRuntimeBudgetSchema.optional(),
  promptStats: runPromptStatsSchema.optional(),
  executionTarget: runExecutionTargetSchema.optional(),
  plan: executionPlanSchema.optional(),
  correctnessReview: correctnessReviewSchema.optional(),
  questions: z.array(planningQuestionSchema),
  subtasks: z.array(subagentTaskStateSchema),
  browserSessions: z.array(browserSessionSchema).max(32).optional(),
  toolActivities: z.array(executionToolActivitySchema).max(512).optional(),
  experiment: experimentRunSchema.optional(),
  ledger: z
    .object({
      currentPhase: z.string().min(1).max(120).optional(),
      lastVerifiedAt: z.string().datetime().or(z.string().min(1)).optional(),
      nextStep: z.string().min(1).max(240).optional(),
      waitingOn: z.string().min(1).max(240).optional(),
      failureClass: z.string().min(1).max(120).optional(),
      contextUsage: z.string().min(1).max(120).optional(),
      notableCostOrTokenSpike: z.string().min(1).max(240).optional()
    })
    .optional(),
  proofBundle: z
    .object({
      diffSummary: z.string().max(2000).optional(),
      commands: z.array(z.string().max(240)).max(24).optional(),
      browserEvidenceRefs: z.array(z.string().max(240)).max(24).optional(),
      approvals: z.array(z.string().max(240)).max(24).optional(),
      finalReviewNotes: z.string().max(2000).optional(),
      followUpPrompt: z.string().max(1000).optional()
    })
    .optional(),
  memoryRetrievals: z.array(memoryRetrievalSchema).max(128).optional(),
  resumable: z.boolean(),
  retryable: z.boolean(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  detailState: z.enum(["complete", "summary", "unavailable"]).optional()
});

export const agentRunStateSchema = agentRunStateShapeSchema.superRefine((run, context) => {
  requireAgentRunOwnership(run, context); requireUniqueAgentRunChildren(run, context);
  visitBrowserApprovalIntegrity(run, true, (message, path) => { context.addIssue({ code: "custom", message, path }); return true; });
});

type RunStateShape = z.infer<typeof agentRunStateShapeSchema>;
type RunChildVisitor = (id: string, path?: (string | number)[]) => boolean;

function visitRunOwnership(run: RunStateShape, withPaths: boolean, visit: RunChildVisitor) {
  if (run.plan && !visit(run.plan.runId, withPaths ? ["plan", "runId"] : undefined)) return false;
  if (run.correctnessReview?.recommendedPlan && !visit(run.correctnessReview.recommendedPlan.runId,
    withPaths ? ["correctnessReview", "recommendedPlan", "runId"] : undefined)) return false;
  for (let index = 0; index < (run.browserSessions?.length ?? 0); index += 1)
    if (!visit(run.browserSessions![index]!.runId, withPaths ? ["browserSessions", index, "runId"] : undefined)) return false;
  for (let index = 0; index < (run.toolActivities?.length ?? 0); index += 1)
    if (!visit(run.toolActivities![index]!.runId, withPaths ? ["toolActivities", index, "runId"] : undefined)) return false;
  if (run.experiment && !visit(run.experiment.runId, withPaths ? ["experiment", "runId"] : undefined)) return false;
  for (let index = 0; index < (run.memoryRetrievals?.length ?? 0); index += 1)
    if (!visit(run.memoryRetrievals![index]!.runId, withPaths ? ["memoryRetrievals", index, "runId"] : undefined)) return false;
  return true;
}

export function requireAgentRunOwnership(run: RunStateShape, context: z.RefinementCtx) {
  visitRunOwnership(run, true, (runId, path) => { if (runId !== run.id) context.addIssue({ code: "custom",
    message: "Run-owned child must match the parent run", path }); return true; });
}

export function hasValidAgentRunOwnership(run: RunStateShape) {
  return visitRunOwnership(run, false, (runId) => runId === run.id);
}

function requireUniqueAgentRunChildren(run: RunStateShape, context: z.RefinementCtx) {
  visitRunIdentityGroups(run, true, (id, path, seen) => {
    if (seen.has(id)) context.addIssue({ code: "custom", message: "Run child IDs must be unique", path });
    seen.add(id); return true;
  });
  visitRunToolCallIds(run, true, (id, path, seen) => {
    if (seen.has(id)) context.addIssue({ code: "custom", message: "Run tool call IDs must be unique", path });
    seen.add(id); return true;
  });
}

type RunIdentityVisitor = (id: string, path: (string | number)[] | undefined, seen: Set<string>) => boolean;
const emptyIdentityPath = () => [];
function visitIdentityArray(items: Array<{ id: string }>, withPaths: boolean, path: (index: number) => (string | number)[],
  visit: RunIdentityVisitor, sharedSeen?: Set<string>) {
  if (!sharedSeen && items.length < 2) return true;
  const seen = sharedSeen ?? new Set<string>();
  for (let index = 0; index < items.length; index += 1)
    if (!visit(items[index]!.id, withPaths ? path(index) : undefined, seen)) return false;
  return true;
}

function visitRunIdentityGroups(run: RunStateShape, withPaths: boolean, visit: RunIdentityVisitor) {
  const topLevel = [[run.questions, "questions"], [run.subtasks, "subtasks"], [run.browserSessions ?? [], "browserSessions"],
    [run.toolActivities ?? [], "toolActivities"], [run.memoryRetrievals ?? [], "memoryRetrievals"]] as const;
  for (const [items, field] of topLevel)
    if (!visitIdentityArray(items, withPaths, withPaths ? (index) => [field, index, "id"] : emptyIdentityPath, visit)) return false;
  const activityIds = new Set<string>();
  for (let sessionIndex = 0; sessionIndex < (run.browserSessions?.length ?? 0); sessionIndex += 1) {
    const activities = run.browserSessions![sessionIndex]!.activities;
    if (!visitIdentityArray(activities, withPaths, withPaths ? (activityIndex) => ["browserSessions", sessionIndex, "activities", activityIndex, "id"] : emptyIdentityPath,
      visit, activityIds)) return false;
    for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
      const activity = activities[activityIndex]!;
      if (!visitIdentityArray(activity.replay, withPaths, withPaths ? (index) => ["browserSessions", sessionIndex, "activities",
        activityIndex, "replay", index, "id"] : emptyIdentityPath, visit)) return false;
      if (!visitIdentityArray(activity.verification, withPaths, withPaths ? (index) => ["browserSessions", sessionIndex, "activities",
        activityIndex, "verification", index, "id"] : emptyIdentityPath, visit)) return false;
    }
  }
  return true;
}

function visitRunToolCallIds(run: RunStateShape, withPaths: boolean, visit: RunIdentityVisitor) {
  const activities = run.toolActivities ?? [];
  if (activities.length < 2) return true;
  const seen = new Set<string>();
  for (let index = 0; index < activities.length; index += 1)
    if (!visit(activities[index]!.toolCallId,
      withPaths ? ["toolActivities", index, "toolCallId"] : undefined, seen)) return false;
  return true;
}

export function hasUniqueAgentRunChildren(run: RunStateShape) {
  const unique = (id: string, _path: (string | number)[] | undefined, seen: Set<string>) => {
    if (seen.has(id)) return false; seen.add(id); return true;
  };
  return visitRunIdentityGroups(run, false, unique) && visitRunToolCallIds(run, false, unique);
}

type BrowserApprovalIntegrityVisitor = (message: string, path?: (string | number)[]) => boolean;
function visitBrowserApprovalIntegrity(run: RunStateShape, withPaths: boolean, issue: BrowserApprovalIntegrityVisitor) {
  for (let sessionIndex = 0; sessionIndex < (run.browserSessions?.length ?? 0); sessionIndex += 1) {
    const session = run.browserSessions![sessionIndex]!, toolCallIds = new Set<string>();
    for (let activityIndex = 0; activityIndex < session.activities.length; activityIndex += 1) {
      const activity = session.activities[activityIndex]!;
      if (toolCallIds.has(activity.toolCallId) && !issue("Browser activity tool call IDs must be unique per session",
        withPaths ? ["browserSessions", sessionIndex, "activities", activityIndex, "toolCallId"] : undefined)) return false;
      toolCallIds.add(activity.toolCallId);
      if (activity.approval && activity.approval.toolCallId !== activity.toolCallId &&
        !issue("Browser activity approval must match its tool call",
          withPaths ? ["browserSessions", sessionIndex, "activities", activityIndex, "approval", "toolCallId"] : undefined)) return false;
      const awaitingApproval = activity.approval?.status === "pending" || activity.approval?.status === "deferred";
      if ((activity.status === "pending-approval") !== awaitingApproval &&
        !issue("Pending browser activity and approval statuses must correspond",
          withPaths ? ["browserSessions", sessionIndex, "activities", activityIndex, "status"] : undefined)) return false;
    }
    let pendingCount = 0, matchingCount = 0;
    for (const activity of session.activities) if (activity.status === "pending-approval" && activity.approval?.status === "pending") {
      pendingCount += 1;
      if (session.pendingApproval && activity.toolCallId === session.pendingApproval.toolCallId &&
        browserApprovalsEqual(activity.approval, session.pendingApproval)) matchingCount += 1;
    }
    const coherentPending = session.pendingApproval ? session.status === "awaiting-approval" && pendingCount === 1 && matchingCount === 1 :
      session.status !== "awaiting-approval" && pendingCount === 0;
    if (!coherentPending && !issue("Browser session pending approval must match exactly one pending activity",
      withPaths ? ["browserSessions", sessionIndex, "pendingApproval"] : undefined)) return false;
    if (session.status !== deriveBrowserSessionStatus(session.activities) && !issue("Browser session status must match its activities",
      withPaths ? ["browserSessions", sessionIndex, "status"] : undefined)) return false;
  }
  return true;
}

function browserApprovalsEqual(left: z.infer<typeof browserApprovalSchema>, right: z.infer<typeof browserApprovalSchema>) {
  return left.toolCallId === right.toolCallId && left.toolName === right.toolName && left.kind === right.kind && left.label === right.label &&
    left.inputSummary === right.inputSummary && left.status === right.status && left.requestedAt === right.requestedAt &&
    left.resolvedAt === right.resolvedAt && left.resolutionReason === right.resolutionReason;
}

export function hasValidBrowserApprovalIntegrity(run: RunStateShape) {
  return visitBrowserApprovalIntegrity(run, false, () => false);
}

export const agentRunSummarySchema = z.object({
  id: runIdSchema,
  threadId: threadIdSchema,
  threadRunSequence: threadRunSequenceSchema.optional(),
  status: agentRunStatusSchema,
  failureMessage: z.string().min(1).optional(),
  failureCategory: runFailureCategorySchema.optional(),
  runtimeBudget: runRuntimeBudgetSchema.optional(),
  promptStats: runPromptStatsSchema.optional(),
  resumable: z.boolean(),
  retryable: z.boolean(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional()
});

const plannerQuestionDraftSchema = z.object({
  id: questionIdSchema,
  prompt: z.string().min(1),
  placeholder: z.string().min(1).optional(),
  choices: z
    .array(planningChoiceSchema)
    .length(3)
    .refine((choices) => choices.filter((choice) => choice.recommended).length === 1, {
      message: "Planner questions must include exactly one recommended choice"
    }),
  required: z.literal(true)
});

export const plannerQuestionTurnSchema = z.object({
  type: z.literal("question"),
  summary: z.string().min(1),
  question: plannerQuestionDraftSchema,
  questions: z.array(plannerQuestionDraftSchema).max(5).optional().default([])
});

export const plannerReadyTurnSchema = z.object({
  type: z.literal("ready"),
  difficultyScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  executionModelId: executionModelIdSchema,
  usesSubagents: z.boolean(),
  subtasks: z.array(plannerSubtaskSchema).max(8),
  finalExecutionBrief: z.string().min(1),
  prerequisites: z.array(planPrerequisiteSchema).max(16).optional(),
  contracts: z.array(subagentContractSchema).max(16).optional()
});

export const plannerTurnResultSchema = z.discriminatedUnion("type", [
  plannerQuestionTurnSchema,
  plannerReadyTurnSchema
]);

export const plannerResultSchema = plannerTurnResultSchema;

export type AssistantActionPlanningIntent = z.infer<typeof assistantActionPlanningIntentSchema>;
export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type AgentTrace = z.infer<typeof agentTraceSchema>;
export type ProjectContextSourceKind = z.infer<typeof projectContextSourceKindSchema>;
export type BrowserApprovalStatus = z.infer<typeof browserApprovalStatusSchema>;
export type BrowserSessionStatus = z.infer<typeof browserSessionStatusSchema>;
export type BrowserActivityKind = z.infer<typeof browserActivityKindSchema>;
export type BrowserActivityStatus = z.infer<typeof browserActivityStatusSchema>;
export type BrowserApproval = z.infer<typeof browserApprovalSchema>;
export type BrowserReplayEntry = z.infer<typeof browserReplayEntrySchema>;
export type BrowserVerification = z.infer<typeof browserVerificationSchema>;
export type BrowserActivity = z.infer<typeof browserActivitySchema>;
export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type ExecutionToolActivityCategory = z.infer<typeof executionToolActivityCategorySchema>;
export type ExecutionToolActivityStatus = z.infer<typeof executionToolActivityStatusSchema>;
export type ExecutionToolActivity = z.infer<typeof executionToolActivitySchema>;
export type ProjectContextUsage = z.infer<typeof projectContextUsageSchema>;
export type RunPreflight = z.infer<typeof runPreflightSchema>;
export type PlannerSubtask = z.infer<typeof plannerSubtaskSchema>;
export type PlanningChoice = z.infer<typeof planningChoiceSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type PlanningQuestionStatus = z.infer<typeof planningQuestionStatusSchema>;
export type PlanningQuestion = z.infer<typeof planningQuestionSchema>;
export type SubagentTaskStatus = z.infer<typeof subagentTaskStatusSchema>;
export type SubagentTaskState = z.infer<typeof subagentTaskStateSchema>;
export type AgentRunState = z.infer<typeof agentRunStateSchema>;
export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>;
export type PlannerQuestionTurn = z.infer<typeof plannerQuestionTurnSchema>;
export type PlannerReadyTurn = z.infer<typeof plannerReadyTurnSchema>;
export type PlannerTurnResult = z.infer<typeof plannerTurnResultSchema>;
export type PlannerResult = z.infer<typeof plannerResultSchema>;
export type RunFailureCategory = z.infer<typeof runFailureCategorySchema>;
export type RunPromptStats = z.infer<typeof runPromptStatsSchema>;
export type RunRuntimeBudget = z.infer<typeof runRuntimeBudgetSchema>;
export type RunDiagnosticsWindowDays = z.infer<typeof runDiagnosticsWindowDaysSchema>;
export type RunDiagnosticsSummary = z.infer<typeof runDiagnosticsSummarySchema>;
export type RunDiagnosticsPromptHash = z.infer<typeof runDiagnosticsPromptHashSchema>;
export type RunDiagnosticsOwnerPrompt = z.infer<typeof runDiagnosticsOwnerPromptSchema>;
export type RunDiagnosticsFailureBreakdown = z.infer<typeof runDiagnosticsFailureBreakdownSchema>;
export type RunDiagnosticsBackoffJob = z.infer<typeof runDiagnosticsBackoffJobSchema>;
export type RunDiagnosticsReport = z.infer<typeof runDiagnosticsReportSchema>;
