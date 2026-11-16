import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { presentCombatVisuals3D } from '../../combat-visuals.ts';
import { createCombatVisualPresenter3D } from './primitive-presenter.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const state = createCombatSimulation({ config, fighters: ['one', 'two'].map((id, index) => ({ id, position: { x: index * 3, y: 1, z: 0 } })) }).capture();
  const parts = ['shadow', 'head', 'hair', 'face', 'belt', 'guard-shell', 'impact', 'armor', 'guard-meter', 'art:head',
    ...['left', 'right'].flatMap(side => ['hand', 'boot', 'thigh', 'shin', 'arm', 'forearm'].map(part => `${side}-${part}`)),
    ...['spark', 'trail', 'shield', 'influence', 'parry', 'dust'].flatMap(part => Array.from({ length: 24 }, (_, index) => `${part}:${index}`))];
  const ids = ['tod:city:street', ...Array.from({ length: 3420 }, (_, index) => `scenery:${index}`),
    ...state.fighters.flatMap(fighter => [fighter.id, ...parts.map(part => `${fighter.id}:${part}`)])];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'city', frameIndex: 5, timeSeconds: 0.08333333333333333, tick: 5, deterministicSeed: 0, localProgress: 0,
    camera: { position: [0, 4, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ids.map((id, index) => ({ id, position: [index % 3, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 },
  };
  return { config, state, frame };
}

test('bound fighter presentation preserves the complete frame through attacks, defense and topology changes', () => {
  const options = fixture();
  const present = createCombatVisualPresenter3D({ entities: options.frame.entities, fighterIds: ['one', 'two'] });
  for (const mode of ['travel', 'attack', 'guard', 'hit', 'removed', 'reordered', 'restored']) {
    const state = structuredClone(options.state), fighter = state.fighters[0]!;
    state.frame = 5;
    if (mode === 'attack') { fighter.moveId = options.config.moves[0]!.id;fighter.moveFrame = options.config.moves[0]!.startupFrames; }
    if (mode === 'guard') fighter.guarding = true;
    if (mode === 'hit') { fighter.stunFrames = 10;fighter.stunKind = 'hit'; }
    const control = structuredClone(options.frame);
    if (mode === 'removed') control.entities = control.entities.filter(entity => !entity.id.endsWith('head') && entity.id !== 'two');
    if (mode === 'reordered') control.entities.reverse();
    const candidate = structuredClone(control), before = structuredClone(state);
    const input = { ...options, state, velocities: new Map([['one', { x: 6, y: 0, z: 2 }]]), grounded: new Set(['one', 'two']), motion: [{ id: 'one', locked: false }],
      events: [{ id: 'impact', frame: 4, kind: 'hit' as const, attackerId: 'two', targetId: 'one', moveId: options.config.moves[0]!.id, damage: 20, impulse: { x: 1, y: 0, z: 0 } }] };
    presentCombatVisuals3D({ ...input, frame: control });present({ ...input, frame: candidate });
    expect(candidate).toEqual(control);expect(state).toEqual(before);
  }
});

test('steady authored fighter presentation reads only selected slots in the complete scene', () => {
  const options = fixture(), fighterIds = ['one', 'two'];
  const present = createCombatVisualPresenter3D({ entities: options.frame.entities, fighterIds });
  present(options);
  const frame = structuredClone(options.frame), previous = structuredClone(options.frame);
  const selected = frame.entities.filter(entity => entity.id === 'tod:city:street' || fighterIds.some(id => entity.id === id || entity.id.startsWith(`${id}:`))).length;
  let reads = 0;
  frame.entities = new Proxy(frame.entities, { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key, receiver);
  } });
  present({ ...options, frame });
  expect(reads).toBe(selected);expect(options.frame).toEqual(previous);
  expect(selected).toBeLessThan(400);
});

test('slot-planned primitive writers preserve poses, visibility, timing and topology transitions', () => {
  const options = fixture();
  const candidate = createCombatVisualPresenter3D({ entities: options.frame.entities, fighterIds: ['one', 'two'], lookupStrategy: 'slots', lookupDiagnostics: true });
  for (const mode of ['travel', 'attack', 'guard', 'broken', 'hit', 'tech', 'removed', 'reordered', 'restored']) {
    const state = structuredClone(options.state), fighter = state.fighters[0]!;
    state.frame = 5;
    if (mode === 'attack') { fighter.moveId = options.config.moves[0]!.id;fighter.moveFrame = options.config.moves[0]!.startupFrames; }
    if (mode === 'guard') fighter.guarding = true;
    if (mode === 'broken') fighter.guardBrokenFrames = 24;
    if (mode === 'hit') { fighter.stunFrames = 10;fighter.stunKind = 'hit'; }
    if (mode === 'tech') fighter.protectionFrames = 10;
    const control = structuredClone(options.frame);
    if (mode === 'removed') control.entities = control.entities.filter(entity => !entity.id.endsWith('left-hand') && !entity.id.endsWith(':shield:3') && entity.id !== 'two');
    if (mode === 'reordered') control.entities.reverse();
    const planned = structuredClone(control), before = structuredClone(state);
    const input = { ...options, state, velocities: new Map([['one', { x: 6, y: 1, z: 2 }]]), grounded: new Set(['one', 'two']), motion: [{ id: 'one', locked: false }],
      timingFeedback: [{ id: 'one', cue: { action: mode === 'tech' ? 'tech' as const : 'parry' as const, result: mode === 'hit' ? 'early' as const : 'perfect' as const, frame: 2, contactPoint: { x: 1, y: 2, z: 3 }, contactNormal: { x: 0, y: 1, z: 0 } } }],
      events: [{ id: 'impact', frame: 4, kind: 'hit' as const, attackerId: 'two', targetId: 'one', moveId: options.config.moves[0]!.id, damage: 20, impulse: { x: 1, y: 0, z: 0 } }] };
    presentCombatVisuals3D({ ...input, frame: control });candidate({ ...input, frame: planned });
    expect(planned).toEqual(control);expect(state).toEqual(before);
  }
});

test('steady primitive lookups replace linear searches with one checked slot per request', () => {
  const options = fixture(), fighterIds = ['one', 'two'];
  const linear = createCombatVisualPresenter3D({ entities: options.frame.entities, fighterIds, lookupStrategy: 'linear', lookupDiagnostics: true });
  const slots = createCombatVisualPresenter3D({ entities: options.frame.entities, fighterIds, lookupStrategy: 'slots', lookupDiagnostics: true });
  const control = structuredClone(options.frame), candidate = structuredClone(options.frame);
  linear({ ...options, frame: control });slots({ ...options, frame: candidate });
  expect(candidate).toEqual(control);
  const a = linear.readLookupWork()!, b = slots.readLookupWork()!;
  const selected = options.frame.entities.filter(entity => entity.id === 'tod:city:street' || fighterIds.some(id => entity.id === id || entity.id.startsWith(`${id}:`))).length;
  expect(a.requests).toBe(132);expect(b.requests).toBe(a.requests);
  expect(a.linearVisits).toBeGreaterThan(10000);expect(a.slotChecks).toBe(0);
  expect(b.linearVisits).toBe(0);expect(b.slotChecks).toBe(132);expect(b.indexBuilds).toBe(0);expect(b.indexVisits).toBe(0);
  expect(b.retainedIds).toBe(selected);expect(b.typedBytes).toBe(selected * 4);
  slots({ ...options, frame: structuredClone(options.frame) });expect(slots.readLookupWork()!.requests).toBe(132);
});
