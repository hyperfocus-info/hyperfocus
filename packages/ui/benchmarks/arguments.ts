import { positiveSafeIntegerOr, nonNegativeSafeIntegerOr } from "@hyperfocus/utilities/math";

export function positiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (Number.isNaN(positiveSafeIntegerOr(parsed, NaN))) throw new RangeError(`--${name} must be a positive safe integer.`);
  return parsed;
}

export function nonNegativeInteger(name: string, value: string) {
  const parsed = Number(value);
  if (Number.isNaN(nonNegativeSafeIntegerOr(parsed, NaN))) throw new RangeError(`--${name} must be a non-negative safe integer.`);
  return parsed;
}
