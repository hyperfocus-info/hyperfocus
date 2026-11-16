import { expect, test } from 'bun:test';
import { createCombatAi3D, type CombatAiAction3D } from '../combat-ai.ts';
import { createCombatAiOutcomes } from './outcomes.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'human', position: { x: 2, y: 1, z: 0 } }] });
  const body = { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 };
  return { config, options: { state: simulation.capture(), fighterId: 'ai', targetId: 'human', difficulty: 1, grounded: true, targetGrounded: true, body, targetBody: { ...body, x: 2 } } };
}

test('Theater compresses unchanged requests independently for both seats and keeps each heartbeat', () => {
  const logger = createCombatAiOutcomes(), { options } = fixture();
  for (let frame = 0; frame < 60; frame++) {
    options.state.frame = frame;
    for (const [fighter, target] of [['ai', 'human'], ['human', 'ai']] as const) {
      logger.choice({ state: options.state, level: 9, fighter, target,
        action: { input: { fighterId: fighter, pressed: [] }, direction: { x: 0, y: 0, z: 0 }, jump: false, dash: false, sprint: false } });
    }
  }
  const report = logger.report();
  expect(report.observedTicks).toBe(120);
  expect(report.choices.map(choice => [choice.fighter, choice.frame])).toEqual([
    ['ai', 0], ['human', 0], ['ai', 29], ['human', 29], ['ai', 59], ['human', 59],
  ]);
  expect(report.droppedChoices).toBe(0);
});

test('compression preserves every input field, exact directions and mutations of reused requests', () => {
  const { options } = fixture();
  const base: CombatAiAction3D = { input: { fighterId: 'ai', pressed: [] }, direction: { x: 0, y: 0, z: 0 }, jump: false, dash: false, sprint: false };
  const inputs: Partial<CombatAiAction3D['input']>[] = [
    { pressed: ['jab'] }, { held: ['heavy'] }, { guard: true }, { guardFresh: true }, { tech: true },
    { dashing: true }, { dashStart: true }, { drive: true }, { airborne: true }, { idle: true },
    { locomotionCost: .01 }, { direction: { x: 0, y: 0, z: .0000001 } }, { influenceDirection: { x: 0, y: .1, z: 0 } },
  ];
  const variants = [...inputs.map(input => ({ ...base, input: { ...base.input, ...input } })),
    { ...base, jump: true }, { ...base, dash: true }, { ...base, sprint: true }, { ...base, direction: { x: .0000001, y: 0, z: 0 } }];
  for (const variant of variants) {
    const logger = createCombatAiOutcomes();
    const observe = (action: CombatAiAction3D) => logger.choice({ state: options.state, level: 9, fighter: 'ai', target: 'human', action });
    observe(base);observe(variant);observe(structuredClone(variant));
    expect(logger.report().choices.map(choice => choice.action)).toEqual([base, variant]);
  }
  const logger = createCombatAiOutcomes(), action = structuredClone(base);
  logger.choice({ state: options.state, level: 9, fighter: 'ai', target: 'human', action });
  action.input.pressed!.push('jab');action.direction.x = .125;
  logger.choice({ state: options.state, level: 9, fighter: 'ai', target: 'human', action });
  expect(logger.report().choices.map(choice => choice.action.input.pressed)).toEqual([[], ['jab']]);
});

test('every AI level logs delivered requests without changing replay memory or decisions', () => {
  const { config, options } = fixture();
  for (let level = 1; level <= 9; level++) {
    const ai = createCombatAi3D({ config });options.difficulty = level;
    for (let i = 0; i < 30; i++) ai.step(options);
    const checkpoint = ai.capture(), expected = ai.step(options);
    const report = ai.outcomes.report();expect(report.choices[0]?.level).toBe(level);
    expect(report.observedTicks).toBe(31);
    ai.restore(checkpoint);expect(ai.outcomes.report().choices).toEqual([]);
    expect(ai.step(options)).toEqual(expected);
    expect(Object.keys(ai.capture())).not.toContain('outcomes');
  }
});

