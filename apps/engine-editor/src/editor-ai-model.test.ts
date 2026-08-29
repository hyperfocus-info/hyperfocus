import { describe, expect, test } from "bun:test";
import { parseServerEvent } from "@hyperfocus/ai-core";
import { extractEditorPatchProposal, projectAwareEditorPrompt, reduceTranscript } from "./editor-ai-model";
import { createEditorCommandSession } from "./editor-command-session";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor AI transcript", () => {
  test("adds live editor context and accepts only patch proposals", () => {
    const snapshot = createEditorCommandSession(createDefaultProject("Context Game")).snapshot();
    const prompt = projectAwareEditorPrompt("rename it", snapshot, { workspace: "script", selectedEntityId: "player-01", activeSourcePath: "src/gameplay.ts" });
    expect(prompt).toContain("Context Game");
    expect(prompt).toContain('"workspace":"script"');
    expect(prompt).toContain('"selectedEntityId":"player-01"');
    expect(prompt).toContain("project.patch");
    const plan = extractEditorPatchProposal('```hyperfocus-command-plan\n{"requestId":"ai-1","intent":"Rename","commands":[{"type":"project.patch","label":"Rename","operations":[{"op":"test","path":"/name","value":"Context Game"},{"op":"replace","path":"/name","value":"New"}]}]}\n```');
    expect(plan?.commands[0]?.type).toBe("project.patch");
    expect(extractEditorPatchProposal('```hyperfocus-command-plan\n{"requestId":"stale","intent":"Rename","commands":[{"type":"project.patch","label":"Rename","operations":[{"op":"replace","path":"/name","value":"New"}]}]}\n```')).toBeUndefined();
    expect(extractEditorPatchProposal('```hyperfocus-command-plan\n{"requestId":"bad","intent":"replace","commands":[{"type":"project.replace","project":{}}]}\n```')).toBeUndefined();
  });

  test("accumulates streamed deltas without duplicating the completed message", () => {
    const first = reduceTranscript([], parseServerEvent({ type: "chat.delta", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", delta: "Hello" } }));
    const second = reduceTranscript(first, parseServerEvent({ type: "chat.delta", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", delta: " world" } }));
    expect(second).toEqual([{ id: "stream-r1", role: "assistant", content: "Hello world", pending: true }]);
    const complete = reduceTranscript(second, parseServerEvent({ type: "chat.complete", requestId: "r1", payload: { projectId: "p", threadId: "t", sessionId: "s", assistantMessage: { id: "m1", role: "assistant", content: "Hello world", createdAt: "now" }, state: { sessionId: "s", messages: [], isStreaming: false } } }));
    expect(complete).toEqual([{ id: "m1", role: "assistant", content: "Hello world" }]);
  });

  test("reconciles the optimistic user message by request id", () => {
    const messages = [{ id: "local-r1", role: "user" as const, content: "Hello", pending: true }];
    const appended = parseServerEvent({
      type: "chat.message-appended",
      requestId: "r1",
      payload: {
        projectId: "p",
        threadId: "t",
        sessionId: "s",
        message: { id: "persisted", role: "user", kind: "plain", content: "Hello", createdAt: "now" },
        state: { sessionId: "s", selectedAgentId: "pi", executionModelId: "openai/gpt-5.4", messages: [], isStreaming: false }
      }
    });
    const reconciled = reduceTranscript(messages, appended);
    expect(reconciled).toEqual([{ id: "persisted", role: "user", content: "Hello" }]);
  });
});
