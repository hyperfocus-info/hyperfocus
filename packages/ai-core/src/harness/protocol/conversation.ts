import { z } from "zod";
import { qualityTraceSchema } from "../../quality/contracts";

import {
  agentIdSchema,
  assistantActionKindSchema,
  assistantIdSchema,
  assistantQuestionIdSchema,
  backgroundJobIdSchema,
  backgroundJobRunIdSchema,
  capabilityTagSchema,
  chatAttachmentKindSchema,
  chatDocumentTypeSchema,
  chatMessageKindSchema,
  chatRoleSchema,
  composerReasoningStrengthSchema,
  correctnessIterationModeSchema,
  executionModelIdSchema,
  experimentIdSchema,
  intentArtifactTypeSchema,
  memoryEntryIdSchema,
  memoryRetrievalIdSchema,
  modeExecutionAccessSchema,
  modeIdSchema,
  modeScopeSchema,
  modeToolPolicySchema,
  modelDiscoveryConfidenceSchema,
  planExecutionModeSchema,
  projectIdSchema,
  providerBrandSchema,
  providerModelIdSchema,
  runIdSchema,
  runtimeKindSchema,
  subagentWorktreeStrategySchema,
  threadIdSchema
} from "./shared";

export const experimentRunStatusSchema = z.enum([
  "prepared",
  "running",
  "completed",
  "partial-complete",
  "failed",
  "promoted",
  "discarded"
]);

export const experimentRunSchema = z.object({
  id: experimentIdSchema,
  runId: runIdSchema,
  status: experimentRunStatusSchema,
  virtualBranchName: z.string().min(1).max(256),
  repoMountPath: z.string().min(1).max(4096),
  projectMountPath: z.string().min(1).max(4096),
  baseCommitSha: z.string().min(1).max(256).optional(),
  baseBranchName: z.string().min(1).max(256).optional(),
  baseDirtyFingerprint: z.string().min(1).max(256),
  headCommitSha: z.string().min(1).max(256).optional(),
  filesChanged: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  promotedAt: z.string().datetime().or(z.string().min(1)).optional(),
  discardedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const experimentInspectionSchema = z.object({
  experiment: experimentRunSchema,
  diffText: z.string(),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        additions: z.number().int().min(0),
        deletions: z.number().int().min(0),
        hunksPreview: z.string()
      })
    )
    .max(512)
    .optional(),
  inspectedAt: z.string().datetime().or(z.string().min(1)).optional(),
  staleReason: z.string().min(1).optional(),
  filesChanged: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  changedPaths: z.array(z.string().min(1)).max(512)
});

export const memoryEntryKindSchema = z.enum([
  "repo-fact",
  "task-summary",
  "success-pattern",
  "failure-pattern",
  "verification-recipe",
  "fallback-strategy",
  "prompt-fragment",
  "user-correction"
]);

export const memoryEntryStatusSchema = z.enum(["active", "archived"]);
export const memoryConfidenceSchema = z.enum(["low", "medium", "high"]);
export const memoryFreshnessSchema = z.enum(["fresh", "aging", "stale"]);

