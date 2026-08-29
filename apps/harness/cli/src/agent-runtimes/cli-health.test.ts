import { describe, expect, test } from "bun:test";
import { createSecureToken, extractCodexFinalText, parseCopilotModelChoices } from "./cli-health";
import { createAttachTokenStore } from "../server/transport/attach-ownership";

describe("cli health helpers", () => {
  test("bounds and expires abandoned attach tokens", () => {
    const removed: string[] = [], store = createAttachTokenStore<{ token: string; clientId: string; expiresAt: string }>(
      (entry) => removed.push(entry.token), 2);
    const record = (token: string, offsetMs = 10_000) => ({ token, clientId: "client",
      expiresAt: new Date(Date.now() + offsetMs).toISOString() });
    store.issue(record("expired", -1)); store.issue(record("first")); store.issue(record("second")); store.issue(record("latest"));
    expect(removed).toEqual(["expired", "first"]);
    expect(store.consume("first", "client")).toBeUndefined();
    expect(store.consume("latest", "client")?.token).toBe("latest");
  });

  test("extracts codex final assistant message from jsonl", () => {
    const stdout = [
      '{"type":"thread.started","thread_id":"1"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
    ].join("\n");

    expect(extractCodexFinalText(stdout)).toBe("OK");
  });

  test("parses copilot model choices from help text", () => {
    const help = "--model <MODEL>  Model to use. choices: gpt-5, claude-3.7-sonnet, gemini-2.5-pro";
    expect(parseCopilotModelChoices(help)).toEqual(["gpt-5", "claude-3.7-sonnet", "gemini-2.5-pro"]);
  });

  test("creates base64url secure attach token", () => {
    const token = createSecureToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
