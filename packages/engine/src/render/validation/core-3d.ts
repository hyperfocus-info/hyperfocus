
export function requireCapacity(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer; received ${value}.`);
  }
  return value;
}

export function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite; received ${value}.`);
  }
  return value;
}
