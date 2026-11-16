import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from './touch-of-death.ts';
import { createCombatSimulation } from './simulation.ts';
import { readCombatConfig } from './read.ts';

const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];

test('every directional Drive Strike is a costly four-strike flurry with one contact refund', () => {
  const config = createTouchOfDeathPreset();
  for (const move of config.moves.filter(move => move.drive && !move.dashAttack && move.command[0] === 'jab')) {
    expect(move.strikeFrames).toEqual([0, 6, 12, 18]);expect(move.staminaCost).toBe(30);expect(move.contactRefund).toBe(12);
    expect(move.groundedHitstunFrames).toBe(move.stringOnly ? 32 : 33);expect(move.blockstunFrames).toBeLessThan(move.recoveryFrames);
  }
  expect(readCombatConfig(config)).toEqual(config);
  for (const bad of [{ startupTracking: Math.PI + .01 }, { hitHeight: -1 }]) {
    const invalid = structuredClone(config);Object.assign(invalid.moves[0]!, bad);expect(() => readCombatConfig(invalid)).toThrow();
  }
});

test('Drive startup tracking is bounded and stops before the first active strike', () => {
  const config = createTouchOfDeathPreset(), sim = createCombatSimulation({ config, fighters: [fighters[0]!, { ...fighters[1]!, position: { x: 0, y: 0, z: 6 } }] });
  for (let i = 0; i < 16; i++) sim.step({ inputs: [{ fighterId: 'a', pressed: i === 0 ? ['jab'] : [], drive: true }], contacts: [] });
  const facing = sim.capture().fighters[0]!.facing;
  expect(Math.atan2(facing.z, facing.x)).toBeCloseTo(.72);
  for (let i = 0; i < 12; i++) sim.step({ poses: [{ fighterId: 'b', position: { x: -6, y: 0, z: 0 } }], contacts: [] });
  expect(sim.capture().fighters[0]!.facing).toEqual(facing);
});

test('upward attack capsule reaches airborne opponents without extending below the authored sphere', () => {
  const hit = (height: number, targetY: number) => {
    const config = createTouchOfDeathPreset(), move = config.moves.find(move => move.id === 'drive-heavy-away')!;
    move.hitHeight = height;move.startupTracking = 0;
    const sim = createCombatSimulation({ config, fighters: [fighters[0]!, { ...fighters[1]!, position: { x: move.reach, y: targetY, z: 0 } }] });
    let events = sim.step({ inputs: [{ fighterId: 'a', drive: true, pressed: ['heavy'], direction: { x: -1, y: 0, z: 0 } }] });
    for (let frame = 1; frame <= move.startupFrames; frame++) events = sim.step();
    return events;
  };
  expect(hit(0, 2.1)).toHaveLength(0);expect(hit(1.4, 2.1)[0]?.kind).toBe('hit');expect(hit(1.4, -2.1)).toHaveLength(0);
  expect(hit(1.4, 2.1)[0]?.contactPoint?.y).toBe(1.4);
});

test('feint can abandon the readable heavy windup, never its committed release or recovery', () => {
  const config = createTouchOfDeathPreset();
  for (const frame of [6, 22, 27, 29, 40]) {
    const sim = createCombatSimulation({ config, fighters });sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'] }], contacts: [] });
    while (sim.capture().frame < frame) sim.step({ contacts: [] });
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['feint'] }], contacts: [] });
    expect(sim.capture().fighters[0]!.moveId).toBe(frame <= 22 ? 'feint' : 'heavy');
  }
});

test('landing commitment delays attacks and locomotion but preserves immediate guard/parry and old saves', () => {
  const config = createTouchOfDeathPreset(), sim = createCombatSimulation({ config, fighters });
  sim.step({ inputs: [{ fighterId: 'a', airborne: true }] });
  sim.step({ inputs: [{ fighterId: 'a', airborne: false, guard: true, pressed: ['heavy'], locomotionCost: 14 }] });
  expect(sim.capture().fighters[0]!).toMatchObject({ landingFrames: 5, moveId: '', guarding: true, locomotionAllowed: false });
  const landed = sim.capture();sim.restore({ snapshot: landed });
  for (let i = 0; i < 4; i++) { sim.step({ inputs: [{ fighterId: 'a', airborne: false }] });expect(sim.capture().fighters[0]!.moveId).toBe(''); }
  sim.step({ inputs: [{ fighterId: 'a', airborne: false }] });expect(sim.capture().fighters[0]!.moveId).toBe('heavy');
  sim.restore({ snapshot: landed });
  const attack = sim.capture();attack.fighters[1]!.moveId = 'jab';attack.fighters[1]!.moveFrame = config.moves.find(move => move.id === 'jab')!.startupFrames;
  sim.restore({ snapshot: attack });expect(sim.step({ inputs: [{ fighterId: 'a', guard: true }] })[0]?.kind).toBe('parry');
  const old = sim.capture();for (const fighter of old.fighters) { Reflect.deleteProperty(fighter, 'landingFrames');Reflect.deleteProperty(fighter, 'wasAirborne'); }
  expect(() => sim.restore({ snapshot: old })).not.toThrow();
});
