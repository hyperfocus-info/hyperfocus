import { expect, test } from 'bun:test';
import { createTargetRayQuery3D } from '../../../../physics/target-rays.ts';
import { anyTargetIntersects } from "../../../../physics/target-rays.ts";
import { createPartitionedTargetRayQuery3D } from './target-partitions.ts';
import { presentCombatObstructions3D, writeLocal } from '../obstructions.ts';
import { materialPreset3D } from '../../../../render/materials/3d-presets.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';

type Vec = [number, number, number];
type Box = { position: Vec; rotation: [number, number, number, number]; scale: Vec };

test('target partitions skip exact ray work for disjoint groups, preserving prefixes and order', () => {
  const eye: Vec = [0, 0, 10], aim: Vec = [0, 0, 0];
  const targets: Vec[] = Array.from({ length: 32 }, (_, index) => [index < 16 ? 8 : -8, (index % 4 - 1.5) * .01, 0]);
  const box: Box = { position: [-4, 0, 5], rotation: [0, 0, 0, 1], scale: [.1, .1, .1] };
  const local: Vec = [4, 0, 5], rays = createTargetRayQuery3D({ diagnostics: true });
  const partition = createPartitionedTargetRayQuery3D(eye, aim, targets, { diagnostics: true, query: rays.test });
  expect(partition.test(local, targets.length, box, 0)).toBe(true);
  expect(partition.work).toMatchObject({ builds: 1, groups: 2, preparedTargets: 32, referenceSlots: 32, planeBytes: 384,
    queries: 1, groupTests: 2, groupRejects: 1, rayGroups: 1, rayTargetsOffered: 16, fallbacks: 0 });
  expect(rays.work.targetTests).toBe(1);
  for (const count of [0, 1, 15, 16, 17, 31, 32]) expect(partition.test(local, count, box, 0)).toBe(anyTargetIntersects(local, targets, count, box, 0));
  expect(() => partition.test(local, 33, box, 0)).toThrow(RangeError);
  expect(() => partition.test(local, -1, box, 0)).toThrow(RangeError);
  expect(() => createPartitionedTargetRayQuery3D(eye, aim, targets, { groupSize: 0 })).toThrow(RangeError);
});

test('partition broadphase matches the unchanged oracle for moving, padded and large-coordinate boxes', () => {
  let seed = 0x17ba34;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 0x100000000;
  let rejects = 0;
  for (let scenario = 0; scenario < 240; scenario++) {
    const origin = scenario % 3 === 0 ? 1e7 : 0;
    const eye: Vec = [origin + random() * 50, random() * 8 + 2, random() * 50];
    const aim: Vec = [origin + random() * 40, random() * 5, random() * 40];
    const targets: Vec[] = Array.from({ length: 65 }, () => [aim[0] + random() * 12 - 6, aim[1] + random() * 6 - 3, aim[2] + random() * 12 - 6]);
    const partition = createPartitionedTargetRayQuery3D(eye, aim, targets, { diagnostics: true });
    for (let sample = 0; sample < 80; sample++) {
      const box: Box = { position: [origin + random() * 60 - 10, random() * 20 - 10, random() * 60 - 10],
        rotation: [0, 0, 0, sample % 2 ? 1 : -1], scale: [random() * 8, random() * 4, random() * 8] };
      if (sample % 7 === 0) {
        const target = targets[sample % targets.length]!, t = [0, .015, .5, .985, 1][sample % 5]!;
        box.position = [eye[0] + (target[0] - eye[0]) * t, eye[1] + (target[1] - eye[1]) * t, eye[2] + (target[2] - eye[2]) * t];
        box.scale = [0, 0, 0];
      }
      const local: Vec = [0, 0, 0];writeLocal(eye, box, local);
      const count = sample % 4 === 0 ? 23 : targets.length, padding = sample % 2 ? .35 : 0;
      expect(partition.test(local, count, box, padding)).toBe(anyTargetIntersects(local, targets, count, box, padding));
    }
    rejects += partition.work.groupRejects;
  }
  expect(rejects).toBeGreaterThan(1000);
});

