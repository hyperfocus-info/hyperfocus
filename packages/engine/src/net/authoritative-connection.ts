import type { ReplicationEnvelopeSegment, ReplicationFrameMeta } from "../protocol/frames.ts";
import {
  createProtocolMessage,
  encodeBinaryInputMessage,
  encodeProtocolMessage,
  parseProtocolMessage,
  type ProtocolMessage
} from "../protocol/messages.ts";
import type { ReplicationSchema } from "../protocol/schema.ts";
import type {
  AuthoritativeClient,
  AuthoritativeClientOptions,
  AuthoritativeClientState,
  AuthoritativeSendResult,
  AuthoritativeSession,
  AuthoritativeWebSocket
} from "./authoritative-client.ts";

type ReplicationReceiverPort = {
  receive(data: unknown, expectedSocket: AuthoritativeWebSocket): Promise<boolean>;
  reset(): void;
  snapshot(): { lastSequence?: number; lastBaseline?: number };
};

type ReplicationReceiverFactory<TState> = (options: {
  schema?: ReplicationSchema<TState>;
  multipartCodec?: {
    decodeSnapshot(segments: readonly ReplicationEnvelopeSegment[], previousState?: TState): TState;
    decodeDelta(segments: readonly ReplicationEnvelopeSegment[], previousState?: TState): TState;
  };
  maxFrameBytes: number;
  isCurrentSocket(socket: AuthoritativeWebSocket): boolean;
  acknowledge(sequence: number): void;
  onError(reason: string): void;
  onSnapshot(state: TState, meta: ReplicationFrameMeta): void;
  onDelta(state: TState, meta: ReplicationFrameMeta): void;
}) => ReplicationReceiverPort;

type PendingAdmission = {
  resolve(session: AuthoritativeSession): void;
  reject(error: Error): void;
  socket: AuthoritativeWebSocket;
  timer: ReturnType<typeof setTimeout>;
};

type ReconnectPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
};

type ConnectionState<TState> = {
  options: AuthoritativeClientOptions<TState>;
  createSocket(url: string): AuthoritativeWebSocket;
  openReadyState: number;
  joinTimeoutMs: number;
  reconnect?: ReconnectPolicy;
  listeners: Set<(message: ProtocolMessage) => void>;
  snapshotListeners: Set<(state: TState, meta: ReplicationFrameMeta) => void>;
  deltaListeners: Set<(state: TState, meta: ReplicationFrameMeta) => void>;
  stateListeners: Set<(state: AuthoritativeClientState) => void>;
  socket?: AuthoritativeWebSocket;
  playerId?: string;
  roomId?: string;
  state: AuthoritativeClientState;
  session?: AuthoritativeSession;
  previousSession?: AuthoritativeSession;
  sequence: number;
  sentInputs: number;
  receivedMessages: number;
  receivedSnapshots: number;
  receivedDeltas: number;
  connectPromise?: Promise<AuthoritativeSession>;
  pendingAdmission?: PendingAdmission;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectAttempts: number;
  manuallyClosed: boolean;
};

type ConnectionRuntime<TState> = ConnectionState<TState> & {
  replicationReceiver: ReplicationReceiverPort;
};

export function createAuthoritativeConnection<TState>(
  options: AuthoritativeClientOptions<TState>,
  createReplicationReceiver: ReplicationReceiverFactory<TState>
): AuthoritativeClient<TState> {
  const state = createConnectionState(options);
  const replicationReceiver = createReplicationReceiver({
    schema: options.schema,
    multipartCodec: options.multipartCodec,
    maxFrameBytes: readPositiveSafeInteger(
      options.maxReplicationFrameBytes,
      16 * 1024 * 1024,
      "authoritative maxReplicationFrameBytes"
    ),
    isCurrentSocket: (candidate) => state.socket === candidate,
    acknowledge: (sequence) => {
      acknowledgeReplication(state, sequence);
    },
    onError: (reason) => emitProtocolError(state, reason),
    onSnapshot: (next, meta) => emitReplication(state, "snapshot", next, meta),
    onDelta: (next, meta) => emitReplication(state, "delta", next, meta)
  });
  const runtime = Object.assign(state, { replicationReceiver });
  return createAuthoritativeClientApi(runtime);
}

