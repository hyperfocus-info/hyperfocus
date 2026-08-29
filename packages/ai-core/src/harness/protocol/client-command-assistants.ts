import { z } from "zod";
import {
  assistantAssetRefSchema,
  assistantPageCursorSchema,
  assistantPageLimitSchema,
  assistantSchema,
  assistantTodoPatchSchema
} from "./assistants";
import {
  agentIdSchema,
  assistantIdSchema,
  assistantLearningIdSchema,
  assistantQuestionIdSchema,
  assistantScopeSchema,
  assistantTodoIdSchema,
  composerReasoningStrengthSchema,
  executionModelIdSchema,
  modeIdSchema,
  projectIdSchema,
  requestIdSchema,
  threadIdSchema
} from "./shared";

const assistantPageRequestShape = {
  cursor: assistantPageCursorSchema.optional(),
  limit: assistantPageLimitSchema.optional()
};
const assistantPageRequestSchema = z.object(assistantPageRequestShape);

export const assistantClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assistant.create"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema,
      assetRefs: z.array(assistantAssetRefSchema).max(64).optional()
    })
  }),
  z.object({
    type: z.literal("assistant.create-from-thread"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sourcePrompt: z.string().trim().min(1).max(32000),
      name: z.string().trim().min(1).max(256).optional(),
      scope: assistantScopeSchema.optional(),
      modeId: modeIdSchema.optional(),
      executionModelId: executionModelIdSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional(),
      agentId: agentIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("assistant.update"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema,
      assetRefs: z.array(assistantAssetRefSchema).max(64).optional()
    })
  }),
  z.object({
    type: z.literal("assistant.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.pause"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.clone-to-project"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.summary.list"),
    requestId: requestIdSchema,
    payload: assistantPageRequestSchema.optional()
  }),
  z.object({
    type: z.literal("assistant.detail.get"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.workloads.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      jobs: assistantPageRequestSchema.optional(),
      runs: assistantPageRequestSchema.optional()
    })
  }),
  z.object({
    type: z.literal("assistant.thread.messages.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      ...assistantPageRequestShape
    })
  }),
  z.object({
    type: z.literal("assistant.logs.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      ...assistantPageRequestShape
    })
  }),
  z.object({
    type: z.literal("assistant.todos.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      ...assistantPageRequestShape
    })
  }),
  z.object({
    type: z.literal("assistant.learnings.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      ...assistantPageRequestShape
    })
  }),
  z.object({
    type: z.literal("assistant.questions.list"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      ...assistantPageRequestShape
    })
  }),
  z.object({
    type: z.literal("assistant.bootstrap.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.jobs.bootstrap"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      projectId: projectIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("assistant.circuit-breaker.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.chat.send"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      content: z.string().trim().min(1).max(32000),
      modeId: modeIdSchema.optional(),
      executionModelId: executionModelIdSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("assistant.question.answer"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      questionId: assistantQuestionIdSchema,
      content: z.string().trim().min(1).max(32000)
    })
  }),
  z.object({
    type: z.literal("assistant.question.answer-batch"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      answers: z.array(z.object({
        questionId: assistantQuestionIdSchema,
        content: z.string().trim().min(1).max(32000)
      })).min(1).max(5)
    })
  }),
  z.object({
    type: z.literal("assistant.todo.update"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      todoId: assistantTodoIdSchema,
      patch: assistantTodoPatchSchema
    })
  }),
  z.object({
    type: z.literal("assistant.todo.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      todoId: assistantTodoIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.todo.reorder"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      todoIds: z.array(assistantTodoIdSchema).min(1).max(512).refine(
        (todoIds) => new Set(todoIds).size === todoIds.length,
        "Assistant todo reorder contains duplicate todo IDs"
      )
    })
  }),
  z.object({
    type: z.literal("assistant.learning.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      learningId: assistantLearningIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.learning.reorder"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      learningIds: z.array(assistantLearningIdSchema).min(1).max(512).refine(
        (learningIds) => new Set(learningIds).size === learningIds.length,
        "Assistant learning reorder contains duplicate learning IDs"
      )
    })
  })
]);
