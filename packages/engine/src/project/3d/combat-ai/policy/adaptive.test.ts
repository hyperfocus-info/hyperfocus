import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { initialPersonality, personalityWeights } from '../personality/index.ts';
import { tacticalCandidates } from './candidates.ts';
import { candidateProbabilities, chooseTactic, initialPolicy } from './selection.ts';
import { applyCombatAiPolicy, createCombatAiPolicy } from './trained.ts';
import { contactFrame } from './prediction.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'target', position: { x: 1.6, y: 1, z: 0 } }] }).capture();
  const personality = initialPersonality({ seed: 1, fighterId: 'ai' });
  const observation = { state, fighterId: 'ai', targetId: 'target', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 1.6, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  const options: Parameters<typeof tacticalCandidates>[0] = { config, self: state.fighters[0]!, target: state.fighters[1]!, personality,
    preferences: personalityWeights(personality), difficulty: 9, distance: 1.6, fullDistance: 1.6, above: 0, grounded: true, targetGrounded: true,
    speed: 0, retreating: false, quiet: 0, stalled: 0, held: false, failedMove: '', failures: 0, adaptive: true,
    eligible: move => !move.weaponAttack && !move.dashAttack, physical: move => move, reaches: () => true, contactFrames: move => move.startupFrames };
  return { config, options, observation };
}

test('adaptive pools exclude animation locks, unaffordable and unavailable airborne/landing actions', () => {
  const { options } = fixture();
  options.self.stamina = 0;
  expect(tacticalCandidates(options).every(c => !c.moveId || (options.config.moves.find(m => m.id === c.moveId)!.staminaCost ?? 0) === 0)).toBe(true);
  options.self.stamina = options.config.maxStamina!;options.grounded = false;
  expect(tacticalCandidates(options).every(c => !c.moveId || options.config.moves.find(m => m.id === c.moveId)!.airborne !== false)).toBe(true);
  options.self.landingFrames = 4;
  expect(tacticalCandidates(options)).toEqual([{ id: 'recover', score: 0 }]);
  options.self.landingFrames = 0;options.self.stunFrames = 4;
  expect(tacticalCandidates(options)).toEqual([{ id: 'recover', score: 0 }]);
  options.self.stunFrames = 0;options.self.moveId = 'jab';options.self.moveFrame = 2;
  expect(tacticalCandidates(options)).toEqual([{ id: 'recover', score: 0 }]);
});

test('only predicted contact before recovery ends earns punish value; protection removes imminent attacks', () => {
  const { options } = fixture();
  const enemy = options.config.moves.find(move => move.id === 'heavy')!;
  options.enemy = enemy;options.target.moveFrame = enemy.startupFrames + enemy.activeFrames;
  const action = () => tacticalCandidates(options).find(c => c.id === 'attack:jab')!;
  options.contactFrames = () => enemy.recoveryFrames - 1;const timed = action().score;
  options.contactFrames = () => enemy.recoveryFrames;
  expect(action().score).toBeLessThan(timed - 4);
  options.contactFrames = () => 2;options.target.protectionFrames = 4;
  expect(tacticalCandidates(options).every(c => !c.moveId)).toBe(true);
});

test('AI scores actual confirmed-hit recovery as shorter than the same move whiffing', () => {
  const { config, options } = fixture(), heavy = config.moves.find(move => move.id === 'heavy')!;
  const score = (hit: boolean) => {
    const sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: -1.6, y: 1, z: 0 } }, { id: 'target', position: { x: 0, y: 1, z: 0 } }, { id: 'victim', position: { x: 1, y: 1, z: 0 } }] });
    sim.step({ inputs: [{ fighterId: 'target', pressed: ['heavy'] }], ...(hit ? {} : { contacts: [] }) });
    for (let frame = 1; frame < heavy.startupFrames + heavy.activeFrames; frame++) sim.step(hit ? {} : { contacts: [] });
    const state = sim.capture();options.self = state.fighters.find(fighter => fighter.id === 'ai')!;options.target = state.fighters.find(fighter => fighter.id === 'target')!;
    expect(options.target.hitConfirmed).toBe(hit);expect(options.self.stunFrames).toBe(0);
    options.enemy = heavy;options.contactFrames = () => 15;
    return tacticalCandidates(options).find(candidate => candidate.id === 'attack:jab')!.score;
  };
  expect(score(false)).toBeGreaterThan(score(true) + 8);
});

