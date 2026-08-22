import { decodeDelta } from "../protocol/delta.ts";
import { decodeSnapshot } from "../protocol/encode.ts";
import { decodeMultipartReplicationEnvelope, decodeReplicationFrame, type ReplicationEnvelopeSegment, type ReplicationFrameMeta } from "../protocol/frames.ts";
import { createProtocolMessage, encodeBinaryInputMessage, encodeProtocolMessage, parseProtocolMessage, type BinaryPayloadCodec, type ProtocolMessage } from "../protocol/messages.ts";
import type { ReplicationSchema } from "../protocol/schema.ts";
import { createSharedStore, type SharedStoreApi } from "../sync/shared-store.ts";

export type AuthoritativeClientOptions = {
  url: string;
  token: string;
  roomId?: string;
  roomType?: string;
  request?: unknown;
  schema?: ReplicationSchema;
  multipartCodec?: {
    decodeSnapshot(segments: readonly ReplicationEnvelopeSegment[], previousState?: unknown): unknown;
    decodeDelta(segments: readonly ReplicationEnvelopeSegment[], previousState?: unknown): unknown;
  };
  inputCodec?: BinaryPayloadCodec;
  WebSocketImpl?: typeof WebSocket;
};

export type AuthoritativeClient = {
  connect(): Promise<void>;
  close(): void;
  sendInput(input: unknown): void;
  sendEvent(event: unknown): void;
  onMessage(listener: (message: ProtocolMessage) => void): () => void;
  onSnapshot(listener: (state: unknown, meta: ReplicationFrameMeta) => void): () => void;
  onDelta(listener: (state: unknown, meta: ReplicationFrameMeta) => void): () => void;
  ack(sequence: number): void;
  getDebugSnapshot(): {
    connected: boolean;
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

export function connectAuthoritative(options: AuthoritativeClientOptions): AuthoritativeClient {
  const WebSocketCtor = options.WebSocketImpl ?? WebSocket;
  const listeners = new Set<(message: ProtocolMessage) => void>();
  const snapshotListeners = new Set<(state: unknown, meta: ReplicationFrameMeta) => void>();
  const deltaListeners = new Set<(state: unknown, meta: ReplicationFrameMeta) => void>();
  let socket: WebSocket | undefined;
  let playerId: string | undefined;
  let roomId = options.roomId;
  let connected = false;
  let seq = 0;
  let sentInputs = 0;
  let receivedMessages = 0;
  let receivedSnapshots = 0;
  let receivedDeltas = 0;
  let lastSequence: number | undefined;
  let lastBaseline: number | undefined;
  let baselineState: unknown;
  let connectPromise: Promise<void> | undefined;
  let rejectPendingConnect: ((error: Error) => void) | undefined;

  function isNewerSequence(sequence: number, previous: number) {
    const distance = (sequence - previous) >>> 0;
    return distance > 0 && distance < 0x80000000;
  }

  function emit(message: ProtocolMessage) {
    receivedMessages += 1;
    if (message.type === "join_accepted") {
      const payload = (message.payload ?? {}) as { playerId?: string; roomId?: string };
      playerId = payload.playerId;
      roomId = payload.roomId ?? roomId;
    }
    if (message.type === "snapshot") {
      receivedSnapshots += 1;
      const meta = { kind: "snapshot", sequence: message.seq ?? 0, baseline: 0 } as const;
      for (const listener of snapshotListeners) {
        try {
          listener(message.payload, meta);
        } catch {
          // User callbacks cannot interrupt protocol state progression.
        }
      }
    } else if (message.type === "delta") {
      receivedDeltas += 1;
      const meta = { kind: "delta", sequence: message.seq ?? 0, baseline: 0 } as const;
      for (const listener of deltaListeners) {
        try {
          listener(message.payload, meta);
        } catch {
          // User callbacks cannot interrupt protocol state progression.
        }
      }
    }
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // Match EventTarget-style isolation between independent listeners.
      }
    }
  }

  function sendControl(message: ProtocolMessage) {
    if (!socket || socket.readyState !== WebSocketCtor.OPEN) return;
    socket.send(encodeProtocolMessage(message));
  }

  function emitProtocolError(reason: string) {
    emit(createProtocolMessage("error", { reason }));
  }

  async function bytesFromMessage(data: unknown): Promise<Uint8Array | undefined> {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    return undefined;
  }

  async function receiveBinary(data: unknown, expectedSocket: WebSocket) {
    const bytes = await bytesFromMessage(data);
    if (socket !== expectedSocket) return true;
    if (!bytes) return false;
    let frame;
    try {
      frame = decodeReplicationFrame(bytes);
      if (!options.schema && (frame.kind === "snapshot" || frame.kind === "delta")) {
        emitProtocolError("replication schema required for binary state");
        return true;
      }
      if ((frame.kind === "multipart_snapshot" || frame.kind === "multipart_delta") && !options.multipartCodec) {
        emitProtocolError("multipart replication codec required for binary state");
        return true;
      }
      if (
        (frame.kind === "snapshot" || frame.kind === "delta" || frame.kind === "multipart_snapshot" || frame.kind === "multipart_delta") &&
        lastSequence !== undefined &&
        !isNewerSequence(frame.sequence, lastSequence)
      ) {
        api.ack(lastSequence);
        return true;
      }
      if (frame.kind === "snapshot") {
        if (frame.baseline !== 0) throw new Error("replication snapshot baseline must be zero");
        baselineState = decodeSnapshot(options.schema!, frame.bytes);
        receivedSnapshots += 1;
        lastSequence = frame.sequence;
        lastBaseline = frame.baseline;
        api.ack(frame.sequence);
        for (const listener of snapshotListeners) {
          try {
            listener(baselineState, frame);
          } catch {
            // User callbacks cannot prevent replication acknowledgement.
          }
        }
        return true;
      }
      if (frame.kind === "delta") {
        if (lastSequence === undefined || baselineState === undefined) throw new Error("replication delta received before a snapshot");
        if (frame.baseline !== lastSequence) {
          throw new Error(`replication delta baseline mismatch: expected ${lastSequence}, received ${frame.baseline}`);
        }
        baselineState = decodeDelta(options.schema!, baselineState, frame.bytes);
        receivedDeltas += 1;
        lastSequence = frame.sequence;
        lastBaseline = frame.baseline;
        api.ack(frame.sequence);
        for (const listener of deltaListeners) {
          try {
            listener(baselineState, frame);
          } catch {
            // User callbacks cannot prevent replication acknowledgement.
          }
        }
        return true;
      }
      if (frame.kind === "multipart_snapshot") {
        if (frame.baseline !== 0) throw new Error("multipart replication snapshot baseline must be zero");
        const envelope = decodeMultipartReplicationEnvelope(frame.bytes);
        if (envelope.sequence !== frame.sequence || envelope.baseline !== frame.baseline) throw new Error("multipart replication envelope header mismatch");
        baselineState = options.multipartCodec!.decodeSnapshot(envelope.segments, baselineState);
        receivedSnapshots += 1;
        lastSequence = frame.sequence;
        lastBaseline = frame.baseline;
        api.ack(frame.sequence);
        for (const listener of snapshotListeners) {
          try {
            listener(baselineState, frame);
          } catch {
            // User callbacks cannot prevent replication acknowledgement.
          }
        }
        return true;
      }
      if (frame.kind === "multipart_delta") {
        if (lastSequence === undefined || baselineState === undefined) throw new Error("multipart replication delta received before a snapshot");
        if (frame.baseline !== lastSequence) {
          throw new Error(`multipart replication delta baseline mismatch: expected ${lastSequence}, received ${frame.baseline}`);
        }
        const envelope = decodeMultipartReplicationEnvelope(frame.bytes);
        if (envelope.sequence !== frame.sequence || envelope.baseline !== frame.baseline) throw new Error("multipart replication envelope header mismatch");
        baselineState = options.multipartCodec!.decodeDelta(envelope.segments, baselineState);
        receivedDeltas += 1;
        lastSequence = frame.sequence;
        lastBaseline = frame.baseline;
        api.ack(frame.sequence);
        for (const listener of deltaListeners) {
          try {
            listener(baselineState, frame);
          } catch {
            // User callbacks cannot prevent replication acknowledgement.
          }
        }
        return true;
      }
    } catch (error) {
      emitProtocolError(error instanceof Error ? error.message : "replication decode failed");
      return true;
    }
    return true;
  }

  const api: AuthoritativeClient = {
    connect() {
      if (connected && socket?.readyState === WebSocketCtor.OPEN) return Promise.resolve();
      if (connectPromise) return connectPromise;
      if (socket) {
        socket.close();
        socket = undefined;
      }
      connected = false;
      playerId = undefined;
      roomId = options.roomId;
      seq = 0;
      baselineState = undefined;
      lastSequence = undefined;
      lastBaseline = undefined;
      let currentSocket: WebSocket;
      try {
        currentSocket = new WebSocketCtor(options.url);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(`could not connect to authoritative server: ${options.url}`));
      }
      socket = currentSocket;
      connectPromise = new Promise((resolve, reject) => {
        let opened = false;
        let settled = false;
        let receiveQueue = Promise.resolve();
        rejectPendingConnect = (error) => {
          if (settled) return;
          settled = true;
          connectPromise = undefined;
          rejectPendingConnect = undefined;
          reject(error);
        };
        currentSocket.addEventListener("open", () => {
          if (socket !== currentSocket || settled) return;
          try {
            connected = true;
            sendControl(createProtocolMessage("client_hello", {}));
            const joinPayload: Record<string, unknown> = { token: options.token };
            if (options.roomId !== undefined) joinPayload.roomId = options.roomId;
            if (options.roomType !== undefined) joinPayload.roomType = options.roomType;
            if (options.request !== undefined) joinPayload.request = options.request;
            sendControl(createProtocolMessage("join_room", joinPayload));
          } catch (error) {
            connected = false;
            const protocolError = error instanceof Error ? error : new Error("could not serialize authoritative join request");
            rejectPendingConnect?.(protocolError);
            currentSocket.close();
            return;
          }
          opened = true;
          settled = true;
          connectPromise = undefined;
          rejectPendingConnect = undefined;
          resolve();
        });
        currentSocket.addEventListener("message", (event) => {
          receiveQueue = receiveQueue
            .then(async () => {
              if (socket !== currentSocket) return;
              if (typeof event.data === "string") emit(parseProtocolMessage(event.data));
              else await receiveBinary(event.data, currentSocket);
            })
            .catch((error) => {
              if (socket === currentSocket) emitProtocolError(error instanceof Error ? error.message : "protocol message failed");
            });
          return receiveQueue;
        });
        currentSocket.addEventListener("close", (event) => {
          if (socket !== currentSocket) return;
          const wasConnected = connected;
          connected = false;
          socket = undefined;
          if (!opened) {
            rejectPendingConnect?.(new Error(`could not connect to authoritative server: ${options.url}`));
          }
          if (wasConnected && (!event.wasClean || event.code >= 1002)) {
            const suffix = event.reason ? `: ${event.reason}` : "";
            emitProtocolError(`socket closed ${event.code}${suffix}`);
          }
        });
        currentSocket.addEventListener("error", () => {
          if (socket !== currentSocket) return;
          const error = new Error(`could not connect to authoritative server: ${options.url}`);
          emitProtocolError(error.message);
          if (!opened) {
            rejectPendingConnect?.(error);
            currentSocket.close();
          }
        });
      });
      return connectPromise;
    },
    close() {
      const currentSocket = socket;
      socket = undefined;
      connected = false;
      rejectPendingConnect?.(new Error("authoritative client closed before connecting"));
      rejectPendingConnect = undefined;
      connectPromise = undefined;
      currentSocket?.close();
      baselineState = undefined;
      lastSequence = undefined;
      lastBaseline = undefined;
      playerId = undefined;
      roomId = options.roomId;
    },
    sendInput(input) {
      seq = (seq + 1) >>> 0;
      sentInputs += 1;
      if (options.inputCodec && socket?.readyState === WebSocketCtor.OPEN) {
        socket.send(encodeBinaryInputMessage(input, options.inputCodec, { seq }) as unknown as BufferSource);
      } else {
        sendControl(createProtocolMessage("input", input, { seq, playerId, roomId }));
      }
    },
    sendEvent(event) {
      seq = (seq + 1) >>> 0;
      sendControl(createProtocolMessage("event", event, { seq, playerId, roomId }));
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    onDelta(listener) {
      deltaListeners.add(listener);
      return () => deltaListeners.delete(listener);
    },
    ack(sequence) {
      sendControl(createProtocolMessage("event", { type: "replication_ack", sequence }, { playerId, roomId }));
    },
    getDebugSnapshot() {
      return { connected, playerId, roomId, sentInputs, receivedMessages, receivedSnapshots, receivedDeltas, lastSequence, lastBaseline };
    }
  };

  return api;
}

