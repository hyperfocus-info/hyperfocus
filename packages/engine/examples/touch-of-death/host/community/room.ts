import { combatInputActions3D } from '@hyperfocus/engine/project/runtime-3d';
import { communityProtocolVersion, communityRoomSnapshotSchema, readCommunityCommand, type CommunityRoomSnapshot } from '../../src/network/community-protocol.ts';
import { emptySocialSnapshot } from '../../src/network/social-protocol.ts';
import { emptyVoiceSnapshot } from '../../src/network/voice/protocol.ts';
import type { createRoomSocialService } from './social.ts';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer, PersistenceAdapter, RoomContext, RoomType } from '@hyperfocus/engine/server';
import { createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import { readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import type { GameplayProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { createCommunityCoordinator } from './coordinator.ts';
import { createCombatResultJudge } from './judge.ts';
import { createConnectionQuality } from '../connection-quality.ts';
import type { CommunityTuning } from './policy.ts';
import { withRoomProfiles } from '../profiles/room.ts';
import type { createProfileService } from '../profiles/service.ts';
import { isObject } from '@hyperfocus/utilities/records';

type Relay = ReturnType<typeof createCombatRelayRoom>;
type RelayContext = Parameters<Relay['getSnapshot']>[0];
type Battle = { id: string; relay: Relay; state: RelayContext['state']; users: [string, string]; pending?: { winner: 0 | 1 }; quality: ReturnType<typeof createConnectionQuality>; qualityAbort?: boolean; finishAt: number };
type State = { coordinator: ReturnType<typeof createCommunityCoordinator>; battle?: Battle; error: string; actionError: string; blocked: boolean; departures: Array<{ player: AuthoritativePlayer; reason: string }> };
type Context = RoomContext<State, unknown, unknown>;

/** One durable lobby and a replaceable combat session share the same authenticated socket. */
export function createCommunityRoom(options: {
  project: GameplayProject3D; assets: Parameters<typeof createHyperfocus3DRuntime>[1]; contentId: string; seed: number;
  persistence: Pick<PersistenceAdapter, 'loadRoom' | 'saveRoom'>; now?: () => number; tuning?: Partial<CommunityTuning>; resultDisplayMs?: number;
  social?: ReturnType<typeof createRoomSocialService>;
  profiles?: ReturnType<typeof createProfileService>;
  onResult?(result: { matchId: string; userIds: readonly string[]; winnerId?: string }): Promise<unknown>;
}): RoomType<State, unknown, unknown, CommunityRoomSnapshot> {
  const definition = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (definition?.fighters.length !== 2) throw new Error('Community requires two authored fighters.');
  const resultDisplayMs = options.resultDisplayMs ?? 3000;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(resultDisplayMs) || resultDisplayMs < 0 || resultDisplayMs > 30000) throw new Error('Invalid result display duration.');
  const allowedActions = combatInputActions3D({ definition: definition, rematch: false });
  const identity = (player: AuthoritativePlayer) => ({ userId: player.userId, connectionId: player.id });
  const child = (ctx: Context, battle: Battle): RelayContext => ({ ...ctx, state: battle.state, roomType: 'combat-relay' });
  async function synchronize(ctx: Context) {
    const current = ctx.state.coordinator.snapshot().battle;
    if (ctx.state.battle?.id !== current?.id) ctx.state.battle = undefined;
    if (!current || current.phase !== 'playing' || ctx.state.battle) return;
    const players = current.fighters.map(user => [...ctx.players.values()].find(player => player.userId === user));
    if (!players[0] || !players[1]) throw new Error('A selected fighter disconnected.');
    const match = { matchId: current.id, contentId: options.contentId, seed: options.seed, seats: players.map(player => player!.id) };
    const runtime = await createHyperfocus3DRuntime(options.project, options.assets);
    const judge = createCombatResultJudge({ project: options.project, runtime, match, roomId: ctx.roomId, battleId: current.id });
    const battle: Battle = { id: current.id, users: [...current.fighters], finishAt: 0, relay: undefined!, state: undefined!, quality: createConnectionQuality({ matchId: current.id, seats: match.seats, now }) };
    const relay = createCombatRelayRoom({ ...match, allowedActions, maxSpectators: (options.tuning?.maxMembers ?? 8) - 2,
      onConfirmedFrames(batch) { const result = judge.accept(batch);if (result && !battle.pending) { battle.pending = result;battle.finishAt = now() + resultDisplayMs; } },
    });
    battle.relay = relay;battle.state = relay.createState({ roomId: ctx.roomId, roomType: relay.name, now: ctx.now });
    for (const player of players) await relay.onJoin!(child(ctx, battle), player!, { role: 'fighter' });
    for (const player of ctx.players.values()) if (!match.seats.includes(player.id)) await relay.onJoin!(child(ctx, battle), player, { role: 'spectator' });
    ctx.state.battle = battle;
  }
  async function complete(ctx: Context, force = false) {
    const battle = ctx.state.battle;
    if (battle?.qualityAbort) { await ctx.state.coordinator.abort({ battleId: battle.id });await synchronize(ctx);return; }
    if (!battle?.pending || !force && now() < battle.finishAt) return;
    await ctx.state.coordinator.complete({ battleId: battle.id, fighters: battle.users, winner: battle.pending.winner });
    await synchronize(ctx);
  }
  async function operation(ctx: Context, run: () => Promise<void>) {
    try { await run();ctx.state.error = '';ctx.state.blocked = false; }
    catch { ctx.state.error = 'Room update could not be saved. Waiting to retry.';ctx.state.blocked = true; }
  }
  async function departures(ctx: Context) {
    if (ctx.state.departures.length) await complete(ctx, true);
    while (ctx.state.departures.length) {
      const departure = ctx.state.departures[0]!;await ctx.state.coordinator.disconnect({ ...identity(departure.player), reason: departure.reason });ctx.state.departures.shift();
    }
    await synchronize(ctx);
  }
  const room: RoomType<State, unknown, unknown, Omit<CommunityRoomSnapshot, 'profiles' | 'profileBindings' | 'profileResult' | 'roomImages'>> = {
    name: 'tod-community', schema: communityRoomSnapshotSchema, maxPlayers: options.tuning?.maxMembers ?? 8,
    replication: { snapshotRate: 2, deltaRate: 60 },
    createState(ctx) { return { coordinator: createCommunityCoordinator({ roomId: ctx.roomId, persistence: options.persistence, now, onResult: options.onResult, ...options.tuning }), error: '', actionError: '', blocked: false, departures: [] }; },
    async canJoin(ctx, request) {
      await ctx.state.coordinator.initialization;
      const value = isObject(request) ? request : undefined;
      if (value?.communityVersion !== communityProtocolVersion) return { ok: false, reason: 'This room requires the latest game export.' };
      return value?.contentId === options.contentId && typeof value.wantsQueue === 'boolean' ? { ok: true } : { ok: false, reason: 'Community content or queue preference mismatch.' };
    },
    async onJoin(ctx, player, request) {
      await options.social?.join({ roomId: ctx.roomId, userId: player.userId });
      try {
        if (ctx.state.battle?.pending && ctx.state.battle.users.includes(player.userId)) await complete(ctx, true);
        if (!isObject(request) || typeof request.wantsQueue !== 'boolean') throw new Error('Community queue preference mismatch.');
        await ctx.state.coordinator.join({ ...identity(player), wantsQueue: request.wantsQueue });
        const battle = ctx.state.battle;
        if (battle) await battle.relay.onJoin!(child(ctx, battle), player, { role: 'spectator' });
        await synchronize(ctx);
      } catch (cause) { await options.social?.leave({ roomId: ctx.roomId, userId: player.userId });throw cause; }
    },
    async onLeave(ctx, player, reason) {
      await options.social?.leave({ roomId: ctx.roomId, userId: player.userId });
      ctx.state.departures.push({ player, reason });
      const battle = ctx.state.battle;if (battle && !battle.pending) await battle.relay.onLeave!(child(ctx, battle), player, 'disconnect');
      await operation(ctx, async () => {
        await departures(ctx);
      });
    },
    async onEvent(ctx, player, raw) {
      if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'tod-quality-ack') { ctx.state.battle?.quality.ack(player.id, raw);return; }
      if (raw && typeof raw === 'object' && 'type' in raw && typeof raw.type === 'string' && raw.type.startsWith('social-')) {
        if (!options.social) { ctx.state.actionError = 'Room communication is not available on this host.';return; }
        try { await options.social.handle({ roomId: ctx.roomId, userId: player.userId, command: raw }); }
        catch { ctx.state.actionError = 'That communication request is invalid. Retry from the room controls.'; }
        return;
      }
      let command: ReturnType<typeof readCommunityCommand>;
      try { command = readCommunityCommand(raw); } catch { ctx.state.actionError = 'That room action is invalid.';return; }
      if (command.type === 'community-ready') {
        const battle = ctx.state.coordinator.snapshot().battle;
        if (!battle || battle.id !== command.battleId || !battle.fighters.includes(player.userId) || battle.phase !== 'ready' || battle.deadline <= now()) {
          ctx.state.actionError = 'That ready request has expired.';return;
        }
      }
      if (command.type === 'combat-spectator-cursor' && (!ctx.state.battle || command.matchId !== ctx.state.battle.id)) {
        // Playback acknowledgements can cross a legitimate battle handoff in flight.
        // The parser has validated the envelope; never apply an old cursor to its successor.
        return;
      }
      try {
        if (command.type === 'community-queue') await ctx.state.coordinator.queue({ ...identity(player), enabled: command.enabled });
        else if (command.type === 'community-ready') await ctx.state.coordinator.ready({ ...identity(player), battleId: command.battleId });
        else {
          const battle = ctx.state.battle;
          if (battle) await battle.relay.onEvent!(child(ctx, battle), player, command);
        }
        if (command.type !== 'combat-spectator-cursor') ctx.state.actionError = '';
      } catch { ctx.state.actionError = 'Could not save that room action. Try again.';return; }
      if (!ctx.state.blocked) await operation(ctx, () => synchronize(ctx));
    },
    async onInput(ctx, player, input) {
      const battle = ctx.state.battle;if (!battle || battle.pending || battle.qualityAbort || ctx.state.blocked) return;
      await operation(ctx, async () => { await battle.relay.onInput!(child(ctx, battle), player, input);await complete(ctx); });
    },
    async update(ctx) {
      const battle = ctx.state.battle;
      if (battle && !battle.pending && !battle.qualityAbort && !ctx.state.blocked) {
        const result = battle.quality.tick({ frames: battle.state.contiguous, recovering: battle.state.seats.some(id => ctx.players.get(id)?.reconnectUntil !== undefined),
          send(playerId, probe) { ctx.broadcast(probe, { recipients: [playerId] }); } });
        if (result) { battle.qualityAbort = result.noContest;ctx.state.actionError = result.reason; }
        else if (ctx.state.actionError.startsWith('Connection delivery has')) ctx.state.actionError = '';
      }
      await operation(ctx, async () => { await departures(ctx);await ctx.state.coordinator.tick();await complete(ctx);await synchronize(ctx); });
    },
    async onDispose(ctx) { try { await complete(ctx, true);await departures(ctx);await ctx.state.coordinator.shutdown(); } finally { await options.social?.dispose({ roomId: ctx.roomId }); } },
    getSnapshot(ctx, player) {
      const lobby = ctx.state.coordinator.snapshot(), battle = ctx.state.battle;
      const combat = battle ? battle.relay.getSnapshot(child(ctx, battle), player) : {
        matchId: lobby.battle?.id ?? '', contentId: options.contentId, seed: options.seed, status: 'waiting', seats: [], confirmedFrame: -1, frames: {},
      };
      return { ...combat, voice: emptyVoiceSnapshot(), social: options.social?.view({ roomId: ctx.roomId, userId: player.userId }) ?? emptySocialSnapshot(), community: { revision: lobby.revision, streakCap: options.tuning?.streakCap ?? 3,
        members: lobby.members.map(member => {
          const live = [...ctx.players.values()].find(value => value.userId === member.userId), seat = battle?.users.indexOf(member.userId) ?? -1;
          const playerId = (battle?.pending && seat >= 0 ? battle.state.seats[seat] : live?.id) ?? '';
          return { userId: member.userId, playerId, online: Boolean(live), wantsQueue: member.wantsQueue };
        }),
        queue: lobby.queue, battleId: lobby.battle?.id ?? '', phase: lobby.battle?.phase ?? 'waiting', fighters: lobby.battle?.fighters ?? [], ready: lobby.battle?.ready ?? [], deadline: lobby.battle?.deadline ?? 0,
        streakUserId: lobby.streak?.userId ?? '', streakWins: lobby.streak?.wins ?? 0, lastBattleId: lobby.lastResult?.battleId ?? '', lastFighters: lobby.lastResult?.fighters ?? [], lastWinner: lobby.lastResult?.winner ?? 255, error: ctx.state.error || ctx.state.actionError,
      } };
    },
  };
  return withRoomProfiles({ room, schema: communityRoomSnapshotSchema, profiles: options.profiles, playing: snapshot => snapshot.community.phase === 'playing' || snapshot.community.phase === 'ready' });
}