function createConnectionState<TState>(options: AuthoritativeClientOptions<TState>): ConnectionState<TState> {
  if (!options.token && !options.getToken) {
    throw new Error("authoritative client requires token or getToken");
  }
  const WebSocketCtor = options.WebSocketImpl ?? globalThis.WebSocket;
  if (!options.createWebSocket && !WebSocketCtor) {
    throw new Error("WebSocket is not available in this environment");
  }
  const createSocket = options.createWebSocket ?? ((url: string) => new WebSocketCtor(url));
  const reconnect = readReconnectPolicy(options);
  return {
    options,
    createSocket,
    openReadyState: WebSocketCtor?.OPEN ?? 1,
    joinTimeoutMs: readPositiveSafeInteger(options.joinTimeoutMs, 10_000, "authoritative client joinTimeoutMs"),
    reconnect,
    listeners: new Set(),
    snapshotListeners: new Set(),
    deltaListeners: new Set(),
    stateListeners: new Set(),
    roomId: options.roomId,
    state: { status: "idle" },
    sequence: 0,
    sentInputs: 0,
    receivedMessages: 0,
    receivedSnapshots: 0,
    receivedDeltas: 0,
    reconnectAttempts: 0,
    manuallyClosed: false
  };
}

function readPositiveSafeInteger(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return resolved;
}

