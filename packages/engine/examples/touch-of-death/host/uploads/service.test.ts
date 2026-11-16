import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { requireArray } from '@hyperfocus/utilities/validation';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { createUploadService } from './service.ts';

const raster = (byte = 1, width = 1, height = 1) => ({ width, height, rgba: Buffer.alloc(width * height * 4, byte).toString('base64') });
function fixture() {
  let time = 1000, fail = false, uncertain = false;const records = new Map<string, unknown>();
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, value: unknown) {
    if (fail) throw new Error('disk failed');records.set(id, structuredClone(value));if (uncertain) { uncertain = false;throw new Error('response lost'); }
  } };
  const service = createUploadService({ persistence, now: () => time, allowView: ({ viewerId }) => viewerId === 'friend' });
  const submit = (requestId = 'one', expectedRevision = 0, image = raster(), ownerId = 'alice') => service.submit({ ownerId, requestId, expectedRevision, raster: image });
  return { service, submit, persistence, records, advance(ms: number) { time += ms; }, set fail(value: boolean) { fail = value; }, set uncertain(value: boolean) { uncertain = value; } };
}
test('unreviewed pixels are immediately visible to eligible peers; audience limits and revocation remain enforced', async () => {
  const f = fixture();expect(await f.service.list({ ownerId: 'alice' })).toEqual({ revision: 0, uploads: [], equipment: {} });
  const saved = await f.submit(), uploadId = saved.uploads[0]!.id;
  expect(saved.uploads[0]).toMatchObject({ status: 'pending', width: 1, height: 1 });expect('rgba' in saved.uploads[0]!).toBe(false);
  expect((await f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'alice', uploadId }))?.raster).toEqual(raster());
  expect((await f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'friend', uploadId }))?.raster).toEqual(raster());
  await f.service.review({ ownerId: 'alice', reviewerId: 'moderator', requestId: 'approved', expectedRevision: 1, uploadId, status: 'approved', reason: 'Looks good' });
  expect(await f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'stranger', uploadId })).toBeNull();expect((await f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'friend', uploadId }))?.raster).toEqual(raster());
  const revoking = f.service.review({ ownerId: 'alice', reviewerId: 'moderator', requestId: 'revoke', expectedRevision: 2, uploadId, status: 'rejected', reason: 'Policy violation' });
  const reading = f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'friend', uploadId });await revoking;expect(await reading).toBeNull();
  expect(await f.service.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'alice', uploadId })).toBeNull();
  expect(JSON.stringify(f.records.get('tod-uploads:alice'))).not.toContain('"rgba":"');
  expect((await f.service.list({ ownerId: 'alice' })).uploads[0]?.reason).toBe('Policy violation');
  await expect(f.service.review({ ownerId: 'alice', reviewerId: 'moderator', requestId: 'undo', expectedRevision: 3, uploadId, status: 'approved', reason: '' })).rejects.toThrow('pixels were removed');
});
test('deduplication includes dimensions, is owner-scoped and retains four uploads with bounded rates', async () => {
  const f = fixture();const first = await f.submit('one', 0, raster(1, 1, 2));
  const duplicate = await f.submit('two', 1, raster(1, 1, 2));expect(duplicate.uploads).toEqual(first.uploads);expect(duplicate.revision).toBe(2);
  const differentShape = await f.submit('three', 2, raster(1, 2, 1));expect(differentShape.uploads[0]?.contentId).not.toBe(differentShape.uploads[1]?.contentId);
  const other = await f.submit('one', 0, raster(1, 1, 2), 'bob');expect(other.uploads[0]?.contentId).toBe(first.uploads[0]?.contentId);expect(other.uploads[0]?.id).not.toBe(first.uploads[0]?.id);
  await f.submit('four', 3, raster(2));const full = await f.submit('five', 4, raster(3));
  await expect(f.submit('six', 5, raster(4))).rejects.toThrow('four uploads');
  await f.service.remove({ ownerId: 'alice', requestId: 'remove', expectedRevision: 5, uploadId: full.uploads[0]!.id });
  await expect(f.submit('six', 6, raster(4))).rejects.toThrow('four new');f.advance(60000);expect((await f.submit('six', 6, raster(4))).uploads).toHaveLength(4);
  await expect(f.service.remove({ ownerId: 'bob', requestId: 'steal', expectedRevision: 1, uploadId: full.uploads[1]!.id })).rejects.toThrow('this owner');
});
test('failed and uncertain commits, concurrent revisions, conflicting receipts and detached state are safe', async () => {
  const f = fixture();f.fail = true;await expect(f.submit()).rejects.toThrow('disk failed');expect((await f.service.list({ ownerId: 'alice' })).revision).toBe(0);
  f.fail = false;f.uncertain = true;await expect(f.submit()).rejects.toThrow('response lost');const first = await f.submit();expect(first.revision).toBe(1);
  await expect(f.submit('one', 0, raster(2))).rejects.toThrow('already used');
  const competing = await Promise.allSettled([f.submit('two', 1, raster(2)), f.submit('three', 1, raster(3))]);expect(competing.filter(value => value.status === 'fulfilled')).toHaveLength(1);
  first.uploads[0]!.reason = 'mutated';expect((await f.service.list({ ownerId: 'alice' })).uploads[0]?.reason).toBe('');
  f.fail = true;await expect(f.service.remove({ ownerId: 'alice', requestId: 'remove', expectedRevision: 2, uploadId: first.uploads[0]!.id })).rejects.toThrow('disk failed');
  expect((await f.service.list({ ownerId: 'alice' })).uploads).toHaveLength(2);
});
test('malformed raster, stored tampering and oversized review fields fail closed', async () => {
  const f = fixture();
  for (const invalid of [{ ...raster(), url: 'https://example.com' }, { ...raster(), mimeType: 'image/png' }, { width: 129, height: 1, rgba: '' }, { ...raster(), rgba: 'AAAA' }, JSON.parse('{"width":1,"height":1,"rgba":"AAAAAA==","__proto__":{}}')]) {
    expect(() => f.service.submit({ ownerId: 'alice', requestId: 'bad', expectedRevision: 0, raster: invalid })).toThrow();
  }
  const saved = await f.submit(), uploadId = saved.uploads[0]!.id;
  expect(() => f.service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'bad', expectedRevision: 1, uploadId, status: 'rejected', reason: 'x'.repeat(513) })).toThrow();
  const raw = requireRecord(f.records.get('tod-uploads:alice'));requireRecord(requireArray(raw.uploads)[0]).rgba = raster(2).rgba;
  await expect(f.service.list({ ownerId: 'alice' })).rejects.toThrow('content identity');
});
test('owner activity cannot prevent trusted revocation, and receipt history stays bounded', async () => {
  const f = fixture();let state = await f.submit();const uploadId = state.uploads[0]!.id;
  for (let n = 1; n < 20; n++) state = await f.submit(`dup${n}`, state.revision);
  await expect(f.submit('rate', state.revision)).rejects.toThrow('Too many');
  state = await f.service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'revoke', expectedRevision: state.revision, uploadId, status: 'rejected', reason: '' });
  for (let n = 0; n < 66; n++) state = await f.service.review({ ownerId: 'alice', reviewerId: 'mod', requestId: `r${n}`, expectedRevision: state.revision, uploadId, status: 'rejected', reason: '' });
  expect(requireRecord(f.records.get('tod-uploads:alice')).receipts).toHaveLength(64);
  await expect(f.submit()).rejects.toThrow('Reload');
});
test('real SQLite reopen preserves pending ownership, review state and uncertain-safe receipts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-uploads-'));let db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
  try {
    const service = createUploadService({ persistence: db, allowView: () => true, now: () => 1000 });
    const input = { ownerId: 'alice', requestId: 'one', expectedRevision: 0, raster: raster(3, 128, 128) };
    const first = await service.submit(input);db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
    const reopened = createUploadService({ persistence: db, allowView: () => true, now: () => 1001 });
    expect(await reopened.submit(input)).toEqual(first);expect((await reopened.read({ ownerId: 'alice', roomId: 'friends', viewerId: 'stranger', uploadId: first.uploads[0]!.id }))?.raster).toEqual(input.raster);
    await reopened.review({ ownerId: 'alice', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId: first.uploads[0]!.id, status: 'approved', reason: '' });
    db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
    expect((await createUploadService({ persistence: db, allowView: () => true }).read({ ownerId: 'alice', roomId: 'friends', viewerId: 'friend', uploadId: first.uploads[0]!.id }))?.raster).toEqual(input.raster);
  } finally { db.close();if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unsafe temporary directory.');await rm(dir, { recursive: true, force: true }); }
});

