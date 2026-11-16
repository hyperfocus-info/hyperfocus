import { expect, test } from "bun:test";
import { encodeDelta } from "../protocol/delta.ts";
import { encodeSnapshot } from "../protocol/encode.ts";
import { encodeMultipartReplicationEnvelope, encodeReplicationFrame } from "../protocol/frames.ts";
import { parseBinaryProtocolMessage, SESSION_SUPERSEDED_CLOSE_CODE } from "../protocol/messages.ts";
import { defineSchema } from "../protocol/schema.ts";
import {
  applyServerBackedStoreCommand,
  connectAuthoritative,
  createClientPrediction,
  createServerBackedStore,
  type AuthoritativeClient,
  type AuthoritativeWebSocket
} from "./authoritative-client.ts";

type FakeWebSocket = AuthoritativeWebSocket & {
  binaryType: "blob" | "arraybuffer";
  readonly url: string;
  readonly sent: unknown[];
  emit(type: "open" | "message", data?: unknown): Promise<void>;
  emitClose(code?: number, reason?: string): Promise<void>;
};

function createFakeWebSocketHarness() {
  const instances: FakeWebSocket[] = [];

  function create(url: string): FakeWebSocket {
    let readyState = 1;
    const sent: unknown[] = [];
    const listeners = new Map<string, CallableFunction[]>();
    function addEventListener(type: "open", listener: () => void): void;
    function addEventListener(type: "message", listener: (event: { data?: unknown }) => void): void;
    function addEventListener(type: "close", listener: (event: { code?: number; reason?: string }) => void): void;
    function addEventListener(type: "error", listener: () => void): void;
    function addEventListener(type: string, listener: CallableFunction) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    }
    const socket: FakeWebSocket = {
      url,
      binaryType: "blob",
      get readyState() {
        return readyState;
      },
      sent,
      addEventListener,
      send(data) {
        sent.push(data);
      },
      close() {
        readyState = 3;
      },
      async emit(type, data) {
        const args = type === "open" ? [] : [{ data }];
        for (const listener of listeners.get(type) ?? []) await Reflect.apply(listener, undefined, args);
      },
      async emitClose(code = 1006, reason = "connection lost") {
        readyState = 3;
        for (const listener of listeners.get("close") ?? []) {
          await Reflect.apply(listener, undefined, [{ code, reason }]);
        }
      }
    };
    instances.push(socket);
    return socket;
  }

  return {
    instances,
    create,
    reset() {
      instances.length = 0;
    }
  };
}

const fakeWebSockets = createFakeWebSocketHarness();

function previousIds(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const ids = Reflect.get(value, "ids");
  if (!Array.isArray(ids)) return [];
  const output: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") return [];
    output.push(id);
  }
  return output;
}

async function admit(socket: FakeWebSocket, playerId = "player", roomId = "room") {
  await socket.emit("message", JSON.stringify({ v: 1, type: "join_accepted", payload: { playerId, roomId } }));
}

test("authoritative client decodes ArrayBuffer, Uint8Array, Blob frames and acks", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    roomId: "room",
    schema,
    createWebSocket: fakeWebSockets.create
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  const snapshot = encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { x: 1 }) });
  await socket.emit("message", snapshot.buffer.slice(snapshot.byteOffset, snapshot.byteOffset + snapshot.byteLength));
  const delta = encodeReplicationFrame({ kind: "delta", sequence: 2, baseline: 1, bytes: encodeDelta(schema, { x: 1 }, { x: 2 }) });
  await socket.emit("message", delta);
  const snapshotBlob = encodeReplicationFrame({ kind: "snapshot", sequence: 3, baseline: 0, bytes: encodeSnapshot(schema, { x: 3 }) });
  const blobBuffer = new ArrayBuffer(snapshotBlob.byteLength);
  const blobBytes = new Uint8Array(blobBuffer);
  blobBytes.set(snapshotBlob);
  await socket.emit("message", new Blob([blobBuffer]));

  expect(states).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 2, receivedDeltas: 1, lastSequence: 3 });
  expect(socket.sent.some((message) => typeof message === "string" && message.includes("replication_ack"))).toBe(true);
});

