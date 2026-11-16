import { expect, test } from "bun:test";
import { encodeDelta } from "../protocol/delta.ts";
import { decodeSnapshot, encodeSnapshot, estimateMessageBytes } from "../protocol/encode.ts";
import { decodeMultipartReplicationEnvelope, decodeReplicationFrame } from "../protocol/frames.ts";
import { createProtocolMessage, encodeProtocolMessage, parseProtocolMessage, type ProtocolMessage } from "../protocol/messages.ts";
import { defineSchema } from "../protocol/schema.ts";
import { createRoomType } from "./core/room-type.ts";
import type { AuthAdapter } from "./core/types.ts";
import { createMmo1000Preset, createMmoInterestGrid } from "./replication/scaling.ts";
import { createDurableEventOutbox } from "./runtime/durable-event-outbox.ts";
import { createPersistenceAdapter } from "./services/persistence.ts";
import { createAuthoritativeServer as createAuthoritativeServerBase, type AuthoritativeServer, type AuthoritativeServerOptions } from "./server.ts";

function createAuthoritativeServer(options: AuthoritativeServerOptions) {
  return createAuthoritativeServerBase({ ...options, devMode: options.devMode ?? true });
}

type TestState = { joined: string[]; inputs: number; ticks: number };
type CounterState = { ticks: number };
type TestSocket = {
  sent: Array<string | Uint8Array>;
  send(data: string | Uint8Array): void;
  close(): void;
  clear(): void;
};

const counterSchema = defineSchema<CounterState>({ ticks: "u16" });

function requireTestState(value: unknown): TestState {
  if (typeof value !== "object" || value === null || !Array.isArray(Reflect.get(value, "joined"))
    || typeof Reflect.get(value, "inputs") !== "number" || typeof Reflect.get(value, "ticks") !== "number") {
    throw new Error("Expected authoritative transport test room state");
  }
  return {
    joined: [...Reflect.get(value, "joined")],
    inputs: Reflect.get(value, "inputs"),
    ticks: Reflect.get(value, "ticks"),
  };
}

function testSocket(): TestSocket {
  return {
    sent: [],
    send(data) {
      this.sent.push(data);
    },
    close() {},
    clear() {
      this.sent.length = 0;
    }
  };
}

function binaryFrames(socket: TestSocket) {
  return socket.sent.filter((data): data is Uint8Array => data instanceof Uint8Array);
}

function waitForWebSocketOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("websocket open timed out")), 2000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket open failed"));
    }, { once: true });
  });
}

function waitForProtocolMessage(socket: WebSocket, type: ProtocolMessage["type"]) {
  return new Promise<ProtocolMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`websocket message ${type} timed out`));
    }, 2000);
    function onMessage(event: MessageEvent) {
      if (typeof event.data !== "string") return;
      const message = parseProtocolMessage(event.data);
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    }
    socket.addEventListener("message", onMessage);
  });
}

function metricTotal(metrics: Record<string, { total: number }>, name: string) {
  return Object.entries(metrics).reduce((sum, [key, value]) => sum + (key === name || key.startsWith(`${name}{`) ? value.total : 0), 0);
}

async function withEnvFlag<T>(name: string, value: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

async function joinSocketClients(server: AuthoritativeServer, count: number, roomId: string, roomType = "field") {
  const sockets: TestSocket[] = [];
  for (let i = 0; i < count; i += 1) {
    const socket = testSocket();
    sockets.push(socket);
    const join = await server.joinRoom({ roomId, roomType, token: `dev:${roomId}-${i}`, connection: socket });
    expect(join.ok).toBe(true);
  }
  return sockets;
}

function sortedRoomLoads(server: AuthoritativeServer, prefix: string) {
  return server
    .rooms()
    .filter((room) => room.id.startsWith(prefix))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room) => room.ctx.players.size);
}

