/**
 * Returns a shallow-copied array with one item moved from `fromIndex` to `toIndex`.
 */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return items;
  }

  next.splice(toIndex, 0, moved);
  return next;
}
