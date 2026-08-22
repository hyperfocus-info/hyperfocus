import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { decodeReplicationFrame, encodeSnapshot } from "@hyperfocus/engine/protocol";
import { createAuthoritativeServer, type AuthoritativeServer } from "@hyperfocus/engine/server";
import { createMmoSkillDemoGame } from "../src/game.ts";
import {
  mmoSkillDemoSchema,
  syncMmoEntityRegistry,
  type MmoSkillDemoInput,
  type MmoSkillDemoState,
  type NpcEntity,
  type PlayerEntity
} from "../src/shared.ts";

type JoinResult = Awaited<ReturnType<AuthoritativeServer["joinRoom"]>>;

type CountingSocket = {
  sent: number;
  bytes: number;
  frames: Uint8Array[];
  send(data: string | Uint8Array): void;
  close(): void;
  clear(): void;
  drainFrames(): Uint8Array[];
};

type BenchConfig = {
  players: number;
  ticks: number;
  warmup: number;
  tickHz: number;
  extraNpcs: number;
  extraHazards: number;
  out: string;
};

type Summary = {
  min: number;
  p50: number;
  p95: number;
  max: number;
  avg: number;
};

type MemorySnapshot = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
};

const DEFAULT_OUT = resolve(import.meta.dir, "..", ".local", "dungeon-20-player-bench.json");
const REPLICATION_TELEMETRY_ENV = "ENGINE_REPLICATION_TELEMETRY";
const telemetryDefaulted = process.env[REPLICATION_TELEMETRY_ENV] === undefined;
process.env[REPLICATION_TELEMETRY_ENV] ??= "1";

function integerArg(name: string, fallback: number, minimum: number) {
  const prefix = `--${name}=`;
  const match = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const value = Number(match.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`--${name} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function positiveNumberArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const match = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const value = Number(match.slice(prefix.length));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a finite positive number`);
  return value;
}

function stringArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return Bun.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function config(): BenchConfig {
  return {
    players: integerArg("players", 20, 1),
    ticks: integerArg("ticks", 360, 1),
    warmup: integerArg("warmup", 60, 0),
    tickHz: positiveNumberArg("tick-hz", 20),
    extraNpcs: integerArg("extra-npcs", 0, 0),
    extraHazards: integerArg("extra-hazards", 0, 0),
    out: stringArg("out", DEFAULT_OUT)
  };
}

function createCountingSocket(): CountingSocket {
  return {
    sent: 0,
    bytes: 0,
    frames: [],
    send(data) {
      this.sent += 1;
      this.bytes += data instanceof Uint8Array ? data.byteLength : Buffer.byteLength(data);
      if (data instanceof Uint8Array) this.frames.push(data);
    },
    close() {},
    clear() {
      this.sent = 0;
      this.bytes = 0;
      this.frames.length = 0;
    },
    drainFrames() {
      const frames = this.frames;
      this.frames = [];
      return frames;
    }
  };
}

