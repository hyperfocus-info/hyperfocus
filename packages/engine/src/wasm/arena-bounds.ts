import { nonNegativeSafeIntegerOr } from "@hyperfocus/utilities/math";

export function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

export function size(value: number, label: string): number {
  if (Number.isNaN(nonNegativeSafeIntegerOr(value, NaN))) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}
