import { expect, test } from "bun:test";
import {
  createWorkerRoomHost,
  createWorkerRoomInlineUrl,
  type WorkerRoomEvent,
  type WorkerRoomMessageEvent,
  type WorkerRoomWorkerLike,
  type WorkerRoomWorkerOptions
} from "./worker-room.ts";

type FakeWorker = WorkerRoomWorkerLike & {
  messages: WorkerRoomEvent[];
  terminated: boolean;
  terminateCalls: number;
  throwOnPost: boolean;
  emit(event: WorkerRoomEvent): void;
};

function createFakeWorker(): FakeWorker {
  const listeners = new Set<(message: WorkerRoomMessageEvent) => void>();
  const worker: FakeWorker = {
    messages: [],
    terminated: false,
    terminateCalls: 0,
    throwOnPost: false,
    onmessage: null,
    postMessage(message) {
      if (worker.throwOnPost) throw new Error("post failed");
      worker.messages.push(message);
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    emit(event) {
      const message = { data: event };
      worker.onmessage?.(message);
      for (const listener of listeners) listener(message);
    },
    terminate() {
      worker.terminated = true;
      worker.terminateCalls += 1;
    }
  };
  return worker;
}

type FakeWorkerConstructor = new (
  script: string | URL,
  options?: WorkerRoomWorkerOptions
) => FakeWorker;

const constructedWorkers: Array<{ script: string | URL; options?: WorkerRoomWorkerOptions; worker: FakeWorker }> = [];

function fakeWorkerConstructor(script: string | URL, options?: WorkerRoomWorkerOptions): FakeWorker {
  const worker = createFakeWorker();
  constructedWorkers.push({ script, options, worker });
  return worker;
}

function isFakeWorkerConstructor(value: unknown): value is FakeWorkerConstructor {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requireFakeWorkerConstructor(value: unknown): FakeWorkerConstructor {
  if (!isFakeWorkerConstructor(value)) throw new Error("fake worker constructor must be constructable");
  return value;
}

const FakeWorkerConstructor = requireFakeWorkerConstructor(fakeWorkerConstructor);

function sharedBufferFrom(value: unknown): SharedArrayBuffer {
  if (typeof value !== "object" || value === null) throw new Error("worker payload must be an object");
  const sharedBuffer: unknown = Reflect.get(value, "sharedBuffer");
  if (!(sharedBuffer instanceof SharedArrayBuffer)) throw new Error("worker payload must include sharedBuffer");
  return sharedBuffer;
}

test("worker room host sends only event-shaped messages with shared memory", () => {
  const worker = createFakeWorker();
  const sharedBuffer = new SharedArrayBuffer(16);
  const received: WorkerRoomEvent[] = [];
  const host = createWorkerRoomHost({ roomId: "room-a", worker, sharedBuffer, now: () => 100, onEvent: (event) => received.push(event) });

  expect(worker.messages[0]).toMatchObject({ type: "room:init", roomId: "room-a", payload: { tickRate: 20 } });
  expect(sharedBufferFrom(worker.messages[0].payload)).toBe(sharedBuffer);
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
  constructedWorkers.length = 0;
  const url = createWorkerRoomInlineUrl("self.onmessage = () => {};");
  const host = createWorkerRoomHost({ roomId: "worker-room", script: url, workerConstructor: FakeWorkerConstructor });
  const created = constructedWorkers[0];

  expect(url.protocol).toBe("data:");
  expect(created.script).toBe(url);
  expect(created.options).toMatchObject({ name: "room:worker-room", type: "module" });
  expect(sharedBufferFrom(created.options?.workerData)).toBe(host.sharedBuffer);
  expect(created.worker.messages[0].type).toBe("room:init");

  host.close();
  host.close();
  expect(created.worker.terminated).toBe(true);
  expect(created.worker.terminateCalls).toBe(1);
});

test("worker room host start schedules 20Hz ticks without opening a server", () => {
  const worker = createFakeWorker();
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
  const worker = createFakeWorker();
  const host = createWorkerRoomHost({ roomId: "failing-worker", worker });
  worker.throwOnPost = true;

  expect(() => host.tick()).toThrow("post failed");
  expect(host.getStats().ticks).toBe(0);
});

test("worker room host remains stopped when timer creation fails", () => {
  const worker = createFakeWorker();
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
  const host = createWorkerRoomHost({ roomId: "valid", worker: createFakeWorker() });
  expect(() => host.tick(Number.NaN)).toThrow("non-negative finite");
  host.close();
  expect(host.tick()).toBe(false);
  expect(() => host.start()).toThrow("closed");
});
