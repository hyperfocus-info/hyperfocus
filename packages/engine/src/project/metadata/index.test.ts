import { expect, test } from 'bun:test';
import { hasHyperfocus3DProject, validateTimelineEffectPlacement2D } from './index.ts';
import { hasHyperfocus3DProject as legacyDetection } from '../runtime-3d.ts';
import { validateTimelineEffectPlacement2D as legacyPlacement } from '../runtime-timeline-2d.ts';

test('metadata preserves the dimension marker and existing runtime exports', () => {
  expect(legacyDetection).toBe(hasHyperfocus3DProject);expect(legacyPlacement).toBe(validateTimelineEffectPlacement2D);
  for (const value of [undefined, null, 3, [], {}, { extensions: null }, { extensions: [] }, { extensions: { hyperfocus3D: undefined } },
    Object.create({ extensions: { hyperfocus3D: {} } }), { extensions: Object.create({ hyperfocus3D: {} }) }]) {
    expect(hasHyperfocus3DProject(value)).toBe(false);
  }
  // A malformed declaration is still detected so the 3D validator reports it.
  for (const hyperfocus3D of [null, {}, 1, false]) expect(hasHyperfocus3DProject({ extensions: { hyperfocus3D } })).toBe(true);
});

test('placement leaf preserves bounded regions and target admission', () => {
  expect(() => validateTimelineEffectPlacement2D({ space: 'target' })).toThrow('requires a target');
  expect(() => validateTimelineEffectPlacement2D({ region: { fromX: NaN, toX: 1, fromY: 0, toY: 1 } })).toThrow('must be finite');
  expect(() => validateTimelineEffectPlacement2D({ region: { fromX: -1, toX: 1, fromY: 0, toY: 1 } })).toThrow('between 0 and 1');
  expect(() => validateTimelineEffectPlacement2D({ region: { fromX: 1, toX: 1, fromY: 0, toY: 1 } })).toThrow('precede');
  validateTimelineEffectPlacement2D({ space: 'target', targetId: 'player', region: { fromX: 0, fromY: 0, toX: 1, toY: 1 } });
});
