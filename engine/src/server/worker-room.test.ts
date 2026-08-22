import { expect, test } from "bun:test";
import {
  createWorkerRoomHost,
  createWorkerRoomInlineUrl,
  type WorkerRoomEvent,
  type WorkerRoomMessageEvent,
  type WorkerRoomWorkerLike,
  type WorkerRoomWorkerOptions
} from "./index.ts";

class FakeWorker implements WorkerRoomWorkerLike {
  messages: WorkerRoomEvent[] = [];
  terminated = false;
  terminateCalls = 0;
  throwOnPost = false;
  onmessage: ((message: WorkerRoomMessageEvent) => void) | null = null;
  private listeners = new Set<(message: WorkerRoomMessageEvent) => void>();

  postMessage(message: WorkerRoomEvent) {
    if (this.throwOnPost) throw new Error("post failed");
    this.messages.push(message);
  }

  addEventListener(_type: "message", listener: (message: WorkerRoomMessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (message: WorkerRoomMessageEvent) => void) {
    this.listeners.delete(listener);
  }

  emit(event: WorkerRoomEvent) {
    const message = { data: event };
    this.onmessage?.(message);
    for (const listener of this.listeners) listener(message);
  }

  terminate() {
    this.terminated = true;
    this.terminateCalls += 1;
  }
}

class ConstructedFakeWorker extends FakeWorker {
  static created: Array<{ script: string | URL; options?: WorkerRoomWorkerOptions; worker: ConstructedFakeWorker }> = [];

  constructor(script: string | URL, options?: WorkerRoomWorkerOptions) {
    super();
    ConstructedFakeWorker.created.push({ script, options, worker: this });
  }
}

test("worker room host sends only event-shaped messages with shared memory", () => {
  const worker = new FakeWorker();
  const sharedBuffer = new SharedArrayBuffer(16);
  const received: WorkerRoomEvent[] = [];
  const host = createWorkerRoomHost({ roomId: "room-a", worker, sharedBuffer, now: () => 100, onEvent: (event) => received.push(event) });

  expect(worker.messages[0]).toMatchObject({ type: "room:init", roomId: "room-a", payload: { tickRate: 20 } });
  expect((worker.messages[0].payload as { sharedBuffer: SharedArrayBuffer }).sharedBuffer).toBe(sharedBuffer);
  expect(host.post({ type: "client:event", clientId: "client-1" })).toBe(true);
  expect(worker.messages[1]).toEqual({ type: "client:event", clientId: "client-1", roomId: "room-a" });

  expect(host.tick()).toBe(true);
  expect(worker.messages[2]).toMatchObject({ type: "room:tick", roomId: "room-a", payload: { dt: 0.05, now: 100, tick: 1 } });
  expect(host.getStats()).toMatchObject({ roomId: "room-a", tickRate: 20, ticks: 1, workerAttached: true, sharedBufferBytes: 16 });

  worker.emit({ type: "room:ready", payload: { ok: true } });
  expect(received[0]).toEqual({ type: "room:ready", payload: { ok: true }, roomId: "room-a" });
  worker.emit({ type: "room:spoof", roomId: "room-b" });
  expect(received[1]).toEqual({ type: "room:spoof", roomId: "room-a" });
});

test("worker room host can construct a URL-backed worker", () => {
  ConstructedFakeWorker.created = [];
  const url = createWorkerRoomInlineUrl("self.onmessage = () => {};");
  const host = createWorkerRoomHost({ roomId: "worker-room", script: url, workerConstructor: ConstructedFakeWorker });
  const created = ConstructedFakeWorker.created[0];

  expect(url.protocol).toBe("data:");
  expect(created.script).toBe(url);
  expect(created.options).toMatchObject({ name: "room:worker-room", type: "module" });
  expect((created.options?.workerData as { sharedBuffer: SharedArrayBuffer }).sharedBuffer).toBe(host.sharedBuffer);
  expect(created.worker.messages[0].type).toBe("room:init");

  host.close();
  host.close();
  expect(created.worker.terminated).toBe(true);
  expect(created.worker.terminateCalls).toBe(1);
});

test("worker room host start schedules 20Hz ticks without opening a server", () => {
  const worker = new FakeWorker();
  let scheduled: (() => void) | undefined;
  let timeoutMs = 0;
  let cleared = false;
  const timer = { id: 1 };
  const host = createWorkerRoomHost({
    roomId: "clocked-room",
    worker,
    now: () => 250,
    setInterval: (handler, interval) => {
      scheduled = handler;
      timeoutMs = interval;
      return timer;
    },
    clearInterval: (handle) => {
      cleared = handle === timer;
    }
  });

  host.start();
  expect(host.isRunning()).toBe(true);
  expect(timeoutMs).toBe(50);

  scheduled?.();
  expect(worker.messages.at(-1)).toMatchObject({ type: "room:tick", payload: { dt: 0.05, now: 250, tick: 1 } });

  host.stop();
  expect(host.isRunning()).toBe(false);
  expect(cleared).toBe(true);
});

test("worker room host commits ticks only after successful posts", () => {
  const worker = new FakeWorker();
  const host = createWorkerRoomHost({ roomId: "failing-worker", worker });
  worker.throwOnPost = true;

  expect(() => host.tick()).toThrow("post failed");
  expect(host.getStats().ticks).toBe(0);
});

test("worker room host remains stopped when timer creation fails", () => {
  const worker = new FakeWorker();
  const host = createWorkerRoomHost({
    roomId: "timer-failure",
    worker,
    setInterval() {
      throw new Error("timer failed");
    }
  });

  expect(() => host.start()).toThrow("timer failed");
  expect(host.isRunning()).toBe(false);
});

test("worker room host validates numeric construction and tick inputs", () => {
  expect(() => createWorkerRoomHost({ roomId: "invalid", tickRate: 0 })).toThrow("positive finite");
  expect(() => createWorkerRoomHost({ roomId: "invalid", sharedBufferBytes: -1 })).toThrow("non-negative safe integer");
  const host = createWorkerRoomHost({ roomId: "valid", worker: new FakeWorker() });
  expect(() => host.tick(Number.NaN)).toThrow("non-negative finite");
  host.close();
  expect(host.tick()).toBe(false);
  expect(() => host.start()).toThrow("closed");
});
