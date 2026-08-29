import { debugLog } from "./logging";

export type GuardedWebSocket = {
  send(data: string | Uint8Array): number | void;
  close(code?: number, reason?: string): void;
};

type GuardState = {
  queuedBytes: number;
};

const states = new WeakMap<GuardedWebSocket, GuardState>();
const encoder = new TextEncoder();

/** Enables RFC 7692 compression without changing websocket lifecycle handlers. */
export function withWebsocketCompression<T extends object>(options: T) {
  return { ...options, perMessageDeflate: true as const };
}

export function guardedWebsocketSend(
  ws: GuardedWebSocket,
  data: string | Uint8Array,
  options: { maxQueuedBytes: number; slowCloseCode?: number; slowCloseReason?: string }
) {
  const state = states.get(ws) ?? { queuedBytes: 0 };
  const bytes = typeof data === "string" ? encoder.encode(data).byteLength : data.byteLength;

  try {
    const status = ws.send(data);
    if (status === -1) {
      state.queuedBytes += bytes;
      states.set(ws, state);
      debugLog("websocket.send.backpressured", {
        bytes,
        queuedBytes: state.queuedBytes,
        maxQueuedBytes: options.maxQueuedBytes
      });
      if (state.queuedBytes > options.maxQueuedBytes) {
        debugLog("websocket.send.close-slow-client", {
          bytes,
          queuedBytes: state.queuedBytes,
          maxQueuedBytes: options.maxQueuedBytes
        });
        console.warn(
          JSON.stringify({
            scope: "harness",
            level: "warn",
            event: "websocket.send.close-slow-client",
            bytes,
            queuedBytes: state.queuedBytes,
            maxQueuedBytes: options.maxQueuedBytes
          })
        );
        ws.close(options.slowCloseCode ?? 1011, options.slowCloseReason ?? "Websocket client is too slow");
        states.delete(ws);
      }
      return false;
    }
    if (status === 0) {
      return false;
    }
    state.queuedBytes = 0;
    states.set(ws, state);
    return true;
  } catch {
    states.delete(ws);
    return false;
  }
}
