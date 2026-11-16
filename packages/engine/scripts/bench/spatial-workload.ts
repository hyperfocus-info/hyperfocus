import type { CollisionAabb } from "../../src/math/broadphase.ts";

export type RectItem = CollisionAabb & {
  id: number;
};

export type PointItem = {
  id: number;
  x: number;
  y: number;
  radius?: number;
};

export function rects(count: number) {
  const out: RectItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 37) % 4096) + ((i % 7) * 0.25);
    const y = (Math.floor((i * 91) % 4096)) + ((i % 5) * 0.25);
    const w = 8 + (i % 11);
    const h = 8 + ((i * 3) % 13);
    out.push({ id: i, minX: x, minY: y, maxX: x + w, maxY: y + h });
  }
  return out;
}

export function points(count: number) {
  const out: PointItem[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: i,
      x: ((i * 53) % 8192) + ((i % 3) * 0.125),
      y: ((i * 97) % 8192) + ((i % 5) * 0.125)
    });
  }
  return out;
}

export function queries(count: number, worldSize: number, radius: number) {
  const out: CollisionAabb[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i * 131) % worldSize;
    const y = (i * 197) % worldSize;
    out.push({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius });
  }
  return out;
}

export function checksumIds(ids: Iterable<number>) {
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    count += 1;
    sum = (sum + ((id + 1) * 2654435761)) >>> 0;
  }
  return sum ^ count;
}

export function overlapsStrict(a: CollisionAabb, b: CollisionAabb) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function pairChecksum(a: number, b: number) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return ((low + 1) * 31 + (high + 1)) >>> 0;
}

export const key = (x: number, y: number) => `${x},${y}`;
