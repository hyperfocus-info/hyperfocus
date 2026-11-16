import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../../combat/config.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createRigidWorld3D } from '../../../../physics/rigid-3d.ts';
import { createCombatHazards } from './session.ts';
import { readCombatEnvironment } from '../config.ts';

function fixture() {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  for (const id of ['a', 'b']) world.addBody({ id, type: 'dynamic', shape: { kind: 'sphere', radius: .5 }, y: .5 });
  const state = createCombatSimulation({ config: createCombatPreset(), fighters: ['a', 'b'].map(id => ({ id, position: { x: 0, y: .5, z: 0 } })) }).capture();
  let removed = false;
  const hazards = createCombatHazards({ world, removed: () => removed, hazards: [{ entityId: 'fire', activationSurfaceId: 'pipe', kind: 'fire', damage: 2, intervalFrames: 30 }, { entityId: 'water', kind: 'flood', groundSpeedScale: .65 }],
    entities: ['fire', 'water'].map(id => ({ id, meshId: 'mesh', materialId: 'material', position: [0, .2, 0], scale: [2, .2, 2], rotationY: 0 })) });
  return { state, hazards, enable: () => { removed = true; }, grounded: new Set(['a', 'b']) };
}

test('fire needs its causal surface, damages both seats equally without stun or knockback, flood is grounded only', () => {
  const { state, hazards, enable, grounded } = fixture();
  expect(hazards.step(state, grounded)).toEqual([]);expect(hazards.groundSpeedScales.get('a')).toBe(.65);
  enable();state.frame++;const before = structuredClone(state), events = hazards.step(state, grounded);
  expect(events).toHaveLength(2);expect(state.fighters.map(fighter => fighter.health)).toEqual([98, 98]);
  state.fighters.forEach((fighter, index) => expect({ ...fighter, health: 100 }).toEqual(before.fighters[index]!));
  expect(events[0]).toMatchObject({ defenseReason: 'fire-exposure', environmentId: 'fire', impulse: { x: 0, y: 0, z: 0 } });
  state.frame++;grounded.clear();hazards.step(state, grounded);expect(hazards.groundSpeedScales.size).toBe(0);
});

test('same-frame and exit/reenter calls cannot multiply fire ticks; protection and leaving stop damage', () => {
  const { state, hazards, enable, grounded } = fixture();enable();hazards.step(state, grounded);
  expect(hazards.step(state, grounded)).toEqual([]);
  for (let frame = 1; frame < 30; frame++) { state.frame = frame;state.fighters[0]!.position.x = frame % 2 ? 10 : 0;expect(hazards.step(state, grounded)).toEqual([]); }
  state.frame = 30;state.fighters[0]!.position.x = 0;state.fighters[1]!.protectionFrames = 2;
  expect(hazards.step(state, grounded).map(event => event.targetId)).toEqual(['a']);
  expect(state.fighters.map(fighter => fighter.health)).toEqual([96, 98]);
  state.frame = 60;for (const fighter of state.fighters) fighter.position.x = 10;
  expect(hazards.step(state, grounded)).toEqual([]);
  expect(hazards.capture().contacts.every(contact => !contact.active)).toBe(true);
});

test('portable hazard cadence and trace restore exactly, invalid snapshots/configuration are rejected', () => {
  const { state, hazards, enable, grounded } = fixture();enable();hazards.step(state, grounded);
  const saved = JSON.parse(JSON.stringify(hazards.capture())), before = structuredClone(state);
  state.frame = 30;const events = hazards.step(state, grounded), after = hazards.capture();
  hazards.restore(hazards.validate(saved));before.frame = 30;
  expect(hazards.step(before, grounded)).toEqual(events);expect(hazards.capture()).toEqual(after);expect(before).toEqual(state);
  expect(() => hazards.validate({ ...saved, contacts: [...saved.contacts, saved.contacts[0]] })).toThrow();
  expect(() => readCombatEnvironment({ surfaces: [], hazards: [{ entityId: 'fire', kind: 'fire', damage: 2, intervalFrames: 0 }] })).toThrow();
  expect(readCombatEnvironment({ surfaces: [], hazards: [{ entityId: 'water', kind: 'flood', groundSpeedScale: .65 }] })!.hazards).toHaveLength(1);
});
