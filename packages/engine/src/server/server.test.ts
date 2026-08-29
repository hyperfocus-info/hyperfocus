import { expect, test } from "bun:test";
import { defineSchema } from "../protocol/schema.ts";
import { createDevAuthAdapter } from "./core/auth.ts";
import { createRoomType } from "./core/room-type.ts";
import type { AuthoritativeRoom } from "./core/room.ts";
import { createAuthoritativeServer as createAuthoritativeServerBase, type AuthoritativeServerOptions } from "./server.ts";
import { createServerClock } from "./core/clock.ts";
import { createPersistenceAdapter } from "./services/persistence.ts";

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
    throw new Error("Expected authoritative test room state");
  }
  return {
    joined: [...Reflect.get(value, "joined")],
    inputs: Reflect.get(value, "inputs"),
    ticks: Reflect.get(value, "ticks"),
  };
}

function requireInputState(value: unknown) {
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "inputs") !== "number") {
    throw new Error("Expected authoritative input test room state");
  }
  return { inputs: Reflect.get(value, "inputs") };
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
  expect(errors[0]).toBeInstanceOf(Error);
  if (!(errors[0] instanceof Error)) throw new Error("Expected the clock error callback to receive an Error");
  expect(errors[0].message).toBe("tick failed");
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
  let room: AuthoritativeRoom | undefined;
  const roomType = createRoomType<{ inputs: number }, Input, Event>({
    name: "reentrant-guard",
    schema: defineSchema<{ inputs: number }>({ inputs: "u16" }),
    createState: () => ({ inputs: 0 }),
    onInput(ctx) {
      ctx.state.inputs += 1;
    },
    async onEvent(_ctx, player) {
      if (!room) throw new Error("Expected the reentrant room fixture to be initialized");
      await room.input(player.id, { value: 1 });
    }
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType] });
  room = server.createRoom("reentrant-guard", "reentrant");
  const joined = await server.joinRoom({ roomId: room.id, token: "dev:reentrant" });

  await expect(server.receiveEvent(joined.player!.id, { nested: true })).rejects.toThrow("reentrant operation");
  await expect(server.receiveInput(joined.player!.id, { value: 2 })).resolves.toBe(true);
  expect(requireInputState(room.ctx.state).inputs).toBe(1);
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
  const state = requireTestState(room.ctx.state);
  expect(state.inputs).toBe(1);
  expect(state.ticks).toBe(1);

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

test("periodic room checkpoints are coalesced outside the simulation update", async () => {
  let now = 0;
  let releaseSave!: () => void;
  let markSaveStarted!: () => void;
  const savePending = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  let saves = 0;
  const roomType = createRoomType<{ ticks: number }>({
    name: "background-checkpoint",
    schema: defineSchema<{ ticks: number }>({ ticks: "u16" }),
    persistRoomIntervalMs: 1,
    createState: () => ({ ticks: 0 }),
    update(ctx) {
      ctx.state.ticks += 1;
    }
  });
  const server = createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [roomType],
    now: () => now,
    persistence: createPersistenceAdapter({
      async saveRoom() {
        saves += 1;
        if (saves === 1) {
          markSaveStarted();
          await savePending;
        }
      }
    })
  });
  server.createRoom("background-checkpoint", "background-checkpoint");
  now = 2;

  await expect(server.tick()).resolves.toBeUndefined();
  await saveStarted;
  releaseSave();
  await server.stop();
  expect(saves).toBeGreaterThanOrEqual(2);
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