export const memoryEntrySchema = z.object({
  id: memoryEntryIdSchema,
  projectId: projectIdSchema.optional(),
  threadId: threadIdSchema.optional(),
  runId: runIdSchema.optional(),
  kind: memoryEntryKindSchema,
  status: memoryEntryStatusSchema,
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(4000),
  evidence: z.string().min(1).max(16000).optional(),
  tags: z.array(z.string().min(1).max(128)).max(32),
  pathGlobs: z.array(z.string().min(1).max(512)).max(64),
  confidence: memoryConfidenceSchema,
  freshness: memoryFreshnessSchema,
  pinned: z.boolean(),
  priority: z.number().int().min(0).max(100000).default(50000),
  hitCount: z.number().int().min(0),
  lastHitAt: z.string().datetime().or(z.string().min(1)).optional(),
  sourceCommitSha: z.string().min(1).max(256).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const memoryRetrievalSchema = z.object({
  id: memoryRetrievalIdSchema,
  runId: runIdSchema,
  owner: z.enum(["planner", "main", "subagent"]),
  subagentId: z.string().min(1).max(128).optional(),
  queryText: z.string().min(1).max(32000),
  entryIds: z.array(memoryEntryIdSchema).max(16),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const planPrerequisiteSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  reason: z.string().min(1),
  requiredForTaskIds: z.array(z.string().min(1).max(128)),
  owner: z.enum(["main", "subagent"]),
  status: z.enum(["pending", "completed"]),
  verificationCommands: z.array(z.string().min(1)).max(16).optional()
});

// Optional for legacy/trivial plans; substantial new plans use the existing plan boundary.
export const outcomeSupervisionSchema = z.object({
  request: z.string().min(1).max(32000),
  intent: z.string().min(1).max(2000),
  outcome: z.string().min(1).max(2000),
  experience: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(2000)).min(1).max(16),
  constraints: z.array(z.string().min(1).max(2000)).max(16),
  budget: z.string().min(1).max(2000),
  deadlineAt: z.number().finite().positive().optional(),
  decision: z.enum(["continue", "redirect", "stop", "escalate"]),
  reason: z.string().min(1).max(2000),
}).strict();

export const subagentContractSchema = z.object({
  contribution: z.object({
    outcome: z.string().min(1).max(2000),
    limitingFactor: z.string().min(1).max(2000),
    evidence: z.string().min(1).max(2000),
    expectedImprovement: z.string().min(1).max(2000),
    stopWhen: z.string().min(1).max(2000),
  }).strict().optional(),
  taskId: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  effortPoints: z.number().finite().int().min(1),
  ownedPaths: z.array(z.string().min(1)).max(32),
  dependsOnPrerequisiteIds: z.array(z.string().min(1).max(128)).max(16),
  deliverables: z.array(z.string().min(1)).max(16),
  integrationPoints: z.array(z.string().min(1)).max(16),
  verificationScope: z.enum(["owned-files-only", "worktree-full"]),
  verificationCommands: z.array(z.string().min(1)).max(16),
  mergeNotes: z.string().min(1)
});

export const correctnessGapSchema = z.object({
  id: z.string().min(1).max(128),
  category: z.enum(["plan-gap", "runnable-gap", "quality-gap"]),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string().min(1),
  suggestedFix: z.string().min(1),
  canParallelize: z.boolean(),
  ownedPaths: z.array(z.string().min(1)).max(32)
});

export const executionPlanSchema = z.object({
  supervision: outcomeSupervisionSchema.optional(),
  quality: qualityTraceSchema.optional(),
  runId: runIdSchema,
  origin: z.enum(["initial", "quick-task", "correctness-followup"]),
  iteration: z.number().int().min(1),
  summary: z.string().min(1),
  finalExecutionBrief: z.string().min(1),
  difficultyScore: z.number().min(0).max(100),
  planningModelId: providerModelIdSchema,
  executionModelId: executionModelIdSchema,
  route: z.enum(["main", "pi-subagents"]),
  subagentWorktreeStrategy: subagentWorktreeStrategySchema,
  targetSubagentCount: z.number().int().min(0).max(10),
  actualSubagentCount: z.number().int().min(0).max(10),
  gating: z.object({
    mode: planExecutionModeSchema,
    delaySeconds: z.number().int().min(0).max(300)
  }),
  mode: z.lazy(() => modeDefinitionSchema).optional(),
  ruleSources: z.array(z.lazy(() => workspaceRuleSourceSchema)).max(4).optional(),
  memorySummaries: z.array(z.lazy(() => memorySummarySchema)).max(4).optional(),
  prerequisites: z.array(planPrerequisiteSchema).max(16),
  contracts: z.array(subagentContractSchema).max(16),
  correctnessPolicy: correctnessIterationModeSchema
});

export const correctnessReviewSchema: z.ZodType<{
  status: "pass" | "needs-iteration";
  summary: string;
  gaps: z.infer<typeof correctnessGapSchema>[];
  recommendedPlan?: z.infer<typeof executionPlanSchema>;
}> = z.object({
  status: z.enum(["pass", "needs-iteration"]),
  summary: z.string().min(1),
  gaps: z.array(correctnessGapSchema).max(16),
  recommendedPlan: executionPlanSchema.optional()
});

export const planSummaryMessageMetadataSchema = z.object({
  type: z.literal("plan-summary"),
  runId: runIdSchema,
  plan: executionPlanSchema
});

export const runMilestonesMessageMetadataSchema = z.object({
  type: z.literal("run-milestones"),
  runId: runIdSchema,
  windowId: z.string().min(1).max(128),
  status: z.enum(["open", "closed"]),
  phase: z.enum(["planning", "subagents", "aggregation", "correctness"]).optional(),
  phaseTitle: z.string().min(1).max(128).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  lineCount: z.number().int().min(0).optional(),
  overflowCount: z.number().int().min(0).optional(),
  hiddenLineCount: z.number().int().min(0).optional(),
  truncatedLineCount: z.number().int().min(0).optional(),
  lines: z.array(z.string().min(1).max(1200)).max(64).optional()
});

export const assistantActionMessageMetadataSchema = z.object({
  type: z.literal("assistant-action"),
  assistantId: assistantIdSchema,
  assistantName: z.string().min(1).max(256),
  actionKind: assistantActionKindSchema,
  jobId: backgroundJobIdSchema.optional(),
  runId: backgroundJobRunIdSchema.optional(),
  questionId: assistantQuestionIdSchema.optional(),
  summaryRows: z.array(z.object({
    label: z.string().min(1).max(64),
    value: z.string().min(1).max(512)
  })).max(12),
  actions: z.array(z.object({
    kind: z.enum(["open-assistant", "open-jobs", "schedule-job", "run-job", "pause", "resume", "answer-question", "recover", "retry-bootstrap"]),
    label: z.string().min(1).max(64),
    disabled: z.boolean().optional(),
    disabledReason: z.string().min(1).max(256).optional()
  })).max(8)
});

export const chatMessageMetadataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("thread-message"),
    sourceThreadId: z.string().min(1).max(128),
    targetThreadId: z.string().min(1).max(128),
    deliveryId: z.string().uuid(),
    body: z.string().max(16000).optional(),
    direction: z.enum(["sent", "received"])
  }),
  planSummaryMessageMetadataSchema,
  runMilestonesMessageMetadataSchema,
  assistantActionMessageMetadataSchema
]);

