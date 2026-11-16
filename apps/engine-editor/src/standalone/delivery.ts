import { decodeHyperfocusProject, hashHyperfocusAsset, migrateProject, type EditorProject, type HyperfocusPortableAsset, type StandaloneStreamedAudio } from '@hyperfocus/engine/project';
import { createDeliveryLoader, readDeliveryStream, openDeliveryCore, planProjectDelivery, readProjectDeliveryManifest, verifyDeliveryObject, type DeliveryObject } from '@hyperfocus/engine/project/delivery';

export type StandaloneAssetDelivery = {
  hasGroup(group: string): boolean;
  acquire(ids: readonly string[]): Promise<HyperfocusPortableAsset[]>;
  acquireGroup(group: string, selection?: { playback?: 'buffer' | 'stream' }): Promise<HyperfocusPortableAsset[]>;
  bytes(id: string): Promise<Uint8Array>;
  diagnostics(): ReturnType<ReturnType<typeof createDeliveryLoader>['diagnostics']> & {
    startup: Record<'manifestBytes' | 'projectBytes' | 'coreBytes' | 'adoptedEarlyRequests' | 'retriedEarlyRequests', number>;
  };
  dispose(): void;
};
declare global {
  var __hyperfocusDeliveryBootstrap: { controller: AbortController; objects: Map<string, { object: DeliveryObject; bytes: Promise<Uint8Array> }> } | undefined;
}

export function loadingProgress(message: string) {
  const node = document.getElementById('playable-loading');if (node) node.textContent = message;
}

/** Host owns fetch, progress and cancellation; the engine owns catalog and integrity checks. */
export async function openWebDelivery(manifestPath: string) {
  const bootstrap = globalThis.__hyperfocusDeliveryBootstrap;
  globalThis.__hyperfocusDeliveryBootstrap = undefined;
  const controller = bootstrap?.controller ?? new AbortController();
  const base = new URL(manifestPath, location.href);
  let adoptedEarlyRequests = 0, retriedEarlyRequests = 0;
  if (base.origin !== location.origin) throw Error('The delivery manifest must live beside the game.');
  addEventListener('pagehide', () => controller.abort(), { once: true });
  async function readUrl(url: string, maximum: number, progress = false, hash?: string, exact = true) {
    const absolute = new URL(url, base).href, early = bootstrap?.objects.get(absolute);
    if (early) {
      bootstrap!.objects.delete(absolute);
      if (early.object.size > maximum || hash && early.object.sha256 !== hash) throw Error('Delivery bootstrap differs from its manifest.');
      try { const bytes = await early.bytes;adoptedEarlyRequests++;return bytes; }
      catch (cause) { if (controller.signal.aborted) throw cause;retriedEarlyRequests++; }
    }
    const request = new AbortController(), abort = () => request.abort(controller.signal.reason);
    controller.signal.addEventListener('abort', abort, { once: true });if (controller.signal.aborted) abort();
    const timeout = setTimeout(() => request.abort(Error('Delivery connection stalled; retry loading')), 30000);
    try {
      const response = await fetch(absolute, { signal: request.signal, credentials: 'omit' });
      clearTimeout(timeout);
      if (!response.ok || !response.body) throw Error(`Cannot download ${url}: HTTP ${response.status}`);
      return await readDeliveryStream({ reader: response.body.getReader(), maxBytes: maximum, expectedBytes: exact ? maximum : undefined,
        idleTimeoutMs: 30000, onProgress: progress ? received => loadingProgress(`Loading required assets? ${Math.min(100, Math.round(received / maximum * 100))}%`) : undefined });
    } finally { clearTimeout(timeout);controller.signal.removeEventListener('abort', abort);request.abort(); }
  }
  try {
  const pinnedHash = /\/delivery-([a-f0-9]{64})\.json$/.exec(base.pathname)?.[1];
  const manifestBytes = await readUrl(base.href, 4194304, false, pinnedHash, false);
  if (pinnedHash && await hashHyperfocusAsset(manifestBytes) !== pinnedHash) throw Error('Delivery manifest integrity check failed.');
  const manifest = readProjectDeliveryManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const read = (object: DeliveryObject) => readUrl(object.url, object.size, false, object.sha256);
  loadingProgress('Loading project…');
  const [projectBytes, coreBytes] = await Promise.all([
    read(manifest.project).then(bytes => verifyDeliveryObject({ object: manifest.project, bytes })),
    readUrl(manifest.core.url, manifest.core.size, true, manifest.core.sha256),
  ]);
  const project = decodeHyperfocusProject(projectBytes, migrateProject);
  const assets = await openDeliveryCore({ project, manifest, bytes: coreBytes });
  const loader = createDeliveryLoader({ manifest, initial: assets, read });
  const streamedAudio: StandaloneStreamedAudio[] = manifest.assets.filter(asset => asset.playback === 'stream').map(asset => ({
    assetId: asset.id, url: new URL(asset.url, base).href, sha256: asset.sha256, size: asset.size,
    durationSeconds: 0, audioMetadata: taggedMetadata(project, asset.id),
  }));
  // Capture counts, not startup buffers, in the long-lived diagnostics closure.
  const startup = { manifestBytes: manifestBytes.length, projectBytes: projectBytes.length, coreBytes: coreBytes.length, adoptedEarlyRequests, retriedEarlyRequests };
  const delivery: StandaloneAssetDelivery = { ...loader, diagnostics: () => ({ ...loader.diagnostics(), startup: { ...startup } }),
    hasGroup: group => Object.hasOwn(manifest.groups, group), dispose() { controller.abort();loader.dispose(); } };
  addEventListener('pagehide', delivery.dispose, { once: true });
  return { project, assets, objects: [], streamedAudio, delivery };
  } catch (cause) { controller.abort();throw cause; }
}

