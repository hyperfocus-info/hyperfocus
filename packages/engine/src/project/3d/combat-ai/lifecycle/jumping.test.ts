import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { canJump, initialJumping, observeJumping, readJumping, recordJump } from './jumping.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'target', position: { x: 8, y: 5, z: 0 } }] }).capture();
  const options = { state, fighterId: 'ai', targetId: 'target', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 8, y: 5, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { config, options };
}

test('an airborne opponent does not create a new rooftop jump plan', () => {
  const { config, options } = fixture();let requests = 0;
  const ai = createCombatAi3D({ config, navigate: () => { requests++;return { direction: { x: 1, y: 0, z: 0 }, jump: true }; } });
  options.targetGrounded = false;
  expect(ai.step(options).jump).toBe(false);expect(requests).toBe(0);
  options.targetGrounded = true;
  expect(ai.step(options).jump).toBe(true);expect(requests).toBe(1);
});

test('failed jump landings back off, move normally, and reproduce after JSON restore', () => {
  const { config, options } = fixture();
  const ai = createCombatAi3D({ config, navigate: () => ({ direction: { x: 1, y: 0, z: 0 }, jump: true }) });
  expect(ai.step(options).jump).toBe(true);
  options.grounded = false;options.body.y = 2;
  for (let frame = 0; frame < 30; frame++) { options.state.frame++;expect(ai.step(options).jump).toBe(false); }
  options.grounded = true;options.body.y = 1;
  const landing = ai.step(options);expect(landing.jump).toBe(false);expect(landing.direction.x).toBeGreaterThan(0);
  const checkpoint = JSON.parse(JSON.stringify(ai.capture())), frame = options.state.frame;
  const sample = () => Array.from({ length: 90 }, () => { options.state.frame++;return ai.step(options); });
  const actions = sample();expect(actions.every(action => !action.jump)).toBe(true);
  ai.restore(checkpoint);options.state.frame = frame;expect(sample()).toEqual(actions);
});

test('blocked takeoff expires, while gained elevation and a new wall retain traversal options', () => {
  const memory = initialJumping(), body = { x: 0, y: 1, z: 0 };
  recordJump(memory, 0, body, 8, 100);
  observeJumping(memory, 24, true, body, 8, 100);
  expect(memory.failures).toBe(1);expect(memory.attempt).toBeUndefined();expect(canJump(memory, 80, body, false)).toBe(false);
  recordJump(memory, 150, body, 8, 100);observeJumping(memory, 151, false, { ...body, y: 2 }, 8, 100);
  expect(canJump(memory, 170, { ...body, y: 3 }, true)).toBe(true);
  expect(canJump(memory, 170, body, true)).toBe(false);
  observeJumping(memory, 190, true, { ...body, y: 3 }, 8, 100);
  expect(memory.failures).toBe(0);expect(canJump(memory, 214, body, false)).toBe(true);
  expect(readJumping(undefined)).toEqual(initialJumping());
  expect(() => readJumping({ ...memory, failures: 5 })).toThrow();
  expect(() => readJumping({ ...memory, attempt: { x: Infinity } })).toThrow();
});
