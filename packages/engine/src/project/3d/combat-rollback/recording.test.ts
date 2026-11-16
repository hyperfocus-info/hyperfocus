import { expect, test } from 'bun:test';
import { createSessionRecording } from './recording.ts';

const match = { matchId: 'fight', contentId: 'v1', seed: 7, seats: ['a', 'b'] };
const pair = (frame: number) => [0, 1].map(seat => ({ matchId: 'fight', frame, seat, actions: ['guard'], direction: { x: 0, y: 0, z: 0 } }));

test('session archive includes only confirmed pairs and ignores duplicate snapshots', () => {
  const recording = createSessionRecording(match);
  recording.receive({ confirmedFrame: -1, frames: pair(0) });expect(recording.status.frames).toBe(0);
  recording.receive({ confirmedFrame: 0, frames: [...pair(0), ...pair(1)] });expect(recording.status.frames).toBe(1);
  recording.receive({ confirmedFrame: 0, frames: pair(0) });expect(recording.status.frames).toBe(1);
  recording.receive({ confirmedFrame: 1, frames: pair(1) });expect(recording.status).toEqual({ frames: 2, stoppedReason: '' });
  const saved = recording.snapshot();saved.frames[0]![0].actions.length = 0;expect(recording.snapshot().frames[0]![0].actions).toEqual(['guard']);
});

test('missing history preserves a valid prefix and stops instead of fabricating inputs', () => {
  const recording = createSessionRecording(match);recording.receive({ confirmedFrame: 2, frames: [...pair(0), ...pair(2)] });
  expect(recording.status.frames).toBe(1);expect(recording.status.stoppedReason).toContain('history is missing');
  recording.receive({ confirmedFrame: 2, frames: [...pair(1), ...pair(2)] });expect(recording.status.frames).toBe(1);
});

test('capacity and invalid confirmation stop recording without throwing or evicting history', () => {
  const recording = createSessionRecording({ ...match, maxFrames: 1 });
  expect(() => recording.receive({ confirmedFrame: 1, frames: [...pair(0), ...pair(1)] })).not.toThrow();
  expect(recording.status.frames).toBe(1);expect(recording.status.stoppedReason).toContain('limit');
  const invalid = createSessionRecording(match);invalid.receive({ confirmedFrame: Infinity, frames: [] });expect(invalid.status.stoppedReason).toContain('invalid confirmed');
});
