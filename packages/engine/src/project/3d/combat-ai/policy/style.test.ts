import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { initialPersonality, personalityWeights, preferenceKeys } from '../personality/index.ts';
import { tacticalCandidates } from './candidates.ts';
import { candidateProbabilities } from './selection.ts';
import { contactFrame } from './prediction.ts';
import { combatStyleScore, pickupStyleProbability } from './style.ts';
import { initialLearning, learningAdjustment, learningConfidence, learningContext, observeLearning, recordDecision, resolveLearning } from '../learning/model.ts';

function fixture(distance = 1.6) {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'target', position: { x: distance, y: 1, z: 0 } }] }).capture();
  const personality = initialPersonality({ seed: 1, fighterId: 'ai' });
  for (const key of preferenceKeys) personality.preferences[key] = 1;
  const observation = { state, fighterId: 'ai', targetId: 'target', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: distance, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  const contact = (move: typeof config.moves[number]) => contactFrame(move, observation, { x: 1, y: 0, z: 0 }, config.hurtRadius);
  const options: Parameters<typeof tacticalCandidates>[0] = { config, self: state.fighters[0]!, target: state.fighters[1]!, personality,
    preferences: personalityWeights(personality), difficulty: 9, distance, fullDistance: distance, above: 0, grounded: true, targetGrounded: true,
    speed: 0, retreating: false, quiet: 0, stalled: 0, held: false, failedMove: '', failures: 0, adaptive: true,
    eligible: move => !move.weaponAttack && !move.dashAttack,
    physical: move => move, reaches: move => Number.isFinite(contact(move)), contactFrames: contact };
  return options;
}

function distribution(options: Parameters<typeof tacticalCandidates>[0]) {
  const candidates = tacticalCandidates(options), probabilities = candidateProbabilities(candidates, options.difficulty);
  expect(probabilities.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 12);
  for (const candidate of candidates) if (candidate.moveId) {
    const move = options.config.moves.find(move => move.id === candidate.moveId)!;
    expect(move.staminaCost ?? 0).toBeLessThanOrEqual(options.self.stamina);
    expect(move.airborne === undefined || move.airborne === !options.grounded).toBe(true);
  }
  return { candidates, rows: Object.fromEntries(candidates.map((candidate, index) => [candidate.id, probabilities[index]!])) };
}

test('one item preference strongly changes pickup willingness within bounded probabilities', () => {
  expect(pickupStyleProbability(.3)).toBeCloseTo(.02);
  expect(pickupStyleProbability(1)).toBe(.5);
  expect(pickupStyleProbability(1.7)).toBeCloseTo(.98);
  expect(pickupStyleProbability(-100)).toBeCloseTo(.02);
  expect(pickupStyleProbability(100)).toBeCloseTo(.98);
});

test('one speed preference changes quick-versus-heavy odds within the same authored legal pool', () => {
  const options = fixture();options.preferences.fast = .3;
  const slow = distribution(options);options.preferences.fast = 1.7;
  const fast = distribution(options);
  expect(fast.candidates.map(candidate => candidate.id)).toEqual(slow.candidates.map(candidate => candidate.id));
  expect(slow.rows['attack:jab']).toBeGreaterThan(0);expect(slow.rows['attack:heavy']).toBeGreaterThan(0);
  expect(fast.rows['attack:jab']! / fast.rows['attack:heavy']!).toBeGreaterThan(slow.rows['attack:jab']! / slow.rows['attack:heavy']! * 50);
});

test('one defensive preference increases retreat and recovery probabilities in tired contexts', () => {
  for (const distance of [1.6, 4]) {
    const options = fixture(distance);options.self.stamina = 12;options.preferences.defensive = .3;
    const bold = distribution(options);options.preferences.defensive = 1.7;
    const cautious = distribution(options), id = distance < 3.5 ? 'space' : 'recover';
    expect(cautious.candidates.map(candidate => candidate.id)).toEqual(bold.candidates.map(candidate => candidate.id));
    expect(cautious.rows[id]).toBeGreaterThan(bold.rows[id]!);
    expect(cautious.rows[id]).toBeLessThan(1);
  }
});

test('changing one preference never transfers lethal-punish priority to retreat or recovery', () => {
  const options = fixture();options.target.health = 1;options.target.escapeCharges = 0;
  const enemy = options.config.moves.find(move => move.damage > 0 && move.recoveryFrames > 30 && !move.cancels.length)!;
  expect(enemy).toBeDefined();options.enemy = enemy;options.target.moveId = enemy.id;
  options.target.moveFrame = enemy.startupFrames + enemy.activeFrames;
  for (const trait of preferenceKeys) {
    options.preferences[trait] = .3;const low = distribution(options);
    options.preferences[trait] = 1.7;const high = distribution(options);
    const priorities = low.candidates.filter(candidate => candidate.priority).map(candidate => candidate.id);
    expect(priorities.length).toBeGreaterThan(0);
    expect(high.candidates.filter(candidate => candidate.priority).map(candidate => candidate.id)).toEqual(priorities);
    for (const [id, probability] of Object.entries(high.rows)) if (!priorities.includes(id)) expect(probability).toBe(0);
    options.preferences[trait] = 1;
  }
});

