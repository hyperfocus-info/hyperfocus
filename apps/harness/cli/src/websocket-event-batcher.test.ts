import { parseServerEventFrame } from "@hyperfocus/ai-core/protocol";
import { readValueFrame } from "@hyperfocus/serialization";
import { describe,expect,test } from "bun:test";
import { assistantDelta } from "./test-support/fixtures/server-events";
import { createWebsocketEventBatcher } from "./websocket-event-batcher";

function createFakeGuardedSocket(sendStatuses: Array<number | void> = []) {
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  const sent: Array<string | Uint8Array> = [];
  return {
    closeCalls,
    sendStatuses,
    sent,
    send(data: string | Uint8Array) {
      sent.push(data);
      return sendStatuses.shift() ?? 1;
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code, reason });
    },
  };
}


describe("websocket event batcher", () => {
  test("sends queued control events as one typed batch frame", () => {
    const socket = createFakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1048576, flushDelayMs: 60_000 });

    expect(batcher.send(socket, assistantDelta(1), "protobuf")).toBe(true);
    expect(batcher.send(socket, assistantDelta(2), "protobuf")).toBe(true);
    expect(socket.sent).toHaveLength(0);

    expect(batcher.flush(socket)).toBe(true);
    expect(socket.sent).toHaveLength(1);

    const payload = socket.sent[0];
    if (!(payload instanceof Uint8Array)) {
      throw new Error("expected protobuf websocket payload");
    }
    const events = parseServerEventFrame(readValueFrame(payload));
    expect(events.map((event) => event.type)).toEqual(["assistant.chat.delta", "assistant.chat.delta"]);
    expect(events.map((event) => (event.type === "assistant.chat.delta" ? event.payload.delta : ""))).toEqual([
      "chunk-1",
      "chunk-2"
    ]);
  });

  test("flushes queued events before immediate heartbeat responses", () => {
    const socket = createFakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1048576, flushDelayMs: 60_000 });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, {
      type: "connection.pong",
      requestId: "req-pong",
      payload: {
        timestamp: 1
      }
    });

    expect(socket.sent).toHaveLength(2);
    expect(typeof socket.sent[0]).toBe("string");
    expect(typeof socket.sent[1]).toBe("string");
    expect(parseServerEventFrame(readValueFrame(socket.sent[0]))[0]?.type).toBe("assistant.chat.delta");
    expect(parseServerEventFrame(readValueFrame(socket.sent[1]))[0]?.type).toBe("connection.pong");
  });

  test("flushes when batch event limit is reached", () => {
    const socket = createFakeGuardedSocket();
    const batcher = createWebsocketEventBatcher({
      maxQueuedBytes: 1048576,
      maxBatchEvents: 2,
      flushDelayMs: 60_000
    });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, assistantDelta(2));

    expect(socket.sent).toHaveLength(1);
    const events = parseServerEventFrame(readValueFrame(socket.sent[0]));
    expect(events).toHaveLength(2);
  });

  test("reuses guarded slow-client close behavior for batch frames", () => {
    const socket = createFakeGuardedSocket([-1]);
    const batcher = createWebsocketEventBatcher({
      maxQueuedBytes: 64,
      flushDelayMs: 60_000,
      slowCloseReason: "Control websocket client is too slow"
    });

    batcher.send(socket, assistantDelta(1));
    batcher.send(socket, assistantDelta(2));
    batcher.flush(socket);

    expect(socket.closeCalls).toEqual([{ code: 1011, reason: "Control websocket client is too slow" }]);
  });

  test("rejects a control event above the explicit frame budget before send", () => {
    const socket = createFakeGuardedSocket(); const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1024,
      maxEventBytes: 100, flushDelayMs: 60_000 });
    expect(() => batcher.send(socket, assistantDelta(1))).toThrow("Control event exceeds 100 byte limit");
    expect(socket.sent).toEqual([]);
  });
});