function createTestRoom(options: { maxPlayers?: number; idleDisposeMs?: number; replication?: { snapshotRate?: number; deltaRate?: number; maxBytesPerClientPerSecond?: number } } = {}) {
  return createRoomType<TestState, { move: number }>({
    name: "field",
    schema: defineSchema<TestState>({ joined: { type: "array", item: "string:32" }, inputs: "u16", ticks: "u16" }),
    maxPlayers: options.maxPlayers,
    replication: options.replication,
    idleDisposeMs: options.idleDisposeMs,
    createState: () => ({ joined: [], inputs: 0, ticks: 0 }),
    canJoin: (ctx) => ctx.players.size < (options.maxPlayers ?? 100) ? { ok: true } : { ok: false, reason: "room full" },
    onJoin: (ctx, player) => {
      ctx.state.joined.push(player.userId);
    },
    onInput: (ctx) => {
      ctx.state.inputs += 1;
    },
    update: (ctx) => {
      ctx.state.ticks += 1;
    }
  });
}

function createCounterRoom() {
  return createRoomType<CounterState, Record<string, never>>({
    name: "counter",
    schema: counterSchema,
    createState: () => ({ ticks: 0 }),
    update: (ctx) => {
      ctx.state.ticks += 1;
    }
  });
}

test("room broadcasts separate transient delivery from durable event persistence", async () => {
  type BroadcastEvent = { kind: string; tick: number };
  const roomType = createRoomType<{ ticks: number }, unknown, BroadcastEvent>({
    name: "broadcast-room",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
      ctx.broadcast({ kind: "tick", tick: ctx.state.ticks });
      ctx.broadcast({ kind: "milestone", tick: ctx.state.ticks }, { durability: "durable" });
    }
  });
  const socket = testSocket();
  const persistedEvents: unknown[] = [];
  const persistence = createPersistenceAdapter({
    async appendEvent(event) {
      persistedEvents.push(event);
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    persistence,
    replication: { binary: false }
  });

  expect((await server.joinRoom({ roomId: "broadcast", roomType: "broadcast-room", token: "dev:first", connection: socket })).ok).toBe(true);
  await expect(server.joinRoom({ roomId: "broadcast", roomType: "broadcast-room", token: "dev:second", connection: socket })).resolves.toMatchObject({
    ok: false,
    reason: "connection already joined"
  });
  await server.tick();

  const events = socket.sent
    .filter((message): message is string => typeof message === "string")
    .map((message) => parseProtocolMessage(message))
    .filter((message) => message.type === "event");
  expect(events).toEqual([
    expect.objectContaining({ type: "event", roomId: "broadcast", payload: { kind: "tick", tick: 1 } }),
    expect.objectContaining({ type: "event", roomId: "broadcast", payload: { kind: "milestone", tick: 1 } })
  ]);
  expect(persistedEvents).toEqual([{ roomId: "broadcast", roomType: "broadcast-room", at: expect.any(Number), event: { kind: "milestone", tick: 1 } }]);
  expect(server.presence.count()).toBe(1);
  await server.stop();
});

test("durable event writes do not block the simulation tick and flush during shutdown", async () => {
  let releaseWrite!: () => void;
  let markWriteStarted!: () => void;
  const writePending = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  const roomType = createRoomType<{ ticks: number }, unknown, { kind: string }>({
    name: "durable-lane",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
      ctx.broadcast({ kind: "checkpoint" }, { durability: "durable" });
    }
  });
  const socket = testSocket();
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    persistence: createPersistenceAdapter({
      async appendEvent() {
        markWriteStarted();
        await writePending;
      }
    }),
    replication: { binary: false }
  });
  await server.joinRoom({ roomId: "durable", roomType: "durable-lane", token: "dev:durable", connection: socket });

  await expect(server.tick()).resolves.toBeUndefined();
  await writeStarted;
  expect(socket.sent.some((message) => typeof message === "string" && message.includes("checkpoint"))).toBe(true);
  const stopping = server.stop();
  await Bun.sleep(0);
  releaseWrite();
  await expect(stopping).resolves.toBeUndefined();
});

