export function makeTiles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index % 256,
    x: (index % 128) * 16,
    y: Math.floor(index / 128) * 16
  }));
}
