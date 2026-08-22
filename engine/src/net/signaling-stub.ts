import { isSignalingMessage, type SignalingMessage } from "./peer-group.ts";

export type SignalingServerOptions = {
  port?: number;
  hostname?: string;
};

export function createSignalingServer(options: SignalingServerOptions = {}) {
  const rooms = new Map<string, Map<string, WebSocket>>();
  const socketMeta = new WeakMap<WebSocket, { lobbyId: string; peerId: string }>();

  function broadcast(message: SignalingMessage, exclude?: WebSocket) {
    const room = rooms.get(message.lobbyId);
    if (!room) return;
    const encoded = JSON.stringify(message);
    if (message.to) {
      const target = room.get(message.to);
      if (target && target !== exclude && target.readyState === WebSocket.OPEN) target.send(encoded);
      return;
    }
    for (const socket of room.values()) {
      if (socket === exclude) continue;
      if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
    }
  }

  function removeSocket(socket: WebSocket, announce: boolean) {
    const meta = socketMeta.get(socket);
    if (!meta) return;
    socketMeta.delete(socket);
    const room = rooms.get(meta.lobbyId);
    if (room?.get(meta.peerId) === socket) room.delete(meta.peerId);
    if (room?.size === 0) rooms.delete(meta.lobbyId);
    if (announce) broadcast({ type: "peer-left", lobbyId: meta.lobbyId, from: meta.peerId });
  }

  const server = Bun.serve({
    port: options.port ?? 8787,
    hostname: options.hostname,
    fetch(request, server) {
      if (server.upgrade(request)) return undefined;
      return new Response("Catalog Sync signaling server");
    },
    websocket: {
      message(socket, raw) {
        const webSocket = socket as unknown as WebSocket;
        let message: unknown;
        try {
          message = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!isSignalingMessage(message)) return;
        const meta = socketMeta.get(webSocket);
        if (message.type === "join") {
          if (meta || message.to !== undefined) return;
          let room = rooms.get(message.lobbyId);
          if (!room) {
            room = new Map();
            rooms.set(message.lobbyId, room);
          }
          if (room.has(message.from)) {
            webSocket.close(1008, "peer id already joined");
            return;
          }
          room.set(message.from, webSocket);
          socketMeta.set(webSocket, { lobbyId: message.lobbyId, peerId: message.from });
          broadcast({ type: "peer-joined", lobbyId: message.lobbyId, from: message.from }, webSocket);
          return;
        }
        if (!meta || message.lobbyId !== meta.lobbyId || message.from !== meta.peerId) return;
        if (message.type === "peer-joined" || message.type === "peer-left") return;
        if ((message.type === "offer" || message.type === "answer" || message.type === "candidate") && !message.to) return;
        broadcast(message, webSocket);
      },
      close(socket) {
        removeSocket(socket as unknown as WebSocket, true);
      }
    }
  });

  return server;
}
