import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { createCombatEnvironmentPresenter, presentCombatEnvironment } from './presentation.ts';
import type { CombatEnvironment } from './config.ts';

test.each([false, true])('a circuit wreck presents frozen heading and linked offsets without cumulative rotation (selected=%s)', selected => {
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, localProgress: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: [{ id: 'car', position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 2], visible: true }, { id: 'trim', position: [0, 2, 2], rotation: [0, 0, 0, 1], scale: [.1, .1, .1], visible: true }],
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 },
  };
  const definition: CombatEnvironment = { surfaces: [{ entityId: 'car', trigger: { kind: 'impact', minSpeed: 3 }, stopMotionIds: ['trim'] }] };
  const show = presenter(frame, definition, selected);
  const state: Parameters<typeof presentCombatEnvironment>[2] = { frame: 5, surfaces: [{ entityId: 'car', phase: 'removed' }], trace: [], vehicleStops: [{ entityId: 'car', position: [-2, 1, 42], rotationY: -1.5707963267948966, cause: 'impact', blockerId: '' }] };
  for (let n = 0; n < 3; n++) {
    show(frame, state);
    expect(frame.entities[1]!.position[0]).toBeCloseTo(-4, 6);expect(frame.entities[1]!.position[2]).toBeCloseTo(42, 6);
    expect(frame.entities[0]!.rotation[1]).toBeCloseTo(-.7071067811865475, 6);
  }
});

test.each([false, true])('warning, physical tool travel, removal and clue are visible and rewind without cumulative offsets (selected=%s)', selected => {
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, localProgress: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['floor', 'tool', 'warning', 'marking', 'clue', 'rubble', 'unrelated'].map(id => ({ id, position: [0, 7, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 },
  };
  const definition: CombatEnvironment = { surfaces: [{ entityId: 'floor', trigger: { kind: 'scheduled', warningFrame: 10, removeFrame: 30 }, toolIds: ['tool'], warningIds: ['warning'], hideIds: ['marking'], revealIds: ['clue'], debrisIds: ['rubble'] }] };
  const show = presenter(frame, definition, selected);
  const present = (phase: 'intact' | 'warning' | 'removed', tick: number) => show(frame, { frame: tick, surfaces: [{ entityId: 'floor', phase }], trace: phase === 'removed' ? [{ frame: 30, entityId: 'floor', kind: 'removed', cause: 'scheduled', actor: '', speed: 0 }] : [] });
  const entity = (id: string) => frame.entities.find(entity => entity.id === id)!;
  entity('floor').position = [0, 5, 0];entity('floor').scale = [3, .2, 3];
  entity('rubble').position = [2, .3, 1];entity('tool').scale = [.2, .5, .2];
  const untouched = structuredClone(entity('unrelated'));
  present('intact', 0);
  expect(entity('clue').visible).toBe(false);expect(entity('marking').visible).toBe(true);expect(entity('warning').visible).toBe(false);
  present('warning', 20);expect(entity('warning').visible).toBe(true);expect(entity('tool').position[1]).toBeCloseTo(6.25);
  present('warning', 20);expect(entity('tool').position[1]).toBeCloseTo(6.25);
  present('removed', 30);expect(entity('floor').visible).toBe(false);expect(entity('marking').visible).toBe(false);expect(entity('warning').visible).toBe(false);
  expect(entity('clue').visible).toBe(true);expect(entity('rubble').visible).toBe(true);expect(entity('tool').position[1]).toBeCloseTo(5.5);
  expect(entity('rubble').position).toEqual([0, 5, 0]);
  present('removed', 48);const middle = structuredClone(frame.entities);
  expect(entity('rubble').position[0]).toBeGreaterThan(0);expect(entity('rubble').position[0]).toBeLessThan(2);
  expect(entity('rubble').position[1]).toBeGreaterThan(.3);expect(entity('rubble').position[1]).toBeLessThan(5);
  expect(entity('tool').position[1]).toBeCloseTo(6.25);
  present('removed', 48);expect(frame.entities).toEqual(middle);
  present('removed', 100);expect(entity('rubble').position).toEqual([2, .3, 1]);expect(entity('tool').position[1]).toBe(7);
  present('removed', 48);expect(frame.entities).toEqual(middle);expect(entity('unrelated')).toEqual(untouched);
  present('intact', 0);expect(entity('floor').visible).toBe(true);expect(entity('clue').visible).toBe(false);expect(entity('tool').position[1]).toBe(7);
});

test.each([false, true])('impact fragments begin across the lost wall, spread outward, settle and replay exactly (selected=%s)', selected => {
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, localProgress: 0,
    camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['wall', 'piece-a', 'piece-b'].map(id => ({ id, position: [6, 3, 0], rotation: [0, 0, 0, 1], scale: [.2, 3, 3], visible: true })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 },
  };
  frame.entities[1]!.position = [8, .3, -1];frame.entities[2]!.position = [9, .4, 2];
  const resting = frame.entities.slice(1).map(entity => structuredClone(entity));
  const definition: CombatEnvironment = { surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: 8 }, debrisIds: ['piece-a', 'piece-b'] }] };
  const show = presenter(frame, definition, selected);
  const state = { frame: 100, surfaces: [{ entityId: 'wall', phase: 'removed' as const }], trace: [{ frame: 100, entityId: 'wall', kind: 'removed' as const, cause: 'impact' as const, actor: 'fighter', speed: 12 }] };
  const present = (tick: number) => { state.frame = tick;show(frame, state); };
  present(100);const start = structuredClone(frame.entities);
  expect(start[0]!.visible).toBe(false);
  for (const piece of start.slice(1)) { expect(piece.position[0]).toBe(6);expect(piece.position[1]).toBeGreaterThan(0);expect(piece.position[1]).toBeLessThan(6); }
  present(110);const middle = structuredClone(frame.entities);
  expect(middle[1]!.position[0]).toBeGreaterThan(6);expect(middle[1]!.position[0]).toBeLessThan(8);
  present(160);expect(frame.entities.slice(1)).toEqual(resting);
  present(110);expect(frame.entities).toEqual(middle);
  present(100);expect(frame.entities).toEqual(start);
  expect(state.trace).toEqual([{ frame: 100, entityId: 'wall', kind: 'removed', cause: 'impact', actor: 'fighter', speed: 12 }]);
  show(frame, { frame: 8, surfaces: [{ entityId: 'wall', phase: 'warning' }], trace: [{ frame: 8, entityId: 'wall', kind: 'warning', cause: 'impact', actor: 'fighter', speed: 2 }] });
  expect(frame.entities[0]!.visible).toBe(true);expect(frame.entities[0]!.position[1]).not.toBe(3);
  expect(frame.entities[1]!.scale[0]).toBeCloseTo(resting[0]!.scale[0] * .25);
  show(frame, { frame: 0, surfaces: [{ entityId: 'wall', phase: 'intact' }], trace: [] });
  expect(frame.entities[0]!.position).toEqual([6, 3, 0]);expect(frame.entities[1]!.visible).toBe(false);expect(frame.entities[1]!.scale).toEqual(resting[0]!.scale);
});


