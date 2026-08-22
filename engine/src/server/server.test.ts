import { expect, test } from "bun:test";
import { createProtocolMessage, decodeMultipartReplicationEnvelope, decodeReplicationFrame, decodeSnapshot, defineSchema, encodeDelta, encodeProtocolMessage, encodeSnapshot, estimateMessageBytes, parseProtocolMessage, type ProtocolMessage } from "../protocol/index.ts";
import {
  createAuthoritativeServer as createAuthoritativeServerBase,
  type AuthoritativeServer,
  type AuthoritativeServerOptions,
  createDevAuthAdapter,
  createInterestGrid,
  createMmo1000Preset,
  createMmoInterestGrid,
  createPersistenceAdapter,
  createHttpShardHandoffTransport,
  createRoomType,
  createServerClock,
  createServerMetrics,
  createShardRouter,
  selectTransientEffectsForViewer,
  spawnTransientEffect,
  updateTransientEffects,
  type AuthoritativeRoom,
  type AuthAdapter,
  type CompactTransientEffect
} from "./index.ts";

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
    canJoin: (ctx) => ctx.players.size < (options.maxPlayers ?? 100),
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

test("server clock advances fixed ticks and caps catch-up", () => {
  let now = 0;
  let ticks = 0;
  const clock = createServerClock({ tickRate: 10, maxCatchUpTicks: 2, now: () => now, onTick: () => { ticks += 1; } });

  now = 100;
  expect(clock.advance(now)).toBe(1);
  now = 1000;
  expect(clock.advance(now)).toBe(2);
  expect(ticks).toBe(3);
});

test("server clock rejects invalid configuration and timestamps without poisoning state", () => {
  expect(() => createServerClock({ maxCatchUpTicks: Number.MAX_VALUE })).toThrow("safe integer");
  expect(() => createServerClock({ now: () => Number.NaN })).toThrow("time must be finite");

  let now = 0;
  const clock = createServerClock({ tickRate: 10, now: () => now });
  expect(() => clock.advance(Number.POSITIVE_INFINITY)).toThrow("time must be finite");
  expect(clock.getStats().tick).toBe(0);
  now = 100;
  expect(clock.advance()).toBe(1);
  expect(clock.getStats().tick).toBe(1);
});

test("server clock serializes async callbacks and reports rejections", async () => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const started: number[] = [];
  const errors: unknown[] = [];
  const clock = createServerClock({
    tickRate: 10,
    maxCatchUpTicks: 3,
    backlogPolicy: "queue",
    now: () => 0,
    onTick({ tick }) {
      started.push(tick);
      if (tick === 1) return firstPending;
      if (tick === 2) return Promise.reject(new Error("tick failed"));
    },
    onError(error) {
      errors.push(error);
    }
  });

  expect(clock.advance(300)).toBe(3);
  expect(started).toEqual([1]);
  releaseFirst();
  await Bun.sleep(0);

  expect(started).toEqual([1, 2, 3]);
  expect(errors).toHaveLength(1);
  expect((errors[0] as Error).message).toBe("tick failed");
});

test("server clock coalesces async backlog by default", async () => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const started: number[] = [];
  const clock = createServerClock({
    tickRate: 10,
    maxCatchUpTicks: 3,
    now: () => 0,
    onTick({ tick }) {
      started.push(tick);
      if (tick === 1) return firstPending;
    }
  });

  clock.advance(300);
  expect(started).toEqual([1]);
  expect(clock.getStats()).toMatchObject({ pendingTicks: 1, coalescedTicks: 1, droppedTicks: 0, backlogPolicy: "coalesce" });
  releaseFirst();
  await Bun.sleep(0);
  expect(started).toEqual([1, 3]);
});

test("stopping a server clock discards queued async callbacks", async () => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const started: number[] = [];
  const clock = createServerClock({
    tickRate: 10,
    maxCatchUpTicks: 3,
    now: () => 0,
    onTick({ tick }) {
      started.push(tick);
      if (tick === 1) return firstPending;
    }
  });

  clock.advance(300);
  expect(started).toEqual([1]);
  clock.stop();
  releaseFirst();
  await Bun.sleep(0);

  expect(started).toEqual([1]);
});

