import type { CombatRoomInput, CombatRoomSnapshot } from '../../../combat/net/protocol.ts';
import { readCombatRoomInput } from '../../../combat/net/input.ts';
import { createCombatRollbackSession } from '../../../runtime/combat-rollback/session.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import { readCombatProject3D } from '../combat-declaration.ts';
import { createGameplay3D, type GameplayProject3D } from '../gameplay.ts';
import type { GameplayAudio3D } from '../gameplay-contracts.ts';
import type { CombatMatchSnapshot3D } from '../combat-match/index.ts';
import { createSessionRecording } from './recording.ts';
import { combatInputActions3D } from '../combat-fighter-inputs.ts';

type ConfirmedOutput = { kind: 'audio'; value: GameplayAudio3D } | { kind: 'match'; value: CombatMatchSnapshot3D };

/** One admitted bout. The transport authenticates roster slots; the host owns room UI. */
export function createNetworkCombatSession(options: {
  project: GameplayProject3D; runtime: Hyperfocus3DRuntime; mode?: 'set' | 'training';
  match: Pick<CombatRoomSnapshot, 'matchId' | 'contentId' | 'seed' | 'seats'>;
  contentId: string; localPeerId: string;
  getLocalInput(): Pick<CombatRoomInput, 'actions' | 'direction'>;
  sendInput(input: CombatRoomInput): void;
  onConfirmedAudio?(cue: { frame: number; id: string; event: GameplayAudio3D }): void;
  onConfirmedMatch?(update: { frame: number; id: string; event: CombatMatchSnapshot3D }): void;
  maxRollbackFrames?: number;
}) {
  const match = structuredClone(options.match), definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (!match.matchId || match.matchId.length > 96 || !match.contentId || !Number.isSafeInteger(match.seed) || match.seed < 0 || match.seed > 0xffffffff
    || match.contentId !== options.contentId || match.seats.length !== 2 || new Set(match.seats).size !== 2 || match.seats.some(peer => !peer)
    || !match.seats.includes(options.localPeerId) || definition?.fighters.length !== 2) throw new Error('Combat session requires matching content and two assigned fighters.');
  if (options.runtime.snapshot().tick !== 0) throw new Error('Network combat needs a fresh runtime before frame zero.');
  const allowed = new Set(combatInputActions3D({ definition, rematch: options.mode !== 'training' }));
  const game = createGameplay3D({ project: options.project, runtime: options.runtime, independentCombatInputs: true, externalCombatMatch: true, externalCombatMode: options.mode, combatQueueSeed: match.seed });
  const sent = new Map<number, CombatRoomInput>();
  const acknowledged = new Set<number>();
  let hostConfirmed = -1;
  const recording = createSessionRecording({ ...match, mode: options.mode });
  let status: 'running' | 'waiting-for-input' | 'recovering' | 'interrupted' | 'desynced' = 'running';
  let reason = '';
  let confirmedMatch: CombatMatchSnapshot3D | undefined;
  const checked = (input: CombatRoomInput) => {
    const value = readCombatRoomInput(input);
    if (value.matchId !== match.matchId || value.actions.some(action => !allowed.has(action))) throw new Error('Combat input does not belong to this match.');
    return value;
  };
  const loop = createCombatRollbackSession<Pick<CombatRoomInput, 'actions' | 'direction'>, ConfirmedOutput>({
    peerIds: match.seats, localPeerId: options.localPeerId,
    defaultInput: { actions: [], direction: { x: 0, y: 0, z: 0 } }, maxRollbackFrames: options.maxRollbackFrames,
    participants: [{ id: 'gameplay', checkpoint: game.checkpoint }],
    getLocalInput() {
      const value: CombatRoomInput = sent.get(loop.frame()) ?? checked({ ...options.getLocalInput(), matchId: match.matchId, frame: loop.frame() });
      sent.set(value.frame, value);options.sendInput(structuredClone(value));
      return { actions: value.actions, direction: value.direction };
    },
    update({ inputs, emit }) {
      const requests = match.seats.flatMap((peer, seat) => inputs[peer]!.actions.includes('match:rematch') ? [`match:rematch:${seat}`] : []);
      const state = game.step(requests, match.seats.map(peer => ({ actions: new Set(inputs[peer]!.actions.filter(action => action !== 'match:rematch')), direction: inputs[peer]!.direction })));
      for (const [index, cue] of game.drainAudio().entries()) emit(`audio:${index}`, { kind: 'audio', value: cue });
      if (state.combat?.match) emit('match', { kind: 'match', value: state.combat.match });
    },
    onConfirmedEvent(cue) {
      if (cue.event.kind === 'audio') options.onConfirmedAudio?.({ ...cue, event: cue.event.value });
      else { confirmedMatch = structuredClone(cue.event.value);options.onConfirmedMatch?.({ ...cue, event: structuredClone(confirmedMatch) }); }
    },
    onDesync() { status = 'desynced';reason = 'Confirmed combat state differs between peers.'; },
  });
  return {
    game,
    exportRecording: recording.snapshot,
    get recordingStatus() { return recording.status; },
    /** Only fully confirmed phase, score and votes may drive irreversible result UI. */
    get confirmedMatch() { return confirmedMatch && structuredClone(confirmedMatch); },
    get status() { return { status, reason }; },
    frame: loop.frame,
    confirmedFrame: loop.confirmedFrame,
    stateHash: loop.stateHash,
    compareStateHash: loop.compareStateHash,
    tick() {
      if (status === 'interrupted' || status === 'desynced' || status === 'recovering') return false;
      try { loop.tick();status = 'running';reason = ''; }
      catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('rollback history exhausted:')) throw error;
        status = 'waiting-for-input';reason = 'Waiting for the other fighter’s inputs.';return false;
      }
      for (const frame of sent.keys()) if (frame < Math.min(hostConfirmed, loop.confirmedFrame()) - (options.maxRollbackFrames ?? 120)) { sent.delete(frame);acknowledged.delete(frame); }
      return true;
    },
    receive(snapshot: CombatRoomSnapshot) {
      if (snapshot.matchId !== match.matchId || snapshot.contentId !== match.contentId || snapshot.seed !== match.seed
        || JSON.stringify(snapshot.seats) !== JSON.stringify(match.seats)) throw new Error('Combat room configuration changed during the bout.');
      if (snapshot.status !== 'ready' && snapshot.status !== 'recovering') { status = 'interrupted';reason = 'The room interrupted this bout.';return; }
      const accepted = Object.values(snapshot.frames).sort((a, b) => a.frame - b.frame || a.seat - b.seat).map(frame => {
        const value = checked(frame), peer = match.seats[frame.seat];
        if (!Number.isInteger(frame.seat) || !peer) throw new Error('Combat frame has an unassigned seat.');
        if (peer === options.localPeerId) {
          const local = sent.get(value.frame);
          if (local && JSON.stringify(local) !== JSON.stringify(value)) throw new Error('Server changed an already submitted combat input.');
        }
        return { value, peer, seat: frame.seat };
      });
      recording.receive({ confirmedFrame: snapshot.confirmedFrame, frames: accepted.map(({ value, seat }) => ({ ...value, seat })) });
      for (const { value, peer } of accepted) if (peer !== options.localPeerId) loop.receiveInput(peer, value.frame, { actions: value.actions, direction: value.direction });
      hostConfirmed = Math.max(hostConfirmed, snapshot.confirmedFrame);
      for (const { value, peer } of accepted) if (peer === options.localPeerId) acknowledged.add(value.frame);
      if (status !== 'interrupted' && status !== 'desynced') {
        status = snapshot.status === 'recovering' ? 'recovering' : 'running';
        reason = status === 'recovering' ? 'Waiting for the fighter to reconnect.' : '';
      }
    },
    /** Retry immutable sampled inputs only after receiving the resumed host snapshot. */
    resendPendingInputs() {
      if (status === 'recovering' || status === 'interrupted' || status === 'desynced') return 0;
      let count = 0;
      for (const [frame, input] of sent) if (frame > hostConfirmed && !acknowledged.has(frame)) { options.sendInput(structuredClone(input));count++; }
      return count;
    },
    interrupt(message: string) { status = 'interrupted';reason = message; },
  };
}
