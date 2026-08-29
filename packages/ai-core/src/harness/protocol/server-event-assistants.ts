import { z } from "zod";
import { assistantDetailSchema, assistantLearningPageSchema, assistantLiveThreadMetadataSchema, assistantLogEntrySchema, assistantLogPageSchema, assistantQuestionPageSchema, assistantQuestionSchema, assistantSchema, assistantSummaryPageSchema, assistantThreadMessagePageSchema, assistantTodoPageSchema, assistantTodoSchema, assistantsStateSchema } from "./assistants";
import { chatMessageSchema } from "./conversation";
import { backgroundJobPageSchema, backgroundJobRunPageSchema } from "./jobs-and-notifications";
import { assistantIdSchema, assistantThreadIdSchema, boundedPageCursorSchema, boundedStreamDeltaSchema,
  requestIdSchema, sessionIdSchema } from "./shared";

const assistantWorkloadsListedPayloadSchema = z.object({
  assistantId: assistantIdSchema,
  jobsCursor: boundedPageCursorSchema.optional(),
  runsCursor: boundedPageCursorSchema.optional(),
  jobs: backgroundJobPageSchema.optional(),
  runs: backgroundJobRunPageSchema.optional()
}).superRefine(({ assistantId, jobs, jobsCursor, runs, runsCursor }, context) => {
  if (!jobs && !runs) context.addIssue({ code: "custom", message: "Assistant workloads must include jobs or runs" });
  if (jobsCursor && !jobs) context.addIssue({ code: "custom", message: "Jobs cursor requires a jobs page", path: ["jobsCursor"] });
  if (runsCursor && !runs) context.addIssue({ code: "custom", message: "Runs cursor requires a runs page", path: ["runsCursor"] });
  for (const [collection, items] of [["jobs", jobs?.items], ["runs", runs?.items]] as const) items?.forEach((item, index) => {
    if (item.assistantId !== assistantId) context.addIssue({ code: "custom",
      message: `${collection === "jobs" ? "Job" : "Run"} does not belong to the requested assistant`,
      path: [collection, "items", index, "assistantId"] });
  });
});

function requireAssistantOwnedPage(items: ReadonlyArray<{ assistantId: string }>, assistantId: string,
  collection: string, context: z.RefinementCtx) {
  items.forEach((item, index) => { if (item.assistantId !== assistantId) context.addIssue({ code: "custom",
    message: "Assistant page item does not belong to requested assistant", path: [collection, "items", index, "assistantId"] }); });
}

function requireLiveChatOwnership(input: { assistantId: string; sessionId: string; message: { id: string; role: string };
  thread: { assistantId: string; sessionId: string; latestMessageId: string } }, expectedRole: "user" | "assistant",
  context: z.RefinementCtx) {
  if (input.thread.assistantId !== input.assistantId) context.addIssue({ code: "custom",
    message: "Assistant chat thread does not belong to event assistant", path: ["thread", "assistantId"] });
  if (input.thread.sessionId !== input.sessionId) context.addIssue({ code: "custom",
    message: "Assistant chat thread does not belong to event session", path: ["thread", "sessionId"] });
  if (input.thread.latestMessageId !== input.message.id) context.addIssue({ code: "custom",
    message: "Assistant chat event message is not the latest thread message", path: ["message", "id"] });
  if (input.message.role !== expectedRole) context.addIssue({ code: "custom",
    message: `Assistant chat event message must have role ${expectedRole}`, path: ["message", "role"] });
}

const assistantChatMessageAppendedPayloadSchema = z.object({
  assistantId: assistantIdSchema, sessionId: sessionIdSchema, message: chatMessageSchema, thread: assistantLiveThreadMetadataSchema
}).superRefine((payload, context) => requireLiveChatOwnership(payload, "user", context));

const assistantChatCompletePayloadSchema = z.object({
  assistantId: assistantIdSchema, sessionId: sessionIdSchema, assistantMessage: chatMessageSchema, thread: assistantLiveThreadMetadataSchema
}).superRefine((payload, context) => requireLiveChatOwnership({ ...payload, message: payload.assistantMessage }, "assistant", context));

