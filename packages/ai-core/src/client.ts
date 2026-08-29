import { parseClientCommand, type ClientCommand } from "./harness/protocol/client-command";
import type { AgentOption } from "./harness/protocol/conversation";
import { createRequestId } from "./harness/protocol/factories";
import { parseServerEventFrame, type ServerEvent } from "./harness/protocol/server-event";
import { getUtf8ByteLength, SERVER_EVENT_FRAME_MAX_BYTES } from "./harness/protocol/shared";
import type { WorkspaceState } from "./harness/protocol/workspace";

export type HarnessConnectionState = "idle" | "connecting" | "connected" | "recovering" | "disconnected" | "error";

export type HarnessClientSnapshot = {
  state: HarnessConnectionState;
  workspace?: WorkspaceState;
  agents: readonly AgentOption[];
  error?: string;
};

export type HarnessReconnectOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
};

export type HarnessWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message" | "close" | "error", listener: (event: { data?: unknown }) => void): void;
};

export type HarnessClientOptions = {
  endpoint: string;
  sessionToken?: string;
  WebSocket?: typeof globalThis.WebSocket;
  createWebSocket?: (endpoint: string) => HarnessWebSocket;
  reconnect?: false | HarnessReconnectOptions;
  readyTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxQueuedCommands?: number;
  maxEventFrameBytes?: number;
};

export type HarnessSendResult =
  | { status: "sent" }
  | { status: "queued"; position: number }
  | { status: "rejected"; reason: "not-connected" | "queue-full" | "send-failed" };

export type HarnessClientReady = {
  workspace: WorkspaceState;
  agents: readonly AgentOption[];
};

export type HarnessChatSendResult = {
  requestId: string;
  delivery: HarnessSendResult;
};

export type SendChatInput = {
  content: string;
  projectId?: string;
  threadId?: string;
  agentId?: "pi" | "copilot-cli" | "codex-cli";
  modeId?: string;
  executionModelId?: string;
  reasoningStrength?: "low" | "medium" | "high" | "extra-high";
};

type ReadyWaiter = {
  promise: Promise<HarnessClientReady>;
  resolve: (ready: HarnessClientReady) => void;
  reject: (error: Error) => void;
};

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_QUEUED_COMMANDS = 256;

/** Converts an HTTP origin or websocket URL to the harness control endpoint. */
export function normalizeHarnessEndpoint(input: string, sessionToken?: string) {
  const value = input.trim();
  if (!value) throw new Error("Harness endpoint is required");
  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Harness endpoint must use HTTP(S) or WS(S)");
  url.pathname = "/ws";
  url.search = "";
  if (sessionToken) url.searchParams.set("harnessSession", sessionToken);
  url.hash = "";
  return url.toString();
}

function resolveHarnessWebSocket(options: HarnessClientOptions) {
  if (options.createWebSocket) return { createSocket: options.createWebSocket, openReadyState: 1 };
  const WebSocketImplementation = options.WebSocket ?? globalThis.WebSocket;
  if (!WebSocketImplementation) throw new Error("WebSocket is not available in this environment");
  return {
    createSocket: (endpoint: string) => new WebSocketImplementation(endpoint),
    openReadyState: WebSocketImplementation.OPEN
  };
}

function normalizeHarnessClientOptions(options: HarnessClientOptions) {
  const maxEventFrameBytes = positiveInteger(options.maxEventFrameBytes, SERVER_EVENT_FRAME_MAX_BYTES, "maxEventFrameBytes");
  if (maxEventFrameBytes > SERVER_EVENT_FRAME_MAX_BYTES) {
    throw new Error(`maxEventFrameBytes cannot exceed the protocol limit of ${SERVER_EVENT_FRAME_MAX_BYTES}`);
  }
  return {
    heartbeatIntervalMs: positiveDuration(options.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS, "heartbeatIntervalMs"),
    heartbeatTimeoutMs: positiveDuration(options.heartbeatTimeoutMs, DEFAULT_HEARTBEAT_TIMEOUT_MS, "heartbeatTimeoutMs"),
    maxEventFrameBytes,
    maxQueuedCommands: positiveInteger(options.maxQueuedCommands, DEFAULT_MAX_QUEUED_COMMANDS, "maxQueuedCommands"),
    readyTimeoutMs: positiveDuration(options.readyTimeoutMs, DEFAULT_READY_TIMEOUT_MS, "readyTimeoutMs"),
    reconnect: normalizeReconnectOptions(options.reconnect)
  };
}