test('unreviewed account emblem and outfit equip immediately and persist; revocation and removal clear matching equipment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-emblem-'));let db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });
  const open = () => createUploadService({ persistence: db, allowView: () => true, allowedSlots: ['profile-emblem', 'top-print'], now: () => 1000 });
  try {
    let service = open();expect(service.supportsSlot({ slotId: 'profile-emblem' })).toBe(true);
    let state = await service.submit({ ownerId: 'alice', requestId: 'one', expectedRevision: 0, raster: raster(1) });const emblem = state.uploads[0]!.id;
    state = await service.equip({ ownerId: 'alice', requestId: 'pending', expectedRevision: 1, slotId: 'profile-emblem', uploadId: emblem });
    state = await service.submit({ ownerId: 'alice', requestId: 'two', expectedRevision: state.revision, raster: raster(2) });const top = state.uploads.find(value => value.id !== emblem)!.id;
    for (const [slotId, uploadId] of [['profile-emblem', emblem], ['top-print', top]] as const) state = await service.equip({ ownerId: 'alice', requestId: slotId, expectedRevision: state.revision, slotId, uploadId });
    db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'uploads.sqlite') });service = open();
    expect((await service.list({ ownerId: 'alice' })).equipment).toEqual({ 'profile-emblem': emblem, 'top-print': top });
    const visible = await service.listForViewer({ ownerId: 'alice', viewerId: 'friend', roomId: 'friends' });
    expect(visible.equipment).toEqual({ 'profile-emblem': emblem, 'top-print': top });
    expect(visible.uploads.every(upload => upload.status === 'pending' && upload.reviewedAt === null && upload.reviewerId === '')).toBe(true);
    const image = await service.readWithList({ ownerId: 'alice', viewerId: 'friend', roomId: 'friends', uploadId: top });
    expect(image.image?.raster).toEqual(raster(2));expect(image.equipment).toEqual(visible.equipment);
    await expect(service.equip({ ownerId: 'bob', requestId: 'foreign', expectedRevision: 0, slotId: 'top-print', uploadId: top })).rejects.toThrow('your available pictures');
    state = await service.review({ ownerId: 'alice', reviewerId: 'host', requestId: 'revoke', expectedRevision: state.revision, uploadId: emblem, status: 'rejected', reason: '' });
    expect(state.equipment).toEqual({ 'top-print': top });
    await expect(service.equip({ ownerId: 'alice', requestId: 'rejected', expectedRevision: state.revision, slotId: 'profile-emblem', uploadId: emblem })).rejects.toThrow('your available pictures');
    expect(await service.read({ ownerId: 'alice', viewerId: 'friend', roomId: 'friends', uploadId: emblem })).toBeNull();
    state = await service.remove({ ownerId: 'alice', requestId: 'remove', expectedRevision: state.revision, uploadId: top });expect(state.equipment).toEqual({});
    const unsupported = createUploadService({ persistence: db, allowView: () => true });expect(unsupported.supportsSlot({ slotId: 'profile-emblem' })).toBe(false);
    expect(() => unsupported.equip({ ownerId: 'alice', requestId: 'unsupported', expectedRevision: state.revision, slotId: 'profile-emblem', uploadId: '' })).toThrow('unavailable');
  } finally { db.close();if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unsafe temporary directory.');await rm(dir, { recursive: true, force: true }); }
});
test('change listeners run only after commits, recover uncertain retries and cannot fail a committed write', async () => {
  const f = fixture(), events: string[] = [];
  const remove = f.service.onChange(ownerId => { events.push(ownerId); });f.service.onChange(() => { throw new Error('observer failed'); });
  f.fail = true;await expect(f.submit()).rejects.toThrow('disk failed');expect(events).toEqual([]);
  f.fail = false;f.uncertain = true;await expect(f.submit()).rejects.toThrow('response lost');expect(events).toEqual([]);
  expect((await f.submit()).revision).toBe(1);expect(events).toEqual(['alice']);
  const pair = await f.service.readWithList({ ownerId: 'alice', viewerId: 'alice', roomId: 'friends', uploadId: (await f.service.list({ ownerId: 'alice' })).uploads[0]!.id });
  expect(pair.image?.upload).toEqual(pair.uploads[0]);
  remove();await f.submit('second', 1, raster(2));expect(events).toEqual(['alice']);
});
