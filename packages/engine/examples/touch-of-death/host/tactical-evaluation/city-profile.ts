import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadEvaluationEngine } from './build.ts';
import { freshMetrics } from './metrics.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const i = args.indexOf(`--${name}`);return i < 0 ? fallback : args[i + 1] ?? fallback; }
const manifest = await Bun.file(resolve(argument('manifest', '.local/engine-perf/tod-city-source/control-pinned.json'))).json();
assert.equal(new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(manifest.checkpoint).arrayBuffer())).digest('hex'), manifest.engineSha256);
const module = await loadEvaluationEngine({ checkpoint: manifest.checkpoint });
const directory = resolve(argument('project', '.local/touch-of-death/project'));
const content = await module.openHyperfocusProjectFiles(await Bun.file(resolve(directory, '.hyperfocus/project.json')).text(), new Uint8Array(await Bun.file(resolve(directory, '.hyperfocus/assets.hfp')).arrayBuffer()));
const metrics = [freshMetrics(), freshMetrics()];
module.configureBrains({ seats: [{ kind: 'baseline', tuning: { mode: 'baseline' } }, { kind: 'baseline', tuning: { mode: 'baseline' } }], metrics });
const runtime = await module.createHyperfocus3DRuntime(content.project, content.assets);
runtime.restore({ ...runtime.snapshot(), motionSeed: 17001 });
const game = module.createGameplay3D({ project: content.project, runtime, combatQueueSeed: 17001, combatAiTuning: [{ mode: 'baseline' }, { mode: 'baseline' }] });
for (const actions of [['match:theater'], [], ['match:start']]) { game.advance({ actions });game.drainAudio(); }
for (let tick = 0; tick < 200; tick++) { game.advance();game.drainAudio(); }
const started = performance.now();
for (let tick = 0; tick < 1200; tick++) { game.advance();game.drainAudio(); }
console.log(JSON.stringify({ manifest: manifest.label, engineSha256: manifest.engineSha256, warmupTicks: 200, ticks: 1200, wallMilliseconds: performance.now() - started,
  brainMilliseconds: metrics.reduce((sum, row) => sum + row.brainMilliseconds + row.observeMilliseconds, 0), rendering: 0,
  note: 'Sampling profile includes initialization and warmup; wall excludes them. Instrumented profile timing is diagnostic, not ABBA performance evidence.' }));