test('reports bound storage, detach reads and label event roles without invented success rates', () => {
  const logger = createCombatAiOutcomes(), { options } = fixture();
  for (let frame = 0; frame < 400; frame++) {
    options.state.frame = frame;
    logger.choice({ state: options.state, level: 9, fighter: 'ai', target: 'human', action: { input: { fighterId: 'ai', pressed: [frame % 2 ? 'jab' : 'heavy'] }, direction: { x: 1, y: 0, z: 0 }, jump: false, dash: false, sprint: false } });
    logger.resolve({ level: 9, fighter: 'ai', events: [{ id: String(frame), frame, attackerId: 'human', targetId: 'ai', moveId: 'jab', kind: 'parry', damage: 0, impulse: { x: 0, y: 0, z: 0 } }] });
  }
  const report = logger.report();expect(report.choices.length).toBe(256);expect(report.outcomes.length).toBe(256);
  expect(report.droppedChoices).toBe(144);expect(report.droppedOutcomes).toBe(144);
  expect(report.counts['AI9:defender:parry']).toBe(400);
  report.choices.length = 0;expect(logger.report().choices.length).toBe(256);
  logger.clear();expect(logger.report().observedTicks).toBe(0);
});

test('ordinary AI round resets preserve summaries and restored play stays distinct', () => {
  const { config, options } = fixture(), ai = createCombatAi3D({ config });
  for (let round = 0; round < 3; round++) {
    for (let tick = 0; tick < 40; tick++) ai.step(options);
    ai.reset();
  }
  expect(ai.outcomes.report().segments.map(row => row.observedTicks)).toEqual([40, 40, 40]);
  expect(ai.outcomes.report().segments.every(row => row.source === 'live')).toBe(true);
  const saved = ai.capture();ai.restore(saved);ai.step(options);ai.reset();
  expect(ai.outcomes.report().segments.at(-1)?.source).toBe('restored');
  expect(ai.outcomes.report().source).toBe('restored');
  ai.outcomes.resumeLive();ai.step(options);expect(ai.outcomes.report().source).toBe('live');
  for (let i = 0; i < 20; i++) { ai.step(options);ai.reset(); }
  expect(ai.outcomes.report().segments.length).toBe(12);expect(ai.outcomes.report().droppedSegments).toBeGreaterThan(0);
});

test('real match round recovery retains earlier AI observations through the result', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(['match:start']);
  for (let tick = 0; tick < 9000 && game.snapshot().combat?.match?.phase !== 'match-result'; tick++) { game.step();game.drainAudio(); }
  expect(game.snapshot().combat?.match?.phase).toBe('match-result');
  const report = game.aiReport()!;
  expect(report.segments.length).toBeGreaterThanOrEqual(2);
  expect(report.segments.every(row => row.source === 'live')).toBe(true);
  expect(report.segments.some(row => Object.keys(row.counts).length > 0)).toBe(true);
  game.step(['match:replay']);
  expect(game.aiReport()!.segments.length).toBeGreaterThan(report.segments.length);
});

test('match feedback records actual seat types and preserves completed segment opponent context', async () => {
  const { game } = await combatMotionFixture({ match: true });
  game.step(['match:start']);for (let i = 0; i < 700 && !game.snapshot().combat?.ai?.personality; i++) game.step([]);
  const local = game.aiReport()!;
  expect(local.context?.mode).toBe('human-vs-ai');
  expect(local.context?.fighters.map(fighter => fighter.type)).toEqual(['human', 'ai']);
  expect(local.context?.fighters[1]?.traits?.grappler).toBeGreaterThanOrEqual(.3);
  game.step(['match:quit']);game.step([]);game.step(['match:theater']);game.step([]);game.step(['match:start']);
  for (let i = 0; i < 700 && !game.snapshot().combat?.playerAi?.personality; i++) game.step([]);
  const theater = game.aiReport()!;
  expect(theater.context?.mode).toBe('theater');
  expect(theater.context?.fighters.map(fighter => fighter.type)).toEqual(['ai', 'ai']);
  expect(theater.segments.some(segment => segment.context?.mode === 'human-vs-ai')).toBe(true);
});
