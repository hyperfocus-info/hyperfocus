/** A deadline crosses transports; AbortSignal stays with the owning process. */
export function createAiRunScope(options: { signal?: AbortSignal; deadlineAt?: number } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 600000);
  const expire = () => controller.abort(new DOMException("AI request timed out.", "TimeoutError"));
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) expire();
  const timer = remaining > 0 ? setTimeout(expire, remaining) : undefined;
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    },
  };
}
