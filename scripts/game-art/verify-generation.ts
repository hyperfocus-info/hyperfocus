import { resolve, dirname, relative } from 'node:path';
import { execute } from './execute.ts';

// Same command an agent uses; no bypass of persistence, native capture or review.
const root = process.cwd(), trial = resolve('.local/game-art/generation-verification', String(Date.now())), file = resolve('apps/engine-editor/scripts/game-art/examples/construction.json'), source = await Bun.file(file).json();
source.id = 'verification-' + Date.now();
source.owner = resolve(dirname(file), source.owner);
for (const recipe of source.recipes) if (recipe.generator.path) recipe.generator.path = resolve(dirname(file), recipe.generator.path);
for (const material of source.materials) if (material.maps) for (const slot of Object.keys(material.maps)) material.maps[slot] = resolve(dirname(file), material.maps[slot]);
const observations: { name: string; elapsedMs: number; output: string; version: string; runRoot: string; reusedPriorRun: boolean; log: string; build: { modelsCooked: number; modelsCached: number }; drawCalls: number; visible: number; errors: string[] }[] = [];
async function generate(name: string, input: unknown) {
  const brief = resolve(trial, name + '.json'), serialized = JSON.stringify(input, null, 2);
  if (await Bun.file(brief).exists()) { if (await Bun.file(brief).text() !== serialized) throw new Error('Preserve verification input ' + brief); }
  else await Bun.write(brief, serialized);
  const start = performance.now(), result = await execute({ root, args: ['apps/engine-editor/cli.ts', 'art', relative(root, brief), '--project', resolve(trial, 'working')], timeoutSeconds: 180 });
  const log = resolve(trial, `${observations.length + 1}-${name}.log`);await Bun.write(log, result.stdout + result.stderr);
  if (result.code) throw new Error(name + ' failed; see ' + trial);
  const record = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))), output = record.output;
  const build = await Bun.file(resolve(output, 'build.json')).json(), capture = await Bun.file(resolve(output, 'capture.json')).json();
  observations.push({ name, elapsedMs: performance.now() - start, output, version: record.content, runRoot: output, reusedPriorRun: Boolean(record.cached), log, build, drawCalls: capture.overview.stats.drawCalls, visible: capture.overview.visible, errors: capture.errors });
  return { record, output, build, capture };
}
const baseline = await generate('baseline', source);
const repeated = await generate('baseline', source);
if (baseline.record.content !== repeated.record.content || !repeated.record.cached || repeated.record.workThisRun.captures !== 0) throw new Error('Unchanged invocation reran stages');
const palette = structuredClone(source);palette.materials[1].color = [.2, .5, .8];
const revised = await generate('palette', palette);
if (revised.build.modelsCooked !== 0 || revised.build.modelsCached !== 2 || revised.build.imagesCooked !== 0) throw new Error('Palette edit recooked unchanged assets');
const bulk = structuredClone(source);bulk.placements[1].repeat = { count: [10, 1, 100], step: [.65, 0, .75] };delete bulk.camera;
const scaled = await generate('bulk', bulk);
if (scaled.capture.overview.visible !== 1002 || scaled.capture.overview.stats.drawCalls !== baseline.capture.overview.stats.drawCalls || scaled.build.modelsCooked !== 0) throw new Error('Bulk instancing regressed');
const voxel = structuredClone(source);voxel.recipes[0].generator.edits.push({ min: [4, 0, 2], max: [6, 1, 4], solid: false });
const edited = await generate('voxel-edit', voxel);
if (edited.build.modelsCooked > 1 || edited.build.modelsCooked + edited.build.modelsCached !== 2) throw new Error('Voxel edit invalidated unrelated geometry');
const hash = (build: { provenance: { id: string; sha256: string }[] }, id: string) => build.provenance.find(p => p.id === id)!.sha256;
if (hash(edited.build, 'ground') === hash(baseline.build, 'ground') || hash(edited.build, 'marker') !== hash(baseline.build, 'marker')) throw new Error('Voxel edit did not preserve unrelated asset bytes');
await Bun.write(resolve(trial, 'result.json'), JSON.stringify({ at: new Date().toISOString(), observations, checks: { unchangedReused: true, paletteRecookedGeometry: false, bulkVisible: 1002, batchDrawCallsUnchanged: true, voxelEditCookedOnlyChangedModel: true }, buildScope: 'Build receipts belong to the original version; reused invocations execute no stages and retain that receipt.', timingScope: 'Observed local runs, not controlled performance benchmarking', tasteApproved: false, modelUsage: null }, null, 2));
console.log(JSON.stringify({ trial, runs: observations.map(o => ({ name: o.name, elapsedMs: o.elapsedMs, visible: o.visible, drawCalls: o.drawCalls, reused: o.reusedPriorRun, cooked: o.reusedPriorRun ? 0 : o.build.modelsCooked, cached: o.reusedPriorRun ? 0 : o.build.modelsCached })) }, null, 2));
