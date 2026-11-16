/** Exact base-10 serialization of signed safe-integer cents. No float rounding. */
export function decimalCents(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Cents must be a safe integer.');
  const digits = BigInt(Math.abs(cents)).toString().padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