type HarnessClientApiOptions = {
  connect(): Promise<HarnessClientReady>;
  disconnect(): void;
  eventListeners: Set<(event: ServerEvent) => void>;
  getSnapshot(): HarnessClientSnapshot;
  send(command: ClientCommand): HarnessSendResult;
  snapshotListeners: Set<(snapshot: HarnessClientSnapshot) => void>;
};

function createHarnessClientApi(options: HarnessClientApiOptions) {
  function sendChat(input: SendChatInput): HarnessChatSendResult {
    const snapshot = options.getSnapshot();
    const projectId = input.projectId ?? snapshot.workspace?.activeProjectId;
    const project = snapshot.workspace?.projects.find((candidate) => candidate.id === projectId);
    const threadId = input.threadId ?? project?.activeThreadId;
    if (!projectId || !threadId) throw new Error("Open a project and thread in the harness before sending editor chat");
    const requestId = createRequestId();
    const delivery = options.send({
      type: "chat.send",
      requestId,
      payload: {
        projectId,
        threadId,
        agentId: input.agentId ?? "codex-cli",
        content: input.content,
        modeId: input.modeId,
        executionModelId: input.executionModelId,
        reasoningStrength: input.reasoningStrength
      }
    });
    return { requestId, delivery };
  }

  return {
    connect: options.connect,
    disconnect: options.disconnect,
    send: options.send,
    sendChat,
    getSnapshot: options.getSnapshot,
    subscribe(listener: (next: HarnessClientSnapshot) => void) {
      options.snapshotListeners.add(listener);
      listener(options.getSnapshot());
      return () => options.snapshotListeners.delete(listener);
    },
    onEvent(listener: (event: ServerEvent) => void) {
      options.eventListeners.add(listener);
      return () => options.eventListeners.delete(listener);
    }
  };
}

function createHarnessCommandQueue(
  maxQueuedCommands: number,
  rawSend: (command: ClientCommand) => boolean,
  onSendFailure: () => void
) {
  const queue: ClientCommand[] = [];
  return {
    clear() {
      queue.length = 0;
    },
    flush() {
      while (queue.length > 0) {
        const command = queue[0];
        if (!command || !rawSend(command)) {
          onSendFailure();
          return;
        }
        queue.shift();
      }
    },
    send(command: ClientCommand, state: HarnessConnectionState): HarnessSendResult {
      const parsed = parseClientCommand(command);
      if (state === "connected") {
        if (rawSend(parsed)) return { status: "sent" };
        onSendFailure();
        return { status: "rejected", reason: "send-failed" };
      }
      if (state !== "connecting" && state !== "recovering") {
        return { status: "rejected", reason: "not-connected" };
      }
      if (queue.length >= maxQueuedCommands) return { status: "rejected", reason: "queue-full" };
      queue.push(parsed);
      return { status: "queued", position: queue.length };
    }
  };
}

