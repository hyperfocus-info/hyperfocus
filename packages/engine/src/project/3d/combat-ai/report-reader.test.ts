import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatAiOutcomes } from './outcomes.ts';
import { readCombatAiOutcomeReport3D } from './report-reader.ts';
import { corruptStructuralLeaves } from '../../../test-support/structural-corruption.ts';

function reportFixture() {
  const simulation = createCombatSimulation({ fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] });
  const recorder = createCombatAiOutcomes();
  recorder.context({ mode: 'theater', match: 1, round: 2, fighters: [{ id: 'a', type: 'ai', level: 9, traits: { risk: .5 }, policyId: 'p' }, { id: 'b', type: 'human' }] });
  for (let frame = 0; frame < 200; frame++) {
    const state = simulation.capture();
    recorder.choice({ state, fighter: 'a', target: 'b', level: 9, action: {
      direction: { x: .1, y: 0, z: .2 }, jump: false, dash: false, sprint: true,
      input: { fighterId: 'a', pressed: ['jab'], held: ['heavy'], guard: false, guardFresh: false, tech: false,
        direction: { x: 1, y: 0, z: 0 }, influenceDirection: { x: .2, y: .3, z: .4 }, dashing: false, dashStart: false, drive: false, airborne: false, idle: false, locomotionCost: .1 },
    } });
    const events = simulation.step({ inputs: [{ fighterId: 'a', pressed: frame % 30 === 0 ? ['jab'] : [] }] });
    recorder.resolve({ events, level: 9, fighter: 'a' });
  }
  recorder.boundary('round-end');
  const state = simulation.capture();
  recorder.choice({ state, fighter: 'a', target: 'b', level: 9, action: { direction: { x: 0, y: 0, z: 0 }, jump: true, dash: true, sprint: false, input: { fighterId: 'a', pressed: ['jab'], held: ['heavy'], guard: true, guardFresh: false, tech: true, direction: { x: 1, y: 0, z: 0 }, influenceDirection: { x: .1, y: .2, z: .3 }, dashing: true, dashStart: true, drive: true, airborne: true, idle: false, locomotionCost: .2 } } });
  for (const kind of ['hit', 'block', 'parry', 'guard-break', 'tech', 'bounce', 'escape'] as const) recorder.resolve({ level: 9, fighter: 'a', events: [{
    id: kind, frame: state.frame, attackerId: 'a', targetId: 'b', moveId: 'jab', kind, damage: 1, impulse: { x: 1, y: 2, z: 3 },
    guardDamage: .5, environmentId: 'wall', defenseReason: 'traffic-impact', counter: true, hitstunFrames: 3, armored: true,
    contactPoint: { x: 4, y: 5, z: 6 }, contactNormal: { x: 0, y: 1, z: 0 }, baseImpulse: { x: 7, y: 8, z: 9 },
  }] });
  return recorder.report();
}

test('reads the actual complete recorder report and detaches all nested evidence', () => {
  const original = reportFixture(), decoded = readCombatAiOutcomeReport3D(JSON.parse(JSON.stringify(original)));
  expect(decoded).toEqual(original);
  expect(original.segments[0]!.exchanges.samples.length).toBeGreaterThan(0);
  expect(original.segments[0]!.insights.worked.length).toBeGreaterThan(0);
  decoded.context!.fighters[0]!.traits!.risk = 99;
  decoded.segments[0]!.exchanges.samples[0]!.contacts.length = 0;
  decoded.outcomes[0]!.event.impulse.x = 99;
  expect(original.context!.fighters[0]!.traits!.risk).toBe(.5);
  expect(original.segments[0]!.exchanges.samples[0]!.contacts.length).toBeGreaterThan(0);
  expect(original.outcomes[0]!.event.impulse.x).toBe(1);
});

test('rejects corrupt nested action, event, insight, segment and exchange payloads', () => {
  const report = reportFixture();
  const corruptions = [
    { ...report, choices: [{ ...report.choices[0], action: { ...report.choices[0]!.action, input: { fighterId: 'a', guardFresh: 1 } } }] },
    { ...report, choices: [{ ...report.choices[0], action: { ...report.choices[0]!.action, direction: { x: 0, y: NaN, z: 0 } } }] },
    ...['counter', 'armored', 'defenseReason', 'kind', 'baseImpulse', 'hitstunFrames'].map(key => ({ ...report, outcomes: [{ ...report.outcomes[0], event: { ...report.outcomes[0]!.event, [key]: key === 'hitstunFrames' ? Infinity : 'invalid' } }] })),
    { ...report, insights: { ...report.insights, attackDroughts: [{ fighter: 'a', startFrame: 0, endFrame: 200, frames: 200, open: true, reasons: { idle: '200' } }] } },
    { ...report, segments: [{ ...report.segments[0], context: { ...report.context, fighters: [{ id: 'a', type: 'ai', traits: { risk: Infinity } }] } }] },
    { ...report, segments: [{ ...report.segments[0], exchanges: { ...report.exchanges, samples: [{ ...report.segments[0]!.exchanges.samples[0], contacts: [{ eventId: 'e', frame: 1, moveId: 'jab', damage: '8' }] }] } }] },
    { ...report, exchanges: { ...report.exchanges, coverage: { ...report.exchanges.coverage, duplicateEvents: false } } },
  ];
  for (const corrupt of corruptions) expect(() => readCombatAiOutcomeReport3D(corrupt)).toThrow();
});

test('optional absence and extension evidence survive the reader unchanged', () => {
  const empty = { ...createCombatAiOutcomes().report(), extension: { detail: [1, false] } };
  expect(readCombatAiOutcomeReport3D(empty)).toEqual(empty);
  expect(Object.hasOwn(readCombatAiOutcomeReport3D(empty), 'context')).toBe(false);
});

test('every present primitive in the real full report rejects a wrong nested type', () => {
  const report = reportFixture();let checked = 0;
  for (const corrupt of corruptStructuralLeaves(report)) { expect(() => readCombatAiOutcomeReport3D(corrupt.value), corrupt.path).toThrow();checked++; }
  expect(checked).toBeGreaterThan(250);
});
