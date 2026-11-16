import type { AgentSession, AgentSessionEvent, SessionStats } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import { debugLog } from "../logging";
import { extractCachedInputTokens } from "../prompt-cache";
import { createHash } from "node:crypto";
import { qualityPayloadHash } from "../verification/quality-payload";

export type PiExecutionSession = Pick<AgentSession, "messages" | "subscribe" | "prompt" | "getSessionStats" | "abort" | "dispose"> & Partial<Pick<AgentSession, "steer">>;

export function createPiSdkExecutionController(
  session: PiExecutionSession,
  request: PiAgentPromptRequest,
  contextWindow: number,
  onSessionEvent: (event: AgentSessionEvent) => void
) {
  let disposed = false;
  let lastSessionEventSummary = "session-created";
  let running = false;
  let aborted = false;
  const unsubscribe = session.subscribe((event) => {
    lastSessionEventSummary = summarizeSessionEvent(event);
    onSessionEvent(event);
  });
  request.onExecutionEvent?.({ type: "session-created" });

  const abortHandler = request.abortSignal
    ? async () => {
        await abort();
      }
    : undefined;

  if (abortHandler) {
    request.abortSignal?.addEventListener("abort", abortHandler, { once: true });
  }

  function continueWithPrompt(prompt: string = "continue") {
    return run(prompt);
  }

  async function abort() {
    aborted = true;
    debugLog("agent.abort", {
      kind: request.kind,
      modelId: request.modelId
    });
    await session.abort();
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    if (abortHandler) {
      request.abortSignal?.removeEventListener("abort", abortHandler);
    }
    unsubscribe();
    session.dispose();
  }

  function run(prompt: string) {
    if (disposed) {
      return Promise.reject(new Error("Execution controller is disposed"));
    }

    if (running) {
      return Promise.reject(new Error("Execution already running"));
    }

    running = true;
    aborted = false;
    const currentResult = (async () => {
      request.abortSignal?.throwIfAborted();
      // SDK listener delivery can lag prompt completion. Read canonical messages,
      // retaining identities rather than array offsets across SDK compaction.
      const previousMessages = new Set(session.messages);
      const priorTokens = { ...session.getSessionStats().tokens };
      await promptSession(session, prompt, request.images, request.abortSignal, lastSessionEventSummary, () => {
        request.onExecutionEvent?.({ type: "context-delivery", boundary: "sdk-prompt", promptSha256: createHash("sha256").update(prompt).digest("hex"), qualityContextSha256: qualityPayloadHash(prompt) });
      });
      request.abortSignal?.throwIfAborted();
      if (aborted) throw new DOMException("Pi agent execution aborted", "AbortError");
      const terminalMessage = session.messages.slice().reverse().find((message) => message.role === "assistant");
      const text = completedText(terminalMessage && !previousMessages.has(terminalMessage) ? terminalMessage : undefined,
        lastSessionEventSummary, session.getSessionStats());

      if (!text) {
        const sessionStats = session.getSessionStats();
        throw createPiExecutionError(
          "empty-response",
          "Pi agent returned an empty response",
          lastSessionEventSummary,
          sessionStats
        );
      }

      const cumulativeStats = session.getSessionStats();
      const sessionStats = { ...cumulativeStats, tokens: { ...cumulativeStats.tokens } };
      for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
        sessionStats.tokens[key] = Math.max(0, cumulativeStats.tokens[key] - priorTokens[key]);
      }
      if (request.modelId.startsWith("anthropic/") && sessionStats.tokens.cacheWrite > 0) {
        debugLog("agent.cache.creation", {
          providerBrand: "claude",
          modelId: request.modelId,
          cacheCreationInputTokens: sessionStats.tokens.cacheWrite
        });
      }
      const tokens = sessionStats.contextUsage?.tokens ?? undefined;
      const cachedInputTokens = extractCachedInputTokens(sessionStats);
      return {
        text,
        contextUsage: {
          tokens,
          contextWindow: contextWindow,
          usagePercent: tokens === undefined ? undefined : Math.min(100, (tokens / contextWindow) * 100),
          sessionStats,
          cachedInputTokens
        }
      };
    })().finally(() => {
      running = false;
    });

    return currentResult;
  }

  const result = run(request.prompt);
  return { result, continueWithPrompt, abort, dispose, steer: session.steer ? async (message: string) => {
    if (disposed || !running) throw new Error("The active turn has ended; queue the message instead");
    await session.steer!(message);
  } : undefined };
}

function summarizeSessionEvent(event: AgentSessionEvent) {
  switch (event.type) {
    case "message_update":
      return `message_update:${event.assistantMessageEvent.type}`;
    case "tool_execution_start":
      return `tool_execution_start:${event.toolName}`;
    case "tool_execution_update":
      return `tool_execution_update:${event.toolName}`;
    case "tool_execution_end":
      return `tool_execution_end:${event.toolName}:${event.isError ? "error" : "ok"}`;
    default:
      return event.type;
  }
}

function createPiExecutionError(
  category: "empty-response" | "stream-disconnect" | "invalid-json" | "unknown",
  message: string,
  lastEvent: string,
  sessionStats: SessionStats
) {
  const stats = sessionStats.contextUsage?.tokens;
  return new Error(
    `${message} [category=${category}] [last-event=${lastEvent}]${stats === undefined ? "" : ` [tokens=${stats}]`}`
  );
}

function completedText(message: AssistantMessage | undefined, lastEvent: string, stats: SessionStats) {
  if (!message) return undefined;
  if (message.stopReason === "aborted") {
    const error = new Error(message.errorMessage || "Pi agent execution aborted");
    error.name = "AbortError";
    throw error;
  }
  if (message.stopReason !== "stop") {
    throw createPiExecutionError(
      message.stopReason === "error" ? "stream-disconnect" : "unknown",
      message.errorMessage || `Pi agent did not finish (${message.stopReason})`,
      lastEvent,
      stats
    );
  }
  return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("").trim();
}

async function promptSession(
  session: PiExecutionSession,
  prompt: string,
  images: PiAgentPromptRequest["images"],
  abortSignal: AbortSignal | undefined,
  lastEvent: string,
  onDelivery: () => void
) {
  try {
    const pending = session.prompt(prompt, { images });
    onDelivery();
    await pending;
  } catch (error) {
    if (abortSignal?.aborted || isAbortLikeError(error)) {
      throw error;
    }
    throw createPiExecutionError("stream-disconnect", "Pi agent stream transport failed", lastEvent, session.getSessionStats());
  }
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = error.message.toLowerCase();
  return error.name === "AbortError" || normalized.includes("abort") || normalized.includes("cancel");
}
