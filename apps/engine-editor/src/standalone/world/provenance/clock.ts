export type ClockExchange = { hostSend: number; workerReceive: number; workerSend: number; hostReceive: number };

/** Startup observation only; minimum positive delta is not a guaranteed resolution. */
export function observeTimerPrecision(now: () => number) {
  let previous = now(), minimum = Infinity, positive = 0;
  for (let read = 0; read < 4096; read++) {
    const current = now(), delta = current - previous;
    if (!Number.isFinite(current) || delta < 0) throw Error('Non-monotonic timer');
    if (delta > 0) { minimum = Math.min(minimum, delta);positive++; }previous = current;
  }
  return { reads: 4097, positiveDeltas: positive, minimumPositiveDeltaMs: Number.isFinite(minimum) ? minimum : undefined };
}

/** Bounds on worker-minus-host offset, without assuming symmetric transport.
 * Rounding allowance is explicit. No RTT midpoint is silently subtracted from
 * timeOrigin-based timestamps; retain uncertainty and reject impossible clocks. */
export function boundClockOffset(samples: readonly ClockExchange[], allowanceMs: number) {
  if (!samples.length || samples.length > 32 || !Number.isFinite(allowanceMs) || allowanceMs < 0) throw Error('Invalid clock calibration limits');
  let lower = -Infinity, upper = Infinity, minimumRoundTripMs = Infinity;
  for (const sample of samples) {
    if (!Object.values(sample).every(Number.isFinite) || sample.hostReceive < sample.hostSend || sample.workerSend < sample.workerReceive) throw Error('Non-monotonic calibration sample');
    lower = Math.max(lower, sample.workerSend - sample.hostReceive - allowanceMs);
    upper = Math.min(upper, sample.workerReceive - sample.hostSend + allowanceMs);
    minimumRoundTripMs = Math.min(minimumRoundTripMs, sample.hostReceive - sample.hostSend);
  }
  return { samples: samples.length, lowerMs: lower, upperMs: upper, minimumRoundTripMs, allowanceMs,
    consistent: lower <= upper, epochAligned: lower <= 0 && upper >= 0, uncertaintyWidthMs: Math.max(0, upper - lower),
    model: 'timeOrigin + now; no transport-midpoint correction' as const };
}
