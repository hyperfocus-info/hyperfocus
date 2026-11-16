import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatAi3D } from '../combat-ai.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

function fixture(seed = 1) {
  const config = createTouchOfDeathPreset(), sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'player', position: { x: 4, y: 1, z: 0 } }] });
  const ai = createCombatAi3D({ config });
  const options = { seed, state: sim.capture(), fighterId: 'ai', targetId: 'player', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 4, y: 1, z: 0, velocityX: 6, velocityY: 0, velocityZ: 0 } };
  return { ai, options };
}

test('high AI pursues observable backpedaling with ordinary sprint and paid dash requests', () => {
  const { ai, options } = fixture();
  const actions = Array.from({ length: 80 }, () => ai.step(options));
  expect(actions.some(action => action.sprint)).toBe(true);expect(actions.some(action => action.dash)).toBe(true);
  expect(actions.every(action => action.direction.x > 0 && !action.input.dashing)).toBe(true);
  options.state.fighters[0]!.stamina = 10;expect(ai.step(options).dash).toBe(false);
});

test('seeded tactical variety is repeatable and checkpoints preserve reaction queues and failed-choice memory', () => {
  const traces = new Set<string>();
  for (const seed of [1, 2, 4, 5]) {
    const { ai, options } = fixture(seed);options.targetBody.velocityX = 0;options.difficulty = 8;
    for (let i = 0; i < 5; i++) ai.step(options);
    const saved = JSON.parse(JSON.stringify(ai.capture()));
    const run = () => Array.from({ length: 90 }, () => ai.step(options));
    const actions = run();ai.restore(saved);expect(run()).toEqual(actions);traces.add(JSON.stringify(actions));
    expect(ai.capture().queue.length).toBe(3);
  }
  expect(traces.size).toBeGreaterThan(1);
});

test('two observed misses suppress repeating the same commitment and choose another legal pressure tool', () => {
  const { ai, options } = fixture();options.targetBody.x = 1.5;options.targetBody.velocityX = 0;
  const actor = options.state.fighters[0]!;
  for (let serial = 1; serial <= 2; serial++) {
    actor.attackSerial = serial;actor.moveId = 'jab';actor.moveFrame = 20;actor.hitTargets = [];ai.step(options);
    actor.moveId = '';ai.step(options);
  }
  expect(ai.capture().tactics.failures).toBe(2);
  const action = ai.step(options);
  expect(action.input.pressed?.length || action.direction.x).toBeTruthy();
  expect(action.input.pressed?.[0] !== 'jab' || action.input.drive || action.input.direction?.x).toBeTruthy();
});

test('actual level-nine gameplay catches a continuously backpedaling player instead of matching distance indefinitely', async () => {
  const { game, runtime } = await combatMotionFixture({ match: true });
  const saved = game.snapshot();Object.assign(saved.combat!.match!, { phase: 'fighting', ticks: 0, held: [] });game.restore(saved);
  runtime.physics.setPosition('a', 0, 1, 0);runtime.physics.setPosition('b', 5, 1, 0);
  let attacked = false;
  for (let frame = 0; frame < 240; frame++) {
    game.step(['move-left']);
    attacked ||= !!game.snapshot().combat!.state.fighters[1]!.moveId;
  }
  expect(attacked).toBe(true);expect(game.snapshot().combat!.state.fighters[0]!.health).toBeLessThan(100);
});


test('negative-zero pursuit directions survive JSON checkpoints with byte-identical actions', () => {
  const { ai, options } = fixture(5);options.difficulty = 8;options.targetBody.z = -0;
  for (let i = 0; i < 10; i++) ai.step(options);
  const before = ai.capture();ai.restore(JSON.parse(JSON.stringify(before)));expect(ai.capture()).toEqual(before);
  for (const action of ai.capture().queue) for (const vector of [action.direction, action.input.direction]) if (vector) for (const component of Object.values(vector)) expect(Object.is(component, -0)).toBe(false);
});

test('tactical choice cadence and saved memory stay bounded during a long blocked approach', () => {
  const { ai, options } = fixture(5);options.difficulty = 1;
  let changes = 0, previous = -1;
  for (let tick = 0; tick < 2000; tick++) {
    ai.step(options);const memory = ai.capture();
    if (memory.tactics.random !== previous) { changes++;previous = memory.tactics.random; }
    expect(memory.queue.length).toBeLessThanOrEqual(24);
  }
  expect(changes).toBeLessThanOrEqual(45);
  const { learning, ...tactical } = ai.capture();
  expect(new TextEncoder().encode(JSON.stringify(tactical)).byteLength).toBeLessThan(12000);
  expect(learning!.traces.length).toBeLessThanOrEqual(64);expect(learning!.actions.length).toBeLessThanOrEqual(64);
  expect(ai.capture().tactics.stalled).toBeLessThanOrEqual(600);
});

test('mirrored close openings choose different viable pressure roles instead of an identical attack cycle', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(['match:theater']);game.step([]);game.step(['match:start']);for (let i = 0; i < 180; i++) game.step([]);
  const serials = [0, 0], attacks: string[][] = [[], []];
  for (let frame = 0; frame < 360; frame++) {
    game.step([]);
    game.snapshot().combat!.state.fighters.forEach((fighter, i) => { if (fighter.attackSerial !== serials[i]) { attacks[i]!.push(fighter.moveId);serials[i] = fighter.attackSerial; } });
  }
  expect(attacks[0]!.length).toBeGreaterThan(0);expect(attacks[1]!.length).toBeGreaterThan(0);expect(attacks[0]).not.toEqual(attacks[1]);
  const checkpoint = game.checkpoint();for (let i = 0; i < 60; i++) game.step([]);const expected = game.snapshot();checkpoint.restore();for (let i = 0; i < 60; i++) game.step([]);expect(game.snapshot()).toEqual(expected);
});
