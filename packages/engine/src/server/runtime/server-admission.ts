import type { PresenceIndex } from "../core/presence-index.ts";
import type { AuthoritativeRoom } from "../core/room.ts";
import type { AuthAdapter, AuthoritativePlayer, JoinDecision, PersistenceAdapter, RoomType } from "../core/types.ts";
import type { ServerMetrics } from "../operations/metrics.ts";
import type { MmoAdmissionOptions } from "../replication/scaling.ts";
import type { EngineServerWebSocket, JoinRoomOptions, JoinRoomResult } from "./server-contract.ts";
import type { ServerReplication } from "./server-replication.ts";
import type { ServerRoomManager } from "./server-rooms.ts";

type ServerAdmissionOptions = {
  auth?: AuthAdapter;
  persistence?: PersistenceAdapter;
  roomTypes: readonly RoomType[];
  rooms: Map<string, AuthoritativeRoom>;
  managedAdmissionRoomIds: Set<string>;
  admission?: MmoAdmissionOptions;
  roomManager: ServerRoomManager;
  replication: ServerReplication;
  presence: PresenceIndex;
  metrics: ServerMetrics;
  now(): number;
  isStopping(): boolean;
};

let nextPlayerId = 1;

export function isServerSocket(value: unknown): value is EngineServerWebSocket<unknown> {
  return typeof value === "object" && value !== null && "send" in value && typeof value.send === "function";
}

function roomAllowed(decision: JoinDecision) {
  return decision.ok;
}

function roomReason(decision: JoinDecision) {
  return decision.ok ? undefined : decision.reason;
}

