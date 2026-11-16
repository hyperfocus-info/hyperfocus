import type { PresenceIndex } from "../core/presence-index.ts";
import type { AuthoritativeRoom } from "../core/room.ts";
import type { AuthAdapter, AuthoritativePlayer, JoinDecision, PersistenceAdapter, RoomType } from "../core/types.ts";
import type { ServerMetrics } from "../operations/metrics.ts";
import type { MmoAdmissionOptions } from "../replication/scaling.ts";
import type { EngineServerWebSocket, JoinRoomOptions, JoinRoomResult } from "./server-contract.ts";
import type { ServerReplication } from "./server-replication.ts";
import type { ServerRoomManager } from "./server-rooms.ts";
import { SESSION_SUPERSEDED_CLOSE_CODE } from '../../protocol/messages.ts';

type ServerAdmissionOptions = {
  reconnectGraceMs?: number;
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
  return typeof value === "object" && value !== null && "send" in value && typeof value.send === "function"
    && "close" in value && typeof value.close === "function";
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
  const recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    clearTimeout(recoveryTimers.get(playerId));recoveryTimers.delete(playerId);
    const player = options.presence.get(playerId);
    if (!player) return false;
    delete player.reconnectUntil;
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
    const current = async () => {
      try { return options.auth?.isCurrent === undefined || await options.auth.isCurrent(authResult) === true; }
      catch { return false; }
    };
    return enqueueUserJoin(userId, async () => {
      if (options.isStopping()) return { ok: false, reason: "server stopping" };
      if (!await current()) return { ok: false, reason: 'authentication revoked' };
      const previous = options.presence.byUser(userId);
      if (previous?.reconnectUntil !== undefined) {
        if (options.now() >= previous.reconnectUntil) { await leavePlayer(previous.id, 'reconnect-timeout');return { ok: false, reason: 'reconnect grace expired' }; }
        const room = options.rooms.get(previous.roomId);
        if (!room || join.roomId !== previous.roomId || join.roomType !== room.type.name || (authResult.sessionId ?? `session:${userId}`) !== previous.sessionId || !isServerSocket(join.connection)) return { ok: false, reason: 'reconnect identity or room mismatch' };
        if (closedConnections.has(join.connection)) return { ok: false, reason: 'connection closed' };
        const connection = join.connection;
        const attached = await room.runExclusive(async () => {
          if (!await current()) return false;
          if (options.isStopping() || closedConnections.has(connection) || options.presence.get(previous.id) !== previous || previous.reconnectUntil === undefined || options.now() >= previous.reconnectUntil) return false;
          clearTimeout(recoveryTimers.get(previous.id));recoveryTimers.delete(previous.id);
          previous.connection = connection;delete previous.reconnectUntil;
          playerByConnection.set(connection, previous.id);
          options.replication.attach(previous.id, room.id, connection);
          return true;
        });
        if (!attached) return { ok: false, reason: 'reconnect reservation unavailable' };
        options.metrics.record('server.reconnect', 1);
        return { ok: true, player: previous, room };
      }
      if (previous) {
        options.metrics.record("server.duplicate_login", 1);
        try { await leavePlayer(previous.id, "duplicate-login"); }
        finally {
          if (isServerSocket(previous.connection)) {
            closedConnections.add(previous.connection);
            try { previous.connection.close(SESSION_SUPERSEDED_CLOSE_CODE, 'This account signed in elsewhere. Sign in again to continue.'); }
            catch { /* The previous transport may already be closed. */ }
          }
        }
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
      if (!await current()) return { ok: false, reason: 'authentication revoked' };

      async function attemptRoom(room: AuthoritativeRoom): Promise<JoinRoomResult> {
        if (!await current()) return { ok: false, reason: 'authentication revoked' };
        const player: AuthoritativePlayer = { ...playerBase, roomId: room.id };
        const decision = await room.join(player, join.request, options.roomManager.maxPlayersForRoom(room));
        if (!roomAllowed(decision)) return { ok: false, reason: roomReason(decision) ?? "join rejected" };
        if (!await current()) {
          await room.leave(player.id, 'authentication-revoked');
          return { ok: false, reason: 'authentication revoked' };
        }
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
    if (closedConnections.has(socket)) return undefined;
    const mappedPlayerId = playerByConnection.get(socket);
    if (!mappedPlayerId || !options.presence.get(mappedPlayerId)) return undefined;
    return mappedPlayerId;
  }

  async function closeConnection(socket: EngineServerWebSocket<unknown>, code = 1006) {
    closedConnections.add(socket);
    const playerId = playerByConnection.get(socket);
    if (!playerId) return;
    const owner = options.presence.get(playerId);if (!owner) return;
    await enqueueUserJoin(owner.userId, async () => {
      if (options.presence.get(playerId) !== owner || owner.connection !== socket) return;
      playerByConnection.delete(socket);socket.data = {};
      options.replication.removePlayer(playerId, owner.roomId);
      const grace = options.reconnectGraceMs ?? 0, room = options.rooms.get(owner.roomId);
      if (!grace || ![1001, 1006, 1011, 1012, 1013, 4002].includes(code) || options.isStopping() || !room) { await leavePlayer(playerId, options.isStopping() ? 'server-stop' : code === 1000 ? 'leave' : grace ? 'connection-close' : 'disconnect');return; }
      await room.runExclusive(() => { owner.connection = undefined;owner.reconnectUntil = options.now() + grace; });
      const expire = () => {
        void enqueueUserJoin(owner.userId, async () => {
          if (options.presence.get(playerId) !== owner || owner.reconnectUntil === undefined) return;
          const remaining = owner.reconnectUntil - options.now();
          if (remaining > 0) { recoveryTimers.set(playerId, setTimeout(expire, remaining));return; }
          await leavePlayer(playerId, 'reconnect-timeout');
        }).catch(() => options.metrics.record('server.reconnect_expiry_error', 1));
      };
      recoveryTimers.set(playerId, setTimeout(expire, grace));
      options.metrics.record('server.reconnect_wait', 1);
    });
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
