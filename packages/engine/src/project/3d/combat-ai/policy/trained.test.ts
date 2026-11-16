import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D } from '../../gameplay.ts';
import { createCombatAiPolicy, readCombatAiPolicy } from './trained.ts';
import { canonicalSaveJson } from '../../../../save/index.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'other', position: { x: 2, y: 1, z: 0 } }] }).capture();
  const observation = { state, fighterId: 'ai', targetId: 'other', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 2, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { config, observation };
}

test('trained artifacts reject malformed and unbounded data and own their score maps', () => {
  const scores = { 'attack:jab': 1 }, policy = createCombatAiPolicy({ id: 'candidate', scores });
  scores['attack:jab'] = -1;
  expect(policy.scores['attack:jab']).toBe(1);
  expect(readCombatAiPolicy(undefined)).toBeUndefined();
  for (const bad of [null, { ...policy, version: 2 }, { ...policy, id: '' }, { ...policy, extra: true },
    { ...policy, scores: { approach: NaN } }, { ...policy, scores: { approach: 2.01 } },
    { ...policy, scores: { cheat: 1 } }, { ...policy, scores: { 'attack:': 1 } },
    { ...policy, scores: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`attack:${i}`, 1])) }])
    expect(() => readCombatAiPolicy(bad)).toThrow();
});

test('neutral policy changes ordinary actions while an empty artifact preserves the baseline', () => {
  const { config, observation } = fixture();
  const trainedPolicy = createCombatAiPolicy({ id: 'jab', scores: { 'attack:jab': 2, 'attack:heavy': -2, 'attack:jab-toward': -2 } });
  let changed = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const baseline = createCombatAi3D({ config }).step({ ...observation, seed });
    const empty = createCombatAi3D({ config, trainedPolicy: createCombatAiPolicy({ id: 'empty', scores: {} }) }).step({ ...observation, seed });
    expect(empty).toEqual(baseline);
    const trained = createCombatAi3D({ config, trainedPolicy }).step({ ...observation, seed });
    if (JSON.stringify(trained) !== JSON.stringify(baseline)) changed++;
    expect(trained.input).not.toHaveProperty('dashing');
  }
  expect(changed).toBeGreaterThan(0);
});

test('restoring a policy into a different controller replays exactly and resets retain only the artifact', () => {
  const { config, observation } = fixture();
  const trainedPolicy = createCombatAiPolicy({ id: 'candidate', scores: { 'attack:jab': 2 } });
  const source = createCombatAi3D({ config, trainedPolicy });
  for (let tick = 0; tick < 17; tick++) source.step(observation);
  const saved = JSON.parse(JSON.stringify(source.capture()));
  const target = createCombatAi3D({ config, trainedPolicy: createCombatAiPolicy({ id: 'other', scores: { space: 2 } }) });
  target.restore(saved);
  for (let tick = 0; tick < 50; tick++) expect(target.step(observation)).toEqual(source.step(observation));
  target.reset({ round: true });expect(target.capture().trainedPolicy).toEqual(trainedPolicy);
  target.reset();expect(target.capture().trainedPolicy).toEqual(trainedPolicy);expect(target.capture().personality).toBeUndefined();
  expect(() => target.restore({ ...saved, trainedPolicy: { ...trainedPolicy, scores: { approach: Infinity } } })).toThrow();
  delete saved.trainedPolicy;target.restore(saved);expect(target.policyId).toBeUndefined();
});

test('dash score offsets affect actual dash choices without permitting standing dash attacks', () => {
  const { config, observation } = fixture();
  observation.targetBody.x = 1.5;
  const scores = Object.fromEntries(config.moves.filter(move => move.dashAttack).map(move => [`dash:${move.id}`, move.direction === 'away' ? 2 : -2]));
  const trainedPolicy = createCombatAiPolicy({ id: 'dash-spacing', scores });
  let changed = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const baseline = createCombatAi3D({ config }).step({ ...observation, seed, dashing: true });
    const trained = createCombatAi3D({ config, trainedPolicy }).step({ ...observation, seed, dashing: true });
    if (JSON.stringify(trained) !== JSON.stringify(baseline)) changed++;
    const standing = createCombatAi3D({ config, trainedPolicy }).step({ ...observation, seed });
    expect(standing).toEqual(createCombatAi3D({ config }).step({ ...observation, seed }));
  }
  expect(changed).toBeGreaterThan(0);
});