export type ServerBackedStoreOptions<TState extends object> = {
  initialState: TState;
  client: AuthoritativeClient;
};

export function createServerBackedStore<TState extends object>(options: ServerBackedStoreOptions<TState>): SharedStoreApi<TState> {
  const remoteDisposers: Array<() => void> = [];
  let disposed = false;
  const disposeRemoteListeners = () => {
    if (disposed) return;
    disposed = true;
    for (const dispose of remoteDisposers.splice(0)) dispose();
  };
  const store = createSharedStore(options.initialState, {
    peerId: "client",
    onPatch: (patch) => {
      const wirePatch = patch.value === undefined
        ? { path: patch.path, timestamp: patch.timestamp, peerId: patch.peerId }
        : patch;
      options.client.sendEvent({ type: "store_patch", patch: wirePatch });
    },
    onDispose: () => disposeRemoteListeners()
  });
  function applyState(state: unknown) {
    if (typeof state !== "object" || state === null) return;
    store.$applySnapshot({ state: state as TState, clocks: [] });
  }
  try {
    remoteDisposers.push(options.client.onSnapshot(applyState));
    remoteDisposers.push(options.client.onDelta(applyState));
  } catch (error) {
    store.$dispose();
    throw error;
  }
  return store;
}

export type ClientPredictionController<TInput, TState> = {
  predict(input: TInput, state?: TState): TState;
  reconcile(serverState: TState): TState;
  history(): readonly { sequence: number; input: TInput; state: TState }[];
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
      sequence = (sequence + 1) >>> 0;
      current = options.applyInput(state, input);
      history.push({ sequence, input, state: current });
      while (history.length > maxHistory) history.shift();
      return current;
    },
    reconcile(serverState) {
      current = serverState;
      history.length = 0;
      return current;
    },
    history() {
      return history.slice();
    }
  };
}
