import type { EditorProject } from '../editor.ts';
import { readProjectDeliveryPolicy } from './policy.ts';
import { parseDeclaration } from '../3d/declaration.ts';
import { sceneResources3D } from './scene-resources-3d.ts';
import { readCombatProject3D } from '../3d/combat-declaration.ts';

/** Infer conservative roots; retain every catalog object for later explicit acquisition. */
export function planProjectDelivery(options: { project: EditorProject; dependencies?: ReadonlyMap<string, readonly string[]> }) {
  const { project } = options, policy = readProjectDeliveryPolicy(project);
  const catalog = new Map(project.assets.filter(asset => asset.sha256 !== undefined).map(asset => [asset.id, asset]));
  const groups: Record<string, string[]> = { startup: [] }, reasons: Record<string, string> = {};
  const dependencies = new Map<string, string[]>();
  for (const id of catalog.keys()) dependencies.set(id, [...new Set([...(options.dependencies?.get(id) ?? []), ...(policy.assets[id]?.dependencies ?? [])])]);
  const ids = new Set(catalog.keys());
  const declaration = project.extensions?.hyperfocus3D ? parseDeclaration(project, undefined, []) : undefined;
  const globalReferences = assetReferences({ value: { ...project, scenes: [], assets: undefined, extensions: { ...project.extensions, hyperfocusDelivery: undefined,
    ...(declaration ? { hyperfocus3D: sceneResources3D({ project, declaration }) } : {}) } }, ids });
  const sceneReferences = new Map(project.scenes.map(scene => [scene.id, assetReferences({ value: scene, ids })]));
  const referenced = new Set([...globalReferences, ...[...sceneReferences.values()].flatMap(values => [...values])]);
  const startupReferences = new Set([...globalReferences, ...(sceneReferences.get(project.activeSceneId) ?? [])]);
  const combat = declaration ? readCombatProject3D(project.extensions?.hyperfocusCombat) : undefined;
  const combatStage = combat?.match ? assetReferences({ value: combat.audio, ids }) : new Set<string>();
  // UI feedback and bus configuration are usable before a match. Shared references
  // outside combat must also retain their existing startup semantics.
  const outsideCombat = assetReferences({ value: { ...project, assets: undefined, extensions: { ...project.extensions, hyperfocusCombat: undefined, hyperfocusDelivery: undefined } }, ids });
  for (const id of outsideCombat) combatStage.delete(id);
  for (const key of ['uiFocus', 'uiConfirm', 'uiBack', 'uiAdjust', 'uiDenied'] as const) {
    const id = combat?.audio?.cues?.[key];if (id) combatStage.delete(id);
  }
  if (combat?.audio?.effects?.cityImpulseAssetId) combatStage.delete(combat.audio.effects.cityImpulseAssetId);
  const music = new Set<string>();
  function musicReferences(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) musicReferences(child);return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'assets' || key === 'hyperfocusDelivery') continue;
      if (key === 'music' || key === 'playlists' || key === 'bus' && child === 'music') {
        for (const id of assetReferences({ value: key === 'bus' ? value : child, ids: new Set(catalog.keys()) })) music.add(id);
      } else musicReferences(child);
    }
  }
  musicReferences(project);
  for (const id of music) combatStage.delete(id);
  if ([...combatStage].filter(id => !music.has(id)).reduce((sum, id) => sum + (catalog.get(id)?.size ?? 0), 0) > 16777216) combatStage.clear();
  const playback = new Map<string, 'buffer' | 'stream'>();
  for (const [id, asset] of catalog) {
    const rule = policy.assets[id];
    const stream = asset.kind === 'audio' && (rule?.playback === 'stream' || rule?.playback !== 'buffer' && (music.has(id) || !referenced.has(id) && asset.size > 524288));
    playback.set(id, stream ? 'stream' : 'buffer');
    // A visual/structural requirement cannot be made optional by a delivery hint.
    const staged = asset.kind === 'audio' && combatStage.has(id) && rule?.load !== 'startup';
    const required = rule?.load === 'startup' || !stream && !staged && startupReferences.has(id) && (rule?.load !== 'on-demand' || asset.kind !== 'audio');
    reasons[id] = rule?.load === 'startup' ? 'Explicit startup requirement' : required ? 'Referenced runtime resource' : stream ? 'Stream selected audio on demand' : rule?.load === 'on-demand' ? 'Explicit on-demand resource' : 'Available catalog content';
    const group = required ? 'startup' : stream ? rule?.group ?? 'music' : staged ? 'combat-audio' : rule?.group ?? 'optional';
    if (staged && !stream) reasons[id] = 'Prepared before entering combat';
    (groups[group] ??= []).push(id);
    if (rule?.group && rule.group !== group) (groups[rule.group] ??= []).push(id);
  }
  for (const [sceneId, references] of sceneReferences) groups[`scene:${sceneId}`] = [...new Set([...globalReferences, ...references])].filter(id => playback.get(id) !== 'stream');
  for (const scene of declaration?.scenes ?? []) groups[`scene3d:${scene.id}`] = [...assetReferences({ value: sceneResources3D({ project, declaration: declaration!, sceneId: scene.id }), ids })].filter(id => playback.get(id) !== 'stream');
  // A required dependency wins over an optional classification; report that promotion.
  const visit = (id: string, chain: Set<string>) => {
    if (chain.has(id)) throw Error(`Cyclic asset dependency: ${id}.`);
    const next = new Set(chain).add(id);
    for (const child of dependencies.get(id) ?? []) {
      if (!catalog.has(child)) throw Error(`Asset ${id} depends on missing binary ${child}.`);
      if (!groups.startup!.includes(child)) { groups.startup!.push(child);reasons[child] = `Required by ${id}`; }
      visit(child, next);
    }
  };
  for (const id of [...groups.startup!]) visit(id, new Set());
  for (const [group, members] of Object.entries(groups)) {
    if (!group.startsWith('scene:') && !group.startsWith('scene3d:')) continue;
    const complete = new Set(members);
    const add = (id: string) => { for (const child of dependencies.get(id) ?? []) if (!complete.has(child)) { complete.add(child);add(child); } };
    for (const id of members) add(id);
    groups[group] = [...complete];
  }
  for (const members of Object.values(groups)) members.sort();
  return { groups, reasons, dependencies, playback };
}

export function assetReferences(options: { value: unknown; ids: ReadonlySet<string> }) {
  const found = new Set<string>();
  function walk(value: unknown, depth: number) {
    if (depth > 128) throw Error('Asset reference graph exceeds its depth limit.');
    if (typeof value === 'string') { if (options.ids.has(value)) found.add(value); }
    else if (Array.isArray(value)) for (const child of value) walk(child, depth + 1);
    else if (value && typeof value === 'object') for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(options.value, 0);return found;
}