test("browser replication reaches ready without waiting for Blob IO", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ ready: boolean }>({ ready: "bool" });
  const client = connectAuthoritative({ url: "ws://test", token: "dev:a", schema, createWebSocket: fakeWebSockets.create });
  const states: unknown[] = [];client.onSnapshot(state => states.push(state));
  const connected = client.connect(), socket = fakeWebSockets.instances[0]!;
  await socket.emit("open");await admit(socket);await connected;
  const frame = encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { ready: true }) });
  const buffer = new Uint8Array(frame).buffer;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const blob = new Blob([buffer]);blob.arrayBuffer = async () => { await waiting;return buffer; };
  const delivered = socket.emit("message", socket.binaryType === "arraybuffer" ? buffer : blob);
  try { await Bun.sleep(5);expect(states).toEqual([{ ready: true }]); }
  finally { release();await delivered;client.close(); }
});

test("authoritative client sends high-rate input with binary codec when configured", async () => {
  fakeWebSockets.reset();
  const codec = {
    encode(input: { action: number }) {
      return new Uint8Array([input.action]);
    },
    decode(bytes: Uint8Array) {
      return { action: bytes[0] };
    }
  };
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    inputCodec: codec,
    createWebSocket: fakeWebSockets.create
  });

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;
  client.sendInput({ action: 7 });

  const binary = socket.sent.find((message): message is Uint8Array => message instanceof Uint8Array);
  expect(binary).toBeInstanceOf(Uint8Array);
  if (!binary) throw new Error("binary input was not sent");
  expect(parseBinaryProtocolMessage(binary, codec)).toMatchObject({ type: "input", seq: 1, payload: { action: 7 } });
});

test("authoritative client decodes multipart replication frames with a codec", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    multipartCodec: {
      decodeSnapshot(segments) {
        return { ids: segments.map((segment) => segment.id) };
      },
      decodeDelta(segments, previous) {
        return { ids: [...previousIds(previous), ...segments.map((segment) => segment.id)] };
      }
    },
    createWebSocket: fakeWebSockets.create
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  const snapshotPayload = encodeMultipartReplicationEnvelope({
    sequence: 1,
    baseline: 0,
    segments: [{ id: "cell:0,0", kind: "world-cell-volatile", bytes: Uint8Array.from([1]) }]
  });
  await socket.emit("message", encodeReplicationFrame({ kind: "multipart_snapshot", sequence: 1, baseline: 0, bytes: snapshotPayload }));
  const deltaPayload = encodeMultipartReplicationEnvelope({
    sequence: 2,
    baseline: 1,
    segments: [{ id: "private:p1", kind: "private-volatile", bytes: Uint8Array.from([2]) }]
  });
  await socket.emit("message", encodeReplicationFrame({ kind: "multipart_delta", sequence: 2, baseline: 1, bytes: deltaPayload }));

  expect(states).toEqual([{ ids: ["cell:0,0"] }, { ids: ["cell:0,0", "private:p1"] }]);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 1, receivedDeltas: 1, lastSequence: 2 });
  expect(socket.sent.some((message) => typeof message === "string" && message.includes("replication_ack"))).toBe(true);
});

test("authoritative client rejects stale frames and deltas with the wrong baseline", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    createWebSocket: fakeWebSockets.create
  });
  const states: unknown[] = [];
  const errors: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));
  client.onMessage((message) => {
    if (message.type === "error") errors.push(message.payload);
  });

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  await socket.emit(
    "message",
    encodeReplicationFrame({ kind: "snapshot", sequence: 10, baseline: 0, bytes: encodeSnapshot(schema, { x: 10 }) })
  );
  await socket.emit(
    "message",
    encodeReplicationFrame({ kind: "snapshot", sequence: 9, baseline: 0, bytes: encodeSnapshot(schema, { x: 9 }) })
  );
  await socket.emit(
    "message",
    encodeReplicationFrame({ kind: "delta", sequence: 12, baseline: 9, bytes: encodeDelta(schema, { x: 10 }, { x: 12 }) })
  );
  await socket.emit(
    "message",
    encodeReplicationFrame({ kind: "delta", sequence: 11, baseline: 10, bytes: encodeDelta(schema, { x: 10 }, { x: 11 }) })
  );

  expect(states).toEqual([{ x: 10 }, { x: 11 }]);
  expect(errors).toHaveLength(1);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 1, receivedDeltas: 1, lastSequence: 11, lastBaseline: 10 });
});

