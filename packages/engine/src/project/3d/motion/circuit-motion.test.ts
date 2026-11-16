import { expect, test } from 'bun:test';
import { samplePlatformPosition3D, samplePlatformRotation3D } from './platform-motion.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createHyperfocus3DRuntime, readHyperfocus3DDeclaration } from '../../runtime-3d.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';

const car: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = {
  id: 'car', meshId: 'mesh', materialId: 'material', position: [32, .8, -22], scale: [.95, .55, 2.2], rotationY: 0,
  physics: { type: 'static', shape: 'box', continuous: false, gravityScale: 0 },
  animation: { kind: 'ping-pong', offset: [0, 0, 44], travelSeconds: 3.5, periodSeconds: 11, phase: .11, varyByMatch: true, turnRadius: 1.5, turnPivot: [32, 0, -22] },
};

test('circuit cars face travel, take curved return lanes, preserve trim and never wrap or reverse', () => {
  const trim: typeof car = { ...car, id: 'trim', position: [32.6, 1, -20] };
  const follow = structuredClone(car);if (follow.animation?.kind === 'ping-pong') follow.animation.phase += .5;
  for (const seed of [0, 1, 2, 9001]) {
    let previous = samplePlatformPosition3D(car, 0, seed), maxAcceleration = 0, speedBefore = 0;
    for (let tick = 1; tick <= 1800; tick++) {
      const point = samplePlatformPosition3D(car, tick, seed), yaw = samplePlatformRotation3D(car, tick, seed);
      const piece = samplePlatformPosition3D(trim, tick, seed), other = samplePlatformPosition3D(follow, tick, seed);
      const dx = point[0] - previous[0], dz = point[2] - previous[2], speed = Math.hypot(dx, dz) * 60;
      expect(dx * Math.sin(yaw) + dz * Math.cos(yaw)).toBeGreaterThan(0);
      expect(speed).toBeLessThan(21);
      expect(Math.hypot(piece[0] - point[0], piece[2] - point[2])).toBeCloseTo(Math.hypot(.6, 2), 5);
      expect(Math.hypot(other[0] - point[0], other[2] - point[2])).toBeGreaterThanOrEqual(2.99999);
      expect(point[0]).toBeGreaterThanOrEqual(28.99999);expect(point[0]).toBeLessThanOrEqual(32.00001);
      if (tick > 1) maxAcceleration = Math.max(maxAcceleration, Math.abs(speed - speedBefore) * 60);
      previous = point;speedBefore = speed;
    }
    expect(maxAcceleration).toBeLessThan(28);
  }
  for (const axis of [0, 1, 2]) expect(samplePlatformPosition3D(car, 660, 0)[axis]).toBeCloseTo(samplePlatformPosition3D(car, 0, 0)[axis]!, 10);
});

test('circuit physics heading and portable restore agree with authored sampling', async () => {
  const fixture = await combatMotionFixture(), declaration = readHyperfocus3DDeclaration(fixture.project)!;
  declaration.scenes[0]!.entities.push(structuredClone(car));
  const runtime = await createHyperfocus3DRuntime({ ...fixture.project, extensions: { ...fixture.project.extensions, hyperfocus3D: declaration } }, fixture.assets);
  for (let i = 0; i < 160; i++) runtime.step();
  const saved = runtime.snapshot(), checkpoint = runtime.checkpoint();
  for (let i = 0; i < 90; i++) runtime.step();
  const expected = runtime.snapshot(), pose = expected.entities.find(entity => entity.id === car.id)!;
  expect(pose.position).toEqual(samplePlatformPosition3D(car, expected.tick));
  expect(pose.rotationY).toBe(samplePlatformRotation3D(car, expected.tick));
  expect(runtime.physics.body(car.id)!.rotationY).toBeCloseTo(Math.sin(pose.rotationY / 2), 5);
  runtime.restore(JSON.parse(JSON.stringify(saved)));for (let i = 0; i < 90; i++) runtime.step();expect(runtime.snapshot().entities.find(entity => entity.id === car.id)).toEqual(pose);
  checkpoint.restore();for (let i = 0; i < 90; i++) runtime.step();expect(runtime.snapshot()).toEqual(expected);
});
