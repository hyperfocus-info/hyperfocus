import { z } from "zod";

export const requestIdSchema = z.string().min(1).max(128);
export const commandRejectionCodeSchema = z.enum(["invalid-cursor"]);
export const BACKGROUND_JOB_DELETION_CHUNK_LIMIT = 512;
export const STREAM_DELTA_MAX_BYTES = 8 * 1024;
export const SERVER_EVENT_BATCH_MAX_ITEMS = 256;
// Ready snapshots can legitimately exceed a batched stream payload. Keep a
// finite pre-parse ceiling with enough headroom for those bounded snapshots.
export const SERVER_EVENT_FRAME_MAX_BYTES = 32 * 1024 * 1024;
export const SERVER_EVENT_EMIT_MAX_BYTES = 24 * 1024 * 1024;
export const WORKSPACE_PROJECT_PAGE_LIMIT = 128;
export const WORKSPACE_BOOTSTRAP_PROJECT_LIMIT = WORKSPACE_PROJECT_PAGE_LIMIT + 1;
export const WORKSPACE_THREAD_PAGE_LIMIT = 256;
export const WORKSPACE_MESSAGE_PAGE_LIMIT = 256;
export const WORKSPACE_RUN_SUMMARY_PAGE_LIMIT = 128;
export const WORKSPACE_FILE_PATH_PAGE_LIMIT = 512;
export const boundedStreamDeltaSchema = z.string().max(STREAM_DELTA_MAX_BYTES).superRefine((value, context) => {
  if (getUtf8ByteLength(value) > STREAM_DELTA_MAX_BYTES) {
    context.addIssue({
      code: "custom",
      message: `Stream delta exceeds ${STREAM_DELTA_MAX_BYTES} UTF-8 bytes`
    });
  }
});

export function getUtf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    }
    else bytes += 3;
  }
  return bytes;
}
// Covers JSON's worst-case six-character escaping for bounded 128-character
// owner and row ids plus a repaired 256-character persisted sort timestamp.
export const BOUNDED_PAGE_CURSOR_MAX_LENGTH = 4096;
export const boundedPageCursorSchema = z.string().min(1).max(BOUNDED_PAGE_CURSOR_MAX_LENGTH);
export const boundedPageLimitSchema = z.number().int().min(1).max(512);
export const READY_CONTINUATION_PAGE_LIMIT = 16;
export function createBoundedPageSchema<ItemSchema extends z.ZodType<{ id: string }>>(itemSchema: ItemSchema, maxItems = 512) {
  return z.object({
    items: z.array(itemSchema).max(maxItems),
    unavailableItems: z.array(z.object({ id: z.string().min(1).max(128),
      reason: z.literal("item-too-large"), projectId: z.string().min(1).max(128).optional(),
      jobId: z.string().min(1).max(128).optional() })).max(maxItems).optional(),
    nextCursor: boundedPageCursorSchema.optional(),
    totalApprox: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
  }).superRefine(({ items, unavailableItems }, context) => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({ code: "custom", message: "Page items must contain unique IDs", path: ["items", index, "id"] });
      ids.add(item.id);
    });
    unavailableItems?.forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({ code: "custom", message: "Unavailable item IDs must be unique and disjoint from page items",
        path: ["unavailableItems", index, "id"] });
      ids.add(item.id);
    });
  });
}