test("authoritative server requires explicit development auth", async () => {
  const server = createAuthoritativeServerBase({ transport: "websocket", port: 0, rooms: [createTestRoom()] });

  await expect(server.joinRoom({ token: "dev:implicit" })).resolves.toMatchObject({
    ok: false,
    reason: "auth adapter required outside dev mode"
  });
  await server.stop();
});

test("development auth rejects empty user ids during refresh", async () => {
  const auth = createDevAuthAdapter();
  await expect(auth.refresh!("session:")).resolves.toMatchObject({ ok: false, reason: "session missing user id" });
});

test("authoritative server serializes direct async ticks", async () => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let active = 0;
  let maxActive = 0;
  let updates = 0;
  const roomType = createRoomType<{ ticks: number }>({
    name: "async-tick",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    async update(ctx) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      updates += 1;
      if (updates === 1) await firstPending;
      ctx.state.ticks += 1;
      active -= 1;
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  server.createRoom("async-tick", "serialized");

  const first = server.tick();
  const second = server.tick();
  await Bun.sleep(0);
  expect(maxActive).toBe(1);
  expect(updates).toBe(1);
  releaseFirst();
  await Promise.all([first, second]);

  expect(updates).toBe(2);
  expect(maxActive).toBe(1);
  await server.stop();
});

test("room callbacks execute in invocation order across async boundaries", async () => {
  let releaseUpdate!: () => void;
  let markUpdateStarted!: () => void;
  const updatePending = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  const updateStarted = new Promise<void>((resolve) => {
    markUpdateStarted = resolve;
  });
  const order: string[] = [];
  const roomType = createRoomType<{ ticks: number }, { value: number }, { value: number }>({
    name: "ordered-ops",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    async update(ctx) {
      order.push("update:start");
      markUpdateStarted();
      await updatePending;
      ctx.state.ticks += 1;
      order.push("update:end");
    },
    onInput() {
      order.push("input");
    },
    onEvent() {
      order.push("event");
    },
    onLeave() {
      order.push("leave");
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  const joined = await server.joinRoom({ roomId: "ordered", roomType: "ordered-ops", token: "dev:ordered" });
  const ticking = server.tick();
  await updateStarted;
  const input = server.receiveInput(joined.player!.id, { value: 1 });
  const event = server.receiveEvent(joined.player!.id, { value: 2 });
  const leaving = server.leavePlayer(joined.player!.id);

  await Bun.sleep(0);
  expect(order).toEqual(["update:start"]);
  releaseUpdate();
  await Promise.all([ticking, input, event, leaving]);

  expect(order).toEqual(["update:start", "update:end", "input", "event", "leave"]);
  await server.stop();
});

test("reentrant room operations reject promptly without poisoning the queue", async () => {
  type Input = { value: number };
  type Event = { nested: boolean };
  let room!: AuthoritativeRoom<{ inputs: number }, Input, Event>;
  const roomType = createRoomType<{ inputs: number }, Input, Event>({
    name: "reentrant-guard",
    schema: defineSchema<{ inputs: number }>({ inputs: "u16" }),
    createState: () => ({ inputs: 0 }),
    onInput(ctx) {
      ctx.state.inputs += 1;
    },
    async onEvent(_ctx, player) {
      await room.input(player.id, { value: 1 });
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  room = server.createRoom("reentrant-guard", "reentrant") as AuthoritativeRoom<{ inputs: number }, Input, Event>;
  const joined = await server.joinRoom({ roomId: room.id, token: "dev:reentrant" });

  await expect(server.receiveEvent(joined.player!.id, { nested: true })).rejects.toThrow("reentrant operation");
  await expect(server.receiveInput(joined.player!.id, { value: 2 })).resolves.toBe(true);
  expect(room.ctx.state.inputs).toBe(1);
  await server.stop();
});

test("replication callbacks queue behind active room updates", async () => {
  let releaseUpdate!: () => void;
  let markStarted!: () => void;
  const pending = new Promise<void>((resolve) => { releaseUpdate = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const order: string[] = [];
  const roomType = createRoomType<{ ticks: number }>({
    name: "replication-lock",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    async update(ctx) {
      order.push("update:start");
      markStarted();
      await pending;
      ctx.state.ticks += 1;
      order.push("update:end");
    },
    onReplicationAck() {
      order.push("ack");
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  const joined = await server.joinRoom({ roomId: "replication-lock", token: "dev:locked" });
  const ticking = server.tick();
  await started;

  expect(() => joined.room!.replicationAck(joined.player!.id, 1)).toThrow("active operation");
  const acknowledgement = joined.room!.runExclusive(() => joined.room!.replicationAck(joined.player!.id, 1));
  await Bun.sleep(0);
  expect(order).toEqual(["update:start"]);
  releaseUpdate();
  await Promise.all([ticking, acknowledgement]);
  expect(order).toEqual(["update:start", "update:end", "ack"]);
  await server.stop();
});

test("idle disposal rechecks admission atomically after queued joins", async () => {
  let releaseUpdate!: () => void;
  let markStarted!: () => void;
  const pending = new Promise<void>((resolve) => { releaseUpdate = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const roomType = createRoomType<{ ticks: number }>({
    name: "idle-race",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    idleDisposeMs: 0,
    createState: () => ({ ticks: 0 }),
    async update() {
      markStarted();
      await pending;
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType], now: () => 100 });
  const originalRoom = server.createRoom("idle-race", "idle-race-room");
  const ticking = server.tick();
  await started;
  const joining = server.joinRoom({ roomId: originalRoom.id, token: "dev:idle-race" });
  await Bun.sleep(0);
  releaseUpdate();
  const [joined] = await Promise.all([joining, ticking]);

  expect(joined.ok).toBe(true);
  expect(joined.room).toBe(originalRoom);
  expect(server.rooms()).toContain(originalRoom);
  expect(originalRoom.ctx.players.size).toBe(1);
  await server.stop();
});

test("stable room order flag keeps deterministic tick order after room changes", async () => {
  await withEnvFlag("ENGINE_SERVER_STABLE_ROOM_ORDER", "1", async () => {
    const order: string[] = [];
    const roomType = createRoomType<{ ticks: number }>({
      name: "field",
      schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
      createState: () => ({ ticks: 0 }),
      update(ctx) {
        ctx.state.ticks += 1;
        order.push(ctx.roomId);
      }
    });
    const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType], now: () => 0 });
    server.createRoom("field", "z-room");
    server.createRoom("field", "a-room");

    await server.tick();
    expect(order).toEqual(["a-room", "z-room"]);

    order.length = 0;
    server.createRoom("field", "m-room");
    await server.tick();
    expect(order).toEqual(["a-room", "m-room", "z-room"]);
  });
});

test("authoritative server can create worker-hosted rooms", () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()] });
  const room = server.createRoom({ roomType: "field", roomId: "worker-field", worker: true, sharedBufferBytes: 128, tickRate: 20 });

  expect(room.id).toBe("worker-field");
  expect(server.workerRooms()).toHaveLength(1);
  expect(server.workerRooms()[0].sharedBuffer.byteLength).toBe(128);
  expect(server.getStats().workerRooms[0]).toMatchObject({ roomId: "worker-field", tickRate: 20, workerAttached: false });
  server.stop();
});

test("authoritative server handles lifecycle, input, duplicate login, and persistence", async () => {
  const persistence = createPersistenceAdapter();
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createTestRoom()],
    persistence,
    auth: createDevAuthAdapter()
  });
  const room = server.createRoom("field", "field-1");
  const first = await server.joinRoom({ roomId: "field-1", token: "dev:alice" });

  expect(first.ok).toBe(true);
  expect(room.ctx.players.size).toBe(1);
  expect(await server.receiveInput(first.player!.id, { move: 1 })).toBe(true);

  const second = await server.joinRoom({ roomId: "field-1", token: "dev:alice" });
  expect(second.ok).toBe(true);
  expect(server.presence.count()).toBe(1);

  await server.tick();
  expect((room.ctx.state as TestState).inputs).toBe(1);
  expect((room.ctx.state as TestState).ticks).toBe(1);

  await server.leavePlayer(second.player!.id);
  expect(await persistence.loadPlayer("alice")).not.toBeNull();
  expect(await persistence.loadPlayer(second.player!.id)).toBeNull();
});

test("rooms restore saved state and persist a final snapshot during shutdown", async () => {
  const persistence = createPersistenceAdapter();
  await persistence.saveRoom("restored", { ticks: 7 });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createCounterRoom()],
    persistence
  });
  const room = server.createRoom("counter", "restored");

  await room.ready();
  expect(room.ctx.state).toEqual({ ticks: 7 });
  await server.tick();
  await server.stop();

  await expect(persistence.loadRoom("restored")).resolves.toEqual({ ticks: 8 });
});

test("room initialization failures reject operations without blocking shutdown", async () => {
  const persistence = createPersistenceAdapter({
    async loadRoom() {
      throw new Error("room load failed");
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createCounterRoom()],
    persistence
  });
  const room = server.createRoom("counter", "broken-load");

  await expect(room.ready()).rejects.toThrow("room load failed");
  await expect(server.joinRoom({ roomId: "broken-load", roomType: "counter", token: "dev:blocked" })).rejects.toThrow("room load failed");
  await expect(server.tick()).rejects.toThrow("room load failed");
  await expect(server.stop()).resolves.toBeUndefined();
  expect(metricTotal(server.getStats().metrics, "persistence.load_room_error")).toBe(1);
});

test("room disposal surfaces final persistence failure and still runs cleanup", async () => {
  let disposed = false;
  const persistence = createPersistenceAdapter({
    async saveRoom() {
      throw new Error("storage unavailable");
    }
  });
  const roomType = createRoomType<{ ticks: number }>({
    name: "failed-final-save",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    onDispose() {
      disposed = true;
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType], persistence });
  const room = server.createRoom("failed-final-save", "failed-final-save");
  await room.ready();

  await expect(room.dispose()).rejects.toThrow("final persistence failed");
  expect(disposed).toBe(true);
  expect(metricTotal(server.getStats().metrics, "persistence.save_room_error")).toBe(1);
  await expect(server.stop()).resolves.toBeUndefined();
  expect(server.rooms()).toHaveLength(0);
});

test("authoritative server validates numeric options and stops accepting work", async () => {
  expect(() => createAuthoritativeServer({ transport: "websocket", port: -1, rooms: [createTestRoom()] })).toThrow("port");
  expect(() => createAuthoritativeServer({ transport: "websocket", port: 0, tickRate: Number.NaN, rooms: [createTestRoom()] })).toThrow("tickRate");
  expect(() => createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()], replication: { deltaRate: 0 } })).toThrow("deltaRate");

  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()] });
  await expect(server.tick(Number.POSITIVE_INFINITY)).rejects.toThrow("non-negative finite");
  await server.stop();
  expect(() => server.createRoom("field", "after-stop")).toThrow("stopped");
  await expect(server.joinRoom({ token: "dev:after-stop" })).resolves.toMatchObject({ ok: false, reason: "server stopping" });
  await expect(server.receiveInput("missing", {})).resolves.toBe(false);
});

