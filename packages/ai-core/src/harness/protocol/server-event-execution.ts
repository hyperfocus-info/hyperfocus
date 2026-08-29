import { z } from "zod";
import { chatMessageSchema, experimentInspectionSchema, memoryEntrySchema, streamingTailSegmentSchema } from "./conversation";
import { agentPlanSchema, agentRunStateSchema, agentRunStatusSchema, agentTraceSchema, projectContextUsageSchema,
  RUN_DETAIL_CHUNK_MAX_BYTES, runDiagnosticsReportSchema, runFailureCategorySchema, runPreflightSchema } from "./execution";
import { boundedPageCursorSchema, boundedStreamDeltaSchema, memoryEntryIdSchema, projectIdSchema, requestIdSchema, runIdSchema,
  sessionIdSchema, threadIdSchema } from "./shared";
import { chatSessionStateSchema, projectThreadSummarySchema, tokenUsageStateSchema } from "./workspace";

export const executionServerEventSchemas = [
  z.object({
    type: z.literal("agent.plan"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      plan: agentPlanSchema
    })
  }),
  z.object({
    type: z.literal("agent.trace"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      trace: agentTraceSchema
    })
  }),
  z.object({
    type: z.literal("chat.delta"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      delta: boundedStreamDeltaSchema
    })
  }),
  z.object({
    type: z.literal("chat.complete"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      assistantMessage: chatMessageSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("chat.streaming-tail-updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      runId: runIdSchema,
      segments: z.array(streamingTailSegmentSchema).max(16),
      state: chatSessionStateSchema.optional()
    })
  }),
  z.object({
    type: z.literal("chat.message-appended"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      message: chatMessageSchema,
      thread: projectThreadSummarySchema.optional(),
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("chat.message-updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      message: chatMessageSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.message-appended"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      message: chatMessageSchema,
      thread: projectThreadSummarySchema.optional(),
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.message-updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      message: chatMessageSchema
    })
  }),
  z.object({
    type: z.literal("chat.error"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema.optional(),
      threadId: threadIdSchema.optional(),
      message: z.string().min(1),
      detail: z.string().min(1).optional()
    })
  }),
  z.object({
    type: z.literal("run.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      run: agentRunStateSchema.refine((run) => run.threadRunSequence !== undefined,
        "Run lifecycle events require a thread run sequence")
    }).refine(({ threadId, run }) => threadId === run.threadId,
      { message: "Run lifecycle thread must match the payload thread", path: ["run", "threadId"] })
  }),
  z.object({
    type: z.literal("run.detail.loaded"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      chunks: z.object({
        items: z.array(z.string().max(RUN_DETAIL_CHUNK_MAX_BYTES).refine((value) =>
          new TextEncoder().encode(value).byteLength <= RUN_DETAIL_CHUNK_MAX_BYTES,
        `Run detail chunk exceeds ${RUN_DETAIL_CHUNK_MAX_BYTES} UTF-8 bytes`)).max(128),
        nextCursor: boundedPageCursorSchema.optional(),
        totalApprox: z.number().int().nonnegative().optional()
      })
    })
  }),
  z.object({
    type: z.literal("run.status-patched"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      status: agentRunStatusSchema,
      failureMessage: z.string().min(1).optional(),
      failureCategory: runFailureCategorySchema.optional(),
      resumable: z.boolean().optional(),
      retryable: z.boolean().optional(),
      updatedAt: z.string().datetime().or(z.string().min(1)),
      completedAt: z.string().datetime().or(z.string().min(1)).optional()
    })
  }),
  z.object({
    type: z.literal("experiment.inspected"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      inspection: experimentInspectionSchema
    })
  }),
  z.object({
    type: z.literal("memory.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      entries: z.array(memoryEntrySchema).max(512)
    })
  }),
  z.object({
    type: z.literal("memory.inspected"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: memoryEntrySchema
    })
  }),
  z.object({
    type: z.literal("memory.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: memoryEntrySchema
    })
  }),
  z.object({
    type: z.literal("memory.reordered"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      entries: z.array(memoryEntrySchema).max(512)
    })
  }),
  z.object({
    type: z.literal("memory.deleted"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("run-diagnostics.inspected"),
    requestId: requestIdSchema,
    payload: z.object({
      report: runDiagnosticsReportSchema
    })
  }),
  z.object({
    type: z.literal("run.preflight"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      preflight: runPreflightSchema
    })
  }),
  z.object({
    type: z.literal("run.cleared"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("project.context"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      contextUsage: projectContextUsageSchema,
      tokenUsage: tokenUsageStateSchema.optional()
    })
  }),
  z.object({
    type: z.literal("usage.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      tokenUsage: tokenUsageStateSchema
    })
  })
] as const;
