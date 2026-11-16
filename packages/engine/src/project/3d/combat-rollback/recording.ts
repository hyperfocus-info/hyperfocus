import { createCombatRecording } from '../../../combat/net/replay.ts';
import type { CombatRoomFrame, CombatRoomSnapshot } from '../../../combat/net/protocol.ts';

/** Optional archive failure never changes the live simulation. Only server-confirmed pairs enter the file. */
export function createSessionRecording(options: Pick<CombatRoomSnapshot, 'matchId' | 'contentId' | 'seed' | 'seats'> & { maxFrames?: number; mode?: 'set' | 'training' }) {
  const recording = createCombatRecording(options);
  let stoppedReason = '';
  return {
    get status() { return { frames: recording.frameCount, stoppedReason }; },
    snapshot: recording.snapshot,
    receive(options: { confirmedFrame: number; frames: readonly CombatRoomFrame[] }) {
      if (stoppedReason) return;
      if (!Number.isSafeInteger(options.confirmedFrame) || options.confirmedFrame < -1) { stoppedReason = 'Replay recording stopped: invalid confirmed frame.';return; }
      const frames = new Map(options.frames.map(frame => [`${frame.seat}:${frame.frame}`, frame]));
      while (recording.frameCount <= options.confirmedFrame) {
        const frame = recording.frameCount, first = frames.get(`0:${frame}`), second = frames.get(`1:${frame}`);
        if (!first || !second) { stoppedReason = 'Replay recording stopped: confirmed input history is missing.';return; }
        try { recording.append({ frames: [first, second] }); }
        catch (cause) { stoppedReason = `Replay recording stopped: ${cause instanceof Error ? cause.message : 'invalid input history'}`;return; }
      }
    },
  };
}
