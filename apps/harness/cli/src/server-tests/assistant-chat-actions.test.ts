import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("server assistant chat action wiring", () => {
  const readServerModule = (relativePath: string) => readFileSync(path.join(import.meta.dir, relativePath), "utf8");
  const assistantActionsSource = readServerModule("../server/automation/assistant-actions.ts");
  const assistantsCommandSource = readServerModule("../server/commands/assistants.ts");
  const chatSendSource = readServerModule("../server/commands/chat-send.ts");
  const runtimeSource = readServerModule("../server/runtime/initialize.ts");

  test("chat.send resolves assistant actions before planner flow", () => {
    expect(chatSendSource).toContain("resolvePersistedAssistantChatAction({");
    expect(chatSendSource).toContain("executeAssistantChatAction({");
    const actionIndex = chatSendSource.indexOf("resolvePersistedAssistantChatAction({");
    const plannerRunIndex = chatSendSource.indexOf("const runProject = repository.createAgentRun(", actionIndex);
    expect(actionIndex).toBeLessThan(plannerRunIndex);
  });

  test("assistant action clarification persists typed planning intent", () => {
    expect(assistantActionsSource).toContain("assistant-action-intent");
    expect(chatSendSource).toContain("createAssistantActionIntentQuestion");
  });

  test("project-chat assistant launch checks runnable state without auto-resume", () => {
    expect(assistantActionsSource).toContain("requireAssistantForProjectChat");
    expect(assistantActionsSource).not.toContain("ensureAssistantActiveForProjectChat");
    const chatCase = assistantActionsSource.slice(
      assistantActionsSource.indexOf('case "chat"'),
      assistantActionsSource.indexOf('case "inspect"')
    );
    expect(chatCase.indexOf("requireAssistantForProjectChat(repository, assistant.id);")).toBeLessThan(
      chatCase.indexOf("assertAssistantRunnableForLaunch(repository, assistant.id);")
    );
  });

  test("circuit breaker retry bypasses runnable launch gate", () => {
    expect(assistantsCommandSource).toContain('case "assistant.circuit-breaker.retry"');
    const retryCaseIndex = assistantsCommandSource.indexOf('case "assistant.circuit-breaker.retry"');
    const nextCaseIndex = assistantsCommandSource.indexOf('case "assistant.chat.send"', retryCaseIndex);
    const retryCase = assistantsCommandSource.slice(retryCaseIndex, nextCaseIndex);
    expect(retryCase).toContain("assistantManager.recoverAssistant");
    expect(retryCase).not.toContain("assertAssistantRunnableForLaunch");
  });

  test("startup cleans stale assistant questions before syncing inbox notifications", () => {
    expect(runtimeSource).toContain("cleanupStaleAssistantQuestions");
    const cleanupIndex = runtimeSource.indexOf("assistantManager.cleanupStaleAssistantQuestions();");
    const syncIndex = runtimeSource.indexOf("repository.syncAssistantQuestionNotifications();", cleanupIndex);
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeLessThan(syncIndex);
  });
});
