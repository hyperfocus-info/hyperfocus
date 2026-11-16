import { z } from "zod";

const text = z.string().trim().min(1).max(2_000);
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const evidence = z.array(id).max(30);
export const swarmExpertMethodSchema = z.object({
  id, title: text, discipline: text, method: text, instruments: z.array(id).max(12),
  requiredEvidence: z.array(text).min(1).max(12), validationCriteria: z.array(text).min(1).max(12),
  responsibility: text, deliverable: text, collaborationReason: text,
}).strict();
export type SwarmExpertMethod = z.infer<typeof swarmExpertMethodSchema>;

export const swarmExperimentPlanSchema = z.object({
  instrumentId: id, objective: text, expectedInformationGain: text,
  expectedIfCorrect: text, expectedIfIncorrect: text,
  timeoutMs: z.number().int().min(100).max(600_000), maxComputeUsd: z.number().finite().min(0).max(10),
}).strict();
export const swarmHypothesisSchema = z.object({
  candidateId: id, claim: text, methodId: id, supportingEvidenceIds: evidence, contradictingEvidenceIds: evidence,
  implementationStrategy: text.optional(),
  instrumentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  verificationCostUsd: z.number().finite().min(0).max(10), experiment: swarmExperimentPlanSchema,
  status: z.enum(["untested", "supported", "contradicted", "inconclusive"]),
}).strict();
export const swarmExperimentReceiptSchema = swarmExperimentPlanSchema.extend({
  id, candidateId: id, methodId: id, requiredResources: text,
  status: z.enum(["supported", "contradicted", "inconclusive"]), artifactIds: evidence,
  observation: text, durationMs: z.number().finite().nonnegative(), sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
  evaluatorId: id, limitations: z.array(text).max(20),
  instrumentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), commandSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export const swarmEvaluationSchema = z.object({
  candidateId: id, kind: z.enum(["correctness", "performance"]), evaluatorId: id, method: text,
  artifactIds: evidence, result: z.enum(["passed", "failed", "blocked", "inconclusive"]), limitations: z.array(text).max(20),
}).strict();
export const swarmKnowledgeSchema = z.object({
  kind: z.enum(["invariant", "missing-validator", "failure-pattern", "reusable-primitive", "invalid-assumption", "performance-technique", "composition", "experimental-method"]),
  claim: text, evidenceArtifactIds: evidence, scope: text, disposition: z.literal("run-local"), generalApplicability: text,
}).strict();
export const swarmOutcomeCriterionSchema = z.object({ criterion: text, metric: text, evaluatorMethodId: id.nullable() }).strict();
export const swarmOutcomeSchema = z.object({
  phase: z.enum(["proposed", "analyzed"]), intendedOutcome: text, observedSymptoms: z.array(text).max(12),
  constraints: z.array(text).max(20), assumptions: z.array(z.object({ claim: text, falsification: text }).strict()).max(12),
  acceptanceCriteria: z.array(swarmOutcomeCriterionSchema).min(1).max(12),
  downstreamConsequences: z.array(text).max(12), methods: z.array(swarmExpertMethodSchema).max(8),
  hypotheses: z.array(swarmHypothesisSchema).max(36), experiments: z.array(swarmExperimentReceiptSchema).max(216),
  evaluations: z.array(swarmEvaluationSchema).max(216), knowledge: z.array(swarmKnowledgeSchema).max(128),
  taskSuccess: z.enum(["pending", "met", "unmet"]), outcomeSuccess: z.enum(["pending", "demonstrated", "unmet", "blocked"]),
  limitations: z.array(text).max(20), artifactId: id.optional(),
}).strict();
export type SwarmOutcome = z.infer<typeof swarmOutcomeSchema>;
export type SwarmHypothesis = z.infer<typeof swarmHypothesisSchema>;
export type SwarmExperimentReceipt = z.infer<typeof swarmExperimentReceiptSchema>;

/** Trusted recipes bind instruments; a method description alone grants no execution authority. */
export const swarmInstrumentPredicateSchema = z.object({
  path: z.array(z.string().min(1).max(100)).min(1).max(8),
  operator: z.enum(["eq", "gt", "gte", "lt", "lte"]), value: z.union([z.string().max(1_000), z.number().finite(), z.boolean()]),
}).strict();
export const swarmInvestigationInstrumentSchema = z.object({
  id, methodId: id, claim: text, command: z.string().min(1).max(64_000),
  timeoutMs: z.number().int().min(100).max(600_000), maxComputeUsd: z.number().finite().min(0).max(10),
  lane: z.enum(["investigation", "benchmark"]),
  implementationEligible: z.boolean().default(true),
  purpose: z.enum(["hypothesis", "constraint", "diagnostic"]).default("hypothesis"),
  artifactPaths: z.array(z.string().min(1).max(500).regex(/^[a-zA-Z0-9_./-]+$/).refine(value => !value.startsWith("/") && value.split("/").every(part => part !== ".." && part !== "." && part !== ""), "Use bounded repository-relative artifact paths.")).max(4).default([]),
  supports: swarmInstrumentPredicateSchema, contradicts: swarmInstrumentPredicateSchema,
  limitations: z.array(text).max(20),
}).strict();
export type SwarmInvestigationInstrument = z.infer<typeof swarmInvestigationInstrumentSchema>;