test("server shutdown waits for queued room work and final persistence", async () => {
  let releaseUpdate!: () => void;
  let markUpdateStarted!: () => void;
  const updatePending = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  const updateStarted = new Promise<void>((resolve) => {
    markUpdateStarted = resolve;
  });
  const order: string[] = [];
  const savedRooms: unknown[] = [];
  const persistence = createPersistenceAdapter({
    async saveRoom(_roomId, snapshot) {
      order.push("persist");
      savedRooms.push(snapshot);
    }
  });
  const roomType = createRoomType<{ ticks: number }, { value: number }>({
    name: "shutdown-order",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    async update(ctx) {
      order.push("update:start");
      markUpdateStarted();
      await updatePending;
      ctx.state.ticks += 1;
      order.push("update:end");
    },
    onInput() {
      order.push("input");
    },
    onLeave() {
      order.push("leave");
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType], persistence });
  const joined = await server.joinRoom({ roomId: "shutdown", roomType: "shutdown-order", token: "dev:shutdown" });
  const ticking = server.tick();
  await updateStarted;
  const input = server.receiveInput(joined.player!.id, { value: 1 });
  let stopped = false;
  const shutdown = server.stop().then(() => {
    stopped = true;
  });

  await Bun.sleep(0);
  expect(stopped).toBe(false);
  expect(order).toEqual(["update:start"]);
  releaseUpdate();
  await Promise.all([ticking, input, shutdown]);

  expect(order).toEqual(["update:start", "update:end", "input", "leave", "persist"]);
  expect(savedRooms.at(-1)).toEqual({ ticks: 1 });
  expect(server.rooms()).toHaveLength(0);
});

