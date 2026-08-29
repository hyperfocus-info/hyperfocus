export type CoalescedSaveLane<TValue> = {
  enqueue(value: TValue): void;
  flush(): Promise<boolean>;
};

export function createCoalescedSaveLane<TValue>(options: {
  save(value: TValue): Promise<void>;
  onError(error: unknown): void;
}): CoalescedSaveLane<TValue> {
  let queued: TValue | undefined;
  let active: Promise<void> | undefined;
  let failed = false;

  function start() {
    if (active || queued === undefined) return;
    const operation = (async () => {
      while (queued !== undefined) {
        const value = queued;
        queued = undefined;
        try {
          await options.save(value);
        } catch (error) {
          failed = true;
          options.onError(error);
        }
      }
    })();
    active = operation;
    void operation.finally(() => {
      if (active === operation) active = undefined;
      start();
    });
  }

  return {
    enqueue(value) {
      queued = value;
      start();
    },
    async flush() {
      do {
        start();
        await active;
      } while (active || queued !== undefined);
      const succeeded = !failed;
      failed = false;
      return succeeded;
    }
  };
}
