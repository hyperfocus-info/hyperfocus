/** Narrow a DOM boundary before accessing element-specific operations. */
export function requireElement<T extends Element>(value: unknown, ctor: { new (...args: never[]): T }): T {
  if (!(value instanceof ctor)) throw new TypeError("Expected " + ctor.name);
  return value;
}
