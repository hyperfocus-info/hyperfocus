/** Runtime assertion with caller-owned error text and control-flow narrowing. */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
