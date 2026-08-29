import { connectAuthoritative, type AuthoritativeClient } from "@hyperfocus/engine/net";
import { normalizeThreeArenaStateSnapshot, threeArenaStateSchema, type ThreeArenaStateSnapshot } from "../binary-state.ts";

const DEFAULT_STATIC_PORT = 8793;
const DEFAULT_WS_PORT = 8794;
const ROOM_TYPE = "three-arena";

type LobbyHandler = (message: Record<string, unknown>) => void;
type StateHandler = (state: ThreeArenaStateSnapshot) => void;

type ConnectionOptions = {
  url?: string;
  roomsUrl?: string;
  name?: string;
};

type Connection = {
  connect(): Promise<void>;
  createRoom(roomId?: string): Promise<void>;
  joinRoom(roomId: string): Promise<void>;
  startRoom(): void;
  listRooms(): Promise<void>;
  sendInput(snapshot: Record<string, unknown>): void;
  input(snapshot: Record<string, unknown>): void;
  onState(callback: StateHandler): () => void;
  onLobby(callback: LobbyHandler): () => void;
  disconnect(): void;
  removeStateHandler(callback: StateHandler): void;
  removeLobbyHandler(callback: LobbyHandler): void;
  readonly socket: null;
  readonly playerId: string | undefined;
  readonly roomId: string | undefined;
  readonly connected: boolean;
};

type RoomStatusMemory = {
  status: string | null;
  startedAt: number;
};

type ConnectionApiBindings = Omit<
  Connection,
  "removeStateHandler" | "removeLobbyHandler" | "socket" | "playerId" | "roomId" | "connected"
> & {
  stateHandlers: Set<StateHandler>;
  lobbyHandlers: Set<LobbyHandler>;
  readPlayerId(): string | undefined;
  readRoomId(): string | undefined;
  readConnected(): boolean;
};

let activeConnection: Connection | null = null;
const globalStateHandlers = new Set<StateHandler>();
const globalLobbyHandlers = new Set<LobbyHandler>();

export async function connectLobby(options: ConnectionOptions = {}) {
  if (activeConnection) activeConnection.disconnect();

  const connection = createConnection(options);
  activeConnection = connection;
  await connection.connect();
  if (activeConnection !== connection) throw new Error("Lobby connection was superseded by a newer connection.");
  return connection;
}

export function createRoom(roomId?: string) {
  return requireConnection().createRoom(roomId);
}

export function joinRoom(roomId: string) {
  return requireConnection().joinRoom(roomId);
}

export function startRoom() {
  return requireConnection().startRoom();
}

export function sendInput(snapshot: Record<string, unknown>) {
  return requireConnection().sendInput(snapshot);
}

export function listRooms() {
  return requireConnection().listRooms();
}

export function input(snapshot: Record<string, unknown>) {
  return sendInput(snapshot);
}

export function onState(callback: StateHandler) {
  assertCallback(callback);
  globalStateHandlers.add(callback);
  const removeActive = activeConnection ? activeConnection.onState(callback) : null;
  return () => {
    globalStateHandlers.delete(callback);
    if (removeActive) removeActive();
    activeConnection?.removeStateHandler(callback);
  };
}

export function onLobby(callback: LobbyHandler) {
  assertCallback(callback);
  globalLobbyHandlers.add(callback);
  const removeActive = activeConnection ? activeConnection.onLobby(callback) : null;
  return () => {
    globalLobbyHandlers.delete(callback);
    if (removeActive) removeActive();
    activeConnection?.removeLobbyHandler(callback);
  };
}

export function disconnect() {
  if (!activeConnection) return;
  activeConnection.disconnect();
  activeConnection = null;
}

