import { positiveSafeIntegerOr } from "@hyperfocus/utilities/math";

export function positiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (Number.isNaN(positiveSafeIntegerOr(parsed, NaN))) throw new RangeError(`--${name} must contain positive safe integers.`);
  return parsed;
}