function readReconnectPolicy<TState>(options: AuthoritativeClientOptions<TState>): ReconnectPolicy | undefined {
  const reconnect = options.reconnect === false ? undefined : options.reconnect ?? (options.getToken ? {} : undefined);
  if (!reconnect) {
    return undefined;
  }
  const maxAttempts = reconnect.maxAttempts ?? 5;
  const initialDelayMs = reconnect.initialDelayMs ?? 250;
  const maxDelayMs = reconnect.maxDelayMs ?? 5_000;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0) {
    throw new RangeError("authoritative reconnect maxAttempts must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0) {
    throw new RangeError("authoritative reconnect initialDelayMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < initialDelayMs) {
    throw new RangeError("authoritative reconnect maxDelayMs must be at least initialDelayMs");
  }
  return { maxAttempts, initialDelayMs, maxDelayMs };
}

function publishState<TState>(runtime: ConnectionState<TState>, next: AuthoritativeClientState) {
  runtime.state = next;
  for (const listener of runtime.stateListeners) {
    try {
      listener(next);
    } catch {
      // Lifecycle observers are isolated from transport progression.
    }
  }
}

function rejectAdmission<TState>(runtime: ConnectionState<TState>, error: Error) {
  const pending = runtime.pendingAdmission;
  if (!pending) {
    return;
  }
  runtime.pendingAdmission = undefined;
  clearTimeout(pending.timer);
  pending.reject(error);
}

function acceptAdmission<TState>(runtime: ConnectionState<TState>, session: AuthoritativeSession) {
  const pending = runtime.pendingAdmission;
  if (!pending) {
    return;
  }
  runtime.pendingAdmission = undefined;
  clearTimeout(pending.timer);
  runtime.session = session;
  runtime.previousSession = session;
  runtime.playerId = session.playerId;
  runtime.roomId = session.roomId;
  runtime.reconnectAttempts = 0;
  publishState(runtime, { status: "joined", session });
  pending.resolve(session);
}

function emitMessage<TState>(runtime: ConnectionState<TState>, message: ProtocolMessage) {
  runtime.receivedMessages += 1;
  handleAdmissionMessage(runtime, message);
  const parseState = runtime.options.parseState;
  if (message.type === "snapshot") {
    if (!parseState) {
      emitProtocolError(runtime, "legacy JSON snapshot state requires AuthoritativeClientOptions.parseState");
    } else {
      const meta: ReplicationFrameMeta = { kind: "snapshot", sequence: message.seq ?? 0, baseline: 0 };
      emitReplication(runtime, "snapshot", parseState(message.payload), meta);
    }
  } else if (message.type === "delta") {
    if (!parseState) {
      emitProtocolError(runtime, "legacy JSON delta state requires AuthoritativeClientOptions.parseState");
    } else {
      const meta: ReplicationFrameMeta = { kind: "delta", sequence: message.seq ?? 0, baseline: 0 };
      emitReplication(runtime, "delta", parseState(message.payload), meta);
    }
  }
  for (const listener of runtime.listeners) {
    try {
      listener(message);
    } catch {
      // Match EventTarget-style isolation between independent listeners.
    }
  }
}

function handleAdmissionMessage<TState>(runtime: ConnectionState<TState>, message: ProtocolMessage) {
  const payload = isRecord(message.payload) ? message.payload : {};
  if (message.type === "join_accepted") {
    if (
      typeof payload.playerId !== "string" ||
      payload.playerId.length === 0 ||
      typeof payload.roomId !== "string" ||
      payload.roomId.length === 0
    ) {
      failAdmission(runtime, "authoritative join acceptance is missing playerId or roomId", 4002);
      return;
    }
    acceptAdmission(runtime, { playerId: payload.playerId, roomId: payload.roomId });
  } else if (message.type === "join_rejected" && runtime.pendingAdmission) {
    const reason = typeof payload.reason === "string" && payload.reason ? payload.reason : "join rejected";
    failAdmission(runtime, reason, 4003);
  } else if (message.type === "error" && runtime.pendingAdmission) {
    const reason = typeof payload.reason === "string" && payload.reason ? payload.reason : "authoritative admission failed";
    failAdmission(runtime, reason, 4002);
  }
}

function failAdmission<TState>(runtime: ConnectionState<TState>, reason: string, closeCode: number) {
  rejectAdmission(runtime, new Error(reason));
  publishState(runtime, { status: "failed", reason });
  runtime.socket?.close(closeCode, reason);
}

function emitReplication<TState>(
  runtime: ConnectionState<TState>,
  kind: "snapshot" | "delta",
  state: TState,
  meta: ReplicationFrameMeta
) {
  if (kind === "snapshot") {
    runtime.receivedSnapshots += 1;
  } else {
    runtime.receivedDeltas += 1;
  }
  const listeners = kind === "snapshot" ? runtime.snapshotListeners : runtime.deltaListeners;
  for (const listener of listeners) {
    try {
      listener(state, meta);
    } catch {
      // User callbacks cannot interrupt protocol state progression.
    }
  }
}

function sendControl<TState>(runtime: ConnectionState<TState>, message: ProtocolMessage) {
  if (!runtime.socket || runtime.socket.readyState !== runtime.openReadyState) {
    return false;
  }
  runtime.socket.send(encodeProtocolMessage(message));
  return true;
}

function emitProtocolError<TState>(runtime: ConnectionState<TState>, reason: string) {
  emitMessage(runtime, createProtocolMessage("error", { reason }));
}

function scheduleReconnect<TState>(runtime: ConnectionRuntime<TState>, reason: string) {
  const reconnect = runtime.reconnect;
  if (!reconnect || runtime.manuallyClosed || runtime.reconnectTimer) {
    return;
  }
  if (runtime.reconnectAttempts >= reconnect.maxAttempts) {
    publishState(runtime, { status: "failed", reason: `reconnect exhausted: ${reason}` });
    return;
  }
  const attempt = runtime.reconnectAttempts + 1;
  const delay = Math.min(
    reconnect.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    reconnect.maxDelayMs
  );
  publishState(runtime, { status: "recovering", attempt, reason });
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = undefined;
    runtime.reconnectAttempts = attempt;
    void beginConnection(runtime, true).catch((error) => {
      scheduleReconnect(runtime, error instanceof Error ? error.message : "reconnect failed");
    });
  }, delay);
}