test("failed joins roll back membership and concurrent joins cannot exceed capacity", async () => {
  let releaseJoin!: () => void;
  const joinPending = new Promise<void>((resolve) => {
    releaseJoin = resolve;
  });
  let calls = 0;
  const roomType = createRoomType<{ joined: number }>({
    name: "atomic-join",
    schema: defineSchema<{ joined: number }>({ joined: "u16" }),
    maxPlayers: 1,
    createState: () => ({ joined: 0 }),
    async onJoin(ctx) {
      calls += 1;
      if (calls === 1) await joinPending;
      ctx.state.joined += 1;
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });

  const first = server.joinRoom({ roomId: "atomic", roomType: "atomic-join", token: "dev:first" });
  const second = server.joinRoom({ roomId: "atomic", roomType: "atomic-join", token: "dev:second" });
  await Bun.sleep(0);
  releaseJoin();
  const results = await Promise.all([first, second]);

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(server.rooms()[0].ctx.players.size).toBe(1);
  await server.stop();

  const failingType = createRoomType<{ attempts: number }>({
    name: "failing-join",
    schema: defineSchema<{ attempts: number }>({ attempts: "u16" }),
    createState: () => ({ attempts: 0 }),
    onJoin(ctx) {
      ctx.state.attempts += 1;
      throw new Error("join hook failed");
    }
  });
  const failingServer = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [failingType] });
  await expect(failingServer.joinRoom({ roomId: "failing", roomType: "failing-join", token: "dev:failure" })).rejects.toThrow("join hook failed");
  expect(failingServer.rooms()[0].ctx.players.size).toBe(0);
  expect(failingServer.presence.count()).toBe(0);
  await failingServer.stop();
});

