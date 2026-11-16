import { expect, test } from 'bun:test';
import { createCombatAiInsights } from './insights.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatAiOutcomes } from './outcomes.ts';
import { createCombatAi3D } from '../combat-ai.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';

function fixture() {
  const state = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 8, y: 1, z: 0 } }] }).capture();
  for (const fighter of state.fighters) fighter.stamina = 100;
  const action = { input: { fighterId: 'a', pressed: [] }, direction: { x: 1, y: 0, z: 0 }, jump: false, dash: false, sprint: true };
  return { state, self: state.fighters[0]!, target: state.fighters[1]!, action };
}

test('attack drought opens at180frames and reports observed obstruction instead of inventing a decision failure', () => {
  const { self, target, action } = fixture(), insights = createCombatAiInsights();
  for (let frame = 0; frame < 180; frame++) insights.observe(frame, self, target, action);
  expect(insights.report().attackDroughts).toHaveLength(0);
  insights.observe(180, self, target, action);
  expect(insights.report().attackDroughts[0]).toMatchObject({ startFrame: 0, endFrame: 180, frames: 180, open: true });
  expect(insights.report().attackDroughts[0]!.reasons['movement-not-progressing']).toBeGreaterThan(100);
  self.attackSerial++;self.moveId = 'jab';insights.observe(181, self, target, action, 'jab');
  expect(insights.report().attackDroughts[0]!.open).toBe(false);
  expect(insights.report().struggled).toHaveLength(0);
  self.moveId = '';insights.observe(220, self, target, action);
  expect(insights.report().struggled).toEqual([{ moveId: 'jab', whiffs: 1, blocked: 0, parried: 0 }]);
});

test('actual contact records successful damage, block and parry separately and cannot later become a whiff', () => {
  const { self, target, action } = fixture(), insights = createCombatAiInsights();
  insights.observe(0, self, target, action);self.attackSerial++;self.moveId = 'jab';insights.observe(1, self, target, action, 'jab');
  for (const kind of ['hit', 'block', 'parry'] as const) insights.resolve({ id: kind, frame: 5, attackerId: 'a', targetId: 'b', moveId: 'jab', kind, damage: kind === 'hit' ? 8 : 0, impulse: { x: 0, y: 0, z: 0 } }, 'a');
  self.moveId = '';insights.observe(30, self, target, action);
  expect(insights.report().worked).toEqual([{ moveId: 'jab', hits: 1, damage: 8 }]);
  expect(insights.report().struggled).toEqual([{ moveId: 'jab', whiffs: 0, blocked: 1, parried: 1 }]);
  const read = insights.report();read.worked[0]!.damage = 999;expect(insights.report().worked[0]!.damage).toBe(8);
  insights.resolve({ id: 'grab', frame: 31, attackerId: 'a', targetId: 'b', moveId: '', kind: 'hit', damage: 5.2, impulse: { x: 0, y: 4, z: 0 }, defenseReason: 'grapple-not-teched' }, 'a');
  expect(insights.report().worked.find(row => row.moveId === 'grab')).toEqual({ moveId: 'grab', hits: 1, damage: 5.2 });
});

test('zero-damage post-knockout contacts stay in raw outcomes without inflating successes or whiffs', () => {
  const { state, self, action } = fixture(), recorder = createCombatAiOutcomes();
  recorder.choice({ state, level: 9, fighter: 'a', target: 'b', action });
  state.frame = 1;self.attackSerial++;self.moveId = 'jab';
  recorder.choice({ state, level: 9, fighter: 'a', target: 'b', action, attackMove: 'jab' });
  recorder.resolve({ fighter: 'a', level: 9, events: [{ id: 'corpse-contact', frame: 5, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 0, impulse: { x: 0, y: 0, z: 0 } }] });
  state.frame = 30;self.moveId = '';
  recorder.choice({ state, level: 9, fighter: 'a', target: 'b', action });
  const report = recorder.report();
  expect(report.insights.worked).toEqual([]);
  expect(report.insights.struggled).toEqual([]);
  expect(report.outcomes.map(outcome => outcome.event.id)).toEqual(['corpse-contact']);
  expect(report.counts['AI9:attacker:hit']).toBe(1);
});

test('move-summary eviction reports incomplete coverage and survives round boundaries', () => {
  const recorder = createCombatAiOutcomes();
  for (let move = 0; move < 17; move++) recorder.resolve({ fighter: 'a', level: 9, events: [{ id: String(move), frame: move, attackerId: 'a', targetId: 'b',
    moveId: `move-${move}`, kind: 'hit', damage: 1, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(recorder.report().insights.worked).toHaveLength(16);
  expect(recorder.report().insights.droppedMoves).toBe(1);
  recorder.boundary('round');
  expect(recorder.report().segments[0]!.insights.droppedMoves).toBe(1);
  expect(recorder.report().insights.droppedMoves).toBe(0);
  expect(recorder.report().insights.worked).toHaveLength(0);
});

test('completed drought storage stays bounded and separate shared-recorder fighters retain causal summaries', () => {
  const { self, target, action } = fixture(), insights = createCombatAiInsights();
  for (let segment = 0; segment < 40; segment++) {
    self.moveId = '';insights.observe(segment * 200, self, target, action);
    self.attackSerial++;self.moveId = 'jab';insights.observe(segment * 200 + 190, self, target, action, 'jab');
  }
  expect(insights.report().attackDroughts.length).toBeLessThanOrEqual(32);expect(insights.report().droppedDroughts).toBeGreaterThan(0);
  const recorder = createCombatAiOutcomes(), config = createTouchOfDeathPreset();
  const a = createCombatAi3D({ config, outcomes: recorder }), b = createCombatAi3D({ config, outcomes: recorder });
  const { state } = fixture();
  for (let frame = 0; frame <= 180; frame++) {
    state.frame = frame;
    for (const [ai, id, other] of [[a, 'a', 'b'], [b, 'b', 'a']] as const) ai.step({ state, fighterId: id, targetId: other, difficulty: 9, grounded: true, targetGrounded: true,
      body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 8, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } });
  }
  expect(recorder.report().insights.attackDroughts.map(row => row.fighter)).toEqual(['a', 'b']);
  a.reset();b.reset();expect(recorder.report().segments).toHaveLength(1);
  expect(recorder.report().segments[0]!.insights.attackDroughts).toHaveLength(2);
});