test("authoritative client serializes asynchronous Blob decoding", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    createWebSocket: fakeWebSockets.create
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  const snapshot = encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { x: 1 }) });
  const delta = encodeReplicationFrame({ kind: "delta", sequence: 2, baseline: 1, bytes: encodeDelta(schema, { x: 1 }, { x: 2 }) });
  const slowBlob = new Blob([new Uint8Array(snapshot).buffer]);
  const readSlowBlob = slowBlob.arrayBuffer.bind(slowBlob);
  Object.defineProperty(slowBlob, "arrayBuffer", {
    value: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return readSlowBlob();
    }
  });

  const slowSnapshot = socket.emit("message", slowBlob);
  const fastDelta = socket.emit("message", delta);
  await Promise.all([slowSnapshot, fastDelta]);

  expect(states).toEqual([{ x: 1 }, { x: 2 }]);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 1, receivedDeltas: 1, lastSequence: 2 });
});

test("server-backed stores replace authoritative state without echoing patches", () => {
  const snapshotListeners: Array<Parameters<AuthoritativeClient["onSnapshot"]>[0]> = [];
  const deltaListeners: Array<Parameters<AuthoritativeClient["onDelta"]>[0]> = [];
  const sentEvents: unknown[] = [];
  const client: AuthoritativeClient = {
    connect: async () => ({ playerId: "player", roomId: "room" }),
    close: () => undefined,
    sendInput: () => ({ status: "sent", sequence: 1 } as const),
    sendEvent: (event: unknown) => {
      sentEvents.push(event);
      return { status: "sent", sequence: sentEvents.length } as const;
    },
    onState: (listener: Parameters<AuthoritativeClient["onState"]>[0]) => {
      listener({ status: "joined", session: { playerId: "player", roomId: "room" } });
      return () => undefined;
    },
    onMessage: () => () => undefined,
    onSnapshot: (listener: Parameters<AuthoritativeClient["onSnapshot"]>[0]) => {
      snapshotListeners.push(listener);
      return () => undefined;
    },
    onDelta: (listener: Parameters<AuthoritativeClient["onDelta"]>[0]) => {
      deltaListeners.push(listener);
      return () => undefined;
    },
    ack: (sequence: number) => ({ status: "sent", sequence } as const),
    getDebugSnapshot: () => ({ connected: true, state: { status: "joined", session: { playerId: "player", roomId: "room" } } as const,
      sentInputs: 0, receivedMessages: 0, receivedSnapshots: 0, receivedDeltas: 0 })
  };
  const store = createServerBackedStore<{ keep: number; remove?: number; added?: number }>({
    initialState: { keep: 1, remove: 2, added: 0 },
    client
  });

  snapshotListeners[0]({ keep: 3 }, { kind: "snapshot", sequence: 1, baseline: 0 });
  deltaListeners[0]({ keep: 4, added: 5 }, { kind: "delta", sequence: 2, baseline: 1 });

  expect(store.$snapshot()).toEqual({ keep: 4, added: 5 });
  expect(sentEvents).toEqual([]);
});

test("authoritative connect is idempotent while active and ignores stale sockets after reconnect", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    createWebSocket: fakeWebSockets.create
  });

  const firstConnect = client.connect();
  expect(client.connect()).toBe(firstConnect);
  const firstSocket = fakeWebSockets.instances[0];
  await firstSocket.emit("open");
  await admit(firstSocket, "first");
  await firstConnect;
  await client.connect();
  expect(fakeWebSockets.instances).toHaveLength(1);

  client.close();
  const secondConnect = client.connect();
  const secondSocket = fakeWebSockets.instances[1];
  await firstSocket.emit("message", JSON.stringify({ v: 1, type: "join_accepted", payload: { playerId: "stale" } }));
  await secondSocket.emit("open");
  await admit(secondSocket, "second");
  await secondConnect;

  expect(client.getDebugSnapshot().playerId).toBe("second");
  expect(fakeWebSockets.instances).toHaveLength(2);
});

