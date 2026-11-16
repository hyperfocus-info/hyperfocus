import { expect, test } from 'bun:test';
import { createGameplay3D } from './gameplay.ts';
import { combatMotionFixture } from './combat-motion-fixture.ts';
import { createPresentationCaptureWork } from './presentation-capture.ts';

async function fixture() {
  const base = await combatMotionFixture();
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, interactions: { weapons: [] },
      environment: { surfaces: [{ entityId: 'floor', trigger: { kind: 'scheduled', warningFrame: 100, removeFrame: 200 } }] } } } };
  return { ...base, game: createGameplay3D({ project, runtime: base.runtime }) };
}
const entities = { entityIds: ['a', 'b'] };

test('shared capture preserves the complete detached composite and presentation history', async () => {
  const original = await fixture(), shared = await fixture(), ordinary = await fixture();
  for (let step = 0; step < 5; step++) {
    const actions = step === 1 ? ['a:jab'] : [];
    original.game.advance({ actions });shared.game.advance({ actions });ordinary.game.advance({ actions });
    const a = original.runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), b = shared.runtime.sampleFrame({ viewport: { width: 800, height: 600 } });
    const wa = createPresentationCaptureWork(), wb = createPresentationCaptureWork();
    const expected = original.game.presentAndReadPresentation(a, { ...entities, work: wa });
    const actual = shared.game.presentAndReadPresentation(b, { ...entities, capture: 'shared', work: wb });
    const c = ordinary.runtime.sampleFrame({ viewport: { width: 800, height: 600 } });ordinary.game.presentFrame(c);
    expect(expected).toEqual(ordinary.game.readPresentation(entities));expect(a).toEqual(c);
    expect(actual).toEqual(expected);expect(b).toEqual(a);
    expect(actual.combat).toEqual(shared.game.readPresentation(entities).combat);
    expect(wa).toMatchObject({ independentApplications: 1, compositeCaptures: 1, simulationCaptures: 2, interactionCaptures: 2,
      motionCaptures: 3, feedbackCaptures: 2, environmentCaptures: 2 });
    expect(wb).toMatchObject({ sharedApplications: 1, compositeCaptures: 1, simulationCaptures: 1, interactionCaptures: 1,
      motionCaptures: 1, feedbackCaptures: 1, environmentCaptures: 1 });
    expect(Object.keys(actual.combat!).sort()).toEqual(['defenseFeedback', 'environment', 'exchange', 'held', 'hitstop', 'influence', 'interactions', 'knockout', 'motion', 'practice', 'state'].sort());
    expect(shared.game.snapshot()).toEqual(original.game.snapshot());
    original.game.drainAudio();shared.game.drainAudio();ordinary.game.drainAudio();
  }
});

test('shared capture retains match, AI and independent-input fields without using them as a reduced snapshot', async () => {
  const { game, runtime } = await combatMotionFixture({ match: true, independentCombatInputs: true });
  const actual = game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...entities, capture: 'shared' });
  expect(actual).toEqual(game.readPresentation(entities));
  expect(actual.combat!.match).toBeDefined();expect(actual.combat!.ai).toBeDefined();expect(actual.combat!.fighterInputs).toHaveLength(2);
  expect(actual.combat!.state.configKey.length).toBeGreaterThan(0);
});

test.each(['stage', 'camera', 'presented'] as const)('arbitrary %s callback retains original present-then-read mutation semantics', async kind => {
  const { game, runtime } = await fixture(), before = game.snapshot().tick, work = createPresentationCaptureWork();
  let called = false;
  const mutate = () => { if (!called) { called = true;game.advance({ actions: ['a:jab'] }); } };
  const actual = game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...entities, capture: 'shared', work,
    presentation: kind === 'stage' ? { onPresentationStage: mutate } : kind === 'camera' ? { cameraTransform: mutate } : {},
    ...(kind === 'presented' ? { onPresented: mutate } : {}) });
  expect(called).toBe(true);expect(actual.tick).toBeGreaterThan(before);
  expect(actual).toEqual(game.readPresentation(entities));
  expect(work).toMatchObject({ callbackFallbacks: 1, independentApplications: 1, sharedApplications: 0, compositeCaptures: 1, simulationCaptures: 2 });
});

test('read-only observer boundaries, exception cleanup, and reentry guard preserve ownership', async () => {
  const { game, runtime } = await fixture(), order: string[] = [];
  const options = { ...entities, capture: 'shared' as const, observerContract: 'read-only' as const };
  const read = game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...options,
    presentation: { onPresentationStage: name => order.push(name), cameraTransform: () => order.push('camera') },
    onPresented: () => order.push('presented') });
  expect(order[0]).toBe('sharedCompositeCaptureMs');expect(order.at(-1)).toBe('presented');
  expect(order.indexOf('camera')).toBeLessThan(order.indexOf('obstructionsMs'));
  const retained = structuredClone(read);
  for (const boundary of ['sharedCompositeCaptureMs', 'obstructionsMs', 'presented']) {
    expect(() => game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...options,
      presentation: { onPresentationStage: stage => { if (stage === boundary) throw Error('observer failure'); } },
      onPresented: () => { if (boundary === 'presented') throw Error('observer failure'); } })).toThrow('observer failure');
    expect(game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options)).toEqual(game.readPresentation(entities));
  }
  expect(() => game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...options,
    onPresented: () => game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options) })).toThrow('cannot be reentered');
  expect(game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options)).toEqual(game.readPresentation(entities));
  game.advance({ actions: ['a:jab'] });game.drainAudio();expect(read).toEqual(retained);
  read.combat!.state.fighters[0]!.health = -1;read.combat!.motion.length = 0;read.combat!.environment!.surfaces.length = 0;
  expect(game.readPresentation(entities).combat!.state.fighters[0]!.health).not.toBe(-1);
  expect(game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options).combat!.motion.length).toBeGreaterThan(0);
});

test('equal-tick calls capture fresh state, selected read failures release the guard, and unsupported modes fall back', async () => {
  const { game, runtime } = await fixture();
  const options = { ...entities, capture: 'shared' as const };
  const a = game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options);
  const saved = game.snapshot();saved.combat!.held = ['a:guard'];game.restore(saved);
  const b = game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options);
  expect(a.tick).toBe(b.tick);expect(a.combat!.held).not.toEqual(b.combat!.held);
  expect(a.combat).not.toBe(b.combat);expect(a.combat!.state).not.toBe(b.combat!.state);
  expect(() => game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...options, entityIds: ['missing'] })).toThrow();
  expect(game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), options)).toEqual(game.readPresentation(entities));
  const invalid = { ...options };Object.assign(invalid, { capture: 'invalid' });
  expect(() => game.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), invalid)).toThrow('Unsupported');
  const empty = createGameplay3D({ runtime, project: { activeSceneId: 'empty', scenes: [{ id: 'empty', entities: [] }] } });
  const work = createPresentationCaptureWork();
  expect(empty.presentAndReadPresentation(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }), { ...options, work })).toEqual(empty.readPresentation(entities));
  expect(work).toMatchObject({ unsupportedFallbacks: 1, independentApplications: 1, compositeCaptures: 0 });
});