test('certain lethal recovery punish outranks personality, host offsets and retained movement', () => {
  const { options } = fixture();
  options.target.escapeCharges = 0;options.target.health = 1;
  options.enemy = { ...options.config.moves.find(m => m.id === 'heavy')!, cancels: [] };
  options.target.moveFrame = options.enemy.startupFrames + options.enemy.activeFrames;
  options.preferences.reckless = .3;options.preferences.defensive = 1.7;
  const candidates = tacticalCandidates(options);
  const priority = candidates.filter(c => c.priority);
  expect(priority.length).toBeGreaterThan(0);
  applyCombatAiPolicy(candidates, createCombatAiPolicy({ id: 'adversarial', scores: Object.fromEntries(candidates.map(c => [c.id, c.priority ? -2 : 2])) }));
  for (const level of [1, 5, 9]) {
    const probabilities = candidateProbabilities(candidates, level);
    expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(probabilities.every((p, i) => candidates[i]!.priority || p === 0)).toBe(true);
    const memory = initialPolicy();Object.assign(memory, { choice: 'approach', until: 100, serial: 0 });
    expect(chooseTactic(memory, candidates, level, 1, 0, 17)!.priority).toBe(true);
  }
  options.target.escapeCharges = 1;
  expect(tacticalCandidates(options).some(c => c.priority)).toBe(false);
  options.target.escapeCharges = 0;options.enemy.cancels = [{ moveId: 'evade', fromFrame: options.target.moveFrame, toFrame: options.target.moveFrame + 12 }];
  expect(tacticalCandidates(options).some(c => c.priority)).toBe(false);
});

test('a predicted delayed attack never claims contact after the remaining punish window', () => {
  const { config, observation } = fixture();
  const move = config.moves.find(m => m.id === 'jab')!;
  expect(contactFrame(move, observation, { x: 1, y: 0, z: 0 }, config.hurtRadius, move.startupFrames + 1, 3)).toBe(Infinity);
  observation.targetBody.velocityX = 50;
  expect(contactFrame(move, observation, { x: 1, y: 0, z: 0 }, config.hurtRadius)).toBe(Infinity);
});

test('adaptive reach forecasts include the move’s authored startup hop', () => {
  const { config, observation } = fixture();
  const move = { ...config.moves.find(m => m.id === 'jab')!, startupFrames: 12, activeFrames: 1,
    startupHopSpeed: 30, startupSpeed: 0, activeSpeed: 0 };
  const toward = { x: 1, y: 0, z: 0 };
  expect(Number.isFinite(contactFrame(move, observation, toward, config.hurtRadius))).toBe(true);
  expect(contactFrame(move, observation, toward, config.hurtRadius, Infinity, 0, true)).toBe(Infinity);
  observation.targetBody.y = 6.8;
  expect(contactFrame(move, observation, toward, config.hurtRadius)).toBe(Infinity);
  expect(Number.isFinite(contactFrame(move, observation, toward, config.hurtRadius, Infinity, 0, true))).toBe(true);
});

test('zero stamina budget means unlimited resources, while an expiring followup cannot survive delivery', () => {
  const { options } = fixture();
  options.config.maxStamina = 0;options.self.stamina = 0;
  expect(tacticalCandidates(options).some(c => !!c.moveId && (options.config.moves.find(m => m.id === c.moveId)!.staminaCost ?? 0) > 0)).toBe(true);
  options.difficulty = 8;options.self.followupFrames = 3;
  expect(tacticalCandidates(options).some(c => c.moveId && options.config.moves.find(m => m.id === c.moveId)!.parryFollowup)).toBe(false);
});

test('actual dash draws use rank scores and bounded offsets; learning can overturn the first rank', () => {
  const { config, observation } = fixture();
  observation.targetBody.x = observation.state.fighters[1]!.position.x = 2;
  const ai = createCombatAi3D({ config, tuning: { mode: 'adaptive' } });
  ai.step({ ...observation, dashing: true });
  const trace = ai.learning()!.traces.find(t => t.chosen.startsWith('dash:'))!;
  expect(trace).toBeDefined();
  expect(trace.candidates.every(c => c.score <= 4.4 && c.score > -12)).toBe(true);
  expect(trace.candidates.reduce((sum, c) => sum + (c.probability ?? 0), 0)).toBeCloseTo(1);
  const model = ai.learning()!, top = trace.candidates[0]!, alternate = trace.candidates[1]!;
  model.actions = [{ context: trace.context, action: top.id, samples: 16, reward: -16 }, { context: trace.context, action: alternate.id, samples: 16, reward: 16 }];
  const learned = createCombatAi3D({ config, tuning: { mode: 'adaptive' }, learning: model });
  learned.step({ ...observation, dashing: true });
  const changed = learned.learning()!.traces.at(-1)!;
  expect(changed.candidates.find(c => c.id === alternate.id)!.probability!).toBeGreaterThan(changed.candidates.find(c => c.id === top.id)!.probability!);
});