const assistantsUpdatedPayloadSchema = z.object({
  assistants: assistantsStateSchema,
  invalidatedDetailAssistantIds: z.array(assistantIdSchema).max(512).optional(),
  deletedAssistantIds: z.array(assistantIdSchema).max(512).optional()
}).superRefine(({ assistants, deletedAssistantIds = [], invalidatedDetailAssistantIds = [] }, context) => {
  for (const [field, ids] of [["deletedAssistantIds", deletedAssistantIds],
    ["invalidatedDetailAssistantIds", invalidatedDetailAssistantIds]] as const) {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) context.addIssue({ code: "custom", message: `${field} must contain unique IDs`, path: [field, index] });
      seen.add(id);
    });
  }
  const deleted = new Set(deletedAssistantIds);
  assistants.assistants.forEach((assistant, index) => {
    if (deleted.has(assistant.id)) context.addIssue({ code: "custom",
      message: "Updated assistant cannot also be deleted", path: ["assistants", "assistants", index, "id"] });
  });
});

export const assistantServerEventSchemas = [
  z.object({
    type: z.literal("assistants.updated"),
    requestId: requestIdSchema,
    payload: assistantsUpdatedPayloadSchema
  }),
  z.object({
    type: z.literal("assistant.summary.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistants: assistantSummaryPageSchema
    })
  }),
  z.object({
    type: z.literal("assistant.detail.loaded"),
    requestId: requestIdSchema,
    payload: z.object({
      detail: assistantDetailSchema
    })
  }),
  z.object({
    type: z.literal("assistant.workloads.listed"),
    requestId: requestIdSchema,
    payload: assistantWorkloadsListedPayloadSchema
  }),
  z.object({
    type: z.literal("assistant.thread.messages.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      threadId: assistantThreadIdSchema,
      messages: assistantThreadMessagePageSchema
    })
  }),
  z.object({
    type: z.literal("assistant.logs.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      logs: assistantLogPageSchema
    }).superRefine(({ assistantId, logs }, context) => requireAssistantOwnedPage(logs.items, assistantId, "logs", context))
  }),
  z.object({
    type: z.literal("assistant.todos.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      todos: assistantTodoPageSchema
    }).superRefine(({ assistantId, todos }, context) => requireAssistantOwnedPage(todos.items, assistantId, "todos", context))
  }),
  z.object({
    type: z.literal("assistant.learnings.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      learnings: assistantLearningPageSchema
    }).superRefine(({ assistantId, learnings }, context) => requireAssistantOwnedPage(learnings.items, assistantId, "learnings", context))
  }),
  z.object({
    type: z.literal("assistant.questions.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      questions: assistantQuestionPageSchema
    }).superRefine(({ assistantId, questions }, context) => requireAssistantOwnedPage(questions.items, assistantId, "questions", context))
  }),
  z.object({
    type: z.literal("assistant.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema
    })
  }),
  z.object({
    type: z.literal("assistant.chat.delta"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      sessionId: sessionIdSchema,
      delta: boundedStreamDeltaSchema
    })
  }),
  z.object({
    type: z.literal("assistant.chat.message-appended"),
    requestId: requestIdSchema,
    payload: assistantChatMessageAppendedPayloadSchema
  }),
  z.object({
    type: z.literal("assistant.chat.complete"),
    requestId: requestIdSchema,
    payload: assistantChatCompletePayloadSchema
  }),
  z.object({
    type: z.literal("assistant.chat.failed"),
    requestId: requestIdSchema,
    payload: z.object({ assistantId: assistantIdSchema, sessionId: sessionIdSchema })
  }),
  z.object({
    type: z.literal("assistant.question.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      question: assistantQuestionSchema
    })
  }),
  z.object({
    type: z.literal("assistant.todo.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      todo: assistantTodoSchema
    })
  }),
  z.object({
    type: z.literal("assistant.log.appended"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: assistantLogEntrySchema
    })
  }),
  z.object({
    type: z.literal("assistant.created-card"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema
    })
  })
] as const;