export const sessionIdSchema = z.string().min(1).max(128);
export const threadIdSchema = z.string().min(1).max(128);
export const projectIdSchema = z.string().min(1).max(128);
export const runIdSchema = z.string().min(1).max(128);
export const experimentIdSchema = z.string().min(1).max(128);
export const memoryEntryIdSchema = z.string().min(1).max(128);
export const memoryRetrievalIdSchema = z.string().min(1).max(128);
export const backgroundJobIdSchema = z.string().min(1).max(128);
export const backgroundJobRunIdSchema = z.string().min(1).max(128);
export const assistantIdSchema = z.string().min(1).max(128);
export const assistantThreadIdSchema = z.string().min(1).max(128);
export const assistantTodoIdSchema = z.string().min(1).max(128);
export const assistantLearningIdSchema = z.string().min(1).max(128);
export const assistantQuestionIdSchema = z.string().min(1).max(128);
export const assistantLogEntryIdSchema = z.string().min(1).max(128);
export const assistantAssetRefIdSchema = z.string().min(1).max(128);
export const questionIdSchema = z.string().min(1).max(128);
export const planningChoiceIdSchema = z.string().min(1).max(128);
export const modeIdSchema = z.string().min(1).max(128);
export const projectNameSchema = z.string().min(1).max(256);
export const projectRootPathSchema = z.string().min(1).max(4096);
export const projectSearchRepoKindSchema = z.enum(["git-repo", "folder"]);
export const projectSearchMatchKindSchema = z.enum(["exact", "path-prefix", "name-prefix", "substring"]);
export const threadTitleSchema = z.string().trim().min(1).max(256);
export const agentIdSchema = z.enum(["pi", "copilot-cli", "codex-cli"]);
export const cliUpdateTargetIdSchema = z.enum(["pi", "copilot-cli", "codex-cli", "claude-cli"]);
export const providerBrandSchema = z.enum(["gpt", "gemini", "claude"]);
export const runtimeKindSchema = z.enum(["sdk", "cli"]);
export const modelDiscoveryConfidenceSchema = z.enum(["exact", "partial", "unknown"]);
export const composerReasoningStrengthSchema = z.enum(["low", "medium", "high", "extra-high"]);
export const setupLaunchModeSchema = z.enum(["source", "portable-launcher"]);
export const setupCheckStatusSchema = z.enum(["ready", "action-required", "warning", "unsupported"]);
export const setupActionKindSchema = z.enum([
  "open-project-switcher",
  "open-preferences",
  "refresh-runtime-health",
  "copy-command",
  "open-url",
  "start-tutorial",
  "init-git-baseline",
  "disable-dirty-git-check"
]);
export const subagentWorktreeStrategySchema = z.enum(["same-worktree", "separate-worktrees"]);
export const runExecutionTargetSchema = z.enum(["current-project", "ephemeral-experiment"]);
export const planExecutionModeSchema = z.enum(["countdown", "approve", "immediate"]);
export const correctnessIterationModeSchema = z.enum(["ask-before-iterate", "auto-once", "auto-until-clean"]);
export const dirtyGitChangeLimitSchema = z.number().int().min(0).max(10000);
export const autoCompactContextThresholdPercentSchema = z.number().int().min(10).max(95);
export const preflightSeveritySchema = z.enum(["warning", "blocking"]);
export const preflightKindSchema = z.enum(["git-dirty", "git-not-repo"]);
export const threadTitleSourceSchema = z.preprocess(
  (value) => (value === "manual" ? "custom" : value),
  z.enum(["generated", "custom"])
);
export const threadBadgeStateSchema = z.enum(["idle", "needs-input", "planning", "executing", "error", "done"]);
export const backgroundJobKindSchema = z.enum(["ai-routine", "shell"]);
export const backgroundJobStatusSchema = z.enum(["enabled", "paused", "disabled"]);
export const backgroundJobSchedulerStatusSchema = z.enum(["idle", "due", "queued", "blocked", "running", "stale"]);
export const backgroundJobLaneSchema = z.enum(["exclusive", "concurrent"]);
export const backgroundJobRunStatusSchema = z.enum([
  "queued",
  "awaiting-approval",
  "awaiting-user-input",
  "running",
  "succeeded",
  "partial-complete",
  "failed",
  "cancelled",
  "skipped"
]);
export const backgroundJobRiskLevelSchema = z.enum(["safe", "slightly-unsafe", "unsafe"]);
export const backgroundJobApprovalPolicySchema = z.enum(["allow-all", "allow-safe", "ask-risky", "always-ask"]);
export const backgroundJobThreadKindSchema = z.enum(["user", "automation"]);
export const intentArtifactTypeSchema = z.enum([
  "app-code",
  "automation-code",
  "documentation",
  "research",
  "test-evidence",
  "deployment",
  "question",
  "unknown"
]);
export const modeScopeSchema = z.enum(["builtin", "workspace", "project"]);
export const modeToolPolicySchema = z.enum(["full-access", "read-heavy", "review-only"]);
export const modeExecutionAccessSchema = z.enum(["workspace-write", "read-only"]);
export const capabilityTagSchema = z.enum(["tools", "vision", "browser", "long-context", "fast", "expensive"]);
export const assistantScopeSchema = z.enum(["global", "project"]);
export const assistantRunStateSchema = z.enum(["active", "paused"]);
export const assistantBootstrapStateSchema = z.enum(["pending", "running", "completed", "failed"]);
export const assistantCircuitBreakerStateSchema = z.enum(["closed", "tripped"]);
export const assistantTodoStateSchema = z.enum(["pending", "in-progress", "blocked", "completed", "failed", "cancelled"]);
export const assistantTodoWorkKindSchema = z.enum([
  "app-code",
  "automation-code",
  "documentation",
  "research",
  "blocked",
  "unspecified"
]);
export const assistantQuestionStatusSchema = z.enum(["pending", "deferred", "answered", "dismissed"]);
export const assistantLearningConfidenceSchema = z.enum(["low", "medium", "high"]);
export const assistantLogLevelSchema = z.enum(["info", "warning", "error", "critical"]);
export const assistantAssetRefKindSchema = z.enum(["skill", "script", "mode", "background-template"]);
export const assistantAssetRefScopeSchema = z.enum(["workspace", "project"]);
export const assistantAssetRefProvenanceSchema = z.enum([
  "repo-skill",
  "global-skill",
  "repo-script",
  "workspace-mode",
  "project-mode",
  "background-template"
]);
export const assistantAssetRefResolutionStatusSchema = z.enum(["resolved", "missing", "out-of-scope"]);
export const bulkOperationTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("background-job"),
    projectId: projectIdSchema,
    jobId: backgroundJobIdSchema
  }),
  z.object({
    kind: z.literal("background-run"),
    projectId: projectIdSchema,
    runId: backgroundJobRunIdSchema
  }),
  z.object({
    kind: z.literal("assistant"),
    assistantId: assistantIdSchema
  }),
  z.object({
    kind: z.literal("project"),
    projectId: projectIdSchema
  })
]);
export const bulkOperationActionSchema = z.enum([
  "pause",
  "resume",
  "delete",
  "run-now",
  "stop",
  "retry",
  "approve",
  "reject",
  "bootstrap-retry"
]);
export const bulkOperationItemStatusSchema = z.enum(["ready", "blocked", "applied", "failed", "skipped"]);
export const bulkOperationItemResultSchema = z.object({
  target: bulkOperationTargetSchema,
  status: bulkOperationItemStatusSchema,
  label: z.string().min(1).max(256),
  message: z.string().min(1).max(512),
  destructive: z.boolean(),
  live: z.boolean()
});
export const bulkOperationPayloadSchema = z.object({
  operationId: z.string().min(1).max(128).optional(),
  action: bulkOperationActionSchema,
  targets: z.array(bulkOperationTargetSchema).min(1).max(100)
});
export const bulkOperationResultSchema = z.object({
  operationId: z.string().min(1).max(128),
  action: bulkOperationActionSchema,
  applied: z.boolean(),
  results: z.array(bulkOperationItemResultSchema).max(100)
});
export const assistantActionKindSchema = z.enum([
  "create",
  "chat",
  "inspect",
  "list-jobs",
  "create-job",
  "run-job",
  "pause",
  "resume",
  "clone",
  "answer-question",
  "update-todo",
  "recover"
]);
export const chatAttachmentKindSchema = z.enum(["image", "text", "document"]);
export const chatDocumentTypeSchema = z.enum(["pdf", "docx", "xlsx", "pptx", "odt"]);
export const providerModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/, "Model ids must be provider-qualified");
export const executionModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^(?:[a-zA-Z0-9._:-]+\/)?[a-zA-Z0-9._:-]+$/, "Execution model ids must be provider-qualified or bare CLI ids");

