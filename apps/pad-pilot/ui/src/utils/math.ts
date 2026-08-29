/**
 * Clamps a numeric value into the inclusive `[min, max]` range.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function clamp01Or(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? clamp01(value ?? fallback) : fallback;
}

export function clampInteger(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.round(clamp(value, min, max)) : min;
}
