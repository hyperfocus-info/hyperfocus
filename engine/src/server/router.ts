import type { WorkerRoomEvent, WorkerRoomHost } from "./worker-room.ts";

export type WorldRouterRoom<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  id: string;
  workerRoom?: Pick<WorkerRoomHost<TEvent>, "id" | "post">;
  onEvent?: (event: TEvent) => void;
};

export type WorldTransferResult = {
  ok: boolean;
  clientId: string;
  fromRoomId?: string;
  toRoomId?: string;
  reason?: string;
};

export type WorldRouter<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  registerRoom(room: WorldRouterRoom<TEvent>): void;
  unregisterRoom(roomId: string): boolean;
  addClient(clientId: string, roomId: string): boolean;
  removeClient(clientId: string): boolean;
  transferClient(clientId: string, targetRoomId: string): WorldTransferResult;
  routeEvent(clientId: string, event: TEvent): boolean;
  roomIdFor(clientId: string): string | undefined;
  roomFor(clientId: string): WorldRouterRoom<TEvent> | undefined;
  clientsIn(roomId: string): string[];
  rooms(): WorldRouterRoom<TEvent>[];
};

function eventFor<TEvent extends WorkerRoomEvent>(
  type: string,
  roomId: string,
  clientId: string,
  payload?: Record<string, unknown>
): TEvent {
  const event: WorkerRoomEvent = { type, roomId, clientId };
  if (payload) event.payload = payload;
  return event as TEvent;
}

export function createWorldRouter<TEvent extends WorkerRoomEvent = WorkerRoomEvent>(
  initialRooms: readonly WorldRouterRoom<TEvent>[] = []
): WorldRouter<TEvent> {
  const roomsById = new Map<string, WorldRouterRoom<TEvent>>();
  const roomClients = new Map<string, Set<string>>();
  const clientRooms = new Map<string, string>();

  function emit(room: WorldRouterRoom<TEvent>, event: TEvent) {
    room.workerRoom?.post(event);
    room.onEvent?.(event);
  }

  function addToRoom(clientId: string, roomId: string) {
    const clients = roomClients.get(roomId) ?? new Set<string>();
    clients.add(clientId);
    roomClients.set(roomId, clients);
    clientRooms.set(clientId, roomId);
  }

  function removeFromRoom(clientId: string, roomId: string) {
    roomClients.get(roomId)?.delete(clientId);
    clientRooms.delete(clientId);
  }

  const router: WorldRouter<TEvent> = {
    registerRoom(room) {
      roomsById.set(room.id, room);
      roomClients.set(room.id, roomClients.get(room.id) ?? new Set());
    },
    unregisterRoom(roomId) {
      if (!roomsById.delete(roomId)) return false;
      for (const clientId of roomClients.get(roomId) ?? []) clientRooms.delete(clientId);
      roomClients.delete(roomId);
      return true;
    },
    addClient(clientId, roomId) {
      const room = roomsById.get(roomId);
      if (!room) return false;
      const currentRoomId = clientRooms.get(clientId);
      if (currentRoomId === roomId) return true;
      if (currentRoomId) return router.transferClient(clientId, roomId).ok;
      addToRoom(clientId, roomId);
      emit(room, eventFor("client:join", roomId, clientId));
      return true;
    },
    removeClient(clientId) {
      const roomId = clientRooms.get(clientId);
      if (!roomId) return false;
      const room = roomsById.get(roomId);
      removeFromRoom(clientId, roomId);
      if (room) emit(room, eventFor("client:leave", roomId, clientId, { reason: "remove" }));
      return true;
    },
    transferClient(clientId, targetRoomId) {
      const fromRoomId = clientRooms.get(clientId);
      if (!fromRoomId) return { ok: false, clientId, toRoomId: targetRoomId, reason: "client not routed" };
      const targetRoom = roomsById.get(targetRoomId);
      if (!targetRoom) return { ok: false, clientId, fromRoomId, toRoomId: targetRoomId, reason: "target room missing" };
      if (fromRoomId === targetRoomId) return { ok: true, clientId, fromRoomId, toRoomId: targetRoomId };

      const fromRoom = roomsById.get(fromRoomId);
      removeFromRoom(clientId, fromRoomId);
      addToRoom(clientId, targetRoomId);
      if (fromRoom) emit(fromRoom, eventFor("client:leave", fromRoomId, clientId, { reason: "transfer", targetRoomId }));
      emit(targetRoom, eventFor("client:join", targetRoomId, clientId, { fromRoomId }));
      return { ok: true, clientId, fromRoomId, toRoomId: targetRoomId };
    },
    routeEvent(clientId, event) {
      const roomId = clientRooms.get(clientId);
      if (!roomId) return false;
      const room = roomsById.get(roomId);
      if (!room) return false;
      emit(room, { ...event, clientId, roomId });
      return true;
    },
    roomIdFor(clientId) {
      return clientRooms.get(clientId);
    },
    roomFor(clientId) {
      const roomId = clientRooms.get(clientId);
      return roomId ? roomsById.get(roomId) : undefined;
    },
    clientsIn(roomId) {
      return [...(roomClients.get(roomId) ?? [])].sort((a, b) => a.localeCompare(b));
    },
    rooms() {
      return [...roomsById.values()];
    }
  };

  for (const room of initialRooms) router.registerRoom(room);
  return router;
}
