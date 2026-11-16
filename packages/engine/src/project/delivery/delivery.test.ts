import { expect, test } from 'bun:test';
import { createDefaultProject, createHyperfocusProjectFiles, openHyperfocusProjectFiles, migrateProject } from '../index.ts';
import { createProjectDelivery } from './build.ts';
import { createDeliveryLoader, openDeliveryCore } from './load.ts';
import { setAssetDeliveryRule } from './policy.ts';

test('delivery diagnostics distinguish cold, shared, warm and failed transfers without claiming heap size', async () => {
  const output = await createProjectDelivery(await fixture());let fail = true;
  const loader = createDeliveryLoader({ manifest: output.manifest, read: async object => {
    await Bun.sleep(1);if (fail) throw Error('Offline');return output.files.find(file => file.path === object.url)!.bytes;
  } });
  await expect(loader.bytes('song')).rejects.toThrow('Offline');fail = false;
  const [a, b] = await Promise.all([loader.bytes('song'), loader.bytes('song')]);
  expect(a).toBe(b);await loader.bytes('song');
  expect(loader.diagnostics()).toMatchObject({ reads: 2, failedReads: 1, sharedReads: 1, cacheHits: 1, receivedBytes: 8, verifiedBytes: 8, activeDeclaredBytes: 0, peakDeclaredBytes: 8 });
  loader.dispose();expect(loader.snapshot().cachedBytes).toBe(0);
});

test('compressed groups verify once, retry corruption, and return complete bytes even with a tiny cache', async () => {
  const opened = await fixture();
  setAssetDeliveryRule({ project: opened.project, assetId: 'sound', rule: { load: 'on-demand', group: 'fight', dependencies: ['extra'] } });
  setAssetDeliveryRule({ project: opened.project, assetId: 'extra', rule: { load: 'on-demand', group: 'fight' } });
  setAssetDeliveryRule({ project: opened.project, assetId: 'song', rule: { load: 'on-demand', group: 'fight', playback: 'stream' } });
  const output = await createProjectDelivery(opened), pack = output.manifest.packs!.fight!;
  expect(pack.assets).toEqual(['extra', 'sound']);
  let corrupt = true;
  const reads: string[] = [];
  const loader = createDeliveryLoader({ manifest: output.manifest, maxCacheBytes: 1, read: async object => {
    reads.push(object.url);await Bun.sleep(1);
    return corrupt ? new Uint8Array(object.size) : output.files.find(file => file.path === object.url)!.bytes;
  } });
  await expect(loader.acquireGroup('fight', { playback: 'buffer' })).rejects.toThrow('integrity');
  corrupt = false;
  const [first, second] = await Promise.all([loader.acquireGroup('fight', { playback: 'buffer' }), loader.acquireGroup('fight', { playback: 'buffer' })]);
  expect(first.map(asset => [...asset.bytes])).toEqual([[3, 3, 3], [1, 1, 1, 1]]);
  expect(second).toEqual(first);expect(reads).toEqual([pack.url, pack.url]);
  const external = await createProjectDelivery({ ...opened, assetUrls: { [pack.sha256]: 'https://app.ufs.sh/f/fight-pack' } });
  expect(external.manifest.packs!.fight!.url).toBe('https://app.ufs.sh/f/fight-pack');
  loader.dispose();
});

async function fixture() {
  const project = createDefaultProject('Delivery fixture');
  project.assets.push(
    { id: 'sound', name: 'hit.wav', mimeType: 'audio/wav', kind: 'audio', size: 4, source: 'imported', lastModified: 0 },
    { id: 'song', name: 'song.mp3', mimeType: 'audio/mpeg', kind: 'audio', size: 8, source: 'imported', lastModified: 0 },
    { id: 'extra', name: 'extra.bin', mimeType: 'application/octet-stream', kind: 'data', size: 3, source: 'imported', lastModified: 0 },
  );
  project.extensions = { fixture: { hit: 'sound', music: 'song' } };
  const pair = await createHyperfocusProjectFiles(project, project.assets.filter(asset => ['sound', 'song', 'extra'].includes(asset.id)).map((asset, index) => ({ ...asset, bytes: new Uint8Array(asset.size).fill(index + 1) })));
  return openHyperfocusProjectFiles(pair.projectJson, pair.assetsArchive, { parseProject: migrateProject });
}