function presenter(frame: Hyperfocus3DEvaluatedFrame, definition: CombatEnvironment, selected: boolean) {
  return selected ? createCombatEnvironmentPresenter({ definition, entities: frame.entities })
    : (value: Hyperfocus3DEvaluatedFrame, state: Parameters<typeof presentCombatEnvironment>[2]) => presentCombatEnvironment(value, definition, state);
}


test('environment bindings borrow reordered and replaced records without copying unrelated positions', () => {
  const definition: CombatEnvironment = { surfaces: [{ entityId: 'wall', trigger: { kind: 'impact', minSpeed: 8 }, debrisIds: ['piece'] }] };
  let unrelatedReads = 0;
  const make = (): Hyperfocus3DEvaluatedFrame => ({
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0, localProgress: 0,
    camera: { position: [0, 0, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['wall', 'piece', ...Array.from({ length: 128 }, (_, index) => `scenery:${index}`)].map(id => ({
      id, get position(): [number, number, number] { if (id.startsWith('scenery:')) unrelatedReads++;return [2, 3, 0]; },
      set position(value: [number, number, number]) { Object.defineProperty(this, 'position', { value, writable: true, enumerable: true, configurable: true }); },
      rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true,
    })),
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 },
  });
  const present = createCombatEnvironmentPresenter({ definition, entities: make().entities });
  for (const mode of ['original', 'reordered', 'missing', 'restored']) {
    const frame = make();
    if (mode === 'reordered') frame.entities.reverse();
    if (mode === 'missing') frame.entities = frame.entities.filter(entity => entity.id !== 'piece');
    const control = structuredClone(frame), before = structuredClone(frame.entities.filter(entity => entity.id.startsWith('scenery:')));
    const state: Parameters<typeof presentCombatEnvironment>[2] = { frame: 4, surfaces: [{ entityId: 'wall', phase: 'warning' }], trace: [{ frame: 4, entityId: 'wall', kind: 'warning', cause: 'impact', actor: 'fighter', speed: 8 }] };
    unrelatedReads = 0;present(frame, state);expect(unrelatedReads).toBe(0);
    presentCombatEnvironment(control, definition, state);
    expect(frame).toEqual(control);
    expect(frame.entities.filter(entity => entity.id.startsWith('scenery:'))).toEqual(before);
  }
});
