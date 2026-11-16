import { nonNegativeSafeIntegerOr, positiveSafeIntegerOr } from "@hyperfocus/utilities/math";
import { compareText } from "@hyperfocus/utilities/text";
import { utf8 } from "./encoding.ts";

export function classifyAuthFailure(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  if (/replay/i.test(message)) return "replay";
  if (/expired|lifetime|future|validity/i.test(message)) return "time";
  if (/signature|signing key/i.test(message)) return "signature";
  if (/draining/i.test(message)) return "draining";
  return "invalid";
}

export function boundedCount(value: number, label: string): number {
  if (Number.isNaN(nonNegativeSafeIntegerOr(value, NaN)) || value > 100_000_000) throw new Error(`${label} must be a non-negative bounded integer.`);
  return value;
}

export function assertIdentifier(value: unknown, label: string, maxBytes: number): asserts value is string {
  if (typeof value !== "string" || !value || utf8(value).byteLength > maxBytes || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} must be non-empty bounded text without control characters.`);
}

export function assertRecordId(value: unknown, label: string): asserts value is string {
  assertIdentifier(value, label, 256);
}

export function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(nonNegativeSafeIntegerOr(value, NaN))) throw new Error(`${label} must be a non-negative safe integer timestamp.`);
}

export function readClock(clock: () => number, label: string): number {
  const value = clock();
  assertTimestamp(value, label);
  return value;
}

export function positiveInteger(value: number, label: string): number {
  if (Number.isNaN(positiveSafeIntegerOr(value, NaN))) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

export function nonNegativeInteger(value: number, label: string): number {
  if (Number.isNaN(nonNegativeSafeIntegerOr(value, NaN))) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

export function boundedPositiveInteger(value: number, label: string, maximum: number): number {
  const result = positiveInteger(value, label);
  if (result > maximum) throw new Error(`${label} may not exceed ${maximum}.`);
  return result;
}

export function boundedNonNegativeInteger(value: number, label: string, maximum: number): number {
  const result = nonNegativeInteger(value, label);
  if (result > maximum) throw new Error(`${label} may not exceed ${maximum}.`);
  return result;
}

export function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unknown or missing fields.`);
}
