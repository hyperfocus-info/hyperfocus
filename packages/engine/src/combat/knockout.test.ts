import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';

test('a defeated fighter can be comboed but never acts, guards, techs or loses more health', () => {
  const sim = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const state = sim.capture();state.fighters[1]!.health = 0;sim.restore({ snapshot: state });
  const events = [];
  for (let frame = 0; frame < 60; frame++) events.push(...sim.step({ inputs: [{ fighterId: 'a', pressed: frame % 20 === 0 ? ['jab'] : [] }, { fighterId: 'b', pressed: ['jab'], guard: true, tech: true }] }));
  expect(events.filter(event => event.kind === 'hit')).toHaveLength(3);
  expect(events.every(event => event.attackerId === 'a' && event.damage === 0 && event.impulse.x > 0)).toBe(true);
  expect(sim.capture().fighters[1]).toMatchObject({ health: 0, guarding: false, moveId: '', techWindowFrames: 0, protectionFrames: 0, history: [] });
});
