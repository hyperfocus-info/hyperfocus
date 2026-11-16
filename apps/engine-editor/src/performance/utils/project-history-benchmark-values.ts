

export function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
export function positiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new RangeError(`--${name} must be a positive safe integer.`);
  return parsed;
}
export function nonNegativeInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(`--${name} must be a non-negative safe integer.`);
  return parsed;
}
