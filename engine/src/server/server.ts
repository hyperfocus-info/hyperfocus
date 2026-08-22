import { encodeReplicationFrame, type ReplicationEnvelopeSegment } from "../protocol/frames.ts";
import { createProtocolMessage, encodeProtocolMessage, parseBinaryProtocolMessage, parseProtocolMessage, type BinaryPayloadCodec, type ProtocolMessage } from "../protocol/messages.ts";
import { createDevAuthAdapter } from "./auth.ts";
import { createServerClock, type ServerClock } from "./clock.ts";
import { createServerMetrics, type ServerMetrics, type ServerMetricsOptions } from "./metrics.ts";
import { createPresenceIndex, type PresenceIndex } from "./presence-index.ts";
import { createEntityReplicator, type EntityReplicator, type ReplicationMetrics, type ReplicationPacket } from "./replicator.ts";
import { createAuthoritativeRoom, type AuthoritativeRoom } from "./room.ts";
import { validateMmoAdmissionOptions, validateMmoScalePreset, type MmoAdmissionOptions, type MmoScalePreset } from "./scaling.ts";
import type { AuthAdapter, AuthoritativePlayer, MetricsSink, PersistenceAdapter, RoomReplicationAdaptiveTelemetry, RoomReplicationOptions, RoomType, ServerLogger } from "./types.ts";
import { createWorkerRoomHost, type WorkerRoomHost } from "./worker-room.ts";

type EngineServerWebSocket<T = { playerId?: string }> = {
  data?: T;
  send(data: string | Uint8Array): number | void;
  close(code?: number, reason?: string): void;
};

type ClientReplicationState = {
  playerId: string;
  roomId: string;
  socket?: EngineServerWebSocket<unknown>;
  lastSentState?: unknown;
  hasSent: boolean;
  lastSnapshotAt: number;
  nextSnapshotAt: number;
  nextDeltaAt: number;
  lastSentAt: number;
  lastAttemptAt: number;
  lastSentSequence?: number;
  lastAck?: number;
  forceSnapshot: boolean;
};

type ReplicationSpreadMode = "none" | "round-robin";

type ReplicationCandidate = {
  room: AuthoritativeRoom;
  player: AuthoritativePlayer;
  clientState: ClientReplicationState;
  replicator: EntityReplicator<unknown>;
  dueSnapshot: boolean;
  initialSnapshot: boolean;
  snapshotIntervalMs: number;
  deltaIntervalMs: number;
};

type ReplicationSendResult = {
  sent: boolean;
  dropped: boolean;
  transportDropped: boolean;
  failed: boolean;
  bytes: number;
};

type StaticDeferralPressure = {
  highSince?: number;
  highForMs: number;
  sustained: boolean;
};

type EffectiveReplicationOptions = {
  snapshotRate: number;
  deltaRate: number;
  maxBytesPerClientPerSecond: number;
  binary: boolean;
  maxClientsPerTick?: number;
  spread: ReplicationSpreadMode;
  phase: boolean;
  telemetry: boolean;
};

type JoinRoomOptions = {
  roomId?: string;
  roomType?: string;
  zoneId?: string;
  token: string;
  request?: unknown;
  connection?: unknown;
};

type CreateRoomOptions = {
  typeName?: string;
  roomType?: string;
  roomId?: string;
  worker?: boolean;
  workerScript?: string | URL;
  sharedBuffer?: SharedArrayBuffer;
  sharedBufferBytes?: number;
  tickRate?: number;
};

export type AuthoritativeServerOptions = {
  transport: "websocket";
  port: number;
  tickRate?: number;
  maxPlayersPerRoom?: number;
  rooms: readonly RoomType[];
  persistence?: PersistenceAdapter;
  auth?: AuthAdapter;
  metrics?: MetricsSink;
  metricsOptions?: Omit<ServerMetricsOptions, "sink">;
  log?: ServerLogger;
  now?: () => number;
  inputCodec?: BinaryPayloadCodec;
  maxCatchUpTicks?: number;
  devMode?: boolean;
  /** Optional same-origin HTTP fallback after health, stats, and WebSocket upgrade handling. */
  httpHandler?: (request: Request) => Response | undefined | Promise<Response | undefined>;
  scale?: MmoScalePreset;
  admission?: MmoAdmissionOptions;
  replication?: {
    snapshotRate?: number;
    deltaRate?: number;
    maxBytesPerClientPerSecond?: number;
    binary?: boolean;
    maxClientsPerTick?: number;
    spread?: ReplicationSpreadMode;
    phase?: boolean;
    telemetry?: boolean;
  };
};

export type AuthoritativeServer = {
  start(): void;
  stop(): Promise<void>;
  tick(dt?: number): Promise<void>;
  createRoom(typeName: string, roomId?: string): AuthoritativeRoom;
  createRoom(options: CreateRoomOptions): AuthoritativeRoom;
  joinRoom(options: JoinRoomOptions): Promise<{ ok: boolean; reason?: string; player?: AuthoritativePlayer; room?: AuthoritativeRoom }>;
  leavePlayer(playerId: string, reason?: string): Promise<boolean>;
  receiveInput(playerId: string, input: unknown): Promise<boolean>;
  receiveEvent(playerId: string, event: unknown): Promise<boolean>;
  getStats(): {
    port: number;
    rooms: number;
    players: number;
    clock: ReturnType<ServerClock["getStats"]>;
    metrics: ReturnType<ServerMetrics["snapshot"]>;
    metricsDiagnostics: ReturnType<ServerMetrics["diagnostics"]>;
    workerRooms: Array<ReturnType<WorkerRoomHost["getStats"]>>;
    roomTelemetry: Array<{
      id: string;
      type: string;
      players: number;
      replication: ReturnType<EntityReplicator<unknown>["metrics"]>;
      adaptive: RoomReplicationAdaptiveTelemetry;
      room?: unknown;
      warnings: string[];
    }>;
  };
  rooms(): readonly AuthoritativeRoom[];
  workerRooms(): readonly WorkerRoomHost[];
  presence: PresenceIndex;
};

let nextRoomId = 1;
let nextPlayerId = 1;

const STATIC_DEFERRAL_HIGH_COUNT = 10;
const STATIC_DEFERRAL_SUSTAINED_MS = 5000;

function roomAllowed(decision: boolean | { ok: boolean; reason?: string }) {
  return typeof decision === "boolean" ? decision : decision.ok;
}

