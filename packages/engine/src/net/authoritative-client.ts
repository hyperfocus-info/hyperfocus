import { isRecord } from "@hyperfocus/utilities/records";
import { decodeDelta } from "../protocol/delta.ts";
import { decodeSnapshot } from "../protocol/encode.ts";
import { decodeMultipartReplicationEnvelope, decodeReplicationFrame, type ReplicationEnvelopeSegment, type ReplicationFrameMeta } from "../protocol/frames.ts";
import {  type BinaryPayloadCodec, type ProtocolMessage } from "../protocol/messages.ts";
import type { ReplicationSchema } from "../protocol/schema.ts";
import { createSharedStore, isSharedStorePatch, type SharedStoreApi, type SharedStorePatch } from "../sync/shared-store.ts";
import { createAuthoritativeConnection } from "./authoritative-connection.ts";

export type AuthoritativeClientOptions<TState = unknown> = {
  url: string;
  token?: string;
  getToken?: (context: { attempt: number; previousSession?: AuthoritativeSession }) => string | Promise<string>;
  reconnect?: false | {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
  joinTimeoutMs?: number;
  roomId?: string;
  roomType?: string;
  request?: unknown;
  schema?: ReplicationSchema<TState>;
  /** Required only when legacy JSON snapshot or delta protocol messages carry state. */
  parseState?: (value: unknown) => TState;
  multipartCodec?: {
    decodeSnapshot(segments: readonly ReplicationEnvelopeSegment[], previousState?: TState): TState;
    decodeDelta(segments: readonly ReplicationEnvelopeSegment[], previousState?: TState): TState;
  };
  inputCodec?: BinaryPayloadCodec;
  maxReplicationFrameBytes?: number;
  WebSocketImpl?: typeof WebSocket;
  createWebSocket?: (url: string) => AuthoritativeWebSocket;
};

export type AuthoritativeWebSocket = {
  readonly readyState: number;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data?: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code?: number; reason?: string }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
};

export type AuthoritativeSession = {
  playerId: string;
  roomId: string;
};

export type AuthoritativeClientState =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "admitting"; attempt: number }
  | { status: "joined"; session: AuthoritativeSession }
  | { status: "recovering"; attempt: number; reason: string }
  | { status: "closed" }
  | { status: "failed"; reason: string };

export type AuthoritativeSendResult =
  | { status: "sent"; sequence: number }
  | { status: "rejected"; reason: "not-joined" | "transport-error" };

export type AuthoritativeClient<TState = unknown> = {
  connect(): Promise<AuthoritativeSession>;
  close(options?: { mode?: 'leave' | 'suspend' }): void;
  sendInput(input: unknown): AuthoritativeSendResult;
  sendEvent(event: unknown): AuthoritativeSendResult;
  onState(listener: (state: AuthoritativeClientState) => void): () => void;
  onMessage(listener: (message: ProtocolMessage) => void): () => void;
  onSnapshot(listener: (state: TState, meta: ReplicationFrameMeta) => void): () => void;
  onDelta(listener: (state: TState, meta: ReplicationFrameMeta) => void): () => void;
  ack(sequence: number): AuthoritativeSendResult;
  getDebugSnapshot(): {
    connected: boolean;
    state: AuthoritativeClientState;
    playerId?: string;
    roomId?: string;
    sentInputs: number;
    receivedMessages: number;
    receivedSnapshots: number;
    receivedDeltas: number;
    lastSequence?: number;
    lastBaseline?: number;
  };
};

type ReplicationReceiver = {
  receive(data: unknown, expectedSocket: AuthoritativeWebSocket): Promise<boolean>;
  reset(): void;
  snapshot(): { lastSequence?: number; lastBaseline?: number };
};



function isObjectState<TState extends object>(value: unknown): value is TState {
  return isRecord(value);
}

async function bytesFromMessage(data: unknown, maximumBytes: number): Promise<Uint8Array | undefined> {
  if (data instanceof Uint8Array) {
    if (data.byteLength > maximumBytes) throw new Error(`replication frame exceeds ${maximumBytes} bytes`);
    return data;
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > maximumBytes) throw new Error(`replication frame exceeds ${maximumBytes} bytes`);
    return new Uint8Array(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size > maximumBytes) throw new Error(`replication frame exceeds ${maximumBytes} bytes`);
    return new Uint8Array(await data.arrayBuffer());
  }
  return undefined;
}