test("closing a pending authoritative connection rejects it and a stale open cannot revive it", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    createWebSocket: fakeWebSockets.create
  });
  const pending = client.connect();
  const staleSocket = fakeWebSockets.instances[0];
  client.close();
  await expect(pending).rejects.toThrow("closed before admission");
  await staleSocket.emit("open");
  expect(client.getDebugSnapshot().connected).toBe(false);
});

test("authoritative admission rejects explicitly and offline sends do not consume sequences", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    createWebSocket: fakeWebSockets.create
  });

  expect(client.sendInput({ move: 1 })).toEqual({ status: "rejected", reason: "not-joined" });
  expect(client.sendEvent({ emote: 1 })).toEqual({ status: "rejected", reason: "not-joined" });
  expect(client.getDebugSnapshot().sentInputs).toBe(0);

  const pending = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await socket.emit("message", JSON.stringify({ v: 1, type: "join_rejected", payload: { reason: "room-full" } }));

  await expect(pending).rejects.toThrow("room-full");
  expect(client.getDebugSnapshot()).toMatchObject({ connected: false, state: { status: "failed", reason: "room-full" } });
});

test("cancelled token acquisition cannot replace a later admitted connection", async () => {
  fakeWebSockets.reset();
  const tokens: Array<(token: string) => void> = [];
  const client = connectAuthoritative({ url: 'ws://test', reconnect: false,
    getToken: () => new Promise<string>(resolve => tokens.push(resolve)), createWebSocket: fakeWebSockets.create });
  try {
    const abandoned = client.connect().then(() => 'joined', () => 'cancelled');
    client.close({ mode: 'suspend' });
    const current = client.connect();tokens[1]!('current');await Promise.resolve();
    const socket = fakeWebSockets.instances[0]!;
    await socket.emit('open');await admit(socket, 'current');await current;
    tokens[0]!('abandoned');await Promise.resolve();
    expect(fakeWebSockets.instances).toHaveLength(1);
    expect(await abandoned).toBe('cancelled');
    expect(client.getDebugSnapshot()).toMatchObject({ connected: true, playerId: 'current' });
  } finally { client.close(); }
});

test("an abandoned reconnect credential failure cannot retry over a newer session", async () => {
  fakeWebSockets.reset();let requests = 0, rejectOld: (error: Error) => void = () => {};
  const client = connectAuthoritative({ url: 'ws://test',
    getToken: () => ++requests === 2 ? new Promise<string>((_, reject) => { rejectOld = reject; }) : 'fresh',
    reconnect: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 }, createWebSocket: fakeWebSockets.create });
  try {
    const first = client.connect();await Promise.resolve();
    await fakeWebSockets.instances[0]!.emit('open');await admit(fakeWebSockets.instances[0]!, 'old');await first;
    await fakeWebSockets.instances[0]!.emitClose();await Bun.sleep(5);expect(requests).toBe(2);
    client.close();const current = client.connect();await Promise.resolve();
    const socket = fakeWebSockets.instances[1]!;
    await socket.emit('open');await admit(socket, 'current');await current;
    rejectOld(new Error('Abandoned credential request failed'));await Bun.sleep(5);
    expect(requests).toBe(3);expect(fakeWebSockets.instances).toHaveLength(2);
    expect(client.getDebugSnapshot().state.status).toBe('joined');
    expect(client.getDebugSnapshot()).toMatchObject({ connected: true, playerId: 'current' });
  } finally { client.close(); }
});

test("authoritative reconnect obtains a fresh token before restoring admission", async () => {
  fakeWebSockets.reset();
  const tokens: string[] = [];
  const states: string[] = [];
  const client = connectAuthoritative({
    url: "ws://test",
    getToken: ({ attempt }) => {
      const token = `token-${attempt}-${tokens.length}`;
      tokens.push(token);
      return token;
    },
    reconnect: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 },
    createWebSocket: fakeWebSockets.create
  });
  client.onState((state) => states.push(state.status));

  const firstConnect = client.connect();
  await Promise.resolve();
  const firstSocket = fakeWebSockets.instances[0];
  await firstSocket.emit("open");
  await admit(firstSocket, "first");
  await firstConnect;
  await firstSocket.emitClose();
  await Bun.sleep(5);

  const secondSocket = fakeWebSockets.instances[1];
  expect(secondSocket).toBeDefined();
  await secondSocket.emit("open");
  await admit(secondSocket, "second");
  await Bun.sleep(0);

  expect(tokens).toHaveLength(2);
  expect(client.getDebugSnapshot()).toMatchObject({ connected: true, playerId: "second" });
  expect(states).toContain("recovering");
  client.close();
});