function createConnection({ url, roomsUrl, name }: ConnectionOptions = {}) {
  const stateHandlers = new Set<StateHandler>(globalStateHandlers);
  const lobbyHandlers = new Set<LobbyHandler>(globalLobbyHandlers);
  const clientNonce = crypto.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const playerName = cleanName(name);
  const wsUrl = authoritativeUrl(url);
  const roomsEndpoint = roomsListUrl(roomsUrl, wsUrl);

  let client: AuthoritativeClient | null = null;
  let playerId: string | undefined;
  let roomId: string | undefined;
  let connected = false;
  let closed = false;
  let lastState: ThreeArenaStateSnapshot | null = null;
  let lastLobby: Record<string, unknown> | null = null;
  let lastRooms: Array<Record<string, unknown>> = [];
  const roomStatus: RoomStatusMemory = { status: null, startedAt: 0 };
  let cancelPendingJoin: ((error: Error) => void) | null = null;
  let joinGeneration = 0;

  async function connect() {
    connected = true;
    closed = false;
    emitLobby({ type: "connection", connected: true, playerId, roomId, rooms: lastRooms });
    await listRooms();
  }

  async function createRoom(roomIdValue?: string) {
    try {
      const targetRoomId = cleanRoomId(roomIdValue) ?? makeId("room");
      const rooms = await fetchRooms();
      if (rooms.some((room) => room.id === targetRoomId)) {
        emitLobby({ type: "error", code: "room_exists", message: "Room already exists.", rooms });
        return;
      }
      await connectRoom(targetRoomId);
    } catch (error) {
      emitLobby({ type: "error", code: "create_failed", message: error instanceof Error ? error.message : String(error), rooms: lastRooms });
    }
  }

  async function joinRoom(roomIdValue: string) {
    try {
      const targetRoomId = cleanRoomId(roomIdValue);
      if (!targetRoomId) {
        emitLobby({ type: "error", code: "bad_room", message: "Room id required.", rooms: lastRooms });
        return;
      }

      const rooms = await fetchRooms();
      if (!rooms.some((room) => room.id === targetRoomId)) {
        emitLobby({ type: "error", code: "missing_room", message: "Room not found.", rooms });
        return;
      }
      await connectRoom(targetRoomId);
    } catch (error) {
      emitLobby({ type: "error", code: "join_failed", message: error instanceof Error ? error.message : String(error), rooms: lastRooms });
    }
  }

  async function connectRoom(targetRoomId: string) {
    const generation = ++joinGeneration;
    cancelPendingJoin?.(new Error("Join superseded by a newer room request."));
    cancelPendingJoin = null;
    client?.close();
    client = null;
    playerId = undefined;
    roomId = targetRoomId;
    lastState = null;
    roomStatus.status = null;
    roomStatus.startedAt = 0;

    const nextClient = connectAuthoritative({
      url: wsUrl,
      token: `dev:${playerName}-${clientNonce}`,
      roomId: targetRoomId,
      roomType: ROOM_TYPE,
      request: { name: playerName },
      schema: threeArenaStateSchema,
    });
    client = nextClient;

    const joinWaiter = createRoomJoinWaiter(nextClient, targetRoomId, (payload, fallbackRoomId) => {
      playerId = typeof payload.playerId === "string" ? payload.playerId : playerId;
      roomId = typeof payload.roomId === "string" ? payload.roomId : fallbackRoomId;
      emitLobby({ type: "joined", connected, playerId, roomId, rooms: lastRooms });
    });
    cancelPendingJoin = joinWaiter.cancel;

    nextClient.onMessage((message) => {
      if (message.type !== "error") return;
      const payload = objectFrom(message.payload);
      emitLobby({ type: "error", code: "server_error", message: String(payload.reason ?? "Server error."), rooms: lastRooms, playerId, roomId });
    });
    nextClient.onSnapshot((state) => handleSnapshot(state));
    nextClient.onDelta((state) => handleSnapshot(state));

    try {
      await nextClient.connect();
      await joinWaiter.joined;
      if (client !== nextClient || closed || generation !== joinGeneration) throw new Error("Join cancelled.");
      if (cancelPendingJoin === joinWaiter.cancel) cancelPendingJoin = null;
      await listRooms();
    } catch (error) {
      joinWaiter.cancel(error instanceof Error ? error : new Error(String(error)));
      if (cancelPendingJoin === joinWaiter.cancel) cancelPendingJoin = null;
      if (client === nextClient) client = null;
      nextClient.close();
      if (!closed && generation === joinGeneration) {
        emitLobby({ type: "error", code: "join_failed", message: error instanceof Error ? error.message : String(error), rooms: lastRooms });
      }
    }
  }

  const startRoom = () => client?.sendEvent({ type: "startRoom" });

  async function listRooms() {
    try {
      const rooms = await fetchRooms();
      emitLobby({ type: "lobby", connected, playerId, roomId, rooms });
    } catch (error) {
      emitLobby({ type: "error", code: "rooms_failed", message: error instanceof Error ? error.message : String(error), rooms: lastRooms });
    }
  }

  function sendInput(snapshot: Record<string, unknown>) {
    if (!client || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return;
    client.sendInput(snapshot);
  }

  function onState(callback: StateHandler) {
    assertCallback(callback);
    stateHandlers.add(callback);
    if (lastState) safeCall(callback, lastState);
    return () => stateHandlers.delete(callback);
  }

  function onLobby(callback: LobbyHandler) {
    assertCallback(callback);
    lobbyHandlers.add(callback);
    if (lastLobby) safeCall(callback, lastLobby);
    return () => lobbyHandlers.delete(callback);
  }

  function disconnect() {
    joinGeneration += 1;
    closed = true;
    connected = false;
    if (activeConnection === api) activeConnection = null;
    cancelPendingJoin?.(new Error("Connection closed."));
    cancelPendingJoin = null;
    client?.close();
    client = null;
    emitLobby({ type: "disconnect", connected: false, playerId, roomId, rooms: lastRooms });
  }

  async function fetchRooms() {
    lastRooms = await fetchRoomList(roomsEndpoint);
    return lastRooms;
  }

  function handleSnapshot(value: unknown) {
    const snapshot = normalizeSnapshot(value, roomId);
    roomId = snapshot.roomId || roomId;
    lastState = snapshot;
    emit(stateHandlers, snapshot);
    projectRoomStatus(snapshot, roomStatus, { connected, playerId, rooms: lastRooms, emitLobby });
  }

  function emitLobby(message: Record<string, unknown>) {
    if (closed && message.type !== "disconnect") return;
    lastLobby = message;
    emit(lobbyHandlers, message);
  }

  const api: Connection = createConnectionApi({
    connect,
    createRoom,
    joinRoom,
    startRoom,
    listRooms,
    sendInput,
    input: sendInput,
    onState,
    onLobby,
    disconnect,
    stateHandlers,
    lobbyHandlers,
    readPlayerId: () => playerId,
    readRoomId: () => roomId,
    readConnected: () => connected,
  });

  return api;
}

function createRoomJoinWaiter(
  client: AuthoritativeClient,
  fallbackRoomId: string,
  onAccepted: (payload: Record<string, unknown>, fallbackRoomId: string) => void,
) {
  let cancelWait = (_error = new Error("Join cancelled.")) => {};
  const joined = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      remove();
      reject(new Error("Timed out joining room."));
    }, 8_000);
    const remove = client.onMessage((message) => {
      if (message.type === "join_accepted") {
        clearTimeout(timeout);
        remove();
        onAccepted(objectFrom(message.payload), fallbackRoomId);
        resolve();
        return;
      }
      if (message.type === "join_rejected" || message.type === "error") {
        clearTimeout(timeout);
        remove();
        const payload = objectFrom(message.payload);
        reject(new Error(String(payload.reason ?? "Join rejected.")));
      }
    });
    cancelWait = (error = new Error("Join cancelled.")) => {
      clearTimeout(timeout);
      remove();
      reject(error);
    };
  });
  void joined.catch(() => undefined);
  return { joined, cancel: (error = new Error("Join cancelled.")) => cancelWait(error) };
}