test("durable outbox bounds in-flight work and retries only after new work arrives", async () => {
  let releaseWrite!: () => void;
  let startedWrite!: () => void;
  const blocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const started = new Promise<void>((resolve) => { startedWrite = resolve; });
  const bounded = createDurableEventOutbox({
    persistence: createPersistenceAdapter({ async appendEvents() { startedWrite(); await blocked; } }),
    maxPending: 1,
    batchSize: 1,
    onError() {}
  });
  expect(bounded.enqueue("first")).toBe(true);
  await started;
  expect(bounded.pending()).toBe(1);
  expect(bounded.enqueue("overflow")).toBe(false);
  releaseWrite();
  await bounded.flush();

  let attempts = 0;
  const persisted: unknown[] = [];
  const retrying = createDurableEventOutbox({
    persistence: createPersistenceAdapter({
      async appendEvents(events) {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        persisted.push(...events);
      }
    }),
    maxPending: 2,
    batchSize: 2,
    onError() {}
  });
  expect(retrying.enqueue("first")).toBe(true);
  await expect(retrying.flush()).rejects.toThrow("temporary failure");
  expect(attempts).toBe(1);
  expect(retrying.enqueue("retry-trigger")).toBe(true);
  await retrying.flush();
  expect(persisted).toEqual(["first", "retry-trigger"]);

  let failedSecond = false;
  const individuallyPersisted: unknown[] = [];
  const individual = createDurableEventOutbox({
    persistence: createPersistenceAdapter({
      async appendEvent(event) {
        if (event === "second" && !failedSecond) {
          failedSecond = true;
          throw new Error("single write failed");
        }
        individuallyPersisted.push(event);
      }
    }),
    maxPending: 3,
    batchSize: 3,
    onError() {}
  });
  individual.enqueue("first");
  individual.enqueue("second");
  await expect(individual.flush()).rejects.toThrow("single write failed");
  individual.enqueue("retry-trigger");
  await individual.flush();
  expect(individuallyPersisted).toEqual(["first", "second", "retry-trigger"]);
});

test("replication send failures clean up presence without aborting the tick", async () => {
  let closes = 0;
  const socket = {
    send() {
      throw new Error("socket failed");
    },
    close() {
      closes += 1;
    }
  };
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()] });
  const joined = await server.joinRoom({ roomId: "send-failure", roomType: "field", token: "dev:send-failure", connection: socket });
  expect(joined.ok).toBe(true);

  await expect(server.tick()).resolves.toBeUndefined();
  expect(closes).toBe(1);
  expect(server.presence.count()).toBe(0);
  expect(joined.room!.ctx.players.size).toBe(0);
  expect(metricTotal(server.getStats().metrics, "replication.send_error")).toBe(1);
  await server.stop();
});

test("websocket input identity is bound to the joined connection", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()], replication: { binary: false } });
  const victim = await server.joinRoom({ roomId: "wire-auth", roomType: "field", token: "dev:victim" });
  expect(victim.ok).toBe(true);
  server.start();
  const socket = new WebSocket(`ws://127.0.0.1:${server.getStats().port}`);

  try {
    await waitForWebSocketOpen(socket);
    const pong = waitForProtocolMessage(socket, "pong");
    socket.send(encodeProtocolMessage(createProtocolMessage("input", { move: 1 }, { playerId: victim.player!.id })));
    socket.send(encodeProtocolMessage(createProtocolMessage("ping", { now: 1 })));
    await pong;
    expect(requireTestState(victim.room!.ctx.state).inputs).toBe(0);

    const accepted = waitForProtocolMessage(socket, "join_accepted");
    socket.send(encodeProtocolMessage(createProtocolMessage("join_room", { roomId: "wire-auth", roomType: "field", token: "dev:attacker" })));
    await accepted;

    const rejected = waitForProtocolMessage(socket, "join_rejected");
    socket.send(encodeProtocolMessage(createProtocolMessage("join_room", { roomId: "wire-auth", roomType: "field", token: "dev:replacement" })));
    const processed = waitForProtocolMessage(socket, "pong");
    socket.send(encodeProtocolMessage(createProtocolMessage("ping", { now: 2 })));
    await Promise.all([processed, rejected]);
    expect(server.presence.count()).toBe(2);
  } finally {
    socket.close();
    await server.stop();
  }
});

