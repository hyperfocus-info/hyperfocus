import { isObject } from '@hyperfocus/utilities/records';
import { expect, test } from 'bun:test';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createProfileCombatRoom } from '../profiles/room.ts';
import { createTrainingRoom } from '../training/room.ts';
import { createRoomSocialService } from '../community/social.ts';
import { createUploadService } from './service.ts';
import { readUploadResponse } from '../../src/uploads/protocol.ts';
import { profileProtocolVersion } from '../../src/appearance/profile.ts';
import { trainingProtocolVersion } from '../../src/training/protocol.ts';
import { withFriendsRoomImages } from './friends-room.ts';

test.each(['private', 'training'] as const)('%s shares unreviewed equipment with authenticated fighters and revokes blocked/departed access', async mode => {
  const records = new Map<string, unknown>();let fail = false;
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, value: unknown) { if (fail) throw Error('write failed');records.set(id, structuredClone(value)); } };
  const social = createRoomSocialService({ persistence, services: createDurableMmoServices(createMemoryDurableServiceStore()) });
  const uploads = createUploadService({ persistence, allowedSlots: ['profile-emblem'], allowView: ({ roomId, ownerId, viewerId }) => social.allowCommunication({ roomId, userId: viewerId, otherUserId: ownerId }) });
  const options = { contentId: 'game', seed: 7, allowedActions: ['jab'], social, uploads };
  const host = { id: 'friends', now: () => 1000, metrics: { record() {} } };
  const room = mode === 'private' ? createAuthoritativeRoom({ ...host, type: createProfileCombatRoom({ ...options, matchId: 'match', maxSpectators: 1 }) }) : createAuthoritativeRoom({ ...host, type: createTrainingRoom(options) });
  const join = (id: string, role = 'fighter', version = profileProtocolVersion) => room.join({ id, userId: id, sessionId: id, roomId: room.id, joinedAt: 0, lastInputAt: 0 }, { contentId: 'game', matchId: 'match', role, profileVersion: version, trainingVersion: version });
  const request = async (id: string, command: unknown) => { room.drainBroadcasts();await room.event(id, command);return readUploadResponse(room.drainBroadcasts().find(value => (isObject(value.event) ? value.event.type : undefined) === 'upload-result')!.event); };
  try {
    expect(profileProtocolVersion).toBe(5);expect(trainingProtocolVersion).toBe(5);expect((await join('old', 'fighter', 2)).ok).toBe(false);
    expect(await join('alice')).toEqual({ ok: true });expect(await join('bob')).toEqual({ ok: true });expect(room.snapshotFor('alice').roomImages).toEqual({ enabled: true, blockedUserIds: [], error: '' });
    if (mode === 'private') expect(await join('watcher', 'spectator')).toEqual({ ok: true });
    const saved = await uploads.submit({ ownerId: 'alice', requestId: 'share', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } }), uploadId = saved.uploads[0]!.id;
    expect((await request('alice', { type: 'upload-equip', requestId: 'wear', expectedRevision: 1, slotId: 'profile-emblem', uploadId })).error).toBe('');
    const read = { type: 'upload-read', requestId: 'read', ownerId: 'alice', uploadId };
    expect((await request('bob', read)).raster).not.toBeNull();if (mode === 'private') expect((await request('watcher', read)).raster).not.toBeNull();
    await social.join({ roomId: 'elsewhere', userId: 'outsider' });expect((await uploads.readWithList({ roomId: 'friends', viewerId: 'outsider', ownerId: 'alice', uploadId })).image).toBeNull();
    fail = true;await room.event('bob', { type: 'social-block', requestId: 'block', targetId: 'alice', enabled: true });expect(room.snapshotFor('bob').roomImages.blockedUserIds).toEqual([]);expect(room.snapshotFor('bob').roomImages.error).toContain('Could not save');
    fail = false;await room.event('bob', { type: 'social-block', requestId: 'block', targetId: 'alice', enabled: true });expect(room.snapshotFor('bob').roomImages.blockedUserIds).toEqual(['alice']);expect((await request('bob', read)).raster).toBeNull();
    await room.event('bob', { type: 'social-block', requestId: 'unblock', targetId: 'alice', enabled: false });expect((await request('bob', read)).raster).not.toBeNull();
    const alice = room.ctx.players.get('alice')!;alice.reconnectUntil = 2000;expect(room.snapshotFor('bob').status).toBe('recovering');expect(social.allowCommunication({ roomId: room.id, userId: 'alice', otherUserId: 'bob' })).toBe(true);delete alice.reconnectUntil;
    await uploads.review({ ownerId: 'alice', reviewerId: 'host', requestId: 'revoke', expectedRevision: 2, uploadId, status: 'rejected', reason: 'Removed' });expect((await request('bob', read)).raster).toBeNull();
    await room.leave('alice');expect(social.allowCommunication({ roomId: room.id, userId: 'alice', otherUserId: 'bob' })).toBe(false);expect((await request('bob', read)).raster).toBeNull();
  } finally { await room.dispose('done'); }
  expect(() => social.view({ roomId: room.id, userId: 'bob' })).toThrow('Join');
});

test('failed admission and failed disposal cannot retain friends-room social authority', async () => {
  const social = createRoomSocialService({ services: createDurableMmoServices(createMemoryDurableServiceStore()), persistence: { async loadPlayer() { return null; }, async savePlayer() {} } });
  const uploads = createUploadService({ persistence: { async loadPlayer() { return null; }, async savePlayer() {} }, allowView: () => false });
  const base = createProfileCombatRoom({ contentId: 'game', matchId: 'match', seed: 1, allowedActions: [] });let fail = true;
  const type = withFriendsRoomImages({ social, uploads, room: { ...base, async onJoin(ctx, player, request) { if (fail) throw Error('admission failed');await base.onJoin?.(ctx, player, request); }, async onDispose() { throw Error('shutdown failed'); } } });
  const room = createAuthoritativeRoom({ id: 'failure', type, now: () => 1000, metrics: { record() {} } });
  const join = () => room.join({ id: 'a', userId: 'alice', roomId: room.id, sessionId: 'a', joinedAt: 0, lastInputAt: 0 }, { contentId: 'game', matchId: 'match', profileVersion: profileProtocolVersion });
  await expect(join()).rejects.toThrow('admission failed');expect(() => social.view({ roomId: room.id, userId: 'alice' })).toThrow('Join');
  await expect(room.dispose('failed-admission')).rejects.toThrow('shutdown failed');
  fail = false;const next = createAuthoritativeRoom({ id: 'next', type, now: () => 1000, metrics: { record() {} } });
  expect(await next.join({ id: 'b', userId: 'alice', roomId: 'next', sessionId: 'b', joinedAt: 0, lastInputAt: 0 }, { contentId: 'game', matchId: 'match', profileVersion: profileProtocolVersion })).toEqual({ ok: true });
  expect(social.view({ roomId: 'next', userId: 'alice' }).blocked).toEqual([]);
  await expect(next.dispose('test')).rejects.toThrow('shutdown failed');expect(() => social.view({ roomId: 'next', userId: 'alice' })).toThrow('Join');
});
