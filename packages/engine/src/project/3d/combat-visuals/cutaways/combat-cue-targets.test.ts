import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { appendCombatCueTargets } from './combat-cue-targets.ts';

type Entity = Hyperfocus3DEvaluatedFrame['entities'][number];

test('cue bounds use the portable norm at the four-metre boundary and retain rotated scale bounds', () => {
  const root: Entity = { id: 'fighter', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true };
  const cue: Entity = { ...root, id: 'fighter:guard', position: [0, 0, 4], scale: [.3, .4, 0] };
  const targets: [number, number, number][] = [];
  appendCombatCueTargets(targets, [cue], [0], [root]);
  expect(targets).toHaveLength(9);
  expect(targets[0]).toEqual([0, 0, 4]);
  expect(targets[1]).toEqual([-.5, -.5, 3.5]);
  expect(targets[8]).toEqual([.5, .5, 4.5]);
  cue.position[2] = 4.000000000001;targets.length = 0;
  appendCombatCueTargets(targets, [cue], [0], [root]);
  expect(targets).toEqual([]);
});

test('cue bounds exclude inactive, other-actor and remote cues and cap extreme finite scales', () => {
  const root: Entity = { id: 'fighter', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true };
  const cues: Entity[] = [
    { ...root, id: 'fighter:guard', scale: [1e308, 1e308, 1e308] },
    { ...root, id: 'fighter:inactive', position: [-4, 0, 0], visible: false },
    { ...root, id: 'fighter-other:guard', position: [4, 0, 0] },
    { ...root, id: 'fighter:remote', position: [1e308, 1e308, 1e308] },
  ];
  const targets: [number, number, number][] = [];
  appendCombatCueTargets(targets, cues, [0, 1, 2, 3], [root]);
  expect(targets).toHaveLength(9);
  expect(targets[0]).toEqual([0, 0, 0]);
  expect(targets[1]).toEqual([-1.5, -1.5, -1.5]);
  expect(targets[8]).toEqual([1.5, 1.5, 1.5]);
});
