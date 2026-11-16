import { expect, test } from 'bun:test';
import { movePlayBody, playCamera, sweepPlayBoxes } from './spatial.ts';
import type { PlayBox } from './contracts.ts';

const wall: PlayBox = { entityId: 'wall', center: [0, 2, -3], halfSize: [2, 2, .1] };
test('fast motor travel cannot tunnel through thin required surfaces', () => {
  const result = movePlayBody([0, 0, 0], [0, 0, -30], .3, 1.6, [wall]);expect(result.position[2]).toBeGreaterThan(-2.61);expect(result.position[2]).toBeLessThan(-2.59);
  const ground: PlayBox = { entityId: 'ground', center: [0, -.5, 0], halfSize: [10, .5, 10] };
  const fall = movePlayBody([0, 50, 0], [0, -100, 0], .3, 1.6, [ground]);expect(fall.grounded).toBe(true);expect(fall.position[1]).toBeCloseTo(0, 2);
});
test('camera retracts before authored obstruction and point rays include voxel edges', () => {
  const box: PlayBox = { entityId: 'camera-wall', center: [0, 2, 3], halfSize: [3, 2, .1] };
  const camera = playCamera([0, 0, 0], 0, .1, { distance: 6, height: 1.2, shoulder: 0, clearance: .2 }, [box]);expect(camera.position[2]).toBeLessThan(2.71);
  expect(sweepPlayBoxes([2, 1, 0], [2, 1, -10], [wall])?.entityId).toBe('wall');
});
