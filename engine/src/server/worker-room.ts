export type WorkerRoomEvent<TPayload = unknown> = {
  type: string;
  roomId?: string;
  clientId?: string;
  payload?: TPayload;
  [key: string]: unknown;
};

export type WorkerRoomMessageEvent<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  data: TEvent;
};

export type WorkerRoomWorkerLike<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  postMessage(message: TEvent): void;
  terminate?(): void | Promise<void>;
  addEventListener?(type: "message", listener: (message: WorkerRoomMessageEvent<TEvent>) => void): void;
  removeEventListener?(type: "message", listener: (message: WorkerRoomMessageEvent<TEvent>) => void): void;
  onmessage?: ((message: WorkerRoomMessageEvent<TEvent>) => void) | null;
};

export type WorkerRoomWorkerOptions = {
  name?: string;
  type?: "classic" | "module";
  workerData?: unknown;
  [key: string]: unknown;
};

export type WorkerRoomWorkerConstructor<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = new (
  script: string | URL,
  options?: WorkerRoomWorkerOptions
) => WorkerRoomWorkerLike<TEvent>;

type WorkerRoomTimer = ReturnType<typeof setInterval> | number | object;

export type WorkerRoomHostOptions<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  roomId: string;
  script?: string | URL;
  worker?: WorkerRoomWorkerLike<TEvent>;
  workerConstructor?: WorkerRoomWorkerConstructor<TEvent>;
  workerOptions?: WorkerRoomWorkerOptions;
  sharedBuffer?: SharedArrayBuffer;
  sharedBufferBytes?: number;
  tickRate?: number;
  now?: () => number;
  onEvent?: (event: TEvent) => void;
  setInterval?: (handler: () => void, timeoutMs: number) => WorkerRoomTimer;
  clearInterval?: (timer: WorkerRoomTimer) => void;
};

export type WorkerRoomHost<TEvent extends WorkerRoomEvent = WorkerRoomEvent> = {
  id: string;
  roomId: string;
  sharedBuffer: SharedArrayBuffer;
  tickRate: number;
  post(event: TEvent): boolean;
  tick(dt?: number, now?: number): boolean;
  start(): void;
  stop(): void;
  close(): void;
  isRunning(): boolean;
  getStats(): {
    roomId: string;
    tickRate: number;
    ticks: number;
    running: boolean;
    workerAttached: boolean;
    sharedBufferBytes: number;
  };
};

export const WORKER_ROOM_ENTRY_SCRIPT = `
const state = { roomId: "", tickRate: 20, sharedBuffer: undefined, ticks: 0 };
const send = (type, payload) => {
  postMessage(payload === undefined ? { type, roomId: state.roomId } : { type, roomId: state.roomId, payload });
};
self.onmessage = (message) => {
  const event = message.data;
  if (!event || typeof event.type !== "string") return;
  if (event.type === "room:init") {
    state.roomId = event.roomId || state.roomId;
    state.tickRate = event.payload?.tickRate || state.tickRate;
    state.sharedBuffer = event.payload?.sharedBuffer;
    send("room:ready", { hasSharedBuffer: state.sharedBuffer instanceof SharedArrayBuffer, tickRate: state.tickRate });
    return;
  }
  if (event.type === "room:tick") {
    state.ticks += 1;
    send("room:ticked", { ...event.payload, tick: state.ticks });
    return;
  }
  send("room:event", event);
};
`;

