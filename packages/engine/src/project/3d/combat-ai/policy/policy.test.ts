import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { initialPersonality, personalityWeights } from '../personality/index.ts';
import { tacticalCandidates } from './candidates.ts';
import { candidateProbabilities, chooseTactic, initialPolicy, readPolicy, type TacticalCandidate } from './selection.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'other', position: { x: 1.6, y: 1, z: 0 } }] }).capture();
  const personality = initialPersonality({ seed: 1, fighterId: 'ai' });
  const options: Parameters<typeof tacticalCandidates>[0] = { config, self: state.fighters[0]!, target: state.fighters[1]!, personality,
    preferences: personalityWeights(personality), difficulty: 9, distance: 1.6, fullDistance: 1.6, above: 0, grounded: true, targetGrounded: true,
    speed: 0, retreating: false, quiet: 0, stalled: 0, held: false, grab: { range: 2.4, startupFrames: 8 }, failedMove: '', failures: 0,
    eligible: move => !move.weaponAttack && !move.dashAttack, physical: move => move, reaches: () => true };
  return options;
}

function probability(options: Parameters<typeof tacticalCandidates>[0], predicate: (candidate: TacticalCandidate) => boolean) {
  const candidates = tacticalCandidates(options), probabilities = candidateProbabilities(candidates, options.difficulty);
  return candidates.reduce((sum, candidate, index) => sum + (predicate(candidate) ? probabilities[index]! : 0), 0);
}

test('training exploration gives neglected legal actions a probability floor while preserving lethal priority', () => {
  const candidates = [{ id: 'favored', score: 20 }, { id: 'neglected', score: -20 }];
  expect(candidateProbabilities(candidates, 9, .08)[1]).toBeGreaterThanOrEqual(.04);
  expect(candidateProbabilities(candidates, 9, 1)).toEqual([.5, .5]);
  expect(candidateProbabilities([{ ...candidates[0]!, priority: true }, candidates[1]!], 9, 1)).toEqual([1, 0]);
  const selected = new Set<string>();
  for (let seed = 1; seed <= 100; seed++) selected.add(chooseTactic(initialPolicy(), candidates, 9, 0, 0, Math.imul(seed, 2654435761) >>> 0, 1)!.id);
  expect(selected.size).toBe(2);
});

test('difficulty smoothly increases candidate noise without changing legal candidates', () => {
  const candidates = [{ id: 'good', score: 3 }, { id: 'risky', score: 1 }, { id: 'poor', score: -1 }];
  let previous = 0;
  for (let level = 1; level <= 9; level++) {
    const probabilities = candidateProbabilities(candidates, level);
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(probabilities.every(value => value > 0)).toBe(true);
    expect(probabilities[0]!).toBeGreaterThan(previous);previous = probabilities[0]!;
  }
  const counts = [0, 0];
  for (let seed = 1; seed <= 1000; seed++) for (const [index, level] of [1, 9].entries())
    if (chooseTactic(initialPolicy(), candidates, level, 0, 0, Math.imul(seed, 2654435761) >>> 0)!.id !== 'good') counts[index]!++;
  expect(counts[0]!).toBeGreaterThan(200);expect(counts[1]!).toBeLessThan(30);
});

test('close-fight and grapple tastes numerically change probabilities, not permission', () => {
  const options = fixture();
  options.preferences.dogfighter = .3;const passive = probability(options, candidate => !!candidate.moveId);
  options.preferences.dogfighter = 1.7;expect(probability(options, candidate => !!candidate.moveId)).toBeGreaterThan(passive);
  options.preferences.grappler = .3;const occasional = probability(options, candidate => !!candidate.grapple);
  options.preferences.grappler = 1.7;expect(probability(options, candidate => !!candidate.grapple)).toBeGreaterThan(occasional * 3);
  options.held = true;expect(tacticalCandidates(options).some(candidate => candidate.grapple)).toBe(false);
  options.held = false;options.distance = 5;expect(tacticalCandidates(options).some(candidate => candidate.grapple)).toBe(false);
});

