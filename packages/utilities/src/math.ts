/** Upper bound wins when bounds are inverted, matching min(max, max(min, value)).
 * Select minimum explicitly for legacy lower-bound-first clamping. NaN propagates. */
export function clamp(value: number, minimum: number, maximum: number, inverted: 'minimum' | 'maximum' = 'maximum') {
  return inverted === 'minimum' ? clampLowerFirst(value, minimum, maximum) : Math.min(maximum, Math.max(minimum, value));
}

// Fixed bounds keep unit-only consumers independent of general clamp policies.
export function clamp01(value: number) { return Math.min(1, Math.max(0, value)); }

/** Lower bound wins on inverted bounds; retained for existing engine consumers. */
export function clampLowerFirst(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clamp01Or(value: number | undefined, fallback = 0) {
  return isFiniteNumber(value) ? clamp01(value) : fallback;
}

export function clampInteger(value: number, minimum: number, maximum: number) {
  return isFiniteNumber(value) ? Math.round(clamp(value, minimum, maximum)) : minimum;
}

export function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

/** Uses ordinary JavaScript Math.round semantics, including its negative ties. */
export function roundDecimal(value: number, places = 0) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function finiteOr(value: unknown, fallback: number) {
  return isFiniteNumber(value) ? value : fallback;
}

export function positiveNumberOr(value: unknown, fallback: number) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

export function nonNegativeNumberOr(value: unknown, fallback: number) {
  return isFiniteNumber(value) && value >= 0 ? value : fallback;
}

export function positiveSafeIntegerOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function nonNegativeSafeIntegerOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function smoothstep01(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function modulo(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor; }

export function mean(values: readonly number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

/** Prefix parsing is intentional: "1e3" parses to 1, rather than 1000. */
export function parseBoundedInteger(value: string | null, minimum: number, maximum: number, inverted: NonNullable<Parameters<typeof clamp>[3]> = 'minimum') {
  if (!value) return;
  const parsed = Number.parseInt(value, 10);
  return isFiniteNumber(parsed) ? clamp(Math.round(parsed), minimum, maximum, inverted) : undefined;
}

/** Retains parseFloat prefixes and Math.round's negative-tie/step behavior. */
export function parseBoundedDecimal(value: string | null, minimum: number, maximum: number, step: number, inverted: NonNullable<Parameters<typeof clamp>[3]> = 'minimum') {
  if (!value) return;
  const parsed = Number.parseFloat(value);
  return isFiniteNumber(parsed) ? clamp(Math.round(parsed / step) * step, minimum, maximum, inverted) : undefined;
}