export function createWorkerRoomInlineUrl(source = WORKER_ROOM_ENTRY_SCRIPT): URL {
  return new URL(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

export function createWorkerRoomEvent<TPayload>(
  type: string,
  roomId: string,
  payload?: TPayload,
  extra: Omit<WorkerRoomEvent, "type" | "roomId" | "payload"> = {}
): WorkerRoomEvent<TPayload> {
  const event: WorkerRoomEvent<TPayload> = { ...extra, type, roomId };
  if (payload !== undefined) event.payload = payload;
  return event;
}

function globalWorkerConstructor<TEvent extends WorkerRoomEvent>() {
  const global = globalThis as unknown as {
    Bun?: { Worker?: WorkerRoomWorkerConstructor<TEvent> };
    Worker?: WorkerRoomWorkerConstructor<TEvent>;
  };
  return global.Bun?.Worker ?? global.Worker;
}

function createWorker<TEvent extends WorkerRoomEvent>(
  options: WorkerRoomHostOptions<TEvent>,
  sharedBuffer: SharedArrayBuffer,
  tickRate: number
) {
  if (options.worker) return options.worker;
  if (!options.script) return undefined;
  const WorkerConstructor = options.workerConstructor ?? globalWorkerConstructor<TEvent>();
  if (!WorkerConstructor) return undefined;
  const workerData = {
    roomId: options.roomId,
    tickRate,
    sharedBuffer,
    ...(typeof options.workerOptions?.workerData === "object" && options.workerOptions.workerData !== null
      ? options.workerOptions.workerData
      : {})
  };
  return new WorkerConstructor(options.script, {
    name: `room:${options.roomId}`,
    type: "module",
    ...options.workerOptions,
    workerData
  });
}

function withRoomId<TEvent extends WorkerRoomEvent>(event: TEvent, roomId: string): TEvent {
  return { ...event, roomId } as TEvent;
}

export function createWorkerRoomHost<TEvent extends WorkerRoomEvent = WorkerRoomEvent>(
  options: WorkerRoomHostOptions<TEvent>
): WorkerRoomHost<TEvent> {
  const tickRate = options.tickRate ?? 20;
  if (typeof options.roomId !== "string" || options.roomId.trim().length === 0) throw new Error("worker roomId must be a non-empty string");
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new RangeError("worker tickRate must be a positive finite number");
  if (options.sharedBufferBytes !== undefined && (!Number.isSafeInteger(options.sharedBufferBytes) || options.sharedBufferBytes < 0)) {
    throw new RangeError("worker sharedBufferBytes must be a non-negative safe integer");
  }
  const sharedBuffer = options.sharedBuffer ?? new SharedArrayBuffer(options.sharedBufferBytes ?? 4);
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setInterval ?? ((handler, timeoutMs) => setInterval(handler, timeoutMs));
  const clearTimer = options.clearInterval ?? ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));
  const worker = createWorker(options, sharedBuffer, tickRate);
  let running = false;
  let timer: WorkerRoomTimer | undefined;
  let ticks = 0;
  let closed = false;

  const onMessage = (message: WorkerRoomMessageEvent<TEvent>) => {
    const event = message?.data;
    if (closed || typeof event !== "object" || event === null || typeof event.type !== "string" || event.type.length === 0) return;
    try {
      options.onEvent?.(withRoomId(event, options.roomId));
    } catch {
      // Worker callbacks are isolated from the host's transport lifecycle.
    }
  };

  if (worker?.addEventListener) worker.addEventListener("message", onMessage);
  else if (worker) worker.onmessage = onMessage;

  function post(event: TEvent) {
    if (closed || !worker) return false;
    if (typeof event !== "object" || event === null || typeof event.type !== "string" || event.type.length === 0) return false;
    worker.postMessage(withRoomId(event, options.roomId));
    return true;
  }

  post(createWorkerRoomEvent("room:init", options.roomId, { sharedBuffer, tickRate }) as TEvent);

  const host: WorkerRoomHost<TEvent> = {
    id: options.roomId,
    roomId: options.roomId,
    sharedBuffer,
    tickRate,
    post,
    tick(dt = 1 / tickRate, nowMs = now()) {
      if (closed) return false;
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("worker tick dt must be a non-negative finite number");
      if (!Number.isFinite(nowMs)) throw new RangeError("worker tick time must be finite");
      const nextTick = ticks + 1;
      const posted = post(createWorkerRoomEvent("room:tick", options.roomId, { dt, now: nowMs, tick: nextTick }) as TEvent);
      if (posted) ticks = nextTick;
      return posted;
    },
    start() {
      if (closed) throw new Error("worker room host is closed");
      if (running) return;
      const nextTimer = setTimer(() => {
        try {
          host.tick();
        } catch {
          host.stop();
        }
      }, Math.max(1, Math.round(1000 / tickRate)));
      timer = nextTimer;
      running = true;
      (nextTimer as { unref?: () => void }).unref?.();
    },
    stop() {
      if (!running) return;
      running = false;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    },
    close() {
      if (closed) return;
      closed = true;
      host.stop();
      if (worker?.removeEventListener) worker.removeEventListener("message", onMessage);
      else if (worker) worker.onmessage = null;
      try {
        const termination = worker?.terminate?.();
        if (termination && typeof (termination as Promise<void>).then === "function") void Promise.resolve(termination).catch(() => undefined);
      } catch {
        // Closing is idempotent even when an already-failed worker rejects termination.
      }
    },
    isRunning() {
      return running;
    },
    getStats() {
      return {
        roomId: options.roomId,
        tickRate,
        ticks,
        running,
        workerAttached: worker !== undefined,
        sharedBufferBytes: sharedBuffer.byteLength
      };
    }
  };

  return host;
}