/** Creates a framework-neutral client that reconnects and becomes usable only after a validated ready snapshot. */
export function createHarnessClient(options: HarnessClientOptions) {
  const { createSocket, openReadyState } = resolveHarnessWebSocket(options);
  const { heartbeatIntervalMs, heartbeatTimeoutMs, maxEventFrameBytes, maxQueuedCommands, readyTimeoutMs, reconnect } = normalizeHarnessClientOptions(options);

  let snapshot: HarnessClientSnapshot = { state: "idle", agents: [] };
  let socket: HarnessWebSocket | undefined;
  let generation = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatDeadline: ReturnType<typeof setTimeout> | undefined;
  let heartbeatRequestId: string | undefined;
  let manuallyDisconnected = false;
  let hasConnected = false;
  let readyWaiter: ReadyWaiter | undefined;
  const snapshotListeners = new Set<(next: HarnessClientSnapshot) => void>();
  const eventListeners = new Set<(event: ServerEvent) => void>();

  const publish = (next: HarnessClientSnapshot) => {
    snapshot = next;
    notifyListeners(snapshotListeners, snapshot);
  };

  const stopSocketTimers = () => {
    if (readyTimer) clearTimeout(readyTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (heartbeatDeadline) clearTimeout(heartbeatDeadline);
    readyTimer = undefined;
    heartbeatTimer = undefined;
    heartbeatDeadline = undefined;
    heartbeatRequestId = undefined;
  };

  const rawSend = (command: ClientCommand) => {
    if (!socket || socket.readyState !== openReadyState) return false;
    try {
      socket.send(JSON.stringify(command));
      return true;
    } catch {
      return false;
    }
  };
  const commandQueue = createHarnessCommandQueue(maxQueuedCommands, rawSend, () => socket?.close(1011, "send failed"));

  const scheduleHeartbeat = (currentGeneration: number) => {
    heartbeatTimer = setInterval(() => {
      if (currentGeneration !== generation || snapshot.state !== "connected" || heartbeatRequestId) return;
      const requestId = createRequestId();
      const command = parseClientCommand({ type: "connection.ping", requestId, payload: { timestamp: Date.now() } });
      if (!rawSend(command)) return;
      heartbeatRequestId = requestId;
      heartbeatDeadline = setTimeout(() => {
        if (currentGeneration !== generation || heartbeatRequestId !== requestId) return;
        publish({ ...snapshot, state: "error", error: "Harness heartbeat timed out" });
        socket?.close(1001, "heartbeat timeout");
      }, heartbeatTimeoutMs);
    }, heartbeatIntervalMs);
  };

  const acceptEvent = (event: ServerEvent, currentGeneration: number) => {
    if (currentGeneration !== generation) return;
    if (event.type === "connection.ready") {
      stopSocketTimers();
      reconnectAttempts = 0;
      hasConnected = true;
      const ready = { workspace: event.payload.workspace, agents: event.payload.agents };
      publish({ state: "connected", ...ready });
      readyWaiter?.resolve(ready);
      readyWaiter = undefined;
      commandQueue.flush();
      scheduleHeartbeat(currentGeneration);
    } else if (event.type === "connection.pong" && event.requestId === heartbeatRequestId) {
      if (heartbeatDeadline) clearTimeout(heartbeatDeadline);
      heartbeatDeadline = undefined;
      heartbeatRequestId = undefined;
    } else if (event.type === "workspace.updated") {
      publish({ ...snapshot, workspace: event.payload.workspace });
    }
    notifyListeners(eventListeners, event);
  };

  const failPermanently = (message: string) => {
    stopSocketTimers();
    commandQueue.clear();
    publish({ ...snapshot, state: "error", error: message });
    readyWaiter?.reject(new Error(message));
    readyWaiter = undefined;
  };

  const scheduleReconnect = (message: string) => {
    if (!reconnect || reconnectAttempts >= reconnect.maxAttempts) {
      failPermanently(message);
      return;
    }
    const delay = Math.min(reconnect.maxDelayMs, reconnect.initialDelayMs * (2 ** reconnectAttempts));
    reconnectAttempts += 1;
    publish({ ...snapshot, state: hasConnected ? "recovering" : "connecting", error: message });
    reconnectTimer = setTimeout(openSocket, delay);
  };

  const handleFrame = async (data: unknown, currentGeneration: number) => {
    try {
      const text = await decodeFrame(data, maxEventFrameBytes);
      if (currentGeneration !== generation) return;
      const frame: unknown = JSON.parse(text);
      for (const event of parseServerEventFrame(frame)) acceptEvent(event, currentGeneration);
    } catch (error) {
      if (currentGeneration !== generation) return;
      const message = error instanceof Error ? error.message : "Invalid harness event";
      publish({ ...snapshot, state: "error", error: message });
      socket?.close(1002, "invalid event");
    }
  };

  function openSocket() {
    reconnectTimer = undefined;
    if (manuallyDisconnected) return;
    stopSocketTimers();
    const currentGeneration = ++generation;
    publish({ ...snapshot, state: hasConnected ? "recovering" : "connecting", error: undefined });
    try {
      socket = createSocket(normalizeHarnessEndpoint(options.endpoint, options.sessionToken));
    } catch (error) {
      scheduleReconnect(error instanceof Error ? error.message : "Could not create the harness connection");
      return;
    }
    const currentSocket = socket;
    let receiveChain = Promise.resolve();
    readyTimer = setTimeout(() => {
      if (currentGeneration !== generation || snapshot.state === "connected") return;
      publish({ ...snapshot, state: "error", error: "Harness did not send a ready snapshot in time" });
      currentSocket.close(1001, "ready timeout");
    }, readyTimeoutMs);
    currentSocket.addEventListener("message", (message) => {
      receiveChain = receiveChain.then(() => handleFrame(message.data, currentGeneration));
    });
    currentSocket.addEventListener("close", () => {
      if (currentGeneration !== generation || manuallyDisconnected) return;
      stopSocketTimers();
      generation += 1;
      socket = undefined;
      scheduleReconnect(snapshot.error ?? "Harness connection closed");
    });
    currentSocket.addEventListener("error", () => {
      if (currentGeneration !== generation) return;
      publish({ ...snapshot, error: "Could not connect to the local harness" });
    });
  }

  function connect(): Promise<HarnessClientReady> {
    if (snapshot.state === "connected" && snapshot.workspace) {
      return Promise.resolve({ workspace: snapshot.workspace, agents: snapshot.agents });
    }
    if (readyWaiter) return readyWaiter.promise;
    manuallyDisconnected = false;
    const waiter = createReadyWaiter();
    readyWaiter = waiter;
    if (snapshot.state !== "connecting" && snapshot.state !== "recovering") {
      reconnectAttempts = 0;
      openSocket();
    } else if (!socket && !reconnectTimer) {
      openSocket();
    }
    return waiter.promise;
  }

  function disconnect() {
    manuallyDisconnected = true;
    generation += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    stopSocketTimers();
    socket?.close(1000, "client disconnect");
    socket = undefined;
    commandQueue.clear();
    readyWaiter?.reject(new Error("Harness connection was disconnected"));
    readyWaiter = undefined;
    publish({ ...snapshot, state: "disconnected", error: undefined });
  }

  function send(command: ClientCommand): HarnessSendResult {
    return commandQueue.send(command, snapshot.state);
  }

  return createHarnessClientApi({
    connect,
    disconnect,
    eventListeners,
    getSnapshot: () => snapshot,
    send,
    snapshotListeners
  });
}

function normalizeReconnectOptions(options: HarnessClientOptions["reconnect"]) {
  if (options === false) return undefined;
  const initialDelayMs = positiveDuration(options?.initialDelayMs, 250, "reconnect.initialDelayMs");
  const maxDelayMs = positiveDuration(options?.maxDelayMs, 10_000, "reconnect.maxDelayMs");
  const maxAttempts = positiveInteger(options?.maxAttempts, 8, "reconnect.maxAttempts");
  if (maxDelayMs < initialDelayMs) throw new Error("reconnect.maxDelayMs must be at least reconnect.initialDelayMs");
  return { initialDelayMs, maxDelayMs, maxAttempts };
}

function positiveDuration(value: number | undefined, fallback: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`${name} must be a positive duration`);
  return resolved;
}