test('rotated, nonfinite, signed-scale and mismatched-eye queries preserve the general fallback', () => {
  const eye: Vec = [0, 2, 10], aim: Vec = [0, 0, 0], targets: Vec[] = [[0, 0, 0], [1, 1, 0], [-1, 1, 0]];
  const partition = createPartitionedTargetRayQuery3D(eye, aim, targets, { diagnostics: true });
  const base: Box = { position: [0, 1, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const cases: Array<{ box: Box; padding: number; local?: Vec }> = [
    { box: { ...base, rotation: [0, .5, 0, Math.sqrt(.75)] }, padding: 0 },
    { box: { ...base, rotation: [0, 0, 0, Infinity] }, padding: 0 },
    { box: { ...base, scale: [-1, 1, 1] }, padding: 0 },
    { box: { ...base, scale: [NaN, 1, 1] }, padding: 0 },
    { box: { ...base, position: [Infinity, 1, 5] }, padding: 0 },
    { box: base, padding: -.5 }, { box: base, padding: Infinity },
    { box: base, padding: 0, local: [1, 2, 3] },
  ];
  for (const entry of cases) {
    const local: Vec = entry.local ?? [0, 0, 0];if (!entry.local) writeLocal(eye, entry.box, local);
    expect(partition.test(local, 3, entry.box, entry.padding)).toBe(anyTargetIntersects(local, targets, 3, entry.box, entry.padding));
  }
  expect(partition.work.fallbacks).toBe(cases.length);
  const sampleSets: Vec[][] = [[], [[0, 2, 11]], [[Infinity, 0, 0]], [[NaN, 0, 0]]];
  for (const samples of sampleSets) {
    const degenerate = createPartitionedTargetRayQuery3D(eye, eye, samples);
    const local: Vec = [0, 1, 5];
    expect(degenerate.test(local, samples.length, base, 0)).toBe(anyTargetIntersects(local, samples, samples.length, base, 0));
  }
});

test('selectable presentation keeps frames identical through topology, scale, visibility and resource changes', () => {
  const state = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [{ id: 'fighter', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const ids = ['tod:city:wall:a', 'tod:city:wall:b', 'tod:city:wall:c'];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 3, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ['fighter', ...ids].map((id, index) => ({ id, position: [index - 2, 1, index ? 5 : 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: ids.map(id => ({ id: `${id}:occlusion`, look: structuredClone(materialPreset3D('aged-iron').look) })),
    performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  const originalIds = new Map(ids.map(id => [id, `${id}:occlusion`])), candidateIds = new Map(originalIds);
  for (let step = 0; step < 24; step++) {
    const source = structuredClone(frame);
    source.entities[1]!.scale = [step % 3 + .1, 1, .1];source.entities[2]!.visible = step % 2 === 0;
    source.entities[3]!.rotation = step % 2 ? [0, .5, 0, Math.sqrt(.75)] : [0, 0, 0, 1];
    const look = source.materials[0]!.look;
    source.materials[0]!.look = { ...look, baseColor: [step / 24, look.baseColor[1], look.baseColor[2], look.baseColor[3]] };source.camera.position[0] = step / 2 - 6;
    if (step % 3) { source.entities.reverse();source.materials.reverse(); }
    if (step % 5 === 0) source.materials.pop();
    const candidate = structuredClone(source);
    let builds = 0;
    presentCombatObstructions3D({ frame: source, state, materialIds: originalIds });
    presentCombatObstructions3D({ frame: candidate, state, materialIds: candidateIds, targetRayStrategy: 'partitioned', onTargetPartitionWork(work) { builds += work.builds; } });
    expect(candidate).toEqual(source);expect(builds).toBe(1);
  }
  expect(() => Reflect.apply(presentCombatObstructions3D, undefined, [{ frame, state, targetRayStrategy: 'bad' }])).toThrow('Unsupported');
});
