/** One persistent world's fixed clock and bounded input mailbox. Hosts own transport and scheduling. */
export function createSimulationMailbox<Input, Event>(options: {
  input: Input; nowMs: number; stepMs: number; maxCatchUpMs: number; maxEvents: number;
  advance(input: Input, events: readonly Event[]): void;
}) {
  if (!Number.isFinite(options.nowMs) || !Number.isFinite(options.stepMs) || options.stepMs <= 0 || !Number.isFinite(options.maxCatchUpMs) || options.maxCatchUpMs < options.stepMs || !Number.isSafeInteger(options.maxEvents) || options.maxEvents < 1) throw new RangeError('Invalid simulation mailbox limits.');
  let input = options.input, sequence = 0, appliedSequence = 0, sampledAtMs = options.nowMs;
  let appliedSampledAtMs: number | undefined;
  let previous = options.nowMs, accumulator = 0, stopped = false;
  let pending: Event[] = [];
  return {
    /** Replaces continuous state, retaining ordered discrete events until a simulation tick consumes them.
     * False leaves the mailbox unchanged: the host must retain/retry its events. Input ownership transfers to this mailbox. */
    offer(update: { sequence: number; sampledAtMs: number; input: Input; events: readonly Event[] }) {
      if (stopped || !Number.isSafeInteger(update.sequence) || update.sequence <= sequence || !Number.isFinite(update.sampledAtMs) || pending.length + update.events.length > options.maxEvents) return false;
      sequence = update.sequence;sampledAtMs = update.sampledAtMs;input = update.input;pending.push(...update.events);
      return true;
    },
    advance(nowMs: number, paused = false) {
      if (stopped) throw new Error('Simulation mailbox is stopped.');
      if (!Number.isFinite(nowMs) || nowMs < previous) throw new RangeError('Simulation clock must be finite and monotonic.');
      const elapsed = nowMs - previous;previous = nowMs;
      const droppedMs = paused ? 0 : Math.max(0, accumulator + elapsed - options.maxCatchUpMs);
      accumulator = paused ? 0 : Math.min(options.maxCatchUpMs, accumulator + elapsed);
      let steps = 0;
      // Subtracting 33.333333333333336 from 50 leaves one ULP less than a
      // 60 Hz step. Compensate only for clock representation error, bounded
      // far below a meaningful input/timing interval. Never accumulate debt.
      const roundoff = Math.min(options.stepMs * 1e-7, Number.EPSILON * Math.max(1, Math.abs(nowMs), Math.abs(previous), options.maxCatchUpMs) * 8);
      try {
        while (accumulator + roundoff >= options.stepMs) {
          options.advance(input, pending);pending = [];appliedSequence = sequence;appliedSampledAtMs = sampledAtMs;
          accumulator = Math.max(0, accumulator - options.stepMs);steps++;
        }
      } catch (error) { stopped = true;throw error; }
      return { input, sequence, appliedSequence, sampledAtMs, appliedSampledAtMs, steps, droppedMs };
    },
    snapshot() { return { sequence, appliedSequence, appliedSampledAtMs, pendingEvents: pending.length, accumulatorMs: accumulator, stopped }; },
    dispose() { stopped = true;pending = []; },
  };
}