function isNewerSequence(sequence: number, previous: number) {
  const distance = (sequence - previous) >>> 0;
  return distance > 0 && distance < 0x80000000;
}

function createReplicationReceiver<TState>(options: {
  schema?: ReplicationSchema<TState>;
  multipartCodec?: AuthoritativeClientOptions<TState>["multipartCodec"];
  maxFrameBytes: number;
  isCurrentSocket(socket: AuthoritativeWebSocket): boolean;
  acknowledge(sequence: number): void;
  onError(reason: string): void;
  onSnapshot(state: TState, meta: ReplicationFrameMeta): void;
  onDelta(state: TState, meta: ReplicationFrameMeta): void;
}): ReplicationReceiver {
  let lastSequence: number | undefined;
  let lastBaseline: number | undefined;
  let baselineState: TState | undefined;

  return {
    async receive(data, expectedSocket) {
      if (!options.isCurrentSocket(expectedSocket)) return true;
      try {
        const bytes = await bytesFromMessage(data, options.maxFrameBytes);
        if (!options.isCurrentSocket(expectedSocket)) return true;
        if (!bytes) return false;
        const frame = decodeReplicationFrame(bytes);
        if (
          (frame.kind === "snapshot" || frame.kind === "delta" || frame.kind === "multipart_snapshot" || frame.kind === "multipart_delta") &&
          lastSequence !== undefined &&
          !isNewerSequence(frame.sequence, lastSequence)
        ) {
          options.acknowledge(lastSequence);
          return true;
        }
        if (frame.kind === "snapshot") {
          if (!options.schema) throw new Error("replication schema required for binary state");
          if (frame.baseline !== 0) throw new Error("replication snapshot baseline must be zero");
          baselineState = decodeSnapshot(options.schema, frame.bytes);
          lastSequence = frame.sequence;
          lastBaseline = frame.baseline;
          options.acknowledge(frame.sequence);
          options.onSnapshot(baselineState, frame);
          return true;
        }
        if (frame.kind === "delta") {
          if (!options.schema) throw new Error("replication schema required for binary state");
          if (lastSequence === undefined || baselineState === undefined) throw new Error("replication delta received before a snapshot");
          if (frame.baseline !== lastSequence) {
            throw new Error(`replication delta baseline mismatch: expected ${lastSequence}, received ${frame.baseline}`);
          }
          baselineState = decodeDelta(options.schema, baselineState, frame.bytes);
          lastSequence = frame.sequence;
          lastBaseline = frame.baseline;
          options.acknowledge(frame.sequence);
          options.onDelta(baselineState, frame);
          return true;
        }
        if (frame.kind === "multipart_snapshot") {
          if (!options.multipartCodec) throw new Error("multipart replication codec required for binary state");
          if (frame.baseline !== 0) throw new Error("multipart replication snapshot baseline must be zero");
          const envelope = decodeMultipartReplicationEnvelope(frame.bytes);
          if (envelope.sequence !== frame.sequence || envelope.baseline !== frame.baseline) throw new Error("multipart replication envelope header mismatch");
          baselineState = options.multipartCodec.decodeSnapshot(envelope.segments, baselineState);
          lastSequence = frame.sequence;
          lastBaseline = frame.baseline;
          options.acknowledge(frame.sequence);
          options.onSnapshot(baselineState, frame);
          return true;
        }
        if (frame.kind === "multipart_delta") {
          if (!options.multipartCodec) throw new Error("multipart replication codec required for binary state");
          if (lastSequence === undefined || baselineState === undefined) throw new Error("multipart replication delta received before a snapshot");
          if (frame.baseline !== lastSequence) {
            throw new Error(`multipart replication delta baseline mismatch: expected ${lastSequence}, received ${frame.baseline}`);
          }
          const envelope = decodeMultipartReplicationEnvelope(frame.bytes);
          if (envelope.sequence !== frame.sequence || envelope.baseline !== frame.baseline) throw new Error("multipart replication envelope header mismatch");
          baselineState = options.multipartCodec.decodeDelta(envelope.segments, baselineState);
          lastSequence = frame.sequence;
          lastBaseline = frame.baseline;
          options.acknowledge(frame.sequence);
          options.onDelta(baselineState, frame);
        }
      } catch (error) {
        if (options.isCurrentSocket(expectedSocket)) {
          options.onError(error instanceof Error ? error.message : "replication decode failed");
        }
      }
      return true;
    },
    reset() {
      baselineState = undefined;
      lastSequence = undefined;
      lastBaseline = undefined;
    },
    snapshot() {
      return { lastSequence, lastBaseline };
    }
  };
}

