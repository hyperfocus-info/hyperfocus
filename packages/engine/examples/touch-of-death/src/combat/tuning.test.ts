import { expect, test } from 'bun:test';
import { createCombatSimulation, readCombatConfig } from '@hyperfocus/engine/combat';
import { createTouchOfDeathPreset } from './preset.ts';
import { touchOfDeathInteractions, touchOfDeathMovement } from './physical.ts';

test('current tuning keeps integer timing, shorter launches and the requested physical changes', () => {
  const config = createTouchOfDeathPreset(), movement = touchOfDeathMovement(), grab = touchOfDeathInteractions();
  expect(readCombatConfig(config)).toEqual(config);
  expect(config).toMatchObject({ hitstopScale: .8, guardTurnSpeed: 60 });
  expect(movement.speed / 7.28).toBeCloseTo(.95);expect(movement.sprintSpeed! / 12.48).toBeCloseTo(.9);
  expect(movement.accelerationScale! / .8).toBeCloseTo(.95);expect(movement.dashSpeed / 15.96).toBeCloseTo(.9);
  expect((1 - movement.dashEndSpeedRatio!) / .4095).toBeCloseTo(1.05);
  expect(grab).toMatchObject({ grappleStartupFrames: 9, grappleRecoveryFrames: 19, grappleWhiffFrames: 20, grappleDamage: 6.5, grappleSpeed: 7.56, grappleVerticalSpeedScale: .9 });
  expect(config.moves.find(move => move.id === 'drive-jab')!.impulse / .3375).toBeCloseTo(.9);
  expect(config.moves.find(move => move.id === 'heavy-toward')!.impulse / 9).toBeCloseTo(.95);
  expect(config.moves.find(move => move.id === 'jab')).toMatchObject({ hitstunFrames: 23 });
  expect(config.moves.find(move => move.id === 'drive-heavy-toward')).toMatchObject({ startupFrames: 33, recoveryFrames: 52, hitRecoveryFrames: 18, steering: .04, startupTracking: .02 });
  expect(config.moves.find(move => move.id === 'dash-drive-heavy-toward')).toMatchObject({ startupFrames: 11, recoveryFrames: 52, hitRecoveryFrames: 18, steering: .04, startupTracking: .0125 });
});

test('guard and blockstun turn at one degree per fixed tick, including fresh guard and both seats', () => {
  for (const blocked of [false, true]) for (const seat of [0, 1]) {
    const config = createTouchOfDeathPreset();
    const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 5, y: 0, z: 0 } }] });
    const saved = sim.capture(), fighter = saved.fighters[seat]!;
    fighter.facing = { x: 1, y: 0, z: 0 };
    if (blocked) { fighter.stunKind = 'block';fighter.stunFrames = 80; }
    sim.restore({ snapshot: saved });
    for (let tick = 1; tick <= 60; tick++) {
      sim.step({ inputs: [{ fighterId: fighter.id, guard: !blocked }], poses: [{ fighterId: fighter.id, position: fighter.position, facing: { x: 0, y: 0, z: 1 } }] });
      const facing = sim.capture().fighters[seat]!.facing;
      expect(Math.atan2(facing.z, facing.x) * 180 / Math.PI).toBeCloseTo(tick, 7);
    }
    const checkpoint = sim.capture();sim.step();const after = sim.capture();
    sim.restore({ snapshot: checkpoint });sim.step();expect(sim.capture()).toEqual(after);
  }
  for (const value of [-1, NaN, Infinity]) expect(() => readCombatConfig({ ...createTouchOfDeathPreset(), guardTurnSpeed: value })).toThrow();
  expect(() => readCombatConfig({ ...createTouchOfDeathPreset(), hitstopScale: 1.1 })).toThrow();
});
