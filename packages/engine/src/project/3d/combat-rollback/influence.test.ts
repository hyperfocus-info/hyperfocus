import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { steerCombatImpulse } from '../../../combat/input.ts';
import { createCombatInfluence3D } from '../combat-influence.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatHitstop3D } from '../combat-hitstop.ts';

const input = (actions: string[] = [], z = 0) => ({ actions: new Set(actions), direction: { x: 0, y: 0, z } });
test('sampling a local analog stick before any jump remains portable JSON save data', () => {
  const pause = createCombatHitstop3D();pause.begin(new Set(), { x: .2, y: 0, z: 0 });
  const saved = pause.capture();expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  expect(Object.values(saved).every(value => value !== undefined)).toBe(true);
});
async function launch(practice = false) {
  const result = await combatMotionFixture({ independentCombatInputs: true, match: practice });
  if (practice) result.game.step(['match:practice'], [input(), input()]);
  result.game.step([], [input(['heavy']), input()]);
  for (let frame = 0; frame < 60 && !result.game.snapshot().combat!.hitstop.remaining; frame++) result.game.step([], [input(), input()]);
  expect(result.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  return result;
}
test('analog launch influence scales with tilt and preserves impulse energy', () => {
  const base = { x: 5, y: 10, z: 0 };
  const outputs = [0, .2, .5, 1].map(z => steerCombatImpulse(base, { x: 0, y: 0, z }, .55));
  for (let i = 1; i < outputs.length; i++) expect(outputs[i]!.z).toBeGreaterThan(outputs[i - 1]!.z);
  for (const result of outputs) expect(Math.hypot(result.x, result.y, result.z)).toBeCloseTo(Math.hypot(base.x, base.y, base.z), 9);
});
test('live analog DI changes launch during hitstop without advancing time or stacking energy, and restores exactly', async () => {
  const { game, runtime } = await launch(true);
  const initial = game.snapshot(), velocity = runtime.physics.body('b')!;
  game.step([], [input(), input([], .2)]);const slight = runtime.physics.body('b')!;
  expect(game.snapshot().tick).toBe(initial.tick);expect(slight.z).toBe(velocity.z);expect(slight.velocityZ).toBeGreaterThan(velocity.velocityZ);
  const saved = game.snapshot();
  function change() {
    game.step([], [input(), input([], 1)]);const full = runtime.physics.body('b')!;
    game.step([], [input(), input([], 1)]);expect(runtime.physics.body('b')!.velocityZ).toBe(full.velocityZ);
    return game.snapshot();
  }
  const full = change();expect(runtime.physics.body('b')!.velocityZ).toBeGreaterThan(slight.velocityZ);
  game.restore(saved);expect(change()).toEqual(full);
  const invalid = structuredClone(saved);invalid.combat!.influence[0]!.remaining = 7;
  expect(() => game.restore(invalid)).toThrow();expect(game.snapshot()).toEqual(full);
});
test('third live tick can correct the launch; fourth tick cannot', async () => {
  for (const delay of [2, 3]) {
    const { game, runtime } = await launch();
    while (game.snapshot().combat!.hitstop.remaining) game.step([], [input(), input()]);
    for (let frame = 0; frame < delay; frame++) game.step([], [input(), input()]);
    game.step([], [input(), input([], 1)]);
    expect(runtime.physics.body('b')!.velocityZ > .1).toBe(delay === 2);
  }
});

test('surface impact closes late influence before it can alter a bounce', async () => {
  const { game, runtime } = await launch();
  const influence = createCombatInfluence3D({ world: runtime.physics, config: createTouchOfDeathPreset(), fighterIds: ['a', 'b'] });
  influence.contact([{ id: 'launch', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'heavy', kind: 'hit', damage: 24, impulse: { x: 1, y: 10, z: 0 } }], game.snapshot().combat!.state);
  expect(influence.capture()).toHaveLength(1);
  const velocity = runtime.physics.body('b');
  influence.step(new Map([['b', { x: 0, y: 0, z: 1 }]]), false, [{ fighterId: 'b' }]);
  expect(influence.capture()).toHaveLength(0);expect(runtime.physics.body('b')).toEqual(velocity);
});