test("closing a websocket during authentication cannot leave a ghost player", async () => {
  let releaseAuth!: () => void;
  let markAuthStarted!: () => void;
  const authPending = new Promise<void>((resolve) => { releaseAuth = resolve; });
  const authStarted = new Promise<void>((resolve) => { markAuthStarted = resolve; });
  const auth: AuthAdapter = {
    async verify() {
      markAuthStarted();
      await authPending;
      return { ok: true, userId: "closing-user", sessionId: "session:closing-user" };
    }
  };
  const server = createAuthoritativeServerBase({ transport: "websocket", port: 0, rooms: [createTestRoom()], auth, replication: { binary: false } });
  server.start();
  const socket = new WebSocket(`ws://127.0.0.1:${server.getStats().port}`);

  try {
    await waitForWebSocketOpen(socket);
    socket.send(encodeProtocolMessage(createProtocolMessage("join_room", { roomId: "closing-room", roomType: "field", token: "slow" })));
    await authStarted;
    const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve(), { once: true }));
    socket.close();
    await closed;
    await Bun.sleep(10);
    releaseAuth();
    await Bun.sleep(10);

    expect(server.presence.count()).toBe(0);
    expect(server.rooms().every((room) => room.ctx.players.size === 0)).toBe(true);
  } finally {
    releaseAuth();
    socket.close();
    await server.stop();
  }
});

test("authoritative server routes client events to room handler with sender player", async () => {
  type EventState = { events: number; lastPlayerId: string; lastUserId: string; lastType: string; lastValue: number };
  type EventPayload = { type: string; value: number };
  const roomType = createRoomType<EventState, unknown, EventPayload>({
    name: "event-field",
    schema: defineSchema<EventState>({
      events: "u16",
      lastPlayerId: "string:32",
      lastUserId: "string:32",
      lastType: "string:32",
      lastValue: "u16"
    }),
    createState: () => ({ events: 0, lastPlayerId: "", lastUserId: "", lastType: "", lastValue: 0 }),
    onEvent(ctx, player, event) {
      ctx.state.events += 1;
      ctx.state.lastPlayerId = player.id;
      ctx.state.lastUserId = player.userId;
      ctx.state.lastType = event.type;
      ctx.state.lastValue = event.value;
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  const join = await server.joinRoom({ roomId: "event-room", roomType: "event-field", token: "dev:host" });

  expect(join.ok).toBe(true);
  expect(await server.receiveEvent(join.player!.id, { type: "start", value: 7 })).toBe(true);
  expect(await server.receiveEvent("missing-player", { type: "ignored", value: 0 })).toBe(false);
  expect(join.room!.ctx.state).toMatchObject({
    events: 1,
    lastPlayerId: join.player!.id,
    lastUserId: "host",
    lastType: "start",
    lastValue: 7
  });
});

test("missing roomId uses least-loaded MMO admission room", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    scale: createMmo1000Preset({ publicRoomType: "field", publicRoomPrefix: "public", publicRooms: 2, playersPerRoom: 2 })
  });

  const first = await server.joinRoom({ token: "dev:a" });
  const second = await server.joinRoom({ token: "dev:b" });
  const third = await server.joinRoom({ token: "dev:c" });

  expect(first).toMatchObject({ ok: true, room: { id: "public-0" } });
  expect(second).toMatchObject({ ok: true, room: { id: "public-1" } });
  expect(third).toMatchObject({ ok: true, room: { id: "public-0" } });
  expect(sortedRoomLoads(server, "public-")).toEqual([2, 1]);
});

test("MMO admission can fill the first public room before spilling to the next", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    scale: createMmo1000Preset({
      publicRoomType: "field",
      publicRoomPrefix: "public",
      publicRooms: 2,
      playersPerRoom: 2,
      admissionSelection: "fill-first"
    })
  });

  const first = await server.joinRoom({ token: "dev:a" });
  const second = await server.joinRoom({ token: "dev:b" });
  const third = await server.joinRoom({ token: "dev:c" });

  expect(first).toMatchObject({ ok: true, room: { id: "public-0" } });
  expect(second).toMatchObject({ ok: true, room: { id: "public-0" } });
  expect(third).toMatchObject({ ok: true, room: { id: "public-1" } });
  expect(sortedRoomLoads(server, "public-")).toEqual([2, 1]);
});

test("explicit roomId still bypasses admission selection", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    scale: createMmo1000Preset({ publicRoomType: "field", publicRoomPrefix: "public", publicRooms: 2, playersPerRoom: 2 })
  });

  const join = await server.joinRoom({ roomId: "custom-room", roomType: "field", token: "dev:explicit" });

  expect(join).toMatchObject({ ok: true, room: { id: "custom-room" } });
  expect(server.rooms().some((room) => room.id === "custom-room")).toBe(true);
  expect(sortedRoomLoads(server, "public-")).toEqual([0, 0]);
});

