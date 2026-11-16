import { expect, test } from 'bun:test';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer } from '@hyperfocus/engine/server';
import { encodeSnapshot, decodeSnapshot } from '@hyperfocus/engine/protocol';
import { readProfileMetadata, profileCombatSnapshotSchema, profileProtocolVersion } from '../../src/appearance/profile.ts';
import { createProfileService } from './service.ts';
import { createProfileCombatRoom } from './room.ts';
import { createCommunityRoom } from '../community/room.ts';
import { createQuickPlayRoom } from '../quick-play/room.ts';
import { createQuickPlayRatings } from '../quick-play/ratings.ts';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { combatMotionFixture } from '../../test/combat-fixture.ts';
import { communityProtocolVersion, readCommunitySnapshot } from '../../src/network/community-protocol.ts';
import { quickPlayProtocolVersion, readQuickPlaySnapshot } from '../../src/network/quick-play/protocol.ts';

async function fixture() {
  let fail = false;const records = new Map<string, unknown>();
  const profiles = createProfileService({ persistence: { async loadPlayer(id) { return records.get(id) ?? null; }, async savePlayer(id, value) { if (fail) throw new Error('disk failed');records.set(id, structuredClone(value)); } },
    catalog: { version: 1, actors: [{ entityId: 'fighter' }], slots: [{ id: 'body', label: 'Body', defaultOptionId: 'red', options: [{ id: 'red', label: 'Red', colors: [{ materialSuffix: ':body', baseColor: [1, 0, 0, 1] }] }] }] } });
  const type = createProfileCombatRoom({ matchId: 'match', contentId: 'content', seed: 7, allowedActions: ['jab'], profiles });
  const room = createAuthoritativeRoom({ id: 'private', type, now: () => 1000, metrics: { record() {} } });
  const player = (id: string, userId = id): AuthoritativePlayer => ({ id, userId, sessionId: id, roomId: 'private', joinedAt: 1000, lastInputAt: 1000 });
  const join = (id: string, version = profileProtocolVersion, initialProfile?: unknown) => room.join(player(id), { matchId: 'match', contentId: 'content', role: 'fighter', profileVersion: version, ...(initialProfile === undefined ? {} : { initialProfile }) });
  return { room, profiles, join, player, set fail(value: boolean) { fail = value; }, snapshot: (id = 'alice') => room.snapshotFor(id)! };
}
const command = { type: 'profile-save', requestId: 'r1', expectedRevision: 0, name: 'Alice', icon: 'star', selections: { body: 'red' } };
test('private relay authenticates profile edits, publishes only committed metadata and freezes fighters', async () => {
  const f = await fixture();
  expect(await f.join('previous', 3)).toMatchObject({ ok: false });
  expect(await f.join('old', 0)).toMatchObject({ ok: false });expect(await f.join('alice')).toEqual({ ok: true });
  expect(readProfileMetadata(f.snapshot()).profiles[0]?.name).toBe('Player');
  f.fail = true;await f.room.event('alice', command);
  expect(readProfileMetadata(f.snapshot()).profileResult).toEqual({ requestId: 'r1', error: 'disk failed' });
  expect(readProfileMetadata(f.snapshot()).profiles[0]?.revision).toBe(0);
  f.fail = false;await f.room.event('alice', command);
  expect(readProfileMetadata(f.snapshot()).profiles[0]).toMatchObject({ name: 'Alice', revision: 1 });
  await f.room.event('alice', { ...command, userId: 'bob' });expect(readProfileMetadata(f.snapshot()).profileResult.error).toContain('Invalid');
  expect(await f.join('bob')).toEqual({ ok: true });
  const initial = f.snapshot();expect(initial.status).toBe('ready');
  await f.room.event('alice', { ...command, requestId: 'r2', expectedRevision: 1, name: 'Changed' });
  expect(readProfileMetadata(f.snapshot()).profileResult.error).toContain('Finish this fight');
  expect((await f.profiles.read({ userId: 'alice' })).name).toBe('Alice');
  const metadata = readProfileMetadata(f.snapshot('bob'));expect(metadata.profileResult.error).toBe('');
  expect(metadata.profileBindings.sort((a, b) => a.playerId.localeCompare(b.playerId))).toEqual([{ playerId: 'alice', userId: 'alice' }, { playerId: 'bob', userId: 'bob' }]);
  expect(decodeSnapshot(profileCombatSnapshotSchema, encodeSnapshot(profileCombatSnapshotSchema, f.snapshot()))).toEqual(f.snapshot());
  expect(f.snapshot().confirmedFrame).toBe(-1);
  await f.room.leave('alice', 'disconnect');await f.room.event('alice', { ...command, requestId: 'departed', expectedRevision: 1 });
  expect((await f.profiles.read({ userId: 'alice' })).revision).toBe(1);
});
test('catalog-free private rooms preserve admission and emit empty bounded profile metadata', async () => {
  const type = createProfileCombatRoom({ matchId: 'match', contentId: 'content', seed: 7, allowedActions: ['jab'] });
  const room = createAuthoritativeRoom({ id: 'private', type, now: () => 1000, metrics: { record() {} } });
  const player = { id: 'p', userId: 'u', sessionId: 's', roomId: 'private', joinedAt: 0, lastInputAt: 0 };
  await expect(room.join(player, { matchId: 'match', contentId: 'content', profileVersion: profileProtocolVersion, initialProfile: { name: 'First', icon: 'star', selections: {} } })).rejects.toThrow('no appearance catalog');
  expect(room.ctx.players.size).toBe(0);
  expect(await room.join(player, { matchId: 'match', contentId: 'content', profileVersion: profileProtocolVersion })).toEqual({ ok: true });
  expect(readProfileMetadata(room.snapshotFor('p'))).toEqual({ roomImages: { enabled: false, blockedUserIds: [], error: '' }, profiles: [], profileBindings: [], profileResult: { requestId: '', error: '' } });
});

