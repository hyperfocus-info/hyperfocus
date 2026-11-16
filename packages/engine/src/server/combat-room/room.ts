import type { RoomType } from '../core/types.ts';
import { isObject } from '@hyperfocus/utilities/records';
import { combatRoomSnapshotSchema, readCombatRoomInput, type CombatRoomFrame, type CombatRoomInput, type CombatRoomSnapshot } from '../../combat/net/protocol.ts';

type State = { seats: string[]; status: string; inputs: Map<string, CombatRoomFrame>; contiguous: number[];
  spectators: Map<string, number>; archive: Array<[CombatRoomFrame, CombatRoomFrame]>; archiveEnded: boolean };
type Rejection = { type: 'combat-input-rejected'; playerId: string; reason: string; frame: number };
type Cursor = { type: 'combat-spectator-cursor'; frame: number };
export type ConfirmedCombatFrames = {
  roomId: string; matchId: string; contentId: string; seed: number; seats: string[];
  frames: CombatRoomFrame[];
};
/** Authenticated input relay only: this does not validate simulation outcomes or authorize rewards. */
export function createCombatRelayRoom(options: {
  matchId: string; contentId: string; seed: number; allowedActions: readonly string[];
  name?: string; historyFrames?: number; maxFutureFrames?: number;
  maxSpectators?: number; maxSpectatorFrames?: number;
  /** Trusted host observer. Receives detached, contiguous pairs before relay pruning. */
  onConfirmedFrames?(batch: ConfirmedCombatFrames): void;
}): RoomType<State, unknown, Rejection | Cursor, CombatRoomSnapshot> {
  const { matchId, contentId, seed } = options, history = options.historyFrames ?? 120, future = options.maxFutureFrames ?? 120;
  const maxSpectators = options.maxSpectators ?? 0, archiveLimit = options.maxSpectatorFrames ?? 36000;
  if (!Number.isSafeInteger(maxSpectators) || maxSpectators < 0 || maxSpectators > 32 || !Number.isSafeInteger(archiveLimit) || archiveLimit < 1 || archiveLimit > 36000) throw new Error('Invalid combat spectator limits.');
  if (!matchId || new TextEncoder().encode(matchId).length > 96 || !contentId || new TextEncoder().encode(contentId).length > 128 || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid combat room identity.');
  if (![history, future].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 120)) throw new Error('Combat relay windows must be between 1 and 120 frames.');
  if (options.allowedActions.length > 24 || options.allowedActions.some(action => !action || new TextEncoder().encode(action).length > 32)) throw new Error('Invalid combat room actions.');
  const allowed = new Set(options.allowedActions);
  return {
    name: options.name ?? 'combat-relay', schema: combatRoomSnapshotSchema, maxPlayers: 2 + maxSpectators,
    replication: { snapshotRate: 2, deltaRate: 60 },
    createState: () => ({ seats: [], status: 'waiting', inputs: new Map(), contiguous: [-1, -1], spectators: new Map(), archive: [], archiveEnded: false }),
    canJoin(ctx, request) {
      const value = isObject(request) ? request : undefined;
      if (value?.matchId !== matchId || value.contentId !== contentId) return { ok: false, reason: 'combat content or match mismatch' };
      if (value.role !== undefined && value.role !== 'fighter' && value.role !== 'spectator') return { ok: false, reason: 'invalid combat role' };
      if (value.role === 'spectator') {
        if (ctx.state.archiveEnded) return { ok: false, reason: 'combat spectator history exhausted; join a new bout' };
        if (ctx.state.status === 'interrupted' || ctx.state.spectators.size >= maxSpectators) return { ok: false, reason: 'combat spectator seats unavailable' };
        return { ok: true };
      }
      if (ctx.state.status !== 'waiting' || ctx.state.seats.length >= 2) return { ok: false, reason: 'combat seats unavailable' };
      return { ok: true };
    },
    onJoin(ctx, player, request) {
      if (isObject(request) && request.role === 'spectator') { ctx.state.spectators.set(player.id, 0);return; }
      ctx.state.seats.push(player.id);if (ctx.state.seats.length === 2) ctx.state.status = 'ready';
    },
    onLeave(ctx, player) { if (!ctx.state.spectators.delete(player.id)) ctx.state.status = 'interrupted'; },
    onEvent(ctx, player, event) {
      const cursor = ctx.state.spectators.get(player.id), value = isObject(event) ? event : undefined;
      if (cursor === undefined || value?.type !== 'combat-spectator-cursor' || typeof value.frame !== 'number' || !Number.isSafeInteger(value.frame)
        || value.frame < cursor || value.frame > Math.min(Math.min(...ctx.state.contiguous) + 1, cursor + 120)) {
        ctx.broadcast({ type: 'combat-input-rejected', playerId: player.id, reason: 'invalid-spectator-cursor', frame: -1 });return;
      }
      ctx.state.spectators.set(player.id, value.frame);
    },
    onInput(ctx, player, raw) {
      const state = ctx.state, input = isObject(raw) ? raw : undefined;
      const reject = (reason: string) => ctx.broadcast({ type: 'combat-input-rejected', playerId: player.id, reason,
        frame: typeof input?.frame === 'number' && Number.isSafeInteger(input.frame) ? input.frame : -1 });
      if (state.status !== 'ready') return reject('match-not-ready');
      if (!input || input.matchId !== matchId) return reject('wrong-match');
      let parsed: CombatRoomInput;
      try { parsed = readCombatRoomInput(input); } catch { return reject('invalid-input'); }
      const { frame } = parsed;
      if (parsed.actions.some(action => !allowed.has(action))) return reject('invalid-actions');
      const seat = state.seats.indexOf(player.id);
      if (seat < 0) return reject('unassigned-seat');
      const confirmed = Math.min(...state.contiguous), key = `${seat}:${frame}`;
      if (frame < Math.max(0, confirmed - history + 1)) return reject('stale-frame');
      if (frame > confirmed + future) return reject('future-frame');
      const value: CombatRoomFrame = { ...parsed, seat };
      const previous = state.inputs.get(key);
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(value)) reject('conflicting-frame');
        return;
      }
      state.inputs.set(key, value);
      while (state.inputs.has(`${seat}:${state.contiguous[seat]! + 1}`)) state.contiguous[seat]! += 1;
      const nextConfirmed = Math.min(...state.contiguous);
      if (maxSpectators > 0 && !state.archiveEnded) {
        for (let tick = confirmed + 1; tick <= nextConfirmed; tick++) {
          if (state.archive.length >= archiveLimit) { state.archiveEnded = true;break; }
          state.archive.push([state.inputs.get(`0:${tick}`)!, state.inputs.get(`1:${tick}`)!]);
        }
      }
      if (options.onConfirmedFrames && nextConfirmed > confirmed) {
        const frames: CombatRoomFrame[] = [];
        for (let tick = confirmed + 1; tick <= nextConfirmed; tick++) for (let index = 0; index < 2; index++) frames.push(structuredClone(state.inputs.get(`${index}:${tick}`)!));
        options.onConfirmedFrames({ roomId: ctx.roomId, matchId, contentId, seed, seats: [...state.seats], frames });
      }
      const oldest = Math.max(0, Math.min(...state.contiguous) - history + 1);
      for (const [id, accepted] of state.inputs) if (accepted.frame < oldest) state.inputs.delete(id);
    },
    getSnapshot(ctx, player) {
      const cursor = ctx.state.spectators.get(player.id), frames = cursor === undefined ? Object.fromEntries(ctx.state.inputs)
        : Object.fromEntries(ctx.state.archive.slice(cursor, cursor + 120).flatMap(pair => pair.map(frame => [`${frame.seat}:${frame.frame}`, frame])));
      const recovering = ctx.state.status === 'ready' && ctx.state.seats.some(id => ctx.players.get(id)?.reconnectUntil !== undefined);
      return { matchId, contentId, seed, status: recovering ? 'recovering' : cursor !== undefined && ctx.state.archiveEnded ? 'archive-ended' : ctx.state.status, seats: [...ctx.state.seats],
        confirmedFrame: Math.min(...ctx.state.contiguous), frames };
    },
  };
}