test("MMO preset pre-creates ten managed rooms and keeps them from idle disposal", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom({ idleDisposeMs: 10 })],
    now: () => now,
    scale: createMmo1000Preset({ publicRoomType: "field", publicRoomPrefix: "mmo-field" })
  });

  expect(server.rooms().map((room) => room.id)).toEqual(["mmo-field-0", "mmo-field-1", "mmo-field-2", "mmo-field-3", "mmo-field-4", "mmo-field-5", "mmo-field-6", "mmo-field-7", "mmo-field-8", "mmo-field-9"]);

  now = 20;
  await server.tick();

  expect(server.rooms()).toHaveLength(10);
});

test("MMO admission spreads to soft cap before hard cap", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    admission: { roomType: "field", roomIdPrefix: "soft", rooms: 3, playersPerRoom: 3, softPlayersPerRoom: 1 }
  });

  for (let i = 0; i < 4; i += 1) {
    const join = await server.joinRoom({ token: `dev:soft-${i}` });
    expect(join.ok).toBe(true);
  }

  expect(sortedRoomLoads(server, "soft-")).toEqual([2, 1, 1]);
});

test("MMO admission rejects with world full at hard cap", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    admission: { roomType: "field", roomIdPrefix: "full", rooms: 1, playersPerRoom: 1 }
  });

  expect((await server.joinRoom({ token: "dev:first" })).ok).toBe(true);
  expect(await server.joinRoom({ token: "dev:second" })).toMatchObject({ ok: false, reason: "world full" });
  expect(server.getStats().metrics["server.admission.rejected_full"]?.latest).toBe(1);
});

test("duplicate implicit login in full MMO world replaces old presence without increasing load", async () => {
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    admission: { roomType: "field", roomIdPrefix: "dupe", rooms: 1, playersPerRoom: 1 }
  });

  const first = await server.joinRoom({ token: "dev:repeat" });
  const second = await server.joinRoom({ token: "dev:repeat" });

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(server.presence.count()).toBe(1);
  expect(sortedRoomLoads(server, "dupe-")).toEqual([1]);
});

test("MMO interest grid applies 1000-player defaults", () => {
  const grid = createMmoInterestGrid();
  grid.upsert({ id: "near", x: 32, y: 0 });
  grid.upsert({ id: "far", x: 96, y: 0 });

  expect(grid.query({ x: 0, y: 0, radius: 40 })).toEqual(["near"]);
});

test("authoritative server streams binary snapshot then delta to joined socket", async () => {
  let now = 0;
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const roomType = createTestRoom();
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 20, telemetry: true }
  });

  const join = await server.joinRoom({ roomId: "field-stream", token: "dev:stream", roomType: "field", connection: socket });
  expect(join.ok).toBe(true);

  await server.tick();
  const snapshotFrame = decodeReplicationFrame(sent.find((data): data is Uint8Array => data instanceof Uint8Array)!);
  expect(snapshotFrame.kind).toBe("snapshot");
  expect(decodeSnapshot(roomType.schema, snapshotFrame.bytes)).toMatchObject({ ticks: 1 });

  now = 50;
  await server.tick();
  const frames = sent.filter((data): data is Uint8Array => data instanceof Uint8Array);
  const deltaFrame = decodeReplicationFrame(frames.at(-1)!);
  expect(deltaFrame.kind).toBe("delta");
  expect(deltaFrame.baseline).toBe(snapshotFrame.sequence);
});

