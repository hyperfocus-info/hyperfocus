/** Shared validation used by timeline declarations and their runtime. */
export function assertTimelineFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

export function assertTimelineRange(value: number, label: string, minimum: number, maximum: number) {
  assertTimelineFinite(value, label);
  if (value < minimum || value > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
}
