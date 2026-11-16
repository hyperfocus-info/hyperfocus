import { assertFinite, assertText, isObject } from '../editor-history.ts';

export type AudioAssetMetadata = {
  /** Authored file tag or measured estimate; absent when tempo was not detected. */
  bpm?: number;
  bpmConfidence: number;
  bpmSource: string;
  bpmStatus: 'tagged' | 'estimated' | 'undetected';
};

export type EditorAsset = {
  id: string;
  name: string;
  kind: 'image' | 'audio' | 'data' | 'font' | 'unknown';
  mimeType: string;
  size: number;
  lastModified: number;
  source: 'imported' | 'generated';
  /** Content address in `.hyperfocus/assets.hfp`; populated for portable imported assets. */
  sha256?: string;
  objectUrl?: string;
  audioMetadata?: AudioAssetMetadata;
};

export function validateAudioAssetMetadata(value: unknown) {
  if (!isObject(value)) throw new Error('Audio asset metadata must be an object.');
  for (const key of Object.keys(value)) if (!['bpm', 'bpmConfidence', 'bpmSource', 'bpmStatus'].includes(key)) {
    throw new Error(`Unknown audio asset metadata field: ${key}.`);
  }
  assertFinite(value.bpmConfidence, 'Audio asset BPM confidence', 0, 1);
  assertText(value.bpmSource, 'Audio asset BPM source', 128);
  if (value.bpmStatus === 'estimated' || value.bpmStatus === 'tagged') {
    assertFinite(value.bpm, 'Audio asset BPM', 30, 300);
    if (value.bpmStatus === 'tagged' && value.bpmConfidence !== 1) throw new Error('Tagged audio asset BPM must have confidence one.');
  }
  else if (value.bpmStatus !== 'undetected' || value.bpm !== undefined || value.bpmConfidence !== 0) {
    throw new Error('Undetected audio asset BPM must have no estimate and zero confidence.');
  }
}