function positiveInteger(value: number | undefined, fallback: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) throw new Error(`${name} must be a positive integer`);
  return resolved;
}

function createReadyWaiter(): ReadyWaiter {
  let resolve: ReadyWaiter["resolve"] | undefined;
  let reject: ReadyWaiter["reject"] | undefined;
  const promise = new Promise<HarnessClientReady>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  if (!resolve || !reject) throw new Error("Promise executor did not initialize the ready waiter");
  return { promise, resolve, reject };
}

async function decodeFrame(data: unknown, maximumBytes: number) {
  if (typeof data === "string") {
    assertFrameSize(getUtf8ByteLength(data), maximumBytes);
    return data;
  }
  if (data instanceof ArrayBuffer) {
    assertFrameSize(data.byteLength, maximumBytes);
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    assertFrameSize(data.byteLength, maximumBytes);
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    assertFrameSize(data.size, maximumBytes);
    return data.text();
  }
  throw new Error("Harness event frames must be text or UTF-8 binary data");
}

function assertFrameSize(size: number, maximumBytes: number) {
  if (size > maximumBytes) {
    throw new Error(`Harness event frame exceeds ${maximumBytes} bytes`);
  }
}

function notifyListeners<Value>(listeners: ReadonlySet<(value: Value) => void>, value: Value) {
  for (const listener of listeners) {
    try { listener(value); }
    catch { /* A consumer cannot corrupt transport lifecycle delivery. */ }
  }
}
