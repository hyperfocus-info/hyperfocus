import type { EditorProject } from '../editor.ts';
import { hashHyperfocusAsset, type HyperfocusExchangeFile, type HyperfocusPortableAsset } from '../index.ts';
import { createStandalonePlayableHtml, supportsStandaloneCombatConnections } from '../standalone-playable.ts';
import { createProjectDelivery } from './build.ts';

export async function createWebPlayable(options: {
  project: EditorProject; assets: readonly HyperfocusPortableAsset[];
  runtime: { entry: string; files: readonly HyperfocusExchangeFile[]; preload?: readonly string[] };
  projectBehaviorSource?: string; assetBaseUrl?: string; assetUrls?: Readonly<Record<string, string>>;
  behaviorModule?: string;
}) {
  const delivery = await createProjectDelivery(options);
  const manifestBytes = delivery.files.find(file => file.path === 'delivery.json')!.bytes;
  const manifestUrl = `delivery-${await hashHyperfocusAsset(manifestBytes)}.json`;
  delivery.files.push({ path: manifestUrl, mimeType: 'application/json', bytes: manifestBytes });
  if (!options.runtime.files.some(file => file.path === options.runtime.entry)) throw Error('Web runtime entry is missing.');
  const origins = [...new Set([...delivery.manifest.assets, ...Object.values(delivery.manifest.packs ?? {})].filter(asset => asset.url.startsWith('https:')).map(asset => new URL(asset.url).origin))];
  const preload = options.runtime.preload ?? [options.runtime.entry];
  if (preload.some(path => !options.runtime.files.some(file => file.path === path && file.mimeType === 'text/javascript'))) throw Error('Preloaded runtime module is missing.');
  const html = createStandalonePlayableHtml({ project: options.project, projectJson: new Uint8Array(), assetsArchive: new Uint8Array(),
    delivery: { runtimeUrl: options.runtime.entry, manifestUrl, assetOrigins: origins, behaviorModule: options.behaviorModule, preload,
      bootstrap: { manifest: { url: manifestUrl, size: manifestBytes.length, sha256: await hashHyperfocusAsset(manifestBytes) }, project: delivery.manifest.project, core: delivery.manifest.core } },
    projectBehaviorSource: options.projectBehaviorSource, allowCombatConnections: supportsStandaloneCombatConnections(options.project) });
  const files = [...delivery.files, ...options.runtime.files, { path: 'index.html', mimeType: 'text/html', bytes: new TextEncoder().encode(html) }];
  const paths = new Set<string>();
  for (const file of files) {
    if (paths.has(file.path) || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(file.path) || file.path.split('/').some(part => !part || part === '..' || part === '.')) throw Error(`Invalid or duplicate web output: ${file.path}`);
    paths.add(file.path);
  }
  const outputs = await Promise.all(files.map(async file => ({ path: file.path, size: file.bytes.length, sha256: await hashHyperfocusAsset(file.bytes), mimeType: file.mimeType })));
  files.push({ path: 'build.json', mimeType: 'application/json', bytes: new TextEncoder().encode(JSON.stringify({ version: 1, runtimeEntry: options.runtime.entry, files: outputs })) });
  return { ...delivery, files, html, outputs };
}
