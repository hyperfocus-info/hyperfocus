import { expect, test } from "bun:test";
import { defineSchema, encodeDelta, encodeMultipartReplicationEnvelope, encodeReplicationFrame, encodeSnapshot, parseBinaryProtocolMessage } from "../protocol/index.ts";
import { connectAuthoritative, createClientPrediction, createServerBackedStore, type AuthoritativeClient } from "./authoritative-client.ts";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  listeners = new Map<string, Array<(event: { data?: unknown }) => void | Promise<void>>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void | Promise<void>) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  async emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) await listener({ data });
  }
}

test("authoritative client decodes ArrayBuffer, Uint8Array, Blob frames and acks", async () => {
  FakeWebSocket.instances = [];
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    roomId: "room",
    schema,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
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

test("authoritative client sends high-rate input with binary codec when configured", async () => {
  FakeWebSocket.instances = [];
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
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });

  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
  await connected;
  client.sendInput({ action: 7 });

  const binary = socket.sent.find((message): message is Uint8Array => message instanceof Uint8Array);
  expect(binary).toBeInstanceOf(Uint8Array);
  expect(parseBinaryProtocolMessage(binary!, codec)).toMatchObject({ type: "input", seq: 1, payload: { action: 7 } });
});

test("authoritative client decodes multipart replication frames with a codec", async () => {
  FakeWebSocket.instances = [];
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    multipartCodec: {
      decodeSnapshot(segments) {
        return { ids: segments.map((segment) => segment.id) };
      },
      decodeDelta(segments, previous) {
        return { ids: [...((previous as { ids?: string[] } | undefined)?.ids ?? []), ...segments.map((segment) => segment.id)] };
      }
    },
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
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
  FakeWebSocket.instances = [];
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const states: unknown[] = [];
  const errors: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));
  client.onMessage((message) => {
    if (message.type === "error") errors.push(message.payload);
  });

  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
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
  FakeWebSocket.instances = [];
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));

  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
  await connected;

  const snapshot = encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { x: 1 }) });
  const delta = encodeReplicationFrame({ kind: "delta", sequence: 2, baseline: 1, bytes: encodeDelta(schema, { x: 1 }, { x: 2 }) });
  class SlowBlob extends Blob {
    override async arrayBuffer() {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return super.arrayBuffer();
    }
  }

  const snapshotBuffer = new ArrayBuffer(snapshot.byteLength);
  new Uint8Array(snapshotBuffer).set(snapshot);
  const slowSnapshot = socket.emit("message", new SlowBlob([snapshotBuffer]));
  const fastDelta = socket.emit("message", delta);
  await Promise.all([slowSnapshot, fastDelta]);

  expect(states).toEqual([{ x: 1 }, { x: 2 }]);
  expect(client.getDebugSnapshot()).toMatchObject({ receivedSnapshots: 1, receivedDeltas: 1, lastSequence: 2 });
});

test("server-backed stores replace authoritative state without echoing patches", () => {
  const snapshotListeners: Array<Parameters<AuthoritativeClient["onSnapshot"]>[0]> = [];
  const deltaListeners: Array<Parameters<AuthoritativeClient["onDelta"]>[0]> = [];
  const sentEvents: unknown[] = [];
  const client = {
    connect: async () => undefined,
    close: () => undefined,
    sendInput: () => undefined,
    sendEvent: (event: unknown) => sentEvents.push(event),
    onMessage: () => () => undefined,
    onSnapshot: (listener: Parameters<AuthoritativeClient["onSnapshot"]>[0]) => {
      snapshotListeners.push(listener);
      return () => undefined;
    },
    onDelta: (listener: Parameters<AuthoritativeClient["onDelta"]>[0]) => {
      deltaListeners.push(listener);
      return () => undefined;
    },
    ack: () => undefined,
    getDebugSnapshot: () => ({ connected: true, sentInputs: 0, receivedMessages: 0, receivedSnapshots: 0, receivedDeltas: 0 })
  } satisfies AuthoritativeClient;
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
  FakeWebSocket.instances = [];
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });

  const firstConnect = client.connect();
  expect(client.connect()).toBe(firstConnect);
  const firstSocket = FakeWebSocket.instances[0];
  await firstSocket.emit("open");
  await firstConnect;
  await client.connect();
  expect(FakeWebSocket.instances).toHaveLength(1);

  client.close();
  const secondConnect = client.connect();
  const secondSocket = FakeWebSocket.instances[1];
  await firstSocket.emit("message", JSON.stringify({ v: 1, type: "join_accepted", payload: { playerId: "stale" } }));
  await secondSocket.emit("open");
  await secondConnect;

  expect(client.getDebugSnapshot().playerId).toBeUndefined();
  expect(FakeWebSocket.instances).toHaveLength(2);
});