function beginConnection<TState>(runtime: ConnectionRuntime<TState>, recovering: boolean): Promise<AuthoritativeSession> {
  if (runtime.connectPromise) {
    return runtime.connectPromise;
  }
  const attempt = recovering ? runtime.reconnectAttempts : 0;
  publishState(
    runtime,
    recovering ? { status: "recovering", attempt, reason: "opening connection" } : { status: "connecting", attempt }
  );
  const operation = openConnection(runtime, attempt);
  runtime.connectPromise = operation;
  const clear = () => {
    if (runtime.connectPromise === operation) {
      runtime.connectPromise = undefined;
    }
  };
  void operation.then(clear, clear);
  return operation;
}

async function openConnection<TState>(runtime: ConnectionRuntime<TState>, attempt: number): Promise<AuthoritativeSession> {
  const token = runtime.options.getToken
    ? await runtime.options.getToken({ attempt, previousSession: runtime.previousSession })
    : runtime.options.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("authoritative token provider returned an empty token");
  }
  if (runtime.manuallyClosed) {
    throw new Error("authoritative client closed before connecting");
  }
  runtime.socket?.close();
  resetSession(runtime);
  let currentSocket: AuthoritativeWebSocket;
  try {
    currentSocket = runtime.createSocket(runtime.options.url);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`could not connect to authoritative server: ${runtime.options.url}`);
  }
  runtime.socket = currentSocket;
  return await new Promise<AuthoritativeSession>((resolve, reject) => {
    registerSocketListeners(runtime, currentSocket, token, attempt, resolve, reject);
  });
}

function registerSocketListeners<TState>(
  runtime: ConnectionRuntime<TState>,
  currentSocket: AuthoritativeWebSocket,
  token: string,
  attempt: number,
  resolve: (session: AuthoritativeSession) => void,
  reject: (error: Error) => void
) {
  let receiveQueue = Promise.resolve();
  const timer = setTimeout(() => handleJoinTimeout(runtime, currentSocket), runtime.joinTimeoutMs);
  runtime.pendingAdmission = { resolve, reject, socket: currentSocket, timer };
  currentSocket.addEventListener("open", () => handleSocketOpen(runtime, currentSocket, token, attempt));
  currentSocket.addEventListener("message", (event) => {
    receiveQueue = receiveQueue
      .then(() => receiveSocketMessage(runtime, currentSocket, event.data))
      .catch((error) => {
        if (runtime.socket === currentSocket) {
          emitProtocolError(runtime, error instanceof Error ? error.message : "protocol message failed");
        }
      });
    return receiveQueue;
  });
  currentSocket.addEventListener("close", (event) => handleSocketClose(runtime, currentSocket, event));
  currentSocket.addEventListener("error", () => handleSocketError(runtime, currentSocket));
}

function handleJoinTimeout<TState>(runtime: ConnectionRuntime<TState>, currentSocket: AuthoritativeWebSocket) {
  if (runtime.socket !== currentSocket) {
    return;
  }
  const error = new Error(`timed out joining authoritative server after ${runtime.joinTimeoutMs}ms`);
  rejectAdmission(runtime, error);
  publishState(runtime, { status: "failed", reason: error.message });
  currentSocket.close(4000, "join timeout");
}

