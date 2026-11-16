import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { createVoiceReportService } from './report-service.ts';

const input = { reporterId: 'alice', targetId: 'bob', roomId: 'friends', reporterSessionId: 'voice-a', targetSessionId: 'voice-b', requestId: 'r1', reason: 'harassment' as const };
test('voice incidents persist across SQLite reopen with bounded exact retries and detached evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-incidents-'));let db = createSqlitePersistenceAdapter({ path: join(directory, 'reports.sqlite') });
  try {
    let time = 1000, service = createVoiceReportService({ persistence: db, now: () => time });
    const first = await service.report(input);expect(first).toEqual({ ...input, createdAt: 1000 });
    first.targetId = 'mutation';db.close();db = createSqlitePersistenceAdapter({ path: join(directory, 'reports.sqlite') });
    service = createVoiceReportService({ persistence: db, now: () => time });
    expect(await service.report(input)).toEqual({ ...input, createdAt: 1000 });
    await expect(service.report({ ...input, reason: 'hate' })).rejects.toThrow('already used');
    for (let n = 2; n <= 4; n++) await service.report({ ...input, requestId: `r${n}` });
    await expect(service.report({ ...input, requestId: 'r5' })).rejects.toThrow('four');
    expect(await service.report(input)).toEqual({ ...input, createdAt: 1000 });
    for (let n = 5; n <= 64; n++) { time += 60000;await service.report({ ...input, requestId: `r${n}` }); }
    await expect(service.report({ ...input, requestId: 'r65' })).rejects.toThrow('limit');
    expect(await service.read({ reporterId: 'alice' })).toHaveLength(64);
    expect(() => service.report({ ...input, targetId: 'alice' })).toThrow();
    const forbidden = { ...input, audio: 'forbidden' };
    expect(() => service.report(forbidden)).toThrow();
  } finally { db.close();if (dirname(resolve(directory)) !== resolve(tmpdir())) throw Error('Unsafe fixture cleanup');await rm(directory, { recursive: true, force: true }); }
});

test('failed and uncertain writes are truthful and retry without duplicate incidents', async () => {
  const records = new Map<string, unknown>();let fail = true, uncertain = false;
  const service = createVoiceReportService({ now: () => 1000, persistence: {
    async loadPlayer(key) { return structuredClone(records.get(key) ?? null); },
    async savePlayer(key, value) { if (fail) throw Error('disk failed');records.set(key, structuredClone(value));if (uncertain) { uncertain = false;throw Error('reply lost'); } },
  } });
  await expect(service.report(input)).rejects.toThrow('disk failed');expect(await service.read({ reporterId: 'alice' })).toEqual([]);
  fail = false;uncertain = true;await expect(service.report(input)).rejects.toThrow('reply lost');
  expect(await service.report(input)).toEqual({ ...input, createdAt: 1000 });expect(await service.read({ reporterId: 'alice' })).toHaveLength(1);
  records.set('tod-voice-reports:alice', { version: 1, reports: [{ ...input, createdAt: 1000, data: 'SDP forbidden' }] });
  await expect(service.read({ reporterId: 'alice' })).rejects.toThrow();
});
