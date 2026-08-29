export type ClientLeaseTimerApi = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

/** Stops a browser-backed local service after its last UI client has stayed away for a grace period. */
export function createClientLeaseController(options: {
  idleGraceMs: number;
  initialGraceMs?: number;
  onIdle: () => void | Promise<void>;
  timerApi?: ClientLeaseTimerApi;
}) {
  const timerApi = options.timerApi ?? globalThis;
  let clients = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearIdleTimer = () => {
    if (timer) {
      timerApi.clearTimeout(timer);
      timer = undefined;
    }
  };
  const scheduleIdle = (delayMs: number) => {
    clearIdleTimer();
    if (disposed || clients > 0) {
      return;
    }
    timer = timerApi.setTimeout(() => {
      timer = undefined;
      if (!disposed && clients === 0) {
        void options.onIdle();
      }
    }, delayMs);
  };

  return {
    arm() {
      scheduleIdle(options.initialGraceMs ?? options.idleGraceMs);
    },
    connected() {
      if (disposed) return;
      clients += 1;
      clearIdleTimer();
    },
    disconnected() {
      if (disposed) return;
      clients = Math.max(0, clients - 1);
      if (clients === 0) {
        scheduleIdle(options.idleGraceMs);
      }
    },
    dispose() {
      disposed = true;
      clients = 0;
      clearIdleTimer();
    },
    getClientCount() {
      return clients;
    }
  };
}

export type ClientLeaseController = ReturnType<typeof createClientLeaseController>;
