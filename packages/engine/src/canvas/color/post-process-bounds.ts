const MAX_POST_PROCESS_SAMPLES = 256;

export function positiveLoopInteger(value: number, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
  const normalized = Math.floor(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new RangeError(`${label} must resolve to an integer between 1 and ${max}`);
  }
  return normalized;
}

export function boundedSampleCount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  const normalized = Math.floor(value);
  if (!Number.isSafeInteger(normalized) || normalized > MAX_POST_PROCESS_SAMPLES) {
    throw new RangeError(`${label} must resolve to an integer between 0 and ${MAX_POST_PROCESS_SAMPLES}`);
  }
  return normalized;
}
