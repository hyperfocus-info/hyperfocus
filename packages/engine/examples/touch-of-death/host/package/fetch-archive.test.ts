import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchArchive } from './fetch-archive.ts';

test('build download publishes exact verified bytes and rejects corrupt, oversized or missing assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tod-download-test-'));
  try {
    const payload = new Uint8Array([3, 1, 4]), source = { url: 'https://example.invalid/archive', bytes: 3, sha256: new Bun.CryptoHasher('sha256').update(payload).digest('hex') };
    const request = (body: Uint8Array, status = 200) => async () => new Response(new Uint8Array(body), { status });
    await fetchArchive(source, join(root, 'valid'), request(payload));
    expect(new Uint8Array(await readFile(join(root, 'valid')))).toEqual(payload);
    await expect(fetchArchive(source, join(root, 'corrupt'), request(new Uint8Array([3, 1, 5])))).rejects.toThrow('verification failed');
    await expect(fetchArchive(source, join(root, 'oversized'), request(new Uint8Array(4)))).rejects.toThrow('verification failed');
    await expect(fetchArchive(source, join(root, 'truncated'), request(new Uint8Array(2)))).rejects.toThrow('verification failed');
    await expect(fetchArchive(source, join(root, 'missing'), request(new Uint8Array(), 404))).rejects.toThrow('HTTP 404');
    expect(await readdir(root)).toEqual(['valid']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
