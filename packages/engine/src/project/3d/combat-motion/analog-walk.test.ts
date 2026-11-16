import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('ordinary human analog walking preserves half-stick magnitude', async () => {
  const speeds: number[] = [];
  for (const magnitude of [.5, 1]) {
    const f = await combatMotionFixture({ independentCombatInputs: true });
    f.game.step([], [
      { actions: new Set<string>(), direction: { x: -magnitude, y: 0, z: 0 } },
      { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } },
    ]);
    speeds.push(Math.abs(f.runtime.physics.body('a')!.velocityX));
  }
  expect(speeds[0]!).toBeGreaterThan(speeds[1]! * .45);
  expect(speeds[0]!).toBeLessThan(speeds[1]! * .55);
});
