import { combatInputActions3D } from '@hyperfocus/engine/project/runtime-3d';
import { isObject } from '@hyperfocus/utilities/records';
import { quickPlayProtocolVersion, quickPlayRoomSnapshotSchema, readQuickPlayCommand, type QuickPlayRoomSnapshot } from '../../src/network/quick-play/protocol.ts';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer, RoomContext, RoomType } from '@hyperfocus/engine/server';
import type { DurableMmoServices } from '@hyperfocus/engine/server';
import { createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import { readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import type { GameplayProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { createCombatResultJudge } from '../community/judge.ts';
import { createConnectionQuality } from '../connection-quality.ts';
import { createQuickPlayMatchmaker } from './matchmaker.ts';
import { createQuickPlayCoordinator } from './coordinator.ts';
import { createQuickPlayLatency } from './latency.ts';
import type { QuickPlayRatings } from './ratings.ts';
import { withRoomProfiles } from '../profiles/room.ts';
import type { createProfileService } from '../profiles/service.ts';
import type { createRoomSocialService } from '../community/social.ts';
import type { createUploadService } from '../uploads/service.ts';
import type { createUploadReportService } from '../uploads/report-service.ts';
import { withRoomUploads } from '../uploads/room.ts';

type Relay = ReturnType<typeof createCombatRelayRoom>;
type Child = Parameters<Relay['getSnapshot']>[0];
type Battle = { id: string; users: [string, string]; relay: Relay; state: Child['state']; pending?: { winner: 0 | 1 | null }; quality: ReturnType<typeof createConnectionQuality>; finishAt: number; failed: boolean };
type State = { coordinator: ReturnType<typeof createQuickPlayCoordinator>; battles: Map<string, Battle>; errors: Map<string, string>; departures: Array<{ player: AuthoritativePlayer; reason: string }>; nextTick: number; error: string };
type Context = RoomContext<State, unknown, unknown>;

/** Each accepted pair has its own relay and judge; the authenticated socket spans searches. */
export function createQuickPlayRoom(options: {
  project: GameplayProject3D; assets: Parameters<typeof createHyperfocus3DRuntime>[1]; contentId: string; seed: number;
  services: Pick<DurableMmoServices, 'matchmaking'>; ratings: QuickPlayRatings;
  now?: () => number; roomId?: string; region?: string; resultDisplayMs?: number;
  profiles?: ReturnType<typeof createProfileService>;
  social?: ReturnType<typeof createRoomSocialService>;
  uploads?: ReturnType<typeof createUploadService>;
  reports?: ReturnType<typeof createUploadReportService>;
  onResult?(result: { matchId: string; userIds: readonly string[]; winnerId?: string }): Promise<unknown>;
}): RoomType<State, unknown, unknown, QuickPlayRoomSnapshot> {
  const now = options.now ?? Date.now, roomId = options.roomId ?? 'quick-play', resultDisplayMs = options.resultDisplayMs ?? 3000;
  if (options.uploads && !options.social) throw new Error('Quick Play images require authenticated social membership.');
  if (!Number.isSafeInteger(resultDisplayMs) || resultDisplayMs < 0 || resultDisplayMs > 30000) throw new Error('Invalid Quick Play result duration.');
  const definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (definition?.fighters.length !== 2) throw new Error('Quick Play requires two authored fighters.');
  const latency = createQuickPlayLatency({ now });
  const matchmaker = createQuickPlayMatchmaker({ services: options.services, ratings: options.ratings, now, region: options.region ?? 'local', contentId: options.contentId, latency: user => latency.read(user) });
  const allowedActions = combatInputActions3D({ definition: definition, rematch: false });
  const identity = (player: AuthoritativePlayer) => ({ userId: player.userId, connectionId: player.id });
  function child(ctx: Context, battle: Battle): Child {
    return { ...ctx, roomId: battle.id, roomType: 'combat-relay', state: battle.state,
      players: new Map([...ctx.players].filter(([, player]) => battle.users.includes(player.userId))),
      broadcast(event) { if ('playerId' in event) { const player = ctx.players.get(event.playerId);if (player) ctx.state.errors.set(player.userId, 'That combat input was rejected.'); } },
    };
  }
  async function finish(ctx: Context, battle: Battle, force = false) {
    if (battle.pending && (force || now() >= battle.finishAt)) await ctx.state.coordinator.complete({ matchId: battle.id, winner: battle.pending.winner });
    else if (battle.failed && !battle.pending) await ctx.state.coordinator.abort({ matchId: battle.id });
  }
  async function synchronize(ctx: Context) {
    for (const battle of ctx.state.battles.values()) await finish(ctx, battle);
    for (const [id, battle] of ctx.state.battles) {
      if (!battle.users.some(user => { const view = ctx.state.coordinator.view({ userId: user });return view.phase === 'playing' && view.matchId === id; })) ctx.state.battles.delete(id);
    }
    for (const player of ctx.players.values()) {
      const view = ctx.state.coordinator.view({ userId: player.userId });
      if (view.phase !== 'playing' || ctx.state.battles.has(view.matchId)) continue;
      const players = view.users.map(user => [...ctx.players.values()].find(candidate => candidate.userId === user));
      if (!players[0] || !players[1]) continue;
      const users: [string, string] = [players[0].userId, players[1].userId];
      const match = { matchId: view.matchId, contentId: options.contentId, seed: options.seed, seats: players.map(value => value!.id) };
      const runtime = await createHyperfocus3DRuntime(options.project, options.assets);
      const judge = createCombatResultJudge({ project: options.project, runtime, match, roomId: view.matchId, battleId: view.matchId });
      const battle: Battle = { id: view.matchId, users, relay: undefined!, state: undefined!, quality: createConnectionQuality({ matchId: view.matchId, seats: match.seats, now }), finishAt: 0, failed: false };
      battle.relay = createCombatRelayRoom({ ...match, allowedActions, onConfirmedFrames(batch) {
        const result = judge.accept(batch);if (result && !battle.pending) { battle.pending = result;battle.finishAt = now() + resultDisplayMs; }
      } });
      battle.state = battle.relay.createState({ roomId: battle.id, roomType: battle.relay.name, now });
      for (const fighter of players) await battle.relay.onJoin!(child(ctx, battle), fighter!, { role: 'fighter' });
      ctx.state.battles.set(battle.id, battle);
    }
  }
  async function departures(ctx: Context) {
    while (ctx.state.departures.length) {
      const { player, reason } = ctx.state.departures[0]!;
      for (const battle of ctx.state.battles.values()) if ((battle.pending || battle.failed) && battle.state.seats.includes(player.id)) await finish(ctx, battle, true);
      await ctx.state.coordinator.leave({ ...identity(player), reason });ctx.state.departures.shift();ctx.state.errors.delete(player.userId);
    }
  }
  const room: RoomType<State, unknown, unknown, Omit<QuickPlayRoomSnapshot, 'profiles' | 'profileBindings' | 'profileResult' | 'roomImages'>> = {
    name: 'tod-quick-play', schema: quickPlayRoomSnapshotSchema, maxPlayers: 32, replication: { snapshotRate: 2, deltaRate: 60 },
    createState() { return { coordinator: createQuickPlayCoordinator({ matchmaker, ratings: options.ratings, now, onResult: options.onResult }), battles: new Map(), errors: new Map(), departures: [], nextTick: 0, error: '' }; },
    canJoin(ctx, raw) {
      const request = isObject(raw) ? raw : undefined;
      return ctx.roomId === roomId && request?.contentId === options.contentId && request.quickPlayVersion === quickPlayProtocolVersion
        ? { ok: true } : { ok: false, reason: 'Quick Play requires this host queue and the latest matching game export.' };
    },
    async onJoin(ctx, player) {
      await options.social?.join({ roomId: ctx.roomId, userId: player.userId });
      try {
        for (const battle of ctx.state.battles.values()) if (battle.pending && battle.users.includes(player.userId)) await finish(ctx, battle, true);
        await ctx.state.coordinator.join(identity(player));latency.join(player.userId, player.id);ctx.state.errors.delete(player.userId);
      } catch (cause) { await options.social?.leave({ roomId: ctx.roomId, userId: player.userId });throw cause; }
    },
    async onLeave(ctx, player, reason) {
      await options.social?.leave({ roomId: ctx.roomId, userId: player.userId });
      latency.leave(player.id);
      ctx.state.departures.push({ player, reason });
      try { await departures(ctx);await synchronize(ctx); }
      catch { ctx.state.errors.set(player.userId, 'Waiting to save the result before leaving.'); }
    },
    onReplicationSent(_ctx, player, receipt) { latency.sent(player.id, receipt.sequence); },
    onReplicationAck(_ctx, player, sequence) { latency.ack(player.id, sequence); },
    async onEvent(ctx, player, raw) {
      try {
        if (ctx.players.get(player.id)?.userId !== player.userId) return;
        if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'tod-latency-ack') {
          latency.reply(player.id, 'nonce' in raw ? raw.nonce : undefined);return;
        }
        if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'tod-quality-ack') {
          for (const battle of ctx.state.battles.values()) if (battle.quality.ack(player.id, raw)) break;
          return;
        }
        if (raw && typeof raw === 'object' && 'type' in raw && (raw.type === 'social-block' || raw.type === 'social-mute')) {
          if (!options.social || !options.uploads) throw new Error('Image preferences are unavailable.');
          const feedback = await options.social.handle({ roomId: ctx.roomId, userId: player.userId, command: raw });
          if (feedback.error) ctx.state.errors.set(player.userId, feedback.error);else ctx.state.errors.delete(player.userId);
          return;
        }
        const command = readQuickPlayCommand(raw);
        if (command.type === 'quick-search') await ctx.state.coordinator.search({ ...identity(player), requestId: command.requestId });
        else if (command.type === 'quick-cancel') await ctx.state.coordinator.cancel({ ...identity(player), requestId: command.requestId });
        else if (command.type === 'quick-accept') await ctx.state.coordinator.accept({ ...identity(player), matchId: command.matchId });
        ctx.state.errors.delete(player.userId);await synchronize(ctx);
      } catch (cause) { ctx.state.errors.set(player.userId, cause instanceof Error ? cause.message.slice(0, 128) : 'Quick Play could not save this action. Try again.'); }
    },
    async onInput(ctx, player, input) {
      const view = ctx.state.coordinator.view({ userId: player.userId }), battle = ctx.state.battles.get(view.matchId);
      if (view.phase !== 'playing' || !battle || battle.pending || battle.failed || !battle.state.seats.includes(player.id)) return;
      try { await battle.relay.onInput!(child(ctx, battle), player, input);await finish(ctx, battle); }
      catch { battle.failed = true;ctx.state.errors.set(player.userId, 'The fight stopped. Waiting to save its outcome.'); }
    },
    async update(ctx) {
      if (now() < ctx.state.nextTick) return;ctx.state.nextTick = now() + 250;
      for (const player of ctx.players.values()) if (['idle', 'searching', 'result'].includes(ctx.state.coordinator.view({ userId: player.userId }).phase)) {
        const probe = latency.probe(player.id);if (probe) ctx.broadcast(probe, { recipients: [player.id] });
      }
      for (const battle of ctx.state.battles.values()) if (!battle.pending && !battle.failed) {
        const result = battle.quality.tick({ frames: battle.state.contiguous, recovering: battle.state.seats.some(id => ctx.players.get(id)?.reconnectUntil !== undefined),
          send(playerId, probe) { ctx.broadcast(probe, { recipients: [playerId] }); } });
        if (result) { if (result.noContest) battle.failed = true;for (const user of battle.users) ctx.state.errors.set(user, result.reason); }
        else for (const user of battle.users) if (ctx.state.errors.get(user)?.startsWith('Connection delivery has')) ctx.state.errors.delete(user);
      }
      try { await departures(ctx);await synchronize(ctx);await ctx.state.coordinator.tick();await synchronize(ctx);ctx.state.error = ''; }
      catch { ctx.state.error = 'Quick Play is waiting to save an update. Retrying.'; }
    },
    async onDispose(ctx) { try { for (const battle of ctx.state.battles.values()) await finish(ctx, battle, true);await departures(ctx);await ctx.state.coordinator.shutdown(); } finally { await options.social?.dispose({ roomId: ctx.roomId }); } },
    getSnapshot(ctx, player) {
      const view = ctx.state.coordinator.view({ userId: player.userId }), battle = ctx.state.battles.get(view.matchId), receipt = view.phase === 'result' ? view.lastReceipt : null;
      const seat = receipt?.users.indexOf(player.userId) ?? -1;
      const outcome = !receipt ? 'none' : receipt.status === 'aborted' ? 'aborted' : receipt.winner === null ? 'draw' : receipt.winner === seat ? 'win' : 'loss';
      const combat = battle ? battle.relay.getSnapshot(child(ctx, battle), player) : { matchId: view.matchId, contentId: options.contentId, seed: options.seed, status: 'waiting', seats: [], confirmedFrame: -1, frames: {} };
      return { ...combat, quickPlay: { phase: view.phase, matchId: view.matchId, users: view.users, ready: view.ready, deadline: view.deadline,
        connectionReady: latency.read(player.userId) !== undefined,
        uploadsEnabled: !!options.uploads, blockedUserIds: options.uploads ? options.social!.view({ roomId: ctx.roomId, userId: player.userId }).blocked : [],
        rating: view.rating, ratingDelta: receipt && seat >= 0 ? receipt.after[seat]! - receipt.before[seat]! : 0, outcome, error: ctx.state.errors.get(player.userId) ?? (ctx.state.error || (view.phase === 'idle' ? view.message : '')) } };
    },
  };
  const profiled = withRoomProfiles({ room, schema: quickPlayRoomSnapshotSchema, profiles: options.profiles, playing: snapshot => ['ready', 'playing', 'saving'].includes(snapshot.quickPlay.phase) });
  return options.uploads ? withRoomUploads({ room: profiled, uploads: options.uploads, reports: options.reports, now,
    canEquip: ({ ctx, player }) => ['idle', 'result'].includes(ctx.state.coordinator.view({ userId: player.userId }).phase),
    canView: ({ ctx, player, ownerId }) => {
      const view = ctx.state.coordinator.view({ userId: player.userId });
      return ['ready', 'playing', 'saving', 'result'].includes(view.phase) && view.users.includes(ownerId);
    },
  }) : profiled;
}