test('default delivery retains canonical identity while startup excludes music and unused content', async () => {
  const opened = await fixture(), before = JSON.stringify(opened.project);
  const output = await createProjectDelivery(opened);
  expect(JSON.stringify(opened.project)).toBe(before);
  expect(output.manifest.groups.startup).toEqual(['sound']);
  expect(output.manifest.groups.music).toEqual(['song']);
  expect(output.manifest.assets).toHaveLength(3);
  const core = output.files.find(file => file.path === output.manifest.core.url)!;
  expect((await openDeliveryCore({ ...opened, manifest: output.manifest, bytes: core.bytes })).map(asset => asset.id)).toEqual(['sound']);
  await expect(openHyperfocusProjectFiles(output.files.find(file => file.path === output.manifest.project.url)!.bytes, core.bytes, { parseProject: migrateProject })).rejects.toThrow();
});

test('required transitive dependencies override optional classification and cycles are rejected', async () => {
  const opened = await fixture();
  setAssetDeliveryRule({ project: opened.project, assetId: 'sound', rule: { load: 'startup', dependencies: ['extra'] } });
  setAssetDeliveryRule({ project: opened.project, assetId: 'extra', rule: { load: 'on-demand' } });
  const output = await createProjectDelivery(opened);
  expect(output.manifest.groups.startup).toEqual(['extra', 'sound']);
  expect(() => setAssetDeliveryRule({ project: opened.project, assetId: 'extra', rule: { load: 'auto', dependencies: ['sound'] } })).toThrow('Cyclic');
});

test('loader deduplicates concurrent requests, verifies integrity, bounds cache, and retries failure', async () => {
  const opened = await fixture(), output = await createProjectDelivery(opened);
  let reads = 0, active = 0, peak = 0, corrupt = true;
  const loader = createDeliveryLoader({ manifest: output.manifest, concurrency: 1, maxCacheBytes: 8, read: async object => {
    reads++;active++;peak = Math.max(peak, active);await Bun.sleep(1);active--;
    return corrupt ? new Uint8Array(object.size) : output.files.find(file => file.path === object.url)!.bytes;
  } });
  await expect(loader.bytes('song')).rejects.toThrow('integrity');
  corrupt = false;
  const [a, b] = await Promise.all([loader.bytes('song'), loader.bytes('song')]);
  expect(a).toBe(b);expect(reads).toBe(2);
  await loader.acquire(['sound', 'extra']);
  expect(peak).toBe(1);expect(loader.snapshot().cachedBytes).toBeLessThanOrEqual(8);
  loader.dispose();await expect(loader.bytes('song')).rejects.toThrow('disposed');
});

test('independent hosts preserve object hashes and reject unsafe URLs', async () => {
  const opened = await fixture(), hash = opened.assets.find(asset => asset.id === 'song')!.sha256;
  const output = await createProjectDelivery({ ...opened, assetUrls: { [hash]: 'https://app.ufs.sh/f/provider-key' } });
  expect(output.manifest.assets.find(asset => asset.id === 'song')!.url).toBe('https://app.ufs.sh/f/provider-key');
  await expect(createProjectDelivery({ ...opened, assetBaseUrl: 'http://unsafe.example/' })).rejects.toThrow('HTTPS');
  await expect(createProjectDelivery({ ...opened, assetUrls: { [hash]: '../private' } })).rejects.toThrow('Invalid relative');
});

test('a synchronously throwing reader cannot poison subsequent retries', async () => {
  const output = await createProjectDelivery(await fixture());let failed = false;
  const loader = createDeliveryLoader({ manifest: output.manifest, read: object => {
    if (!failed) { failed = true;throw Error('Offline'); }
    return Promise.resolve(output.files.find(file => file.path === object.url)!.bytes);
  } });
  await expect(loader.bytes('song')).rejects.toThrow('Offline');
  expect((await loader.bytes('song')).length).toBe(8);loader.dispose();
});

test('disposing an active loader rejects queued work without starting extra reads', async () => {
  const output = await createProjectDelivery(await fixture());
  let release!: () => void, reads = 0;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const loader = createDeliveryLoader({ manifest: output.manifest, concurrency: 1, read: async object => {
    reads++;await blocked;return output.files.find(file => file.path === object.url)!.bytes;
  } });
  const operations = Promise.allSettled([loader.bytes('sound'), loader.bytes('song'), loader.bytes('extra')]);
  expect(loader.snapshot().queued).toBe(2);
  loader.dispose();release();
  expect((await operations).every(result => result.status === 'rejected')).toBe(true);
  expect(reads).toBe(1);expect(loader.snapshot()).toEqual({ active: 0, queued: 0, cachedBytes: 0, cachedObjects: 0 });
});
