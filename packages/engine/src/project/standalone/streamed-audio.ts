import type { EditorProject } from '../editor.ts';
import type { AudioMetadata } from '../../audio/metadata.ts';

/** Delivery-only source descriptor; canonical projects retain their original packed bytes. */
export type StandaloneStreamedAudio = {
  assetId: string; url: string; sha256: string; size: number; durationSeconds: number; audioMetadata?: AudioMetadata;
  /** Exact catalog fields replaced when the packed bytes move to HTTP delivery. */
  originalCatalog?: { source: 'imported' | 'generated'; sha256?: string };
};

export function readStandaloneStreamedAudio(options: { value: unknown; project: EditorProject }): StandaloneStreamedAudio[] {
  if (options.value === undefined) return [];
  if (!Array.isArray(options.value) || options.value.length > 64) throw new Error('Streamed music needs at most 64 sources.');
  const ids = new Set<string>();
  return options.value.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid streamed music source.');
    const assetId = Reflect.get(value, 'assetId'), url = Reflect.get(value, 'url'), sha256 = Reflect.get(value, 'sha256');
    const size = Reflect.get(value, 'size'), durationSeconds = Reflect.get(value, 'durationSeconds');
    const asset = options.project.assets.find(asset => asset.id === assetId && asset.kind === 'audio');
    if (!asset || ids.has(assetId) || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)
      || url !== `audio/${sha256}.mp3` || asset.mimeType !== 'audio/mpeg' || asset.sha256 !== undefined && asset.sha256 !== sha256
      || !Number.isSafeInteger(size) || size <= 0 || size > 33554432 || asset.size !== size
      || typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 3600) {
      throw new Error('Streamed music must reference a distinct MP3 asset and a content-addressed relative audio path.');
    }
    const metadata = asset.audioMetadata;
    const original = Reflect.get(value, 'originalCatalog');
    let originalCatalog: StandaloneStreamedAudio['originalCatalog'];
    if (original !== undefined) {
      if (!original || typeof original !== 'object') throw new Error('Invalid original streamed music catalog.');
      const source = Reflect.get(original, 'source'), originalHash = Reflect.get(original, 'sha256');
      if ((source !== 'imported' && source !== 'generated') || originalHash !== undefined && originalHash !== sha256) {
        throw new Error('Original streamed music catalog must retain its source and matching byte digest.');
      }
      originalCatalog = { source, ...(originalHash !== undefined ? { sha256: originalHash } : {}) };
    }
    const audioMetadata: AudioMetadata | undefined = metadata?.bpmStatus === 'tagged' && metadata.bpm !== undefined
      ? { bpm: metadata.bpm, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource: metadata.bpmSource } : undefined;
    ids.add(assetId);return { assetId, url, sha256, size, durationSeconds, ...(audioMetadata ? { audioMetadata } : {}), ...(originalCatalog ? { originalCatalog } : {}) };
  });
}