test('visible punish windows and whiff-punisher preference increase timed punish probability', () => {
  const options = fixture();options.enemy = options.config.moves.find(move => move.id === 'heavy')!;
  options.target.moveFrame = options.enemy.startupFrames + options.enemy.activeFrames;
  options.preferences.whiffPunisher = .3;const first = probability(options, candidate => !!candidate.moveId);
  options.preferences.whiffPunisher = 1.7;expect(probability(options, candidate => !!candidate.moveId)).toBeGreaterThan(first);
  options.target.moveFrame += options.enemy.recoveryFrames - 3;
  expect(probability(options, candidate => !!candidate.moveId)).toBeLessThan(.05);
});

test('safe bait whiffs consider retreat travel and enemy weapons; failed attacks lose weight', () => {
  const options = fixture();options.distance = options.fullDistance = 2.3;options.reaches = () => false;
  const probes = tacticalCandidates(options).filter(candidate => candidate.probe);
  expect(probes.some(candidate => candidate.moveId === 'jab-away')).toBe(true);
  options.preferences.bait = .3;const baseline = probability(options, candidate => !!candidate.probe);
  options.preferences.bait = 1.7;expect(probability(options, candidate => !!candidate.probe)).toBeGreaterThan(baseline);
  options.enemyLength = 8;expect(tacticalCandidates(options).some(candidate => candidate.probe)).toBe(false);
  options.enemyLength = undefined;options.reaches = () => true;
  const learned = probability(options, candidate => candidate.moveId === 'jab');
  options.failedMove = 'jab';options.failures = 3;
  expect(probability(options, candidate => candidate.moveId === 'jab')).toBeLessThan(learned / 10);
});

test('movement intent holds a cadence, interrupts for observed opportunity and replays exactly', () => {
  const memory = initialPolicy(), choices: TacticalCandidate[] = [{ id: 'approach', score: 3, movement: 'toward' }, { id: 'flank', score: 2, movement: 'flank' }];
  const first = chooseTactic(memory, choices, 7, 0, 0, 991)!;
  for (let tick = 1; tick < 12; tick++) expect(chooseTactic(memory, choices, 7, tick, 0, 991)!.id).toBe(first.id);
  const saved = readPolicy(JSON.parse(JSON.stringify(memory)));
  const run = () => Array.from({ length: 100 }, (_, tick) => chooseTactic(memory, choices, 7, tick + 12, 0, 991));
  const expected = run();Object.assign(memory, saved);expect(run()).toEqual(expected);
  expect(chooseTactic(memory, [{ id: 'punish', score: 20, moveId: 'heavy' }, ...choices], 9, 113, 0, 991)!.id).toBe('punish');
  expect(() => readPolicy({ ...memory, until: -1 })).toThrow();expect(readPolicy(undefined)).toEqual(initialPolicy());
});

test('speed tastes and resolved successes change actual candidate odds; repeated parries reduce them', () => {
  const options = fixture();
  Object.assign(options.preferences, { fast: 1.7, reckless: .3, defensive: 1.7 });
  const fast = probability(options, candidate => candidate.moveId === 'jab');
  Object.assign(options.preferences, { fast: .3, reckless: 1.7, defensive: .3 });
  expect(probability(options, candidate => candidate.moveId === 'jab')).toBeLessThan(fast);
  options.personality.moves = [{ id: 'jab', attempts: 8, hits: 8, parries: 0, blocks: 0, whiffs: 0 }];
  const successful = probability(options, candidate => candidate.moveId === 'jab');
  options.personality.moves[0]!.hits = 0;options.personality.moves[0]!.parries = 8;
  expect(probability(options, candidate => candidate.moveId === 'jab')).toBeLessThan(successful / 10);
});
