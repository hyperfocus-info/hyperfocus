import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAiReceiptHandler } from './ai-receipts.ts';
import { createDemoOriginPolicy } from './public-origin.ts';

test('local receipt route is exact-origin GET only, no path query, CORS or public exposure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tod-receipts-'));
  try {
    const path = join(root, 'receipts.json'), receipt = { identity: 'build', session: 'match', digest: 'a'.repeat(64), ingestedAt: 1, analysisId: 'review' };
    await Bun.write(path, JSON.stringify({ receipts: [receipt] }));
    const handle = await createLocalAiReceiptHandler({ path, port: 8801 });
    const request = (headers?: HeadersInit, suffix = '') => new Request(`http://127.0.0.1:8801/tod-ai-ingestion-receipts${suffix}`, { headers });
    const response = handle(request({ host: '127.0.0.1:8801', 'sec-fetch-site': 'same-origin' }))!;
    expect(response.status).toBe(200);expect(await response.json()).toEqual({ receipts: [receipt] });expect(response.headers.has('access-control-allow-origin')).toBe(false);
    const rejectedHeaders: Record<string, string>[] = [{ origin: 'https://external.example' }, { host: 'external.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'http://127.0.0.1:8802' }];
    for (const headers of rejectedHeaders) expect(handle(request(headers))!.status).toBe(403);
    expect(handle(request({}, '?path=other'))!.status).toBe(404);
    expect(handle(new Request(request(), { method: 'POST' }))!.status).toBe(405);
    expect((await createLocalAiReceiptHandler({ path, port: 8801, publicBinding: true }))(request())!.status).toBe(404);
    expect((await createLocalAiReceiptHandler({ port: 8801 }))(request())!.status).toBe(404);
    const policy = createDemoOriginPolicy({ port: 8801, publicOrigin: 'https://game.example' });
    expect(policy.guard(request({ host: '127.0.0.1:8801' }))).toBeUndefined();
    expect(policy.guard(new Request('https://game.example/tod-ai-ingestion-receipts', { headers: { host: 'game.example' } }))!.status).toBe(404);
    await Bun.write(path, JSON.stringify({ receipts: [{ ...receipt, digest: 'bad' }] }));
    await expect(createLocalAiReceiptHandler({ path, port: 8801 })).rejects.toThrow('invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});
