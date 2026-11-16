import { readCombatRoomInput } from '../../../combat/net/input.ts';
import type { CombatRoomFrame, CombatRoomSnapshot } from '../../../combat/net/protocol.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { combatInputActions3D } from '../combat-fighter-inputs.ts';
import type { CombatMatchSnapshot3D } from '../combat-match/index.ts';
import { createGameplay3D, type GameplayProject3D } from '../gameplay.ts';
import type { GameplayAudio3D } from '../gameplay-contracts.ts';
import { createSessionRecording } from './recording.ts';

/** Read-only playback of contiguous confirmed inputs. A missing pair never becomes a prediction. */
export function createNetworkCombatSpectator(options: {
  project: GameplayProject3D; runtime: Hyperfocus3DRuntime; mode?: 'set' | 'training';
  match: Pick<CombatRoomSnapshot, 'matchId' | 'contentId' | 'seed' | 'seats'>; contentId: string;
  onCursor: (cursor: { frame: number }) => void;
  onConfirmedAudio?: (cue: { frame: number; id: string; event: GameplayAudio3D }) => void;
}) {
  const match = structuredClone(options.match), recording = createSessionRecording({ ...match, mode: options.mode });
  const definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (match.contentId !== options.contentId || definition?.fighters.length !== 2) throw new Error('Spectating requires matching content and two fighters.');
  if (options.runtime.snapshot().tick !== 0) throw new Error('Spectating requires a fresh runtime.');
  const allowed = new Set(combatInputActions3D({ definition, rematch: options.mode !== 'training' }));
  const game = createGameplay3D({ project: options.project, runtime: options.runtime, independentCombatInputs: true, externalCombatMatch: true, externalCombatMode: options.mode, combatQueueSeed: match.seed });
  let pending = new Map<string, CombatRoomFrame>();
  let frame = 0, liveHead = -1, cursor = -1, interrupted = false, recovering = false, reason = '', received = false, catchingUp = false;
  let confirmedMatch: CombatMatchSnapshot3D | undefined;
  function request() { if (cursor !== frame) { cursor = frame;options.onCursor({ frame }); } }
  return {
    game,
    frame: () => frame,
    confirmedFrame: () => frame - 1,
    get framesBehind() { return Math.max(0, liveHead + 1 - frame); },
    get confirmedMatch() { return confirmedMatch && structuredClone(confirmedMatch); },
    get status() { return { status: interrupted ? 'interrupted' : recovering ? 'recovering' : catchingUp ? 'catching-up' : 'running', reason: interrupted ? reason : recovering ? 'Waiting for the fighter to reconnect.' : catchingUp ? 'Catching up to the bout…' : '' }; },
    exportRecording: recording.snapshot,
    get recordingStatus() { return recording.status; },
    receive(snapshot: CombatRoomSnapshot) {
      if (interrupted) return;
      if (snapshot.matchId !== match.matchId || snapshot.contentId !== match.contentId || snapshot.seed !== match.seed
        || JSON.stringify(snapshot.seats) !== JSON.stringify(match.seats)) throw new Error('Combat room configuration changed during spectating.');
      if (snapshot.status !== 'ready' && snapshot.status !== 'recovering') { interrupted = true;reason = snapshot.status === 'archive-ended' ? 'This room reached its viewing limit.' : 'The room interrupted this bout.';return; }
      if (!Number.isSafeInteger(snapshot.confirmedFrame) || snapshot.confirmedFrame < -1 || snapshot.confirmedFrame > 0x7ffffffe) throw new Error('Invalid confirmed spectator frame.');
      const values = Object.values(snapshot.frames);
      if (values.length > 512) throw new Error('Spectator input window is too large.');
      const next = new Map(pending);
      for (const value of values) {
        const input = readCombatRoomInput(value);
        if (input.matchId !== match.matchId || (value.seat !== 0 && value.seat !== 1)) throw new Error('Spectator input has an unassigned identity or seat.');
        if (input.actions.some(action => !allowed.has(action))) throw new Error('Spectator input contains an unauthored action.');
        if (input.frame > snapshot.confirmedFrame) throw new Error('Spectator input is not confirmed.');
        if (input.frame < frame) continue;
        if (input.frame >= frame + 256) throw new Error('Spectator input is outside the requested window.');
        const key = `${value.seat}:${input.frame}`, accepted = { ...input, seat: value.seat };
        if (next.has(key) && JSON.stringify(next.get(key)) !== JSON.stringify(accepted)) throw new Error('Spectator input conflicts with a confirmed frame.');
        next.set(key, accepted);
      }
      pending = next;liveHead = Math.max(liveHead, snapshot.confirmedFrame);recovering = snapshot.status === 'recovering';
      // Late joins replay silently. Ordinary packet batching stays audible; 200 ms of backlog resumes catchup.
      if ((!received && liveHead >= 1) || liveHead + 1 - frame > 12) catchingUp = true;
      received = true;request();
    },
    tick(tickOptions: { maxFrames?: number; shouldYield?: () => boolean } = {}) {
      const max = tickOptions.maxFrames ?? 1;
      if (!Number.isSafeInteger(max) || max < 1 || max > 120) throw new Error('Spectator tick budget must be between 1 and 120 frames.');
      if (interrupted) return false;
      const start = frame, historical = catchingUp || max > 1;
      while (frame <= liveHead && frame - start < max && !tickOptions.shouldYield?.()) {
        const first = pending.get(`0:${frame}`), second = pending.get(`1:${frame}`);
        if (!first || !second) break;
        const pair = [first, second];
        const requests = pair.flatMap((input, seat) => input.actions.includes('match:rematch') ? [`match:rematch:${seat}`] : []);
        const state = game.step(requests, pair.map(input => ({ actions: new Set(input.actions.filter(action => action !== 'match:rematch')), direction: input.direction })));
        confirmedMatch = state.combat?.match && structuredClone(state.combat.match);
        const audio = game.drainAudio();
        if (!historical) for (const [index, event] of audio.entries()) options.onConfirmedAudio?.({ frame, id: `audio:${index}`, event });
        recording.receive({ confirmedFrame: frame, frames: pair });
        pending.delete(`0:${frame}`);pending.delete(`1:${frame}`);frame++;
      }
      if (frame > liveHead) catchingUp = false;
      request();return frame > start;
    },
    resendCursor() { if (!interrupted) { cursor = frame;options.onCursor({ frame }); } },
    interrupt(message: string) { interrupted = true;reason = message; },
  };
}
