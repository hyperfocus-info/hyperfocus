function scheduleTimeout(callback: () => void, delay: number) {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
}

/** Trailing-edge debounce. Owners cancel on disposal; flush runs pending work
 * synchronously once. A supplied scheduler must enqueue work asynchronously. */
export function createDebouncedCallback<Args extends unknown[], Result>({ callback, delay, schedule = scheduleTimeout }: {
  callback: (...args: Args) => Result;
  delay: number;
  schedule?: (callback: () => void, delay: number) => () => void;
}) {
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError('Debounce delay must be finite and nonnegative.');
  let stop: (() => void) | undefined;
  let args: Args | undefined;
  function cancel() { stop?.(); stop = undefined; args = undefined; }
  function flush() {
    if (!args) return;
    const current = args;
    cancel();
    return callback(...current);
  }
  return {
    invoke(...next: Args) { cancel(); args = next; stop = schedule(() => { stop = undefined; flush(); }, delay); },
    cancel,
    flush,
    pending: () => args !== undefined,
  };
}
