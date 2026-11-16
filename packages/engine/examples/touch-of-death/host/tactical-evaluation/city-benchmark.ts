import assert from 'node:assert/strict';
import { cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { loadEvaluationEngine } from './build.ts';
import { exactHash } from './exact-hash.ts';
import { freshMetrics } from './metrics.ts';
import { checkpointDifference } from '@hyperfocus/utilities/compare';
import { comparablePhysics, physicsWorkCounters } from './physics-parity.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const index = args.indexOf(`--${name}`);return index < 0 ? fallback : args[index + 1] ?? fallback; }
function count(name: string, fallback: number) { const value = Number(argument(name, String(fallback)));if (!Number.isSafeInteger(value) || value < 1) throw Error(`Invalid --${name}`);return value; }
const directory = resolve(argument('directory', '.local/engine-perf/tod-city-source'));
const allowedWorkCounters = physicsWorkCounters(argument('allow-work-counters', ''));
const controlPath = resolve(argument('control', `${directory}/control-pinned.json`));
const candidatePath = resolve(argument('candidate', `${directory}/ccd.json`));
const control = await Bun.file(controlPath).json(), candidate = await Bun.file(candidatePath).json();
for (const manifest of [control, candidate]) {
  const actual = new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(manifest.checkpoint).arrayBuffer())).digest('hex');
  assert.equal(actual, manifest.engineSha256, 'Frozen bundle changed after capture.');
}
assert.equal(control.baselineSha256, candidate.baselineSha256, 'Both variants must use the same original AI.');
assert.notEqual(control.engineSha256, candidate.engineSha256, 'Control/candidate are identical; refusing no-op benchmark.');
const modules = { control: await loadEvaluationEngine({ checkpoint: control.checkpoint }), candidate: await loadEvaluationEngine({ checkpoint: candidate.checkpoint }) };
const projectDirectory = resolve(argument('project', '.local/touch-of-death/project'));
const projectText = await Bun.file(resolve(projectDirectory, '.hyperfocus/project.json')).text();
const assets = new Uint8Array(await Bun.file(resolve(projectDirectory, '.hyperfocus/assets.hfp')).arrayBuffer());
const content = await modules.control.openHyperfocusProjectFiles(projectText, assets);
const projectSha256 = new Bun.CryptoHasher('sha256').update(projectText).update(assets).digest('hex');
const seed = count('seed', 17001), warmupTicks = count('warmup', 200), measuredTicks = count('ticks', 1200), interval = count('interval', 120);
const order = argument('order', 'ABBAABBA');if (!/^[AB]{2,16}$/.test(order) || !order.includes('A') || !order.includes('B')) throw Error('Invalid A/B order.');
const results: any[] = [];
let expected: any[] | undefined, expectedReport: string | undefined;
const expectedPhysics: any[] = [];
for (const [trial, letter] of [...order].entries()) {
  const label = letter === 'A' ? 'control' : 'candidate', module = modules[label];
  module.configureBrains({ seats: [{ kind: 'baseline', tuning: { mode: 'baseline' } }, { kind: 'baseline', tuning: { mode: 'baseline' } }], metrics: [freshMetrics(), freshMetrics()] });
  const runtime = await module.createHyperfocus3DRuntime(content.project, content.assets);
  runtime.restore({ ...runtime.snapshot(), motionSeed: seed });
  const game = module.createGameplay3D({ project: content.project, runtime, combatQueueSeed: seed,
    combatAiTuning: [{ mode: 'baseline' }, { mode: 'baseline' }] });
  for (const actions of [['match:theater'], [], ['match:start']]) { game.advance({ actions });game.drainAudio(); }
  for (let tick = 0; tick < warmupTicks; tick++) { game.advance();game.drainAudio(); }
  const origin = game.checkpoint(), checkpoints: any[] = [], rawPhysics: any[] = [], times: number[] = [];
  let evidenceMilliseconds = 0, audio: any[] = [];
  const cpu = process.cpuUsage(), started = performance.now();
  for (let tick = 1; tick <= measuredTicks; tick++) {
    const begin = performance.now();game.advance();audio.push(...game.drainAudio());times.push(performance.now() - begin);
    if (tick % interval === 0 || tick === measuredTicks) {
      const begin = performance.now(), physics = runtime.physics.checkpoint(), comparable = comparablePhysics(physics, allowedWorkCounters);
      const row = { tick, save: exactHash(game.snapshot()), physics: exactHash(comparable), audio: exactHash(audio) };
      rawPhysics.push({ tick, hash: exactHash(physics), workCounters: Object.fromEntries(allowedWorkCounters.map(counter => [counter, physics.diagnostics[counter]])) });
      const index = checkpoints.length;checkpoints.push(row);audio = [];
      if (!expected) expectedPhysics.push(structuredClone(comparable));
      else if (row.physics !== expected[index].physics) {
        const difference = { label, trial, tick, control: control.engineSha256, candidate: candidate.engineSha256, difference: checkpointDifference(expectedPhysics[index], comparable) };
        if (difference.difference?.path.startsWith('$.bodies.')) {
          const index = 'index' in difference.difference ? difference.difference.index : undefined;
          Object.assign(difference.difference, { bodyId: index === undefined ? undefined : physics.topology.ids[index] });
        }
        await Bun.write(resolve(directory, `divergence-${candidate.label}.json`), JSON.stringify(difference, null, 2));console.log(JSON.stringify(difference));
      }
      if (expected) assert.deepEqual(row, expected[index], `First checkpoint divergence ${label}, trial${trial}, tick${tick}; timing aborted.`);
      evidenceMilliseconds += performance.now() - begin;
    }
  }
  const wallMilliseconds = performance.now() - started - evidenceMilliseconds, used = process.cpuUsage(cpu);
  const reportHash = exactHash(game.aiReport());
  if (expectedReport) assert.equal(reportHash, expectedReport, 'Outcome report differs across frozen variants.');
  expected ??= checkpoints;expectedReport ??= reportHash;
  times.sort((a, b) => a - b);
  const result = { trial, label, wallMilliseconds, ticksPerSecond: measuredTicks * 1000 / wallMilliseconds,
    evidenceMilliseconds, p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], p99: times[Math.min(times.length - 1, Math.floor(times.length * .99))],
    cpuMilliseconds: (used.user + used.system) / 1000, checkpoints, rawPhysics, reportHash, match: game.combatMatch() };
  results.push(result);console.log(JSON.stringify({ ...result, checkpoints: undefined, rawPhysics: undefined, match: undefined }));
  if (trial < 2) {
    origin.restore();audio = [];
    for (let tick = 1, index = 0; tick <= measuredTicks; tick++) {
      game.advance();audio.push(...game.drainAudio());
      if (tick % interval === 0 || tick === measuredTicks) {
        const physics = runtime.physics.checkpoint();
        assert.equal(exactHash(physics), rawPhysics[index].hash, `Raw physics restore/replay divergence at tick${tick}.`);
        assert.deepEqual({ tick, save: exactHash(game.snapshot()), physics: exactHash(comparablePhysics(physics, allowedWorkCounters)), audio: exactHash(audio) }, checkpoints[index++], `Restore/replay divergence at tick${tick}.`);audio = [];
      }
    }
  }
}
const total = (label: string) => results.filter(result => result.label === label).reduce((sum, result) => sum + result.wallMilliseconds, 0);
const report = { version: 1, command: process.argv, control, candidate, projectSha256, seed, order, warmupTicks, measuredTicks, interval,
  environment: { bun: Bun.version, cpu: cpus()[0]?.model, logicalCores: cpus().length, os: `${platform()} ${release()}`, power: 'unrecorded', thermal: 'unrecorded' },
  contention: argument('contention-note', 'Other evaluation timing paused'), renderingMilliseconds: 0, allowedWorkCounters,
  parity: 'Exact save-object identity, physics typed-array bytes and ordered emitted audio at each checkpoint; first A/B restore/replay verified. Outcome reports equal across original first passes.',
  controlWallMilliseconds: total('control'), candidateWallMilliseconds: total('candidate'), wallReductionFraction: 1 - total('candidate') / total('control'), results };
const output = resolve(argument('out', `${directory}/report-${candidate.label}.json`));
await Bun.write(output, JSON.stringify(report, null, 2));console.log(JSON.stringify({ output, wallReductionFraction: report.wallReductionFraction, parity: report.parity }));
