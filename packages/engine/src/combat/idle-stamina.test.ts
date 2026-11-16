import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';
import { readCombatConfig } from './read.ts';
import type { CombatInput } from './state.ts';

test('idle recovery excludes movement, airborne, buttons, guarding, and commitment', () => {
  const config = createTouchOfDeathPreset();
  const cases: Array<[Partial<CombatInput>, number]> = [
    [{}, .759375], [{ direction: { x: .01, y: 0, z: 0 } }, .6075], [{ idle: false }, .6075],
    [{ airborne: true }, .2025], [{ guard: true }, .6075], [{ drive: true }, .6075],
    [{ tech: true }, .6075], [{ pressed: ['unknown'] }, .6075], [{ held: ['unknown'] }, .6075],
    [{ locomotionCost: 101 }, .6075], [{ locomotionCost: 0 }, 0],
  ];
  for (const [input, recovery] of cases) {
    const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }] });
    const saved = sim.capture();saved.fighters[0]!.stamina = 20;sim.restore({ snapshot: saved });
    sim.step({ inputs: [{ fighterId: 'a', ...input }] });
    expect(sim.inspect().fighters[0]!.stamina).toBeCloseTo(20 + recovery, 8);
  }
  for (const kind of ['hit', 'block', 'parry'] as const) {
    const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }] });
    const saved = sim.capture();Object.assign(saved.fighters[0]!, { stamina: 20, stunFrames: 3, stunKind: kind });sim.restore({ snapshot: saved });
    sim.step();expect(sim.inspect().fighters[0]!.stamina).toBeCloseTo(20 + (kind === 'hit' ? .405 : 0), 8);
  }
  const attacking = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }] });
  attacking.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  const spent = attacking.inspect().fighters[0]!.stamina;
  attacking.step();expect(attacking.inspect().fighters[0]!.stamina).toBe(spent);
});

test('idle caps and saved replay use the same rules; malformed idle recovery is rejected', () => {
  const config = createTouchOfDeathPreset(), sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }] });
  const saved = sim.capture();saved.fighters[0]!.stamina = 99.8;sim.restore({ snapshot: saved });
  sim.step();expect(sim.inspect().fighters[0]!.stamina).toBe(100);
  const expected = sim.capture();sim.restore({ snapshot: saved });sim.step();expect(sim.capture()).toEqual(expected);
  for (const idleStaminaRegen of [-1, NaN, Infinity]) expect(() => readCombatConfig({ ...config, idleStaminaRegen })).toThrow();
  saved.fighters[0]!.stamina = 20;saved.fighters[0]!.health = 0;sim.restore({ snapshot: saved });sim.step();expect(sim.inspect().fighters[0]!.stamina).toBe(20);
});
