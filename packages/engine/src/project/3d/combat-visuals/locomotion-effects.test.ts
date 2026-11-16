import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatLocomotionEffects3D } from './locomotion-effects.ts';

test('jump and landing dust fire once per transition, with stable world anchors', () => {
  const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const fx = createCombatLocomotionEffects3D(), grounded = new Set(['a']), velocity = { x: 0, y: 0, z: 0 }, velocities = new Map([['a', velocity]]);
  const tick = () => { state.frame++; fx.step({ state, grounded, velocities }); };
  tick();grounded.clear();velocity.y = 12;tick();
  expect(fx.events.map(event => event.kind)).toEqual(['jump']);
  const anchor = structuredClone(fx.events[0]!.point);
  state.fighters[0]!.position.y = 5;tick();fx.step({ state, grounded, velocities });
  expect(fx.events).toHaveLength(1);expect(fx.events[0]!.point).toEqual(anchor);
  velocity.y = -20;tick();grounded.add('a');velocity.y = 0;state.fighters[0]!.position.y = 1;tick();tick();
  expect(fx.events.map(event => event.kind)).toEqual(['jump', 'land']);
  expect(fx.events[1]!.strength).toBeGreaterThan(1);
  fx.reset();expect(fx.events).toHaveLength(0);tick();expect(fx.events).toHaveLength(0);
});

test('sprinting emits more footsteps than running and cosmetic history remains bounded', () => {
  const count = (speed: number) => {
    const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
    const fx = createCombatLocomotionEffects3D();const seen = new Set<number>();
    for (let frame = 0; frame < 120; frame++) {
      state.frame = frame;fx.step({ state, grounded: new Set(['a']), velocities: new Map([['a', { x: speed, y: 0, z: 0 }]]) });
      for (const event of fx.events) seen.add(event.frame);
      expect(fx.events.length).toBeLessThanOrEqual(12);
    }
    return seen.size;
  };
  expect(count(12)).toBeGreaterThan(count(5));expect(count(0)).toBe(0);
});

test('rewinding locomotion presentation retains anchors and reproduces landing cues', () => {
  const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const fx = createCombatLocomotionEffects3D();
  const step = (frame: number, grounded: boolean, speedY: number) => {
    state.frame = frame;
    fx.step({ state, grounded: new Set(grounded ? ['a'] : []), velocities: new Map([['a', { x: 0, y: speedY, z: 0 }]]) });
  };
  step(1, true, 0);step(2, false, 12);step(3, false, -8);
  const saved = fx.capture();
  step(4, true, 0);step(5, true, 0);
  const landed = fx.capture();
  expect(fx.events.map(event => event.kind)).toEqual(['jump', 'land']);
  fx.reset();fx.restore(saved);
  step(4, true, 0);step(5, true, 0);
  expect(fx.capture()).toEqual(landed);
  expect(saved.events.map(event => event.kind)).toEqual(['jump']);
  fx.restore(saved);step(3, false, -8);
  expect(fx.capture()).toEqual(saved);
});
