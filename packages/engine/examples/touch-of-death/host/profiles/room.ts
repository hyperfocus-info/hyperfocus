import type { ReplicationSchema } from '@hyperfocus/engine/protocol';
import type { RoomType } from '@hyperfocus/engine/server';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import { emptyProfileMetadata, profileCombatSnapshotSchema, profileProtocolVersion, readInitialProfile, readProfileCommand, type ProfileMetadata, type PublicProfile } from '../../src/appearance/profile.ts';
import { isObject } from '@hyperfocus/utilities/records';
import type { createProfileService } from './service.ts';
import { withFriendsRoomImages, type FriendsRoomImages } from '../uploads/friends-room.ts';

type Service = ReturnType<typeof createProfileService>;
const shared = new WeakMap<Service, { cache: Map<string, PublicProfile>; refs: Map<string, number> }>();
/** App metadata wraps existing rooms; no profile field enters their combat simulation. */
export function withRoomProfiles<S, I, E, T extends { status: string; seats: string[]; matchId: string }>(options: {
  room: RoomType<S, I, E, T>; schema: ReplicationSchema<T & ProfileMetadata>; profiles?: Service; playing(snapshot: T): boolean;
}): RoomType<S, I, E, T & ProfileMetadata> {
  const { room, profiles } = options;
  if (room.getReplication) throw new Error('Profile rooms require ordinary snapshot replication.');
  const { getReplication: _customReplication, ...hooks } = room;
  const sharedState = profiles ? shared.get(profiles) ?? { cache: new Map<string, PublicProfile>(), refs: new Map<string, number>() } : { cache: new Map<string, PublicProfile>(), refs: new Map<string, number>() };
  const { cache, refs } = sharedState;if (profiles) shared.set(profiles, sharedState);
  const rooms = new Map<string, { bindings: Map<string, string>; tracked: Set<string>; joining: Set<string>; results: Map<string, ProfileMetadata['profileResult']>; frozen: Map<string, PublicProfile> }>();
  const state = (id: string) => { let value = rooms.get(id);if (!value) { value = { bindings: new Map(), tracked: new Set(), joining: new Set(), results: new Map(), frozen: new Map() };rooms.set(id, value); }return value; };
  function release(roomId: string, playerId: string) {
    const local = state(roomId), userId = local.bindings.get(playerId);if (!userId || !local.tracked.delete(playerId)) return;
    const remaining = (refs.get(userId) ?? 1) - 1;if (remaining > 0) refs.set(userId, remaining);else { refs.delete(userId);cache.delete(userId); }
  }
  return {
    ...hooks,
    schema: options.schema,
    async onJoin(ctx, player, request) {
      const rawInitial = request && typeof request === 'object' && 'initialProfile' in request ? request.initialProfile : undefined;
      const initial = rawInitial === undefined ? undefined : readInitialProfile(rawInitial);
      if (initial && !profiles) throw new Error('This game has no appearance catalog.');
      const profile = profiles ? initial ? await profiles.initialize({ userId: player.userId, appearance: initial }) : await profiles.read({ userId: player.userId }) : undefined;
      state(ctx.roomId).joining.add(player.id);
      await room.onJoin?.(ctx, player, request);
      if (profile) {
        cache.set(player.userId, profile);const local = state(ctx.roomId);local.bindings.set(player.id, player.userId);
        if (!local.tracked.has(player.id)) { local.tracked.add(player.id);refs.set(player.userId, (refs.get(player.userId) ?? 0) + 1); }
      }
    },
    async onLeave(ctx, player, reason) { const local = state(ctx.roomId);local.results.delete(player.id);try { if (local.joining.delete(player.id)) await room.onLeave?.(ctx, player, reason); } finally { release(ctx.roomId, player.id); } },
    async onEvent(ctx, player, raw) {
      if (!raw || typeof raw !== 'object' || !('type' in raw) || raw.type !== 'profile-save') return room.onEvent?.(ctx, player, raw);
      if (ctx.players.get(player.id)?.userId !== player.userId) return;
      const result = { requestId: '', error: '' };
      try {
        const command = readProfileCommand(raw);result.requestId = command.requestId;
        if (!profiles) throw new Error('This game has no appearance catalog.');
        if (options.playing(room.getSnapshot(ctx, player))) throw new Error('Finish this fight before changing your profile.');
        const saved = await profiles.save({ userId: player.userId, command });
        // A retry receipt can be older than the latest profile. Never roll public metadata back.
        const current = await profiles.read({ userId: player.userId });cache.set(player.userId, current.revision >= saved.revision ? current : saved);
      } catch (cause) { result.error = cause instanceof Error ? cause.message.slice(0, 160) : 'Could not save your profile. Try again.'; }
      state(ctx.roomId).results.set(player.id, result);
    },
    getSnapshot(ctx, player) {
      const snapshot = room.getSnapshot(ctx, player), metadata = emptyProfileMetadata();
      metadata.profileResult = { ...(state(ctx.roomId).results.get(player.id) ?? metadata.profileResult) };
      if (!profiles) return { ...snapshot, ...metadata };
      const local = state(ctx.roomId), playing = options.playing(snapshot);
      const live = [...ctx.players.values()];
      for (const peer of live) local.bindings.set(peer.id, peer.userId);
      for (const [id] of local.bindings) if (!ctx.players.has(id) && !snapshot.seats.includes(id)) local.bindings.delete(id);
      const bindings = [...local.bindings].sort(([a], [b]) => Number(snapshot.seats.includes(b)) - Number(snapshot.seats.includes(a)) || Number(b === player.id) - Number(a === player.id)).slice(0, 32);
      for (const [playerId, userId] of bindings) {
        const frozenKey = `${snapshot.matchId}:${playerId}`;
        const profile = cache.get(userId) ?? local.frozen.get(frozenKey);if (!profile) continue;
        if (playing && snapshot.seats.includes(playerId) && !local.frozen.has(frozenKey)) local.frozen.set(frozenKey, structuredClone(profile));
        while (local.frozen.size > 128) local.frozen.delete(local.frozen.keys().next().value!);
        const visible = playing ? local.frozen.get(frozenKey) ?? profile : profile;
        if (!metadata.profiles.some(value => value.userId === userId)) metadata.profiles.push(structuredClone(visible));
        metadata.profileBindings.push({ playerId, userId });
      }
      return { ...snapshot, ...metadata };
    },
    async onDispose(ctx, reason) { for (const id of state(ctx.roomId).tracked) release(ctx.roomId, id);rooms.delete(ctx.roomId);await room.onDispose?.(ctx, reason); },
  };
}
export function createProfileCombatRoom(options: Parameters<typeof createCombatRelayRoom>[0] & { profiles?: Service } & FriendsRoomImages) {
  const room = createCombatRelayRoom(options), original = room.canJoin;
  room.canJoin = async (ctx, request) => {
    if (!isObject(request) || request.profileVersion !== profileProtocolVersion) return { ok: false, reason: 'This room requires the latest game export.' };
    return await original?.(ctx, request) ?? { ok: true };
  };
  const wrapped = withRoomProfiles({ room, schema: profileCombatSnapshotSchema, profiles: options.profiles, playing: snapshot => snapshot.status === 'ready' });
  // The app accepts raw profile intents in addition to the engine's cursor events.
  // Both branches validate before handling; widen only this app transport boundary.
  return withFriendsRoomImages({ ...options, room: wrapped });
}
