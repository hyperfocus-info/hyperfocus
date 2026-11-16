import { createDevAuthAdapter } from "./core/auth.ts";
import { createServerClock } from "./core/clock.ts";
import { createPresenceIndex } from "./core/presence-index.ts";
import type { AuthoritativeRoom } from "./core/room.ts";
import { createServerMetrics } from "./operations/metrics.ts";
import { validateMmoAdmissionOptions, validateMmoScalePreset } from "./replication/scaling.ts";
import { createServerAdmission, type ServerAdmission } from "./runtime/server-admission.ts";
import type { AuthoritativeServer, AuthoritativeServerOptions, EffectiveReplicationOptions } from "./runtime/server-contract.ts";
import { createServerReplication } from "./runtime/server-replication.ts";
import { createServerRoomManager } from "./runtime/server-rooms.ts";
import { createAuthoritativeWebSocketServer } from "./transport/authoritative-websocket.ts";
import type { WorkerRoomHost } from "./routing/worker-room.ts";

export type { AuthoritativeServer, AuthoritativeServerOptions, JoinRoomResult } from "./runtime/server-contract.ts";

function telemetryWarnings(value: unknown) {
  if (typeof value !== "object" || value === null || !("warnings" in value)) return [];
  const warnings = value.warnings;
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

function assertPositiveSafeInteger(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new RangeError(`${name} must be a positive safe integer`);
}

function validateServerOptions(options: AuthoritativeServerOptions) {
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 0xffff) throw new RangeError("port must be an integer from 0 through 65535");
  if (!Array.isArray(options.rooms) || options.rooms.length === 0) throw new Error("at least one room type is required");
  if (options.binaryInputPayloadOwnership !== undefined
    && options.binaryInputPayloadOwnership !== "copy"
    && options.binaryInputPayloadOwnership !== "borrow") {
    throw new Error("binaryInputPayloadOwnership must be copy or borrow");
  }
  assertPositiveFinite("tickRate", options.tickRate);
  if (options.reconnectGraceMs !== undefined && (!Number.isSafeInteger(options.reconnectGraceMs) || options.reconnectGraceMs < 0 || options.reconnectGraceMs > 30000)) throw new RangeError('reconnectGraceMs must be an integer from 0 through 30000.');
  assertNonNegativeSafeInteger("maxPlayersPerRoom", options.maxPlayersPerRoom);
  assertNonNegativeSafeInteger("maxCatchUpTicks", options.maxCatchUpTicks);
  assertPositiveSafeInteger("durableEvents.maxPending", options.durableEvents?.maxPending);
  assertPositiveSafeInteger("durableEvents.batchSize", options.durableEvents?.batchSize);
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

function resolveReplicationOptions(options: AuthoritativeServerOptions, effectiveTickRate: number, scale: ReturnType<typeof validateMmoScalePreset> | undefined): EffectiveReplicationOptions {
  return {
    snapshotRate: options.replication?.snapshotRate ?? scale?.replication.snapshotRate ?? 2,
    deltaRate: options.replication?.deltaRate ?? scale?.replication.deltaRate ?? effectiveTickRate,
    maxBytesPerClientPerSecond: options.replication?.maxBytesPerClientPerSecond ?? scale?.replication.maxBytesPerClientPerSecond ?? 32768,
    binary: options.replication?.binary ?? scale?.replication.binary ?? true,
    maxClientsPerTick: options.replication?.maxClientsPerTick ?? scale?.replication.maxClientsPerTick,
    spread: options.replication?.spread ?? scale?.replication.spread ?? "none",
    phase: options.replication?.phase ?? scale?.replication.phase ?? false,
    telemetry: options.replication?.telemetry ?? (envFlag("ENGINE_REPLICATION_TELEMETRY") || envFlag("MMO_REPLICATION_TELEMETRY"))
  };
}

function resolveServerRuntimeOptions(options: AuthoritativeServerOptions) {
  const scale = options.scale ? validateMmoScalePreset(options.scale) : undefined;
  const explicitAdmission = options.admission ? validateMmoAdmissionOptions(options.admission) : undefined;
  const baseAdmission = explicitAdmission ?? scale?.admission;
  const admissionOptions = baseAdmission
    ? validateMmoAdmissionOptions({
        ...baseAdmission,
        playersPerRoom: explicitAdmission?.playersPerRoom ?? options.maxPlayersPerRoom ?? baseAdmission.playersPerRoom,
        softPlayersPerRoom: explicitAdmission?.softPlayersPerRoom ?? Math.min(baseAdmission.softPlayersPerRoom ?? baseAdmission.playersPerRoom, explicitAdmission?.playersPerRoom ?? options.maxPlayersPerRoom ?? baseAdmission.playersPerRoom)
      })
    : undefined;
  const effectiveTickRate = options.tickRate ?? scale?.tickRate ?? 20;
  return {
    admissionOptions,
    effectiveMaxPlayersPerRoom: options.maxPlayersPerRoom ?? explicitAdmission?.playersPerRoom ?? scale?.maxPlayersPerRoom ?? admissionOptions?.playersPerRoom ?? 100,
    effectiveTickRate,
    replicationOptions: resolveReplicationOptions(options, effectiveTickRate, scale)
  };
}

type ServerStatsReaderOptions = {
  clock: ReturnType<typeof createServerClock>;
  getPort(): number;
  metrics: ReturnType<typeof createServerMetrics>;
  presence: ReturnType<typeof createPresenceIndex>;
  replication: ReturnType<typeof createServerReplication>;
  rooms: Map<string, AuthoritativeRoom>;
  workerRooms: Map<string, WorkerRoomHost>;
};

function createServerStatsReader(options: ServerStatsReaderOptions) {
  return function getStats() {
    const roomTelemetry = [...options.rooms.values()].map((room) => {
      const roomData = options.replication.enabledTelemetry ? room.getTelemetry() : undefined;
      const warnings = telemetryWarnings(roomData);
      const roomReplication = options.replication.metricsFor(room);
      const adaptive = options.replication.adaptiveFor(room.id, roomReplication);
      if (options.replication.enabledTelemetry && roomReplication.rollingAverage.staticDeferredCount > adaptive.staticDeferredCountThreshold) warnings.push("Replication static deferral high");
      if (options.replication.enabledTelemetry && adaptive.staticDeferralSustained) warnings.push("Replication static deferral sustained");
      return { id: room.id, type: room.type.name, players: room.ctx.players.size, replication: roomReplication, adaptive, room: roomData, warnings };
    });
    return {
      port: options.getPort(),
      rooms: options.rooms.size,
      players: options.presence.count(),
      clock: options.clock.getStats(),
      metrics: options.metrics.snapshot(),
      metricsDiagnostics: options.metrics.diagnostics(),
      workerRooms: [...options.workerRooms.values()].map((host) => host.getStats()),
      roomTelemetry
    };
  };
}

function createServerLogger(options: AuthoritativeServerOptions) {
  return function log(level: "warn" | "error", message: string, data?: unknown) {
    try {
      options.log?.[level]?.(message, data);
    } catch {
      // Logging must not interrupt authoritative state transitions or cleanup.
    }
  };
}

export function createAuthoritativeServer(options: AuthoritativeServerOptions): AuthoritativeServer {
  validateServerOptions(options);
  const log = createServerLogger(options);
  const metrics = createServerMetrics({ ...options.metricsOptions, sink: options.metrics });
  const now = options.now ?? (() => performance.now());
  const { admissionOptions, effectiveMaxPlayersPerRoom, effectiveTickRate, replicationOptions } = resolveServerRuntimeOptions(options);
  const roomTypes = new Map(options.rooms.map((room) => [room.name, room]));
  const rooms = new Map<string, AuthoritativeRoom>();
  const managedAdmissionRoomIds = new Set<string>();
  const workerRooms = new Map<string, WorkerRoomHost>();
  const presence = createPresenceIndex();
  let bunServer: ReturnType<typeof Bun.serve> | undefined;
  let tickQueue = Promise.resolve();
  let stopping: Promise<void> | undefined;
  let stopRequested = false;
  let clockTickActive = false;
  let clockTickQueuedDt: number | undefined;
  let admission: ServerAdmission;

  function leavePlayer(playerId: string, reason: string) {
    return admission.leavePlayer(playerId, reason);
  }

  const replication = createServerReplication({
    ...((options.reconnectGraceMs ?? 0) > 0 ? { onTransportFailure: (socket: Parameters<ServerAdmission['closeConnection']>[0]) => admission.closeConnection(socket, 1011) } : {}),
    defaults: replicationOptions,
    rooms,
    metrics,
    leavePlayer,
    log,
    directScheduledCursor: envFlag("ENGINE_SERVER_DIRECT_SCHEDULE_CURSOR")
  });
  const roomManager = createServerRoomManager({
    roomTypes,
    defaultRoomType: options.rooms[0]?.name,
    rooms,
    managedAdmissionRoomIds,
    workerRooms,
    admission: admissionOptions,
    effectiveTickRate,
    effectiveMaxPlayersPerRoom,
    persistence: options.persistence,
    presence,
    replication,
    metrics,
    now,
    isStopping: () => stopRequested,
    log,
    stableRoomOrder: envFlag("ENGINE_SERVER_STABLE_ROOM_ORDER"),
    durableEvents: {
      maxPending: options.durableEvents?.maxPending ?? 4096,
      batchSize: options.durableEvents?.batchSize ?? 64
    }
  });
  admission = createServerAdmission({
    reconnectGraceMs: options.reconnectGraceMs,
    auth: options.auth ?? (options.devMode === true ? createDevAuthAdapter() : undefined),
    persistence: options.persistence,
    roomTypes: options.rooms,
    rooms,
    managedAdmissionRoomIds,
    admission: admissionOptions,
    roomManager,
    replication,
    presence,
    metrics,
    now,
    isStopping: () => stopRequested
  });
  roomManager.ensureManagedAdmissionRooms();

  function tick(dt = 1 / effectiveTickRate) {
    if (stopRequested) return Promise.resolve();
    if (!Number.isFinite(dt) || dt < 0) return Promise.reject(new RangeError("server tick dt must be a non-negative finite number"));
    const scheduled = tickQueue.then(() => roomManager.tick(dt));
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
  const getStats = createServerStatsReader({
    clock,
    getPort: () => bunServer?.port ?? options.port,
    metrics,
    presence,
    replication,
    rooms,
    workerRooms
  });

  const api: AuthoritativeServer = {
    start() {
      if (stopRequested) throw new Error("server has been stopped");
      if (!bunServer) {
        bunServer = createAuthoritativeWebSocketServer({
          port: options.port,
          hostname: options.hostname,
          tickRate: effectiveTickRate,
          inputCodec: options.inputCodec,
          binaryInputPayloadOwnership: options.binaryInputPayloadOwnership,
          httpHandler: options.httpHandler,
          requestGuard: options.requestGuard,
          now,
          getStats,
          joinRoom: admission.joinRoom,
          receiveInput: api.receiveInput,
          receiveEvent: api.receiveEvent,
          admission,
          replication
        });
      }
      clock.start();
    },
    stop() {
      if (stopping) return stopping;
      stopRequested = true;
      clockTickQueuedDt = undefined;
      clock.stop();
      bunServer?.stop(true);
      bunServer = undefined;
      for (const host of workerRooms.values()) host.close();
      stopping = (async () => {
        await tickQueue;
        await admission.waitForActiveJoins();
        try {
          await roomManager.flushPersistence();
        } catch (error) {
          metrics.record("server.stop_durable_event_error", 1);
          log("error", "durable events did not flush during shutdown", error);
        }
        for (const player of presence.list()) {
          try {
            await admission.leavePlayer(player.id, "server-stop");
          } catch (error) {
            metrics.record("server.stop_leave_error", 1);
            log("error", "player leave failed during shutdown", { playerId: player.id, error });
          }
        }
        for (const room of [...rooms.values()]) await roomManager.disposeRoom(room, "server-stop");
        workerRooms.clear();
        replication.clearClients();
      })();
      return stopping;
    },
    tick,
    createRoom: roomManager.createRoom,
    joinRoom: admission.joinRoom,
    leavePlayer: admission.leavePlayer,
    async receiveInput(playerId, input) {
      if (stopRequested) return false;
      const player = presence.get(playerId);
      if (!player) return false;
      return (await rooms.get(player.roomId)?.input(playerId, input)) ?? false;
    },
    async receiveEvent(playerId, event) {
      if (stopRequested) return false;
      const player = presence.get(playerId);
      if (!player) return false;
      return (await rooms.get(player.roomId)?.event(playerId, event)) ?? false;
    },
    getStats,
    rooms() {
      return [...rooms.values()];
    },
    workerRooms() {
      return [...workerRooms.values()];
    },
    presence
  };

  return api;
}
