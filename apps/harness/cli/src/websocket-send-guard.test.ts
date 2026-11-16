import { describe, expect, test } from "bun:test";
import { guardedWebsocketSend, withWebsocketCompression } from "./websocket-send-guard";

function createFakeGuardedSocket(sendStatuses: Array<number | void>) {
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  const sent: Array<string | Uint8Array> = [];
  return {
    closeCalls,
    sendStatuses,
    sent,
    send(data: string | Uint8Array) {
      sent.push(data);
      return sendStatuses.shift();
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code, reason });
    },
  };
}

describe("guarded websocket send", () => {
  test("preserves handlers while enabling per-message compression", () => {
    const open = () => undefined;
    const options = withWebsocketCompression({ open });

    expect(options.open).toBe(open);
    expect(options.perMessageDeflate).toBe(true);
  });

  test("allows one large payload when Bun sends it immediately", () => {
    const socket = createFakeGuardedSocket([512]);

    expect(guardedWebsocketSend(socket, "x".repeat(512), { maxQueuedBytes: 256 })).toBe(true);
    expect(socket.sent).toHaveLength(1);
    expect(socket.closeCalls).toHaveLength(0);
  });

  test("closes only after backpressured bytes exceed the queue cap", () => {
    const socket = createFakeGuardedSocket([-1, -1]);

    expect(guardedWebsocketSend(socket, "x".repeat(128), { maxQueuedBytes: 256 })).toBe(false);
    expect(socket.closeCalls).toHaveLength(0);

    expect(
      guardedWebsocketSend(socket, "x".repeat(129), {
        maxQueuedBytes: 256,
        slowCloseReason: "Control websocket client is too slow"
      })
    ).toBe(false);
    expect(socket.closeCalls).toEqual([{ code: 1011, reason: "Control websocket client is too slow" }]);
  });

  test("keeps large state snapshots open when they fit the queue cap", () => {
    const socket = createFakeGuardedSocket([-1]);

    expect(guardedWebsocketSend(socket, "x".repeat(524288), { maxQueuedBytes: 67108864 })).toBe(false);
    expect(socket.closeCalls).toHaveLength(0);
  });
});
