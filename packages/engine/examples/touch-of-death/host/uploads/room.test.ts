import { isObject } from '@hyperfocus/utilities/records';
import { expect, test } from 'bun:test';
import { defineSchema } from '@hyperfocus/engine/protocol';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { RoomType } from '@hyperfocus/engine/server';
import { readUploadResponse } from '../../src/uploads/protocol.ts';
import { createUploadService } from './service.ts';
import { withRoomUploads } from './room.ts';
import { createUploadReportService } from './report-service.ts';

async function fixture(withReports = false, equipment = false, emblem = false) {
  const records = new Map<string, unknown>();let blocked = false, fail = false, playing = false, audience = true;
  const persistence = { async loadPlayer(id: string) { return records.get(id) ?? null; }, async savePlayer(id: string, value: unknown) { if (fail) throw new Error('secret database path');records.set(id, structuredClone(value)); } };
  const uploads = createUploadService({ persistence, allowedSlots: ['badge', ...(emblem ? ['profile-emblem'] : [])],
    allowView: ({ roomId }) => roomId === 'friends' && !blocked });
  const reports = createUploadReportService({ persistence, uploads });
  const base: RoomType<{ frame: number }, unknown, unknown, { frame: number }> = { name: 'test', schema: defineSchema({ frame: 'u32' }), maxPlayers: 3, createState: () => ({ frame: 0 }), getSnapshot: ctx => ({ frame: ctx.state.frame }) };
  const room = createAuthoritativeRoom({ id: 'friends', type: withRoomUploads({ room: base, uploads, reports: withReports ? reports : undefined, canEquip: equipment ? () => !playing : undefined, canView: () => audience }), now: () => 1, metrics: { record() {} } });
  for (const id of ['a', 'b', 'c']) await room.join({ id, userId: `user-${id}`, sessionId: id, roomId: 'friends', joinedAt: 0, lastInputAt: 0 });
  async function request(player: string, command: unknown) { await room.event(player, command);const deliveries = room.drainBroadcasts().filter(delivery => (isObject(delivery.event) ? delivery.event.type : undefined) === 'upload-result');expect(deliveries).toHaveLength(1);expect(deliveries[0]?.recipients).toEqual([player]);return readUploadResponse(deliveries[0]!.event); }
  return { room, uploads, reports, request, set audience(value: boolean) { audience = value; }, set blocked(value: boolean) { blocked = value; }, set fail(value: boolean) { fail = value; }, set playing(value: boolean) { playing = value; } };
}

test('every image response explicitly advertises only the configured emblem capability', async () => {
  for (const enabled of [false, true]) {
    const f = await fixture(false, true, enabled);
    const saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });
    expect(saved.emblemEnabled).toBe(enabled);const uploadId = saved.uploads[0]!.id;
    await f.uploads.review({ ownerId: 'user-a', reviewerId: 'host', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
    const equipped = await f.request('a', { type: 'upload-equip', requestId: 'emblem', expectedRevision: 2, slotId: 'profile-emblem', uploadId });
    expect(equipped.emblemEnabled).toBe(enabled);expect(equipped.error === '').toBe(enabled);
    expect((await f.request('b', { type: 'upload-list', requestId: 'list', ownerId: 'user-a' })).emblemEnabled).toBe(enabled);
    expect((await f.request('b', { type: 'upload-read', requestId: 'read', ownerId: 'user-a', uploadId })).emblemEnabled).toBe(enabled);
  }
});

test('pair audience is rechecked after storage awaits and denied receipts expose no metadata or pixels', async () => {
  const f = await fixture(), saved = await f.uploads.submit({ ownerId: 'user-a', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } }), uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'host', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
  const read = f.uploads.readWithList;
  f.uploads.readWithList = async input => { const result = await read(input);f.audience = false;return result; };
  const result = await f.request('b', { type: 'upload-read', requestId: 'read', ownerId: 'user-a', uploadId });
  expect(result).toMatchObject({ uploads: [], equipment: {}, raster: null, uploadId: '', revision: 0 });expect(result.error).toContain('audience changed');
  expect((await f.request('b', { type: 'upload-list', requestId: 'list', ownerId: 'user-a' })).uploads).toEqual([]);
  expect((await f.request('a', { type: 'upload-list', requestId: 'own', ownerId: '' })).uploads).toHaveLength(1);
});

test('equipping requires explicit room permission, rejects active fights and never accepts another owner', async () => {
  for (const enabled of [false, true]) {
    const f = await fixture(false, enabled), saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } }), uploadId = saved.uploads[0]!.id;
    await f.uploads.review({ ownerId: 'user-a', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
    const command = { type: 'upload-equip', requestId: 'equip', expectedRevision: 2, slotId: 'badge', uploadId };
    if (!enabled) { expect((await f.request('a', command)).error).toContain('between fights');continue; }
    f.playing = true;expect((await f.request('a', command)).error).toContain('between fights');expect((await f.uploads.list({ ownerId: 'user-a' })).revision).toBe(2);
    f.playing = false;expect((await f.request('b', { ...command, expectedRevision: 0 })).error).not.toBe('');
    const equipped = await f.request('a', command);expect(equipped.equipment).toEqual({ badge: uploadId });
    expect((await f.request('b', { type: 'upload-list', requestId: 'visible', ownerId: 'user-a' })).equipment).toEqual({ badge: uploadId });
    expect((await f.request('a', { ...command, requestId: 'spoof', expectedRevision: 3, ownerId: 'user-b' })).error).not.toBe('');
    expect((await f.request('a', { ...command, requestId: 'unequip', expectedRevision: 3, uploadId: '' })).equipment).toEqual({});
  }
});

