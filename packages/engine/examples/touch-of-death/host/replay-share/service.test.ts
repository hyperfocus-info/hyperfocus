import { expect, test } from 'bun:test';
import { createMemoryDurableServiceStore, createSqliteDurableServiceStore } from '@hyperfocus/engine/server';
import { createCombatRecording } from '@hyperfocus/engine/combat/net';
import { decodeReplayArchive, encodeReplayArchive, replayContentType } from '../../src/replay/archive.ts';
import { createReplayShares, shareLifetime, shareMaxBytes } from './service.ts';
import { createReplayShareHttp } from './http.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function archive(contentId = 'fixture', seed = 7) {
  const recording = createCombatRecording({ matchId: 'bout', contentId, seed, seats: ['one', 'two'] });
  for (let frame = 0; frame < 3; frame++) recording.append({ frames: [0, 1].map(seat => ({ matchId: 'bout', frame, seat, actions: [], direction: { x: 0, y: 0, z: 0 } })) });
  return encodeReplayArchive({ value: { recording: recording.snapshot(), stoppedReason: '', startFrame: 2 } });
}
test('shared bookmarks survive restart, duplicate retries keep one link, and expired records disappear', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tod-share-')), path = join(root, 'shares.sqlite');let at = 1000;
  let store = createSqliteDurableServiceStore({ path });
  try {
    let service = createReplayShares({ store, contentId: 'fixture', now: () => at });
    const first = await service.create('owner', archive());expect(await service.create('owner', archive())).toEqual(first);
    expect(await store.exportRecords()).toHaveLength(1);store.close();store = createSqliteDurableServiceStore({ path });
    service = createReplayShares({ store, contentId: 'fixture', now: () => at });
    expect(decodeReplayArchive({ bytes: (await service.read(first.id))! }).startFrame).toBe(2);
    at += shareLifetime;expect(await service.read(first.id)).toBeUndefined();expect(await store.exportRecords()).toHaveLength(0);
  } finally { store.close();await rm(root, { recursive: true, force: true }); }
});
test('bounded authenticated creation rejects corruption, version mismatch, oversized archives and link farming', async () => {
  const store = createMemoryDurableServiceStore(), service = createReplayShares({ store, contentId: 'fixture' });
  await expect(service.create('owner', archive('different'))).rejects.toThrow('different game');
  await expect(service.create('owner', new Uint8Array(shareMaxBytes + 1))).rejects.toThrow('512 KiB');
  await expect(service.create('owner', new Uint8Array([1]))).rejects.toThrow('envelope');
  for (let seed = 0; seed < 8; seed++) await service.create('owner', archive('fixture', seed));
  await expect(service.create('owner', archive('fixture', 9))).rejects.toThrow('Eight replay');expect(await store.exportRecords()).toHaveLength(8);
  const handle = createReplayShareHttp({ origin: 'http://127.0.0.1:8801', service, authenticate: async token => token === 'valid' ? 'second' : undefined });
  const request = (headers: Record<string, string>) => new Request('http://127.0.0.1:8801/tod-replay-share', { method: 'POST', headers: { origin: 'http://127.0.0.1:8801', 'content-type': replayContentType, ...headers }, body: archive() });
  expect((await handle(request({})))?.status).toBe(401);expect((await handle(request({ authorization: 'Bearer nope' })))?.status).toBe(401);
  expect((await handle(request({ origin: 'https://other.invalid', authorization: 'Bearer valid' })))?.status).toBe(403);
  const response = (await handle(request({ authorization: 'Bearer valid' })))!;expect(response.status).toBe(200);
  const { id } = await response.json();const get = (await handle(new Request(`http://127.0.0.1:8801/tod-replay-share?id=${id}`)))!;
  expect(get.headers.get('content-type')).toBe(replayContentType);expect(decodeReplayArchive({ bytes: new Uint8Array(await get.arrayBuffer()) }).startFrame).toBe(2);
  await store.transaction(tx => { const value = tx.get('replay-share', id);if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Missing fixture record');tx.put('replay-share', id, { ...value, payload: 'hfrp:1:AAAA' }); });
  expect((await handle(new Request(`http://127.0.0.1:8801/tod-replay-share?id=${id}`)))?.status).toBe(503);
});
