import { parseClientCommand } from "./harness/protocol/client-command";
import { encodeValue, readValueFrame } from "@hyperfocus/serialization";
import { describe, expect, test } from "bun:test";
import { createHarnessClient, normalizeHarnessEndpoint, type HarnessWebSocket } from "./client";

describe("harness endpoint normalization", () => {
  test("accepts local origins and explicit websocket endpoints", () => {
    expect(normalizeHarnessEndpoint("127.0.0.1:8787")).toBe("ws://127.0.0.1:8787/ws");
    expect(normalizeHarnessEndpoint("https://harness.example.test/anything?q=1")).toBe("wss://harness.example.test/ws");
    expect(normalizeHarnessEndpoint("ws://localhost:8787/ws")).toBe("ws://localhost:8787/ws");
    expect(normalizeHarnessEndpoint("http://localhost:8787", "session-token"))
      .toBe("ws://localhost:8787/ws?harnessSession=session-token");
  });

  test("rejects empty and unrelated protocols", () => {
    expect(() => normalizeHarnessEndpoint(" ")).toThrow("required");
    expect(() => normalizeHarnessEndpoint("file:///tmp/socket")).toThrow("HTTP(S) or WS(S)");
  });
});

describe("harness client lifecycle", () => {
  test("explicit protobuf comparison negotiates binary commands and accepts binary readiness", async () => {
    resetFakeSockets();
    const client = createClient({ encoding: "protobuf" });
    try {
      const ready = client.connect(), socket = fakeSockets[0]!;
      expect(new URL(socket.url).searchParams.get("encoding")).toBe("protobuf");
      socket.open();
      socket.message(encodeValue(connectionReadyEvent()));
      await ready;
      expect(client.send({ type: "agent.list", requestId: "binary-1" }).status).toBe("sent");
      expect(socket.sent[0]).toBeInstanceOf(Uint8Array);
      expect(parseClientCommand(readValueFrame(socket.sent[0])).requestId).toBe("binary-1");
    } finally { client.disconnect(); }
  });
  test("waits for ready and flushes commands queued while connecting", async () => {
    resetFakeSockets();
    const client = createClient();
    const ready = client.connect();
    const socket = fakeSockets[0]!;
    socket.open();
    expect(client.getSnapshot().state).toBe("connecting");
    expect(client.send({ type: "agent.list", requestId: "queued-1" })).toEqual({ status: "queued", position: 1 });
    expect(socket.sent).toEqual([]);

    socket.message(JSON.stringify(connectionReadyEvent()));
    await ready;
    expect(client.getSnapshot().state).toBe("connected");
    expect(typeof socket.sent[0]).toBe("string");
    expect(socket.sent.map((value) => parseClientCommand(readValueFrame(value)).requestId)).toEqual(["queued-1"]);
    client.disconnect();
  });

  test("reconnects with the last snapshot and ignores stale socket events", async () => {
    resetFakeSockets();
    const client = createClient({ reconnect: { initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 2 } });
    const connected = client.connect();
    const first = fakeSockets[0]!;
    first.open();
    first.message(JSON.stringify(connectionReadyEvent()));
    await connected;
    first.close();
    expect(client.getSnapshot().state).toBe("recovering");
    first.message(JSON.stringify({ type: "workspace.updated", requestId: "stale", payload: { workspace: { projects: [] } } }));
    expect(client.send({ type: "agent.list", requestId: "during-recovery" }).status).toBe("queued");

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = fakeSockets[1]!;
    second.open();
    second.message(JSON.stringify(connectionReadyEvent()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getSnapshot().workspace?.activeProjectId).toBe("project-1");
    expect(second.sent.map((value) => parseClientCommand(readValueFrame(value)).requestId)).toEqual(["during-recovery"]);
    client.disconnect();
  });

  test("returns the chat request id used on the wire", async () => {
    resetFakeSockets();
    const client = createClient();
    const connected = client.connect();
    const socket = fakeSockets[0]!;
    socket.open();
    socket.message(JSON.stringify(connectionReadyEvent()));
    await connected;

    const result = client.sendChat({ content: "hello" });
    expect(result.delivery).toEqual({ status: "sent" });
    expect(parseClientCommand(readValueFrame(socket.sent[0]!)).requestId).toBe(result.requestId);
    client.disconnect();
  });

  test("bounds queued commands and incoming frames", async () => {
    resetFakeSockets();
    const client = createClient({ reconnect: false, maxQueuedCommands: 1, maxEventFrameBytes: 64 });
    void client.connect().catch(() => {});
    const socket = fakeSockets[0]!;
    expect(client.send({ type: "agent.list", requestId: "one" }).status).toBe("queued");
    expect(client.send({ type: "agent.list", requestId: "two" })).toEqual({ status: "rejected", reason: "queue-full" });
    socket.open();
    socket.message("x".repeat(65));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getSnapshot()).toMatchObject({ state: "error", error: "Harness event frame exceeds 64 bytes" });
    client.disconnect();
  });
});

