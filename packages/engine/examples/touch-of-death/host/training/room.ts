import type {  RoomContext, RoomType } from '@hyperfocus/engine/server';
import { isObject } from '@hyperfocus/utilities/records';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import { trainingProtocolVersion, trainingRoomSnapshotSchema, readTrainingCommand, type TrainingRoomSnapshot } from '../../src/training/protocol.ts';
import { withRoomProfiles } from '../profiles/room.ts';
import type { createProfileService } from '../profiles/service.ts';
import { withFriendsRoomImages, type FriendsRoomImages } from '../uploads/friends-room.ts';

type Relay = ReturnType<typeof createCombatRelayRoom>;
type Child = Parameters<Relay['getSnapshot']>[0];
type Attempt = { id: string; relay: Relay; state: Child['state'] };
type Proposal = { id: string; action: 'reset' | 'swap'; requestedBy: string; connectionId: string; deadline: number };
type State = { users: string[]; connections: Set<string>; attempt?: Attempt; proposal?: Proposal; revision: number; errors: Map<string, string>; requests: Map<string, string> };
type Context = RoomContext<State, unknown, unknown>;
type Snapshot = Omit<TrainingRoomSnapshot, 'profiles' | 'profileBindings' | 'profileResult' | 'roomImages'>;

/** Ephemeral private practice policy. Authenticated votes replace the whole attempt, never solver state. */
export function createTrainingRoom(options: {
  contentId: string; seed: number; allowedActions: readonly string[]; profiles?: ReturnType<typeof createProfileService>;
  now?: () => number; proposalTimeoutMs?: number;
} & FriendsRoomImages): RoomType<State, unknown, unknown, TrainingRoomSnapshot> {
  const now = options.now ?? Date.now, timeout = options.proposalTimeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 60000) throw new Error('Invalid training proposal timeout.');
  const allowedActions = options.allowedActions.filter(action => action !== 'match:rematch');
  const child = (ctx: Context, attempt: Attempt): Child => ({ ...ctx, state: attempt.state, roomType: 'combat-relay' });
  function time() { const value = now();if (!Number.isSafeInteger(value) || value < 0) throw new Error('Training requires integer epoch time.');return value; }
  function changed(state: State) { if (state.revision === 0xffffffff) throw new Error('Training room revision exhausted. Rejoin a new room.');state.revision++; }
  function expire(state: State) { if (state.proposal && state.proposal.deadline <= time()) { state.proposal = undefined;changed(state); } }
  async function fresh(ctx: Context, users: string[]) {
    const players = users.map(user => [...ctx.players.values()].find(player => player.userId === user));
    if (players.length !== 2 || players.some(player => !player)) throw new Error('Both training partners must be connected.');
    const id = `training-${crypto.randomUUID()}`, relay = createCombatRelayRoom({ matchId: id, contentId: options.contentId, seed: options.seed, allowedActions });
    const attempt: Attempt = { id, relay, state: relay.createState({ roomId: ctx.roomId, roomType: 'combat-relay', now: ctx.now }) };
    for (const player of players) await relay.onJoin!(child(ctx, attempt), player!, { role: 'fighter' });
    ctx.state.attempt = attempt;ctx.state.users = [...users];ctx.state.proposal = undefined;ctx.state.requests.clear();ctx.state.errors.clear();changed(ctx.state);
  }
  const room: RoomType<State, unknown, unknown, Snapshot> = {
    name: 'tod-training', schema: trainingRoomSnapshotSchema, maxPlayers: 2, replication: { snapshotRate: 2, deltaRate: 60 },
    createState: () => ({ users: [], connections: new Set(), revision: 0, errors: new Map(), requests: new Map() }),
    canJoin(ctx, request) {
      const value = isObject(request) ? request : undefined;
      if (value?.contentId !== options.contentId || value.trainingVersion !== trainingProtocolVersion || value.role !== 'fighter') return { ok: false, reason: 'Training requires two fighters and the latest matching game export.' };
      return ctx.players.size < 2 ? { ok: true } : { ok: false, reason: 'Both training seats are occupied.' };
    },
    async onJoin(ctx, player) {
      if ([...ctx.players.values()].some(other => other.id !== player.id && other.userId === player.userId)) throw new Error('One authenticated user cannot occupy both training seats.');
      ctx.state.connections.add(player.id);
      ctx.state.errors.delete(player.id);
      const live = [...ctx.players.values()].map(player => player.userId);
      const users = [...ctx.state.users.filter(user => live.includes(user)), ...live.filter(user => !ctx.state.users.includes(user))];
      if (users.length === 2) await fresh(ctx, users);else { ctx.state.users = users;changed(ctx.state); }
    },
    async onLeave(ctx, player) {
      if (!ctx.state.connections.delete(player.id)) return;
      ctx.state.errors.delete(player.id);ctx.state.proposal = undefined;ctx.state.requests.clear();
      const attempt = ctx.state.attempt;
      if (attempt?.state.seats.includes(player.id)) await attempt.relay.onLeave!(child(ctx, attempt), player, 'disconnect');
      changed(ctx.state);
    },
    async onEvent(ctx, player, raw) {
      if (ctx.players.get(player.id)?.userId !== player.userId) return;
      expire(ctx.state);
      try {
        const command = readTrainingCommand(raw), attempt = ctx.state.attempt;
        if (!attempt || attempt.state.status !== 'ready' || command.matchId !== attempt.id || !attempt.state.seats.includes(player.id)) throw new Error('That training attempt has ended.');
        if (command.type === 'training-propose') {
          const key = `${player.id}:${command.requestId}`, fingerprint = `${command.matchId}:${command.action}`, prior = ctx.state.requests.get(key);
          if (prior !== undefined) { if (prior !== fingerprint) throw new Error('That request ID already names another action.');ctx.state.errors.delete(player.id);return; }
          if (ctx.state.proposal) throw new Error('Respond to the current training request first.');
          ctx.state.proposal = { id: crypto.randomUUID(), action: command.action, requestedBy: player.userId, connectionId: player.id, deadline: time() + timeout };
          ctx.state.requests.set(key, fingerprint);while (ctx.state.requests.size > 32) ctx.state.requests.delete(ctx.state.requests.keys().next().value!);changed(ctx.state);
        } else {
          const proposal = ctx.state.proposal;
          if (!proposal || proposal.id !== command.proposalId || !ctx.players.has(proposal.connectionId)) throw new Error('That training request has expired.');
          if (!command.accept) { ctx.state.proposal = undefined;changed(ctx.state); }
          else {
            if (proposal.connectionId === player.id) throw new Error('Your partner must accept this request.');
            await fresh(ctx, proposal.action === 'swap' ? [...ctx.state.users].reverse() : ctx.state.users);
          }
        }
        ctx.state.errors.delete(player.id);
      } catch (cause) { ctx.state.errors.set(player.id, cause instanceof Error ? cause.message.slice(0, 160) : 'Training request failed. Try again.'); }
    },
    async onInput(ctx, player, input) { const attempt = ctx.state.attempt;if (attempt) await attempt.relay.onInput!(child(ctx, attempt), player, input); },
    update(ctx) { expire(ctx.state); },
    getSnapshot(ctx, player) {
      const attempt = ctx.state.attempt, proposal = ctx.state.proposal;
      const combat = attempt ? attempt.relay.getSnapshot(child(ctx, attempt), player) : { matchId: '', contentId: options.contentId, seed: options.seed, status: 'waiting', seats: [], confirmedFrame: -1, frames: {} };
      return { ...combat, training: { version: trainingProtocolVersion, mode: 'training', revision: ctx.state.revision,
        phase: combat.status === 'ready' || combat.status === 'recovering' ? 'playing' : combat.status === 'interrupted' ? 'interrupted' : 'waiting', users: [...ctx.state.users],
        proposalId: proposal?.id ?? '', action: proposal?.action ?? 'none', requestedBy: proposal?.requestedBy ?? '', deadline: proposal?.deadline ?? 0, error: ctx.state.errors.get(player.id) ?? '' } };
    },
  };
  return withFriendsRoomImages({ ...options, room: withRoomProfiles({ room, schema: trainingRoomSnapshotSchema, profiles: options.profiles, playing: snapshot => snapshot.training.phase === 'playing' }) });
}
