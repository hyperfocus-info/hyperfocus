import { expect, test } from 'bun:test';
import { createTargetRayQuery3D } from '../target-rays.ts';
import { intersects, writeLocal } from '../../project/3d/combat-visuals/obstructions.ts';

type Vec = [number, number, number];
type Box = { position: Vec; rotation: [number, number, number, number]; scale: Vec };

test('both strategies preserve independent ray/slab decisions and prefix semantics', () => {
  let seed = 714;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const vector = (): Vec => [random() * 40 - 20, random() * 8 - 4, random() * 40 - 20];
  const queries = (['general', 'axis-aligned'] as const).map(strategy => createTargetRayQuery3D({ strategy }));
  for (let i = 0; i < 4000; i++) {
    const box: Box = { position: vector(), rotation: i % 4 ? [0, 0, 0, i % 3 ? 1 : 0] : [random(), random(), random(), random()], scale: [random() * 3, i % 5 ? random() : 1e-10, random() * 3] };
    const eye = vector(), targets = Array.from({ length: 13 }, vector), local: Vec = [0, 0, 0];
    for (const count of [0, 1, 7, 13]) for (const padding of [0, .35]) {
      const expected = targets.slice(0, count).some(target => { writeLocal(target, box, local);return intersects(eye, local, box.scale, padding); });
      for (const query of queries) expect(query.test(eye, targets, count, box, padding)).toBe(expected);
    }
  }
});

test('parallel, signed-zero, nonfinite and overflow cases agree with general arithmetic', () => {
  const general = createTargetRayQuery3D(), fast = createTargetRayQuery3D({ strategy: 'axis-aligned' });
  const box: Box = { position: [0, 0, 0], rotation: [0, -0, 0, 1], scale: [1, 1, 1] };
  for (const ex of [-1, 1, 1.000000000001, 2, Infinity, NaN]) for (const x of [-1e-8, -1e-9, -0, 0, 1e-9, 1e-8, -66.66666666666667, Infinity, NaN, 1e308]) {
    const targets: Vec[] = [[ex + x, 0, 0]], eye: Vec = [ex, 0, 0];
    for (const padding of [0, .35, NaN]) expect(fast.test(eye, targets, 1, box, padding)).toBe(general.test(eye, targets, 1, box, padding));
  }
  box.position[0] = -1e308;
  expect(fast.test([2, 0, 0], [[1e308, 0, 0]], 1, box, 0)).toBe(general.test([2, 0, 0], [[1e308, 0, 0]], 1, box, 0));
});

test('identity boxes remove transforms, rotated boxes retain them, with no cached query results', () => {
  const general = createTargetRayQuery3D({ diagnostics: true }), fast = createTargetRayQuery3D({ strategy: 'axis-aligned', diagnostics: true });
  const box: Box = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const targets: Vec[] = Array.from({ length: 512 }, () => [4, 0, 0]);
  expect(general.test([3, 0, 0], targets, 512, box, 0)).toBe(false);
  expect(fast.test([3, 0, 0], targets, 512, box, 0)).toBe(false);
  expect(general.work.quaternionTransforms).toBe(512);expect(fast.work.quaternionTransforms).toBe(0);
  expect(fast.work.targetTests).toBe(512);expect(fast.work.axisAlignedQueries).toBe(1);
  targets[0] = [0, 0, 0];expect(fast.test([3, 0, 0], targets, 512, box, 0)).toBe(true);
  box.rotation = [0, .5, 0, .866025403784];fast.test([3, 0, 0], targets, 512, box, 0);
  expect(fast.work.fallbacks).toBe(1);expect(fast.work.quaternionTransforms).toBeGreaterThan(0);
  fast.reset();expect(Object.values(fast.work).every(value => value === 0)).toBe(true);
  expect(() => fast.test([3, 0, 0], [], 1, box, 0)).toThrow('prefix');
  expect(() => fast.test([3, 0, 0], targets, -1, box, 0)).toThrow('prefix');
  expect(() => fast.test([3, 0, 0], targets, .5, box, 0)).toThrow('prefix');
});