test("superseded account close is terminal until an explicit connection request", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({ url: "ws://test", token: "dev:a", createWebSocket: fakeWebSockets.create,
    reconnect: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 } });
  try {
    const pending = client.connect(), first = fakeWebSockets.instances[0]!;
    await first.emit("open");await admit(first, "first");await pending;
    await first.emitClose(SESSION_SUPERSEDED_CLOSE_CODE, "This account signed in elsewhere.");await Bun.sleep(10);
    expect(fakeWebSockets.instances).toHaveLength(1);
    expect(client.getDebugSnapshot()).toMatchObject({ connected: false, state: { status: "failed", reason: "This account signed in elsewhere." } });
    const manual = client.connect(), second = fakeWebSockets.instances[1]!;
    expect(second).toBeDefined();await second.emit("open");await admit(second, "second", "new-room");await manual;
    expect(client.getDebugSnapshot()).toMatchObject({ connected: true, playerId: "second", roomId: "new-room" });
  } finally { client.close(); }
});

test("replication listener exceptions cannot prevent ACKs or later frames", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    createWebSocket: fakeWebSockets.create
  });
  const seen: unknown[] = [];
  client.onSnapshot(() => {
    throw new Error("listener failed");
  });
  client.onDelta((state) => seen.push(state));
  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  await socket.emit("message", encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { x: 1 }) }));
  await socket.emit("message", encodeReplicationFrame({ kind: "delta", sequence: 2, baseline: 1, bytes: encodeDelta(schema, { x: 1 }, { x: 2 }) }));

  expect(seen).toEqual([{ x: 2 }]);
  expect(socket.sent.filter((message) => typeof message === "string" && message.includes("replication_ack"))).toHaveLength(2);
});

test("server-backed stores replay optimistic commands until rejection and dispose listeners", () => {
  let snapshotListener: Parameters<AuthoritativeClient["onSnapshot"]>[0] | undefined;
  let messageListener: Parameters<AuthoritativeClient["onMessage"]>[0] | undefined;
  let disposed = 0;
  const rejected: string[] = [];
  const client: AuthoritativeClient = {
    connect: async () => ({ playerId: "player", roomId: "room" }),
    close: () => undefined,
    sendInput: () => ({ status: "sent", sequence: 1 } as const),
    sendEvent: () => ({ status: "sent", sequence: 1 } as const),
    onState: (listener: Parameters<AuthoritativeClient["onState"]>[0]) => {
      listener({ status: "joined", session: { playerId: "player", roomId: "room" } });
      return () => undefined;
    },
    onMessage: (listener) => {
      messageListener = listener;
      return () => disposed += 1;
    },
    onSnapshot: (listener: Parameters<AuthoritativeClient["onSnapshot"]>[0]) => {
      snapshotListener = listener;
      return () => disposed += 1;
    },
    onDelta: () => () => disposed += 1,
    ack: (sequence: number) => ({ status: "sent", sequence } as const),
    getDebugSnapshot: () => ({ connected: true, state: { status: "joined", session: { playerId: "player", roomId: "room" } } as const,
      sentInputs: 0, receivedMessages: 0, receivedSnapshots: 0, receivedDeltas: 0 })
  };
  const store = createServerBackedStore({
    initialState: { score: 0 },
    client,
    peerId: "test-client",
    createCommandId: () => "command-1",
    onCommandRejected: ({ reason }) => rejected.push(reason)
  });
  store.score = 99;
  snapshotListener?.({ score: 2 }, { kind: "snapshot", sequence: 1, baseline: 0 });

  expect(store.score).toBe(99);
  messageListener?.({
    v: 1,
    type: "event",
    payload: { type: "store_command_rejected", commandId: "command-1", reason: "forbidden", state: { score: 2 }, revision: 1 }
  });
  expect(store.score).toBe(2);
  expect(rejected).toEqual(["forbidden"]);
  store.$dispose();
  store.$dispose();
  expect(disposed).toBe(3);
});