async function fetchRoomList(endpoint: string) {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Room list failed (${response.status}).`);
  const body = await response.json();
  const rooms = Array.isArray(body) ? body : Array.isArray(body?.rooms) ? body.rooms : [];
  return rooms.filter(
    (room: unknown): room is Record<string, unknown> => Boolean(room) && typeof room === "object" && !Array.isArray(room),
  );
}

function projectRoomStatus(
  snapshot: ThreeArenaStateSnapshot,
  memory: RoomStatusMemory,
  context: {
    connected: boolean;
    playerId: string | undefined;
    rooms: Array<Record<string, unknown>>;
    emitLobby: (message: Record<string, unknown>) => void;
  },
) {
  context.emitLobby({
    type: "room_status",
    connected: context.connected,
    playerId: context.playerId,
    roomId: snapshot.roomId,
    players: snapshot.players.length,
    hostId: snapshot.hostId,
    status: snapshot.status,
    seed: snapshot.seed,
    startedAt: snapshot.startedAt || null,
    rooms: context.rooms,
  });

  const startedAt = Number(snapshot.startedAt) || 0;
  if (snapshot.status === "running" && (memory.status !== "running" || startedAt !== memory.startedAt)) {
    memory.startedAt = startedAt;
    context.emitLobby({
      type: "room_started",
      connected: context.connected,
      playerId: context.playerId,
      roomId: snapshot.roomId,
      hostId: snapshot.hostId,
      seed: snapshot.seed,
      startedAt,
      rooms: context.rooms,
    });
  }
  memory.status = snapshot.status;
}

function createConnectionApi(bindings: ConnectionApiBindings): Connection {
  return {
    connect: bindings.connect,
    createRoom: bindings.createRoom,
    joinRoom: bindings.joinRoom,
    startRoom: bindings.startRoom,
    listRooms: bindings.listRooms,
    sendInput: bindings.sendInput,
    input: bindings.input,
    onState: bindings.onState,
    onLobby: bindings.onLobby,
    disconnect: bindings.disconnect,
    removeStateHandler: (callback) => bindings.stateHandlers.delete(callback),
    removeLobbyHandler: (callback) => bindings.lobbyHandlers.delete(callback),
    get socket() {
      return null;
    },
    get playerId() {
      return bindings.readPlayerId();
    },
    get roomId() {
      return bindings.readRoomId();
    },
    get connected() {
      return bindings.readConnected();
    },
  };
}

function requireConnection() {
  if (!activeConnection) throw new Error("connectLobby() must be called first.");
  return activeConnection;
}

function emit<T>(handlers: Set<(message: T) => void>, message: T) {
  for (const handler of Array.from(handlers)) safeCall(handler, message);
}

function safeCall<T>(callback: (value: T) => void, value: T) {
  try {
    callback(value);
  } catch (error) {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

function normalizeSnapshot(value: unknown, fallbackRoomId?: string): ThreeArenaStateSnapshot {
  return normalizeThreeArenaStateSnapshot(value, { fallbackRoomId, fallbackTime: performance.now() });
}

function objectFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authoritativeUrl(rawUrl?: string) {
  const hasLocation = typeof location !== "undefined" && location.host && location.protocol !== "file:";
  const defaultProtocol = hasLocation && location.protocol === "https:" ? "wss:" : "ws:";
  const defaultHost = hasLocation ? `${location.hostname}:${defaultWsPort()}` : `localhost:${DEFAULT_WS_PORT}`;
  let value = rawUrl || `${defaultProtocol}//${defaultHost}`;

  if (typeof value !== "string") value = String(value);
  if (!/^[a-z]+:/i.test(value) && !value.startsWith("/")) value = `ws://${value}`;

  const base = hasLocation ? `${defaultProtocol}//${defaultHost}/` : `${defaultProtocol}//${defaultHost}/`;
  const parsed = new URL(value, base);
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") throw new TypeError("Authoritative URL must use ws:, wss:, http:, or https:.");
  if (!parsed.pathname || parsed.pathname === "/") parsed.pathname = "/";
  return parsed.toString();
}