function createServer(options: { now?: () => number; binaryReplication?: boolean } = {}) {
  const game = createMmoSkillDemoGame();
  return createAuthoritativeServer({
    transport: "websocket",
    port: 0,
    devMode: true,
    rooms: game.engineWorld.roomTypes(),
    now: options.now,
    replication: options.binaryReplication
      ? {
          snapshotRate: 1,
          deltaRate: 10,
          maxBytesPerClientPerSecond: 24 * 1024,
          binary: true,
          maxClientsPerTick: 100,
          spread: "round-robin",
          phase: true
        }
      : { binary: false }
  });
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function memorySnapshot(): MemorySnapshot {
  const memory = process.memoryUsage();
  return {
    rssMb: round(memory.rss / 1024 / 1024, 2),
    heapUsedMb: round(memory.heapUsed / 1024 / 1024, 2),
    heapTotalMb: round(memory.heapTotal / 1024 / 1024, 2)
  };
}

function summarize(values: number[]): Summary {
  if (!values.length) return { min: 0, p50: 0, p95: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return {
    min: round(sorted[0]),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted[sorted.length - 1]),
    avg: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
  };
}

function summarizeReplicationSample(sample: { volatileBytes: number; staticDeferredBytes: number; staticDeferredCount: number; totalBytes: number; budgetUtilization: number; packets: number }) {
  return {
    volatileBytes: round(sample.volatileBytes, 2),
    staticDeferredBytes: round(sample.staticDeferredBytes, 2),
    staticDeferredCount: round(sample.staticDeferredCount, 2),
    totalBytes: round(sample.totalBytes, 2),
    budgetUtilization: round(sample.budgetUtilization, 4),
    packets: round(sample.packets, 2)
  };
}

function compactRoomTelemetry(roomTelemetry: ReturnType<AuthoritativeServer["getStats"]>["roomTelemetry"][number] | undefined) {
  if (!roomTelemetry) return undefined;
  const discovery = (roomTelemetry.room as { replication?: { discovery?: unknown } } | undefined)?.replication?.discovery;
  return {
    enabled: roomTelemetry.replication.enabled,
    currentTick: summarizeReplicationSample(roomTelemetry.replication.currentTick),
    rollingAverage: summarizeReplicationSample(roomTelemetry.replication.rollingAverage),
    rollingSamples: roomTelemetry.replication.rollingSamples,
    pendingStaticCount: roomTelemetry.replication.pendingStaticCount,
    pendingStaticBytes: roomTelemetry.replication.pendingStaticBytes,
    maxBytesPerClientPerSecond: roomTelemetry.replication.maxBytesPerClientPerSecond,
    discovery,
    adaptive: roomTelemetry.adaptive,
    warnings: roomTelemetry.warnings
  };
}

function countEntities(state: MmoSkillDemoState) {
  const counts = { players: 0, npcs: 0, resources: 0, loots: 0, hazards: 0, entities: 0 };
  for (const [, entity] of Object.entries(state.entities)) {
    if (!entity) continue;
    counts.entities += 1;
    if (entity.entityType === "player") counts.players += 1;
    else if (entity.entityType === "npc") counts.npcs += 1;
    else if (entity.entityType === "resource") counts.resources += 1;
    else if (entity.entityType === "loot") counts.loots += 1;
    else if (entity.entityType === "hazard") counts.hazards += 1;
  }
  return counts;
}

function livingDungeonTargets(state: MmoSkillDemoState): NpcEntity[] {
  return Object.entries(state.npcs)
    .map(([, npc]) => npc)
    .filter((npc) => npc.hp > 0 && npc.zoneId === "dungeon" && npc.kind !== "player-decoy")
    .sort((a, b) => {
      const bossOrder = Number(b.role === "boss") - Number(a.role === "boss");
      return bossOrder || a.id.localeCompare(b.id);
    });
}

function configurePlayer(player: PlayerEntity, target: NpcEntity, index: number) {
  const weapons = ["mace", "bow", "staff", "wand", "twin-blades", "blade"];
  const rAbilities: Record<string, string> = {
    mace: "mace-whirlwind",
    bow: "bow-flurry",
    staff: "staff-maelstrom",
    wand: "wand-chaos-volley",
    "twin-blades": "twin-blade-dance",
    blade: "blade-omnislash"
  };
  const weapon = weapons[index % weapons.length];
  const angle = (Math.PI * 2 * index) / 20;
  const radius = 92 + (index % 5) * 18;
  player.zoneId = "dungeon";
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.energy = player.maxEnergy || 100;
  player.combatLevel = Math.max(player.combatLevel, 35);
  player.inventory[weapon] = Math.max(player.inventory[weapon] ?? 0, 1);
  player.equipment.weapon = weapon;
  player.equippedWeaponId = weapon;
  player.equipment["ability:R"] = rAbilities[weapon];
  player.abilitySlots[rAbilities[weapon]] = "R";
  player.abilitySlots.R = "unlocked";
  player.x = Math.max(48, Math.min(target.x + Math.cos(angle) * radius, 4096));
  player.y = Math.max(48, Math.min(target.y + Math.sin(angle) * radius, 4096));
  player.aimX = target.x;
  player.aimY = target.y;
}

function addBenchEntities(state: MmoSkillDemoState, cfg: BenchConfig, target: NpcEntity | undefined) {
  if (target) {
    for (let i = 0; i < cfg.extraNpcs; i += 1) {
      const id = `bench-npc-${i}`;
      const column = i % 40;
      const row = Math.floor(i / 40);
      state.npcs[id] = {
        ...target,
        id,
        kind: "bench-target",
        role: "bench",
        elite: false,
        zoneId: "dungeon",
        x: target.x - 480 + column * 24,
        y: target.y - 320 + row * 24,
        spawnX: target.x - 480 + column * 24,
        spawnY: target.y - 320 + row * 24,
        hp: 2500,
        maxHp: 2500,
        respawnMs: 0,
        iframeMs: 0,
        stunMs: 0,
        castMs: 0,
        damageAmpMs: 0,
        combatState: "",
        combatFlags: "",
        lastAttackStyle: ""
      };
    }
  }

  for (let i = 0; i < cfg.extraHazards; i += 1) {
    const anchor = target ?? { x: 1200, y: 900 };
    const column = i % 50;
    const row = Math.floor(i / 50);
    const x = anchor.x - 600 + column * 24;
    const y = anchor.y - 360 + row * 24;
    const id = `bench-hazard-${i}`;
    state.hazards[id] = {
      id,
      entityType: "hazard",
      kind: i % 3 === 0 ? "aoe" : "line",
      zoneId: "dungeon",
      ownerId: "",
      x,
      y,
      toX: x + 64,
      toY: y,
      radius: 8 + (i % 4) * 2,
      windupMs: 0,
      lifetimeMs: 600000,
      damage: 0,
      knockbackModifier: 0,
      isHeavyImpact: false,
      armorPierce: false,
      effectKind: "bench-load",
      text: "",
      pulse: 0
    };
  }
}

function configureDungeonPressure(state: MmoSkillDemoState, joins: JoinResult[], cfg: BenchConfig) {
  syncMmoEntityRegistry(state);
  const targets = livingDungeonTargets(state);
  for (const npc of targets) {
    if (npc.role === "boss") {
      npc.hp = 60000;
      npc.maxHp = 60000;
    } else if (npc.role === "elite") {
      npc.hp = Math.max(npc.hp, 8000);
      npc.maxHp = Math.max(npc.maxHp, npc.hp);
    } else {
      npc.hp = Math.max(npc.hp, 2500);
      npc.maxHp = Math.max(npc.maxHp, npc.hp);
    }
    npc.respawnMs = 0;
    npc.iframeMs = 0;
    npc.stunMs = 0;
  }

  for (let i = 0; i < joins.length; i += 1) {
    const id = joins[i].player?.id;
    if (!id) continue;
    const player = state.players[id];
    const target = targets[i % targets.length];
    if (player && target) configurePlayer(player, target, i);
  }
  addBenchEntities(state, cfg, targets[0]);
  syncMmoEntityRegistry(state);
}

function inputFor(player: PlayerEntity, target: NpcEntity, tick: number, index: number): MmoSkillDemoInput {
  const phase = (tick + index * 11) / 18;
  const action =
    tick % 53 === index % 11
      ? "r"
      : tick % 31 === index % 7
        ? "e"
        : tick % 23 === index % 5
          ? "q"
          : tick % 17 === index % 3
            ? "space"
            : "lmb";
  return {
    dx: Math.cos(phase) * 0.85,
    dy: Math.sin(phase) * 0.85,
    action,
    targetId: target.id,
    aimX: target.x,
    aimY: target.y
  };
}

async function applyInputs(server: AuthoritativeServer, state: MmoSkillDemoState, joins: JoinResult[], tick: number) {
  const targets = livingDungeonTargets(state);
  if (!targets.length) return;
  for (let i = 0; i < joins.length; i += 1) {
    const id = joins[i].player?.id;
    if (!id) continue;
    const player = state.players[id];
    if (!player) continue;
    if (!player.activeAbility) player.energy = player.maxEnergy || 100;
    const target = targets[i % targets.length];
    await server.receiveInput(id, inputFor(player, target, tick, i));
  }
}

async function runAdmissionProbe(targetPlayers: number) {
  const server = createServer();
  try {
    const roomId = "bench-production-dungeon";
    server.createRoom("mmo-skill-demo-dungeon", roomId);
    const reasons: Record<string, number> = {};
    let accepted = 0;
    for (let i = 0; i < targetPlayers; i += 1) {
      const join = await server.joinRoom({ roomId, roomType: "mmo-skill-demo-dungeon", token: `dev:prod-dungeon-${i}` });
      if (join.ok) accepted += 1;
      else reasons[join.reason ?? "unknown"] = (reasons[join.reason ?? "unknown"] ?? 0) + 1;
    }
    const room = server.rooms().find((candidate) => candidate.id === roomId);
    return {
      targetPlayers,
      accepted,
      rejected: targetPlayers - accepted,
      reasons,
      roomType: room?.type.name ?? "mmo-skill-demo-dungeon",
      maxPlayers: room?.type.maxPlayers ?? null
    };
  } finally {
    await server.stop();
  }
}

async function runForcedDungeonBench(cfg: BenchConfig) {
  const server = createServer();
  try {
    const roomId = "bench-forced-dungeon-20";
    const room = server.createRoom("mmo-skill-demo-dungeon", roomId);
    const joins: JoinResult[] = [];
    for (let i = 0; i < cfg.players; i += 1) {
      const join = await server.joinRoom({ roomId, roomType: "mmo-skill-demo-dungeon", token: `dev:forced-dungeon-${i}` });
      if (!join.ok) throw new Error(`forced join failed at ${i}: ${join.reason ?? "unknown"}`);
      joins.push(join);
    }
    const state = room.ctx.state as MmoSkillDemoState;
    configureDungeonPressure(state, joins, cfg);

  for (let tick = 0; tick < cfg.warmup; tick += 1) {
    await applyInputs(server, state, joins, tick);
    await room.update(1 / cfg.tickHz);
  }

  const updateMs: number[] = [];
  const snapshotEncodeMs: number[] = [];
  const loopMs: number[] = [];
  const snapshotBytes: number[] = [];
  const visibleEntitiesPerPlayer: number[] = [];
  const startEntities = countEntities(state);

  for (let tick = 0; tick < cfg.ticks; tick += 1) {
    const loopStart = performance.now();
    await applyInputs(server, state, joins, cfg.warmup + tick);
    const updateStart = performance.now();
    await room.update(1 / cfg.tickHz);
    updateMs.push(performance.now() - updateStart);

    const snapshotStart = performance.now();
    let bytes = 0;
    let visibleTotal = 0;
    for (const join of joins) {
      const playerId = join.player?.id;
      if (!playerId) continue;
      const snapshot = room.snapshotFor(playerId) as MmoSkillDemoState;
      bytes += encodeSnapshot(mmoSkillDemoSchema, snapshot).byteLength;
      visibleTotal += Object.keys(snapshot.entities ?? {}).length;
    }
    snapshotEncodeMs.push(performance.now() - snapshotStart);
    snapshotBytes.push(bytes);
    visibleEntitiesPerPlayer.push(visibleTotal / joins.length);
    loopMs.push(performance.now() - loopStart);
  }

  const endEntities = countEntities(state);
  const heapMb = round(process.memoryUsage.rss() / 1024 / 1024, 2);
    return {
    roomId,
    roomType: room.type.name,
    roomKind: state.roomKind,
    players: joins.length,
    tickHz: cfg.tickHz,
    tickBudgetMs: round(1000 / cfg.tickHz),
    startEntities,
    endEntities,
    updateMs: summarize(updateMs),
    snapshotEncodeMs: summarize(snapshotEncodeMs),
    loopMs: summarize(loopMs),
    fullSnapshotBytesPerTick: summarize(snapshotBytes),
    fullSnapshotKbPerPlayerAvg: round(snapshotBytes.reduce((sum, value) => sum + value, 0) / Math.max(1, snapshotBytes.length * joins.length * 1024), 2),
    visibleEntitiesPerPlayer: summarize(visibleEntitiesPerPlayer),
    rssMb: heapMb,
      overBudgetTicks: loopMs.filter((value) => value > 1000 / cfg.tickHz).length
    };
  } finally {
    await server.stop();
  }
}

function metricTotal(metrics: Record<string, { total: number }>, name: string) {
  let total = 0;
  for (const [key, value] of Object.entries(metrics)) {
    if (key === name || key.startsWith(`${name}{`)) total += value.total;
  }
  return round(total);
}

function ackReplicationFrames(joins: JoinResult[], sockets: CountingSocket[]) {
  for (let index = 0; index < joins.length; index += 1) {
    const playerId = joins[index].player?.id;
    const room = joins[index].room;
    if (!playerId || !room) continue;
    for (const bytes of sockets[index].drainFrames()) {
      room.replicationAck(playerId, decodeReplicationFrame(bytes).sequence);
    }
  }
}

async function runForcedReplicationBench(cfg: BenchConfig) {
  let now = 0;
  const server = createServer({ now: () => now, binaryReplication: true });
  try {
    const roomId = "bench-forced-dungeon-replication-20";
    const room = server.createRoom("mmo-skill-demo-dungeon", roomId);
    const sockets = Array.from({ length: cfg.players }, () => createCountingSocket());
    const joins: JoinResult[] = [];
    for (let i = 0; i < cfg.players; i += 1) {
      const join = await server.joinRoom({ roomId, roomType: "mmo-skill-demo-dungeon", token: `dev:forced-dungeon-repl-${i}`, connection: sockets[i] });
      if (!join.ok) throw new Error(`replication join failed at ${i}: ${join.reason ?? "unknown"}`);
      joins.push(join);
    }

  const state = room.ctx.state as MmoSkillDemoState;
  configureDungeonPressure(state, joins, cfg);

  for (let tick = 0; tick < cfg.warmup; tick += 1) {
    now += 1000 / cfg.tickHz;
    await applyInputs(server, state, joins, tick);
    await server.tick(1 / cfg.tickHz);
    ackReplicationFrames(joins, sockets);
  }
  const warmupMetrics = server.getStats().metrics;
  const warmupDroppedBudget = metricTotal(warmupMetrics, "replication.dropped_budget");
  const warmupCandidatesDue = metricTotal(warmupMetrics, "replication.candidates_due");
  const warmupCandidatesSent = metricTotal(warmupMetrics, "replication.candidates_sent");

  const tickMs: number[] = [];
  const inputMs: number[] = [];
  const updateMs: number[] = [];
  const replicationAndSchedulerMs: number[] = [];
  const originalUpdate = room.update.bind(room);
  room.update = async (dt: number) => {
    const start = performance.now();
    try {
      await originalUpdate(dt);
    } finally {
      updateMs.push(performance.now() - start);
    }
  };

  for (const socket of sockets) socket.clear();
  const memoryStart = memorySnapshot();
  for (let tick = 0; tick < cfg.ticks; tick += 1) {
    now += 1000 / cfg.tickHz;
    const inputStart = performance.now();
    await applyInputs(server, state, joins, tick);
    inputMs.push(performance.now() - inputStart);
    const start = performance.now();
    await server.tick(1 / cfg.tickHz);
    const elapsed = performance.now() - start;
    tickMs.push(elapsed);
    replicationAndSchedulerMs.push(Math.max(0, elapsed - (updateMs.at(-1) ?? 0)));
    ackReplicationFrames(joins, sockets);
  }
  const memoryEnd = memorySnapshot();

  const seconds = cfg.ticks / cfg.tickHz;
  const sentMessages = sockets.reduce((sum, socket) => sum + socket.sent, 0);
  const sentBytes = sockets.reduce((sum, socket) => sum + socket.bytes, 0);
  const stats = server.getStats();
  const metrics = stats.metrics;
  const telemetry = compactRoomTelemetry(stats.roomTelemetry.find((entry) => entry.id === roomId));
    return {
    roomId,
    players: joins.length,
    tickMs: summarize(tickMs),
    inputMs: summarize(inputMs),
    updateMs: summarize(updateMs),
    replicationAndSchedulerMs: summarize(replicationAndSchedulerMs),
    sentMessages,
    sentBytes,
    sentKbPerClientSecond: round(sentBytes / Math.max(1, joins.length * seconds * 1024), 2),
    sentMessagesPerClientSecond: round(sentMessages / Math.max(1, joins.length * seconds), 2),
    droppedBudget: round(metricTotal(metrics, "replication.dropped_budget") - warmupDroppedBudget),
    candidatesDue: round(metricTotal(metrics, "replication.candidates_due") - warmupCandidatesDue),
    candidatesSent: round(metricTotal(metrics, "replication.candidates_sent") - warmupCandidatesSent),
    backlogLatest: round(metrics["replication.backlog"]?.latest ?? 0),
    memoryStart,
    memoryEnd,
    memoryDelta: {
      rssMb: round(memoryEnd.rssMb - memoryStart.rssMb, 2),
      heapUsedMb: round(memoryEnd.heapUsedMb - memoryStart.heapUsedMb, 2),
      heapTotalMb: round(memoryEnd.heapTotalMb - memoryStart.heapTotalMb, 2)
    },
      telemetry
    };
  } finally {
    await server.stop();
  }
}

async function main() {
  const cfg = config();
  const admission = await runAdmissionProbe(cfg.players);
  const forced = await runForcedDungeonBench(cfg);
  const replication = await runForcedReplicationBench(cfg);
  const report = {
    createdAt: new Date().toISOString(),
    config: cfg,
    admission,
    forced,
    replication
  };

  mkdirSync(dirname(cfg.out), { recursive: true });
  writeFileSync(cfg.out, `${JSON.stringify(report, null, 2)}\n`);

  console.info(`prod admission: ${admission.accepted}/${admission.targetPlayers} accepted; rejected=${admission.rejected} ${JSON.stringify(admission.reasons)}`);
  console.info(
    `forced ${forced.players}p ${forced.roomKind}: loop p95=${forced.loopMs.p95}ms update p95=${forced.updateMs.p95}ms snapshot p95=${forced.snapshotEncodeMs.p95}ms fullSnapshotAvg=${forced.fullSnapshotKbPerPlayerAvg}KB/player`
  );
  console.info(
    `replication forced ${replication.players}p: tick p95=${replication.tickMs.p95}ms sent=${replication.sentKbPerClientSecond}KB/client/s droppedBudget=${replication.droppedBudget} candidates=${replication.candidatesSent}/${replication.candidatesDue}`
  );
  console.info(
    `replication phase split: input p95=${replication.inputMs.p95}ms update p95=${replication.updateMs.p95}ms encode/send+scheduler p95=${replication.replicationAndSchedulerMs.p95}ms rssDelta=${replication.memoryDelta.rssMb}MB heapUsedDelta=${replication.memoryDelta.heapUsedMb}MB`
  );
  if (replication.telemetry?.enabled) {
    const rolling = replication.telemetry.rollingAverage;
    const discovery = replication.telemetry.discovery as
      | { queueDepth?: number; maxClientQueueDepth?: number; maxBacklogAge?: number; avgTTD?: number; maxStaticRecordsPerTick?: number; adaptiveRecommended?: boolean }
      | undefined;
    console.info(
      `replication telemetry (${REPLICATION_TELEMETRY_ENV}=1${telemetryDefaulted ? " bench-default" : ""}): rolling volatile=${rolling.volatileBytes}B/tick staticDeferred=${rolling.staticDeferredBytes}B/tick staticDeferredCount=${rolling.staticDeferredCount}/tick budget=${round(rolling.budgetUtilization * 100, 2)}% packets=${rolling.packets}/tick pendingStatic=${replication.telemetry.pendingStaticCount} (${replication.telemetry.pendingStaticBytes}B)`
    );
    console.info(
      `discovery telemetry: queueDepth=${discovery?.queueDepth ?? 0} maxClientQueueDepth=${discovery?.maxClientQueueDepth ?? 0} maxBacklogAge=${discovery?.maxBacklogAge ?? 0}t avgTTD=${round(discovery?.avgTTD ?? 0, 2)}t maxStaticRecords=${discovery?.maxStaticRecordsPerTick ?? 0} congestion=${replication.telemetry.warnings.includes("Congestion") ? "yes" : "no"} adaptiveStatic=${replication.telemetry.adaptive.reduceStaticRecordsRecommended ? "yes" : "no"}`
    );
  } else {
    console.info(`replication telemetry disabled; set ${REPLICATION_TELEMETRY_ENV}=1 to collect replication/discovery telemetry`);
  }
  console.info(`report: ${cfg.out}`);
}

await main();