test("authoritative server streams multipart frames when rooms supply segments", async () => {
  let now = 0;
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const schema = defineSchema<CounterState>({ ticks: "u16" });
  let replicationTelemetryCalls = 0;
  let lastAdaptiveTelemetry: { reduceStaticRecordsRecommended: boolean; staticDeferredCountThreshold: number } | undefined;
  const roomType = createRoomType<CounterState>({
    name: "segmented",
    schema,
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
    },
    getReplication(ctx) {
      const state = { ticks: ctx.state.ticks };
      return {
        state,
        segments: [{ id: "cell:0,0:volatile", kind: "world-cell-volatile", bytes: encodeSnapshot(schema, state) }]
      };
    },
    getRoomTelemetry(ctx) {
      return { ticks: ctx.state.ticks, warnings: [] };
    },
    onReplicationTelemetry(_ctx, telemetry) {
      replicationTelemetryCalls += 1;
      lastAdaptiveTelemetry = telemetry.adaptive;
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 20, telemetry: true }
  });

  expect((await server.joinRoom({ roomId: "segmented-stream", token: "dev:seg", roomType: "segmented", connection: socket })).ok).toBe(true);
  await server.tick();
  const snapshotFrame = decodeReplicationFrame(sent.find((data): data is Uint8Array => data instanceof Uint8Array)!);
  expect(snapshotFrame.kind).toBe("multipart_snapshot");
  expect(decodeMultipartReplicationEnvelope(snapshotFrame.bytes).segments[0].id).toBe("cell:0,0:volatile");

  now = 50;
  await server.tick();
  const frames = sent.filter((data): data is Uint8Array => data instanceof Uint8Array);
  const deltaFrame = decodeReplicationFrame(frames.at(-1)!);
  expect(deltaFrame.kind).toBe("multipart_delta");
  expect(deltaFrame.baseline).toBe(snapshotFrame.sequence);
  const telemetry = server.getStats().roomTelemetry[0];
  expect(telemetry.id).toBe("segmented-stream");
  expect(telemetry.room).toMatchObject({ ticks: 2 });
  expect(telemetry.replication.currentTick.volatileBytes).toBeGreaterThan(0);
  expect(telemetry.replication.currentTick.budgetUtilization).toBeGreaterThan(0);
  expect(telemetry.adaptive.staticDeferredCountThreshold).toBe(10);
  expect(lastAdaptiveTelemetry?.reduceStaticRecordsRecommended).toBe(false);
  expect(replicationTelemetryCalls).toBeGreaterThan(0);
});

test("replication telemetry recommends static throttling after sustained static deferrals", async () => {
  let now = 0;
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const schema = defineSchema<CounterState>({ ticks: "u16" });
  let lastReduceStaticRecordsRecommended = false;
  const staticPayload = new Uint8Array(512);
  const roomType = createRoomType<CounterState>({
    name: "static-pressure",
    schema,
    replication: { deltaRate: 20, maxBytesPerClientPerSecond: 256 },
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
    },
    getReplication(ctx) {
      const state = { ticks: ctx.state.ticks };
      return {
        state,
        segments: [
          { id: "volatile", kind: "world-cell-volatile", bytes: encodeSnapshot(schema, state) },
          ...Array.from({ length: 12 }, (_, index) => ({
            id: `static:${index}`,
            kind: "world-cell-static",
            bytes: staticPayload
          }))
        ]
      };
    },
    onReplicationTelemetry(_ctx, telemetry) {
      lastReduceStaticRecordsRecommended = telemetry.adaptive.reduceStaticRecordsRecommended;
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    replication: { snapshotRate: 20, deltaRate: 20, telemetry: true }
  });

  expect((await server.joinRoom({ roomId: "static-pressure-room", token: "dev:pressure", roomType: "static-pressure", connection: socket })).ok).toBe(true);
  for (let tick = 0; tick < 6; tick += 1) {
    await server.tick();
    now += 1000;
  }

  const telemetry = server.getStats().roomTelemetry[0];
  expect(telemetry.adaptive.staticDeferralSustained).toBe(true);
  expect(telemetry.adaptive.staticDeferralHighForMs).toBeGreaterThanOrEqual(5000);
  expect(telemetry.adaptive.reduceStaticRecordsRecommended).toBe(true);
  expect(lastReduceStaticRecordsRecommended).toBe(true);
  expect(telemetry.warnings).toContain("Replication static deferral sustained");
});

