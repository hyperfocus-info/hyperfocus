import { isRecord } from "@hyperfocus/utilities/records";
type CdpPendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

export function createCdpMessageRouter() {
  let nextId = 1;
  let closedError: Error | undefined;
  const pending = new Map<number, CdpPendingRequest>();
  const listeners = new Map<string, Set<(params: unknown) => void>>();

  function request(method: string, params: Record<string, unknown>, timeoutMs: number) {
    if (closedError) throw closedError;
    const id = nextId++;
    let resolveRequest: (value: unknown) => void = () => undefined;
    let rejectRequest: (error: Error) => void = () => undefined;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const timer = setTimeout(() => fail(id, new Error(`CDP command timed out: ${method}`)), timeoutMs);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    return { id, payload: JSON.stringify({ id, method, params }), promise };
  }

  function accept(text: string) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch (error) {
      close(new Error(`Invalid CDP JSON: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }
    const message = isRecord(decoded) ? decoded : {};
    if (typeof message.id === "number" && Number.isSafeInteger(message.id)) {
      const active = pending.get(message.id);
      if (!active) return;
      pending.delete(message.id);
      clearTimeout(active.timer);
      if (message.error !== undefined) {
        const details = isRecord(message.error) ? message.error : {};
        const description = typeof details.message === "string" ? details.message : JSON.stringify(message.error);
        active.reject(new Error(`CDP command failed: ${description}`));
      } else {
        active.resolve(message.result);
      }
      return;
    }
    if (typeof message.method !== "string") return;
    for (const listener of listeners.get(message.method) ?? []) {
      try {
        listener(message.params);
      } catch (error) {
        close(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
  }

  function fail(id: number, error: Error) {
    const active = pending.get(id);
    if (!active) return;
    pending.delete(id);
    clearTimeout(active.timer);
    active.reject(error);
  }

  function on(method: string, listener: (params: unknown) => void) {
    let methodListeners = listeners.get(method);
    if (!methodListeners) {
      methodListeners = new Set();
      listeners.set(method, methodListeners);
    }
    methodListeners.add(listener);
    return () => {
      methodListeners?.delete(listener);
      if (methodListeners?.size === 0) listeners.delete(method);
    };
  }

  function close(error: Error) {
    if (closedError) return;
    closedError = error;
    for (const active of pending.values()) {
      clearTimeout(active.timer);
      active.reject(error);
    }
    pending.clear();
    listeners.clear();
  }

  return { request, accept, fail, on, close };
}

export function createCdpSession(socket: WebSocket, closeReason: string) {
  const router = createCdpMessageRouter();
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") router.accept(event.data);
    else router.close(new Error("CDP returned a non-text WebSocket message."));
  });
  socket.addEventListener("error", () => router.close(new Error("CDP WebSocket failed.")));
  socket.addEventListener("close", () => router.close(new Error("CDP WebSocket closed.")));

  function command(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP WebSocket is not open."));
    const request = router.request(method, params, timeoutMs);
    try {
      socket.send(request.payload);
    } catch (error) {
      router.fail(request.id, error instanceof Error ? error : new Error(String(error)));
    }
    return request.promise;
  }

  async function close() {
    if (socket.readyState === WebSocket.CLOSED) {
      router.close(new Error("CDP session closed."));
      return;
    }
    const closed = new Promise<void>((resolve) => {
      const finish = () => resolve();
      socket.addEventListener("close", finish, { once: true });
      socket.addEventListener("error", finish, { once: true });
    });
    socket.close(1000, closeReason);
    await Promise.race([closed, delay(2_000)]);
    router.close(new Error("CDP session closed."));
  }

  return { command, on: router.on, close };
}

export type CdpSession = ReturnType<typeof createCdpSession>;

export async function connectCdpSession(url: string, closeReason: string, timeoutMs = 10_000) {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.close();
      reject(new Error("Timed out connecting to the CDP WebSocket."));
    }, timeoutMs);
    const onOpen = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Could not connect to the CDP WebSocket.")); };
    const onClose = () => { cleanup(); reject(new Error("CDP WebSocket closed during connection.")); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
  });
  return createCdpSession(socket, closeReason);
}



function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
