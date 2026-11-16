import { encodeReplicationFrame, type ReplicationEnvelopeSegment } from "../../protocol/frames.ts";
import type { AuthoritativeRoom } from "../core/room.ts";
import type { AuthoritativePlayer, RoomReplicationAdaptiveTelemetry } from "../core/types.ts";
import type { ServerMetrics } from "../operations/metrics.ts";
import { createEntityReplicator, type EntityReplicator, type ReplicationMetrics, type ReplicationPacket } from "../replication/replicator.ts";
import type { EffectiveReplicationOptions, EngineServerWebSocket } from "./server-contract.ts";

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

type ReplicationControllerOptions = {
  defaults: EffectiveReplicationOptions;
  rooms: Map<string, AuthoritativeRoom>;
  metrics: ServerMetrics;
  leavePlayer(playerId: string, reason: string): Promise<boolean>;
  onTransportFailure?(socket: EngineServerWebSocket<unknown>): Promise<void>;
  log(level: "warn" | "error", message: string, data?: unknown): void;
  directScheduledCursor: boolean;
};

const STATIC_DEFERRAL_HIGH_COUNT = 10;
const STATIC_DEFERRAL_SUSTAINED_MS = 5000;

function cloneSerializable(value: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isSegmentedReplication(value: unknown): value is { state: unknown; segments: readonly ReplicationEnvelopeSegment[] } {
  return typeof value === "object" && value !== null && "segments" in value && Array.isArray(value.segments);
}

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

function sortReplicationCandidates(candidates: ReplicationCandidate[]) {
  candidates.sort((a, b) => {
    const roomOrder = a.room.id.localeCompare(b.room.id);
    return roomOrder || a.player.id.localeCompare(b.player.id);
  });
}

function replicationReceiptKind(kind: ReplicationPacket["kind"]) {
  if (kind === "snapshot" || kind === "delta" || kind === "multipart_snapshot" || kind === "multipart_delta") return kind;
  throw new Error(`Unexpected outbound replication frame kind: ${kind}`);
}

export function createServerReplication(options: ReplicationControllerOptions) {
  const clients = new Map<string, ClientReplicationState>();
  const replicators = new Map<string, EntityReplicator<unknown>>();
  const pressureTracker = createStaticDeferralPressureTracker();
  const playerCursors = new Map<string, number>();
  let roomCursor = 0;

  const replicationFor = (room: AuthoritativeRoom) => effectiveReplicationFor(room, options.defaults);

  function replicatorFor(room: AuthoritativeRoom) {
    let replicator = replicators.get(room.id);
    if (!replicator) {
      const replication = replicationFor(room);
      replicator = createEntityReplicator({
        schema: room.type.schema,
        snapshotRate: replication.snapshotRate,
        deltaRate: replication.deltaRate,
        maxBytesPerClientPerSecond: replication.maxBytesPerClientPerSecond,
        telemetry: replication.telemetry
      });
      replicators.set(room.id, replicator);
    }
    return replicator;
  }

  async function sendCandidate(candidate: ReplicationCandidate, nowMs: number): Promise<ReplicationSendResult> {
    let result: ReplicationSendResult = { sent: false, dropped: false, transportDropped: false, failed: false, bytes: 0 };
    try {
      result = await candidate.room.runExclusive(() => {
        if (!candidate.room.ctx.players.has(candidate.player.id) || clients.get(candidate.player.id) !== candidate.clientState) return result;
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
        const sendResult = sendReplicationPacket(options, candidate.clientState, packet, nextState, nowMs);
        if (sendResult.sent) {
          const deltaPhaseMs = options.defaults.phase && candidate.initialSnapshot ? replicationPhaseMs(candidate.player.id, candidate.deltaIntervalMs, 0xd17a) : 0;
          candidate.clientState.nextDeltaAt = nowMs + candidate.deltaIntervalMs + deltaPhaseMs;
          if (candidate.dueSnapshot) {
            const phaseMs = options.defaults.phase && candidate.initialSnapshot ? replicationPhaseMs(candidate.player.id, candidate.snapshotIntervalMs, 0x5a9) : 0;
            candidate.clientState.nextSnapshotAt = nowMs + candidate.snapshotIntervalMs + phaseMs;
          }
          try {
            candidate.room.replicationSent(candidate.player.id, {
              sequence: packet.sequence,
              baseline: packet.baseline,
              kind: replicationReceiptKind(packet.kind),
              segments: packet.segments,
              now: nowMs
            });
          } catch (error) {
            options.metrics.record("replication.sent_hook_error", 1, { roomId: candidate.room.id });
            options.log("warn", "replication sent hook failed", { roomId: candidate.room.id, playerId: candidate.player.id, error });
          }
        }
        if (sendResult.sent) options.metrics.record("replication.bytes_per_client", sendResult.bytes, { roomId: candidate.room.id });
        if (packet.deferredSegments) options.metrics.record("replication.deferred_segments", packet.deferredSegments, { roomId: candidate.room.id });
        if (sendResult.dropped) options.metrics.record("replication.dropped_budget", 1, { roomId: candidate.room.id });
        return sendResult;
      });
    } catch (error) {
      candidate.clientState.lastAttemptAt = nowMs;
      candidate.clientState.forceSnapshot = true;
      options.metrics.record("replication.candidate_error", 1, { roomId: candidate.room.id });
      options.log("warn", "replication candidate failed", { roomId: candidate.room.id, playerId: candidate.player.id, error });
    }
    if (result.failed) {
      if (options.onTransportFailure && candidate.clientState.socket) await options.onTransportFailure(candidate.clientState.socket);
      else await options.leavePlayer(candidate.player.id, "replication-send-failed");
    }
    return result;
  }

  async function sendScheduled(candidates: ReplicationCandidate[], nowMs: number) {
    const result = await sendScheduledReplicationCandidates({
      candidates,
      nowMs,
      defaults: options.defaults,
      directScheduledCursor: options.directScheduledCursor,
      playerCursors,
      roomCursor,
      sendCandidate,
    });
    roomCursor = result.roomCursor;
    return result.sent;
  }

  async function stream(nowMs: number) {
    if (!options.defaults.binary) return;
    const immediate: ReplicationCandidate[] = [];
    const scheduled: ReplicationCandidate[] = [];
    for (const room of options.rooms.values()) {
      const roomReplication = replicationFor(room);
      const snapshotInterval = 1000 / Math.max(1, roomReplication.snapshotRate);
      const deltaInterval = 1000 / Math.max(1, roomReplication.deltaRate);
      const replicator = replicatorFor(room);
      replicator.beginTick();
      replicator.resetWindow(nowMs);
      for (const player of room.ctx.players.values()) {
        const state = clients.get(player.id);
        if (!state?.socket) continue;
        if (state.lastAttemptAt && nowMs - state.lastAttemptAt < deltaInterval) continue;
        if (state.hasSent && nowMs < state.nextDeltaAt) continue;
        if (!room.type.getReplication && replicator.stats(player.id).bytesThisSecond >= roomReplication.maxBytesPerClientPerSecond) {
          state.lastAttemptAt = nowMs;
          options.metrics.record("replication.dropped_budget", 1, { roomId: room.id });
          continue;
        }
        const initialSnapshot = !state.hasSent;
        const dueSnapshot = !state.hasSent || state.forceSnapshot || nowMs >= state.nextSnapshotAt;
        const candidate = { room, player, clientState: state, replicator, dueSnapshot, initialSnapshot, snapshotIntervalMs: snapshotInterval, deltaIntervalMs: deltaInterval };
        if (initialSnapshot) immediate.push(candidate);
        else scheduled.push(candidate);
      }
    }
    options.metrics.record("replication.candidates_due", immediate.length + scheduled.length);
    sortReplicationCandidates(immediate);
    let sent = 0;
    for (const candidate of immediate) if ((await sendCandidate(candidate, nowMs)).sent) sent += 1;
    sent += await sendScheduled(scheduled, nowMs);
    options.metrics.record("replication.candidates_sent", sent);
    options.metrics.record("replication.backlog", Math.max(0, immediate.length + scheduled.length - sent));
    if (!options.defaults.telemetry) return;
    for (const room of options.rooms.values()) {
      const replication = replicatorFor(room).metrics();
      const adaptive = pressureTracker.update(room.id, replication, nowMs);
      options.metrics.record("replication.volatile_bytes", replication.currentTick.volatileBytes, { roomId: room.id });
      options.metrics.record("replication.static_deferred_bytes", replication.currentTick.staticDeferredBytes, { roomId: room.id });
      options.metrics.record("replication.static_deferred_count", replication.currentTick.staticDeferredCount, { roomId: room.id });
      options.metrics.record("replication.budget_utilization", replication.currentTick.budgetUtilization, { roomId: room.id });
      try {
        await room.runExclusive(() => room.replicationTelemetry({ now: nowMs, replication, adaptive }));
      } catch (error) {
        options.metrics.record("replication.telemetry_hook_error", 1, { roomId: room.id });
        options.log("warn", "replication telemetry hook failed", { roomId: room.id, error });
      }
    }
  }

  return {
    enabledTelemetry: options.defaults.telemetry,
    attach(playerId: string, roomId: string, socket: EngineServerWebSocket<unknown>) {
      clients.set(playerId, {
        playerId,
        roomId,
        socket,
        lastSnapshotAt: 0,
        nextSnapshotAt: 0,
        nextDeltaAt: 0,
        lastSentAt: 0,
        lastAttemptAt: 0,
        hasSent: false,
        forceSnapshot: true
      });
    },
    socketFor(playerId: string) {
      return clients.get(playerId)?.socket;
    },
    async acknowledge(playerId: string, sequence: number) {
      const state = clients.get(playerId);
      if (!state) return false;
      const room = options.rooms.get(state.roomId);
      if (!room || !replicatorFor(room).ack(playerId, sequence)) return false;
      state.lastAck = sequence;
      await room.runExclusive(() => room.replicationAck(playerId, sequence));
      return true;
    },
    removePlayer(playerId: string, roomId: string) {
      clients.delete(playerId);
      replicators.get(roomId)?.removeClient(playerId);
    },
    removeRoom(roomId: string) {
      pressureTracker.remove(roomId);
      playerCursors.delete(roomId);
      replicators.get(roomId)?.clear();
      replicators.delete(roomId);
    },
    clearClients() {
      clients.clear();
    },
    metricsFor(room: AuthoritativeRoom) {
      return replicatorFor(room).metrics();
    },
    adaptiveFor: pressureTracker.read,
    stream
  };
}

function createStaticDeferralPressureTracker() {
  const pressureByRoom = new Map<string, StaticDeferralPressure>();

  function read(roomId: string, replication: ReplicationMetrics): RoomReplicationAdaptiveTelemetry {
    const pressure = pressureByRoom.get(roomId);
    const highForMs = pressure?.highForMs ?? 0;
    const sustained = pressure?.sustained ?? false;
    return {
      staticDeferredCountThreshold: STATIC_DEFERRAL_HIGH_COUNT,
      staticDeferredSustainMs: STATIC_DEFERRAL_SUSTAINED_MS,
      staticDeferralHigh: replication.currentTick.staticDeferredCount > STATIC_DEFERRAL_HIGH_COUNT,
      staticDeferralHighForMs: highForMs,
      staticDeferralSustained: sustained,
      reduceStaticRecordsRecommended: sustained,
      reduceTickRateRecommended: sustained && replication.rollingAverage.budgetUtilization > 0.9,
      reason: sustained
        ? `Static deferral stayed above ${STATIC_DEFERRAL_HIGH_COUNT} records/tick for at least ${STATIC_DEFERRAL_SUSTAINED_MS}ms`
        : ""
    };
  }

  function update(roomId: string, replication: ReplicationMetrics, nowMs: number) {
    const current = pressureByRoom.get(roomId) ?? { highForMs: 0, sustained: false };
    if (replication.currentTick.staticDeferredCount > STATIC_DEFERRAL_HIGH_COUNT) {
      current.highSince ??= nowMs;
      current.highForMs = Math.max(0, nowMs - current.highSince);
      current.sustained = current.highForMs >= STATIC_DEFERRAL_SUSTAINED_MS;
    } else {
      current.highSince = undefined;
      current.highForMs = 0;
      current.sustained = false;
    }
    pressureByRoom.set(roomId, current);
    return read(roomId, replication);
  }

  return { read, update, remove: (roomId: string) => pressureByRoom.delete(roomId) };
}

function effectiveReplicationFor(
  room: AuthoritativeRoom,
  defaults: EffectiveReplicationOptions,
): EffectiveReplicationOptions {
  const roomReplication = room.type.replication;
  return {
    ...defaults,
    snapshotRate: roomReplication?.snapshotRate ?? defaults.snapshotRate,
    deltaRate: roomReplication?.deltaRate ?? defaults.deltaRate,
    maxBytesPerClientPerSecond: roomReplication?.maxBytesPerClientPerSecond ?? defaults.maxBytesPerClientPerSecond
  };
}

function sendReplicationPacket(
  options: Pick<ReplicationControllerOptions, "metrics" | "log">,
  state: ClientReplicationState | undefined,
  packet: ReplicationPacket,
  nextState: unknown,
  nowMs: number,
): ReplicationSendResult {
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
      options.metrics.record("replication.transport_dropped", 1, { roomId: state.roomId });
      return { sent: false, dropped: false, transportDropped: true, failed: false, bytes: 0 };
    }
    if (status === -1) options.metrics.record("replication.backpressure", 1, { roomId: state.roomId });
  } catch (error) {
    state.lastAttemptAt = nowMs;
    state.forceSnapshot = true;
    options.metrics.record("replication.send_error", 1, { roomId: state.roomId });
    options.log("warn", "replication send failed", { roomId: state.roomId, playerId: state.playerId, error });
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

async function sendScheduledReplicationCandidates(input: {
  candidates: ReplicationCandidate[];
  nowMs: number;
  defaults: ReplicationControllerOptions["defaults"];
  directScheduledCursor: boolean | undefined;
  playerCursors: Map<string, number>;
  roomCursor: number;
  sendCandidate(candidate: ReplicationCandidate, nowMs: number): Promise<ReplicationSendResult>;
}) {
  if (!input.candidates.length) return { sent: 0, roomCursor: input.roomCursor };
  if (input.defaults.spread !== "round-robin" || input.defaults.maxClientsPerTick === undefined) {
    sortReplicationCandidates(input.candidates);
    let sent = 0;
    for (const candidate of input.candidates) if ((await input.sendCandidate(candidate, input.nowMs)).sent) sent += 1;
    return { sent, roomCursor: input.roomCursor };
  }
  const limit = Math.max(0, Math.floor(input.defaults.maxClientsPerTick));
  if (limit <= 0) return { sent: 0, roomCursor: input.roomCursor };
  const byRoom = new Map<string, ReplicationCandidate[]>();
  for (const candidate of input.candidates) {
    const bucket = byRoom.get(candidate.room.id) ?? [];
    bucket.push(candidate);
    byRoom.set(candidate.room.id, bucket);
  }
  const buckets = [...byRoom.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([roomId, candidates]) => {
    candidates.sort((a, b) => a.player.id.localeCompare(b.player.id));
    const start = (input.playerCursors.get(roomId) ?? 0) % candidates.length;
    return {
      roomId,
      start,
      attempted: 0,
      candidates: input.directScheduledCursor ? candidates : candidates.slice(start).concat(candidates.slice(0, start))
    };
  });
  let sent = 0;
  let remaining = buckets.reduce((sum, bucket) => sum + bucket.candidates.length, 0);
  let roomCursor = input.roomCursor % buckets.length;
  while (sent < limit && remaining > 0) {
    let selectedIndex = -1;
    for (let scan = 0; scan < buckets.length; scan += 1) {
      const index = (roomCursor + scan) % buckets.length;
      if (buckets[index].attempted < buckets[index].candidates.length) {
        selectedIndex = index;
        break;
      }
    }
    if (selectedIndex < 0) break;
    const bucket = buckets[selectedIndex];
    const candidateIndex = input.directScheduledCursor
      ? (bucket.start + bucket.attempted) % bucket.candidates.length
      : bucket.attempted;
    const candidate = bucket.candidates[candidateIndex];
    bucket.attempted += 1;
    remaining -= 1;
    input.playerCursors.set(bucket.roomId, (bucket.start + bucket.attempted) % bucket.candidates.length);
    roomCursor = (selectedIndex + 1) % buckets.length;
    if ((await input.sendCandidate(candidate, input.nowMs)).sent) sent += 1;
  }
  return { sent, roomCursor };
}

export type ServerReplication = ReturnType<typeof createServerReplication>;
