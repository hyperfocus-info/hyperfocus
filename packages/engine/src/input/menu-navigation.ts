export type MenuDirection = 'up' | 'down' | 'left' | 'right';

/** DOM-free cardinal input. The host supplies a monotonic clock and owns focus,
 * activation edges, device mappings and reset on menu/background transitions. */
export function createMenuNavigationInput(options: {
  delayMs?: number; intervalMs?: number; engage?: number; release?: number; axisBias?: number;
} = {}) {
  const { delayMs = 400, intervalMs = 100, engage = .6, release = .35, axisBias = .15 } = options;
  if (![delayMs, intervalMs, engage, release, axisBias].every(Number.isFinite)
    || delayMs < 0 || intervalMs <= 0 || release < 0 || release >= engage || engage > 1 || axisBias < 0 || axisBias > 1) throw Error('Invalid menu navigation thresholds or timing.');
  let direction: MenuDirection | undefined, due = 0, last = -Infinity, waitForNeutral = false;
  const axis = (value: number | undefined) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value!)) : 0;
  return {
    get direction() { return direction; },
    reset(options: { waitForNeutral?: boolean } = {}) { direction = undefined;due = 0;last = -Infinity;waitForNeutral = !!options.waitForNeutral; },
    sample(input: { nowMs: number; x?: number; y?: number; digital?: { x: number; y: number } }): MenuDirection | undefined {
      if (!Number.isFinite(input.nowMs)) throw Error('Menu navigation needs a finite clock.');
      if (input.nowMs < last) { direction = undefined;waitForNeutral = true; }
      last = input.nowMs;
      const x = axis(input.digital?.x ?? input.x), y = axis(input.digital?.y ?? input.y);
      const ax = Math.abs(x), ay = Math.abs(y);
      if (waitForNeutral) { if (Math.max(ax, ay) <= release) waitForNeutral = false;return; }
      let next: MenuDirection | undefined;
      const vertical = direction === 'up' || direction === 'down';
      const current = vertical ? ay : ax, other = vertical ? ax : ay;
      const retained: MenuDirection = vertical ? y < 0 ? 'up' : 'down' : x < 0 ? 'left' : 'right';
      // Keep a deliberate axis through diagonal noise until the other axis is
      // clearly stronger. Separate press/release thresholds avoid edge chatter.
      if (direction === retained && current > release && other < current + axisBias) next = retained;
      else if (Math.max(ax, ay) >= engage) next = ay >= ax ? y < 0 ? 'up' : 'down' : x < 0 ? 'left' : 'right';
      if (!next) { direction = undefined;due = 0;return; }
      if (next !== direction) { direction = next;due = input.nowMs + delayMs;return next; }
      if (input.nowMs < due) return;
      // Never catch up missed repeats after a stalled render or suspended host.
      due = input.nowMs + intervalMs;return next;
    },
  };
}
