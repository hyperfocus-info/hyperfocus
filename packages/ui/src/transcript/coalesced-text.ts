import { createRenderEffect, createSignal, onCleanup } from "solid-js";

export const DEFAULT_STREAM_RENDER_INTERVAL_MS = 32;

export function createCoalescedText(
  read: () => string,
  options: {
    enabled?: () => boolean;
    intervalMs?: () => number | undefined;
    onApply?: (value: string) => void;
  } = {}
) {
  const [value, setValue] = createSignal(read());
  let pendingValue = value();
  let lastAppliedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const apply = () => {
    clearTimer();
    const changed = pendingValue !== value();
    setValue(pendingValue);
    lastAppliedAt = performance.now();
    if (changed) options.onApply?.(pendingValue);
  };

  createRenderEffect(() => {
    pendingValue = read();
    const enabled = options.enabled?.() ?? true;
    const intervalMs = nonNegativeNumber(options.intervalMs?.(), DEFAULT_STREAM_RENDER_INTERVAL_MS);
    if (!enabled || intervalMs === 0) {
      apply();
      return;
    }

    const remainingMs = intervalMs - (performance.now() - lastAppliedAt);
    if (remainingMs <= 0) {
      apply();
    } else if (timer === undefined) {
      timer = setTimeout(apply, remainingMs);
    }
  });
  onCleanup(clearTimer);
  return value;
}

function nonNegativeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