test('both gameplay seats receive distinct policies and saves restore them', async () => {
  const { runtime, project } = await combatMotionFixture({ match: true });
  const first = createCombatAiPolicy({ id: 'seat-zero', scores: { 'attack:jab': 1 } });
  const second = createCombatAiPolicy({ id: 'seat-one', scores: { 'attack:heavy': 1 } });
  const game = createGameplay3D({ runtime, project, combatAiPolicies: [first, second] });
  const saved = game.snapshot();
  expect(saved.combat?.playerAi?.trainedPolicy).toEqual(first);expect(saved.combat?.ai?.trainedPolicy).toEqual(second);
  const restored = createGameplay3D({ runtime, project });restored.restore(saved);
  expect(restored.snapshot().combat?.playerAi?.trainedPolicy).toEqual(first);expect(restored.snapshot().combat?.ai?.trainedPolicy).toEqual(second);
  const checkpoint = restored.checkpoint();restored.step(['match:theater']);checkpoint.restore();
  expect(restored.snapshot().combat?.playerAi?.trainedPolicy).toEqual(first);
});

test('queued adoption preserves a restored match and applies only at a new match, including baseline rollback', () => {
  const { config, observation } = fixture();
  const oldPolicy = createCombatAiPolicy({ id: 'old', scores: { 'attack:jab': 1 } });
  const nextPolicy = createCombatAiPolicy({ id: 'new', scores: { 'attack:heavy': 1 } });
  const old = createCombatAi3D({ config, trainedPolicy: oldPolicy });old.step(observation);
  const brain = createCombatAi3D({ config, trainedPolicy: nextPolicy });brain.restore(old.capture());
  brain.queuePolicy({ policy: nextPolicy });
  expect(brain.policyId).toBe('old');expect(brain.step(observation)).toEqual(old.step(observation));
  brain.reset({ round: true });expect(brain.policyId).toBe('old');
  const checkpoint = JSON.parse(JSON.stringify(brain.capture()));
  brain.reset();expect(brain.policyId).toBe('new');expect(brain.capture().queuedPolicy).toBeUndefined();
  brain.restore(checkpoint);expect(brain.policyId).toBe('old');brain.reset();expect(brain.policyId).toBe('new');
  brain.queuePolicy({});brain.reset({ round: true });expect(brain.policyId).toBe('new');
  brain.reset();expect(brain.policyId).toBeUndefined();
  expect(() => brain.restore({ ...checkpoint, queuedPolicy: { illegal: true } })).toThrow();
  expect(() => brain.restore({ ...checkpoint, queuedPolicy: { policy: { ...nextPolicy, scores: { approach: 99 } } } })).toThrow();
});

test('a queued baseline reset stays portable through JSON save and restore', () => {
  const { config } = fixture(), policy = createCombatAiPolicy({ id: 'trained', scores: { approach: 1 } });
  const brain = createCombatAi3D({ config, trainedPolicy: policy });brain.queuePolicy({});
  const saved = brain.capture();expect(() => canonicalSaveJson(saved)).not.toThrow();
  brain.restore(JSON.parse(JSON.stringify(saved)));
  expect(brain.hasQueuedPolicy).toBe(true);expect(brain.policyId).toBe('trained');
  expect(() => canonicalSaveJson(brain.capture())).not.toThrow();
  brain.reset({ round: true });expect(brain.policyId).toBe('trained');
  brain.reset();expect(brain.hasQueuedPolicy).toBe(false);expect(brain.policyId).toBeUndefined();
});

test('public gameplay queues both seats atomically and checkpoints retain pending adoption', async () => {
  const { game } = await combatMotionFixture({ match: true });
  const policy = createCombatAiPolicy({ id: 'queued', scores: { 'attack:jab': 1 } });
  game.queueCombatAiPolicies({ policies: [policy, policy] });
  expect(game.snapshot().combat?.playerAi?.queuedPolicy?.policy).toEqual(policy);
  const invalid = JSON.parse(JSON.stringify({ ...policy, scores: { approach: 99 } }));
  expect(() => game.queueCombatAiPolicies({ policies: [undefined, invalid] })).toThrow();
  expect(game.snapshot().combat?.playerAi?.queuedPolicy?.policy).toEqual(policy);
  const checkpoint = game.checkpoint();game.reset();
  expect(game.snapshot().combat?.ai?.trainedPolicy).toEqual(policy);
  checkpoint.restore();expect(game.snapshot().combat?.ai?.trainedPolicy).toBeUndefined();
  expect(game.snapshot().combat?.ai?.queuedPolicy?.policy).toEqual(policy);
  game.reset();expect(game.snapshot().combat?.ai?.trainedPolicy).toEqual(policy);
});