export function connectAuthoritative<TState = unknown>(options: AuthoritativeClientOptions<TState>): AuthoritativeClient<TState> {
  return createAuthoritativeConnection(options, createReplicationReceiver);
}
export type ServerBackedStoreOptions<TState extends object> = {
  initialState: TState;
  client: AuthoritativeClient;
  peerId?: string;
  createCommandId?: () => string;
  isState?: (value: unknown) => value is TState;
  onCommandRejected?: (input: { commandId: string; reason: string }) => void;
};

export function createServerBackedStore<TState extends object>(options: ServerBackedStoreOptions<TState>): SharedStoreApi<TState> {
  const remoteDisposers: Array<() => void> = [];
  const peerId = options.peerId ?? `client-${crypto.randomUUID()}`;
  const createCommandId = options.createCommandId ?? (() => crypto.randomUUID());
  const pending = new Map<string, SharedStorePatch>();
  let authoritativeState = structuredClone(options.initialState);
  let authoritativeRevision = 0;
  let disposed = false;
  const isState = options.isState ?? isObjectState<TState>;
  const disposeRemoteListeners = () => {
    if (disposed) return;
    disposed = true;
    for (const dispose of remoteDisposers.splice(0)) dispose();
  };
  const store = createSharedStore(options.initialState, {
    peerId,
    onPatch: (patch) => {
      const commandId = createCommandId();
      pending.set(commandId, patch);
      const wirePatch = patch.value === undefined
        ? { path: patch.path, timestamp: patch.timestamp, peerId: patch.peerId }
        : patch;
      const result = options.client.sendEvent({ type: "store_command", command: { id: commandId, baseRevision: authoritativeRevision, patch: wirePatch } });
      if (result.status === "rejected") {
        pending.delete(commandId);
        queueMicrotask(() => rebuildProjection());
        options.onCommandRejected?.({ commandId, reason: result.reason });
      }
    },
    onDispose: () => disposeRemoteListeners()
  });

  function rebuildProjection() {
    if (disposed) return;
    const projection = createSharedStore(structuredClone(authoritativeState), { peerId });
    try {
      for (const patch of pending.values()) projection.$applyPatch(patch);
      store.$applySnapshot({ state: projection.$snapshot(), clocks: [] });
    } finally {
      projection.$dispose();
    }
  }

  function applyState(state: unknown, meta: ReplicationFrameMeta) {
    if (!isState(state)) return;
    authoritativeState = structuredClone(state);
    authoritativeRevision = meta.sequence;
    rebuildProjection();
  }

  function applyCommandResult(message: ProtocolMessage) {
    if (message.type !== "event" || !isRecord(message.payload)) return;
    const payload = message.payload;
    if ((payload.type !== "store_command_ack" && payload.type !== "store_command_rejected") || typeof payload.commandId !== "string") return;
    if (!pending.has(payload.commandId)) return;
    const revision = payload.revision;
    if (!isState(payload.state) || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return;
    pending.delete(payload.commandId);
    authoritativeState = structuredClone(payload.state);
    authoritativeRevision = revision;
    rebuildProjection();
    if (payload.type === "store_command_rejected") {
      options.onCommandRejected?.({ commandId: payload.commandId, reason: typeof payload.reason === "string" ? payload.reason : "command rejected" });
    }
  }
  try {
    remoteDisposers.push(options.client.onSnapshot(applyState));
    remoteDisposers.push(options.client.onDelta(applyState));
    remoteDisposers.push(options.client.onMessage(applyCommandResult));
  } catch (error) {
    store.$dispose();
    throw error;
  }
  return store;
}

export type ServerBackedStoreCommand = {
  type: "store_command";
  command: {
    id: string;
    baseRevision: number;
    patch: SharedStorePatch;
  };
};

export type ServerBackedStoreCommandResult<TState extends object> = {
  state: TState;
  revision: number;
  response:
    | { type: "store_command_ack"; commandId: string; state: TState; revision: number }
    | { type: "store_command_rejected"; commandId: string; reason: string; state: TState; revision: number };
};

export function applyServerBackedStoreCommand<TState extends object>(options: {
  state: TState;
  revision: number;
  event: unknown;
  authorize?: (patch: SharedStorePatch, state: Readonly<TState>) => boolean | string;
}): ServerBackedStoreCommandResult<TState> | undefined {
  if (!isRecord(options.event)) return undefined;
  const event = options.event;
  const command = event.command;
  if (event.type !== "store_command" || !isRecord(command)) return undefined;
  if (typeof command.id !== "string" || command.id.length === 0 || command.id.length > 128) return undefined;
  const commandId = command.id;
  if (!Number.isSafeInteger(options.revision) || options.revision < 0 || options.revision >= Number.MAX_SAFE_INTEGER) throw new RangeError("server-backed store revision is invalid or exhausted");
  const reject = (reason: string): ServerBackedStoreCommandResult<TState> => ({
    state: options.state,
    revision: options.revision,
    response: { type: "store_command_rejected", commandId, reason, state: options.state, revision: options.revision }
  });
  if (!Number.isSafeInteger(command.baseRevision) || command.baseRevision !== options.revision) return reject("revision-conflict");
  if (!isSharedStorePatch(command.patch)) return reject("invalid-patch");
  const authorization = options.authorize?.(command.patch, options.state) ?? true;
  if (authorization !== true) return reject(typeof authorization === "string" ? authorization : "unauthorized");
  const next = createSharedStore(structuredClone(options.state), { peerId: "server" });
  try {
    if (!next.$applyPatch(command.patch)) return reject("invalid-clock");
    const state = next.$snapshot();
    const revision = options.revision + 1;
    return {
      state,
      revision,
      response: { type: "store_command_ack", commandId, state, revision }
    };
  } finally {
    next.$dispose();
  }
}

export type ClientPredictionController<TInput, TState> = {
  predict(input: TInput, state?: TState): TState;
  reconcile(serverState: TState, lastProcessedInputSequence: number): TState;
  history(): readonly { sequence: number; input: TInput; state: TState }[];
  state(): TState;
};

export function createClientPrediction<TInput, TState>(options: {
  applyInput: (state: TState, input: TInput) => TState;
  maxHistory?: number;
  initialState: TState;
}): ClientPredictionController<TInput, TState> {
  const maxHistory = options.maxHistory ?? 120;
  if (!Number.isSafeInteger(maxHistory) || maxHistory < 0) throw new RangeError("client prediction maxHistory must be a non-negative safe integer");
  const history: Array<{ sequence: number; input: TInput; state: TState }> = [];
  let sequence = 0;
  let current = options.initialState;

  return {
    predict(input, state = current) {
      if (history.length >= maxHistory) throw new Error(`client prediction history is full at ${maxHistory} unacknowledged inputs`);
      sequence = (sequence + 1) >>> 0;
      current = options.applyInput(state, input);
      history.push({ sequence, input, state: current });
      return current;
    },
    reconcile(serverState, lastProcessedInputSequence) {
      if (!Number.isSafeInteger(lastProcessedInputSequence) || lastProcessedInputSequence < 0 || lastProcessedInputSequence > 0xffffffff) {
        throw new RangeError("lastProcessedInputSequence must fit in u32");
      }
      const pending = history.filter((entry) => {
        const distance = (entry.sequence - lastProcessedInputSequence) >>> 0;
        return distance > 0 && distance < 0x80000000;
      });
      current = serverState;
      history.length = 0;
      for (const entry of pending) {
        current = options.applyInput(current, entry.input);
        history.push({ sequence: entry.sequence, input: entry.input, state: current });
      }
      return current;
    },
    history() {
      return history.slice();
    },
    state() {
      return current;
    }
  };
}
