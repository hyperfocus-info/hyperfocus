import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import { createCombatSimulation } from '../simulation.ts';
import { combatMoveDuration } from '../combo/timing.ts';
import { readCombatConfig } from '../read.ts';

const config = createTouchOfDeathPreset();
const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
const make = () => createCombatSimulation({ config, fighters });

test('body hits against active armor shorten attacker recovery without disabling armor protection', () => {
  const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', pressed: ['heavy'], direction: { x: 1, y: 0, z: 0 } }] });
  let armored = false;
  while (sim.inspect().fighters[0]!.moveFrame < 17) {
    for (const event of sim.step()) if (event.attackerId === 'a') {
      expect(event).toMatchObject({ kind: 'hit', armored: true, damage: 8, hitstunFrames: 0, impulse: { x: 0, y: 0, z: 0 } });armored = true;
    }
  }
  expect(armored).toBe(true);const state = sim.capture();
  expect(state.fighters[0]!.hitConfirmed).toBe(true);
  expect(state.fighters[1]!).toMatchObject({ moveId: 'heavy-away', stunFrames: 0 });
  expect(combatMoveDuration(config.moves.find(move => move.id === 'jab')!, state.fighters[0]!)).toBe(25);
  const checkpoint = JSON.parse(JSON.stringify(state));
  const options = { inputs: [{ fighterId: 'a', pressed: ['jab'] }] };
  const events = sim.step(options), result = sim.capture();
  expect(result.fighters[0]!.moveId).toBe('jab-link');
  sim.restore({ snapshot: checkpoint });expect(sim.step(options)).toEqual(events);expect(sim.capture()).toEqual(result);
});

test('a real charged escape hit opens a fast continuation and retains once-per-round limits', () => {
  const sim = make(), escape = config.moves.find(move => move.armoredEscape)!;
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }] });
  let hits = 0;
  while (sim.inspect().fighters[0]!.moveFrame < 20) hits += sim.step().filter(event => event.attackerId === 'a' && event.kind === 'hit').length;
  expect(hits).toBe(1);expect(sim.inspect().fighters[0]!).toMatchObject({ hitConfirmed: true, escapeCharges: 0 });
  expect(escape).toMatchObject({ hitRecoveryFrames: 8, recoveryFrames: 67 });
  expect(escape.cancels.every(cancel => cancel.hitOnly && cancel.fromFrame === 20 && cancel.toFrame === 27)).toBe(true);
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
  expect(sim.inspect().fighters[0]!.moveId).toBe('jab-link');
  for (let tick = 0; tick < 5; tick++) sim.step();
  expect(sim.inspect().fighters[1]!.health).toBe(78);
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }] });
  expect(sim.inspect().fighters[0]!).toMatchObject({ moveId: 'jab-link', escapeCharges: 0 });
});

test('missed or blocked escapes expose all authored recovery and offer no hit-only links', () => {
  for (const blocked of [false, true]) {
    const sim = make();sim.step({ inputs: [{ fighterId: 'a', pressed: ['escape'] }, ...(blocked ? [{ fighterId: 'b', guard: true }] : [])], ...(blocked ? {} : { contacts: [] }) });
    for (let tick = 1; tick < 86; tick++) {
      sim.step({ inputs: [{ fighterId: 'a', ...(tick === 20 ? { pressed: ['jab'] } : {}) }, ...(blocked ? [{ fighterId: 'b', guard: true }] : [])], ...(blocked ? {} : { contacts: [] }) });
      expect(sim.inspect().fighters[0]!).toMatchObject({ hitConfirmed: false, attackSerial: 1, moveId: 'escape' });
    }
  }
});

test('flurry damage and resource tuning preserves ordinary jabs, defense steering and edited final values', () => {
  for (const id of ['drive-jab', 'drive-jab-toward', 'drive-jab-away', 'flurry']) expect(config.moves.find(move => move.id === id)).toMatchObject({ damage: 4, staminaCost: 30, contactRefund: 12 });
  for (const id of ['drive-jab-link', 'drive-jab-toward-link', 'drive-jab-away-link']) expect(config.moves.find(move => move.id === id)).toMatchObject({ damage: 4.8, staminaCost: 30, contactRefund: 12 });
  for (const [id, damage] of [['dash-drive-jab-neutral', 4.8], ['dash-drive-jab-toward', 11.2], ['dash-drive-jab-away', 9.6]] as const) expect(config.moves.find(move => move.id === id)).toMatchObject({ damage, staminaCost: 20, contactRefund: 12 });
  expect(config.moves.find(move => move.id === 'jab')).toMatchObject({ damage: 8, staminaCost: 9, contactRefund: 6 });
  expect(config.moves.find(move => move.id === 'jab-link')).toMatchObject({ damage: 10, staminaCost: 9, contactRefund: 6 });
  expect(config.techLockoutFrames).toBe(12);expect(config.directionalInfluence).toBe(.495);
  expect(config.moves.find(move => move.id === 'drive-heavy-toward')).toMatchObject({ activeMovementSpeed: 12.6, chargeSpeedScale: .68 });
  expect(config.moves.find(move => move.id === 'dash-drive-heavy-toward')).toMatchObject({ activeMovementSpeed: 10.8, chargeSpeedScale: .68 });
  expect(readCombatConfig(config)).toEqual(config);
});
