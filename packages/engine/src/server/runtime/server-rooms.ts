import { createProtocolMessage, encodeProtocolMessage } from "../../protocol/messages.ts";
import type { PresenceIndex } from "../core/presence-index.ts";
import { createAuthoritativeRoom, type AuthoritativeRoom } from "../core/room.ts";
import type { PersistenceAdapter, RoomType } from "../core/types.ts";
import type { ServerMetrics } from "../operations/metrics.ts";
import type { MmoAdmissionOptions } from "../replication/scaling.ts";
import { createWorkerRoomHost, type WorkerRoomHost } from "../routing/worker-room.ts";
import { createDurableEventOutbox } from "./durable-event-outbox.ts";
import type { CreateRoomOptions, EngineServerWebSocket } from "./server-contract.ts";
import type { ServerReplication } from "./server-replication.ts";

type ServerRoomManagerOptions = {
  roomTypes: Map<string, RoomType>;
  defaultRoomType?: string;
  rooms: Map<string, AuthoritativeRoom>;
  managedAdmissionRoomIds: Set<string>;
  workerRooms: Map<string, WorkerRoomHost>;
  admission?: MmoAdmissionOptions;
  effectiveTickRate: number;
  effectiveMaxPlayersPerRoom: number;
  persistence?: PersistenceAdapter;
  presence: PresenceIndex;
  replication: ServerReplication;
  metrics: ServerMetrics;
  now(): number;
  isStopping(): boolean;
  log(level: "warn" | "error", message: string, data?: unknown): void;
  stableRoomOrder: boolean;
  durableEvents: {
    maxPending: number;
    batchSize: number;
  };
};

let nextRoomId = 1;

