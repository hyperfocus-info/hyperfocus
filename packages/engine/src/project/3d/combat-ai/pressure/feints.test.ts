import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 }, facing: { x: 1, y: 0, z: 0 } }, { id: 'target', position: { x: 1.5, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const ai = createCombatAi3D({ config });
  const options = { seed: 12, state: sim.capture(), fighterId: 'ai', targetId: 'target', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 1.5, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { ai, sim, options, config };
}

test('resolved parries increase legal anticipatory feints before last-frame guard becomes visible', () => {
  const { ai, sim, options, config } = fixture();
  ai.step(options);
  const initial = sim.capture();
  sim.step({ inputs: [{ fighterId: 'ai', pressed: ['jab'] }] });
  for (let i = 1; i < config.moves.find(move => move.id === 'jab')!.startupFrames; i++) sim.step({ inputs: [] });
  const resolved = sim.step({ inputs: [{ fighterId: 'target', guard: true }] });
  expect(resolved.some(event => event.kind === 'parry')).toBe(true);
  ai.observe({ state: sim.capture(), events: resolved, fighterId: 'ai', targetId: 'target' });
  const saved = ai.capture();
  expect(saved.personality!.parried).toBeGreaterThan(0);
  const decisions = () => Array.from({ length: 100 }, (_, i) => {
    options.state = structuredClone(initial);options.state.frame = 100 + i;
    Object.assign(options.state.fighters[0]!, { attackSerial: i + 1, moveId: 'heavy', moveFrame: 6 });
    expect(options.state.fighters[1]!.guarding).toBe(false);
    return ai.step(options);
  });
  const choices = decisions();
  expect(choices.filter(choice => choice.input.pressed?.includes('feint')).length).toBeGreaterThan(5);
  ai.restore(JSON.parse(JSON.stringify(saved)));expect(decisions()).toEqual(choices);
  // Submit a chosen ordinary command into the authored heavy cancel window.
  const chosen = choices.find(choice => choice.input.pressed?.includes('feint'))!;
  const active = structuredClone(initial);active.frame = 100;
  Object.assign(active.fighters[0]!, { attackSerial: 1, moveId: 'heavy', moveFrame: 6 });
  sim.restore({ snapshot: active });sim.step({ inputs: [chosen.input] });
  expect(sim.capture().fighters[0]!.moveId).toBe('feint');
});

test('high AI never feints outside its authored cancel permission', () => {
  const { ai, options } = fixture();
  options.state.fighters[1]!.guarding = true;
  for (const frame of [1, 2, 25, 30, 40]) {
    Object.assign(options.state.fighters[0]!, { moveId: 'heavy', moveFrame: frame });
    expect(ai.step(options).input.pressed).not.toContain('feint');
  }
});
