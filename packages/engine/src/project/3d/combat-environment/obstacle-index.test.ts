import { expect, test } from 'bun:test';
import { createObstacleIndex } from './obstacle-index.ts';
import { combatSegmentMayMeetBox, type CombatObstacleBounds } from './obstacle-bounds.ts';

test('indexed broadphase matches exhaustive segment candidates and preserves source order', () => {
  let seed = 42;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 0x100000000;
  const boxes: CombatObstacleBounds[] = Array.from({ length: 129 }, () => {
    const x = random() * 200 - 100, z = random() * 200 - 100, sx = random() * 30, sz = random() * 30;
    return { minX: x - sx, maxX: x + sx, minZ: z - sz, maxZ: z + sz, body: undefined! };
  });
  const before = boxes.slice(), index = createObstacleIndex(boxes);
  expect(boxes).toEqual(before);
  for (let i = 0; i < 2000; i++) {
    const ax = random() * 250 - 125, az = random() * 250 - 125, bx = i % 3 ? random() * 250 - 125 : ax, bz = i % 5 ? random() * 250 - 125 : az, radius = random() * 5;
    const expected = boxes.filter(box => combatSegmentMayMeetBox(ax, az, bx, bz, radius, box));
    const found = new Set<CombatObstacleBounds>();
    index.some(ax, az, bx, bz, radius, box => { if (combatSegmentMayMeetBox(ax, az, bx, bz, radius, box)) found.add(box);return false; });
    expect(found).toEqual(new Set(expected));
  }
});

test('remote obstacles are rejected as groups without dropping grazing or oversized blockers', () => {
  const boxes: CombatObstacleBounds[] = Array.from({ length: 1024 }, (_, i) => ({ minX: i * 10, maxX: i * 10 + 1, minZ: 0, maxZ: 1, body: undefined! }));
  boxes.push({ minX: -10000, maxX: 10000, minZ: 20, maxZ: 21, body: undefined! });
  const index = createObstacleIndex(boxes);let visited = 0;
  expect(index.some(-1, .5, 2, .5, .5, () => { visited++;return false; })).toBe(false);
  expect(visited).toBeLessThan(32);
  for (const radius of [0, .5, 3]) {
    const z = 1 + radius + 1e-8;
    expect(index.some(-1, z, 2, z, radius, box => combatSegmentMayMeetBox(-1, z, 2, z, radius, box))).toBe(true);
  }
  expect(index.some(-1, 20.5, 2, 20.5, 0, box => box === boxes.at(-1))).toBe(true);
  expect(createObstacleIndex([]).some(0, 0, 0, 0, 0, () => true)).toBe(false);
});
