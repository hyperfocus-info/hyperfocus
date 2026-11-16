import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { combatLessonHint, initialCombatLesson, observeCombatLesson, validateCombatLesson } from './lesson.ts';

test('coerced lesson branches expose the declared string contract', () => {
  const input = { ...initialCombatLesson(), branch: ['side'] }, before = structuredClone(input);
  expect(validateCombatLesson(input).branch).toBe('side');expect(input).toEqual(before);
  for (const branch of ['side', 'upward', 'cashout'] as const) expect(validateCombatLesson({ ...initialCombatLesson(), branch }).branch).toBe(branch);
  for (const branch of [[], ['invented'], ['side', 'upward']]) expect(() => validateCombatLesson({ ...initialCombatLesson(), branch })).toThrow('Invalid combat lesson branch.');
  let calls = 0;const branch = { toString() { calls++;return 'side'; } };
  expect(validateCombatLesson({ ...initialCombatLesson(), branch }).branch).toBe('side');expect(calls).toBe(1);
  calls = 0;expect(() => validateCombatLesson({ ...initialCombatLesson(), stage: -1, branch })).toThrow('Invalid combat lesson.');expect(calls).toBe(0);
});

test('lesson branches follow visible surfaces and drift, and require the matching actual contact', () => {
  for (const branch of ['cashout', 'side', 'upward'] as const) {
    const config = createTouchOfDeathPreset(), lesson = initialCombatLesson();
    const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 4, z: 0 } }, { id: 'b', position: { x: 2, y: 5, z: 0 } }] }).capture();
    const player = state.fighters[0]!, target = state.fighters[1]!;
    const contact = (moveId: string, vertical = 0): CombatEvent => ({ id: String(player.attackSerial), frame: state.frame, attackerId: 'a', targetId: 'b', kind: 'hit', moveId, damage: 20, impulse: { x: 3, y: vertical, z: 0 } });
    const observe = (events: CombatEvent[]) => observeCombatLesson(lesson, state, events, [{ fighterId: 'a', direction: { x: 0, y: 0, z: 1 } }], 'a', new Set(), config, branch === 'cashout');
    player.attackSerial = 1;observe([contact('heavy', 10)]);expect(lesson.stage).toBe(1);
    target.stunKind = 'hit';target.stunFrames = 60;player.position.x = 1;target.position.z = branch === 'side' ? .5 : 0;
    player.attackSerial = 2;observe([contact('jab')]);expect(lesson.stage).toBe(2);expect(lesson.branch).toBe(branch);
    target.position.x += .5;player.attackSerial = 3;
    if (branch === 'cashout') { observe([contact('jab-toward-link')]);expect(lesson.stage).toBe(2); }
    if (branch === 'side') { observeCombatLesson(lesson, state, [contact('jab')], [], 'a', new Set(), config);expect(lesson.stage).toBe(2); }
    const move = branch === 'cashout' ? 'heavy-toward' : 'jab-toward-link';
    observe([contact(move)]);expect(lesson.stage).toBe(3);expect(lesson.learned).toBe(branch === 'cashout' ? 4 : branch === 'side' ? 2 : 1);
    expect(combatLessonHint(lesson)).toContain('1 / 3 routes');
    expect(validateCombatLesson(lesson)).toEqual(lesson);
  }
});

test('legacy lesson saves load, invalid branch rejects and drops preserve learned responses only', () => {
  const legacy = { stage: 1, x: 0, z: 0, serial: 1, move: 'heavy', retry: false };
  const lesson = validateCombatLesson(legacy);lesson.learned = 2;
  expect(() => validateCombatLesson({ ...lesson, branch: 'invented' })).toThrow('branch');
  const config = createTouchOfDeathPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] }).capture();
  observeCombatLesson(lesson, state, [], [], 'a', new Set(['a','b']), config);
  expect(lesson).toMatchObject({ stage: 0, retry: true, learned: 2 });
});

test('lesson accepts a fresh repeated Heavy when its real contact still fits the airborne branch', () => {
  const config = createTouchOfDeathPreset(), lesson = initialCombatLesson();
  const sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 3, z: 0 } },
    { id: 'b', position: { x: 1.4, y: 3, z: 0 } },
  ] });
  const move = config.moves.find(move => move.id === 'heavy')!;
  const duration = move.startupFrames + move.activeFrames + move.recoveryFrames;
  let contacts = 0;
  for (let frame = 0; frame <= duration * 2 + move.startupFrames; frame++) {
    // Portable hosts supply positions. These small continuous displacements
    // exercise lesson progress, not a claim of a complete rigid-physics route.
    const playerX = Math.min(.6, Math.max(0, frame - 30) * .02);
    const targetX = 1.4 + Math.min(.4, Math.max(0, frame - duration - move.startupFrames) * .02);
    const before = sim.capture();
    const inputs = [{ fighterId: 'a', airborne: true, pressed: frame % duration === 0 ? ['heavy'] : [] }];
    const events = sim.step({ inputs, poses: [
      { fighterId: 'a', position: { x: playerX, y: 3, z: 0 }, airborne: true },
      { fighterId: 'b', position: { x: targetX, y: 3, z: 0 }, airborne: true },
    ] });
    contacts += events.filter(event => event.kind === 'hit').length;
    observeCombatLesson(lesson, before, events, inputs, 'a', new Set(), config);
  }
  expect(contacts).toBe(3);
  expect(sim.capture().fighters[0]!.attackSerial).toBe(3);
  expect(sim.capture().fighters[1]!.health).toBe(28);
  expect(lesson).toMatchObject({ stage: 3, branch: 'upward', learned: 1 });
});

test('upward lesson hints teach a neutral jump before aiming the follow-up', () => {
  const lesson = { ...initialCombatLesson(), stage: 2 };
  expect(combatLessonHint(lesson)).toContain('release direction, then press Jump to jump upward. Then aim');
});

test('cashout hints teach the authored second Strike transition without promising safety', () => {
  const lesson = { ...initialCombatLesson(), stage: 2, branch: 'cashout' as const };
  expect(combatLessonHint(lesson)).toContain("link a second Strike during recovery, then toward + Heavy during the second Strike's recovery");
  expect(combatLessonHint(lesson)).toContain('a tech can end the conversion');
});
