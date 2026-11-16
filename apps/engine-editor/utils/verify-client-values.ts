




export function requireBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}
export function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}
export function requireString(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
