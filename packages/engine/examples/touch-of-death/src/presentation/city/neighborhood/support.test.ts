import { expect, test } from 'bun:test';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { stationFootprintSupported } from './support.ts';

test('a contested station can straddle joined roof slabs while a real gap still rejects it', () => {
  const floors: Hyperfocus3DDeclaration['scenes'][number]['entities'] = [-1, 1].map(side => ({ id: String(side), meshId: 'box', materialId: 'concrete', position: [side, 5.8, 0], scale: [1, .2, 1], rotationY: 0,
    physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }));
  expect(stationFootprintSupported(floors, [0, 6.45, 0])).toBe(true);
  floors[0]!.scale[0] = .99;floors[1]!.scale[0] = .99;
  expect(stationFootprintSupported(floors, [0, 6.45, 0])).toBe(false);
});
