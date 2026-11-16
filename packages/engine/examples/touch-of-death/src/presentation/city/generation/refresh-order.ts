/** Preserve canonical identity when an authoring pass replaces its owned records. */
export function retainRecordOrder<T>(values: readonly T[], key: (value: T) => string) {
  const indices = new Map(values.map((value, index) => [key(value), index]));
  return (next: T[]) => next.sort((a, b) => (indices.get(key(a)) ?? values.length) - (indices.get(key(b)) ?? values.length));
}