function roomReason(decision: boolean | { ok: boolean; reason?: string }) {
  return typeof decision === "boolean" ? undefined : decision.reason;
}

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function isSegmentedReplication(value: unknown): value is { state: unknown; segments: readonly ReplicationEnvelopeSegment[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { segments?: unknown }).segments);
}

function isServerSocket(value: unknown): value is EngineServerWebSocket<unknown> {
  return typeof value === "object" && value !== null && typeof (value as EngineServerWebSocket<unknown>).send === "function";
}

function telemetryWarnings(value: unknown) {
  if (typeof value !== "object" || value === null) return [];
  const warnings = (value as { warnings?: unknown }).warnings;
  return Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === "string") : [];
}

function envFlag(name: string) {
  const value = process.env[name];
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes" || value?.toLowerCase() === "on";
}

function assertPositiveFinite(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new RangeError(`${name} must be a positive finite number`);
}

function assertNonNegativeFinite(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`${name} must be a non-negative finite number`);
}

function assertNonNegativeSafeInteger(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new RangeError(`${name} must be a non-negative safe integer`);
}

function validateServerOptions(options: AuthoritativeServerOptions) {
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 0xffff) throw new RangeError("port must be an integer from 0 through 65535");
  if (!Array.isArray(options.rooms) || options.rooms.length === 0) throw new Error("at least one room type is required");
  assertPositiveFinite("tickRate", options.tickRate);
  assertNonNegativeSafeInteger("maxPlayersPerRoom", options.maxPlayersPerRoom);
  assertNonNegativeSafeInteger("maxCatchUpTicks", options.maxCatchUpTicks);
  assertPositiveFinite("replication.snapshotRate", options.replication?.snapshotRate);
  assertPositiveFinite("replication.deltaRate", options.replication?.deltaRate);
  assertNonNegativeSafeInteger("replication.maxBytesPerClientPerSecond", options.replication?.maxBytesPerClientPerSecond);
  assertNonNegativeSafeInteger("replication.maxClientsPerTick", options.replication?.maxClientsPerTick);
  if (options.replication?.spread !== undefined && options.replication.spread !== "none" && options.replication.spread !== "round-robin") {
    throw new Error("replication.spread must be none or round-robin");
  }

  const roomNames = new Set<string>();
  for (const room of options.rooms) {
    if (typeof room.name !== "string" || room.name.trim().length === 0) throw new Error("room type name must be a non-empty string");
    if (roomNames.has(room.name)) throw new Error(`duplicate room type: ${room.name}`);
    roomNames.add(room.name);
    assertNonNegativeSafeInteger(`room ${room.name} maxPlayers`, room.maxPlayers);
    assertNonNegativeFinite(`room ${room.name} idleDisposeMs`, room.idleDisposeMs);
    assertNonNegativeFinite(`room ${room.name} persistRoomIntervalMs`, room.persistRoomIntervalMs);
    assertPositiveFinite(`room ${room.name} replication.snapshotRate`, room.replication?.snapshotRate);
    assertPositiveFinite(`room ${room.name} replication.deltaRate`, room.replication?.deltaRate);
    assertNonNegativeSafeInteger(`room ${room.name} replication.maxBytesPerClientPerSecond`, room.replication?.maxBytesPerClientPerSecond);
  }
}

