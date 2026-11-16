import type { EditorProject } from '../editor.ts';
import { encodeHyperfocusProject, hashHyperfocusAsset, packHyperfocusAssets, type HyperfocusPortableAsset, type HyperfocusExchangeFile } from '../index.ts';
import { assetReferences, planProjectDelivery } from './plan.ts';
import { parseDeclaration } from '../3d/declaration.ts';
import { deliveryUrl, readProjectDeliveryManifest, validateDeliveryCatalog, type ProjectDeliveryManifest, type DeliveryAsset, type DeliveryPack } from './manifest.ts';

/** Derive deployment files without changing the canonical catalog or original media. */
export async function createProjectDelivery(options: {
  project: EditorProject; assets: readonly HyperfocusPortableAsset[];
  assetBaseUrl?: string; assetUrls?: Readonly<Record<string, string>>;
}) {
  const { project, assets } = options, byId = new Map(assets.map(asset => [asset.id, asset]));
  if (assets.length > 5000 || byId.size !== assets.length) throw Error('Delivery needs at most 5000 distinct assets.');
  const catalog = project.assets.filter(asset => asset.sha256 !== undefined);
  if (catalog.length !== assets.length) throw Error('Every project binary must be present when building delivery.');
  const dependencies = new Map<string, string[]>(), ids = new Set(assets.map(asset => asset.id));
  for (const asset of catalog) {
    const binary = byId.get(asset.id);
    if (!binary || binary.bytes.length !== asset.size || binary.mimeType !== asset.mimeType || binary.name !== asset.name || await hashHyperfocusAsset(binary.bytes) !== asset.sha256) throw Error(`Missing or changed delivery source: ${asset.id}.`);
    if ((/json/.test(asset.mimeType) || /\.json$/i.test(asset.name)) && asset.size <= 4194304) {
      try { const refs = assetReferences({ value: JSON.parse(new TextDecoder().decode(binary.bytes)), ids });refs.delete(asset.id);dependencies.set(asset.id, [...refs]); }
      catch (cause) { throw Error(`Cannot inspect JSON asset dependencies for ${asset.id}: ${String(cause)}`); }
    }
  }
  const declaration = project.extensions?.hyperfocus3D ? parseDeclaration(project, undefined, []) : undefined;
  for (const mesh of declaration?.meshes ?? []) dependencies.set(mesh.assetId, [...new Set([...(dependencies.get(mesh.assetId) ?? []), ...mesh.buffers.map(buffer => buffer.assetId)])].filter(id => id !== mesh.assetId));
  if (options.assetBaseUrl && !/^https:\/\//.test(options.assetBaseUrl)) throw Error('External asset base URL must use HTTPS.');
  if (options.assetBaseUrl) deliveryUrl(options.assetBaseUrl);
  const plan = planProjectDelivery({ project, dependencies }), files: HyperfocusExchangeFile[] = [];
  const objectUrl = (path: string, hash: string) => deliveryUrl(options.assetUrls?.[hash] ?? (options.assetBaseUrl ? new URL(path, options.assetBaseUrl.endsWith('/') ? options.assetBaseUrl : `${options.assetBaseUrl}/`).href : path));
  const entries: DeliveryAsset[] = [];
  const written = new Set<string>();
  for (const asset of assets) {
    const suffix = extension(asset.mimeType), path = `assets/${asset.sha256}${suffix}`;
    const url = objectUrl(path, asset.sha256);
    if (!written.has(path)) { files.push({ path, mimeType: asset.mimeType, bytes: asset.bytes });written.add(path); }
    entries.push({ id: asset.id, name: asset.name, mimeType: asset.mimeType, sha256: asset.sha256, size: asset.bytes.length, url,
      playback: plan.playback.get(asset.id)!, dependencies: plan.dependencies.get(asset.id) ?? [], groups: Object.entries(plan.groups).filter(([, members]) => members.includes(asset.id)).map(([id]) => id) });
  }
  const projectBytes = encodeHyperfocusProject(project), projectHash = await hashHyperfocusAsset(projectBytes);
  const core = await packHyperfocusAssets(assets.filter(asset => plan.groups.startup!.includes(asset.id)), { compression: 'deflate', maxAssets: 5000, maxUnpackedBytes: 1073741824 });
  const coreHash = await hashHyperfocusAsset(core), projectPath = `project-${projectHash}.json`, corePath = `core-${coreHash}.hfp`;
  files.push({ path: projectPath, mimeType: 'application/json', bytes: projectBytes }, { path: corePath, mimeType: 'application/octet-stream', bytes: core });
  const packs: Record<string, DeliveryPack> = {};
  for (const [group, members] of Object.entries(plan.groups)) {
    if (group === 'startup' || group.startsWith('scene:') || group.startsWith('scene3d:')) continue;
    const selected = members.filter(id => !plan.groups.startup!.includes(id) && plan.playback.get(id) !== 'stream').map(id => byId.get(id)!);
    // Large groups retain individual delivery; packs cannot create unbounded unzip work.
    if (selected.length < 2 || selected.reduce((sum, asset) => sum + asset.bytes.length, 0) > 67108864) continue;
    const bytes = await packHyperfocusAssets(selected, { compression: 'deflate', maxAssets: 5000, maxUnpackedBytes: 67108864 });
    if (bytes.length > 67108864) continue;
    const hash = await hashHyperfocusAsset(bytes), path = `packs/${hash}.hfp`;
    if (!written.has(path)) { files.push({ path, mimeType: 'application/octet-stream', bytes });written.add(path); }
    packs[group] = { url: objectUrl(path, hash), sha256: hash, size: bytes.length, assets: selected.map(asset => asset.id) };
  }
  const unique = new Map(entries.map(asset => [asset.sha256, asset])), startup = new Set(entries.filter(asset => asset.groups.includes('startup')).map(asset => asset.sha256));
  const totalBytes = [...unique.values()].reduce((sum, asset) => sum + asset.size, 0);
  const optionalBytes = [...unique.values()].filter(asset => !startup.has(asset.sha256)).reduce((sum, asset) => sum + asset.size, 0);
  const manifest: ProjectDeliveryManifest = { version: 1, project: { url: projectPath, sha256: projectHash, size: projectBytes.length }, core: { url: corePath, sha256: coreHash, size: core.length }, assets: entries.sort((a, b) => a.id.localeCompare(b.id)), groups: plan.groups, ...(Object.keys(packs).length ? { packs } : {}),
    report: { startupBytes: core.length + projectBytes.length, optionalBytes, totalBytes, reasons: plan.reasons } };
  readProjectDeliveryManifest(manifest);validateDeliveryCatalog({ manifest, project });
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.length > 4194304) throw Error('Delivery manifest exceeds the 4 MiB browser limit.');
  files.push({ path: 'delivery.json', mimeType: 'application/json', bytes: manifestBytes });
  return { manifest, files };
}

function extension(mime: string) {
  const extensions: Record<string, string> = { 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/flac': '.flac', 'audio/webm': '.webm', 'audio/aac': '.aac', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'font/woff2': '.woff2', 'model/gltf-binary': '.glb' };
  return extensions[mime] ?? '.bin';
}
