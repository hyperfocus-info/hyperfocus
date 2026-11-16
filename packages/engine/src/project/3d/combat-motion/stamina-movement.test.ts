import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { createCombatMotion3D } from '../combat-motion.ts';

test('stamina linearly reduces shared ground speed and response, with deterministic restoration', async () => {
  const starts: number[] = [], tops: number[] = [];
  for (const stamina of [0, 50, 100]) {
    const f = await combatMotionFixture({ independentCombatInputs: true, staminaRegen: 0, movement: { accelerationScale: .8, exhaustedMovementScale: .8 } });
    const saved = f.game.snapshot();saved.combat!.state.fighters[0]!.stamina = stamina;f.game.restore(saved);
    const inputs = [{ actions: new Set<string>(), direction: { x: -1, y: 0, z: 0 } }, { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }];
    const checkpoint = f.game.checkpoint();
    f.game.step([], inputs);starts.push(Math.abs(f.runtime.physics.body('a')!.velocityX));
    const first = f.game.snapshot();checkpoint.restore();f.game.step([], inputs);expect(f.game.snapshot()).toEqual(first);
    for (let tick = 0; tick < 20; tick++) f.game.step([], inputs);
    tops.push(Math.abs(f.runtime.physics.body('a')!.velocityX));
    expect(Math.abs(starts.at(-1)! - 6 * (0.8 + stamina * .002) ** 2 * .8)).toBeLessThan(.2);
    expect(Math.abs(tops.at(-1)! - 6 * (0.8 + stamina * .002))).toBeLessThan(.2);
    for (const field of ['accelerationScale', 'exhaustedMovementScale']) for (const value of [-1, 1.01, Infinity]) expect(() => readCombatProject3D({ ...f.project.extensions.hyperfocusCombat, movement: { ...f.project.extensions.hyperfocusCombat.movement, [field]: value } })).toThrow();
  }
  expect(starts[0]!).toBeLessThan(starts[1]!);expect(starts[1]!).toBeLessThan(starts[2]!);
  expect(tops[0]! / tops[2]!).toBeCloseTo(.8, 1);
});

test('AI and player controls receive identical stamina response without changing stop deceleration', async () => {
  for (const control of ['player', 'dummy'] as const) {
    const f = await combatMotionFixture({ staminaRegen: 0 });
    const definition = readCombatProject3D(f.project.extensions.hyperfocusCombat)!;
    definition.fighters = [{ entityId: 'a', actionPrefix: 'a:', control }];
    Object.assign(definition.movement!, { accelerationScale: .8, exhaustedMovementScale: .8 });
    const motion = createCombatMotion3D({ runtime: f.runtime, definition }), saved = f.game.snapshot().combat!.state;
    saved.fighters = [saved.fighters[0]!];saved.fighters[0]!.stamina = 0;
    f.runtime.physics.setVelocity('a', 0, 0, 0);
    const controls = new Map([['a', { actions: new Set<string>(), previous: new Set<string>(), direction: { x: -1, y: 0, z: 0 } }]]);
    motion.step(saved, new Set(), new Set(), new Set(['a']), controls);
    expect(f.runtime.physics.body('a')!.velocityX).toBeCloseTo(-3.072, 8);
    expect(motion.idle('a')).toBe(false);
    controls.get('a')!.direction.x = 0;
    motion.step(saved, new Set(), new Set(), new Set(['a']), controls);
    expect(f.runtime.physics.body('a')!.velocityX).toBe(0);
    expect(motion.idle('a')).toBe(true);
  }
});