export const chatAttachmentSchema = z.object({
  id: z.string().min(1).max(128),
  kind: chatAttachmentKindSchema,
  documentType: chatDocumentTypeSchema.optional(),
  name: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(256),
  sizeBytes: z.number().int().min(1).max(16777216),
  url: z.string().url().max(2048).refine((value) => value.startsWith("https://"), {
    message: "Attachment URLs must be HTTPS UploadThing URLs"
  }),
  key: z.string().min(1).max(512),
  uploadedAt: z.string().datetime().or(z.string().min(1))
});

export const CHAT_MESSAGE_CONTENT_MAX_CHARS = 1_000_000;
export const chatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: chatRoleSchema,
  kind: chatMessageKindSchema.optional(),
  content: z.string().min(1).max(CHAT_MESSAGE_CONTENT_MAX_CHARS),
  attachments: z.array(chatAttachmentSchema).max(8).optional(),
  metadata: chatMessageMetadataSchema.optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const streamingTailPhaseSchema = z.enum(["planning", "subagents", "aggregation", "correctness"]);

export const streamingTailSegmentSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(["status", "assistant"]),
  phase: streamingTailPhaseSchema.optional(),
  content: z.string().min(1),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const agentOptionSchema = z.object({
  id: agentIdSchema,
  label: z.string().min(1),
  description: z.string().min(1).optional()
});

export const agentRuntimeCapabilitySchema = z.object({
  agentId: agentIdSchema,
  label: z.string().min(1).max(128),
  runtimeKind: runtimeKindSchema,
  installed: z.boolean(),
  authenticated: z.boolean(),
  interactivePipeCompatible: z.boolean(),
  supportsInteractive: z.boolean(),
  supportsProgrammatic: z.boolean(),
  supportsPlanning: z.boolean(),
  supportsReview: z.boolean(),
  supportsReasoningStrengthControl: z.boolean().optional(),
  supportsFastModeControl: z.boolean().optional(),
  version: z.string().min(1).max(256).optional(),
  healthMessage: z.string().min(1).max(1024).optional(),
  installCommand: z.string().min(1).max(1024).optional(),
  authCommand: z.string().min(1).max(1024).optional(),
  docsUrl: z.string().url().optional(),
  discoveredModels: z.array(z.string().min(1).max(256)).max(64),
  activeModel: z.string().min(1).max(256).optional(),
  modelDiscoveryConfidence: modelDiscoveryConfidenceSchema
});

