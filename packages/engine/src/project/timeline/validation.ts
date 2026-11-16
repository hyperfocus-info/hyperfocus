
export function assertIntegerRange(value: number, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
}

export function assertText(value: string, label: string) {
  if (typeof value !== "string" || !value || value.length > 512) throw new TypeError(`${label} must be a non-empty string no longer than 512 characters`);
}
