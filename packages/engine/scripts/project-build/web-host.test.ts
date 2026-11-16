import { test, expect } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createDefaultProject } from '../../src/project/index.ts';
import { createWebPlayable } from '../../src/project/delivery/web.ts';
import { createWebDeliveryHandler, verifyWebDeliveryDirectory } from './web-host.ts';

test('indexed hosting handles ranges, CORS, compression variants, and changed files', async () => {
  const scratch = resolve(import.meta.dir, '../../.local');await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, 'delivery-host-'));
  try {
    const output = await createWebPlayable({ project: createDefaultProject(), assets: [], runtime: {
      entry: 'runtime/entry-123.js', files: [{ path: 'runtime/entry-123.js', mimeType: 'text/javascript', bytes: new TextEncoder().encode('export const answer = 42;') }],
    } });
    for (const file of output.files) { const path = join(directory, file.path);await mkdir(dirname(path), { recursive: true });await writeFile(path, file.bytes); }
    await verifyWebDeliveryDirectory(directory);
    const host = await createWebDeliveryHandler({ directory });
    const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => host.respond(new Request(`http://localhost/${path}`, { headers, method }));
    const range = (await get('runtime/entry-123.js', { Range: 'bytes=0-5' }))!;
    expect(range.status).toBe(206);expect(await range.text()).toBe('export');expect(range.headers.get('Content-Range')).toBe('bytes 0-5/25');
    expect(range.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await get('runtime/entry-123.js', { Range: 'bytes=999-' }))!.status).toBe(416);
    expect((await get('runtime/entry-123.js', { Range: 'bytes=-3' }, 'HEAD'))!.headers.get('Content-Length')).toBe('3');
    const raw = (await get('runtime/entry-123.js', { 'Accept-Encoding': 'gzip;q=0' }))!;
    const compressed = (await get('runtime/entry-123.js', { 'Accept-Encoding': 'gzip' }))!;
    expect(raw.headers.get('Content-Encoding')).toBeNull();expect(raw.headers.get('Vary')).toBe('Accept-Encoding');
    expect(compressed.headers.get('ETag')).not.toBe(raw.headers.get('ETag'));
    expect((await get('runtime/entry-123.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': compressed.headers.get('ETag')! }))!.status).toBe(304);
    expect(await get('build.json')).toBeUndefined();expect(await get('secret.txt')).toBeUndefined();
    await writeFile(join(directory, 'runtime/entry-123.js'), 'changed');
    await expect(verifyWebDeliveryDirectory(directory)).rejects.toThrow('Changed web output');
    expect((await get('runtime/entry-123.js'))!.status).toBe(503);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
