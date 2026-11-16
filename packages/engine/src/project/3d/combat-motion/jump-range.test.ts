import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { createCombatMotion3D } from '../combat-motion.ts';

const old = { separateJump: true, jumpSpeed: 10.5, jumpHoldFrames: 30, jumpHoldGravityScale: .62 };
const current = { ...old, jumpSpeed: 11.615, jumpReleaseSpeedRatio: .327 };
async function height(held: number, movement = current) {
  const { game, runtime } = await combatMotionFixture({ gravityScale: 1.9, movement });
  const floor = runtime.physics.body('a')!.y;let peak = floor;
  for (let frame = 0; frame < 150; frame++) {
    game.step(frame < held ? ['a:jump'] : []);peak = Math.max(peak, runtime.physics.body('a')!.y);
  }
  return peak - floor;
}

test('jump range gives a short tap and twenty-percent higher full hold, with monotonic intermediate heights', async () => {
  const oldMin = await height(1, { ...old, jumpReleaseSpeedRatio: 1 }), oldMax = await height(30, { ...old, jumpReleaseSpeedRatio: 1 });
  const heights = [];
  for (const held of [1, 5, 10, 15, 20, 25, 29, 30, 60]) heights.push(await height(held));
  expect(heights[0]! / oldMin).toBeCloseTo(.2, 2);
  expect(heights[7]! / oldMax).toBeCloseTo(1.2, 2);
  for (let index = 1; index < 8; index++) expect(heights[index]!).toBeGreaterThan(heights[index - 1]!);
  expect(heights[8]).toBe(heights[7]);
});

test('early jump release reconstructs from checkpoints and never cuts falling velocity', async () => {
  const { game, runtime, project } = await combatMotionFixture({ gravityScale: 1.9, movement: current });
  for (let index = 0; index < 8; index++) game.step(['a:jump']);
  const checkpoint = game.checkpoint();
  const sequence = () => { for (let frame = 0; frame < 40; frame++) game.step([]);return game.snapshot(); };
  const first = sequence();checkpoint.restore();expect(sequence()).toEqual(first);
  expect(readCombatProject3D(project.extensions.hyperfocusCombat)!.movement!.jumpReleaseSpeedRatio).toBe(.327);
  for (const ratio of [-.1, 1.1]) expect(() => readCombatProject3D({ ...project.extensions.hyperfocusCombat, movement: { ...project.extensions.hyperfocusCombat.movement, jumpReleaseSpeedRatio: ratio } })).toThrow();
  checkpoint.restore();runtime.physics.setVelocity('a', 0, -4, 0);game.step([]);expect(runtime.physics.body('a')!.velocityY).toBeLessThan(-4);
});

test('AI keeps a held jump through a buffered landing lock until its actual launch', async () => {
  const { runtime, project } = await combatMotionFixture({ movement: current });
  const motion = createCombatMotion3D({ runtime, definition: readCombatProject3D(project.extensions.hyperfocusCombat)! });
  const saved = motion.capture();
  saved[0]!.jumpBuffer = 8;saved[0]!.jumpQueued = true;
  motion.restore(saved);expect(motion.holdingJump('a')).toBe(true);
  saved[0]!.jumpBuffer = 0;saved[0]!.jumpQueued = false;saved[0]!.jumpHold = 29;
  motion.restore(saved);expect(motion.holdingJump('a')).toBe(true);
  saved[0]!.jumpHold = 0;motion.restore(saved);expect(motion.holdingJump('a')).toBe(false);
});
