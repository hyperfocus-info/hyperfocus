import type { PiAgentPromptRequest, PiAgentPromptResult } from "../pi-agent-adapter";
import { runFakePlannerPrompt } from "./fake-pi-agent-planner";
import { runFakeSubagentPrompt } from "./fake-pi-agent-subagent";
import type { FakePromptBehavior } from "./fake-pi-agent-prompt-types";

export async function runFakePiAgentPrompt(
  request: PiAgentPromptRequest,
  behavior: FakePromptBehavior
): Promise<PiAgentPromptResult> {
  const defaultExecutionModelId = request.modelId.startsWith("google/")
        ? "google/gemini-2.5-flash"
        : request.modelId.startsWith("anthropic/")
          ? "anthropic/claude-sonnet-4-6"
        : "openai/gpt-5.4";
  const withUsage = (text: string): PiAgentPromptResult => ({
        text,
        contextUsage: {
          tokens: request.kind === "planner" ? 1200 : request.kind === "subagent" ? 800 : 2400,
          contextWindow: 200000,
          usagePercent: request.kind === "planner" ? 0.6 : request.kind === "subagent" ? 0.4 : 1.2,
          sessionStats: {
            sessionFile: undefined,
            sessionId: crypto.randomUUID(),
            userMessages: 1,
            assistantMessages: 1,
            toolCalls: 0,
            toolResults: 0,
            totalMessages: 2,
            tokens: {
              input: 100,
              output: 200,
              cacheRead: 0,
              cacheWrite: 0,
              total: 300
            },
            cost: 0,
            contextUsage: {
              tokens: request.kind === "planner" ? 1200 : request.kind === "subagent" ? 800 : 2400,
              contextWindow: 200000,
              percent: request.kind === "planner" ? 0.6 : request.kind === "subagent" ? 0.4 : 1.2
            }
          }
        }
      });

  if (request.kind === "planner") {
    return runFakePlannerPrompt(request, defaultExecutionModelId, withUsage);
  }

  if (request.kind === "subagent") {
    return runFakeSubagentPrompt(request, withUsage, behavior);
  }

  if (request.prompt.includes("browser noise")) {
        request.onExecutionEvent?.({ type: "session-created" });
        request.onExecutionEvent?.({
          type: "tool-start",
          toolCallId: "tool-call-1",
          toolName: "playwright-browser",
          args: { url: "https://example.com" }
        });
        request.onExecutionEvent?.({
          type: "tool-end",
          toolCallId: "tool-call-1",
          toolName: "playwright-browser",
          result: { ok: true },
          isError: false
        });
      }

  if (request.kind === "executor" && request.prompt.includes("slow request")) {
        return await new Promise((resolve, reject) => {
          request.abortSignal?.addEventListener(
            "abort",
            () => reject(new Error("aborted by test")),
            { once: true }
          );
        });
      }

  if (request.kind === "executor" && request.prompt.includes("Fail shared setup before fan-out")) {
        throw new Error("prerequisite setup failed");
      }

  if (
        request.kind === "executor" &&
        (request.prompt.includes("Scaffold app files in the workspace") ||
          request.prompt.includes("Scaffold missing app files") ||
          request.prompt.includes("read-only scaffold failure"))
      ) {
        return withUsage("I couldn't write the scaffold because the workspace is mounted read-only.");
      }

  if (request.kind === "aggregator" && request.prompt.includes("status window")) {
        await behavior.waitForDeferredAggregatorRelease();
      }

  return withUsage(request.kind === "aggregator" ? "aggregated result" : "main execution result");
}