export function createAuthoritativeServer(options: AuthoritativeServerOptions): AuthoritativeServer {
  validateServerOptions(options);
  function log(level: "warn" | "error", message: string, data?: unknown) {
    try {
      options.log?.[level]?.(message, data);
    } catch {
      // Logging must not interrupt authoritative state transitions or cleanup.
    }
  }
  const metrics = createServerMetrics({ ...options.metricsOptions, sink: options.metrics });
  const now = options.now ?? (() => performance.now());
  const effectiveScale = options.scale ? validateMmoScalePreset(options.scale) : undefined;
  const explicitAdmission = options.admission ? validateMmoAdmissionOptions(options.admission) : undefined;
  const scaleAdmission = effectiveScale?.admission;
  const baseAdmission = explicitAdmission ?? scaleAdmission;
  const effectiveAdmission = baseAdmission
    ? validateMmoAdmissionOptions({
        ...baseAdmission,
        playersPerRoom: explicitAdmission?.playersPerRoom ?? options.maxPlayersPerRoom ?? baseAdmission.playersPerRoom,
        softPlayersPerRoom: explicitAdmission?.softPlayersPerRoom ?? Math.min(baseAdmission.softPlayersPerRoom ?? baseAdmission.playersPerRoom, explicitAdmission?.playersPerRoom ?? options.maxPlayersPerRoom ?? baseAdmission.playersPerRoom)
      })
    : undefined;
  const effectiveTickRate = options.tickRate ?? effectiveScale?.tickRate ?? 20;
  const effectiveMaxPlayersPerRoom = options.maxPlayersPerRoom ?? explicitAdmission?.playersPerRoom ?? effectiveScale?.maxPlayersPerRoom ?? effectiveAdmission?.playersPerRoom ?? 100;
  const roomTypes = new Map(options.rooms.map((room) => [room.name, room]));
  const roomInstances = new Map<string, AuthoritativeRoom>();
  const managedAdmissionRoomIds = new Set<string>();
  const presence = createPresenceIndex();
  const auth = options.auth ?? (options.devMode === true ? createDevAuthAdapter() : undefined);
  const replicationOptions: EffectiveReplicationOptions = {
    snapshotRate: options.replication?.snapshotRate ?? effectiveScale?.replication.snapshotRate ?? 2,
    deltaRate: options.replication?.deltaRate ?? effectiveScale?.replication.deltaRate ?? effectiveTickRate,
    maxBytesPerClientPerSecond: options.replication?.maxBytesPerClientPerSecond ?? effectiveScale?.replication.maxBytesPerClientPerSecond ?? 32 * 1024,
    binary: options.replication?.binary ?? effectiveScale?.replication.binary ?? true,
    maxClientsPerTick: options.replication?.maxClientsPerTick ?? effectiveScale?.replication.maxClientsPerTick,
    spread: options.replication?.spread ?? effectiveScale?.replication.spread ?? "none",
    phase: options.replication?.phase ?? effectiveScale?.replication.phase ?? false,
    telemetry: options.replication?.telemetry ?? (envFlag("ENGINE_REPLICATION_TELEMETRY") || envFlag("MMO_REPLICATION_TELEMETRY"))
  };
  const clientReplication = new Map<string, ClientReplicationState>();
  const playerByConnection = new WeakMap<EngineServerWebSocket<unknown>, string>();
  const joiningConnections = new WeakSet<EngineServerWebSocket<unknown>>();
  const closedConnections = new WeakSet<EngineServerWebSocket<unknown>>();
  const userJoinQueues = new Map<string, Promise<void>>();
  const roomReplicators = new Map<string, EntityReplicator<unknown>>();
  const staticDeferralPressureByRoom = new Map<string, StaticDeferralPressure>();
  const workerRoomHosts = new Map<string, WorkerRoomHost>();
  let bunServer: ReturnType<typeof Bun.serve> | undefined;
  let replicationRoomCursor = 0;
  const replicationPlayerCursors = new Map<string, number>();
  const stableRoomOrderEnabled = envFlag("ENGINE_SERVER_STABLE_ROOM_ORDER");
  const directScheduledCursorEnabled = envFlag("ENGINE_SERVER_DIRECT_SCHEDULE_CURSOR");
  let orderedRoomCache: AuthoritativeRoom[] = [];
  let orderedRoomCacheDirty = true;
  let clockTickActive = false;
  let clockTickQueuedDt: number | undefined;
  let tickQueue = Promise.resolve();
  let stopping: Promise<void> | undefined;
  let stopRequested = false;
  let activeJoins = 0;
  const joinIdleWaiters = new Set<() => void>();

  function replicationPhaseMs(playerId: string, intervalMs: number, salt: number) {
    let hash = 0x811c9dc5;
    hash ^= salt;
    hash = Math.imul(hash, 0x01000193);
    for (let index = 0; index < playerId.length; index += 1) {
      hash ^= playerId.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % Math.max(1, Math.floor(intervalMs));
  }

  function replicationFor(room: AuthoritativeRoom): EffectiveReplicationOptions {
    const roomReplication = room.type.replication as RoomReplicationOptions | undefined;
    return {
      ...replicationOptions,
      snapshotRate: roomReplication?.snapshotRate ?? replicationOptions.snapshotRate,
      deltaRate: roomReplication?.deltaRate ?? replicationOptions.deltaRate,
      maxBytesPerClientPerSecond: roomReplication?.maxBytesPerClientPerSecond ?? replicationOptions.maxBytesPerClientPerSecond
    };
  }

  function replicatorFor(room: AuthoritativeRoom) {
    let replicator = roomReplicators.get(room.id);
    if (!replicator) {
      const replication = replicationFor(room);
      replicator = createEntityReplicator({
        schema: room.type.schema,
        snapshotRate: replication.snapshotRate,
        deltaRate: replication.deltaRate,
        maxBytesPerClientPerSecond: replication.maxBytesPerClientPerSecond,
        telemetry: replication.telemetry
      });
      roomReplicators.set(room.id, replicator);
    }
    return replicator;
  }

  function markRoomOrderDirty() {
    orderedRoomCacheDirty = true;
  }

  function orderedRooms() {
    if (!stableRoomOrderEnabled) return [...roomInstances.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (orderedRoomCacheDirty) {
      orderedRoomCache = [...roomInstances.values()].sort((a, b) => a.id.localeCompare(b.id));
      orderedRoomCacheDirty = false;
    }
    return orderedRoomCache;
  }

  function adaptiveTelemetryFor(roomId: string, replication: ReplicationMetrics): RoomReplicationAdaptiveTelemetry {
    const pressure = staticDeferralPressureByRoom.get(roomId);
    const highForMs = pressure?.highForMs ?? 0;
    const sustained = pressure?.sustained ?? false;
    const reason = sustained ? `Static deferral stayed above ${STATIC_DEFERRAL_HIGH_COUNT} records/tick for at least ${STATIC_DEFERRAL_SUSTAINED_MS}ms` : "";
    return {
      staticDeferredCountThreshold: STATIC_DEFERRAL_HIGH_COUNT,
      staticDeferredSustainMs: STATIC_DEFERRAL_SUSTAINED_MS,
      staticDeferralHigh: replication.currentTick.staticDeferredCount > STATIC_DEFERRAL_HIGH_COUNT,
      staticDeferralHighForMs: highForMs,
      staticDeferralSustained: sustained,
      reduceStaticRecordsRecommended: sustained,
      reduceTickRateRecommended: sustained && replication.rollingAverage.budgetUtilization > 0.9,
      reason
    };
  }

  function updateStaticDeferralPressure(roomId: string, replication: ReplicationMetrics, nowMs: number) {
    const current = staticDeferralPressureByRoom.get(roomId) ?? { highForMs: 0, sustained: false };
    if (replication.currentTick.staticDeferredCount > STATIC_DEFERRAL_HIGH_COUNT) {
      current.highSince ??= nowMs;
      current.highForMs = Math.max(0, nowMs - current.highSince);
      current.sustained = current.highForMs >= STATIC_DEFERRAL_SUSTAINED_MS;
    } else {
      current.highSince = undefined;
      current.highForMs = 0;
      current.sustained = false;
    }
    staticDeferralPressureByRoom.set(roomId, current);
    return adaptiveTelemetryFor(roomId, replication);
  }

  function sendPacket(state: ClientReplicationState | undefined, packet: ReplicationPacket, nextState: unknown, nowMs: number): ReplicationSendResult {
    if (!state || packet.dropped) {
      if (state) {
        state.lastAttemptAt = nowMs;
        if (!state.hasSent) state.forceSnapshot = true;
      }
      return { sent: false, dropped: packet.dropped, transportDropped: false, failed: false, bytes: 0 };
    }
    const frame = encodeReplicationFrame(packet);
    try {
      if (!state.socket) throw new Error("replication socket is unavailable");
      const status = state.socket.send(frame);
      if (status === 0) {
        state.lastAttemptAt = nowMs;
        state.forceSnapshot = true;
        metrics.record("replication.transport_dropped", 1, { roomId: state.roomId });
        return { sent: false, dropped: false, transportDropped: true, failed: false, bytes: 0 };
      }
      if (status === -1) metrics.record("replication.backpressure", 1, { roomId: state.roomId });
    } catch (error) {
      state.lastAttemptAt = nowMs;
      state.forceSnapshot = true;
      metrics.record("replication.send_error", 1, { roomId: state.roomId });
      log("warn", "replication send failed", { roomId: state.roomId, playerId: state.playerId, error });
      try {
        state.socket?.close(1011, "replication send failed");
      } catch {
        // The connection is already unusable; leave cleanup runs after the room operation unlocks.
      }
      return { sent: false, dropped: false, transportDropped: false, failed: true, bytes: 0 };
    }
    state.lastSentState = packet.kind === "snapshot" || packet.kind === "delta" ? cloneSerializable(nextState) : undefined;
    state.hasSent = true;
    state.lastSentSequence = packet.sequence;
    state.lastSentAt = nowMs;
    state.lastAttemptAt = nowMs;
    state.forceSnapshot = false;
    if (packet.kind === "snapshot" || packet.kind === "multipart_snapshot") state.lastSnapshotAt = nowMs;
    return { sent: true, dropped: false, transportDropped: false, failed: false, bytes: frame.byteLength };
  }

  function sortReplicationCandidates(candidates: ReplicationCandidate[]) {
    candidates.sort((a, b) => {
      const roomOrder = a.room.id.localeCompare(b.room.id);
      return roomOrder || a.player.id.localeCompare(b.player.id);
    });
  }

  async function sendReplicationCandidate(candidate: ReplicationCandidate, nowMs: number): Promise<ReplicationSendResult> {
    let result: ReplicationSendResult = { sent: false, dropped: false, transportDropped: false, failed: false, bytes: 0 };
    try {
      result = await candidate.room.runExclusive(() => {
        if (!candidate.room.ctx.players.has(candidate.player.id) || clientReplication.get(candidate.player.id) !== candidate.clientState) return result;
        const replication = candidate.room.replicationFor(candidate.player.id, {
          kind: candidate.dueSnapshot ? "snapshot" : "delta",
          previousState: candidate.clientState.lastSentState,
          now: nowMs
        });
        const nextState = isSegmentedReplication(replication) ? replication.state : replication;
        const packet = isSegmentedReplication(replication)
          ? candidate.dueSnapshot
            ? candidate.replicator.multipartSnapshot(candidate.player.id, replication.segments)
            : candidate.replicator.multipartDelta(candidate.player.id, replication.segments)
          : candidate.dueSnapshot
            ? candidate.replicator.snapshot(candidate.player.id, nextState)
            : candidate.replicator.delta(candidate.player.id, candidate.clientState.lastSentState, nextState);
        const sendResult = sendPacket(candidate.clientState, packet, nextState, nowMs);
        if (sendResult.sent) {
          const deltaPhaseMs = replicationOptions.phase && candidate.initialSnapshot ? replicationPhaseMs(candidate.player.id, candidate.deltaIntervalMs, 0xd17a) : 0;
          candidate.clientState.nextDeltaAt = nowMs + candidate.deltaIntervalMs + deltaPhaseMs;
          if (candidate.dueSnapshot) {
            const phaseMs = replicationOptions.phase && candidate.initialSnapshot ? replicationPhaseMs(candidate.player.id, candidate.snapshotIntervalMs, 0x5a9) : 0;
            candidate.clientState.nextSnapshotAt = nowMs + candidate.snapshotIntervalMs + phaseMs;
          }
          try {
            candidate.room.replicationSent(candidate.player.id, {
              sequence: packet.sequence,
              baseline: packet.baseline,
              kind: packet.kind as "snapshot" | "delta" | "multipart_snapshot" | "multipart_delta",
              segments: packet.segments,
              now: nowMs
            });
          } catch (error) {
            metrics.record("replication.sent_hook_error", 1, { roomId: candidate.room.id });
            log("warn", "replication sent hook failed", { roomId: candidate.room.id, playerId: candidate.player.id, error });
          }
        }
        if (sendResult.sent) metrics.record("replication.bytes_per_client", sendResult.bytes, { roomId: candidate.room.id });
        if (packet.deferredSegments) metrics.record("replication.deferred_segments", packet.deferredSegments, { roomId: candidate.room.id });
        if (sendResult.dropped) metrics.record("replication.dropped_budget", 1, { roomId: candidate.room.id });
        return sendResult;
      });
    } catch (error) {
      candidate.clientState.lastAttemptAt = nowMs;
      candidate.clientState.forceSnapshot = true;
      metrics.record("replication.candidate_error", 1, { roomId: candidate.room.id });
      log("warn", "replication candidate failed", { roomId: candidate.room.id, playerId: candidate.player.id, error });
    }
    if (result.failed) await leavePlayer(candidate.player.id, "replication-send-failed");
    return result;
  }

  function buildScheduledBuckets(candidates: ReplicationCandidate[]) {
    const byRoom = new Map<string, ReplicationCandidate[]>();
    for (const candidate of candidates) {
      const bucket = byRoom.get(candidate.room.id) ?? [];
      bucket.push(candidate);
      byRoom.set(candidate.room.id, bucket);
    }
    return [...byRoom.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([roomId, bucket]) => {
        bucket.sort((a, b) => a.player.id.localeCompare(b.player.id));
        const start = bucket.length ? (replicationPlayerCursors.get(roomId) ?? 0) % bucket.length : 0;
        return {
          roomId,
          start,
          attempted: 0,
          candidates: directScheduledCursorEnabled ? bucket : bucket.slice(start).concat(bucket.slice(0, start))
        };
      });
  }

  async function sendScheduledCandidates(candidates: ReplicationCandidate[], nowMs: number) {
    if (!candidates.length) return 0;
    if (replicationOptions.spread !== "round-robin" || replicationOptions.maxClientsPerTick === undefined) {
      sortReplicationCandidates(candidates);
      let sent = 0;
      for (const candidate of candidates) {
        if ((await sendReplicationCandidate(candidate, nowMs)).sent) sent += 1;
      }
      return sent;
    }

    const limit = Math.max(0, Math.floor(replicationOptions.maxClientsPerTick));
    if (limit <= 0) return 0;
    const buckets = buildScheduledBuckets(candidates).filter((bucket) => bucket.candidates.length > 0);
    if (!buckets.length) return 0;

    let sent = 0;
    let remaining = buckets.reduce((sum, bucket) => sum + bucket.candidates.length, 0);
    let roomIndex = replicationRoomCursor % buckets.length;
    while (sent < limit && remaining > 0) {
      let selectedIndex = -1;
      for (let scan = 0; scan < buckets.length; scan += 1) {
        const candidateIndex = (roomIndex + scan) % buckets.length;
        if (buckets[candidateIndex].attempted < buckets[candidateIndex].candidates.length) {
          selectedIndex = candidateIndex;
          break;
        }
      }
      if (selectedIndex < 0) break;
      const bucket = buckets[selectedIndex];
      const candidateIndex = directScheduledCursorEnabled ? (bucket.start + bucket.attempted) % bucket.candidates.length : bucket.attempted;
      const candidate = bucket.candidates[candidateIndex];
      bucket.attempted += 1;
      remaining -= 1;
      replicationPlayerCursors.set(bucket.roomId, (bucket.start + bucket.attempted) % bucket.candidates.length);
      replicationRoomCursor = (selectedIndex + 1) % buckets.length;
      roomIndex = replicationRoomCursor;
      if ((await sendReplicationCandidate(candidate, nowMs)).sent) sent += 1;
    }
    return sent;
  }

  async function streamReplication(nowMs: number) {
    if (!replicationOptions.binary) return;
    const immediate: ReplicationCandidate[] = [];
    const scheduled: ReplicationCandidate[] = [];
    for (const room of roomInstances.values()) {
      const roomReplication = replicationFor(room);
      const snapshotInterval = 1000 / Math.max(1, roomReplication.snapshotRate);
      const deltaInterval = 1000 / Math.max(1, roomReplication.deltaRate);
      const replicator = replicatorFor(room);
      replicator.beginTick();
      replicator.resetWindow(nowMs);
      for (const player of room.ctx.players.values()) {
        const state = clientReplication.get(player.id);
        if (!state?.socket) continue;
        if (state.lastAttemptAt && nowMs - state.lastAttemptAt < deltaInterval) continue;
        if (state.hasSent && nowMs < state.nextDeltaAt) continue;
        if (!room.type.getReplication && replicator.stats(player.id).bytesThisSecond >= roomReplication.maxBytesPerClientPerSecond) {
          state.lastAttemptAt = nowMs;
          metrics.record("replication.dropped_budget", 1, { roomId: room.id });
          continue;
        }
        const initialSnapshot = !state.hasSent;
        const dueSnapshot = !state.hasSent || state.forceSnapshot || nowMs >= state.nextSnapshotAt;
        const candidate = { room, player, clientState: state, replicator, dueSnapshot, initialSnapshot, snapshotIntervalMs: snapshotInterval, deltaIntervalMs: deltaInterval };
        if (initialSnapshot) immediate.push(candidate);
        else scheduled.push(candidate);
      }
    }
    metrics.record("replication.candidates_due", immediate.length + scheduled.length);
    sortReplicationCandidates(immediate);
    let sent = 0;
    for (const candidate of immediate) {
      if ((await sendReplicationCandidate(candidate, nowMs)).sent) sent += 1;
    }
    sent += await sendScheduledCandidates(scheduled, nowMs);
    metrics.record("replication.candidates_sent", sent);
    metrics.record("replication.backlog", Math.max(0, immediate.length + scheduled.length - sent));
    if (replicationOptions.telemetry) {
      for (const room of roomInstances.values()) {
        const replicationMetrics = replicatorFor(room).metrics();
        const adaptive = updateStaticDeferralPressure(room.id, replicationMetrics, nowMs);
        metrics.record("replication.volatile_bytes", replicationMetrics.currentTick.volatileBytes, { roomId: room.id });
        metrics.record("replication.static_deferred_bytes", replicationMetrics.currentTick.staticDeferredBytes, { roomId: room.id });
        metrics.record("replication.static_deferred_count", replicationMetrics.currentTick.staticDeferredCount, { roomId: room.id });
        metrics.record("replication.budget_utilization", replicationMetrics.currentTick.budgetUtilization, { roomId: room.id });
        try {
          await room.runExclusive(() => room.replicationTelemetry({ now: nowMs, replication: replicationMetrics, adaptive }));
        } catch (error) {
          metrics.record("replication.telemetry_hook_error", 1, { roomId: room.id });
          log("warn", "replication telemetry hook failed", { roomId: room.id, error });
        }
      }
    }
  }

  function recordAdmissionRoomLoads() {
    if (!effectiveAdmission) return;
    for (const roomId of [...managedAdmissionRoomIds].sort((a, b) => a.localeCompare(b))) {
      metrics.record("server.admission.room_load", roomInstances.get(roomId)?.ctx.players.size ?? 0, { roomId });
    }
  }

  async function flushRoomBroadcasts(room: AuthoritativeRoom) {
    let broadcasts: unknown[];
    let recipients: Array<{ playerId: string; socket: EngineServerWebSocket<unknown> }>;
    try {
      ({ broadcasts, recipients } = await room.runExclusive(() => ({
        broadcasts: room.drainBroadcasts(),
        recipients: [...room.ctx.players.values()]
          .map((player) => ({ playerId: player.id, socket: clientReplication.get(player.id)?.socket }))
          .filter((recipient): recipient is { playerId: string; socket: EngineServerWebSocket<unknown> } => recipient.socket !== undefined)
      })));
    } catch (error) {
      metrics.record("server.broadcast_drain_error", 1, { roomId: room.id });
      log("warn", "room broadcast drain failed", { roomId: room.id, error });
      return;
    }
    if (!broadcasts.length) return;
    for (const event of broadcasts) {
      if (options.persistence?.appendEvent) {
        try {
          await options.persistence.appendEvent({ roomId: room.id, roomType: room.type.name, at: now(), event });
        } catch (error) {
          metrics.record("persistence.append_event_error", 1, { roomId: room.id });
          log("warn", "room event persistence failed", { roomId: room.id, error });
        }
      }
      let encoded: string;
      try {
        encoded = encodeProtocolMessage(createProtocolMessage("event", event, { roomId: room.id }));
      } catch (error) {
        metrics.record("server.broadcast_encode_error", 1, { roomId: room.id });
        log("warn", "room broadcast encoding failed", { roomId: room.id, error });
        continue;
      }
      for (const recipient of recipients) {
        try {
          const status = recipient.socket.send(encoded);
          if (status === 0) {
            metrics.record("server.broadcast_dropped", 1, { roomId: room.id });
            continue;
          }
          if (status === -1) metrics.record("server.broadcast_backpressure", 1, { roomId: room.id });
        } catch (error) {
          metrics.record("server.broadcast_error", 1, { roomId: room.id });
          log("warn", "room broadcast failed", { roomId: room.id, playerId: recipient.playerId, error });
        }
      }
    }
    metrics.record("server.broadcast", broadcasts.length, { roomId: room.id });
  }

  async function disposeRoom(room: AuthoritativeRoom, reason: string, idleAt?: number) {
    let didDispose = idleAt === undefined;
    try {
      if (idleAt === undefined) await room.dispose(reason);
      else didDispose = await room.disposeIfIdle(idleAt, reason);
    } catch (error) {
      metrics.record("server.room_dispose_error", 1, { roomId: room.id });
      log("error", "room disposal failed", { roomId: room.id, error });
    }
    if (!didDispose) return false;
    if (roomInstances.get(room.id) === room) {
      roomInstances.delete(room.id);
      markRoomOrderDirty();
    }
    staticDeferralPressureByRoom.delete(room.id);
    replicationPlayerCursors.delete(room.id);
    const replicator = roomReplicators.get(room.id);
    replicator?.clear();
    roomReplicators.delete(room.id);
    workerRoomHosts.get(room.id)?.close();
    workerRoomHosts.delete(room.id);
    return true;
  }

  async function performTick(dt: number) {
    const rooms = orderedRooms();
    for (const room of rooms) {
      await room.update(dt);
      await flushRoomBroadcasts(room);
      if (!managedAdmissionRoomIds.has(room.id) && room.shouldDispose(now())) {
        await disposeRoom(room, "idle", now());
      }
    }
    await streamReplication(now());
    recordAdmissionRoomLoads();
    metrics.gauge("server.rooms", roomInstances.size);
    metrics.gauge("server.players", presence.count());
  }

  function tick(dt = 1 / effectiveTickRate) {
    if (stopRequested) return Promise.resolve();
    if (!Number.isFinite(dt) || dt < 0) return Promise.reject(new RangeError("server tick dt must be a non-negative finite number"));
    const scheduled = tickQueue.then(() => performTick(dt));
    tickQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  function reportTickError(error: unknown) {
    metrics.record("server.tick_error", 1);
    log("error", "server tick failed", error);
  }

  function runClockTick(dt: number) {
    if (stopRequested) return;
    if (clockTickActive) {
      clockTickQueuedDt = dt;
      metrics.record("server.tick_backpressure_queued", 1);
      return;
    }
    clockTickActive = true;
    void tick(dt)
      .catch(reportTickError)
      .finally(() => {
        clockTickActive = false;
        if (clockTickQueuedDt !== undefined) {
          const queuedDt = clockTickQueuedDt;
          clockTickQueuedDt = undefined;
          runClockTick(queuedDt);
        }
      });
  }

  const clock = createServerClock({
    tickRate: effectiveTickRate,
    maxCatchUpTicks: options.maxCatchUpTicks ?? 3,
    now,
    onTick: ({ dt }) => runClockTick(dt),
    onError: reportTickError
  });

  function normalizeCreateRoomOptions(typeNameOrOptions: string | CreateRoomOptions, roomId?: string): CreateRoomOptions {
    if (typeof typeNameOrOptions === "string") return { typeName: typeNameOrOptions, roomId };
    return typeNameOrOptions;
  }

  function createRoom(typeNameOrOptions: string | CreateRoomOptions, roomId?: string) {
    if (stopRequested) throw new Error("server has been stopped");
    const createOptions = normalizeCreateRoomOptions(typeNameOrOptions, roomId);
    const typeName = createOptions.typeName ?? createOptions.roomType ?? options.rooms[0]?.name;
    if (!typeName) throw new Error("room type is required");
    const resolvedRoomId = createOptions.roomId ?? `${typeName}-${nextRoomId++}`;
    const roomType = roomTypes.get(typeName);
    if (!roomType) throw new Error(`unknown room type: ${typeName}`);
    const existing = roomInstances.get(resolvedRoomId);
    if (existing) {
      if (existing.type.name !== typeName) throw new Error(`room ${resolvedRoomId} already exists with type ${existing.type.name}`);
      return existing;
    }
    const room = createAuthoritativeRoom({
      id: resolvedRoomId,
      type: roomType,
      now,
      metrics,
      persistence: options.persistence
    });
    roomInstances.set(resolvedRoomId, room);
    markRoomOrderDirty();
    if (createOptions.worker) {
      const host = createWorkerRoomHost({
        roomId: resolvedRoomId,
        script: createOptions.workerScript,
        sharedBuffer: createOptions.sharedBuffer,
        sharedBufferBytes: createOptions.sharedBufferBytes,
        tickRate: createOptions.tickRate ?? effectiveTickRate,
        onEvent(event) {
          metrics.record("worker_room.event", 1, { roomId: resolvedRoomId, type: event.type });
        }
      });
      workerRoomHosts.set(resolvedRoomId, host);
    }
    return room;
  }

  function ensureManagedAdmissionRooms() {
    if (!effectiveAdmission) return;
    for (let i = 0; i < effectiveAdmission.rooms; i += 1) {
      const roomId = `${effectiveAdmission.roomIdPrefix}-${i}`;
      managedAdmissionRoomIds.add(roomId);
      createRoom(effectiveAdmission.roomType, roomId);
    }
    recordAdmissionRoomLoads();
  }

  function maxPlayersForRoom(room: AuthoritativeRoom) {
    if (managedAdmissionRoomIds.has(room.id) && effectiveAdmission) return effectiveAdmission.playersPerRoom;
    return room.type.maxPlayers ?? effectiveMaxPlayersPerRoom;
  }

  function orderAdmissionRooms(rooms: AuthoritativeRoom[]) {
    if (effectiveAdmission?.selection === "fill-first") return rooms.sort((a, b) => a.id.localeCompare(b.id));
    return rooms.sort((a, b) => a.ctx.players.size - b.ctx.players.size || a.id.localeCompare(b.id));
  }

  ensureManagedAdmissionRooms();

  async function enqueueUserJoin<T>(userId: string, join: () => Promise<T>) {
    const previous = userJoinQueues.get(userId) ?? Promise.resolve();
    const result = previous.then(join, join);
    const tail = result.then(() => undefined, () => undefined);
    userJoinQueues.set(userId, tail);
    try {
      return await result;
    } finally {
      if (userJoinQueues.get(userId) === tail) userJoinQueues.delete(userId);
    }
  }

  async function joinRoomInternal(join: JoinRoomOptions) {
    if (!auth) return { ok: false, reason: "auth adapter required outside dev mode" };
    const authResult = await auth.verify(join.token);
    if (!authResult.ok || typeof authResult.userId !== "string" || authResult.userId.trim().length === 0) {
      return { ok: false, reason: authResult.reason ?? "auth failed" };
    }
    if (authResult.sessionId !== undefined && (typeof authResult.sessionId !== "string" || authResult.sessionId.trim().length === 0)) {
      return { ok: false, reason: "auth returned an invalid session" };
    }

    return enqueueUserJoin(authResult.userId, async () => {
      if (stopRequested) return { ok: false, reason: "server stopping" };
      const previous = presence.byUser(authResult.userId!);
      if (previous) {
        metrics.record("server.duplicate_login", 1);
        await leavePlayer(previous.id, "duplicate-login");
      }

      const playerBase = {
        id: `player-${nextPlayerId++}`,
        userId: authResult.userId!,
        sessionId: authResult.sessionId ?? `session:${authResult.userId}`,
        joinedAt: now(),
        lastInputAt: now(),
        connection: join.connection,
        data: (await options.persistence?.loadPlayer(authResult.userId!)) ?? undefined
      };
      if (stopRequested) return { ok: false, reason: "server stopping" };

      async function attemptRoom(room: AuthoritativeRoom) {
        const player: AuthoritativePlayer = {
          ...playerBase,
          roomId: room.id
        };
        const decision = await room.join(player, join.request, maxPlayersForRoom(room));
        if (!roomAllowed(decision)) return { ok: false, reason: roomReason(decision) ?? "join rejected" };
        presence.add(player);
        if (isServerSocket(join.connection)) {
          playerByConnection.set(join.connection, player.id);
          clientReplication.set(player.id, {
            playerId: player.id,
            roomId: room.id,
            socket: join.connection,
            lastSnapshotAt: 0,
            nextSnapshotAt: 0,
            nextDeltaAt: 0,
            lastSentAt: 0,
            lastAttemptAt: 0,
            hasSent: false,
            forceSnapshot: true
          });
        }
        metrics.record("server.join", 1);
        return { ok: true, player, room };
      }

      if (join.roomId) {
        const room = roomInstances.get(join.roomId) ?? createRoom(join.roomType ?? options.rooms[0]?.name, join.roomId);
        if (room.ctx.players.size >= maxPlayersForRoom(room)) return { ok: false, reason: "room full" };
        return attemptRoom(room);
      }

      if (!effectiveAdmission) {
        const room = roomInstances.get("default") ?? createRoom(join.roomType ?? options.rooms[0]?.name, "default");
        if (room.ctx.players.size >= maxPlayersForRoom(room)) return { ok: false, reason: "room full" };
        return attemptRoom(room);
      }

      const requestedRoomType = join.roomType ?? effectiveAdmission.roomType;
      if (requestedRoomType !== effectiveAdmission.roomType) return { ok: false, reason: "admission unavailable" };
      const candidates = [...managedAdmissionRoomIds]
        .map((roomId) => roomInstances.get(roomId) ?? createRoom(effectiveAdmission.roomType, roomId))
        .filter((room) => room.type.name === effectiveAdmission.roomType);
      const open = candidates.filter((room) => room.ctx.players.size < effectiveAdmission.playersPerRoom);
      if (!open.length) {
        metrics.record("server.admission.rejected_full", 1);
        recordAdmissionRoomLoads();
        return { ok: false, reason: "world full" };
      }

      const underSoft = open.filter((room) => room.ctx.players.size < (effectiveAdmission.softPlayersPerRoom ?? effectiveAdmission.playersPerRoom));
      const ordered = orderAdmissionRooms(underSoft.length ? underSoft : open);
      let rejectionReason: string | undefined;
      for (const room of ordered) {
        const result = await attemptRoom(room);
        if (result.ok) {
          recordAdmissionRoomLoads();
          return result;
        }
        rejectionReason = result.reason ?? rejectionReason;
      }
      recordAdmissionRoomLoads();
      return { ok: false, reason: rejectionReason ?? "join rejected" };
    });
  }

  async function joinRoom(join: JoinRoomOptions) {
    if (stopRequested) return { ok: false, reason: "server stopping" };
    activeJoins += 1;
    const connection = isServerSocket(join.connection) ? join.connection : undefined;
    try {
      if (connection && closedConnections.has(connection)) return { ok: false, reason: "connection closed" };
      if (connection && (joiningConnections.has(connection) || playerByConnection.has(connection))) {
        return { ok: false, reason: "connection already joined" };
      }
      if (connection) joiningConnections.add(connection);
      const result = await joinRoomInternal(join);
      if (connection && closedConnections.has(connection) && result.ok && result.player) {
        await leavePlayer(result.player.id, "disconnect-during-join");
        return { ok: false, reason: "connection closed" };
      }
      return result;
    } finally {
      if (connection) joiningConnections.delete(connection);
      activeJoins -= 1;
      if (activeJoins === 0) {
        for (const resolve of joinIdleWaiters) resolve();
        joinIdleWaiters.clear();
      }
    }
  }

  function waitForActiveJoins() {
    if (activeJoins === 0) return Promise.resolve();
    return new Promise<void>((resolve) => joinIdleWaiters.add(resolve));
  }

  async function leavePlayer(playerId: string, reason = "leave") {
    const player = presence.get(playerId);
    if (!player) return false;
    presence.remove(playerId);
    clientReplication.delete(playerId);
    const room = roomInstances.get(player.roomId);
    if (isServerSocket(player.connection)) {
      if (playerByConnection.get(player.connection) === playerId) playerByConnection.delete(player.connection);
      const socket = player.connection as EngineServerWebSocket<{ playerId?: string }>;
      if (socket.data?.playerId === playerId) socket.data = {};
    }
    roomReplicators.get(player.roomId)?.removeClient(playerId);
    metrics.record("server.leave", 1);
    return (await room?.leave(playerId, reason)) ?? false;
  }

  function send(socket: EngineServerWebSocket<unknown>, message: ProtocolMessage) {
    const status = socket.send(encodeProtocolMessage(message));
    if (status === 0) throw new Error("websocket message was dropped");
  }

  function parseIncomingMessage(raw: string | ArrayBuffer | Uint8Array) {
    if (typeof raw === "string") return parseProtocolMessage(raw);
    return parseBinaryProtocolMessage(raw, options.inputCodec);
  }

  function boundPlayerId(socket: EngineServerWebSocket<unknown>) {
    const mappedPlayerId = playerByConnection.get(socket);
    if (!mappedPlayerId) return undefined;
    const player = presence.get(mappedPlayerId);
    if (!player) return undefined;
    return mappedPlayerId;
  }

  function startWebSocketServer() {
    bunServer = Bun.serve({
      port: options.port,
      async fetch(request, server) {
        const url = new URL(request.url);
        if (url.pathname === "/healthz") return new Response("ok");
        if (url.pathname === "/stats.json") return Response.json(api.getStats());
        if (server.upgrade(request, { data: {} })) return undefined;
        const response = await options.httpHandler?.(request);
        if (response) return response;
        return new Response("Catalog authoritative server");
      },
      websocket: {
        async message(socket, raw) {
          try {
            const message = parseIncomingMessage(raw as string | ArrayBuffer | Uint8Array);
            if (message.type === "client_hello") {
              send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("server_welcome", { tickRate: effectiveTickRate }));
            } else if (message.type === "join_room") {
              if (boundPlayerId(socket as EngineServerWebSocket<unknown>)) {
                send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("join_rejected", { reason: "connection already joined" }));
              } else {
                const payload = (message.payload ?? {}) as { roomId?: string; roomType?: string; token?: string; request?: unknown };
                const result = await joinRoom({
                  roomId: payload.roomId,
                  roomType: payload.roomType,
                  token: payload.token ?? "",
                  request: payload.request,
                  connection: socket
                });
                if (result.ok && result.player) {
                  (socket as EngineServerWebSocket<{ playerId?: string }>).data = { playerId: result.player.id };
                  const acceptedPayload: { playerId: string; roomId?: string } = { playerId: result.player.id };
                  if (result.room) acceptedPayload.roomId = result.room.id;
                  send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("join_accepted", acceptedPayload));
                  clientReplication.set(result.player.id, {
                    playerId: result.player.id,
                    roomId: result.room?.id ?? payload.roomId ?? "default",
                    socket: socket as EngineServerWebSocket<unknown>,
                    lastSnapshotAt: 0,
                    nextSnapshotAt: 0,
                    nextDeltaAt: 0,
                    lastSentAt: 0,
                    lastAttemptAt: 0,
                    hasSent: false,
                    forceSnapshot: true
                  });
                } else {
                  send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("join_rejected", { reason: result.reason ?? "join rejected" }));
                }
              }
            } else if (message.type === "input") {
              const playerId = boundPlayerId(socket as EngineServerWebSocket<unknown>);
              if (playerId) await api.receiveInput(playerId, message.payload);
            } else if (message.type === "event") {
              const payload = (message.payload ?? {}) as { type?: string; sequence?: number };
              const playerId = boundPlayerId(socket as EngineServerWebSocket<unknown>);
              const sequence = payload.sequence;
              if (playerId && payload.type === "replication_ack") {
                if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff) {
                  throw new Error("replication acknowledgement sequence must fit in u32");
                }
                const state = clientReplication.get(playerId);
                const room = state ? roomInstances.get(state.roomId) : undefined;
                if (room) {
                  const accepted = replicatorFor(room).ack(playerId, sequence);
                  if (accepted) {
                    if (state) state.lastAck = sequence;
                    await room.runExclusive(() => room.replicationAck(playerId, sequence));
                  }
                }
              } else if (playerId) {
                await api.receiveEvent(playerId, message.payload);
              }
            } else if (message.type === "ping") {
              send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("pong", { now: now() }));
            }
          } catch (error) {
            try {
              send(socket as EngineServerWebSocket<unknown>, createProtocolMessage("error", { reason: error instanceof Error ? error.message : "protocol error" }));
            } catch {
              // Closing is still required when the connection can no longer send an error frame.
            }
            try {
              socket.close(1003, "protocol error");
            } catch {
              // The transport is already closed.
            }
          }
        },
        async close(socket) {
          const serverSocket = socket as EngineServerWebSocket<{ playerId?: string }>;
          closedConnections.add(serverSocket);
          const playerId = boundPlayerId(serverSocket);
          if (playerId) {
            playerByConnection.delete(serverSocket);
            serverSocket.data = {};
            clientReplication.delete(playerId);
            await leavePlayer(playerId, "disconnect");
          }
        }
      }
    });
  }

  const api: AuthoritativeServer = {
    start() {
      if (stopRequested) throw new Error("server has been stopped");
      if (!bunServer) startWebSocketServer();
      clock.start();
    },
    stop() {
      if (stopping) return stopping;
      stopRequested = true;
      clockTickQueuedDt = undefined;
      clock.stop();
      bunServer?.stop(true);
      bunServer = undefined;
      for (const host of workerRoomHosts.values()) host.close();
      stopping = (async () => {
        await tickQueue;
        await waitForActiveJoins();
        for (const player of presence.list()) {
          try {
            await leavePlayer(player.id, "server-stop");
          } catch (error) {
            metrics.record("server.stop_leave_error", 1);
            log("error", "player leave failed during shutdown", { playerId: player.id, error });
          }
        }
        for (const room of [...roomInstances.values()]) await disposeRoom(room, "server-stop");
        workerRoomHosts.clear();
        clientReplication.clear();
      })();
      return stopping;
    },
    tick,
    createRoom,
    joinRoom,
    leavePlayer,
    async receiveInput(playerId, input) {
      if (stopRequested) return false;
      const player = presence.get(playerId);
      if (!player) return false;
      return (await roomInstances.get(player.roomId)?.input(playerId, input)) ?? false;
    },
    async receiveEvent(playerId, event) {
      if (stopRequested) return false;
      const player = presence.get(playerId);
      if (!player) return false;
      return (await roomInstances.get(player.roomId)?.event(playerId, event)) ?? false;
    },
    getStats() {
      const roomTelemetry = [...roomInstances.values()].map((room) => {
        const roomData = replicationOptions.telemetry ? room.getTelemetry() : undefined;
        const warnings = telemetryWarnings(roomData);
        const replication = replicatorFor(room).metrics();
        const adaptive = adaptiveTelemetryFor(room.id, replication);
        if (replicationOptions.telemetry && replication.rollingAverage.staticDeferredCount > STATIC_DEFERRAL_HIGH_COUNT) warnings.push("Replication static deferral high");
        if (replicationOptions.telemetry && adaptive.staticDeferralSustained) warnings.push("Replication static deferral sustained");
        return {
          id: room.id,
          type: room.type.name,
          players: room.ctx.players.size,
          replication,
          adaptive,
          room: roomData,
          warnings
        };
      });
      return {
        port: bunServer?.port ?? options.port,
        rooms: roomInstances.size,
        players: presence.count(),
        clock: clock.getStats(),
        metrics: metrics.snapshot(),
        metricsDiagnostics: metrics.diagnostics(),
        workerRooms: [...workerRoomHosts.values()].map((host) => host.getStats()),
        roomTelemetry
      };
    },
    rooms() {
      return [...roomInstances.values()];
    },
    workerRooms() {
      return [...workerRoomHosts.values()];
    },
    presence
  };

  return api;
}
