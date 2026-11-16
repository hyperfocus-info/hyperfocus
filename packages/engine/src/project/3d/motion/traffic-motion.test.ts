import { expect, test } from 'bun:test';
import { samplePlatformPosition3D } from './platform-motion.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createHyperfocus3DRuntime, isHyperfocus3DSnapshot, readHyperfocus3DDeclaration } from '../../runtime-3d.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';

const vehicle: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = {
  id: 'vehicle', meshId: 'mesh', materialId: 'material', position: [-20, 1, 0], scale: [2, 1, 1], rotationY: 0,
  physics: { type: 'static', shape: 'box', continuous: false, gravityScale: 0 },
  animation: { kind: 'ping-pong', offset: [40, 0, 0], travelSeconds: 2, periodSeconds: 12, phase: 0, varyByMatch: true },
};

test('fast traffic has parked intervals, bounded 20 m/s passes, no wraps and coherent body/trim motion', () => {
  const trim: typeof vehicle = { ...vehicle, id: 'window', position: [-20, 2, 1] };
  for (const seed of [0, 1, 2, 9001]) {
    let previous = samplePlatformPosition3D(vehicle, 0, seed), stopped = 0, moving = 0;
    for (let tick = 1; tick < 1800; tick++) {
      const point = samplePlatformPosition3D(vehicle, tick, seed), window = samplePlatformPosition3D(trim, tick, seed);
      const speed = Math.abs(point[0] - previous[0]) * 60;
      expect(speed).toBeLessThanOrEqual(20.00001);
      expect(window[0]).toBe(point[0]);expect(window[1] - point[1]).toBe(1);
      if (speed < .001) stopped++;else moving++;
      previous = point;
    }
    expect(stopped).toBeGreaterThan(100);expect(moving).toBeGreaterThan(100);
  }
  expect(samplePlatformPosition3D(vehicle, 300, 0)).not.toEqual(samplePlatformPosition3D(vehicle, 300, 1));
});

test('traffic variation survives portable restore and trusted rewind without extra hidden state', async () => {
  const base = await combatMotionFixture(), declaration = readHyperfocus3DDeclaration(base.project)!;
  const scene = declaration.scenes[0]!;
  scene.entities.push({ ...structuredClone(vehicle), meshId: scene.entities[0]!.meshId, materialId: scene.entities[0]!.materialId });
  const runtime = await createHyperfocus3DRuntime({ ...base.project, extensions: { ...base.project.extensions, hyperfocus3D: declaration } }, base.assets);
  runtime.restore({ ...runtime.snapshot(), motionSeed: 2 });
  for (let i = 0; i < 90; i++) runtime.step();
  const saved = runtime.snapshot(), checkpoint = runtime.checkpoint();
  for (let i = 0; i < 30; i++) runtime.step();const expected = runtime.snapshot();
  runtime.restore(saved);for (let i = 0; i < 30; i++) runtime.step();
  expect(runtime.snapshot().entities.find(entity => entity.id === 'vehicle')).toEqual(expected.entities.find(entity => entity.id === 'vehicle'));
  expect(runtime.snapshot().motionSeed).toBe(2);
  checkpoint.restore();for (let i = 0; i < 30; i++) runtime.step();expect(runtime.snapshot()).toEqual(expected);
  expect(isHyperfocus3DSnapshot({ ...saved, motionSeed: -1 })).toBe(false);
  expect(isHyperfocus3DSnapshot({ ...saved, motionSeed: Infinity })).toBe(false);
});
