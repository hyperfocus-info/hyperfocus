import type { EditorProject } from '../editor.ts';

export type DeliveryObject = { url: string; sha256: string; size: number };
export type DeliveryAsset = DeliveryObject & { id: string; name: string; mimeType: string; playback: 'buffer' | 'stream'; dependencies: string[]; groups: string[] };
export type DeliveryPack = DeliveryObject & { assets: string[] };
export type ProjectDeliveryManifest = {
  version: 1;
  project: DeliveryObject;
  core: DeliveryObject;
  assets: DeliveryAsset[];
  groups: Record<string, string[]>;
  /** Optional compressed transport for a group; individual objects remain addressable. */
  packs?: Record<string, DeliveryPack>;
  report: { startupBytes: number; optionalBytes: number; totalBytes: number; reasons: Record<string, string> };
};

export function deliveryUrl(value: string) {
  if (value.length > 2048) throw Error('Asset URL exceeds its length limit.');
  if (/^https:\/\//.test(value)) {
    const url = new URL(value);
    if (url.username || url.password || url.hash) throw Error('Asset URLs cannot contain credentials or fragments.');
    return url.href;
  }
  if (!value || value.length > 2048 || value.startsWith('/') || /[\\?#%\s:]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw Error(`Invalid relative asset URL: ${value}.`);
  return value;
}

export function readAssetUrlMap(value: unknown): Record<string, string> {
  if (!record(value)) throw Error('Asset URL map must be an object keyed by SHA-256.');
  const urls: Record<string, string> = {};
  for (const [hash, url] of Object.entries(value)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || typeof url !== 'string' || !url.startsWith('https://')) throw Error('Asset URL map requires SHA-256 keys and HTTPS URLs.');
    urls[hash] = deliveryUrl(url);
  }
  return urls;
}

export function readProjectDeliveryManifest(value: unknown): ProjectDeliveryManifest {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.assets) || value.assets.length > 5000 || !record(value.groups) || !record(value.report)) throw Error('Invalid project delivery manifest.');
  const assets = value.assets.map((asset): DeliveryAsset => {
    if (!record(asset) || typeof asset.id !== 'string' || !asset.id || asset.id.length > 256 || typeof asset.name !== 'string'
      || typeof asset.mimeType !== 'string' || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(asset.mimeType)
      || asset.playback !== 'buffer' && asset.playback !== 'stream') throw Error('Invalid delivered asset.');
    if (asset.playback === 'stream' && !asset.mimeType.startsWith('audio/')) throw Error('Only audio can use streamed playback.');
    return { ...readObject(asset), id: asset.id, name: asset.name, mimeType: asset.mimeType, playback: asset.playback,
      dependencies: strings(asset.dependencies), groups: strings(asset.groups, 512) };
  });
  const ids = new Set(assets.map(asset => asset.id));
  if (ids.size !== assets.length) throw Error('Duplicate delivered asset ID.');
  const groups: Record<string, string[]> = {};
  for (const [id, members] of Object.entries(value.groups)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(id) && !/^scene(?:3d)?:[^\x00-\x1f\x7f]{1,256}$/.test(id)) throw Error('Invalid asset group name.');
    groups[id] = strings(members);
    if (groups[id]!.some(id => !ids.has(id))) throw Error('Asset group contains an unknown asset.');
  }
  if (!groups.startup) throw Error('Delivery manifest requires a startup group.');
  const packs: Record<string, DeliveryPack> = {};
  if (value.packs !== undefined) {
    if (!record(value.packs)) throw Error('Invalid delivery packs.');
    for (const [group, packed] of Object.entries(value.packs)) {
      if (!record(packed) || !groups[group] || group === 'startup') throw Error('Invalid delivery pack group.');
      const members = strings(packed.assets);
      if (!members.length || members.some(id => !groups[group]!.includes(id) || assets.find(asset => asset.id === id)?.playback === 'stream')) throw Error('Invalid delivery pack members.');
      const object = readObject(packed);
      const unique = new Map(members.map(id => { const asset = assets.find(asset => asset.id === id)!;return [asset.sha256, asset.size]; }));
      if (object.size > 67108864 || [...unique.values()].reduce((sum, size) => sum + size, 0) > 67108864) throw Error('Delivery pack exceeds its 64 MiB limit.');
      packs[group] = { ...object, assets: members };
    }
  }
  for (const asset of assets) {
    if (asset.dependencies.some(id => id === asset.id || !ids.has(id)) || asset.groups.some(id => !groups[id]?.includes(asset.id))) throw Error(`Invalid dependencies or groups: ${asset.id}.`);
    for (const [id, members] of Object.entries(groups)) if (members.includes(asset.id) && !asset.groups.includes(id)) throw Error(`Inconsistent delivery group: ${id}.`);
  }
  const visiting = new Set<string>(), visited = new Set<string>(), byId = new Map(assets.map(asset => [asset.id, asset]));
  function visit(id: string) { if (visited.has(id)) return;if (visiting.has(id)) throw Error('Cyclic delivery dependencies.');visiting.add(id);for (const next of byId.get(id)!.dependencies) visit(next);visiting.delete(id);visited.add(id); }
  for (const id of ids) visit(id);
  const report = value.report;
  if (!record(report.reasons) || Object.values(report.reasons).some(reason => typeof reason !== 'string')) throw Error('Invalid delivery report.');
  const reasons: Record<string, string> = {};for (const [id, reason] of Object.entries(report.reasons)) reasons[id] = String(reason);
  return { version: 1, project: readObject(value.project), core: readObject(value.core), assets, groups, ...(Object.keys(packs).length ? { packs } : {}),
    report: { startupBytes: size(report.startupBytes), optionalBytes: size(report.optionalBytes), totalBytes: size(report.totalBytes), reasons } };
}

export function validateDeliveryCatalog(options: { manifest: ProjectDeliveryManifest; project: EditorProject }) {
  const catalog = options.project.assets.filter(asset => asset.sha256 !== undefined);
  if (catalog.length !== options.manifest.assets.length) throw Error('Delivery catalog differs from the project.');
  const assets = new Map(options.manifest.assets.map(asset => [asset.id, asset]));
  for (const asset of catalog) {
    const delivered = assets.get(asset.id);
    if (!delivered || delivered.sha256 !== asset.sha256 || delivered.size !== asset.size || delivered.name !== asset.name || delivered.mimeType !== asset.mimeType) throw Error(`Delivery catalog mismatch: ${asset.id}.`);
  }
}

function readObject(value: unknown): DeliveryObject {
  if (!record(value) || typeof value.url !== 'string' || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) throw Error('Invalid delivery object.');
  return { url: deliveryUrl(value.url), sha256: value.sha256, size: size(value.size) };
}
function size(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2147483648) throw Error('Invalid delivery byte size.');return value; }
function strings(value: unknown, maxLength = 256): string[] { if (!Array.isArray(value) || value.length > 5000 || value.some(item => typeof item !== 'string' || !item || item.length > maxLength) || new Set(value).size !== value.length) throw Error('Invalid delivery ID list.');return value.map(item => String(item)); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
