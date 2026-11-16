import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadEvaluationEngine } from './build.ts';
import { exactHash } from './exact-hash.ts';
import { freshMetrics } from './metrics.ts';
import { trafficFixture } from './traffic-fixture.ts';
import { checkpointDifference } from '@hyperfocus/utilities/compare';
import { comparablePhysics, physicsWorkCounters } from './physics-parity.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const i = args.indexOf(`--${name}`);return i < 0 ? fallback : args[i + 1] ?? fallback; }
const directory = resolve(argument('directory', '.local/engine-perf/tod-city-source'));
const allowedWorkCounters = physicsWorkCounters(argument('allow-work-counters', ''));
const control = await Bun.file(resolve(argument('control', `${directory}/control-pinned.json`))).json();
const candidate = await Bun.file(resolve(argument('candidate', `${directory}/ccd-exact.json`))).json();
const results: any[] = [];
for (const scenario of ['crossing', 'rotated-crossing', 'wreck'] as const) {
  let expected: any[] | undefined;const expectedPhysics: any[] = [];
  for (const manifest of [control, candidate]) {
    assert.equal(new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(manifest.checkpoint).arrayBuffer())).digest('hex'), manifest.engineSha256);
    const module = await loadEvaluationEngine({ checkpoint: manifest.checkpoint });
    module.configureBrains({ seats: [{ kind: 'baseline', tuning: { mode: 'baseline' } }, { kind: 'baseline', tuning: { mode: 'baseline' } }], metrics: [freshMetrics(), freshMetrics()] });
    const content = trafficFixture(module.createTouchOfDeathPreset, scenario), runtime = await module.createHyperfocus3DRuntime(content.project, content.assets);
    const game = module.createGameplay3D({ project: content.project, runtime, combatAiTuning: [{ mode: 'baseline' }, { mode: 'baseline' }] });
    game.step(['match:practice']);game.drainAudio();
    const startX = runtime.physics.body('car').x, initialHealth = game.snapshot().combat.state.fighters[0].health;
    const origin = game.checkpoint(), rows: any[] = [], rawPhysics: any[] = [], positions: number[] = [];
    for (let replay = 0; replay < 2; replay++) {
      if (replay) origin.restore();
      for (let tick = 1; tick <= 240; tick++) {
        game.step(scenario === 'wreck' && tick === 5 ? ['a:jab'] : scenario === 'wreck' && tick >= 36 && tick <= 120 ? ['move-down'] : []);
        const audio = game.drainAudio();
        const physics = runtime.physics.checkpoint(), comparable = comparablePhysics(physics, allowedWorkCounters);
        const row = { tick, save: exactHash(game.snapshot()), physics: exactHash(comparable), audio: exactHash(audio) };
        if (!replay) rawPhysics.push({ tick, hash: exactHash(physics), workCounters: Object.fromEntries(allowedWorkCounters.map(counter => [counter, physics.diagnostics[counter]])) });
        else assert.equal(exactHash(physics), rawPhysics[tick - 1].hash, `${scenario} raw physics replay tick${tick}`);
        if (!replay && !expected) expectedPhysics.push(structuredClone(comparable));
        if (!replay && expected && row.physics !== expected[tick - 1].physics) {
          const difference = checkpointDifference(expectedPhysics[tick - 1], comparable);
          if (difference?.path.startsWith('$.bodies.')) {
            const index = 'index' in difference ? difference.index : undefined;
            Object.assign(difference, { bodyId: index === undefined ? undefined : physics.topology.ids[index] });
          }
          const diagnostic = { scenario, tick, control: control.engineSha256, candidate: candidate.engineSha256, difference };
          await Bun.write(resolve(directory, `traffic-divergence-${candidate.label}.json`), JSON.stringify(diagnostic, null, 2));console.log(JSON.stringify(diagnostic));
        }
        if (replay) assert.deepEqual(row, rows[tick - 1], `${scenario} restore/replay at tick${tick}`);
        else { if (expected) assert.deepEqual(row, expected[tick - 1], `${scenario} frozen A/B at tick${tick}`);rows.push(row);positions.push(runtime.physics.body('car').x); }
      }
    }
    const snapshot = game.snapshot(), environment = snapshot.combat.environment;
    if (scenario !== 'wreck') {
      assert.ok(positions.some(x => Math.abs(x - startX) > 1), 'Offscreen vehicle must advance.');
      assert.ok(positions.some(x => Math.abs(x) < 2), 'Vehicle must enter fighter lane.');
      assert.ok(snapshot.combat.state.fighters[0].health < initialHealth, 'Crossing traffic must damage the fighter.');
    } else {
      assert.equal(environment.surfaces[0].phase, 'removed');
      assert.ok(environment.vehicleStops.some((stop: any) => stop.entityId === 'car' && stop.cause === 'impact'));
      assert.ok(environment.vehicleStops.some((stop: any) => stop.entityId === 'following' && stop.cause === 'blocked' && stop.blockerId === 'car'));
      assert.notEqual(runtime.physics.body('car').collisionMask, 0, 'Stopped wreck remains solid.');
    }
    expected ??= rows;results.push({ scenario, label: manifest.label, startX, minX: Math.min(...positions), maxX: Math.max(...positions), health: snapshot.combat.state.fighters[0].health,
      vehicleStops: environment.vehicleStops ?? [], finalSaveHash: rows.at(-1).save, finalPhysicsHash: rows.at(-1).physics, rawPhysics });
  }
}
const report = { control: control.engineSha256, candidate: candidate.engineSha256, ticksPerLane: 240, rendering: 0, allowedWorkCounters,
  parity: 'Every-frame canonical save, exact physics typed-array bytes and ordered audio; trusted restore/replay verified for both variants.', results };
const output = resolve(argument('out', `${directory}/traffic-${candidate.label}.json`));
await Bun.write(output, JSON.stringify(report, null, 2));console.log(JSON.stringify({ output, ...report, results: results.map(({ rawPhysics, ...result }) => result) }));
