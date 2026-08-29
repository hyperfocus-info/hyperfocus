import { performance } from "node:perf_hooks";
import { defineSchema } from "../src/protocol/schema.ts";
import { createRoomType } from "../src/server/core/room-type.ts";
import { createAuthoritativeServer } from "../src/server/server.ts";

export type AuthoritativeSoakOptions = {
  durationMs: number;
  clients?: number;
  tickRate?: number;
  maxHeapGrowthBytes?: number;
};

export type AuthoritativeSoakEvidence = {
  durationMs: number;
  clients: number;
  ticks: number;
  inputs: number;
  tickP95Ms: number;
  heapGrowthBytes: number;
  peakHeapBytes: number;
  failures: 0;
};

export async function runAuthoritativeSoak(options: AuthoritativeSoakOptions): Promise<AuthoritativeSoakEvidence> {
  const durationMs = bounded(options.durationMs, 100, 24 * 60 * 60_000, "durationMs");
  const clients = bounded(options.clients ?? 100, 1, 1_000, "clients");
  const tickRate = bounded(options.tickRate ?? 60, 1, 240, "tickRate");
  const maxHeapGrowthBytes = bounded(options.maxHeapGrowthBytes ?? 64 * 1024 * 1024, 1, 2 * 1024 * 1024 * 1024, "maxHeapGrowthBytes");
  const state = { ticks: 0, inputs: 0 };
  const roomType = createRoomType<typeof state, { sequence: number }>({
    name: "soak",
    schema: defineSchema<typeof state>({ ticks: "u32", inputs: "u32" }),
    maxPlayers: clients,
    createState: () => state,
    onInput: (context) => { context.state.inputs += 1; },
    update: (context) => { context.state.ticks += 1; },
  });
  const server = createAuthoritativeServer({ transport: "websocket", port: 0, rooms: [roomType], devMode: true, tickRate });
  const playerIds: string[] = [];
  const connection = () => ({ send() {}, close() {} });
  try {
    for (let index = 0; index < clients; index += 1) {
      const joined = await server.joinRoom({ roomId: "soak", roomType: "soak", token: `dev:soak-${index}`, connection: connection() });
      if (!joined.ok || !joined.player) throw new Error(`Soak client ${index} failed admission: ${joined.reason ?? "unknown"}.`);
      playerIds.push(joined.player.id);
    }
    const startHeap = process.memoryUsage().heapUsed;
    let peakHeapBytes = startHeap;
    const samples: number[] = [];
    const startedAt = performance.now();
    const intervalMs = 1_000 / tickRate;
    let sequence = 0;
    while (performance.now() - startedAt < durationMs) {
      const tickStarted = performance.now();
      for (const playerId of playerIds) {
        if (!await server.receiveInput(playerId, { sequence })) throw new Error(`Soak input rejected for ${playerId}.`);
      }
      await server.tick(1 / tickRate);
      samples.push(performance.now() - tickStarted);
      sequence += 1;
      peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
      const remaining = intervalMs - (performance.now() - tickStarted);
      if (remaining > 0) await Bun.sleep(remaining);
    }
    const finalHeap = process.memoryUsage().heapUsed;
    const heapGrowthBytes = finalHeap - startHeap;
    if (heapGrowthBytes > maxHeapGrowthBytes) throw new Error(`Soak heap grew ${heapGrowthBytes} bytes, above ${maxHeapGrowthBytes}.`);
    samples.sort((a, b) => a - b);
    return {
      durationMs: Math.round(performance.now() - startedAt),
      clients,
      ticks: state.ticks,
      inputs: state.inputs,
      tickP95Ms: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] ?? 0,
      heapGrowthBytes,
      peakHeapBytes,
      failures: 0,
    };
  } finally {
    await server.stop();
  }
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

if (import.meta.main) {
  const duration = Number(process.env.SOAK_DURATION_MS ?? 30 * 60_000);
  const clients = Number(process.env.SOAK_CLIENTS ?? 100);
  try { console.log(JSON.stringify(await runAuthoritativeSoak({ durationMs: duration, clients }), null, 2)); }
  catch (cause) {
    console.error(cause instanceof Error ? cause.stack ?? cause.message : String(cause));
    process.exitCode = 1;
  }
}
