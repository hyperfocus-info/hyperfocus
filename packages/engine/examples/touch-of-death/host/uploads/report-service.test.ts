import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { createUploadService } from './service.ts';
import { createUploadReportService } from './report-service.ts';

async function fixture() {
  let time = 1000, fail = false, uncertain = false, visible = true;const records = new Map<string, unknown>();
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, value: unknown) {
    if (id.startsWith('tod-upload-reports:') && fail) throw new Error('disk failed');records.set(id, structuredClone(value));
    if (id.startsWith('tod-upload-reports:') && uncertain) { uncertain = false;throw new Error('response lost'); }
  } };
  const uploads = createUploadService({ persistence, now: () => time, allowView: ({ roomId }) => visible && roomId === 'friends' });
  const reports = createUploadReportService({ persistence, uploads, now: () => time });
  async function image(ownerId: string, approved = true) {
    const state = await uploads.submit({ ownerId, requestId: 'upload', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } });
    const upload = state.uploads[0]!;
    if (approved) await uploads.review({ ownerId, reviewerId: 'moderator', requestId: 'approve', expectedRevision: 1, uploadId: upload.id, status: 'approved', reason: '' });
    return upload;
  }
  const uploaded = await image('artist');
  const input = { reporterId: 'alice', roomId: 'friends', ownerId: 'artist', uploadId: uploaded.id, reason: 'inappropriate' as const, requestId: 'report' };
  return { reports, uploads, persistence, records, image, input, uploaded, advance(ms: number) { time += ms; }, set fail(value: boolean) { fail = value; }, set uncertain(value: boolean) { uncertain = value; }, set visible(value: boolean) { visible = value; } };
}
test('reports bind approved visible image evidence without pixels; exact retries survive revocation', async () => {
  const f = await fixture(), report = await f.reports.report(f.input);
  expect(report).toMatchObject({ reporterId: 'alice', ownerId: 'artist', uploadId: f.uploaded.id, contentId: f.uploaded.contentId, status: 'pending', resolution: '' });
  expect(JSON.stringify(f.records.get('tod-upload-reports:alice'))).not.toContain('rgba');
  expect(await f.reports.report(f.input)).toEqual(report);
  expect(await f.reports.report({ ...f.input, requestId: 'duplicate' })).toEqual(report);
  expect((await f.reports.list({ reporterId: 'alice' })).reports).toHaveLength(1);
  await expect(f.reports.report({ ...f.input, requestId: 'different', reason: 'other' })).rejects.toThrow('another reason');
  await f.uploads.review({ ownerId: 'artist', reviewerId: 'moderator', requestId: 'revoke', expectedRevision: 2, uploadId: f.uploaded.id, status: 'rejected', reason: 'Removed' });
  expect(await f.reports.report(f.input)).toEqual(report);
  await expect(f.reports.report({ ...f.input, requestId: 'new-after-revocation' })).rejects.toThrow('visible');
  await expect(f.reports.report({ ...f.input, reporterId: 'bob' })).rejects.toThrow('visible');
});
test('own, unknown, blocked and wrong-room images cannot create a report', async () => {
  const f = await fixture();
  expect(() => f.reports.report({ ...f.input, reporterId: 'artist' })).toThrow('own image');
  for (const input of [{ ...f.input, uploadId: 'unknown' }, { ...f.input, roomId: 'elsewhere' }]) await expect(f.reports.report(input)).rejects.toThrow('visible');
  f.visible = false;await expect(f.reports.report(f.input)).rejects.toThrow('visible');
  expect((await f.reports.list({ reporterId: 'alice' })).reports).toEqual([]);
});

