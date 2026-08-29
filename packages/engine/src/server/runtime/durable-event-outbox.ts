import type { PersistenceAdapter } from "../core/types.ts";

export type DurableEventOutbox = {
  enqueue(event: unknown): boolean;
  flush(): Promise<void>;
  pending(): number;
};

export function createDurableEventOutbox(options: {
  persistence?: PersistenceAdapter;
  maxPending: number;
  batchSize: number;
  onError(error: unknown): void;
}): DurableEventOutbox {
  const appendBatch = options.persistence?.appendEvents;
  const appendOne = options.persistence?.appendEvent;
  const queue: unknown[] = [];
  let inFlight: readonly unknown[] = [];
  let active: Promise<void> | undefined;
  let lastError: unknown;
  let failed = false;

  async function write(events: readonly unknown[]) {
    if (appendBatch) return appendBatch(events);
    if (!appendOne) throw new Error("durable event persistence is unavailable");
    for (const event of events) await appendOne(event);
  }

  function start() {
    if (active || queue.length === 0) return;
    const operation = (async () => {
      while (queue.length > 0) {
        const batch = queue.splice(0, appendBatch ? options.batchSize : 1);
        inFlight = batch;
        try {
          await write(batch);
          lastError = undefined;
          failed = false;
        } catch (error) {
          queue.unshift(...batch);
          inFlight = [];
          lastError = error;
          failed = true;
          options.onError(error);
          return;
        }
        inFlight = [];
      }
    })();
    active = operation;
    void operation.finally(() => {
      if (active === operation) active = undefined;
      if (!failed) start();
    });
  }

  return {
    enqueue(event) {
      if (!appendBatch && !appendOne) return false;
      if (queue.length + inFlight.length >= options.maxPending) return false;
      failed = false;
      queue.push(event);
      start();
      return true;
    },
    async flush() {
      start();
      await active;
      if (queue.length + inFlight.length > 0) throw lastError ?? new Error(`${queue.length + inFlight.length} durable events remain pending`);
    },
    pending() {
      return queue.length + inFlight.length;
    }
  };
}
