import { z } from "zod";
import { aiExecutionProfileSchema } from "../runtime/contracts";
import { normalizeSwarmRequestDefaults } from "./suggested-settings";
import { swarmOutcomeSchema } from "./outcome";

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
export const swarmStatusSchema = z.enum(["CREATED", "PLANNING", "READY", "RUNNING", "VALIDATING", "COMPARING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "BLOCKED"]);
export const swarmTaskStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"]);
export const swarmRoleSchema = z.enum(["planner", "investigator", "implementer", "reviewer", "validator", "benchmark-analyst", "integrator"]);
export const swarmModelProfilesSchema = z.object({ planning: aiExecutionProfileSchema, implementation: aiExecutionProfileSchema, review: aiExecutionProfileSchema }).strict();
export type SwarmModelProfiles = z.infer<typeof swarmModelProfilesSchema>;
export const swarmBudgetSchema = z.object({
  maxDurationMs: z.number().int().min(10_000).max(86_400_000).default(3_600_000),
  maxComputeUsd: z.number().finite().min(0).max(10).default(5),
  maxModelUsd: z.number().finite().min(0).max(1_000).default(0),
  maxCallsPerAgent: z.number().int().min(1).max(200).default(24),
  maxTokensPerAgent: z.number().int().min(256).max(2_000_000).default(100_000),
  maxTotalTokens: z.number().int().min(256).max(10_000_000).default(500_000),
  maxWeeklyQuotaPercent: z.number().finite().positive().max(100).default(20),
  maxTaskDurationMs: z.number().int().min(1_000).max(3_600_000).default(600_000),
  maxRetries: z.number().int().min(0).max(3).default(1),
  maxRepairRounds: z.number().int().min(0).max(2).default(1),
  maxCampaignRounds: z.number().int().min(1).max(12).default(12),
}).strict();
export const swarmRepositorySchema = z.object({
  url: z.string().max(2_000).default(""),
  revision: z.string().regex(/^[a-f0-9]{40,64}$/),
  baseRevision: z.string().regex(/^[a-f0-9]{40,64}$/).optional(),
  sourceArtifactId: id.optional(),
}).strict();
export const createSwarmRequestSchema = z.preprocess(normalizeSwarmRequestDefaults, z.object({
  requestId: id,
  agentRecipientId: id.optional(),
  projectId: id,
  goal: z.string().trim().min(3).max(20_000),
  repository: swarmRepositorySchema,
  strategy: z.enum(["tournament", "investigation"]).default("tournament"),
  executionMode: z.enum(["bounded", "campaign"]).default("bounded"),
  executionKind: z.enum(["performance", "engineering"]).optional(),
  mode: z.enum(["auto", "value", "max-intelligence"]).default("auto"),
  difficulty: z.enum(["auto", "bounded", "complex"]).default("auto"),
  doneCriteria: z.array(z.string().trim().min(3).max(1_000)).min(1).max(12).default(["Retain attributable findings, independent correctness checks and an honest candidate comparison; preserve unresolved promotion blockers."]),
  backend: z.enum(["railway", "local"]).default("railway"),
  maxWorkers: z.number().int().min(1).max(3).default(3),
  budget: swarmBudgetSchema.default({}),
  profile: aiExecutionProfileSchema.optional(),
  hypotheses: z.array(z.string().min(3).max(4_000)).min(1).max(3).optional(),
  reviewPlan: z.boolean().default(false),
  priority: z.number().int().min(0).max(10).default(5),
}).strict());
export type CreateSwarmRequest = z.infer<typeof createSwarmRequestSchema>;
export type SwarmStatus = z.infer<typeof swarmStatusSchema>;
export const swarmSteeringSchema = z.object({ requestId: id, text: z.string().trim().min(1).max(4_000), taskId: id.optional() }).strict();
export const swarmFollowUpSchema = z.object({ requestId: id, goal: z.string().trim().min(3).max(20_000), doneCriteria: z.array(z.string().trim().min(3).max(1_000)).min(1).max(12).optional() }).strict();
export type SwarmSteering = z.infer<typeof swarmSteeringSchema>;
export type SwarmFollowUp = z.infer<typeof swarmFollowUpSchema>;
export const swarmBudgetRejectionSchema = z.object({
  taskId: id, scope: z.enum(["task", "run"]),
  dimension: z.enum(["calls", "tokens", "model-usd", "finalization-tokens"]),
  phase: z.enum(["reservation", "reported-usage"]),
  requested: z.number().nonnegative(), used: z.number().nonnegative(), limit: z.number().nonnegative(),
  remaining: z.number().nonnegative(), at: z.number().int(),
}).strict();
export type SwarmBudgetRejection = z.infer<typeof swarmBudgetRejectionSchema>;
export const swarmBrowserAccessRequestSchema = z.object({
  runId: id, access: z.enum(["view", "control"]), expiresInMs: z.number().int().positive().max(2_592_000_000).default(604_800_000),
}).strict();
export const swarmBrowserAccessReceiptSchema = z.object({
  url: z.string().url().max(2_048).refine(value => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === "/swarm" && !url.search && /^#code=[a-f0-9]{64}$/.test(url.hash)
      && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }, "Invalid public swarm URL."),
  accessId: z.string().uuid(), expiresAt: z.number().finite(),
}).strict();

export const swarmArtifactSchema = z.object({
  id, swarmId: id, taskId: id, agentId: id, sourceRevision: z.string(),
  name: z.string().max(240), mediaType: z.string().max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(),
  kind: z.enum(["source", "patch", "log", "report", "validation", "benchmark", "screenshot", "trace"]),
  createdAt: z.number().int(),
}).strict();
export type SwarmArtifact = z.infer<typeof swarmArtifactSchema>;
export const swarmMessageSchema = z.object({
  id, swarmId: id, taskId: id, agentId: id, sourceRevision: z.string(),
  kind: z.enum(["assignment", "evidence", "hypothesis", "modification", "blocker", "validation", "artifact", "review-request", "dependency", "steering", "progress"]),
  text: z.string().max(16_000), artifactIds: z.array(id).max(40), createdAt: z.number().int(),
}).strict();
export type SwarmMessage = z.infer<typeof swarmMessageSchema>;
export const swarmTaskSchema = z.object({
  id, swarmId: id, agentId: id,
  title: z.string().max(300), role: swarmRoleSchema,
  kind: z.enum(["baseline", "plan", "experiment", "investigate", "repair", "validate", "benchmark", "review", "compare"]),
  hypothesis: z.string().max(4_000).optional(), candidateId: id.optional(),
  dependencies: z.array(id).max(64), acceptanceCriteria: z.array(z.string().max(1_000)).max(20),
  status: swarmTaskStatusSchema, attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(), capability: z.enum(["execution", "reasoning", "benchmark"]),
  leaseOwner: z.string().optional(), leaseFence: z.number().int().default(0),
  leaseUntil: z.number().int().optional(), heartbeatAt: z.number().int().optional(),
  startedAt: z.number().int().optional(), completedAt: z.number().int().optional(),
  workspaceId: z.string().optional(), error: z.string().max(4_000).optional(),
  repair: z.object({ round: z.number().int().min(1).max(2), defect: z.string().max(4_000), expectedCause: z.string().max(2_000), allowedFiles: z.array(z.string().max(500)).max(100), protectedInvariants: z.array(z.string().max(1_000)).max(20), requiredVerification: z.array(z.string().max(64_000)).max(20), priorPatchArtifactId: id, validationArtifactIds: z.array(id).max(30).default([]) }).strict().optional(),
  artifactIds: z.array(id).max(512),
}).strict();
export type SwarmTask = z.infer<typeof swarmTaskSchema>;
export const swarmCandidateSchema = z.object({
  id, agentId: id, hypothesis: z.string().max(4_000),
  diagnosis: z.string().max(20_000).default(""),
  patchArtifactId: id.optional(), sourceRevision: z.string(), sourceTree:z.string().regex(/^[a-f0-9]{40,64}$/).optional(),
  correctness: z.enum(["pending", "passed", "failed", "blocked"]).default("pending"),
  validationArtifactIds: z.array(id).max(30).default([]),
  blockers: z.array(z.string().max(2_000)).max(30).default([]),
  comparison: z.object({
    decision: z.string().max(100), reasons: z.array(z.string().max(2_000)).max(40),
    improvementPercent: z.number().nullable().optional(),
    baselineMedian: z.number().optional(), candidateMedian: z.number().optional(),
    artifactId: id.optional(),
  }).strict().optional(),
  disposition: z.enum(["pending", "recommended", "rejected", "accepted"]).default("pending"),
}).strict();
export type SwarmCandidate = z.infer<typeof swarmCandidateSchema>;
export const swarmMetricsSchema = z.object({
  modelCalls: z.number().int().nonnegative().default(0),
  modelUnsettledTokens: z.number().int().nonnegative().default(0),
  modelContextBytes: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0), outputTokens: z.number().int().nonnegative().default(0),
  computeEstimatedUsd: z.number().nonnegative().default(0), modelEstimatedUsd: z.number().nonnegative().default(0),
  modelReportedUsd: z.number().nonnegative().nullable().default(null), computeReportedUsd: z.number().nonnegative().nullable().default(null),
  peakConcurrentTasks: z.number().int().nonnegative().default(0),
  sandboxCreationMs: z.number().nonnegative().default(0), preparationMs: z.number().nonnegative().default(0),
  executionMs: z.number().nonnegative().default(0), validationMs: z.number().nonnegative().default(0), benchmarkMs: z.number().nonnegative().default(0),
  cacheHits: z.number().int().nonnegative().default(0), cacheRequests: z.number().int().nonnegative().default(0),
  humanInterventions: z.number().int().nonnegative().default(0), failedTasks: z.number().int().nonnegative().default(0),
  orphanedResources: z.number().int().nonnegative().default(0), firstFindingAt: z.number().int().optional(),
  firstRemoteWorkAt: z.number().int().optional(),
}).strict();
export const swarmRunSchema = z.object({
  id, request: createSwarmRequestSchema, status: swarmStatusSchema,
  executionKind: z.enum(["performance", "engineering"]).default("performance"),
  createdAt: z.number().int(), updatedAt: z.number().int(), startedAt: z.number().int().optional(), completedAt: z.number().int().optional(),
  reason: z.string().max(4_000).optional(), budgetExhausted: z.boolean().default(false),
  connectionWait:z.object({operationId:id,connectionIds:z.array(id).max(32),reason:z.string().max(2000),deadlineAt:z.number()}).strict().optional(),
  budgetRejection: swarmBudgetRejectionSchema.optional(),
  tasks: z.array(swarmTaskSchema).max(512), candidates: z.array(swarmCandidateSchema).max(36),
  artifacts: z.array(swarmArtifactSchema).max(2_000), messages: z.array(swarmMessageSchema).max(2_000),
  metrics: swarmMetricsSchema, selectedCandidateId: id.optional(),
  outcome: swarmOutcomeSchema.optional(),
  parentRunId: id.optional(),
  campaign: z.object({ round:z.number().int().min(1).max(12), finalizationReserveMs:z.number().int().nonnegative(),
    rounds:z.array(z.object({number:z.number().int().positive(),candidateIds:z.array(id).max(3),compareTaskId:id,startedAt:z.number().int(),completedAt:z.number().int().optional(),summary:z.string().max(4000).optional()}).strict()).max(12),
  }).strict().optional(),
  modelPlan: swarmModelProfilesSchema.extend({ valueImplementation: aiExecutionProfileSchema, difficulty: z.enum(["bounded", "complex"]), reason: z.string().max(2_000) }).strict().optional(),
  weeklyQuota: z.object({ initialUsedPercent: z.number().nonnegative(), lastUsedPercent: z.number().nonnegative(), consumedPercent: z.number().nonnegative(), windowResetsAt: z.number().finite(), observedAt: z.number().int() }).strict().optional(),
  completion: z.object({ status: z.enum(["met", "unmet"]), summary: z.string().max(4_000), criteria: z.array(z.object({ criterion: z.string().max(1_000), status: z.enum(["met", "unmet", "blocked"]), artifactIds: z.array(id).max(12), reason: z.string().max(1_000) }).strict()).max(12), artifactId: id }).strict().optional(),
  integration: z.object({candidateId:id, status:z.enum(["approved", "integrated", "rejected", "conflict"]), detail:z.string().max(4_000), at:z.number().int()}).strict().optional(),
}).strict();
export type SwarmRun = z.infer<typeof swarmRunSchema>;
export const swarmCapabilitiesSchema = z.object({
  available: z.boolean(), reason: z.string().optional(),
  connectionsSupported:z.boolean().optional(),canQueue:z.boolean().optional(),
  executionAuthority: z.enum(["cloud","local"]).optional(),
  archive: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  backends: z.array(z.enum(["railway", "local"])), maxWorkers:z.number().int(),
  projects: z.array(z.object({id:z.string(), name:z.string(),campaign:z.boolean().optional(),
    executionKind:z.enum(["performance", "engineering"]).optional(),
    investigationInstruments:z.array(z.object({id:z.string(),claim:z.string()})).optional(),
    blockedPromotionReasons:z.array(z.string()).optional(),
  })),
  inference: z.object({ provider: z.string(), credentialSource: z.string(), separatelyBilledUsd: z.number().nonnegative() }).strict().optional(),
  modelProfiles: swarmModelProfilesSchema.optional(),
  deploymentExpiresAt: z.number().finite().optional(),
}).strict();
export const swarmContextSchema = z.object({
  projectId:z.string(), name:z.string(), repository:swarmRepositorySchema,
  dirty:z.boolean(), sourceSnapshotRequired:z.boolean(),
  provider:z.object({available:z.boolean(), reason:z.string().optional()}),
}).strict();
export type SwarmContext = z.infer<typeof swarmContextSchema>;
export type SwarmCapabilities = z.infer<typeof swarmCapabilitiesSchema>;
