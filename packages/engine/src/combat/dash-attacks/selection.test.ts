import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../simulation.ts';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import { readCombatConfig } from '../read.ts';
import { sampleAttackTravel } from '../../project/3d/combat-motion/attack.ts';

const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }];
const make = () => createCombatSimulation({ config: createTouchOfDeathPreset(), fighters });

test('all twelve dash roles use current attack direction, Drive and actual dash context on ground or air', () => {
  for (const airborne of [false, true]) for (const direction of ['toward', 'away', 'neutral'] as const) for (const drive of [false, true]) for (const command of ['jab', 'heavy']) {
    const sim = make(), x = direction === 'toward' ? 1 : direction === 'away' ? -1 : 0;
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['drive', command], drive, airborne, dashing: true, direction: { x, y: 0, z: 0 } }] });
    expect(sim.inspect().fighters[0]!.moveId).toBe(`dash-${drive ? 'drive-' : ''}${command}-${direction}`);
    expect(sim.inspect().fighters[0]!.attackSerial).toBe(1);
  }
  const standing = make();standing.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], drive: true, direction: { x: 1, y: 0, z: 0 } }] });
  expect(standing.inspect().fighters[0]!.moveId).toBe('drive-heavy-toward');
});

test('lateral attacks use full forward/back hemispheres and keep the neutral deadzone', () => {
  for (const [x, z, expected] of [[.001, 1, 'jab-toward'], [-.001, 1, 'jab-away'], [0, -1, 'jab-toward'], [.1, .1, 'jab']] as const) {
    const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], direction: { x, y: 0, z } }] });
    expect(sim.inspect().fighters[0]!.moveId).toBe(expected);
  }
  expect(createTouchOfDeathPreset().moves.some(move => move.direction === 'side')).toBe(false);
});

test('unaffordable dash role cannot fall back to a cheaper standing attack, and buffered context survives save', () => {
  const sim = make(), saved = sim.capture();saved.fighters[0]!.stamina = 8;sim.restore({ snapshot: saved });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], dashing: true }] });expect(sim.inspect().fighters[0]!.moveId).toBe('');
  const blocked = make(), initial = blocked.capture();initial.fighters[0]!.landingFrames = 3;blocked.restore({ snapshot: initial });
  blocked.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], dashing: true, direction: { x: 1, y: 0, z: 0 } }] });
  const buffered = blocked.capture();expect(buffered.fighters[0]!.history[0]!.dashing).toBe(true);
  blocked.step();blocked.step();const expected = blocked.capture();blocked.restore({ snapshot: buffered });blocked.step();blocked.step();expect(blocked.capture()).toEqual(expected);
  expect(expected.fighters[0]!.moveId).toBe('dash-jab-toward');
  const malformed = structuredClone(buffered);Object.assign(malformed.fighters[0]!.history[0]!, { dashing: 'yes' });
  expect(() => blocked.restore({ snapshot: malformed })).toThrow();expect(blocked.capture()).toEqual(expected);
});

test('dive holds accelerate live travel without extending startup or active duration', () => {
  const config = createTouchOfDeathPreset(), move = config.moves.find(move => move.id === 'dash-drive-heavy-toward')!;
  const tap = make(), hold = make();
  for (const sim of [tap, hold]) sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], drive: true, dashing: true, direction: { x: 1, y: 0, z: 0 } }] });
  expect(sampleAttackTravel(move, hold.inspect().fighters[0]!).speed).toBeGreaterThan(0);
  for (let frame = 0; frame < 20; frame++) {
    tap.step();hold.step({ inputs: [{ fighterId: 'a', held: ['heavy'] }] });
    expect(hold.inspect().fighters[0]!.moveFrame).toBe(tap.inspect().fighters[0]!.moveFrame);
    expect(hold.inspect().fighters[0]!.charging).toBe(false);
  }
  expect(sampleAttackTravel(move, hold.inspect().fighters[0]!).speed).toBeGreaterThan(sampleAttackTravel(move, tap.inspect().fighters[0]!).speed);
  for (const invalid of [{ dashAttack: 'yes' }, { pose: 'other' }, { chargeMode: 'pause-air' }, { dashTransitionFrames: 13 }, { startupHopSpeed: 31 }]) {
    const copy = structuredClone(config);Object.assign(copy.moves[0]!, invalid);expect(() => readCombatConfig(copy)).toThrow();
  }
});

test('back hop never automatically lunges or attacks; wheel requires a second command inside its window', () => {
  for (const followup of [false, true]) {
    const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy', 'drive'], drive: true, dashing: true, direction: { x: -1, y: 0, z: 0 } }] });
    expect(sim.inspect().fighters[0]!.moveId).toBe('dash-drive-heavy-away');
    for (let frame = 1; frame < 12; frame++) sim.step({ inputs: [{ fighterId: 'a', held: ['drive'], drive: true }] });
    sim.step({ inputs: [{ fighterId: 'a', pressed: followup ? ['drive'] : [], drive: true }] });
    expect(sim.inspect().fighters[0]!.moveId).toBe(followup ? 'dash-wheel-kick' : 'dash-drive-heavy-away');
  }
});
