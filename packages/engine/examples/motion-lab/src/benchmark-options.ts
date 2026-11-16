import { positiveSafeIntegerOr, nonNegativeSafeIntegerOr, positiveNumberOr } from "@hyperfocus/utilities/math";

export function positiveInteger(value: string | undefined, label: string) {
  const number = Number(value);
  if (Number.isNaN(positiveSafeIntegerOr(number, NaN))) throw new Error(`${label} must be a positive integer`);
  return number;
}

export function nonNegativeInteger(value: string | undefined, label: string) {
  const number = Number(value);
  if (Number.isNaN(nonNegativeSafeIntegerOr(number, NaN))) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

export function positiveNumber(value: string | undefined, label: string) {
  const number = Number(value);
  if (Number.isNaN(positiveNumberOr(number, NaN))) throw new Error(`${label} must be a positive number`);
  return number;
}
