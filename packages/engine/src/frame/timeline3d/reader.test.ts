import { expect, test } from 'bun:test';
import { sample3DFrame } from '../3d.ts';
import { frameDeclarationFixture3D, frameTimelineFixture3D } from '../../test-support/frame3d.ts';
import { timelineStructureFixture3D } from '../../test-support/timeline3d.ts';
import { corruptStructuralLeaves } from '../../test-support/structural-corruption.ts';
import { readHyperfocus3DTimeline } from './reader.ts';

test('complete frame contract including every physical cue round trips and detaches', () => {
  const source = timelineStructureFixture3D(), decoded = readHyperfocus3DTimeline(source);
  expect(decoded).toEqual(source);
  let checked = 0;
  for (const corrupt of corruptStructuralLeaves(source)) { expect(() => readHyperfocus3DTimeline(corrupt.value), corrupt.path).toThrow();checked++; }
  expect(checked).toBeGreaterThan(700);
  decoded.physicalPerformance!.simulation.ragdolls[0]!.initialPose.rotations = [99];
  expect(source.physicalPerformance!.simulation.ragdolls[0]!.initialPose.rotations).toEqual([0, 0, 0, 1]);
});

test('actual frame sampler output survives parsed timeline across all frames', () => {
  const source = frameTimelineFixture3D(), decoded = readHyperfocus3DTimeline(source), declaration = frameDeclarationFixture3D();
  for (let frame = 0; frame < 60; frame++) {
    const options = { declaration, viewport: { width: 640, height: 360 }, clock: { kind: 'video' as const, frameIndex: frame, fps: 30 } };
    expect(sample3DFrame({ ...options, timeline: decoded })).toEqual(sample3DFrame({ ...options, timeline: source }));
  }
  expect(Object.hasOwn(decoded, 'entityTracks')).toBe(false);
  expect(() => readHyperfocus3DTimeline({ version: 2, durationFrames: 10, tracks: [] })).toThrow();
});

test('ArrayLike physical data is detached and optional undefined/extensions remain present', () => {
  const source = timelineStructureFixture3D();
  source.physicalPerformance!.simulation.bodies![0]!.rotation = new Float32Array([0, 0, 0, 1]);
  source.physicalPerformance!.simulation.ragdolls[0]!.initialPose.rotations = { length: 4, 0: 0, 1: 0, 2: 0, 3: 1 };
  const decoded = readHyperfocus3DTimeline({ ...source, entityTracks: undefined, extension: { note: 'retained' } });
  expect(decoded.physicalPerformance!.simulation.bodies![0]!.rotation).toEqual([0, 0, 0, 1]);
  expect(decoded.physicalPerformance!.simulation.ragdolls[0]!.initialPose.rotations).toEqual([0, 0, 0, 1]);
  expect(decoded).toHaveProperty('entityTracks', undefined);expect(decoded).toHaveProperty('extension', { note: 'retained' });
  source.physicalPerformance!.simulation.bodies![0]!.rotation = [0, 0, 1];
  expect(() => readHyperfocus3DTimeline(source)).toThrow();
});
