import { z } from "zod";
import { chatAttachmentSchema, memoryEntryKindSchema, memoryEntryStatusSchema } from "./conversation";
import { runLaunchRuntimeBudgetSchema } from "./execution";
import {
  agentIdSchema,
  boundedPageCursorSchema,
  composerReasoningStrengthSchema,
  executionModelIdSchema,
  memoryEntryIdSchema,
  modeIdSchema,
  projectIdSchema,
  questionIdSchema,
  requestIdSchema,
  runExecutionTargetSchema,
  runIdSchema,
  threadIdSchema
} from "./shared";

const semanticMemoryTagSchema = z
  .string()
  .trim()
  .min(3)
  .max(97)
  .regex(/^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,63}$/);

export const runClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("chat.send"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      agentId: agentIdSchema,
      content: z.string().min(1).max(32000),
      attachments: z.array(chatAttachmentSchema).max(8).optional(),
      modeId: modeIdSchema.optional(),
      modeLocked: z.boolean().optional(),
      executionModelId: executionModelIdSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      debug: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("planning.answer"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      questionId: questionIdSchema,
      content: z.string().trim().min(1).max(32000),
      attachments: z.array(chatAttachmentSchema).max(8).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("planning.answer-batch"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      answers: z.array(z.object({
        questionId: questionIdSchema,
        content: z.string().trim().min(1).max(32000)
      })).min(1).max(5),
      attachments: z.array(chatAttachmentSchema).max(8).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("planning.refine"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      content: z.string().trim().min(1).max(32000),
      attachments: z.array(chatAttachmentSchema).max(8).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      guidanceText: z.string().trim().min(1).max(32000).optional(),
      subagentIds: z.array(z.string().min(1).max(128)).max(8).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      subagentId: z.string().min(1).max(128).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.execute"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      target: runExecutionTargetSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      runtimeBudget: runLaunchRuntimeBudgetSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.complete"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      assistantMessageContent: z.string().min(1).max(32000),
      partialReason: z.string().trim().min(1).max(4000).optional()
    })
  }),
  z.object({
    type: z.literal("experiment.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("experiment.promote"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("experiment.discard"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("memory.create"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      title: z.string().trim().min(1).max(256),
      summary: z.string().trim().min(1).max(4000),
      tags: z.array(semanticMemoryTagSchema).min(1).max(12)
    })
  }),
  z.object({
    type: z.literal("memory.list"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      search: z.string().max(512).optional(),
      status: memoryEntryStatusSchema.optional(),
      kind: memoryEntryKindSchema.optional()
    })
  }),
  z.object({
    type: z.literal("memory.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("memory.update"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema,
      pinned: z.boolean().optional(),
      status: memoryEntryStatusSchema.optional()
    })
  }),
  z.object({
    type: z.literal("memory.reorder"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      memoryEntryId: memoryEntryIdSchema,
      direction: z.enum(["up", "down"])
    })
  }),
  z.object({
    type: z.literal("memory.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("run.refresh"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      subagentId: z.string().min(1).max(128).optional()
    })
  }),
  z.object({
    type: z.literal("run.detail.get"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      cursor: boundedPageCursorSchema.optional(),
      limit: z.number().int().min(1).max(128).optional()
    })
  })
]);
