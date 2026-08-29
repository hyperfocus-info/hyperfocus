import { z } from "zod";
import { assistantServerEventSchemas } from "./server-event-assistants";
import { executionServerEventSchemas } from "./server-event-execution";
import { runtimeServerEventSchemas } from "./server-event-runtime";
import { workspaceServerEventSchemas } from "./server-event-workspace";
import { jobServerEventSchemas } from "./server-event-jobs";
import { getUtf8ByteLength, SERVER_EVENT_BATCH_MAX_ITEMS, SERVER_EVENT_EMIT_MAX_BYTES } from "./shared";

const serverEventShapeSchema = z.discriminatedUnion("type", [
  ...runtimeServerEventSchemas,
  ...workspaceServerEventSchemas,
  ...executionServerEventSchemas,
  ...jobServerEventSchemas,
  ...assistantServerEventSchemas
]);
export const serverEventSchema = serverEventShapeSchema.superRefine((event, context) => {
  if (getUtf8ByteLength(JSON.stringify(event)) > SERVER_EVENT_EMIT_MAX_BYTES) context.addIssue({ code: "custom",
    message: `Server event exceeds ${SERVER_EVENT_EMIT_MAX_BYTES} UTF-8 bytes` });
});

export const serverEventBatchFrameSchema = z.object({
  type: z.literal("server.events-batch"),
  payload: z.object({
    events: z.array(serverEventSchema).min(1).max(SERVER_EVENT_BATCH_MAX_ITEMS)
  })
});

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventBatchFrame = z.infer<typeof serverEventBatchFrameSchema>;
export type ServerEventFrame = ServerEvent | ServerEventBatchFrame;

export function parseServerEvent(input: unknown): ServerEvent {
  return serverEventSchema.parse(input);
}

export function parseServerEventFrame(input: unknown): ServerEvent[] {
  if (isObjectWithType(input, "server.events-batch")) {
    return serverEventBatchFrameSchema.parse(input).payload.events;
  }

  return [parseServerEvent(input)];
}

function isObjectWithType(input: unknown, type: string): input is { type: string } {
  return typeof input === "object" && input !== null && "type" in input && input.type === type;
}