test('empty equipment list subscribes a peer to first equip and subscriptions clean up on departure', async () => {
  const f = await fixture(false, true), saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } }), uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });f.room.drainBroadcasts();
  expect((await f.request('b', { type: 'upload-list', requestId: 'empty', ownerId: 'user-a' })).equipment).toEqual({});
  await f.uploads.equip({ ownerId: 'user-a', requestId: 'first', expectedRevision: 2, slotId: 'badge', uploadId });
  expect(f.room.drainBroadcasts()[0]!.recipients!.slice().sort()).toEqual(['a', 'b']);
  await f.request('b', { type: 'upload-list', requestId: 'refresh', ownerId: 'user-a' });await f.room.leave('b', 'disconnect');f.room.drainBroadcasts();
  await f.uploads.equip({ ownerId: 'user-a', requestId: 'clear', expectedRevision: 3, slotId: 'badge', uploadId: '' });expect(f.room.drainBroadcasts()[0]!.recipients).toEqual(['a']);
});

test('an empty approved list subscribes and a concurrent revocation cannot publish stale equipment metadata', async () => {
  const f = await fixture(false, true);
  expect((await f.request('b', { type: 'upload-list', requestId: 'before-any', ownerId: 'user-a' })).uploads).toEqual([]);
  const saved = await f.uploads.submit({ ownerId: 'user-a', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });
  expect(f.room.drainBroadcasts()[0]!.recipients!.slice().sort()).toEqual(['a', 'b']);const uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });await f.uploads.equip({ ownerId: 'user-a', requestId: 'equip', expectedRevision: 2, slotId: 'badge', uploadId });f.room.drainBroadcasts();
  const list = f.uploads.listForViewer;f.uploads.listForViewer = async input => {
    const result = await list(input);await f.uploads.review({ ownerId: 'user-a', reviewerId: 'mod', requestId: 'revoke', expectedRevision: 3, uploadId, status: 'rejected', reason: '' });return result;
  };
  const stale = await f.request('b', { type: 'upload-list', requestId: 'race', ownerId: 'user-a' });expect(stale.error).toContain('Images changed');expect(stale.uploads).toEqual([]);expect(stale.equipment).toEqual({});
});
test('gallery shares unreviewed images with authenticated room audiences without simulation changes', async () => {
  const f = await fixture(), raster = { width: 1, height: 1, rgba: 'AQEBAQ==' };
  const saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster });expect(saved.error).toBe('');expect(saved.ownerId).toBe('user-a');const uploadId = saved.uploads[0]!.id;
  expect((await f.request('b', { type: 'upload-list', requestId: 'shared', ownerId: 'user-a' })).uploads).toMatchObject([{ id: uploadId, status: 'pending' }]);
  expect((await f.request('b', { type: 'upload-read', requestId: 'unreviewed', ownerId: 'user-a', uploadId })).raster).toEqual(raster);
  const own = await f.request('a', { type: 'upload-read', requestId: 'own', ownerId: '', uploadId });expect(own.raster).toEqual(raster);expect(JSON.stringify(own)).not.toContain('reviewerId');
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'review', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
  const visible = await f.request('b', { type: 'upload-read', requestId: 'visible', ownerId: 'user-a', uploadId });expect(visible.raster).toEqual(raster);expect(visible.revision).toBe(0);
  f.blocked = true;expect((await f.request('b', { type: 'upload-read', requestId: 'blocked', ownerId: 'user-a', uploadId })).raster).toBeNull();
  f.blocked = false;await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'revoke', expectedRevision: 2, uploadId, status: 'rejected', reason: 'Removed' });
  expect((await f.request('b', { type: 'upload-list', requestId: 'revoked', ownerId: 'user-a' })).uploads).toEqual([]);
  expect(f.room.snapshotFor('a')).toEqual({ frame: 0 });
});
test('committed review, removal, block and departure invalidate only cached viewers and owner', async () => {
  const f = await fixture(), raster = { width: 1, height: 1, rgba: 'AQEBAQ==' };
  let saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster });let uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });f.room.drainBroadcasts();
  const read = () => f.request('b', { type: 'upload-read', requestId: crypto.randomUUID(), ownerId: 'user-a', uploadId });
  await read();
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'revoke', expectedRevision: 2, uploadId, status: 'rejected', reason: '' });
  let deliveries = f.room.drainBroadcasts();expect(deliveries).toHaveLength(1);expect(deliveries[0]?.event).toEqual({ type: 'upload-invalidate', ownerId: 'user-a' });expect([...deliveries[0]!.recipients!].sort()).toEqual(['a', 'b']);
  await f.uploads.remove({ ownerId: 'user-a', requestId: 'remove', expectedRevision: 3, uploadId });f.room.drainBroadcasts();
  saved = await f.request('a', { type: 'upload-submit', requestId: 'new', expectedRevision: 4, raster });uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'newapprove', expectedRevision: 5, uploadId, status: 'approved', reason: '' });f.room.drainBroadcasts();
  await read();await f.room.event('b', { type: 'social-block', requestId: 'block', targetId: 'user-a', enabled: true });
  deliveries = f.room.drainBroadcasts();expect([...deliveries[0]!.recipients!].sort()).toEqual(['a', 'b']);
  await read();await f.room.leave('a', 'disconnect');deliveries = f.room.drainBroadcasts();expect(deliveries[0]?.recipients).toEqual(['b']);expect(f.room.snapshotFor('b')).toEqual({ frame: 0 });
});
test('clients cannot select mutation owners or review; unavailable peers and storage errors expose no pixels or internals', async () => {
  const f = await fixture();
  for (const command of [{ type: 'upload-submit', requestId: 'spoof', ownerId: 'user-b', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } },
    { type: 'upload-review', requestId: 'review', ownerId: 'user-b', status: 'approved' }, { type: 'upload-list', requestId: 'outsider', ownerId: 'outside' }]) {
    const result = await f.request('a', command);expect(result.error).not.toBe('');expect(result.raster).toBeNull();
  }
  f.fail = true;const failed = await f.request('a', { type: 'upload-submit', requestId: 'disk', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });expect(failed.error).not.toContain('secret');expect(failed.uploads).toEqual([]);
  await f.room.leave('a', 'disconnect');await f.room.event('a', { type: 'upload-list', requestId: 'departed', ownerId: '' });expect(f.room.drainBroadcasts()).toEqual([]);
});
test('a review overtaking an authorized read cannot publish the old pixels; removal invalidates cached readers', async () => {
  const f = await fixture();const saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });
  const uploadId = saved.uploads[0]!.id;
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'trusted', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });f.room.drainBroadcasts();
  await f.request('b', { type: 'upload-read', requestId: 'cache', ownerId: 'user-a', uploadId });
  const read = f.uploads.readWithList;
  f.uploads.readWithList = async input => {
    const result = await read(input);
    await f.uploads.remove({ ownerId: 'user-a', requestId: 'remove', expectedRevision: 2, uploadId });
    return result;
  };
  await f.room.event('b', { type: 'upload-read', requestId: 'racing', ownerId: 'user-a', uploadId });
  const deliveries = f.room.drainBroadcasts(), invalidation = deliveries.find(delivery => (isObject(delivery.event) ? delivery.event.type : undefined) === 'upload-invalidate');
  expect([...invalidation!.recipients!].sort()).toEqual(['a', 'b']);
  const result = readUploadResponse(deliveries.find(delivery => (isObject(delivery.event) ? delivery.event.type : undefined) === 'upload-result')!.event);
  expect(result.raster).toBeNull();expect(result.error).toContain('Images changed');
});
test('image reports acknowledge only the authenticated reporter and never change moderation or combat', async () => {
  const f = await fixture(true), saved = await f.request('a', { type: 'upload-submit', requestId: 'submit', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });
  const uploadId = saved.uploads[0]!.id, command = { type: 'upload-report', requestId: 'report', ownerId: 'user-a', uploadId, reason: 'inappropriate' };
  expect((await f.request('b', { ...command, requestId: 'pending' })).error).toBe('');
  expect((await f.request('a', { ...command, requestId: 'self' })).error).not.toBe('');
  expect((await f.request('b', { ...command, reporterId: 'user-c', requestId: 'spoof' })).error).not.toBe('');
  expect(await f.request('b', command)).toMatchObject({ requestId: 'report', error: '', ownerId: 'user-a', uploadId, uploads: [], raster: null });
  expect((await f.reports.list({ reporterId: 'user-b' })).reports[0]).toMatchObject({ ownerId: 'user-a', roomId: 'friends', contentId: saved.uploads[0]!.hash, status: 'pending' });
  expect((await f.reports.list({ reporterId: 'user-c' })).reports).toEqual([]);expect((await f.uploads.list({ ownerId: 'user-a' })).uploads[0]?.status).toBe('pending');
  await f.uploads.review({ ownerId: 'user-a', reviewerId: 'moderator', requestId: 'revoke', expectedRevision: 1, uploadId, status: 'rejected', reason: 'Removed' });f.room.drainBroadcasts();
  expect((await f.request('b', command)).error).toBe('');expect((await f.reports.list({ reporterId: 'user-b' })).reports).toHaveLength(1);
  expect(f.room.snapshotFor('a')).toEqual({ frame: 0 });
  const disabled = await fixture();expect((await disabled.request('b', command)).error).toContain('not available');
});
