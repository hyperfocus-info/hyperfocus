/** Duplicate host IDs remain distinct by retained absolute row position. */
export function transcriptRowKey(id: string, index: number) {
  return `${id}:${index}`;
}
