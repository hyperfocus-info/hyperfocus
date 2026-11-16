import { type ServerEvent } from "@hyperfocus/ai-core/protocol";

export function assistantDelta(index: number): ServerEvent {
  return {
    type: "assistant.chat.delta",
    requestId: `req-${index}`,
    payload: {
      assistantId: "assistant-1",
      sessionId: "session-1",
      delta: `chunk-${index}`
    }
  };
}
