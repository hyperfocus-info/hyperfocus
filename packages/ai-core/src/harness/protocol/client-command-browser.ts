import { z } from "zod";
import { projectIdSchema, requestIdSchema, runIdSchema, sessionIdSchema, threadIdSchema } from "./shared";

export const browserClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("browser.approval.resolve"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      sessionId: sessionIdSchema,
      toolCallId: z.string().min(1).max(256),
      approved: z.boolean()
    })
  })
]);