export const chatRoleSchema = z.enum(["system", "user", "assistant"]);
export const chatMessageKindSchema = z.enum(["plain", "plan-summary", "run-milestones"]);
export const connectionStateSchema = z.enum(["disconnected", "connecting", "connected", "stale", "error"]);
export const agentTraceStageSchema = z.enum([
  "planning",
  "planning-question",
  "routing",
  "plan-presented",
  "run-resume",
  "branchfs-mounted",
  "branchfs-inherit-dirty",
  "branchfs-diff-read",
  "branchfs-flushed",
  "branchfs-unmounted",
  "branchfs-size-warning",
  "branchfs-cleanup-warning",
  "branchfs-cleanup-complete",
  "worktree-provision",
  "worktree-cleanup",
  "prerequisite-start",
  "prerequisite-complete",
  "subagent-start",
  "subagent-spawn-timing",
  "subagent-complete",
  "subagent-retry",
  "subagent-error",
  "merge-start",
  "merge-conflict",
  "merge-complete",
  "execution-start",
  "execution-complete",
  "aggregation-start",
  "aggregation-complete",
  "correctness-start",
  "correctness-gap",
  "correctness-complete",
  "verification-start",
  "verification-complete",
  "sync-back",
  "refresh-requested",
  "refresh-deferred",
  "refresh-complete"
]);

