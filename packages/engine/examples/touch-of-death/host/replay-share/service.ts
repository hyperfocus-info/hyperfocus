import type { DurableServiceStore, DurableJson } from '@hyperfocus/engine/server';
import { decodeReplayArchive, encodeReplayArchive } from '../../src/replay/archive.ts';

export const shareMaxBytes = 524288, shareLifetime = 604800000;
const bucket = 'replay-share';
type SharedReplay = { owner: string; digest: string; expires: number; payload: string };
function record(value: DurableJson | undefined): SharedReplay | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.owner !== 'string' || typeof value.digest !== 'string'
    || typeof value.expires !== 'number' || typeof value.payload !== 'string' || !value.payload.startsWith('hfrp:1:')) return;
  return { owner: value.owner, digest: value.digest, expires: value.expires, payload: value.payload };
}

/** Explicitly shared, expiring files. HFRP stays canonical; only this JSON-only store uses base64. */
export function createReplayShares(options: { store: DurableServiceStore; contentId: string; now?: () => number }) {
  const now = options.now ?? Date.now;
  return {
    async create(owner: string, input: Uint8Array) {
      if (!owner || input.length > shareMaxBytes) throw Error('Replay link limit is 512 KiB. Download the replay file instead.');
      const archive = decodeReplayArchive({ bytes: input });
      if (!archive.recording.frames.length || archive.recording.contentId !== options.contentId) throw Error('Replay belongs to a different game version or has no frames.');
      const bytes = encodeReplayArchive({ value: archive }), digest = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
      const payload = `hfrp:1:${Buffer.from(bytes).toString('base64')}`, at = now();
      return options.store.transaction(tx => {
        const retained: Array<{ key: string; value: SharedReplay }> = [];
        for (const row of tx.scan(bucket, { limit: 129 })) {
          const value = record(row.value);
          if (value && value.expires <= at) tx.delete(bucket, row.key);
          else if (value) retained.push({ key: row.key, value });
          else throw Error('Replay sharing is temporarily unavailable.');
        }
        const duplicate = retained.find(row => row.value.owner === owner && row.value.digest === digest);
        if (duplicate) return { id: duplicate.key, expires: duplicate.value.expires };
        if (retained.filter(row => row.value.owner === owner).length >= 8) throw Error('Eight replay links are already active. Save a file or wait for an older link to expire.');
        if (retained.length >= 128 || retained.reduce((size, row) => size + row.value.payload.length, payload.length) > 16777216) throw Error('Replay sharing is full. Download the replay file instead.');
        const id = crypto.randomUUID(), expires = at + shareLifetime;
        tx.put(bucket, id, { owner, digest, expires, payload });return { id, expires };
      });
    },
    async read(id: string) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return;
      return options.store.transaction(tx => {
        const value = record(tx.get(bucket, id));if (!value) return;
        if (value.expires <= now()) { tx.delete(bucket, id);return; }
        const bytes = new Uint8Array(Buffer.from(value.payload.slice(7), 'base64'));
        if (bytes.length > shareMaxBytes || new Bun.CryptoHasher('sha256').update(bytes).digest('hex') !== value.digest) throw Error('Stored replay is corrupt.');
        return bytes;
      });
    },
  };
}