function roomsListUrl(rawRoomsUrl: string | undefined, wsUrl: string) {
  if (rawRoomsUrl) return new URL(rawRoomsUrl, locationSafeHref()).toString();
  if (typeof location !== "undefined" && location.origin && location.protocol !== "file:") return new URL("/rooms.json", location.origin).toString();
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.port = parsed.port === String(DEFAULT_WS_PORT) ? String(DEFAULT_STATIC_PORT) : parsed.port;
  parsed.pathname = "/rooms.json";
  parsed.search = "";
  return parsed.toString();
}

function locationSafeHref() {
  return typeof location !== "undefined" && location.href ? location.href : `http://localhost:${DEFAULT_STATIC_PORT}/`;
}

function defaultWsPort() {
  if (typeof location === "undefined") return DEFAULT_WS_PORT;
  const staticPort = Number(location.port || (location.protocol === "https:" ? 443 : 80));
  if (!Number.isSafeInteger(staticPort) || staticPort <= 0 || staticPort >= 65_535) return DEFAULT_WS_PORT;
  return staticPort + 1;
}

function makeId(prefix: string): string {
  const randomId = crypto.randomUUID?.();
  return `${prefix}-${randomId ? randomId.slice(0, 8) : Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

function cleanRoomId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return cleaned || null;
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Hunter";
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return cleaned || "Hunter";
}

function assertCallback(callback: unknown) {
  if (typeof callback !== "function") throw new TypeError("Callback must be a function.");
}