export function createServerAdmission(options: ServerAdmissionOptions) {
  const playerByConnection = new WeakMap<EngineServerWebSocket<unknown>, string>();
  const joiningConnections = new WeakSet<EngineServerWebSocket<unknown>>();
  const closedConnections = new WeakSet<EngineServerWebSocket<unknown>>();
  const userJoinQueues = new Map<string, Promise<void>>();
  const joinIdleWaiters = new Set<() => void>();
  let activeJoins = 0;

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

  function orderAdmissionRooms(rooms: AuthoritativeRoom[]) {
    if (options.admission?.selection === "fill-first") return rooms.sort((a, b) => a.id.localeCompare(b.id));
    return rooms.sort((a, b) => a.ctx.players.size - b.ctx.players.size || a.id.localeCompare(b.id));
  }

  async function leavePlayer(playerId: string, reason = "leave") {
    const player = options.presence.get(playerId);
    if (!player) return false;
    options.presence.remove(playerId);
    options.replication.removePlayer(playerId, player.roomId);
    const room = options.rooms.get(player.roomId);
    if (isServerSocket(player.connection)) {
      if (playerByConnection.get(player.connection) === playerId) playerByConnection.delete(player.connection);
      const data = player.connection.data;
      if (typeof data === "object" && data !== null && "playerId" in data && data.playerId === playerId) player.connection.data = {};
    }
    options.metrics.record("server.leave", 1);
    return (await room?.leave(playerId, reason)) ?? false;
  }

  async function joinRoomInternal(join: JoinRoomOptions): Promise<JoinRoomResult> {
    if (!options.auth) return { ok: false, reason: "auth adapter required outside dev mode" };
    const authResult = await options.auth.verify(join.token);
    if (!authResult.ok || typeof authResult.userId !== "string" || authResult.userId.trim().length === 0) {
      return { ok: false, reason: authResult.reason ?? "auth failed" };
    }
    if (authResult.sessionId !== undefined && (typeof authResult.sessionId !== "string" || authResult.sessionId.trim().length === 0)) {
      return { ok: false, reason: "auth returned an invalid session" };
    }
    const userId = authResult.userId;
    return enqueueUserJoin(userId, async () => {
      if (options.isStopping()) return { ok: false, reason: "server stopping" };
      const previous = options.presence.byUser(userId);
      if (previous) {
        options.metrics.record("server.duplicate_login", 1);
        await leavePlayer(previous.id, "duplicate-login");
      }
      const playerBase = {
        id: `player-${nextPlayerId++}`,
        userId,
        sessionId: authResult.sessionId ?? `session:${userId}`,
        joinedAt: options.now(),
        lastInputAt: options.now(),
        connection: join.connection,
        data: (await options.persistence?.loadPlayer(userId)) ?? undefined
      };
      if (options.isStopping()) return { ok: false, reason: "server stopping" };

      async function attemptRoom(room: AuthoritativeRoom): Promise<JoinRoomResult> {
        const player: AuthoritativePlayer = { ...playerBase, roomId: room.id };
        const decision = await room.join(player, join.request, options.roomManager.maxPlayersForRoom(room));
        if (!roomAllowed(decision)) return { ok: false, reason: roomReason(decision) ?? "join rejected" };
        options.presence.add(player);
        if (isServerSocket(join.connection)) {
          playerByConnection.set(join.connection, player.id);
          options.replication.attach(player.id, room.id, join.connection);
        }
        options.metrics.record("server.join", 1);
        return { ok: true, player, room };
      }

      if (join.roomId) {
        const room = options.rooms.get(join.roomId) ?? options.roomManager.createRoom(join.roomType ?? options.roomTypes[0]?.name, join.roomId);
        if (room.ctx.players.size >= options.roomManager.maxPlayersForRoom(room)) return { ok: false, reason: "room full" };
        return attemptRoom(room);
      }
      if (!options.admission) {
        const room = options.rooms.get("default") ?? options.roomManager.createRoom(join.roomType ?? options.roomTypes[0]?.name, "default");
        if (room.ctx.players.size >= options.roomManager.maxPlayersForRoom(room)) return { ok: false, reason: "room full" };
        return attemptRoom(room);
      }
      const requestedRoomType = join.roomType ?? options.admission.roomType;
      if (requestedRoomType !== options.admission.roomType) return { ok: false, reason: "admission unavailable" };
      const candidates = [...options.managedAdmissionRoomIds]
        .map((roomId) => options.rooms.get(roomId) ?? options.roomManager.createRoom(options.admission!.roomType, roomId))
        .filter((room) => room.type.name === options.admission!.roomType);
      const open = candidates.filter((room) => room.ctx.players.size < options.admission!.playersPerRoom);
      if (!open.length) {
        options.metrics.record("server.admission.rejected_full", 1);
        options.roomManager.recordAdmissionRoomLoads();
        return { ok: false, reason: "world full" };
      }
      const softLimit = options.admission.softPlayersPerRoom ?? options.admission.playersPerRoom;
      const underSoft = open.filter((room) => room.ctx.players.size < softLimit);
      let rejectionReason: string | undefined;
      for (const room of orderAdmissionRooms(underSoft.length ? underSoft : open)) {
        const result = await attemptRoom(room);
        if (result.ok) {
          options.roomManager.recordAdmissionRoomLoads();
          return result;
        }
        rejectionReason = result.reason ?? rejectionReason;
      }
      options.roomManager.recordAdmissionRoomLoads();
      return { ok: false, reason: rejectionReason ?? "join rejected" };
    });
  }

  async function joinRoom(join: JoinRoomOptions): Promise<JoinRoomResult> {
    if (options.isStopping()) return { ok: false, reason: "server stopping" };
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

  function boundPlayerId(socket: EngineServerWebSocket<unknown>) {
    const mappedPlayerId = playerByConnection.get(socket);
    if (!mappedPlayerId || !options.presence.get(mappedPlayerId)) return undefined;
    return mappedPlayerId;
  }

  async function closeConnection(socket: EngineServerWebSocket<unknown>) {
    closedConnections.add(socket);
    const playerId = boundPlayerId(socket);
    if (!playerId) return;
    playerByConnection.delete(socket);
    socket.data = {};
    options.replication.removePlayer(playerId, options.presence.get(playerId)?.roomId ?? "");
    await leavePlayer(playerId, "disconnect");
  }

  return {
    joinRoom,
    leavePlayer,
    boundPlayerId,
    closeConnection,
    waitForActiveJoins() {
      if (activeJoins === 0) return Promise.resolve();
      return new Promise<void>((resolve) => joinIdleWaiters.add(resolve));
    }
  };
}

export type ServerAdmission = ReturnType<typeof createServerAdmission>;