export function createServerRoomManager(options: ServerRoomManagerOptions) {
  let orderedRoomCache: AuthoritativeRoom[] = [];
  let orderedRoomCacheDirty = true;
  const durableEvents = createDurableEventOutbox({
    persistence: options.persistence,
    maxPending: options.durableEvents.maxPending,
    batchSize: options.durableEvents.batchSize,
    onError(error) {
      options.metrics.record("persistence.append_event_error", 1);
      options.log("warn", "durable event persistence failed", { error });
    }
  });

  function markRoomOrderDirty() {
    orderedRoomCacheDirty = true;
  }

  function orderedRooms() {
    if (!options.stableRoomOrder) return [...options.rooms.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (orderedRoomCacheDirty) {
      orderedRoomCache = [...options.rooms.values()].sort((a, b) => a.id.localeCompare(b.id));
      orderedRoomCacheDirty = false;
    }
    return orderedRoomCache;
  }

  function recordAdmissionRoomLoads() {
    if (!options.admission) return;
    for (const roomId of [...options.managedAdmissionRoomIds].sort((a, b) => a.localeCompare(b))) {
      options.metrics.record("server.admission.room_load", options.rooms.get(roomId)?.ctx.players.size ?? 0, { roomId });
    }
  }

  async function flushBroadcasts(room: AuthoritativeRoom) {
    let broadcasts: Array<{ event: unknown; durability: "transient" | "durable" }>;
    let recipients: Array<{ playerId: string; socket: EngineServerWebSocket<unknown> }>;
    try {
      ({ broadcasts, recipients } = await room.runExclusive(() => ({
        broadcasts: room.drainBroadcasts(),
        recipients: [...room.ctx.players.values()]
          .map((player) => ({ playerId: player.id, socket: options.replication.socketFor(player.id) }))
          .filter((recipient): recipient is { playerId: string; socket: EngineServerWebSocket<unknown> } => recipient.socket !== undefined)
      })));
    } catch (error) {
      options.metrics.record("server.broadcast_drain_error", 1, { roomId: room.id });
      options.log("warn", "room broadcast drain failed", { roomId: room.id, error });
      return;
    }
    if (!broadcasts.length) return;
    for (const broadcast of broadcasts) {
      const { event } = broadcast;
      let encoded: string;
      try {
        encoded = encodeProtocolMessage(createProtocolMessage("event", event, { roomId: room.id }));
      } catch (error) {
        options.metrics.record("server.broadcast_encode_error", 1, { roomId: room.id });
        options.log("warn", "room broadcast encoding failed", { roomId: room.id, error });
        continue;
      }
      if (broadcast.durability === "durable") {
        const accepted = durableEvents.enqueue({ roomId: room.id, roomType: room.type.name, at: options.now(), event });
        if (!accepted) {
          options.metrics.record("persistence.append_event_overflow", 1, { roomId: room.id });
          options.log("warn", "durable event outbox rejected a room event", { roomId: room.id, pending: durableEvents.pending() });
          continue;
        }
      }
      for (const recipient of recipients) {
        try {
          const status = recipient.socket.send(encoded);
          if (status === 0) {
            options.metrics.record("server.broadcast_dropped", 1, { roomId: room.id });
            continue;
          }
          if (status === -1) options.metrics.record("server.broadcast_backpressure", 1, { roomId: room.id });
        } catch (error) {
          options.metrics.record("server.broadcast_error", 1, { roomId: room.id });
          options.log("warn", "room broadcast failed", { roomId: room.id, playerId: recipient.playerId, error });
        }
      }
    }
    options.metrics.record("server.broadcast", broadcasts.length, { roomId: room.id });
  }

  async function disposeRoom(room: AuthoritativeRoom, reason: string, idleAt?: number) {
    let didDispose = idleAt === undefined;
    try {
      if (idleAt === undefined) await room.dispose(reason);
      else didDispose = await room.disposeIfIdle(idleAt, reason);
    } catch (error) {
      options.metrics.record("server.room_dispose_error", 1, { roomId: room.id });
      options.log("error", "room disposal failed", { roomId: room.id, error });
    }
    if (!didDispose) return false;
    if (options.rooms.get(room.id) === room) {
      options.rooms.delete(room.id);
      markRoomOrderDirty();
    }
    options.replication.removeRoom(room.id);
    options.workerRooms.get(room.id)?.close();
    options.workerRooms.delete(room.id);
    return true;
  }

  function normalizeCreateOptions(typeNameOrOptions: string | CreateRoomOptions, roomId?: string): CreateRoomOptions {
    if (typeof typeNameOrOptions === "string") return { typeName: typeNameOrOptions, roomId };
    return typeNameOrOptions;
  }

  function createRoom(typeNameOrOptions: string | CreateRoomOptions, roomId?: string) {
    if (options.isStopping()) throw new Error("server has been stopped");
    const createOptions = normalizeCreateOptions(typeNameOrOptions, roomId);
    const typeName = createOptions.typeName ?? createOptions.roomType ?? options.defaultRoomType;
    if (!typeName) throw new Error("room type is required");
    const resolvedRoomId = createOptions.roomId ?? `${typeName}-${nextRoomId++}`;
    const roomType = options.roomTypes.get(typeName);
    if (!roomType) throw new Error(`unknown room type: ${typeName}`);
    const existing = options.rooms.get(resolvedRoomId);
    if (existing) {
      if (existing.type.name !== typeName) throw new Error(`room ${resolvedRoomId} already exists with type ${existing.type.name}`);
      return existing;
    }
    const room = createAuthoritativeRoom({
      id: resolvedRoomId,
      type: roomType,
      now: options.now,
      metrics: options.metrics,
      persistence: options.persistence
    });
    options.rooms.set(resolvedRoomId, room);
    markRoomOrderDirty();
    if (createOptions.worker) {
      const host = createWorkerRoomHost({
        roomId: resolvedRoomId,
        script: createOptions.workerScript,
        sharedBuffer: createOptions.sharedBuffer,
        sharedBufferBytes: createOptions.sharedBufferBytes,
        tickRate: createOptions.tickRate ?? options.effectiveTickRate,
        onEvent(event) {
          options.metrics.record("worker_room.event", 1, { roomId: resolvedRoomId, type: event.type });
        }
      });
      options.workerRooms.set(resolvedRoomId, host);
    }
    return room;
  }

  function ensureManagedAdmissionRooms() {
    if (!options.admission) return;
    for (let index = 0; index < options.admission.rooms; index += 1) {
      const roomId = `${options.admission.roomIdPrefix}-${index}`;
      options.managedAdmissionRoomIds.add(roomId);
      createRoom(options.admission.roomType, roomId);
    }
    recordAdmissionRoomLoads();
  }

  function maxPlayersForRoom(room: AuthoritativeRoom) {
    if (options.managedAdmissionRoomIds.has(room.id) && options.admission) return options.admission.playersPerRoom;
    return room.type.maxPlayers ?? options.effectiveMaxPlayersPerRoom;
  }

  async function tick(dt: number) {
    for (const room of orderedRooms()) {
      await room.update(dt);
      await flushBroadcasts(room);
      if (!options.managedAdmissionRoomIds.has(room.id) && room.shouldDispose(options.now())) {
        await disposeRoom(room, "idle", options.now());
      }
    }
    await options.replication.stream(options.now());
    recordAdmissionRoomLoads();
    options.metrics.gauge("server.rooms", options.rooms.size);
    options.metrics.gauge("server.players", options.presence.count());
  }

  return {
    createRoom,
    disposeRoom,
    ensureManagedAdmissionRooms,
    maxPlayersForRoom,
    recordAdmissionRoomLoads,
    flushPersistence: () => durableEvents.flush(),
    tick
  };
}

export type ServerRoomManager = ReturnType<typeof createServerRoomManager>;
