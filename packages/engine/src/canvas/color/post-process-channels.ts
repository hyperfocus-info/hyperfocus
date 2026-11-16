import { clampLowerFirst } from "@hyperfocus/utilities/math";
import { clamp01 as clampUnit } from "@hyperfocus/utilities/math";

export const clampByte = (value: number) => clampLowerFirst(Math.round(value), 0, 255);

export function srgbByteToLinearByte(value: number) {
  const encoded = clampUnit(finiteNumber(value, "sRGB byte") / 255);
  const linear = encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  return linear * 255;
}

export function linearByteToSrgbByte(value: number) {
  const linear = clampUnit(finiteNumber(value, "linear RGB byte") / 255);
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (0.4166666666666667) - 0.055;
  return encoded * 255;
}

export function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}