test("replication telemetry stays off when disabled", async () => {
  let now = 0;
  const sent: Array<string | Uint8Array> = [];
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); }, close() {} };
  const schema = defineSchema<CounterState>({ ticks: "u16" });
  let telemetryCalls = 0;
  let roomTelemetryCalls = 0;
  const roomType = createRoomType<CounterState>({
    name: "telemetry-off",
    schema,
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
    },
    getReplication(ctx) {
      const state = { ticks: ctx.state.ticks };
      return {
        state,
        segments: [{ id: "cell:0,0:volatile", kind: "world-cell-volatile", bytes: encodeSnapshot(schema, state) }]
      };
    },
    getRoomTelemetry() {
      roomTelemetryCalls += 1;
      return { warnings: ["should-not-run"] };
    },
    onReplicationTelemetry() {
      telemetryCalls += 1;
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 20, telemetry: false }
  });

  expect((await server.joinRoom({ roomId: "telemetry-off-room", token: "dev:off", roomType: "telemetry-off", connection: socket })).ok).toBe(true);
  await server.tick();
  const snapshot = sent.find((data): data is Uint8Array => data instanceof Uint8Array);
  expect(snapshot).toBeDefined();
  expect(decodeReplicationFrame(snapshot!).kind).toBe("multipart_snapshot");

  const telemetry = server.getStats().roomTelemetry[0];
  expect(telemetry.replication.enabled).toBe(false);
  expect(telemetry.replication.currentTick.totalBytes).toBe(0);
  expect(telemetry.room).toBeUndefined();
  expect(telemetry.warnings).toEqual([]);
  expect(telemetryCalls).toBe(0);
  expect(roomTelemetryCalls).toBe(0);
});

test("room replication options can slow deltas without changing server defaults", async () => {
  let now = 0;
  const socket = testSocket();
  const roomType = createTestRoom({ replication: { deltaRate: 5 } });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 20 }
  });

  expect((await server.joinRoom({ roomId: "room-repl", roomType: "field", token: "dev:room-repl", connection: socket })).ok).toBe(true);
  await server.tick();
  socket.clear();

  now = 50;
  await server.tick();
  expect(binaryFrames(socket)).toHaveLength(0);

  now = 200;
  await server.tick();
  expect(decodeReplicationFrame(binaryFrames(socket)[0]).kind).toBe("delta");
});

test("replication round-robin caps scheduled binary sends after initial snapshots", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 10, spread: "round-robin", maxClientsPerTick: 4 }
  });
  const sockets = await joinSocketClients(server, 12, "spread-cap");

  await server.tick();
  for (const socket of sockets) socket.clear();

  now = 100;
  await server.tick();

  expect(sockets.reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(4);
});

test("scheduled replication deltas are fair across active room buckets", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 10, spread: "round-robin", maxClientsPerTick: 2 }
  });
  const roomA = await joinSocketClients(server, 4, "bucket-a");
  const roomB = await joinSocketClients(server, 4, "bucket-b");

  await server.tick();
  for (const socket of [...roomA, ...roomB]) socket.clear();

  now = 100;
  await server.tick();

  expect(roomA.reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(1);
  expect(roomB.reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(1);
});

test("replication round-robin reaches every due client within configured cycle", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 10, spread: "round-robin", maxClientsPerTick: 4 }
  });
  const sockets = await joinSocketClients(server, 12, "spread-cycle");

  await server.tick();
  for (const socket of sockets) socket.clear();

  for (let i = 1; i <= 3; i += 1) {
    now = i * 100;
    await server.tick();
  }

  expect(sockets.every((socket) => binaryFrames(socket).length >= 1)).toBe(true);
  expect(sockets.reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(12);
});

test("direct scheduled cursor flag preserves round-robin cycle coverage", async () => {
  await withEnvFlag("ENGINE_SERVER_DIRECT_SCHEDULE_CURSOR", "1", async () => {
    let now = 0;
    const server = createAuthoritativeServer({
      transport: "websocket",
      port: 0,
      rooms: [createTestRoom()],
      now: () => now,
      replication: { snapshotRate: 1, deltaRate: 10, spread: "round-robin", maxClientsPerTick: 4 }
    });
    const sockets = await joinSocketClients(server, 12, "direct-spread-cycle");

    await server.tick();
    for (const socket of sockets) socket.clear();

    for (let i = 1; i <= 3; i += 1) {
      now = i * 100;
      await server.tick();
    }

    expect(sockets.every((socket) => binaryFrames(socket).length >= 1)).toBe(true);
    expect(sockets.reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(12);
  });
});

test("initial replication snapshot bypasses round-robin client cap once", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    now: () => now,
    replication: { snapshotRate: 1, deltaRate: 10, spread: "round-robin", maxClientsPerTick: 1 }
  });
  const sockets = await joinSocketClients(server, 4, "spread-initial");

  await server.tick();
  now = 100;
  await server.tick();
  for (const socket of sockets) socket.clear();

  const newcomer = testSocket();
  const join = await server.joinRoom({ roomId: "spread-initial", roomType: "field", token: "dev:spread-newcomer", connection: newcomer });
  expect(join.ok).toBe(true);
  now = 200;
  await server.tick();

  const newcomerFrame = decodeReplicationFrame(binaryFrames(newcomer)[0]);
  expect(newcomerFrame.kind).toBe("snapshot");
  expect([...sockets, newcomer].reduce((sum, socket) => sum + binaryFrames(socket).length, 0)).toBe(2);
});

