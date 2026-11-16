import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { createUploadService } from './service.ts';
import { createUploadReportService } from './report-service.ts';
import { createSqliteModerationIndex } from './moderation-index.ts';
import { createUploadModerationHandler } from './moderation-http.ts';

const token = 'x'.repeat(48), raster = { width: 1, height: 1, rgba: '/wAA/w==' };
function fixture() {
  const records = new Map<string, unknown>();
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); }, async savePlayer(id: string, record: unknown) { records.set(id, structuredClone(record)); } };
  const uploads = createUploadService({ persistence, allowView: () => true }), reports = createUploadReportService({ persistence, uploads });
  const handle = createUploadModerationHandler({ moderator: { token, reviewerId: 'configured-moderator' }, script: 'console.log("review");', uploads, reports, page: ({ kind }) => ({ ids: kind === 'owners' ? ['alice'] : ['bob'], nextCursor: '' }) });
  const request = (command: unknown, headers: Record<string, string> = {}) => {
    const request = new Request('http://127.0.0.1:8801/moderation/api', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
    // Model headers received by the host; UI-preloaded Request filters Origin in its constructor.
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
    return handle(request);
  };
  return { uploads, reports, handle, request };
}

test('moderation HTTP rejects player tokens, cross-origin requests, unknown fields and oversized bodies', async () => {
  const f = fixture(), command = { type: 'moderation-owners', requestId: 'one', cursor: '' };
  expect((await f.request(command, { authorization: 'Bearer dev:alice' }))!.status).toBe(401);
  expect((await f.request(command, { authorization: `Bearer ${'y'.repeat(48)}` }))!.status).toBe(401);
  expect((await f.request(command, { origin: 'http://localhost:3000' }))!.status).toBe(403);
  expect((await f.request(command, { 'content-type': 'text/plain' }))!.status).toBe(415);
  expect((await f.request({ ...command, reviewerId: 'forged' }))!.status).toBe(400);
  expect((await f.request({ ...command, extra: 'x'.repeat(17000) }))!.status).toBe(400);
  const large = new Request('http://127.0.0.1:8801/moderation/api', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000));controller.close(); } }) });
  expect((await f.handle(large))!.status).toBe(400);
  expect((await f.handle(new Request('http://127.0.0.1:8801/moderation/api')))!.status).toBe(405);
  expect(await f.handle(new Request('http://127.0.0.1:8801/combat-config.json'))).toBeNull();
  const page = (await f.handle(new Request('http://127.0.0.1:8801/moderation')))!;
  expect(page.headers.get('cache-control')).toBe('no-store');expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect(await page.text()).not.toContain(token);
});

test('trusted review previews exact pixels, binds reviewer identity, revokes and resolves reports independently', async () => {
  const f = fixture(), saved = await f.uploads.submit({ ownerId: 'alice', requestId: 'submit', expectedRevision: 0, raster }), uploadId = saved.uploads[0]!.id;
  const preview = await (await f.request({ type: 'moderation-preview', requestId: 'preview', ownerId: 'alice', uploadId }))!.json();
  expect(preview.raster).toEqual(raster);expect(preview.revision).toBe(1);
  const review = { type: 'moderation-review', requestId: 'approve', ownerId: 'alice', uploadId, expectedRevision: 1, status: 'approved', reason: 'Reviewed pixels' };
  expect((await (await f.request(review))!.json()).uploads[0].status).toBe('approved');
  expect((await f.uploads.list({ ownerId: 'alice' })).uploads[0]!.reviewerId).toBe('configured-moderator');
  const report = await f.reports.report({ reporterId: 'bob', roomId: 'friends', ownerId: 'alice', uploadId, requestId: 'report', reason: 'other' });
  const resolved = await (await f.request({ type: 'moderation-resolve', requestId: 'resolve', reporterId: 'bob', reportId: report.id, expectedRevision: 1, status: 'reviewed', resolution: 'Inspected and keeping this image.' }))!.json();
  expect(resolved.reports[0].reviewerId).toBe('configured-moderator');expect(resolved.reports[0].status).toBe('reviewed');
  expect((await f.uploads.list({ ownerId: 'alice' })).uploads[0]!.status).toBe('approved');
  const rejected = await (await f.request({ ...review, requestId: 'reject', expectedRevision: 2, status: 'rejected', reason: 'Removed after follow-up review' }))!.json();
  expect(rejected.uploads[0].status).toBe('rejected');
  expect((await (await f.request({ type: 'moderation-preview', requestId: 'removed', ownerId: 'alice', uploadId }))!.json()).raster).toBeNull();
  expect((await (await f.request({ ...review, requestId: 'stale' }))!.json()).error).not.toBe('');
  expect((await f.uploads.list({ ownerId: 'alice' })).revision).toBe(3);
});

test('SQLite moderator index paginates only owned namespaces including Unicode identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tod-mod-')), path = join(dir, 'state.sqlite'), persistence = createSqlitePersistenceAdapter({ path });
  let index: ReturnType<typeof createSqliteModerationIndex> | undefined;
  try {
    for (let n = 0; n < 22; n++) await persistence.savePlayer(`tod-uploads:owner-${String(n).padStart(2, '0')}`, {});
    await persistence.savePlayer('tod-uploads:😀', {});await persistence.savePlayer('tod-upload-reports:bob', {});await persistence.savePlayer('secret-account:alice', {});
    index = createSqliteModerationIndex({ path });const first = index.page({ kind: 'owners', cursor: '' });
    expect(first.ids).toHaveLength(20);expect(first.nextCursor).toBe('owner-19');
    const second = index.page({ kind: 'owners', cursor: first.nextCursor });expect(second.ids).toEqual(['owner-20', 'owner-21', '😀']);expect(second.nextCursor).toBe('');
    expect(index.page({ kind: 'reporters', cursor: '' }).ids).toEqual(['bob']);
    expect(index.page({ kind: 'owners', cursor: "'; DROP TABLE players; --" }).ids.length).toBe(20);
  } finally { index?.close();persistence.close();await rm(dir, { recursive: true, force: true }); }
});