test('shared unreviewed images can be reported immediately without approving them', async () => {
  const f = await fixture(), pending = await f.image('new-artist', false);
  const input = { ...f.input, ownerId: 'new-artist', uploadId: pending.id };
  const report = await f.reports.report(input);
  expect(report).toMatchObject({ ownerId: 'new-artist', uploadId: pending.id, status: 'pending' });
  expect((await f.uploads.list({ ownerId: 'new-artist' })).uploads[0]).toMatchObject({ status: 'pending', reviewedAt: null, reviewerId: '' });
  expect(await f.reports.report(input)).toEqual(report);
  f.visible = false;
  await expect(f.reports.report({ ...input, reporterId: 'bob' })).rejects.toThrow('visible');
});
test('failed and uncertain report writes preserve exact retries and conflicting payloads reject', async () => {
  const f = await fixture();f.fail = true;await expect(f.reports.report(f.input)).rejects.toThrow('disk failed');expect((await f.reports.list({ reporterId: 'alice' })).revision).toBe(0);
  f.fail = false;f.uncertain = true;await expect(f.reports.report(f.input)).rejects.toThrow('response lost');
  const original = await f.reports.report(f.input);expect((await f.reports.list({ reporterId: 'alice' })).revision).toBe(1);
  await expect(f.reports.report({ ...f.input, reason: 'harassment' })).rejects.toThrow('already used');
  original.resolution = 'tampered';expect((await f.reports.list({ reporterId: 'alice' })).reports[0]?.resolution).toBe('');
});
test('trusted resolutions require revision and explanation, retry atomically and do not moderate the image', async () => {
  const f = await fixture(), report = await f.reports.report(f.input);
  const input = { reporterId: 'alice', reportId: report.id, reviewerId: 'moderator', requestId: 'resolve', expectedRevision: 1, status: 'reviewed' as const, resolution: '  Policy checked. ' };
  for (const resolution of ['', 'x'.repeat(513), 'a\nb']) expect(() => f.reports.resolve({ ...input, resolution })).toThrow();
  f.fail = true;await expect(f.reports.resolve(input)).rejects.toThrow('disk failed');expect((await f.reports.list({ reporterId: 'alice' })).reports[0]?.status).toBe('pending');
  f.fail = false;f.uncertain = true;await expect(f.reports.resolve(input)).rejects.toThrow('response lost');
  const resolved = await f.reports.resolve(input);expect(resolved).toMatchObject({ revision: 2, report: { status: 'reviewed', resolution: 'Policy checked.', reviewerId: 'moderator' } });
  expect(await f.reports.resolve(input)).toEqual(resolved);
  await expect(f.reports.resolve({ ...input, status: 'dismissed' })).rejects.toThrow('already used');
  await expect(f.reports.resolve({ ...input, requestId: 'stale' })).rejects.toThrow('Reload');
  expect((await f.uploads.list({ ownerId: 'artist' })).uploads[0]?.status).toBe('approved');
});
test('new-report rate, durable 64-report cap and bounded receipts never delete existing reports', async () => {
  const f = await fixture();await f.reports.report(f.input);
  for (let n = 1; n < 65; n++) {
    const ownerId = `artist-${n}`, upload = await f.image(ownerId), input = { ...f.input, requestId: `r${n}`, ownerId, uploadId: upload.id };
    if (n === 4) { await expect(f.reports.report(input)).rejects.toThrow('four new');f.advance(60000); }
    else if (n % 4 === 0) f.advance(60000);
    if (n === 64) await expect(f.reports.report(input)).rejects.toThrow('limit');else await f.reports.report(input);
  }
  const stored = requireRecord(f.records.get('tod-upload-reports:alice'));
  expect(stored.reports).toHaveLength(64);expect(stored.receipts).toHaveLength(64);
  expect((await f.reports.list({ reporterId: 'alice' })).reports[0]?.uploadId).toBe(f.uploaded.id);
});
test('real SQLite reopen retains evidence and moderator receipt without persisting image bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-image-reports-'));let db = createSqlitePersistenceAdapter({ path: join(dir, 'reports.sqlite') });
  try {
    let uploads = createUploadService({ persistence: db, allowView: () => true, now: () => 1000 });
    const uploaded = (await uploads.submit({ ownerId: 'artist', requestId: 'upload', expectedRevision: 0, raster: { width: 1, height: 1, rgba: 'AQEBAQ==' } })).uploads[0]!;
    await uploads.review({ ownerId: 'artist', reviewerId: 'mod', requestId: 'approve', expectedRevision: 1, uploadId: uploaded.id, status: 'approved', reason: '' });
    const input = { reporterId: 'alice', ownerId: 'artist', uploadId: uploaded.id, roomId: 'friends', requestId: 'report', reason: 'copyright' as const };
    const report = await createUploadReportService({ persistence: db, uploads, now: () => 1001 }).report(input);
    db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'reports.sqlite') });uploads = createUploadService({ persistence: db, allowView: () => true });
    const reopened = createUploadReportService({ persistence: db, uploads, now: () => 1002 });expect(await reopened.report(input)).toEqual(report);
    const decision = { reporterId: 'alice', reportId: report.id, reviewerId: 'mod', requestId: 'resolve', expectedRevision: 1, status: 'dismissed' as const, resolution: 'Insufficient evidence.' };
    const result = await reopened.resolve(decision);db.close();db = createSqlitePersistenceAdapter({ path: join(dir, 'reports.sqlite') });
    const final = createUploadReportService({ persistence: db, uploads: createUploadService({ persistence: db, allowView: () => true }) });expect(await final.resolve(decision)).toEqual(result);
  } finally { db.close();if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Unsafe temporary directory.');await rm(dir, { recursive: true, force: true }); }
});
