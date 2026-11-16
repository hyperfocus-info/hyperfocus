import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../../combat/config.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import type { CombatEvent } from '../../../../combat/state.ts';
import { createCombatAiOutcomes } from '../outcomes.ts';
import { createCombatAiExchanges } from './recorder.ts';

function fixture() {
  const simulation = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] });
  const state = simulation.capture(), recorder = createCombatAiExchanges();
  recorder.observe(state, 'a');recorder.observe(state, 'b');
  return { state, recorder, target: state.fighters[1]! };
}
function hit(frame = 0, damage = 8): CombatEvent {
  return { id: `${frame}:a:b`, frame, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage, impulse: { x: 0, y: 0, z: 0 } };
}

test('actual simulation contacts form one lethal chain and corpse contact earns nothing', () => {
  const config = createCombatPreset();config.maxHealth = 16;
  config.moves = [{ ...config.moves[0]!, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, hitstunFrames: 30, cancels: [] }];
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] });
  const recorder = createCombatAiExchanges();
  for (let tick = 0; tick < 16; tick++) {
    const state = sim.capture();recorder.observe(state, 'a', state.fighters[0]!.moveId || undefined);
    const events = sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
    recorder.resolve(events);recorder.resolve(events);
  }
  const report = recorder.report();
  expect(report.samples).toHaveLength(1);
  expect(report.samples[0]).toMatchObject({ attacker: 'a', target: 'b', initialTargetHealth: 16, damage: 16, hits: 2, end: 'knockout', droppedContacts: 0, committedStun: true });
  expect(report.samples[0]!.contacts.map(row => row.damage)).toEqual([8, 8]);
  expect(report.actors.find(row => row.fighter === 'a')).toMatchObject({ damageDealt: 16, chainsStarted: 1, chainsCompleted: 1 });
  expect(report.actors.find(row => row.fighter === 'b')?.damageTaken).toBe(16);
  expect(report.coverage.duplicateEvents).toBeGreaterThan(0);
});

test('recovery requires a committed later snapshot and report reads never close the chain', () => {
  const { recorder, state, target } = fixture();recorder.resolve([hit()]);
  const pending = recorder.report();expect(pending.open).toHaveLength(1);
  expect(recorder.report()).toEqual(pending);
  recorder.observe(state, 'a');expect(recorder.report().open).toHaveLength(1);
  state.frame = 1;target.health = 92;target.stunKind = 'hit';target.stunFrames = 4;
  recorder.observe(state, 'a');expect(recorder.report().open[0]?.committedStun).toBe(true);
  state.frame = 5;target.stunFrames = 0;target.stunKind = '';
  recorder.observe(state, 'a');
  expect(recorder.report().samples[0]).toMatchObject({ end: 'recovered', endFrame: 5 });
  expect(recorder.report().actors[0]?.chainsBroken).toBe(1);
  pending.open[0]!.contacts.length = 0;
  expect(recorder.report().samples[0]!.contacts).toHaveLength(1);
});

test('tech and armored escape retain their actual ending event without blaming a drop', () => {
  for (const kind of ['tech', 'escape'] as const) {
    const { recorder } = fixture();recorder.resolve([hit()]);
    recorder.resolve([{ ...hit(2, 0), id: kind, attackerId: 'b', targetId: 'b', moveId: kind === 'tech' ? '' : 'burst', kind }]);
    expect(recorder.report().samples[0]).toMatchObject({ end: kind, endingEvent: { eventId: kind, frame: 2, kind } });
    expect(recorder.report().actors[0]).toMatchObject({ chainsEscaped: 1, chainsBroken: 0 });
  }
});

test('counterhits and simultaneous trades are distinct from neutral recovery', () => {
  const { recorder } = fixture();recorder.resolve([hit()]);
  recorder.resolve([{ ...hit(2), attackerId: 'b', targetId: 'a', counter: true }]);
  expect(recorder.report().samples[0]?.end).toBe('counterhit');
  const other = fixture().recorder;
  other.resolve([hit(), { ...hit(), id: 'reciprocal', attackerId: 'b', targetId: 'a' }]);
  expect(other.report().samples.map(row => row.end)).toEqual(['trade', 'trade']);
});

