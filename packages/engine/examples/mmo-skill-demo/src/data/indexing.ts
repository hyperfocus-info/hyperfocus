export function indexUniqueBy<Key extends PropertyKey, Value>(
  values: readonly Value[],
  keyFor: (value: Value) => Key
): Record<Key, Value> {
  const indexed: Record<Key, Value> = Object.create(null);
  for (const value of values) {
    const key = keyFor(value);
    if (Object.prototype.hasOwnProperty.call(indexed, key)) {
      throw new Error(`Duplicate data key: ${String(key)}`);
    }
    indexed[key] = value;
  }
  return indexed;
}

export function groupByKey<Key extends PropertyKey, Value>(
  values: readonly Value[],
  keyFor: (value: Value) => Key
): Record<Key, readonly Value[]> {
  const grouped: Record<Key, Value[]> = Object.create(null);
  for (const value of values) {
    const key = keyFor(value);
    (grouped[key] ??= []).push(value);
  }
  return grouped;
}
