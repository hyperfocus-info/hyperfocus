import { hashHyperfocusAsset, unpackHyperfocusAssets, type HyperfocusPortableAsset } from '../index.ts';
import { validateDeliveryCatalog, type DeliveryObject, type ProjectDeliveryManifest } from './manifest.ts';
import type { EditorProject } from '../editor.ts';

export type DeliveryReader = (object: DeliveryObject) => Promise<Uint8Array>;

export async function verifyDeliveryObject(options: { object: DeliveryObject; bytes: Uint8Array }) {
  if (options.bytes.length !== options.object.size || await hashHyperfocusAsset(options.bytes) !== options.object.sha256) throw Error(`Delivery integrity check failed: ${options.object.url}`);
  return options.bytes;
}

/** Validate the startup subset without weakening the canonical portable-pair reader. */
export async function openDeliveryCore(options: { manifest: ProjectDeliveryManifest; project: EditorProject; bytes: Uint8Array }) {
  validateDeliveryCatalog(options);
  await verifyDeliveryObject({ object: options.manifest.core, bytes: options.bytes });
  const objects = await unpackHyperfocusAssets(options.bytes, { maxArchiveBytes: 536870912, maxUnpackedBytes: 536870912, maxAssets: 5000 });
  const byHash = new Map(objects.map(object => [object.sha256, object.bytes]));
  const expected = options.manifest.assets.filter(asset => options.manifest.groups.startup!.includes(asset.id));
  if (byHash.size !== new Set(expected.map(asset => asset.sha256)).size) throw Error('Startup archive contains unexpected objects.');
  return expected.map((asset): HyperfocusPortableAsset => {
    const bytes = byHash.get(asset.sha256);
    if (!bytes || bytes.length !== asset.size) throw Error(`Startup asset is missing or changed: ${asset.id}`);
    return { id: asset.id, name: asset.name, mimeType: asset.mimeType, sha256: asset.sha256, bytes };
  });
}

