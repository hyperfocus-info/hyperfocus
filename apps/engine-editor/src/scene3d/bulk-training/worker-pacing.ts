type YieldChannel = { listen(handler: (token: number) => void): void; post(token: number): void; close(): void };

function createMessageYield(): YieldChannel {
  const channel = new MessageChannel();
  return {
    listen(handler) { channel.port1.onmessage = event => handler(event.data); },
    post(token) { channel.port2.postMessage(token); },
    close() { channel.port1.close();channel.port2.close(); },
  };
}

/** Longer high-duty slices amortize browser timer clamps; one tick may overrun the bound. */
export function bulkWorkSlice(effort: number) { return 8 + 42 * Math.max(0, Math.min(1, (effort - 80) / 20)); }
export function bulkRestDelay(effort: number, busyMs: number) { return Math.max(0, busyMs * (100 - effort) / effort); }

/** Message tasks yield to control messages without the nested setTimeout minimum delay. */
export function createWorkerPacer(options: {
  run(): void;
  createChannel?: () => YieldChannel;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let epoch = 0, channel: YieldChannel | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const setTimer = options.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  function cancel() { epoch++;if (timer !== undefined) clearTimer(timer);timer = undefined; }
  function deliver(token: number) { if (token !== epoch) return;epoch++;timer = undefined;options.run(); }
  return {
    cancel,
    schedule({ delay }: { delay: number }) {
      cancel();const token = epoch;
      if (delay > 0) timer = setTimer(() => deliver(token), delay);
      else {
        if (!channel) {
          channel = (options.createChannel ?? createMessageYield)();
          channel.listen(deliver);
        }
        channel.post(token);
      }
    },
    dispose() { cancel();channel?.close();channel = undefined; },
  };
}