/** The same media-element playback path is used for the full offline download. */
export function offlineMusicSources(options: { project: EditorProject; assets: readonly HyperfocusPortableAsset[]; existing: readonly StandaloneStreamedAudio[] }) {
  const plan = planProjectDelivery({ project: options.project }), urls: string[] = [];
  const existing = new Set(options.existing.map(source => source.assetId));
  const sources = [...options.existing];
  for (const asset of options.assets) {
    if (existing.has(asset.id) || plan.playback.get(asset.id) !== 'stream') continue;
    const url = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));urls.push(url);
    sources.push({ assetId: asset.id, url, sha256: asset.sha256, size: asset.bytes.length, durationSeconds: 0,
      audioMetadata: taggedMetadata(options.project, asset.id) });
  }
  addEventListener('pagehide', () => { for (const url of urls) URL.revokeObjectURL(url); }, { once: true });
  return sources;
}

function taggedMetadata(project: EditorProject, id: string): StandaloneStreamedAudio['audioMetadata'] {
  const metadata = project.assets.find(asset => asset.id === id)?.audioMetadata;
  return metadata?.bpmStatus === 'tagged' && metadata.bpm !== undefined
    ? { bpm: metadata.bpm, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource: metadata.bpmSource } : undefined;
}

/** Offline and web prepare the same authored fight bank before the first input. */
export function combatAudioStage(opened: { project: EditorProject; assets: readonly HyperfocusPortableAsset[]; delivery?: StandaloneAssetDelivery }) {
  if (opened.delivery) return opened.delivery.hasGroup('combat-audio') ? () => opened.delivery!.acquireGroup('combat-audio', { playback: 'buffer' }) : undefined;
  const plan = planProjectDelivery({ project: opened.project });
  const ids = new Set(plan.groups['combat-audio']?.filter(id => plan.playback.get(id) === 'buffer'));
  return ids.size ? async () => opened.assets.filter(asset => ids.has(asset.id)) : undefined;
}
