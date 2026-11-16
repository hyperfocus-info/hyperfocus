import type { EditorProject } from '../editor.ts';

export type AssetDeliveryRule = {
  load: 'auto' | 'startup' | 'on-demand';
  group?: string;
  dependencies?: string[];
  playback?: 'auto' | 'buffer' | 'stream';
};
export type ProjectDeliveryPolicy = { version: 1; assets: Record<string, AssetDeliveryRule> };

/** Portable intent only. Hosting locations and credentials never enter project identity. */
export function readProjectDeliveryPolicy(project: Pick<EditorProject, 'assets' | 'extensions'>): ProjectDeliveryPolicy {
  const value = project.extensions?.hyperfocusDelivery;
  if (value === undefined) return { version: 1, assets: {} };
  if (!record(value) || value.version !== 1 || !record(value.assets)
    || Object.keys(value).some(key => !['version', 'assets'].includes(key))) throw Error('Asset delivery requires version 1 and an assets map.');
  const ids = new Set(project.assets.map(asset => asset.id)), assets: Record<string, AssetDeliveryRule> = {};
  for (const [id, rule] of Object.entries(value.assets)) {
    if (!ids.has(id) || !record(rule) || !['auto', 'startup', 'on-demand'].includes(String(rule.load))
      || Object.keys(rule).some(key => !['load', 'group', 'dependencies', 'playback'].includes(key))) throw Error(`Invalid delivery policy for asset ${id}.`);
    const load = rule.load;
    if (load !== 'auto' && load !== 'startup' && load !== 'on-demand') throw Error(`Invalid delivery load policy: ${id}.`);
    const group = rule.group;
    if (group !== undefined && (typeof group !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(group) || group === 'startup')) throw Error('Delivery group must be a portable name other than startup.');
    const playback = rule.playback;
    if (playback !== undefined && playback !== 'auto' && playback !== 'buffer' && playback !== 'stream') throw Error(`Invalid playback policy: ${id}.`);
    if (playback === 'stream' && project.assets.find(asset => asset.id === id)?.kind !== 'audio') throw Error('Only audio assets support streamed playback.');
    const dependencies = rule.dependencies;
    if (dependencies !== undefined && (!Array.isArray(dependencies) || dependencies.length > 5000 || dependencies.some(value => typeof value !== 'string' || !ids.has(value) || value === id) || new Set(dependencies).size !== dependencies.length)) throw Error(`Invalid delivery dependencies: ${id}.`);
    assets[id] = { load, ...(typeof group === 'string' ? { group } : {}), ...(playback ? { playback } : {}), ...(dependencies ? { dependencies: dependencies.map(value => String(value)) } : {}) };
  }
  const visiting = new Set<string>(), complete = new Set<string>();
  function visit(id: string) {
    if (complete.has(id)) return;
    if (visiting.has(id)) throw Error(`Cyclic asset delivery dependency: ${id}.`);
    visiting.add(id);for (const child of assets[id]?.dependencies ?? []) visit(child);
    visiting.delete(id);complete.add(id);
  }
  for (const id of Object.keys(assets)) visit(id);
  return { version: 1, assets };
}

export function setAssetDeliveryRule(options: { project: EditorProject; assetId: string; rule?: AssetDeliveryRule }) {
  const policy = readProjectDeliveryPolicy(options.project);
  if (!options.project.assets.some(asset => asset.id === options.assetId)) throw Error(`Unknown asset: ${options.assetId}.`);
  if (options.rule) policy.assets[options.assetId] = structuredClone(options.rule);
  else delete policy.assets[options.assetId];
  const extensions = { ...options.project.extensions, hyperfocusDelivery: policy };
  readProjectDeliveryPolicy({ assets: options.project.assets, extensions });
  options.project.extensions = extensions;
}

export function removeAssetDeliveryReferences(options: { project: EditorProject; assetId: string }) {
  if (options.project.extensions?.hyperfocusDelivery === undefined) return;
  const policy = readProjectDeliveryPolicy(options.project);delete policy.assets[options.assetId];
  for (const rule of Object.values(policy.assets)) if (rule.dependencies) rule.dependencies = rule.dependencies.filter(id => id !== options.assetId);
  options.project.extensions.hyperfocusDelivery = policy;
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