test('boundary keeps confirmed knockout and censors an unfinished chain', () => {
  const { state } = fixture(), logger = createCombatAiOutcomes();
  const action = { input: { fighterId: 'a' }, direction: { x: 0, y: 0, z: 0 }, jump: false, dash: false, sprint: false };
  logger.choice({ state, fighter: 'a', target: 'b', level: 9, action });
  logger.resolve({ events: [hit()], fighter: 'a', level: 9 });
  logger.resolve({ events: [hit()], fighter: 'b', level: 9 });
  expect(logger.report().exchanges.actors[0]?.damageDealt).toBe(8);
  logger.boundary('round-reset');
  expect(logger.report().segments[0]?.exchanges.samples[0]).toMatchObject({ end: 'censored', cause: 'round-reset' });
  logger.choice({ state, fighter: 'a', target: 'b', level: 9, action });
  logger.resolve({ events: [hit(0, 100)], fighter: 'a', level: 9 });logger.boundary('round-reset');
  expect(logger.report().segments[1]?.exchanges.samples[0]?.end).toBe('knockout');
});

test('contact and sample truncation remain bounded with explicit loss counts', () => {
  const { recorder, state, target } = fixture();
  state.frame = 1;target.health = 1000;recorder.observe(state, 'a');
  for (let frame = 1; frame < 41; frame++) recorder.resolve([hit(frame, 1)]);
  recorder.boundary('stop');
  const sample = recorder.report().samples[0]!;
  expect(sample.hits).toBe(40);expect(sample.contacts).toHaveLength(32);expect(sample.droppedContacts).toBe(8);
  for (let frame = 41; frame < 81; frame++) { recorder.resolve([hit(frame, 1)]);recorder.boundary('stop'); }
  expect(recorder.report().samples).toHaveLength(32);
  expect(recorder.report().coverage).toMatchObject({ droppedSamples: 9, droppedContacts: 8 });
  expect(recorder.report().actors[0]?.chainsCensored).toBe(41);
});

test('dedup saturation fails closed, old events stay stale and clear permits reused IDs', () => {
  const { recorder } = fixture();
  recorder.resolve(Array.from({ length: 300 }, (_, i) => ({ ...hit(0, .001), id: String(i) })));
  const report = recorder.report();expect(report.coverage.droppedEvents).toBe(44);
  recorder.resolve([hit(1, 1)]);recorder.resolve([hit(0, 50)]);
  expect(recorder.report().coverage.staleEvents).toBe(1);
  expect(recorder.report().actors[0]!.damageDealt).toBeCloseTo(1.256);
  recorder.clear();expect(recorder.report().actors).toEqual([]);expect(recorder.report().coverage.droppedEvents).toBe(0);
});

test('committed damaging move starts count once per AI seat including Theater repeats', () => {
  const { recorder, state } = fixture();
  state.frame = 1;
  for (const fighter of state.fighters) { fighter.attackSerial++;fighter.moveId = 'jab'; }
  for (let repeat = 0; repeat < 3; repeat++) {
    recorder.observe(state, 'a', 'jab');recorder.observe(state, 'b', 'jab');
  }
  expect(recorder.report().actors.map(row => row.attackStarts)).toEqual([1, 1]);
  state.frame++;state.fighters[0]!.attackSerial++;state.fighters[0]!.moveId = 'feint';recorder.observe(state, 'a');
  expect(recorder.report().actors[0]?.attackStarts).toBe(1);
});

test('unattributed knockout and lethal environmental contact cannot complete an opponent chain', () => {
  const { recorder, state, target } = fixture();recorder.resolve([hit()]);
  state.frame = 1;target.health = 0;recorder.observe(state, 'a');
  expect(recorder.report().samples[0]).toMatchObject({ end: 'censored', cause: 'unattributed-knockout' });
  const other = fixture().recorder;other.resolve([hit()]);
  other.resolve([{ ...hit(1, 92), attackerId: 'traffic', environmentId: 'traffic', defenseReason: 'traffic-impact' }]);
  expect(other.report().samples[0]).toMatchObject({ end: 'censored', cause: 'external-damage' });
  expect(other.report().actors[0]).toMatchObject({ damageDealt: 8, chainsCompleted: 0, chainsCensored: 1 });
  expect(other.report().actors[1]?.damageTaken).toBe(100);
});
