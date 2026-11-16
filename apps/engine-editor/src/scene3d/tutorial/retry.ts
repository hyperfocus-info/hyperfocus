/** Retry only after active reading time; a recovered attempt cancels the reset. */
export function createTutorialRetry() {
  let remaining: number | undefined;
  return {
    get pending() { return remaining !== undefined; },
    reset() { remaining = undefined; },
    observe(input: { failed: boolean; recovered: boolean; complete: boolean; suspended: boolean; deltaMs: number }) {
      if (input.complete || input.recovered) { remaining = undefined;return false; }
      if (input.failed && remaining === undefined) remaining = 1200;
      if (input.suspended) return false;
      if (remaining === undefined) return false;
      remaining -= Math.min(100, Math.max(0, input.deltaMs));
      if (remaining > 0) return false;
      remaining = undefined;return true;
    },
  };
}