/** A bounded, deduplicated cache. Returned bytes are borrowed and must not be mutated. */
export function createDeliveryLoader(options: {
  manifest: ProjectDeliveryManifest; read: DeliveryReader; initial?: readonly HyperfocusPortableAsset[];
  concurrency?: number; maxCacheBytes?: number;
}) {
  const limit = options.concurrency ?? 4, budget = options.maxCacheBytes ?? 67108864;
  if (!Number.isInteger(limit) || limit < 1 || limit > 16 || !Number.isSafeInteger(budget) || budget < 0) throw Error('Invalid asset loader limits.');
  const catalog = new Map(options.manifest.assets.map(asset => [asset.id, asset]));
  const cache = new Map<string, Uint8Array>(), pending = new Map<string, Promise<Uint8Array>>();
  const packPending = new Map<string, Promise<Map<string, Uint8Array>>>();
  const queue: Array<{ resolve(): void; reject(cause: Error): void }> = [];
  let active = 0, cachedBytes = 0, disposed = false;
  const transfers = { reads: 0, cacheHits: 0, sharedReads: 0, failedReads: 0, receivedBytes: 0, verifiedBytes: 0, activeDeclaredBytes: 0, peakDeclaredBytes: 0 };
  function remember(hash: string, bytes: Uint8Array) {
    if (disposed || bytes.length > budget) return;
    if (cache.has(hash)) { cache.delete(hash);cachedBytes -= bytes.length; }
    while (cachedBytes + bytes.length > budget && cache.size) {
      const first = cache.keys().next().value!;cachedBytes -= cache.get(first)!.length;cache.delete(first);
    }
    cache.set(hash, bytes);cachedBytes += bytes.length;
  }
  for (const asset of options.initial ?? []) remember(asset.sha256, asset.bytes);
  async function bytesFor(object: DeliveryObject) {
    if (disposed) throw Error('Asset loader has been disposed.');
    const cached = cache.get(object.sha256);
    if (cached) { transfers.cacheHits++;cache.delete(object.sha256);cache.set(object.sha256, cached);return cached; }
    let operation = pending.get(object.sha256);
    if (!operation) {
      operation = (async () => {
        if (active >= limit) await new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
        else active++;
        let reading = false;
        try {
          if (disposed) throw Error('Asset loader has been disposed.');
          reading = true;transfers.reads++;transfers.activeDeclaredBytes += object.size;
          transfers.peakDeclaredBytes = Math.max(transfers.peakDeclaredBytes, transfers.activeDeclaredBytes);
          const bytes = await Promise.resolve().then(() => options.read(object));
          transfers.receivedBytes += bytes.length;await verifyDeliveryObject({ object, bytes });transfers.verifiedBytes += bytes.length;
          if (disposed) throw Error('Asset loader has been disposed.');
          remember(object.sha256, bytes);return bytes;
        } catch (cause) { if (reading) transfers.failedReads++;throw cause; }
        finally { if (reading) transfers.activeDeclaredBytes -= object.size;const next = queue.shift();if (next) next.resolve();else active--;pending.delete(object.sha256); }
      })();
      pending.set(object.sha256, operation);
    } else transfers.sharedReads++;
    return operation;
  }
  async function acquire(ids: readonly string[], packed?: ReadonlyMap<string, Uint8Array>) {
    if (disposed) throw Error('Asset loader has been disposed.');
    const closure = new Set<string>();
    function visit(id: string) {
      if (closure.has(id)) return;
      const asset = catalog.get(id);if (!asset) throw Error(`Unknown delivered asset: ${id}`);
      closure.add(id);for (const child of asset.dependencies) visit(child);
    }
    for (const id of ids) visit(id);
    return Promise.all([...closure].map(async (id): Promise<HyperfocusPortableAsset> => {
      const asset = catalog.get(id)!;
      return { id, name: asset.name, mimeType: asset.mimeType, sha256: asset.sha256, bytes: packed?.get(asset.sha256) ?? await bytesFor(asset) };
    }));
  }
  return {
    acquire,
    async acquireGroup(group: string, selection?: { playback?: 'buffer' | 'stream' }) {
      const members = options.manifest.groups[group];if (!members) throw Error(`Unknown asset group: ${group}`);
      const ids = selection?.playback ? members.filter(id => catalog.get(id)!.playback === selection.playback) : members;
      if (disposed) throw Error('Asset loader has been disposed.');
      const pack = options.manifest.packs?.[group];
      if (!pack || selection?.playback === 'stream' || !ids.length || pack.assets.every(id => cache.has(catalog.get(id)!.sha256))) return acquire(ids);
      let operation = packPending.get(pack.sha256);
      if (!operation) {
        operation = (async () => {
          const bytes = await bytesFor(pack);
          const objects = await unpackHyperfocusAssets(bytes, { maxArchiveBytes: 67108864, maxUnpackedBytes: 67108864, maxAssets: 5000 });
          const unpacked = new Map(objects.map(object => [object.sha256, object.bytes]));
          const expected = pack.assets.map(id => catalog.get(id)!);
          if (unpacked.size !== new Set(expected.map(asset => asset.sha256)).size || expected.some(asset => unpacked.get(asset.sha256)?.length !== asset.size)) throw Error(`Asset pack differs from its catalog: ${group}`);
          if (disposed) throw Error('Asset loader has been disposed.');
          for (const [hash, object] of unpacked) remember(hash, object);
          return unpacked;
        })().finally(() => { packPending.delete(pack.sha256); });
        packPending.set(pack.sha256, operation);
      }
      return acquire(ids, await operation);
    },
    async bytes(id: string) { const asset = catalog.get(id);if (!asset) throw Error(`Unknown delivered asset: ${id}`);return bytesFor(asset); },
    snapshot: () => ({ active, queued: queue.length, cachedBytes, cachedObjects: cache.size }),
    /** Transfer accounting only: declared concurrent bytes are not decoded heap/GPU residency. */
    diagnostics: () => ({ ...transfers, cacheBudgetBytes: budget, concurrency: limit }),
    dispose() { disposed = true;cache.clear();pending.clear();cachedBytes = 0;while (queue.length) queue.shift()!.reject(Error('Asset loader has been disposed.')); },
  };
}
