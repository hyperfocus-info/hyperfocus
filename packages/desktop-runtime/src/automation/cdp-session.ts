import { copyRecord, requireRecordCopy as requireJsonRecord } from "@hyperfocus/utilities/records";
export { requireRecordCopy as requireJsonRecord } from "@hyperfocus/utilities/records";

export type JsonRecord = Record<string, unknown>;

export type CdpSession = {
  command(method: string, params?: JsonRecord, timeoutMs?: number): Promise<unknown>;
  on(method: string, listener: (params: unknown) => void): void;
  close(reason?: string): void;
};

type PendingCommand = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

export async function connectCdpSession(url: string): Promise<CdpSession> {
  const socket = new WebSocket(url);
  const router = createCdpRouter();
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") router.accept(event.data);
  });
  socket.addEventListener("error", () => router.close(new Error("CDP WebSocket error.")));
  socket.addEventListener("close", () => router.close(new Error("CDP WebSocket closed.")));
  try { await waitForSocket(socket); }
  catch (error) { socket.close(); throw error; }

  return {
    command(method, params = {}, timeoutMs = 30_000) {
      const request = router.request(method, params, timeoutMs);
      try { if (request.payload !== undefined) socket.send(request.payload); }
      catch (error) { router.close(error instanceof Error ? error : new Error(String(error))); }
      return request.promise;
    },
    on: router.on,
    close(reason = "CDP session complete") {
      router.close(new Error(reason));
      socket.close(1000, reason);
    },
  };
}

export async function evaluateCdp(
  session: CdpSession,
  expression: string,
  options: { awaitPromise?: boolean; timeoutMs?: number } = {},
): Promise<unknown> {
  const response = requireJsonRecord(await session.command("Runtime.evaluate", {
    expression,
    awaitPromise: options.awaitPromise ?? false,
    returnByValue: true,
    userGesture: true,
  }, options.timeoutMs), "CDP Runtime.evaluate response");
  if (response.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  return requireJsonRecord(response.result, "CDP Runtime.evaluate result").value;
}

function createCdpRouter() {
  let nextId = 1;
  let closedError: Error | undefined;
  const pending = new Map<number, PendingCommand>();
  const listeners = new Map<string, Set<(params: unknown) => void>>();

  function request(method: string, params: JsonRecord, timeoutMs: number) {
    if (closedError) return { promise: Promise.reject(closedError) };
    const id = nextId++;
    let resolvePromise: (value: unknown) => void = () => {};
    let rejectPromise: (error: Error) => void = () => {};
    const promise = new Promise<unknown>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`CDP command timed out: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
    return { payload: JSON.stringify({ id, method, params }), promise };
  }

  function accept(message: string) {
    if (closedError) return;
    const packet = parsePacket(message);
    if (!packet) return;
    if (typeof packet.id === "number") {
      const command = pending.get(packet.id);
      if (!command) return;
      clearTimeout(command.timer);
      pending.delete(packet.id);
      if (packet.error) command.reject(new Error(JSON.stringify(packet.error)));
      else command.resolve(packet.result);
      return;
    }
    if (typeof packet.method !== "string") return;
    for (const listener of listeners.get(packet.method) ?? []) listener(packet.params);
  }

  function on(method: string, listener: (params: unknown) => void) {
    if (closedError) throw closedError;
    const methodListeners = listeners.get(method) ?? new Set();
    methodListeners.add(listener);
    listeners.set(method, methodListeners);
  }

  function close(error: Error) {
    closedError ??= error;
    for (const command of pending.values()) {
      clearTimeout(command.timer);
      command.reject(closedError);
    }
    pending.clear();
    listeners.clear();
  }

  return { request, accept, on, close };
}

function parsePacket(message: string): JsonRecord | undefined {
  try {
    const value: unknown = JSON.parse(message);
    return copyRecord(value);
  } catch {
    return undefined;
  }
}

async function waitForSocket(socket: WebSocket) {
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.removeEventListener("open", opened);
      socket.removeEventListener("error", failed);
      socket.removeEventListener("close", closed);
      if (error) reject(error); else resolve();
    };
    const opened = () => finish();
    const failed = () => finish(new Error("Could not connect to CDP."));
    const closed = () => finish(new Error("CDP closed before connecting."));
    const timer = setTimeout(() => finish(new Error("Timed out connecting to CDP.")), 10_000);
    socket.addEventListener("open", opened, { once: true });
    socket.addEventListener("error", failed, { once: true });
    socket.addEventListener("close", closed, { once: true });
  });
}