test("client prediction validates bounds and protects internal history", () => {
  expect(() => createClientPrediction({ initialState: 0, maxHistory: -1, applyInput: (state, input: number) => state + input })).toThrow("maxHistory");
  const prediction = createClientPrediction({ initialState: 0, applyInput: (state, input: number) => state + input });
  prediction.predict(2);
  const exposed = prediction.history();
  Reflect.set(exposed, "length", 0);
  expect(prediction.history()).toHaveLength(1);
});

test("client prediction discards acknowledged inputs and replays the pending tail", () => {
  const prediction = createClientPrediction({ initialState: 0, applyInput: (state, input: number) => state + input });
  prediction.predict(1);
  prediction.predict(2);

  expect(prediction.reconcile(10, 1)).toBe(12);
  expect(prediction.state()).toBe(12);
  expect(prediction.history()).toEqual([{ sequence: 2, input: 2, state: 12 }]);
  expect(() => prediction.reconcile(0, -1)).toThrow("u32");
});

test("client prediction refuses to silently discard unacknowledged history", () => {
  const prediction = createClientPrediction({ initialState: 0, maxHistory: 1, applyInput: (state, input: number) => state + input });
  prediction.predict(1);
  expect(() => prediction.predict(2)).toThrow("history is full");
  expect(prediction.state()).toBe(1);
});

test("server-backed store commands enforce revision and authorization before mutation", () => {
  const event = {
    type: "store_command",
    command: {
      id: "command-1",
      baseRevision: 3,
      patch: { path: ["score"], value: 2, timestamp: 1, peerId: "client" }
    }
  } as const;

  expect(applyServerBackedStoreCommand({ state: { score: 1 }, revision: 2, event })?.response).toMatchObject({
    type: "store_command_rejected",
    reason: "revision-conflict",
    revision: 2
  });
  expect(applyServerBackedStoreCommand({ state: { score: 1 }, revision: 3, event, authorize: () => "forbidden" })?.response).toMatchObject({
    type: "store_command_rejected",
    reason: "forbidden"
  });
  expect(applyServerBackedStoreCommand({ state: { score: 1 }, revision: 3, event })).toMatchObject({
    state: { score: 2 },
    revision: 4,
    response: { type: "store_command_ack", commandId: "command-1", state: { score: 2 }, revision: 4 }
  });
});

test("authoritative replication ordering accepts uint32 sequence wraparound", async () => {
  fakeWebSockets.reset();
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    createWebSocket: fakeWebSockets.create
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));
  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;

  await socket.emit("message", encodeReplicationFrame({
    kind: "snapshot",
    sequence: 0xfffffffe,
    baseline: 0,
    bytes: encodeSnapshot(schema, { x: 1 })
  }));
  await socket.emit("message", encodeReplicationFrame({
    kind: "delta",
    sequence: 0xffffffff,
    baseline: 0xfffffffe,
    bytes: encodeDelta(schema, { x: 1 }, { x: 2 })
  }));
  await socket.emit("message", encodeReplicationFrame({
    kind: "delta",
    sequence: 0,
    baseline: 0xffffffff,
    bytes: encodeDelta(schema, { x: 2 }, { x: 3 })
  }));

  expect(states).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
  expect(client.getDebugSnapshot().lastSequence).toBe(0);
});

test("authoritative client rejects oversized replication frames before decoding", async () => {
  fakeWebSockets.reset();
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    maxReplicationFrameBytes: 16,
    createWebSocket: fakeWebSockets.create
  });
  const errors: string[] = [];
  client.onMessage((message) => {
    const payload = message.payload;
    if (message.type === "error" && typeof payload === "object" && payload !== null && "reason" in payload && typeof payload.reason === "string") {
      errors.push(payload.reason);
    }
  });

  const connected = client.connect();
  const socket = fakeWebSockets.instances[0];
  await socket.emit("open");
  await admit(socket);
  await connected;
  await socket.emit("message", new Uint8Array(17));

  expect(errors).toEqual(["replication frame exceeds 16 bytes"]);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 0, receivedDeltas: 0 });
});
