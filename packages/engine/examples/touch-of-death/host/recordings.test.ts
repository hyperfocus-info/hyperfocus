import { expect, test } from 'bun:test';
import { createLocalCombatRecordings } from './recordings.ts';
import type { ConfirmedCombatFrames } from '@hyperfocus/engine/server';

function batch(frame: number, roomId = 'friends'): ConfirmedCombatFrames {
  return { roomId, matchId: 'set', contentId: 'combat-v2:test', seed: 7, seats: ['a', 'b'],
    frames: [0, 1].map(seat => ({ matchId: 'set', frame, seat, actions: [], direction: { x: 0, y: 0, z: 0 } })) };
}
test('local archive exposes detached confirmed records and stops explicitly at its bound', () => {
  const archive = createLocalCombatRecordings({ maxRooms: 1, maxFrames: 2 });
  archive.accept(batch(0));archive.accept(batch(1));archive.accept(batch(2));archive.accept(batch(3));
  expect(archive.list()).toEqual([{ roomId: 'friends', frames: 2, stoppedReason: 'Combat recording frame limit reached.' }]);
  const downloaded = archive.read('friends')!;downloaded.recording.frames[0]![0].actions.push('changed');
  expect(archive.read('friends')!.recording.frames[0]![0].actions).toEqual([]);
  archive.accept(batch(0, 'second'));expect(archive.read('second')).toBeUndefined();expect(archive.list()).toHaveLength(1);
  expect(archive.read('missing')).toBeUndefined();
});
test('invalid confirmed sequence stops recording without throwing into live combat', () => {
  const archive = createLocalCombatRecordings();
  expect(() => archive.accept(batch(1))).not.toThrow();
  expect(archive.list()[0]!.stoppedReason).toContain('contiguous');expect(archive.list()[0]!.frames).toBe(0);
});
