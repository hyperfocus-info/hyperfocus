import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  config.parryFrames = 0;
  config.moves = [{ ...config.moves[0]!, startupFrames: 0, activeFrames: 1, recoveryFrames: 0, hitRecoveryFrames: 0, blockstunFrames: 2, cancels: [] }];
  return createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 1, y: 0, z: 0 } },
    { id: 'b', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } },
  ] });
}

test('Touch of Death guards both 60 degree boundaries, but side and rear attacks bypass it', () => {
  for (const degrees of [-180, -90, -61, -60, 0, 60, 61, 90, 180]) {
    const simulation = fixture(), radians = degrees * Math.PI / 180;
    const events = simulation.step({
      poses: [{ fighterId: 'a', position: { x: Math.cos(radians), y: 5, z: Math.sin(radians) } }],
      inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true }],
      contacts: [{ attackerId: 'a', targetId: 'b' }],
    });
    expect(events[0]?.kind).toBe(Math.abs(degrees) <= 60 ? 'block' : 'hit');
  }
});

test('blockstun locks facing while positions can change, then guard turns freely again', () => {
  const simulation = fixture();
  simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true }], contacts: [{ attackerId: 'a', targetId: 'b' }] });
  const pose = { fighterId: 'b', position: { x: 0, y: 0, z: 1 }, facing: { x: -1, y: 0, z: 0 } };
  for (let frame = 0; frame < 2; frame++) {
    simulation.step({ poses: [pose], inputs: [{ fighterId: 'b', guard: true }], contacts: [] });
    expect(simulation.capture().fighters[1]!.facing.x).toBe(1);
    expect(simulation.capture().fighters[1]!.position.z).toBe(1);
  }
  simulation.step({ poses: [pose], inputs: [{ fighterId: 'b', guard: true }], contacts: [] });
  expect(simulation.capture().fighters[1]!.facing.x).toBe(-1);
});

test('a cross-up during blockstun hits even when defender requests an instant turn', () => {
  const simulation = fixture();
  const inputs = [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true }];
  const contacts = [{ attackerId: 'a', targetId: 'b' }];
  simulation.step({ inputs, contacts });
  const events = simulation.step({ inputs, contacts, poses: [
    { fighterId: 'a', position: { x: -1, y: 0, z: 0 } },
    { fighterId: 'b', position: { x: 0, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  expect(events[0]?.kind).toBe('hit');
});

test('host weapon reach changes collision and contact location without changing move tuning', () => {
  for (const scale of [1, 3]) {
    const simulation = fixture();
    const events = simulation.step({
      inputs: [{ fighterId: 'a', pressed: ['jab'] }],
      poses: [{ fighterId: 'a', position: { x: 0, y: 0, z: 0 } }, { fighterId: 'b', position: { x: 2.4, y: 0, z: 0 } }],
      attackReachScales: { a: scale },
    });
    expect(events.length).toBe(scale === 1 ? 0 : 1);
    if (events[0]) expect(events[0].contactPoint?.x).toBeCloseTo(2.4);
  }
  const simulation = fixture(), before = simulation.capture();
  expect(() => simulation.step({ attackReachScales: { a: -1 } })).toThrow();
  expect(simulation.capture()).toEqual(before);
});
