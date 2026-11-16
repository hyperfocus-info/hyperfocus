import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('composite rollback rejects changed body topology before rewinding combat or physics', async () => {
  const { game, runtime } = await combatMotionFixture();
  const checkpoint = game.checkpoint();game.step(['a:heavy']);
  runtime.physics.removeBody('floor');
  const before = game.snapshot(), physics = runtime.physics.checkpoint();
  expect(before.combat!.state.fighters[0]!.moveId).toBe('heavy');
  expect(() => checkpoint.restore()).toThrow('body topology differs');
  expect(game.snapshot()).toEqual(before);expect(runtime.physics.checkpoint()).toEqual(physics);
});

test('composite rollback rejects changed presentation configuration before rewinding combat', async () => {
  const { game, runtime } = await combatMotionFixture();
  const checkpoint = game.checkpoint();game.step(['a:heavy']);
  runtime.configurePhysicalPerformance({ version: 2, sceneId: runtime.declaration.activeSceneId, fps: 60, durationFrames: 120, background: '#000000', groups: [], materialTracks: [], shots: [] });
  const before = game.snapshot(), physics = runtime.physics.checkpoint();
  expect(() => checkpoint.restore()).toThrow('configuration changes');
  expect(game.snapshot()).toEqual(before);expect(runtime.physics.checkpoint()).toEqual(physics);
});
