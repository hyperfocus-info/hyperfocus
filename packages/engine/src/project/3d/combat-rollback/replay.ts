import { readCombatRecording } from '../../../combat/net/replay.ts';
import { readCombatRoomInput } from '../../../combat/net/input.ts';
import type { CombatRoomInput } from '../../../combat/net/protocol.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { combatInputActions3D } from '../combat-fighter-inputs.ts';
import { createGameplay3D, type GameplayProject3D } from '../gameplay.ts';

type Intent = Pick<CombatRoomInput, 'actions' | 'direction'>;
const neutral = (): Intent => ({ actions: [], direction: { x: 0, y: 0, z: 0 } });

/** Playback and local counterfactual practice share the ordinary independent-input adapter. */
export function createCombatReplay3D(options: {
  project: GameplayProject3D; runtime: Hyperfocus3DRuntime; recording: unknown; contentId: string;
}) {
  const recording = readCombatRecording({ value: options.recording });
  const definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (recording.contentId !== options.contentId) throw new Error('Replay requires the same game content and runtime version.');
  if (definition?.fighters.length !== 2 || options.runtime.snapshot().tick !== 0) throw new Error('Replay requires a fresh two-fighter runtime.');
  const allowed = new Set(combatInputActions3D({ definition, rematch: recording.mode !== 'training' }));
  for (const pair of recording.frames) for (const input of pair) if (input.actions.some(action => !allowed.has(action))) throw new Error('Replay contains an unauthored action.');
  const game = createGameplay3D({ project: options.project, runtime: options.runtime, independentCombatInputs: true, externalCombatMatch: true, externalCombatMode: recording.mode, combatQueueSeed: recording.seed });
  const initial = game.checkpoint();
  let frame = 0, controlled: 0 | 1 | undefined;
  function step(input?: Intent) {
    if (controlled === undefined && frame >= recording.frames.length) return false;
    const pair: Intent[] = recording.frames[frame]?.map(value => ({ actions: value.actions, direction: value.direction })) ?? [neutral(), neutral()];
    if (controlled !== undefined) {
      const intent = readCombatRoomInput({ ...(input ?? neutral()), matchId: recording.matchId, frame });
      if (intent.actions.some(action => !allowed.has(action))) throw new Error('Takeover contains an unauthored action.');
      pair[controlled] = intent;
    }
    const requests = pair.flatMap((value, seat) => value.actions.includes('match:rematch') ? [`match:rematch:${seat}`] : []);
    game.step(requests, pair.map(value => ({ actions: new Set(value.actions.filter(action => action !== 'match:rematch')), direction: value.direction })));
    frame++;return true;
  }
  return {
    game,
    get frame() { return frame; },
    get length() { return recording.frames.length; },
    get controlledSeat() { return controlled; },
    get ended() { return controlled === undefined && frame >= recording.frames.length; },
    tick: step,
    /** Exact seek from the initial solver checkpoint. Hosts should schedule long seeks off the interactive path. */
    seek(options: { frame: number }) {
      if (!Number.isSafeInteger(options.frame) || options.frame < 0 || options.frame > recording.frames.length) throw new Error('Replay seek is outside the recorded frames.');
      initial.restore();frame = 0;controlled = undefined;
      while (frame < options.frame) { step();game.drainAudio(); }
      return game.snapshot();
    },
    takeOver(options: { seat: 0 | 1 }) {
      if (options.seat !== 0 && options.seat !== 1) throw new Error('Takeover requires fighter seat zero or one.');
      controlled = options.seat;
    },
  };
}