export const modelCapabilitySchema = z.object({
  modelId: providerModelIdSchema,
  providerBrand: providerBrandSchema,
  label: z.string().min(1).max(128),
  tags: z.array(capabilityTagSchema).max(8),
  contextWindow: z.number().int().min(1),
  summary: z.string().min(1).max(256),
  supportedReasoningStrengths: z.array(composerReasoningStrengthSchema).max(4).optional(),
  supportsFastMode: z.boolean().optional()
});

export const providerCapabilitySchema = z.object({
  providerBrand: providerBrandSchema,
  label: z.string().min(1).max(64),
  defaultPlanningModelId: providerModelIdSchema,
  defaultExecutionModelId: providerModelIdSchema,
  defaultSubagentModelId: providerModelIdSchema,
  models: z.array(modelCapabilitySchema).max(16)
});

export const modeDefinitionSchema = z.object({
  id: modeIdSchema,
  scope: modeScopeSchema,
  label: z.string().min(1).max(64),
  description: z.string().min(1).max(256),
  plannerPrompt: z.string().min(1).max(4000),
  executionPrompt: z.string().min(1).max(4000),
  toolPolicy: modeToolPolicySchema,
  executionAccess: modeExecutionAccessSchema,
  planExecutionModeDefault: planExecutionModeSchema.optional(),
  subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema.optional(),
  correctnessIterationModeDefault: correctnessIterationModeSchema.optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const workspaceRuleSourceSchema = z.object({
  id: z.string().min(1).max(128),
  scope: z.enum(["workspace", "project"]),
  label: z.string().min(1).max(128),
  content: z.string().min(1).max(32000),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const memorySummarySchema = z.object({
  id: z.string().min(1).max(128),
  scope: z.enum(["workspace", "thread"]),
  label: z.string().min(1).max(128),
  content: z.string().min(1).max(32000),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  source: z.enum(["user", "generated"])
});

export const intentContractSchema = z.object({
  objective: z.string().trim().min(1).max(4000),
  sourcePrompt: z.string().trim().min(1).max(32000),
  deliverables: z.array(z.string().trim().min(1).max(512)).min(1).max(16),
  artifactTypes: z.array(intentArtifactTypeSchema).min(1).max(8),
  qualityBar: z.array(z.string().trim().min(1).max(512)).min(1).max(16),
  evidenceRequired: z.array(z.string().trim().min(1).max(512)).min(1).max(16),
  nonGoals: z.array(z.string().trim().min(1).max(512)).max(16),
  stopConditions: z.array(z.string().trim().min(1).max(512)).min(1).max(16),
  allowedAdaptation: z.string().trim().min(1).max(2000)
});

export type IntentContract = z.infer<typeof intentContractSchema>;
export type PlanPrerequisite = z.infer<typeof planPrerequisiteSchema>;
export type SubagentContract = z.infer<typeof subagentContractSchema>;
export type CorrectnessGap = z.infer<typeof correctnessGapSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type CorrectnessReview = z.infer<typeof correctnessReviewSchema>;
export type PlanSummaryMessageMetadata = z.infer<typeof planSummaryMessageMetadataSchema>;
export type RunMilestonesMessageMetadata = z.infer<typeof runMilestonesMessageMetadataSchema>;
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type StreamingTailPhase = z.infer<typeof streamingTailPhaseSchema>;
export type StreamingTailSegment = z.infer<typeof streamingTailSegmentSchema>;
export type AgentOption = z.infer<typeof agentOptionSchema>;
export type AgentRuntimeCapability = z.infer<typeof agentRuntimeCapabilitySchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ModeDefinition = z.infer<typeof modeDefinitionSchema>;
export type WorkspaceRuleSource = z.infer<typeof workspaceRuleSourceSchema>;
export type MemorySummary = z.infer<typeof memorySummarySchema>;
export type ExperimentRunStatus = z.infer<typeof experimentRunStatusSchema>;
export type ExperimentRun = z.infer<typeof experimentRunSchema>;
export type ExperimentInspection = z.infer<typeof experimentInspectionSchema>;
export type MemoryEntryKind = z.infer<typeof memoryEntryKindSchema>;
export type MemoryEntryStatus = z.infer<typeof memoryEntryStatusSchema>;
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;
export type MemoryFreshness = z.infer<typeof memoryFreshnessSchema>;
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;
export type MemoryRetrieval = z.infer<typeof memoryRetrievalSchema>;
export type AssistantActionMessageMetadata = z.infer<typeof assistantActionMessageMetadataSchema>;