test("closing a pending authoritative connection rejects it and a stale open cannot revive it", async () => {
  FakeWebSocket.instances = [];
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const pending = client.connect();
  const staleSocket = FakeWebSocket.instances[0];
  client.close();
  await expect(pending).rejects.toThrow("closed before connecting");
  await staleSocket.emit("open");
  expect(client.getDebugSnapshot().connected).toBe(false);
});

test("replication listener exceptions cannot prevent ACKs or later frames", async () => {
  FakeWebSocket.instances = [];
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const seen: unknown[] = [];
  client.onSnapshot(() => {
    throw new Error("listener failed");
  });
  client.onDelta((state) => seen.push(state));
  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
  await connected;

  await socket.emit("message", encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0, bytes: encodeSnapshot(schema, { x: 1 }) }));
  await socket.emit("message", encodeReplicationFrame({ kind: "delta", sequence: 2, baseline: 1, bytes: encodeDelta(schema, { x: 1 }, { x: 2 }) }));

  expect(seen).toEqual([{ x: 2 }]);
  expect(socket.sent.filter((message) => typeof message === "string" && message.includes("replication_ack"))).toHaveLength(2);
});

test("server-backed authoritative snapshots override optimistic local patches and dispose listeners", () => {
  let snapshotListener: Parameters<AuthoritativeClient["onSnapshot"]>[0] | undefined;
  let disposed = 0;
  const client = {
    connect: async () => undefined,
    close: () => undefined,
    sendInput: () => undefined,
    sendEvent: () => undefined,
    onMessage: () => () => undefined,
    onSnapshot: (listener: Parameters<AuthoritativeClient["onSnapshot"]>[0]) => {
      snapshotListener = listener;
      return () => disposed += 1;
    },
    onDelta: () => () => disposed += 1,
    ack: () => undefined,
    getDebugSnapshot: () => ({ connected: true, sentInputs: 0, receivedMessages: 0, receivedSnapshots: 0, receivedDeltas: 0 })
  } satisfies AuthoritativeClient;
  const store = createServerBackedStore({ initialState: { score: 0 }, client });
  store.score = 99;
  snapshotListener?.({ score: 2 }, { kind: "snapshot", sequence: 1, baseline: 0 });

  expect(store.score).toBe(2);
  store.$dispose();
  store.$dispose();
  expect(disposed).toBe(2);
});

test("client prediction validates bounds and protects internal history", () => {
  expect(() => createClientPrediction({ initialState: 0, maxHistory: -1, applyInput: (state, input: number) => state + input })).toThrow("maxHistory");
  const prediction = createClientPrediction({ initialState: 0, applyInput: (state, input: number) => state + input });
  prediction.predict(2);
  const exposed = prediction.history() as { sequence: number; input: number; state: number }[];
  exposed.length = 0;
  expect(prediction.history()).toHaveLength(1);
});

test("authoritative replication ordering accepts uint32 sequence wraparound", async () => {
  FakeWebSocket.instances = [];
  const schema = defineSchema<{ x: number }>({ x: "u16" });
  const client = connectAuthoritative({
    url: "ws://test",
    token: "dev:a",
    schema,
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket
  });
  const states: unknown[] = [];
  client.onSnapshot((state) => states.push(state));
  client.onDelta((state) => states.push(state));
  const connected = client.connect();
  const socket = FakeWebSocket.instances[0];
  await socket.emit("open");
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
