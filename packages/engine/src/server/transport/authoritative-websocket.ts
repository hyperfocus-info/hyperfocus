import { createBinaryProtocolParser, createProtocolMessage, encodeProtocolMessage, parseProtocolMessage, PROTOCOL_CONTROL_FRAME_MAX_BYTES, type BinaryInputPayloadOwnership, type BinaryPayloadCodec, type BinaryProtocolParser, type ProtocolMessage } from "../../protocol/messages.ts";
import type { ServerAdmission } from "../runtime/server-admission.ts";
import type { AuthoritativeServer, EngineServerWebSocket, JoinRoomOptions } from "../runtime/server-contract.ts";
import type { ServerReplication } from "../runtime/server-replication.ts";

type AuthoritativeWebSocketOptions = {
  port: number;
  tickRate: number;
  inputCodec?: BinaryPayloadCodec;
  binaryInputPayloadOwnership?: BinaryInputPayloadOwnership;
  httpHandler?: (request: Request) => Response | undefined | Promise<Response | undefined>;
  now(): number;
  getStats: AuthoritativeServer["getStats"];
  joinRoom(options: JoinRoomOptions): ReturnType<AuthoritativeServer["joinRoom"]>;
  receiveInput: AuthoritativeServer["receiveInput"];
  receiveEvent: AuthoritativeServer["receiveEvent"];
  admission: ServerAdmission;
  replication: ServerReplication;
};

function send(socket: EngineServerWebSocket<unknown>, message: ProtocolMessage) {
  const status = socket.send(encodeProtocolMessage(message));
  if (status === 0) throw new Error("websocket message was dropped");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIncomingMessage(
  raw: string | ArrayBuffer | Uint8Array,
  binaryParser?: BinaryProtocolParser<unknown>
) {
  if (typeof raw === "string") return parseProtocolMessage(raw);
  if (!binaryParser) throw new Error("binary input codec required");
  return binaryParser.parse(raw);
}

export function createAuthoritativeWebSocketServer(options: AuthoritativeWebSocketOptions) {
  const binaryParser = options.inputCodec
    ? createBinaryProtocolParser({
        inputCodec: options.inputCodec,
        payloadOwnership: options.binaryInputPayloadOwnership
      })
    : undefined;
  return Bun.serve<{ playerId?: string }>({
    port: options.port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") return new Response("ok");
      if (url.pathname === "/stats.json") return Response.json(options.getStats());
      if (server.upgrade(request, { data: {} })) return undefined;
      const response = await options.httpHandler?.(request);
      if (response) return response;
      return new Response("Catalog authoritative server");
    },
    websocket: {
      maxPayloadLength: PROTOCOL_CONTROL_FRAME_MAX_BYTES,
      async message(socket, raw) {
        try {
          const message = parseIncomingMessage(raw, binaryParser);
          if (message.type === "client_hello") {
            send(socket, createProtocolMessage("server_welcome", { tickRate: options.tickRate }));
          } else if (message.type === "join_room") {
            if (options.admission.boundPlayerId(socket)) {
              send(socket, createProtocolMessage("join_rejected", { reason: "connection already joined" }));
            } else {
              const payload = isRecord(message.payload) ? message.payload : {};
              const result = await options.joinRoom({
                roomId: typeof payload.roomId === "string" ? payload.roomId : undefined,
                roomType: typeof payload.roomType === "string" ? payload.roomType : undefined,
                token: typeof payload.token === "string" ? payload.token : "",
                request: payload.request,
                connection: socket
              });
              if (result.ok && result.player) {
                socket.data = { playerId: result.player.id };
                const acceptedPayload: { playerId: string; roomId?: string } = { playerId: result.player.id };
                if (result.room) acceptedPayload.roomId = result.room.id;
                send(socket, createProtocolMessage("join_accepted", acceptedPayload));
                options.replication.attach(result.player.id, result.room?.id ?? (typeof payload.roomId === "string" ? payload.roomId : "default"), socket);
              } else {
                send(socket, createProtocolMessage("join_rejected", { reason: result.reason ?? "join rejected" }));
              }
            }
          } else if (message.type === "input") {
            const playerId = options.admission.boundPlayerId(socket);
            if (playerId) await options.receiveInput(playerId, message.payload);
          } else if (message.type === "event") {
            const payload = isRecord(message.payload) ? message.payload : {};
            const playerId = options.admission.boundPlayerId(socket);
            const sequence = payload.sequence;
            if (playerId && payload.type === "replication_ack") {
              if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff) {
                throw new Error("replication acknowledgement sequence must fit in u32");
              }
              await options.replication.acknowledge(playerId, sequence);
            } else if (playerId) {
              await options.receiveEvent(playerId, message.payload);
            }
          } else if (message.type === "ping") {
            send(socket, createProtocolMessage("pong", { now: options.now() }));
          }
        } catch (error) {
          try {
            send(socket, createProtocolMessage("error", { reason: error instanceof Error ? error.message : "protocol error" }));
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
        await options.admission.closeConnection(socket);
      }
    }
  });
}