test("concurrent duplicate logins cannot leave ghost room members", async () => {
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [createTestRoom()] });
  const firstSocket = testSocket();
  const secondSocket = testSocket();

  const [first, second] = await Promise.all([
    server.joinRoom({ roomId: "duplicate-race", roomType: "field", token: "dev:same-user", connection: firstSocket }),
    server.joinRoom({ roomId: "duplicate-race", roomType: "field", token: "dev:same-user", connection: secondSocket })
  ]);

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(server.presence.count()).toBe(1);
  expect(server.rooms()[0].ctx.players.size).toBe(1);
  await server.stop();
});

test("a connection can join only once and room broadcasts reach joined sockets", async () => {
  type BroadcastEvent = { kind: string; tick: number };
  const roomType = createRoomType<{ ticks: number }, unknown, BroadcastEvent>({
    name: "broadcast-room",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
      ctx.broadcast({ kind: "tick", tick: ctx.state.ticks });
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

  const event = socket.sent
    .filter((message): message is string => typeof message === "string")
    .map((message) => parseProtocolMessage(message))
    .find((message) => message.type === "event");
  expect(event).toMatchObject({ type: "event", roomId: "broadcast", payload: { kind: "tick", tick: 1 } });
  expect(persistedEvents).toEqual([{ roomId: "broadcast", roomType: "broadcast-room", at: expect.any(Number), event: { kind: "tick", tick: 1 } }]);
  expect(server.presence.count()).toBe(1);
  await server.stop();
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
    expect((victim.room!.ctx.state as TestState).inputs).toBe(0);

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
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); } };
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
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); } };
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
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); } };
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
  const socket = { send: (data: string | Uint8Array) => { sent.push(data); } };
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

  expect(server.rooms().every((room) => (room.ctx.state as TestState).ticks === 1)).toBe(true);
});

