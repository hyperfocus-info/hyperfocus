import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { CombatEvent, CombatInput } from '../../../combat/state.ts';
import { createDefenseFeedback3D } from './defense-feedback.ts';
import { createSaveProfile, exportSaveProfile, withSaveSlot } from '../../../save/index.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const feedback = createDefenseFeedback3D({ fighterIds: ['a'], config });
  const step = (frame: number, input: Partial<CombatInput> = {}, kind?: CombatEvent['kind']) => {
    state.frame = frame;
    const events: CombatEvent[] = kind ? [{ id: `${frame}`, frame, attackerId: 'b', targetId: 'a', moveId: 'jab', kind, damage: 0, impulse: { x: 0, y: 0, z: 0 } }] : [];
    feedback.step({ before: state, after: state, inputs: [{ fighterId: 'a', ...input }], events });
    return feedback.capture()[0]?.cue;
  };
  return { feedback, config, state, step };
}

test('vehicle contact does not falsely teach a late parry against traffic', () => {
  const { feedback, state, step } = fixture();state.frame = 50;
  feedback.step({ before: state, after: state, inputs: [{ fighterId: 'a' }], events: [{ id: 'car-hit', frame: 50, attackerId: 'car', environmentId: 'car', targetId: 'a', moveId: 'heavy', kind: 'hit', damage: 20, impulse: { x: 8, y: 0, z: 0 }, defenseReason: 'traffic-impact' }] });
  state.fighters[0]!.stunKind = 'hit';state.fighters[0]!.stunFrames = 20;
  expect(step(52, { guard: true })).toBeUndefined();
});

test('parry timing distinguishes early press, held shield, actual parry and late press after contact', () => {
  const { step, config, state, feedback } = fixture();
  step(0, { guard: true });
  expect(step(config.parryFrames, { guard: true }, 'block')).toMatchObject({ action: 'parry', result: 'early' });
  feedback.reset();step(0, { guard: true });
  expect(step(40, { guard: true }, 'block')).toBeUndefined();
  expect(step(41, {}, 'parry')).toMatchObject({ action: 'parry', result: 'perfect' });
  feedback.reset();step(50, {}, 'hit');state.fighters[0]!.stunKind = 'hit';state.fighters[0]!.stunFrames = 10;
  expect(step(52, { guard: true })).toMatchObject({ action: 'parry', result: 'late' });
});

test('tech timing reports expired attempts or post-bounce attempts, not unattended collisions', () => {
  const { step, state, feedback, config } = fixture();
  state.fighters[0]!.stunKind = 'hit';
  expect(step(0, {}, 'bounce')).toBeUndefined();
  expect(step(2, { tech: true })).toMatchObject({ action: 'tech', result: 'late' });
  feedback.reset();step(0, { tech: true });
  expect(step(config.techWindowFrames! + 1, {}, 'bounce')).toMatchObject({ action: 'tech', result: 'early' });
  expect(step(10, {}, 'tech')).toMatchObject({ action: 'tech', result: 'perfect' });
});

test('feedback expires, survives saves, and never diagnoses a guard attempted during attack commitment', () => {
  const { step, state, feedback } = fixture();
  state.fighters[0]!.moveId = 'heavy';step(0, {}, 'hit');state.fighters[0]!.stunKind = 'hit';
  expect(step(1, { guard: true })).toBeUndefined();
  step(2, {}, 'tech');const saved = feedback.capture();feedback.reset();feedback.restore(feedback.validate(saved));
  expect(feedback.capture()).toEqual(saved);expect(step(45)).toBeUndefined();
  expect(() => feedback.validate([{ ...saved[0], techAt: NaN }])).toThrow();
});

test('late wall tech retains the collision anchor through movement and save restore', () => {
  const { state, feedback } = fixture();state.frame = 10;state.fighters[0]!.stunKind = 'hit';
  const point = { x: 4, y: 3, z: 2 };
  feedback.step({ before: state, after: state, inputs: [], events: [{ id: 'wall', frame: 10, attackerId: 'a', targetId: 'a', kind: 'bounce', moveId: '', damage: 0, impulse: { x: -3, y: 1, z: 0 }, contactPoint: point, contactNormal: { x: -1, y: 0, z: 0 } }] });
  point.x = 100;state.frame = 12;state.fighters[0]!.position.x = 7;
  feedback.restore(feedback.validate(feedback.capture()));
  feedback.step({ before: state, after: state, inputs: [{ fighterId: 'a', tech: true }], events: [] });
  expect(feedback.capture()[0]!.cue).toMatchObject({ action: 'tech', result: 'late', contactPoint: { x: 4, y: 3, z: 2 }, contactNormal: { x: -1, y: 0, z: 0 } });
  const invalid = feedback.capture();invalid[0]!.cue!.contactPoint!.x = NaN;
  expect(() => feedback.validate(invalid)).toThrow();
});

