import { createCombatRecording } from '@hyperfocus/engine/combat/net';
import type { ConfirmedCombatFrames } from '@hyperfocus/engine/server';

/** Local host retention. Recording limits never alter fighter input acceptance. */
export function createLocalCombatRecordings(options: { maxRooms?: number; maxFrames?: number } = {}) {
  const maxRooms = options.maxRooms ?? 8, maxFrames = options.maxFrames ?? 36000;
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 32) throw new Error('Recording room limit must be from 1 to 32.');
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 36000) throw new Error('Local recording frame limit must be from 1 to 36000.');
  const rooms = new Map<string, { recording: ReturnType<typeof createCombatRecording>; stoppedReason: string }>();
  return {
    accept(batch: ConfirmedCombatFrames) {
      let room = rooms.get(batch.roomId);
      if (!room) {
        if (rooms.size >= maxRooms) return;
        room = { recording: createCombatRecording({ matchId: batch.matchId, contentId: batch.contentId, seed: batch.seed, seats: batch.seats, maxFrames }), stoppedReason: '' };
        rooms.set(batch.roomId, room);
      }
      if (room.stoppedReason) return;
      try {
        for (let index = 0; index < batch.frames.length; index += 2) room.recording.append({ frames: batch.frames.slice(index, index + 2) });
      } catch (cause) { room.stoppedReason = cause instanceof Error ? cause.message : 'Recording stopped.'; }
    },
    list() { return [...rooms].map(([roomId, room]) => ({ roomId, frames: room.recording.frameCount, stoppedReason: room.stoppedReason })); },
    read(roomId: string) { const room = rooms.get(roomId);return room && { recording: room.recording.snapshot(), stoppedReason: room.stoppedReason }; },
  };
}