function createClient(overrides: Partial<Parameters<typeof createHarnessClient>[0]> = {}) {
  return createHarnessClient({
    endpoint: "http://127.0.0.1:8787",
    createWebSocket: createFakeWebSocket,
    reconnect: false,
    readyTimeoutMs: 1_000,
    heartbeatIntervalMs: 60_000,
    ...overrides
  });
}

type FakeSocket = HarnessWebSocket & {
  readonly url: string;
  readonly sent: Array<string | Uint8Array>;
  open(): void;
  message(data: unknown): void;
};
const fakeSockets: FakeSocket[] = [];

function resetFakeSockets() {
  fakeSockets.length = 0;
}

function createFakeWebSocket(url: string): FakeSocket {
  const listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  const sent: Array<string | Uint8Array> = [];
  const socket = {
    url,
    sent,
    readyState: 0,
    addEventListener(type: "message" | "close" | "error", listener: (event: { data?: unknown }) => void) {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    },
    send(value: string | Uint8Array) {
      if (socket.readyState !== 1) throw new Error("not open");
      socket.sent.push(value);
    },
    open() {
      socket.readyState = 1;
      dispatch("open", {});
    },
    message(data: unknown) {
      dispatch("message", { data });
    },
    close(_code?: number, _reason?: string) {
      if (socket.readyState === 3) return;
      socket.readyState = 3;
      dispatch("close", {});
    }
  };
  const dispatch = (type: string, event: { data?: unknown }) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  fakeSockets.push(socket);
  return socket;
}

function connectionReadyEvent() {
  return {
    type: "connection.ready",
    payload: {
      agents: [{ id: "pi", label: "Pi" }],
      workspace: {
        activeProjectId: "project-1",
        projects: [{
          id: "project-1",
          name: "Example",
          rootPath: "C:\\repo",
          activeThreadId: "thread-1",
          threads: [{
            id: "thread-1",
            kind: "user",
            title: "Thread 1",
            titleSource: "custom",
            status: "active",
            badgeState: "idle",
            messageCount: 0,
            updatedAt: new Date().toISOString()
          }],
          session: {
            sessionId: "session-1",
            selectedAgentId: "pi",
            executionModelId: "openai/gpt-5.4",
            messages: [],
            isStreaming: false
          },
          runSummaries: []
        }]
      },
      preferences: {
        hasUsableApiKey: false,
        hasStoredApiKey: false,
        hasUsableOpenAiApiKey: false,
        hasStoredOpenAiApiKey: false,
        hasUsableGoogleApiKey: false,
        hasStoredGoogleApiKey: false,
        providerBrand: "gpt",
        debugEnabledDefault: false,
        tracePanelDefaultOpen: false,
        subagentWorktreeStrategyDefault: "same-worktree",
        blockChatOnDirtyGitDefault: true,
        dirtyGitChangeLimitDefault: 20,
        autoCompactContextThresholdPercentDefault: 40,
        planExecutionModeDefault: "countdown",
        planExecutionDelaySecondsDefault: 10,
        correctnessIterationModeDefault: "ask-before-iterate",
        backgroundJobApprovalPolicyDefault: "ask-risky",
        assistantAutoApproveNonBlockingQuestionsDefault: true,
        memoryBankEnabledDefault: true,
        attachmentsEnabled: true,
        capabilities: [],
        agentRuntimes: []
      },
      tokenUsage: {
        session: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalProcessedTokens: 0, totalTokensIncludingCached: 0, events: 0 },
        lifetime: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalProcessedTokens: 0, totalTokensIncludingCached: 0, events: 0 }
      },
      setup: { launchMode: "source", updatedAt: new Date().toISOString(), readyRequiredCount: 0, totalRequiredCount: 0, checks: [] },
      backgroundJobs: { jobs: [], runs: [], templates: [] },
      assistants: { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
      notifications: { items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 },
      executionControl: { isPaused: false, deferredPlanningQuestionCount: 0, deferredAssistantQuestionCount: 0, deferredBrowserApprovalCount: 0 }
    }
  };
}