test("budget-exhausted client does not consume a round-robin scheduler slot", async () => {
  let now = 0;
  const snapshotBytes = estimateMessageBytes(encodeSnapshot(counterSchema, { ticks: 1 })) + 10;
  const deltaBytes = estimateMessageBytes(encodeDelta(counterSchema, { ticks: 1 }, { ticks: 2 })) + 10;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createCounterRoom()],
    now: () => now,
    replication: {
      snapshotRate: 1,
      deltaRate: 10,
      maxBytesPerClientPerSecond: snapshotBytes + deltaBytes,
      spread: "round-robin",
      maxClientsPerTick: 1
    }
  });
  const exhausted = testSocket();
  const fresh = testSocket();

  expect((await server.joinRoom({ roomId: "budget-a", roomType: "counter", token: "dev:budget-a", connection: exhausted })).ok).toBe(true);
  await server.tick();
  now = 100;
  await server.tick();

  expect((await server.joinRoom({ roomId: "budget-b", roomType: "counter", token: "dev:budget-b", connection: fresh })).ok).toBe(true);
  now = 200;
  await server.tick();
  exhausted.clear();
  fresh.clear();

  now = 300;
  await server.tick();

  expect(binaryFrames(exhausted)).toHaveLength(0);
  expect(binaryFrames(fresh)).toHaveLength(1);
});

test("budget-exhausted client waits for delta interval before retrying", async () => {
  let now = 0;
  const snapshotBytes = estimateMessageBytes(encodeSnapshot(counterSchema, { ticks: 1 })) + 10;
  const deltaBytes = estimateMessageBytes(encodeDelta(counterSchema, { ticks: 1 }, { ticks: 2 })) + 10;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createCounterRoom()],
    now: () => now,
    replication: {
      snapshotRate: 1,
      deltaRate: 10,
      maxBytesPerClientPerSecond: snapshotBytes + deltaBytes
    }
  });
  const socket = testSocket();

  expect((await server.joinRoom({ roomId: "budget-retry", roomType: "counter", token: "dev:budget-retry", connection: socket })).ok).toBe(true);
  await server.tick();
  now = 100;
  await server.tick();
  socket.clear();

  now = 200;
  await server.tick();
  expect(binaryFrames(socket)).toHaveLength(0);
  expect(metricTotal(server.getStats().metrics, "replication.dropped_budget")).toBe(1);

  now = 250;
  await server.tick();
  expect(binaryFrames(socket)).toHaveLength(0);
  expect(metricTotal(server.getStats().metrics, "replication.dropped_budget")).toBe(1);
});

test("authoritative server rejects joins over room capacity and disposes idle rooms", async () => {
  let now = 0;
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom({ maxPlayers: 1, idleDisposeMs: 10 })],
    now: () => now
  });

  const first = await server.joinRoom({ roomId: "field-2", token: "dev:a", roomType: "field" });
  const second = await server.joinRoom({ roomId: "field-2", token: "dev:b", roomType: "field" });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(false);

  await server.leavePlayer(first.player!.id);
  now = 20;
  await server.tick();
  expect(server.rooms()).toHaveLength(0);
});

test("server can tick 100 rooms without DOM globals", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()] });
  for (let i = 0; i < 100; i += 1) server.createRoom("field", `room-${i.toString().padStart(3, "0")}`);

  await server.tick();

  expect(server.rooms().every((room) => requireTestState(room.ctx.state).ticks === 1)).toBe(true);
});
