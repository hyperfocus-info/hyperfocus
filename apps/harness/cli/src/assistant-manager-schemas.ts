import { z } from "zod";
import { isGarbageAssistantLearningSummary } from "./assistant-learning-policy";

const assistantTodoDraftSchema = z.object({
  title: boundedLlmString(512),
  description: boundedLlmString(4000).optional(),
  workKind: z.enum(["app-code", "automation-code", "documentation", "research", "blocked", "unspecified"]).optional(),
  workTarget: boundedLlmString(512).optional()
});

const assistantLearningDraftSchema = z.object({
  summary: boundedLlmString(4000),
  source: boundedLlmString(256).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional()
});

const assistantQuestionDraftSchema = z.object({
  prompt: boundedLlmString(8000),
  linkedTodoIds: boundedLlmStringArray(32, 128).optional()
});

export const bootstrapProposalSchema = z.object({
  researchSummary: boundedLlmString(4000).optional(),
  learnings: boundedLlmArray(assistantLearningDraftSchema, 12).optional(),
  initialTodos: boundedLlmArray(assistantTodoDraftSchema, 12).optional(),
  remainIdle: z.boolean().optional()
});

export type BootstrapProposal = z.infer<typeof bootstrapProposalSchema>;

export const reprioritizeProposalSchema = z.object({
  summary: boundedLlmString(4000).optional(),
  todoOrder: boundedLlmStringArray(512, 128)
    .refine((ids) => new Set(ids).size === ids.length, "todoOrder must not contain duplicate IDs")
    .optional(),
  todoUpdates: boundedLlmArray(
    z.object({
      id: boundedLlmString(128),
      state: z.enum(["pending", "in-progress", "blocked", "completed", "failed", "cancelled"]).optional(),
      blockerReason: boundedLlmString(4000).optional(),
      workKind: z.enum(["app-code", "automation-code", "documentation", "research", "blocked", "unspecified"]).optional(),
      workTarget: boundedLlmString(512).optional()
    }),
    64
  ).optional(),
  newTodos: boundedLlmArray(assistantTodoDraftSchema, 12).optional(),
  newLearnings: boundedLlmArray(assistantLearningDraftSchema, 12).optional(),
  question: assistantQuestionDraftSchema.optional(),
  questions: boundedLlmArray(assistantQuestionDraftSchema, 3).optional()
});

export type ReprioritizeProposal = z.infer<typeof reprioritizeProposalSchema>;

export const assistantLearningCompactionSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .refine((summary) => !isGarbageAssistantLearningSummary(summary), "summary must be real durable guidance"),
  retainedFacts: z
    .array(
      z.object({
        summary: z.string().trim().min(1).max(4000),
        source: z.string().trim().min(1).max(256).optional(),
        confidence: z.enum(["low", "medium", "high"]).optional()
      })
    )
    .max(40)
    .optional()
});

function boundedLlmString(maxLength: number) {
  return z.string().transform((value) => value.trim().slice(0, maxLength)).pipe(z.string().min(1).max(maxLength));
}

function boundedLlmArray<T extends z.ZodTypeAny>(schema: T, maxItems: number) {
  return z.array(schema).transform((items) => items.slice(0, maxItems));
}

function boundedLlmStringArray(maxItems: number, maxLength: number) {
  return boundedLlmArray(boundedLlmString(maxLength), maxItems);
}