function handleSocketOpen<TState>(
  runtime: ConnectionRuntime<TState>,
  currentSocket: AuthoritativeWebSocket,
  token: string,
  attempt: number
) {
  if (runtime.socket !== currentSocket || runtime.pendingAdmission?.socket !== currentSocket) {
    return;
  }
  publishState(runtime, { status: "admitting", attempt });
  try {
    sendControl(runtime, createProtocolMessage("client_hello", {}));
    const joinPayload: Record<string, unknown> = { token };
    if (runtime.options.roomId !== undefined) joinPayload.roomId = runtime.options.roomId;
    if (runtime.options.roomType !== undefined) joinPayload.roomType = runtime.options.roomType;
    if (runtime.options.request !== undefined) joinPayload.request = runtime.options.request;
    if (!sendControl(runtime, createProtocolMessage("join_room", joinPayload))) {
      throw new Error("authoritative socket closed before admission request");
    }
  } catch (error) {
    const protocolError = error instanceof Error ? error : new Error("could not serialize authoritative join request");
    rejectAdmission(runtime, protocolError);
    publishState(runtime, { status: "failed", reason: protocolError.message });
    currentSocket.close(4002, "join serialization failed");
  }
}

async function receiveSocketMessage<TState>(
  runtime: ConnectionRuntime<TState>,
  currentSocket: AuthoritativeWebSocket,
  data: unknown
) {
  if (runtime.socket !== currentSocket) {
    return;
  }
  if (typeof data === "string") {
    emitMessage(runtime, parseProtocolMessage(data));
    return;
  }
  await runtime.replicationReceiver.receive(data, currentSocket);
}

function handleSocketClose<TState>(
  runtime: ConnectionRuntime<TState>,
  currentSocket: AuthoritativeWebSocket,
  event: { code?: number; reason?: string }
) {
  if (runtime.socket !== currentSocket) {
    return;
  }
  const wasJoined = runtime.state.status === "joined";
  runtime.socket = undefined;
  resetSession(runtime);
  const suffix = event.reason ? `: ${event.reason}` : "";
  const reason = `socket closed ${event.code}${suffix}`;
  rejectAdmission(runtime, new Error(reason));
  if (runtime.manuallyClosed) {
    publishState(runtime, { status: "closed" });
  } else if (wasJoined) {
    emitProtocolError(runtime, reason);
    scheduleReconnect(runtime, reason);
  } else if (runtime.state.status !== "failed") {
    publishState(runtime, { status: "failed", reason });
  }
}

function handleSocketError<TState>(runtime: ConnectionRuntime<TState>, currentSocket: AuthoritativeWebSocket) {
  if (runtime.socket !== currentSocket) {
    return;
  }
  const error = new Error(`could not connect to authoritative server: ${runtime.options.url}`);
  rejectAdmission(runtime, error);
  publishState(runtime, { status: "failed", reason: error.message });
  currentSocket.close();
}

function resetSession<TState>(runtime: ConnectionRuntime<TState>) {
  runtime.session = undefined;
  runtime.playerId = undefined;
  runtime.roomId = runtime.options.roomId;
  runtime.sequence = 0;
  runtime.replicationReceiver.reset();
}

function createAuthoritativeClientApi<TState>(runtime: ConnectionRuntime<TState>): AuthoritativeClient<TState> {
  return {
    connect: () => connectClient(runtime),
    close: () => closeClient(runtime),
    sendInput: (input) => sendInput(runtime, input),
    sendEvent: (event) => sendEvent(runtime, event),
    onState: (listener) => subscribeState(runtime, listener),
    onMessage: (listener) => subscribe(runtime.listeners, listener),
    onSnapshot: (listener) => subscribeReplication(runtime.snapshotListeners, listener),
    onDelta: (listener) => subscribeReplication(runtime.deltaListeners, listener),
    ack: (sequence) => acknowledgeReplication(runtime, sequence),
    getDebugSnapshot: () => ({
      connected: runtime.state.status === "joined",
      state: runtime.state,
      playerId: runtime.playerId,
      roomId: runtime.roomId,
      sentInputs: runtime.sentInputs,
      receivedMessages: runtime.receivedMessages,
      receivedSnapshots: runtime.receivedSnapshots,
      receivedDeltas: runtime.receivedDeltas,
      ...runtime.replicationReceiver.snapshot()
    })
  };
}