test('every authored preference changes a legal distribution in an observed context without changing admission', () => {
  for (const trait of preferenceKeys) {
    const options = fixture(['eager', 'positioning', 'jumping'].includes(trait) ? 4 : 1.6);
    options.speed = 5;options.grab = { range: 2.4, startupFrames: 8 };
    if (trait === 'items') options.held = true;
    if (trait === 'whiffPunisher') {
      options.enemy = options.config.moves.find(move => move.id === 'heavy')!;
      options.target.moveFrame = options.enemy.startupFrames + options.enemy.activeFrames;
    }
    options.preferences[trait] = .3;const low = distribution(options);
    options.preferences[trait] = 1.7;const high = distribution(options);
    expect(high.candidates.map(candidate => candidate.id)).toEqual(low.candidates.map(candidate => candidate.id));
    expect(Object.keys(high.rows).some(id => Math.abs(high.rows[id]! - low.rows[id]!) > 1e-9)).toBe(true);
    for (const candidate of [...low.candidates, ...high.candidates]) expect(Math.abs(candidate.styleScore ?? 0)).toBeLessThanOrEqual(1.4);
  }
});

test('style stays centered and stable while repeated negative evidence lowers executed action odds', () => {
  const options = fixture();const neutral = distribution(options);
  expect(neutral.candidates.every(candidate => candidate.styleScore === 0)).toBe(true);
  options.preferences.fast = 1.7;
  const candidates = tacticalCandidates(options), memory = initialLearning();
  const context = learningContext(options.self, options.target, options.distance);
  const state = { version: 1 as const, configKey: '', frame: 0, fighters: [options.self, options.target] };
  const observe = () => observeLearning(memory, { state, fighterId: 'ai', targetId: 'target', distance: options.distance });
  const learned = () => candidates.map(candidate => ({ ...candidate, score: candidate.score + learningAdjustment(memory, context, candidate) }));
  const odds = () => {
    const pool = learned(), probabilities = candidateProbabilities(pool, 9);
    return probabilities[pool.findIndex(candidate => candidate.id === 'attack:jab')]! / probabilities[pool.findIndex(candidate => candidate.id === 'attack:heavy')]!;
  };
  const attempt = () => {
    state.frame++;observe();const pool = learned(), probabilities = candidateProbabilities(pool, 9);
    const index = pool.findIndex(candidate => candidate.id === 'attack:jab'), chosen = pool[index]!;
    recordDecision(memory, { frame: state.frame, context, candidates: pool.map((candidate, i) => ({ ...candidate, probability: probabilities[i]! })), chosen, probability: probabilities[index]! });
    state.frame++;options.self.attackSerial++;options.self.moveId = 'jab';
    resolveLearning(memory, { state, fighterId: 'ai', targetId: 'target', events: [{ id: `${state.frame}:parry`, frame: state.frame, kind: 'parry', moveId: 'jab', damage: 0,
      attackerId: 'ai', targetId: 'target', impulse: { x: 0, y: 0, z: 0 } }] });observe();
    state.frame++;options.self.moveId = '';resolveLearning(memory, { state, fighterId: 'ai', targetId: 'target', events: [] });observe();
    state.frame += 12;resolveLearning(memory, { state, fighterId: 'ai', targetId: 'target', events: [] });observe();
  };
  observe();const before = odds();expect(before).toBeGreaterThan(10);
  attempt();const once = odds();expect(once).toBeGreaterThan(1);expect(once).toBeGreaterThan(before * .4);expect(once).toBeLessThan(before);
  for (let i = 0; i < 31; i++) attempt();
  expect(odds()).toBeLessThan(once);expect(memory.actions).toHaveLength(1);
  expect(memory.actions[0]!.action).toBe('attack:jab');
  expect(learningAdjustment(memory, context, candidates.find(candidate => candidate.id === 'attack:heavy')!)).toBe(0);
  expect(learningConfidence(memory, 'far:ground:ground:neutral', 'attack:jab')).toBe(0);
  expect(combatStyleScore({ preferences: options.preferences, candidate: { id: 'lethal', score: 1, priority: true }, distance: 1.6, grounded: true, targetGrounded: true })).toBe(0);
});
