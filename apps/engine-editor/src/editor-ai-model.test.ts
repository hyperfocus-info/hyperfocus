import { describe, expect, test } from "bun:test";
import type { ServerEvent } from "@hyperfocus/ai-core";
import { reduceTranscript } from "./editor-ai-model";

describe("editor AI transcript", () => {
  test("accumulates streamed deltas without duplicating the completed message", () => {
    const first = reduceTranscript([], { type: "chat.delta", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", delta: "Hello" } } as ServerEvent);
    const second = reduceTranscript(first, { type: "chat.delta", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", delta: " world" } } as ServerEvent);
    expect(second).toEqual([{ id: "stream-r1", role: "assistant", content: "Hello world", pending: true }]);
    const complete = reduceTranscript(second, { type: "chat.complete", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", assistantMessage: { id: "m1", role: "assistant", content: "Hello world", createdAt: "now" }, state: { sessionId: "s", messages: [], isStreaming: false } } } as ServerEvent);
    expect(complete).toEqual([{ id: "m1", role: "assistant", content: "Hello world" }]);
  });
});