test('rejected tech lockout presses never move accepted timing or overwrite its ring', () => {
  const { step, state, feedback, config } = fixture();state.fighters[0]!.stunKind = 'hit';
  step(0, { tech: true });step(1);
  state.fighters[0]!.techLockoutFrames = 12;
  const impact = config.techWindowFrames!;step(impact, {}, 'bounce');const cue = feedback.capture()[0]!.cue;expect(cue?.result).toBe('early');
  step(impact + 1, { tech: true });
  expect(feedback.capture()[0]).toMatchObject({ techAt: 0, cue, lastAttempt: { fighterId: 'a', kind: 'tech', inputFrame: impact + 1, timing: 'unavailable' } });
  state.fighters[0]!.techLockoutFrames = 1;step(impact + 2);step(impact + 3, { tech: true });
  expect(feedback.capture()[0]).toMatchObject({ techAt: impact + 3, lastAttempt: { inputFrame: impact + 3, impactFrame: impact, timing: 'late' } });
});

test('Practice timing samples preserve exact press/contact frames and validate old saves', () => {
  const { step, feedback, config } = fixture();
  step(3, { guard: true });step(3 + config.parryFrames, { guard: true }, 'block');
  expect(feedback.capture()[0]!.lastAttempt).toEqual({ fighterId: 'a', kind: 'parry', inputFrame: 3, impactFrame: 3 + config.parryFrames, timing: 'early' });
  const old = feedback.capture();delete old[0]!.lastAttempt;expect(feedback.validate(old)).toEqual(old);
  const invalid = feedback.capture();invalid[0]!.lastAttempt!.impactFrame = NaN;expect(() => feedback.validate(invalid)).toThrow();
});

test('optional collision anchors remain absent, not undefined, in strict public saves', async () => {
  const { feedback, state, step } = fixture();state.fighters[0]!.stunKind = 'hit';
  step(0, {}, 'bounce');step(2, { tech: true });
  expect(Object.hasOwn(feedback.capture()[0]!, 'bouncePoint')).toBe(false);
  const profile = withSaveSlot(createSaveProfile('combat', 'player', 0), 'practice', { defenseFeedback: feedback.capture() }, 0, 0);
  expect((await exportSaveProfile(profile)).byteLength).toBeGreaterThan(0);
});

test('guard pressed on the first recovered frame records legal timing after a whiff', () => {
  const config = createTouchOfDeathPreset();
  const jab = config.moves.find(move => move.id === 'jab')!;
  const recovered = jab.startupFrames + jab.activeFrames + jab.recoveryFrames;
  const impact = recovered + config.parryFrames;
  const heavyStart = impact - config.moves.find(move => move.id === 'heavy')!.startupFrames;
  const sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 2.3, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const feedback = createDefenseFeedback3D({ fighterIds: ['a', 'b'], config });
  for (let frame = 0; frame <= impact; frame++) {
    const before = sim.capture();
    const inputs = [{ fighterId: 'a', guard: frame >= recovered, pressed: frame === 0 ? ['jab'] : [] },
      { fighterId: 'b', pressed: frame === heavyStart ? ['heavy'] : [] }];
    const events = sim.step({ inputs });
    feedback.step({ before, after: sim.capture(), inputs, events });
    if (frame === recovered) expect(feedback.capture()[0]!.lastAttempt?.timing).not.toBe('unavailable');
    if (frame === impact) expect(events[0]?.kind).toBe('block');
  }
  expect(feedback.capture()[0]!.lastAttempt).toMatchObject({ inputFrame: recovered, impactFrame: impact, timing: 'early' });
});

test('guard becomes available on the frame real launcher hitstun expires', () => {
  const config = createTouchOfDeathPreset();
  const heavy = config.moves.find(move => move.id === 'heavy')!;
  const recovered = heavy.startupFrames + heavy.hitstunFrames;
  const sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 1.4, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const feedback = createDefenseFeedback3D({ fighterIds: ['a', 'b'], config });
  for (let frame = 0; frame <= recovered; frame++) {
    const before = sim.capture();
    const inputs = [{ fighterId: 'a', guard: frame === recovered }, { fighterId: 'b', pressed: frame === 0 ? ['heavy'] : [] }];
    const events = sim.step({ inputs });
    feedback.step({ before, after: sim.capture(), inputs, events });
  }
  expect(sim.capture().fighters[0]).toMatchObject({ health: 76, stunFrames: 0, guarding: true });
  expect(feedback.capture()[0]!.guardAt).toBe(recovered);
  expect(feedback.capture()[0]!.lastAttempt?.timing).not.toBe('unavailable');
});

test('parry recoil is unavailable until its final decrement, while block recoil permits a fresh guard', () => {
  for (const [stunKind, stunFrames, unavailable] of [['parry', 2, true], ['parry', 1, false], ['block', 20, false]] as const) {
    const { state, feedback, step } = fixture();
    Object.assign(state.fighters[0]!, { stunKind, stunFrames });
    step(0, { guard: true });
    expect(feedback.capture()[0]!.lastAttempt?.timing === 'unavailable').toBe(unavailable);
    expect(feedback.capture()[0]!.guardAt).toBe(unavailable ? -1000 : 0);
  }
});
