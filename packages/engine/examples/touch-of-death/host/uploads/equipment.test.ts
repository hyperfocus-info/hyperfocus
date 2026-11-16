import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { requireArray } from '@hyperfocus/utilities/validation';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { readUploadCommand, readUploadResponse } from '../../src/uploads/protocol.ts';
import { createUploadService } from './service.ts';

const raster = { width: 1, height: 1, rgba: 'AQEBAQ==' };
function fixture() {
  const records = new Map<string, unknown>();let fail = false, uncertain = false;
  const persistence = { async loadPlayer(key: string) { return structuredClone(records.get(key) ?? null); }, async savePlayer(key: string, value: unknown) { if (fail) throw new Error('disk failed');records.set(key, structuredClone(value));if (uncertain) { uncertain = false;throw new Error('reply lost'); } } };
  const service = createUploadService({ persistence, allowedSlots: ['badge', 'back', 'left', 'right', 'extra'], allowView: ({ viewerId }) => viewerId === 'friend', now: () => 100 });
  const equip = (requestId: string, expectedRevision: number, uploadId: string, slotId = 'badge', ownerId = 'alice') => service.equip({ ownerId, requestId, expectedRevision, uploadId, slotId });
  return { service, persistence, records, equip, set fail(value: boolean) { fail = value; }, set uncertain(value: boolean) { uncertain = value; } };
}

test('equipment immediately references owned unreviewed pictures in allowed slots; removal and rejection clear it atomically', async () => {
  const f = fixture(), submitted = await f.service.submit({ ownerId: 'alice', requestId: 'submit', expectedRevision: 0, raster }), uploadId = submitted.uploads[0]!.id;
  expect((await f.equip('pending', 1, uploadId)).equipment).toEqual({ badge: uploadId });

  await expect(f.equip('foreign', 0, uploadId, 'badge', 'bob')).rejects.toThrow('your available');
  expect(() => f.equip('slot', 2, uploadId, 'unknown')).toThrow('slot');
  expect((await f.equip('equip', 2, uploadId)).equipment).toEqual({ badge: uploadId });
  expect((await f.service.listForViewer({ ownerId: 'alice', viewerId: 'stranger', roomId: 'friends' })).equipment).toEqual({});
  expect((await f.service.listForViewer({ ownerId: 'alice', viewerId: 'friend', roomId: 'friends' })).equipment).toEqual({ badge: uploadId });
  expect((await f.service.readWithList({ ownerId: 'alice', viewerId: 'friend', roomId: 'friends', uploadId })).equipment).toEqual({ badge: uploadId });
  expect((await f.equip('clear', 3, '')).equipment).toEqual({});await f.equip('again', 4, uploadId);
  const rejected = await f.service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'reject', expectedRevision: 5, uploadId, status: 'rejected', reason: 'Removed' });expect(rejected.equipment).toEqual({});
  expect(await f.service.read({ ownerId: 'alice', viewerId: 'alice', roomId: 'friends', uploadId })).toBeNull();expect(JSON.stringify(f.records.get('tod-uploads:alice'))).not.toContain('"rgba":"');
  await expect(f.equip('rejected', 6, uploadId)).rejects.toThrow('available');
});

test('equipment writes retain exact retry receipts, reject concurrent stale edits and survive failed/uncertain saves', async () => {
  const f = fixture(), submitted = await f.service.submit({ ownerId: 'alice', requestId: 'submit', expectedRevision: 0, raster }), uploadId = submitted.uploads[0]!.id;
  await f.service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
  f.fail = true;await expect(f.equip('equip', 2, uploadId)).rejects.toThrow('disk');expect((await f.service.list({ ownerId: 'alice' })).equipment).toEqual({});f.fail = false;
  f.uncertain = true;await expect(f.equip('equip', 2, uploadId)).rejects.toThrow('reply');const retried = await f.equip('equip', 2, uploadId);expect(retried.revision).toBe(3);expect(retried.equipment).toEqual({ badge: uploadId });
  await expect(f.equip('equip', 2, '', 'badge')).rejects.toThrow('another action');
  const results = await Promise.allSettled([f.equip('back', 3, uploadId, 'back'), f.service.remove({ ownerId: 'alice', requestId: 'remove', expectedRevision: 3, uploadId })]);expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  await f.equip('left', 4, uploadId, 'left');await f.equip('right', 5, uploadId, 'right');await expect(f.equip('extra', 6, uploadId, 'extra')).rejects.toThrow('four');
  const removed = await f.service.remove({ ownerId: 'alice', requestId: 'remove-current', expectedRevision: 6, uploadId });expect(removed.equipment).toEqual({});expect(removed.uploads).toEqual([]);
});

test('legacy v1 equipment and receipt omissions migrate on write and SQLite reopen preserves the approved selection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-equipment-'));let db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
  try {
    let service = createUploadService({ persistence: db, allowedSlots: ['badge'], allowView: () => true, now: () => 100 });
    const submitted = await service.submit({ ownerId: 'alice', requestId: 'submit', expectedRevision: 0, raster }), uploadId = submitted.uploads[0]!.id;
    await service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId, status: 'approved', reason: '' });
    const legacy = requireRecord(await db.loadPlayer('tod-uploads:alice'));delete legacy.equipment;for (const receipt of requireArray(legacy.receipts)) delete requireRecord(requireRecord(receipt).result).equipment;await db.savePlayer('tod-uploads:alice', legacy);
    expect((await service.list({ ownerId: 'alice' })).equipment).toEqual({});const saved = await service.equip({ ownerId: 'alice', requestId: 'equip', expectedRevision: 2, slotId: 'badge', uploadId });db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
    service = createUploadService({ persistence: db, allowedSlots: ['badge'], allowView: () => true });expect(await service.equip({ ownerId: 'alice', requestId: 'equip', expectedRevision: 2, slotId: 'badge', uploadId })).toEqual(saved);expect((await service.list({ ownerId: 'alice' })).equipment).toEqual({ badge: uploadId });
    const disabled = createUploadService({ persistence: db, allowView: () => true });expect(() => disabled.equip({ ownerId: 'alice', requestId: 'no-slots', expectedRevision: 3, slotId: 'badge', uploadId })).toThrow('slot');
  } finally { db.close();if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unsafe temporary directory.');await rm(dir, { recursive: true, force: true }); }
});

test('equipment wire migration normalizes legacy responses and rejects unknown fields or unavailable references', () => {
  const response = { type: 'upload-result', requestId: 'list', error: '', ownerId: 'alice', revision: 0, uploads: [], uploadId: '', raster: null };
  expect(readUploadResponse(response).equipment).toEqual({});expect(() => readUploadResponse({ ...response, equipment: { badge: 'missing' } })).toThrow('shared');
  expect(readUploadCommand({ type: 'upload-equip', requestId: 'equip', expectedRevision: 0, slotId: 'badge', uploadId: '' })).toMatchObject({ uploadId: '' });
  expect(() => readUploadCommand({ type: 'upload-equip', requestId: 'equip', expectedRevision: 0, slotId: 'badge', uploadId: '', ownerId: 'someone' })).toThrow();
  const f = fixture();expect(() => createUploadService({ persistence: f.persistence, allowView: () => true, allowedSlots: ['constructor'] })).toThrow('allowlist');
});