function connectClient<TState>(runtime: ConnectionRuntime<TState>) {
  if (
    runtime.state.status === "joined" &&
    runtime.session &&
    runtime.socket?.readyState === runtime.openReadyState
  ) {
    return Promise.resolve(runtime.session);
  }
  runtime.manuallyClosed = false;
  runtime.reconnectAttempts = 0;
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = undefined;
  }
  return beginConnection(runtime, false);
}

function closeClient<TState>(runtime: ConnectionRuntime<TState>) {
  runtime.manuallyClosed = true;
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
  }
  runtime.reconnectTimer = undefined;
  const currentSocket = runtime.socket;
  runtime.socket = undefined;
  rejectAdmission(runtime, new Error("authoritative client closed before admission"));
  runtime.connectPromise = undefined;
  currentSocket?.close(1000, "client closed");
  resetSession(runtime);
  publishState(runtime, { status: "closed" });
}

function sendInput<TState>(runtime: ConnectionRuntime<TState>, input: unknown): AuthoritativeSendResult {
  if (!isJoined(runtime)) {
    return { status: "rejected", reason: "not-joined" };
  }
  const nextSequence = (runtime.sequence + 1) >>> 0;
  try {
    if (runtime.options.inputCodec) {
      runtime.socket.send(encodeBinaryInputMessage(input, runtime.options.inputCodec, { seq: nextSequence }));
    } else {
      runtime.socket.send(
        encodeProtocolMessage(
          createProtocolMessage("input", input, {
            seq: nextSequence,
            playerId: runtime.playerId,
            roomId: runtime.roomId
          })
        )
      );
    }
    runtime.sequence = nextSequence;
    runtime.sentInputs += 1;
    return { status: "sent", sequence: nextSequence };
  } catch {
    return { status: "rejected", reason: "transport-error" };
  }
}

function sendEvent<TState>(runtime: ConnectionRuntime<TState>, event: unknown) {
  const nextSequence = (runtime.sequence + 1) >>> 0;
  return sendSequenced(
    runtime,
    createProtocolMessage("event", event, {
      seq: nextSequence,
      playerId: runtime.playerId,
      roomId: runtime.roomId
    }),
    nextSequence
  );
}

function sendSequenced<TState>(
  runtime: ConnectionRuntime<TState>,
  message: ProtocolMessage,
  nextSequence: number
): AuthoritativeSendResult {
  if (!isJoined(runtime)) {
    return { status: "rejected", reason: "not-joined" };
  }
  try {
    runtime.socket.send(encodeProtocolMessage(message));
    runtime.sequence = nextSequence;
    return { status: "sent", sequence: nextSequence };
  } catch {
    return { status: "rejected", reason: "transport-error" };
  }
}

function acknowledgeReplication<TState>(runtime: ConnectionState<TState>, sequence: number): AuthoritativeSendResult {
  if (runtime.state.status !== "joined") {
    return { status: "rejected", reason: "not-joined" };
  }
  try {
    const sent = sendControl(
      runtime,
      createProtocolMessage("event", { type: "replication_ack", sequence }, {
        playerId: runtime.playerId,
        roomId: runtime.roomId
      })
    );
    return sent ? { status: "sent", sequence } : { status: "rejected", reason: "not-joined" };
  } catch {
    return { status: "rejected", reason: "transport-error" };
  }
}

function subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribeReplication<TState>(
  listeners: Set<(state: TState, meta: ReplicationFrameMeta) => void>,
  listener: (state: TState, meta: ReplicationFrameMeta) => void
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribeState<TState>(runtime: ConnectionState<TState>, listener: (state: AuthoritativeClientState) => void) {
  runtime.stateListeners.add(listener);
  listener(runtime.state);
  return () => runtime.stateListeners.delete(listener);
}

function isJoined<TState>(
  runtime: ConnectionRuntime<TState>
): runtime is ConnectionRuntime<TState> & { socket: AuthoritativeWebSocket; state: { status: "joined" } } {
  const socket = runtime.socket;
  return runtime.state.status === "joined" && socket !== undefined && socket.readyState === runtime.openReadyState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
