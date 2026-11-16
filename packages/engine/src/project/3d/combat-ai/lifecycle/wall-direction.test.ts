import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { hypot, sqrt } from '../../../../math/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const simulation = createCombatSimulation({ config, fighters: [
    { id: 'ai', position: { x: 0, y: 1, z: 0 } },
    { id: 'target', position: { x: 8, y: 1, z: 0 } },
  ] });
  const options = { state: simulation.capture(), fighterId: 'ai', targetId: 'target', difficulty: 9,
    grounded: false, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 },
    targetBody: { x: 8, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 },
    wall: { normal: { x: -.8, y: .24, z: sqrt(.3024) }, jumpCost: 14, runCost: .6 } };
  return { ai: createCombatAi3D({ config }), simulation, options };
}

test('sloped wall-run stick remains bounded through the Theater influence input', () => {
  const { ai, simulation, options } = fixture();
  const action = ai.step(options);
  expect(action.jump).toBe(false);
  expect(action.direction.x).toBeGreaterThan(.8);
  expect(action.direction.z).toBeGreaterThan(.4);
  expect(() => simulation.step({ inputs: [{ ...action.input, influenceDirection: action.direction }] })).not.toThrow();
  expect(hypot(action.direction.x, action.direction.y, action.direction.z)).toBeLessThanOrEqual(1.00000001);
  expect(() => simulation.restore({ snapshot: simulation.capture() })).not.toThrow();
});

test('wall-run directions stay bounded across accepted wall slopes and delayed JSON replay', () => {
  for (const y of [-.249, -.24, 0, .24, .249]) for (const x of [-.85, -.8, -.6, -.3, 0, .3]) {
    const { ai, options } = fixture();
    options.difficulty = 8;
    options.wall.normal = { x, y, z: sqrt(1 - x * x - y * y) };
    for (let frame = 0; frame < 3; frame++) ai.step(options);
    const checkpoint = JSON.parse(JSON.stringify(ai.capture()));
    const actions = Array.from({ length: 8 }, () => ai.step(options));
    expect(actions.every(action => hypot(action.direction.x, action.direction.y, action.direction.z) <= 1.00000001)).toBe(true);
    ai.restore(checkpoint);
    expect(Array.from({ length: 8 }, () => ai.step(options))).toEqual(actions);
  }
});

test('invalid external influence input is still rejected', () => {
  const { simulation } = fixture();
  expect(() => simulation.step({ inputs: [{ fighterId: 'ai', influenceDirection: { x: 1.01, y: 0, z: 0 } }] }))
    .toThrow('Influence direction must be bounded');
});