test('cached distant movement skips full selection but an imminent projectile interrupts immediately', () => {
  const { config, observation } = fixture();
  observation.targetBody.x = observation.state.fighters[1]!.position.x = 8;
  let selections = 0;
  const policy = createCombatAiPolicy({ id: 'pursue', scores: { approach: 2, sprint: 2, dash: -2, flank: -2, jump: -2 } });
  const ai = createCombatAi3D({ config, trainedPolicy: policy, tuning: { mode: 'adaptive', compression: true }, profile: stage => { if (stage === 'selection') selections++; } });
  for (let i = 0; i < 50 && !ai.capture().plan; i++) { observation.state.frame++;ai.step(observation); }
  expect(ai.capture().plan).toBeDefined();
  const before = selections, saved = JSON.parse(JSON.stringify(ai.capture()));
  observation.state.frame++;const action = ai.step(observation);
  expect(selections).toBe(before);
  const restored = createCombatAi3D({ config });restored.restore(saved);expect(restored.step(observation)).toEqual(action);
  const weapon = { owner: '', projectileOwner: 'target', position: { x: 1, y: 1, z: 0 }, velocity: { x: -18, y: 0, z: 0 }, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' };
  observation.state.frame++;expect(ai.step({ ...observation, weapons: [weapon] }).input.guard).toBe(true);
});

test('adaptive dash draws exclude protected and delivery-unreachable attacks before recording alternatives', () => {
  const { config, observation } = fixture();
  observation.targetBody.x = observation.state.fighters[1]!.position.x = 2;
  observation.state.fighters[1]!.protectionFrames = 180;
  const protectedAi = createCombatAi3D({ config, tuning: { mode: 'adaptive' } });
  protectedAi.step({ ...observation, dashing: true });
  expect(protectedAi.learning()!.traces.every(trace => trace.candidates.every(candidate => !candidate.id.startsWith('dash:') || config.moves.find(move => `dash:${move.id}` === candidate.id)!.damage === 0))).toBe(true);
  observation.state.fighters[1]!.protectionFrames = 0;observation.targetBody.velocityX = 30;
  const delayedAi = createCombatAi3D({ config, tuning: { mode: 'adaptive' } });
  delayedAi.step({ ...observation, difficulty: 1, dashing: true });
  expect(delayedAi.learning()!.traces.every(trace => trace.candidates.every(candidate => !candidate.id.startsWith('dash:') || config.moves.find(move => `dash:${move.id}` === candidate.id)!.damage === 0))).toBe(true);
});

test('dash lethal recovery priority survives an adverse offset on the damaging choices', () => {
  const { config, observation } = fixture();
  const target = observation.state.fighters[1]!, heavy = config.moves.find(move => move.id === 'heavy')!;
  target.health = 1;target.escapeCharges = 0;target.moveId = heavy.id;target.moveFrame = heavy.startupFrames + heavy.activeFrames;
  config.moves = config.moves.map(move => move.id === heavy.id ? { ...move, cancels: [] } : move);
  const ai = createCombatAi3D({ config, tuning: { mode: 'adaptive' }, trainedPolicy: createCombatAiPolicy({ id: 'adverse-dash',
    scores: Object.fromEntries(config.moves.filter(move => move.dashAttack).map(move => [`dash:${move.id}`, move.damage > 0 ? -2 : 2])) }) });
  ai.step({ ...observation, dashing: true });
  const trace = ai.learning()!.traces.find(row => row.chosen.startsWith('dash:'))!;
  expect(trace).toBeDefined();
  expect(trace.candidates.some(candidate => candidate.probability === 0)).toBe(true);
  for (const candidate of trace.candidates.filter(candidate => candidate.probability! > 0)) {
    const move = config.moves.find(move => `dash:${move.id}` === candidate.id)!;
    expect(move.damage).toBeGreaterThanOrEqual(target.health);
    expect(contactFrame(move, observation, { x: 1, y: 0, z: 0 }, config.hurtRadius)).toBeLessThan(heavy.recoveryFrames);
  }
});
