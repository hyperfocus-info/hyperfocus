import { expect, test } from "bun:test";
import { defineSchema } from "../../protocol/schema.ts";
import { createRoomType } from "../core/room-type.ts";
import { createMmo1000Preset, createMmoInterestGrid } from "./scaling.ts";
import { createAuthoritativeServer, type AuthoritativeServer } from "../server.ts";

type BenchState = { tick: number; players: number };
type CountingSocket = {
  sent: number;
  bytes: number;
  send(data: string | Uint8Array): void;
  close(): void;
  clear(): void;
};

const benchSchema = defineSchema<BenchState>({ tick: "u16", players: "u16" });

function percentile(samples: readonly number[], quantile: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function createCountingSocket(): CountingSocket {
  return {
    sent: 0,
    bytes: 0,
    send(data) {
      this.sent += 1;
      if (data instanceof Uint8Array) this.bytes += data.byteLength;
      else this.bytes += data.length;
    },
    close() {},
    clear() {
      this.sent = 0;
      this.bytes = 0;
    }
  };
}

function createBenchRoomType() {
  return createRoomType<BenchState>({
    name: "bench-field",
    schema: benchSchema,
    createState: () => ({ tick: 0, players: 0 }),
    onJoin(ctx) {
      ctx.state.players = ctx.players.size;
    },
    onLeave(ctx) {
      ctx.state.players = ctx.players.size;
    },
    update(ctx) {
      ctx.state.tick += 1;
      ctx.state.players = ctx.players.size;
    },
    getSnapshot(ctx) {
      return { tick: ctx.state.tick, players: ctx.players.size };
    }
  });
}

function createBenchServer(now?: () => number) {
  return createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    rooms: [createBenchRoomType()],
    devMode: true,
    now,
    scale: createMmo1000Preset({ publicRoomType: "bench-field", publicRoomPrefix: "bench-field", publicRooms: 10 })
  });
}

function managedLoads(server: AuthoritativeServer) {
  return server
    .rooms()
    .filter((room) => room.id.startsWith("bench-field-"))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room) => room.ctx.players.size);
}

async function joinImplicit(server: AuthoritativeServer, count: number, prefix: string, sockets?: CountingSocket[]) {
  for (let i = 0; i < count; i += 1) {
    const join = await server.joinRoom({ token: `dev:${prefix}-${i}`, connection: sockets?.[i] });
    expect(join.ok).toBe(true);
  }
}

test("MMO 1000 admission joins under target and fills evenly", async () => {
  const samples: number[] = [];
  let bestServer: AuthoritativeServer | undefined;
  let bestPrefix = "";
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 5; run += 1) {
    const server = createBenchServer();
    const prefix = `admit-${run}`;
    const start = performance.now();
    await joinImplicit(server, 1000, prefix);
    const elapsed = performance.now() - start;
    samples.push(elapsed);
    if (elapsed < best) {
      best = elapsed;
      bestServer = server;
      bestPrefix = prefix;
    }
  }

  expect(percentile(samples, 0.95)).toBeLessThan(250);
  const loads = managedLoads(bestServer!);
  expect(Math.max(...loads)).toBe(100);
  expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  expect(await bestServer!.joinRoom({ token: "dev:overflow" })).toMatchObject({ ok: false, reason: "world full" });

  const before = bestServer!.presence.count();
  expect((await bestServer!.joinRoom({ token: `dev:${bestPrefix}-42` })).ok).toBe(true);
  expect(bestServer!.presence.count()).toBe(before);
  expect(Math.max(...managedLoads(bestServer!))).toBe(100);
});

test("MMO 1000 warm tick stays under target without sockets", async () => {
  const server = createBenchServer();
  await joinImplicit(server, 1000, "warm");
  for (let warmup = 0; warmup < 3; warmup += 1) await server.tick();

  const samples: number[] = [];
  for (let run = 0; run < 9; run += 1) {
    const start = performance.now();
    await server.tick();
    samples.push(performance.now() - start);
  }

  expect(percentile(samples, 0.95)).toBeLessThan(50);
});

test("MMO 1000 fake sockets get immediate snapshots and fair scheduled deltas", async () => {
  let now = 0;
  const sockets = Array.from({ length: 1000 }, () => createCountingSocket());
  const server = createBenchServer(() => now);
  await joinImplicit(server, 1000, "socket", sockets);

  await server.tick();
  expect(sockets.every((socket) => socket.sent === 1)).toBe(true);
  for (const socket of sockets) socket.clear();

  now = 100;
  const samples: number[] = [];
  const start = performance.now();
  await server.tick();
  samples.push(performance.now() - start);
  const firstScheduledSends = sockets.reduce((sum, socket) => sum + socket.sent, 0);
  expect(firstScheduledSends).toBeGreaterThan(0);
  expect(firstScheduledSends).toBeLessThanOrEqual(100);

  for (let step = 2; step <= 11; step += 1) {
    now = step * 100;
    const tickStart = performance.now();
    await server.tick();
    samples.push(performance.now() - tickStart);
  }

  expect(percentile(samples, 0.95)).toBeLessThan(50);

  const totalScheduledSends = sockets.reduce((sum, socket) => sum + socket.sent, 0);
  expect(sockets.every((socket) => socket.sent >= 1)).toBe(true);
  expect(totalScheduledSends).toBeGreaterThanOrEqual(1000);
  expect(totalScheduledSends).toBeLessThanOrEqual(1100);
});

test("MMO interest snapshots handle 100 players and 10k entities under target", () => {
  const grid = createMmoInterestGrid();
  for (let i = 0; i < 10000; i += 1) {
    grid.upsert({ id: `e${i}`, x: (i % 100) * 16, y: Math.floor(i / 100) * 16, priority: i % 64 });
  }

  for (let warmup = 0; warmup < 3; warmup += 1) {
    for (let i = 0; i < 100; i += 1) {
      grid.computeVisibility(`warm-${warmup}-${i}`, { x: (i % 10) * 128, y: Math.floor(i / 10) * 128, radius: 256 });
    }
  }
  const samples: number[] = [];
  for (let run = 0; run < 9; run += 1) {
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) {
      const snapshot = grid.computeVisibility(`client-${run}-${i}`, { x: (i % 10) * 128, y: Math.floor(i / 10) * 128, radius: 256 });
      expect(snapshot.visible.length).toBeLessThanOrEqual(512);
    }
    samples.push(performance.now() - start);
  }

  expect(percentile(samples, 0.95)).toBeLessThan(50);
});
