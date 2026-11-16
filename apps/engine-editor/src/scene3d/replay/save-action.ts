/** One explicit download at a time; a failed optional codec can be retried. */
export function createReplaySaveAction(options: { save?(): void | Promise<void>; report(error: string): void }) {
  let pending = false, disposed = false;
  const failed = (cause: unknown) => { if (!disposed) options.report(cause instanceof Error ? cause.message : 'Could not save this replay. Try again.'); };
  return {
    get pending() { return pending; },
    run() {
      if (pending || disposed || !options.save) return;
      options.report('');
      try {
        const result = options.save();
        if (result) {
          pending = true;
          void result.then(undefined, failed).finally(() => { pending = false; });
        }
      } catch (cause) { failed(cause); }
    },
    dispose() { disposed = true; },
  };
}
