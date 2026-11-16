import { dirname, resolve } from 'node:path';
import { evaluationDigests, loadEvaluationEngine } from './build.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const index = args.indexOf(`--${name}`);return index < 0 ? fallback : args[index + 1] ?? fallback; }
const label = argument('label', 'control');
if (!/^[a-z][a-z0-9-]{0,47}$/.test(label)) throw Error('Invalid immutable freeze label.');
const directory = resolve(argument('directory', '.local/engine-perf/tod-city-source'));
const suppliedCheckpoint = argument('checkpoint', '') || undefined;
const pinnedManifestPath = argument('pin', '');
const livePaths = new Set(argument('live', '').split(',').filter(Boolean));
const extraSources = argument('extra-sources', '').split(',').filter(Boolean);
if (extraSources.some(path => !path.startsWith('packages/engine/src/') || !path.endsWith('.ts') || path.includes('..'))) throw Error('Extra sources must be engine TypeScript leaves.');
const manifestPath = resolve(directory, `${label}.json`);
if (await Bun.file(manifestPath).exists()) throw Error(`Freeze already exists: ${manifestPath}. Use another label/directory.`);
const sourceOverrides: Record<string, string> = {};
const pinnedPaths: string[] = [];
if (pinnedManifestPath) {
  const pinned = await Bun.file(resolve(pinnedManifestPath)).json();
  pinnedPaths.push(...Object.keys(pinned.sourceDigests));
  for (const path of Object.keys(pinned.sourceDigests)) if (!livePaths.has(path)) {
    const root = pinned.sourceDirectory ?? resolve(dirname(resolve(pinnedManifestPath)), `${pinned.label}-source`);
    const text = await Bun.file(resolve(root, path)).text();
    const digest = new Bun.CryptoHasher('sha256').update(text).digest('hex');
    if (digest !== pinned.sourceDigests[path]) throw Error(`Pinned source changed: ${path}`);
    sourceOverrides[resolve(path)] = text;
  }
  let changed = false;
  for (const path of livePaths) {
    if (!Object.hasOwn(pinned.sourceDigests, path)) throw Error(`Live path was not frozen: ${path}`);
    const digest = new Bun.CryptoHasher('sha256').update(await Bun.file(path).text()).digest('hex');
    changed ||= digest !== pinned.sourceDigests[path];
  }
  if (livePaths.size && !changed) throw Error('All declared live leaves equal control; refusing no-op candidate.');
}
await loadEvaluationEngine({ checkpoint: suppliedCheckpoint, sourceOverrides });
const digests = await evaluationDigests({ checkpoint: suppliedCheckpoint });
const entrySources = ['packages/engine/src/physics/rigid-3d-operations.ts', 'packages/engine/src/physics/rigid-3d-api.ts',
  'packages/engine/src/project/3d/combat-interaction/session.ts', 'packages/engine/src/project/3d/combat-gameplay.ts'];
const sources: Record<string, string> = {};
const sourceDirectory = resolve(directory, `${label}-source`);
for (const path of new Set([...(suppliedCheckpoint ? [] : entrySources), ...pinnedPaths, ...extraSources])) {
  const text = sourceOverrides[resolve(path)] ?? await Bun.file(path).text();sources[path] = new Bun.CryptoHasher('sha256').update(text).digest('hex');
  await Bun.write(resolve(sourceDirectory, path), text);
}
const checkpoint = resolve(directory, `${label}.js`);
await Bun.write(checkpoint, Bun.file(digests.checkpoint));
const manifest = { version: 1, label, frozenAt: new Date().toISOString(), ...digests, checkpoint,
  sourceDirectory, sourceDigests: sources, pinnedManifestPath: pinnedManifestPath || null, livePaths: [...livePaths], sourceNote: suppliedCheckpoint ? 'Precompiled checkpoint; selected source pins captured separately.' : 'Selected edited source leaves retained; complete dependency graph preserved in bundle.',
  benchmarkAi: 'Both seats must use frozen original controller in explicit baseline mode; isolates physical changes from defaults and styles.' };
await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));console.log(JSON.stringify(manifest));