test('first-visit appearance commits before the fighter joins and failed initialization leaves no seat or metadata', async () => {
  const f = await fixture(), initial = { name: 'First', icon: 'moon', selections: { body: 'red' } };
  f.fail = true;await expect(f.join('alice', profileProtocolVersion, initial)).rejects.toThrow('disk failed');
  expect(f.room.ctx.players.size).toBe(0);expect((await f.profiles.read({ userId: 'alice' })).revision).toBe(0);
  f.fail = false;await expect(f.join('alice', profileProtocolVersion, { ...initial, selections: { body: 'invalid' } })).rejects.toThrow();
  expect(f.room.ctx.players.size).toBe(0);
  expect(await f.join('alice', profileProtocolVersion, initial)).toEqual({ ok: true });
  expect(readProfileMetadata(f.snapshot()).profiles).toEqual([{ userId: 'alice', ...initial, revision: 1 }]);
  expect(f.snapshot().seats).toEqual(['alice']);
  await f.room.leave('alice', 'leave');
  const next = createAuthoritativeRoom({ id: 'private', now: () => 1000, metrics: { record() {} }, type: createProfileCombatRoom({ matchId: 'next', contentId: 'content', seed: 7, allowedActions: ['jab'], profiles: f.profiles }) });
  expect(await next.join(f.player('alice'), { matchId: 'next', contentId: 'content', profileVersion: profileProtocolVersion, initialProfile: { ...initial, name: 'Changed' } })).toEqual({ ok: true });
  expect(readProfileMetadata(next.snapshotFor('alice')).profiles[0]?.name).toBe('First');
});
test('community and Quick Play publish the same durable profile without touching queue, rating or combat', async () => {
  const f = await fixture(), combat = await combatMotionFixture({ match: true });combat.game.reset();
  const records = new Map<string, unknown>(), ratings = createQuickPlayRatings({ path: ':memory:' });
  try {
    const shared = { project: combat.project, assets: combat.assets, contentId: 'content', seed: 7, profiles: f.profiles };
    const community = createAuthoritativeRoom({ id: 'friends', now: () => 1000, metrics: { record() {} }, type: createCommunityRoom({ ...shared,
      persistence: { async loadRoom(id) { return records.get(id) ?? null; }, async saveRoom(id, value) { records.set(id, structuredClone(value)); } }, now: () => 1000 }) });
    const quick = createAuthoritativeRoom({ id: 'quick', now: () => 1000, metrics: { record() {} }, type: createQuickPlayRoom({ ...shared, roomId: 'quick',
      services: createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => 1000 }), ratings, now: () => 1000 }) });
    expect(await community.join({ ...f.player('community-a', 'alice'), roomId: 'friends' }, { contentId: 'content', communityVersion: communityProtocolVersion, wantsQueue: false })).toEqual({ ok: true });
    expect(await quick.join({ ...f.player('quick-a', 'alice'), roomId: 'quick' }, { contentId: 'content', quickPlayVersion: quickPlayProtocolVersion })).toEqual({ ok: true });
    await community.event('community-a', command);
    expect(readQuickPlaySnapshot(quick.snapshotFor('quick-a')).profiles[0]?.name).toBe('Alice');
    await quick.event('quick-a', { ...command, requestId: 'quick-save', expectedRevision: 1, name: 'Moon' });
    const lobby = readCommunitySnapshot(community.snapshotFor('community-a')), queue = readQuickPlaySnapshot(quick.snapshotFor('quick-a'));
    expect(lobby.profiles[0]?.name).toBe('Moon');expect(lobby.community.queue).toEqual([]);expect(lobby.confirmedFrame).toBe(-1);
    expect(queue.quickPlay).toMatchObject({ phase: 'idle', rating: 1000 });expect(queue.profileResult).toEqual({ requestId: 'quick-save', error: '' });
    expect(queue.profileBindings).toEqual([{ playerId: 'quick-a', userId: 'alice' }]);
    await community.leave('community-a', 'disconnect');
    expect(readQuickPlaySnapshot(quick.snapshotFor('quick-a')).profiles[0]?.name).toBe('Moon');
  } finally { ratings.close(); }
});