test("interest grid filters visibility, tracks enter leave, and caps overflow", () => {
  const grid = createInterestGrid({ cellSize: 10, maxEntitiesPerClient: 2, hysteresisCells: 1 });
  grid.upsert({ id: "near", x: 1, y: 1, priority: 1 });
  grid.upsert({ id: "far", x: 100, y: 100 });
  grid.upsert({ id: "global", x: 999, y: 999, global: true, priority: 2 });

  const first = grid.computeVisibility("client", { x: 0, y: 0, radius: 5 });
  expect(first.visible).toEqual(["global", "near"]);
  expect(first.entered).toEqual(["global", "near"]);

  grid.remove("near");
  const second = grid.computeVisibility("client", { x: 0, y: 0, radius: 5 });
  expect(second.left).toEqual(["near"]);
});

test("interest grid removes entities from packed cell zero", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "origin", x: 1, y: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["origin"]);
  expect(grid.remove("origin")).toBe(true);
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
});

test("interest grid moves entities and toggles global visibility without stale cells", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "mover", x: 1, y: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 101, y: 101 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
  expect(grid.query({ x: 100, y: 100, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 500, y: 500, global: true });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["mover"]);

  grid.upsert({ id: "mover", x: 101, y: 101 });
  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual([]);
  expect(grid.query({ x: 100, y: 100, radius: 5 })).toEqual(["mover"]);
});

test("interest grid caps low-priority effect types without dropping combat actors", () => {
  const grid = createInterestGrid({ cellSize: 10, maxEntitiesPerClient: 6, maxEntitiesPerClientByType: { hazard: 2 } });
  grid.upsert({ id: "player", type: "player", x: 0, y: 0, priority: 100 });
  grid.upsert({ id: "boss", type: "npc", x: 1, y: 0, priority: 80 });
  for (let i = 0; i < 6; i += 1) {
    grid.upsert({ id: `hazard-${i}`, type: "hazard", x: 2 + i, y: 0, priority: 40 - i });
  }

  const visible = grid.query({ x: 0, y: 0, radius: 20 });

  expect(visible).toContain("player");
  expect(visible).toContain("boss");
  expect(visible.filter((id) => id.startsWith("hazard-"))).toEqual(["hazard-0", "hazard-1"]);
});

test("interest grid includes large-radius entities whose centers are outside the target radius", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "wide-hazard", type: "hazard", x: 40, y: 0, radius: 35, priority: 1 });

  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual(["wide-hazard"]);

  grid.upsert({ id: "wide-hazard", type: "hazard", x: 40, y: 0, radius: 1, priority: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual([]);
});

test("interest grid tracks same-cell radius growth", () => {
  const grid = createInterestGrid({ cellSize: 10 });
  grid.upsert({ id: "growing-hazard", type: "hazard", x: 40, y: 0, radius: 1, priority: 1 });
  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual([]);

  grid.upsert({ id: "growing-hazard", type: "hazard", x: 40, y: 0, radius: 35, priority: 1 });

  expect(grid.query({ x: 0, y: 0, radius: 10 })).toEqual(["growing-hazard"]);
});

test("interest grid rejects non-finite geometry and ignores inherited type caps", () => {
  expect(() => createInterestGrid({ cellSize: 0 })).toThrow("positive finite");
  expect(() => createInterestGrid({ maxEntitiesPerClient: -1 })).toThrow("non-negative safe integer");
  const grid = createInterestGrid({ maxEntitiesPerClient: 2, maxEntitiesPerClientByType: { hazard: 1 } });
  grid.upsert({ id: "constructor-entity", type: "constructor", x: 0, y: 0 });
  grid.upsert({ id: "hazard", type: "hazard", x: 1, y: 0 });

  expect(grid.query({ x: 0, y: 0, radius: 5 })).toEqual(["constructor-entity", "hazard"]);
  expect(() => grid.upsert({ id: "invalid", x: Number.POSITIVE_INFINITY, y: 0 })).toThrow("position must be finite");
  expect(() => grid.query({ x: 0, y: 0, radius: Number.POSITIVE_INFINITY })).toThrow("must be finite");
});