export type RequestId = z.infer<typeof requestIdSchema>;
export type CommandRejectionCode = z.infer<typeof commandRejectionCodeSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ThreadId = z.infer<typeof threadIdSchema>;
export type ProjectId = z.infer<typeof projectIdSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type BackgroundJobId = z.infer<typeof backgroundJobIdSchema>;
export type BackgroundJobRunId = z.infer<typeof backgroundJobRunIdSchema>;
export type AssistantId = z.infer<typeof assistantIdSchema>;
export type AssistantThreadId = z.infer<typeof assistantThreadIdSchema>;
export type AssistantTodoId = z.infer<typeof assistantTodoIdSchema>;
export type AssistantLearningId = z.infer<typeof assistantLearningIdSchema>;
export type AssistantQuestionId = z.infer<typeof assistantQuestionIdSchema>;
export type AssistantLogEntryId = z.infer<typeof assistantLogEntryIdSchema>;
export type AssistantAssetRefId = z.infer<typeof assistantAssetRefIdSchema>;
export type QuestionId = z.infer<typeof questionIdSchema>;
export type PlanningChoiceId = z.infer<typeof planningChoiceIdSchema>;
export type ModeId = z.infer<typeof modeIdSchema>;
export type ProjectName = z.infer<typeof projectNameSchema>;
export type ProjectRootPath = z.infer<typeof projectRootPathSchema>;
export type ProjectSearchRepoKind = z.infer<typeof projectSearchRepoKindSchema>;
export type ProjectSearchMatchKind = z.infer<typeof projectSearchMatchKindSchema>;
export type ThreadTitle = z.infer<typeof threadTitleSchema>;
export type AgentId = z.infer<typeof agentIdSchema>;
export type CliUpdateTargetId = z.infer<typeof cliUpdateTargetIdSchema>;
export type ProviderBrand = z.infer<typeof providerBrandSchema>;
export type RuntimeKind = z.infer<typeof runtimeKindSchema>;
export type ModelDiscoveryConfidence = z.infer<typeof modelDiscoveryConfidenceSchema>;
export type ComposerReasoningStrength = z.infer<typeof composerReasoningStrengthSchema>;
export type SetupLaunchMode = z.infer<typeof setupLaunchModeSchema>;
export type SetupCheckStatus = z.infer<typeof setupCheckStatusSchema>;
export type SetupActionKind = z.infer<typeof setupActionKindSchema>;
export type SubagentWorktreeStrategy = z.infer<typeof subagentWorktreeStrategySchema>;
export type PlanExecutionMode = z.infer<typeof planExecutionModeSchema>;
export type CorrectnessIterationMode = z.infer<typeof correctnessIterationModeSchema>;
export type DirtyGitChangeLimit = z.infer<typeof dirtyGitChangeLimitSchema>;
export type PreflightSeverity = z.infer<typeof preflightSeveritySchema>;
export type PreflightKind = z.infer<typeof preflightKindSchema>;
export type ThreadTitleSource = z.infer<typeof threadTitleSourceSchema>;
export type ThreadBadgeState = z.infer<typeof threadBadgeStateSchema>;
export type BackgroundJobKind = z.infer<typeof backgroundJobKindSchema>;
export type BackgroundJobStatus = z.infer<typeof backgroundJobStatusSchema>;
export type BackgroundJobSchedulerStatus = z.infer<typeof backgroundJobSchedulerStatusSchema>;
export type BackgroundJobLane = z.infer<typeof backgroundJobLaneSchema>;
export type BackgroundJobRunStatus = z.infer<typeof backgroundJobRunStatusSchema>;
export type BackgroundJobRiskLevel = z.infer<typeof backgroundJobRiskLevelSchema>;
export type BackgroundJobApprovalPolicy = z.infer<typeof backgroundJobApprovalPolicySchema>;
export type BackgroundJobThreadKind = z.infer<typeof backgroundJobThreadKindSchema>;
export type IntentArtifactType = z.infer<typeof intentArtifactTypeSchema>;
export type ModeScope = z.infer<typeof modeScopeSchema>;
export type ModeToolPolicy = z.infer<typeof modeToolPolicySchema>;
export type ModeExecutionAccess = z.infer<typeof modeExecutionAccessSchema>;
export type CapabilityTag = z.infer<typeof capabilityTagSchema>;
export type ChatAttachmentKind = z.infer<typeof chatAttachmentKindSchema>;
export type ChatDocumentType = z.infer<typeof chatDocumentTypeSchema>;
export type ProviderModelId = z.infer<typeof providerModelIdSchema>;
export type ExecutionModelId = z.infer<typeof executionModelIdSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessageKind = z.infer<typeof chatMessageKindSchema>;
export type AssistantScope = z.infer<typeof assistantScopeSchema>;
export type AssistantRunState = z.infer<typeof assistantRunStateSchema>;
export type AssistantBootstrapState = z.infer<typeof assistantBootstrapStateSchema>;
export type AssistantCircuitBreakerState = z.infer<typeof assistantCircuitBreakerStateSchema>;
export type AssistantTodoState = z.infer<typeof assistantTodoStateSchema>;
export type AssistantTodoWorkKind = z.infer<typeof assistantTodoWorkKindSchema>;
export type AssistantQuestionStatus = z.infer<typeof assistantQuestionStatusSchema>;
export type AssistantLearningConfidence = z.infer<typeof assistantLearningConfidenceSchema>;
export type AssistantLogLevel = z.infer<typeof assistantLogLevelSchema>;
export type AssistantAssetRefKind = z.infer<typeof assistantAssetRefKindSchema>;
export type AssistantAssetRefScope = z.infer<typeof assistantAssetRefScopeSchema>;
export type AssistantAssetRefProvenance = z.infer<typeof assistantAssetRefProvenanceSchema>;
export type AssistantAssetRefResolutionStatus = z.infer<typeof assistantAssetRefResolutionStatusSchema>;
export type BulkOperationTarget = z.infer<typeof bulkOperationTargetSchema>;
export type BulkOperationAction = z.infer<typeof bulkOperationActionSchema>;
export type BulkOperationItemStatus = z.infer<typeof bulkOperationItemStatusSchema>;
export type BulkOperationItemResult = z.infer<typeof bulkOperationItemResultSchema>;
export type BulkOperationPayload = z.infer<typeof bulkOperationPayloadSchema>;
export type BulkOperationResult = z.infer<typeof bulkOperationResultSchema>;
export type AssistantActionKind = z.infer<typeof assistantActionKindSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type RunExecutionTarget = z.infer<typeof runExecutionTargetSchema>;