test("transient effect lane decays and selects compact AOI-capped effects", () => {
  const lane: CompactTransientEffect[] = [];
  for (let i = 0; i < 8; i += 1) {
    spawnTransientEffect(lane, {
      id: `fx-${i}`,
      kind: "line",
      zoneId: "arena",
      x: i * 8,
      y: 0,
      toX: i * 8 + 20,
      toY: 0,
      radius: 4,
      lifetimeMs: 100,
      effectKind: "arrow",
      priority: i
    });
  }

  expect(selectTransientEffectsForViewer(lane, { x: 0, y: 0, radius: 80, zoneId: "arena" }, { maxEffects: 3 }).map((effect) => effect.id)).toEqual(["fx-7", "fx-6", "fx-5"]);

  const reusable = lane[lane.length - 1];
  updateTransientEffects(lane, 0.11);
  expect(lane).toHaveLength(0);
  spawnTransientEffect(lane, {
    id: "fx-reuse",
    kind: "aoe",
    zoneId: "arena",
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
    radius: 8,
    lifetimeMs: 100,
    effectKind: "burst"
  });
  expect(lane[0]).toBe(reusable);
  expect(lane[0].id).toBe("fx-reuse");
});

test("metrics and shard router expose operational primitives", async () => {
  const metrics = createServerMetrics();
  metrics.record("tick_ms", 2);
  metrics.increment("auth_fail");
  const router = createShardRouter({
    strategy: "static-grid",
    zones: [{ id: "zone-a", roomId: "room-a", x: 0, y: 0, w: 10, h: 10 }]
  });

  expect(metrics.summary("tick_ms")?.latest).toBe(2);
  expect(router.route({ x: 5, y: 5 })?.roomId).toBe("room-a");
  await expect(router.handoff("player-1", "room-old", { id: "zone-b", roomId: "room-b" }, { hp: 3 })).resolves.toMatchObject({
    ok: true,
    playerId: "player-1",
    fromRoomId: "room-old",
    toRoomId: "room-b",
    state: { hp: 3 }
  });
});

test("server metrics distinguish gauges and cap series cardinality", () => {
  const metrics = createServerMetrics({ maxSeries: 2, maxTags: 1, maxTagLength: 8 });
  metrics.gauge("rooms", 2);
  metrics.gauge("rooms", 3);
  metrics.increment("joins", 1);
  metrics.increment("joins", 2);
  metrics.observe("overflow", 4);
  metrics.observe("tagged", 1, { room: "name-too-long" });

  expect(metrics.summary("rooms")).toMatchObject({ kind: "gauge", count: 2, latest: 3, total: 3 });
  expect(metrics.summary("joins")).toMatchObject({ kind: "counter", count: 2, latest: 3, total: 3 });
  expect(metrics.diagnostics()).toEqual({ series: 2, maxSeries: 2, droppedSeries: 1, rejectedTags: 1 });
});

test("shard router supports remote handoff transport and timeout failures", async () => {
  const target = { id: "zone-b", roomId: "room-b", endpoint: "https://shard-b.test" };
  const remote = createHttpShardHandoffTransport({
    fetch: async (request) => {
      expect(String(request)).toBe("https://shard-b.test/shard/handoff");
      return Response.json({ ok: true, state: { loaded: true } });
    }
  });
  const router = createShardRouter({
    strategy: "room-label",
    zones: [{ ...target, label: "east" }],
    transport: remote
  });

  await expect(router.handoff("player-1", "room-a", target, { loaded: false })).resolves.toMatchObject({
    ok: true,
    toRoomId: "room-b",
    state: { loaded: true }
  });

  const stalled = createShardRouter({
    strategy: "room-label",
    zones: [target],
    handoffTimeoutMs: 1,
    transport: {
      handoff: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, playerId: "late", fromRoomId: "late", toRoomId: "late", target, state: null }), 50))
    }
  });

  await expect(stalled.handoff("player-2", "room-a", target, { x: 1 })).resolves.toMatchObject({
    ok: false,
    reason: "shard handoff timed out",
    playerId: "player-2",
    toRoomId: "room-b"
  });
});
