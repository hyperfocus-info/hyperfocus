import { resolve } from 'node:path';
import { cpus, platform } from 'node:os';
import { evaluationDigests, loadEvaluationEngine } from './build.ts';
import { arena } from './fixture.ts';
import { freshMetrics, sessionSetStatus, summarize } from './metrics.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const index = args.indexOf(`--${name}`);return index < 0 ? fallback : args[index + 1] ?? fallback; }
const seconds = Number(argument('session-seconds', '900')), seed = Number(argument('seed', '17001'));
const wallSeconds = Number(argument('wall-seconds', '0'));
const cap = Number(argument('cap', '12000'));
if (!Number.isSafeInteger(cap) || cap < 1) throw Error('Invalid per-set --cap.');
if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600 || !Number.isSafeInteger(seed) || seed < 0 || !Number.isSafeInteger(wallSeconds) || wallSeconds < 0 || wallSeconds > 3600) throw Error('Invalid session duration or seed.');
const adaptation = argument('adaptation', 'on') !== 'off', compression = argument('compression', 'on') !== 'off';
const mode = argument('mode', 'adaptive');
if (!['default', 'adaptive', 'baseline'].includes(mode)) throw Error('Invalid --mode.');
const output = resolve(argument('out', `.local/touch-of-death/tactical-evaluation/session-${adaptation}-${compression}.json`));
const checkpoint = argument('checkpoint', '') || undefined;
const engine = await loadEvaluationEngine({ checkpoint }), content = arena(engine.createTouchOfDeathPreset);
const digests = await evaluationDigests({ checkpoint });
const runtime = await engine.createHyperfocus3DRuntime(content.project, content.assets), initial = runtime.checkpoint();
const trials: any[] = [], samples: any[] = [];
let learning: any, clock = 0, matchIndex = 0, nextSample = 5000, nextProgress = 30000;
const probe = (model: any) => {
  const context = 'near:ground:ground:neutral';
  const candidates = [{ id: 'attack:jab', moveId: 'jab', score: 0 }, { id: 'attack:heavy', moveId: 'heavy', score: 0 }, { id: 'space', movement: 'away', score: 0 }];
  const adjusted = candidates.map(candidate => ({ ...candidate, score: model ? engine.learningAdjustment(model, context, candidate) : 0 }));
  return { context, candidates: adjusted, probabilities: engine.candidateProbabilities(adjusted, 9),
    habits: model?.habits ?? [], triedContexts: model?.actions.length ?? 0 };
};
const started = performance.now();
const running = () => wallSeconds ? performance.now() - started < wallSeconds * 1000 : clock < seconds * 60;
samples.push({ seconds: 0, wallSeconds: 0, ...probe(undefined) });
while (running()) {
  const begin = performance.now();
  const metrics = [freshMetrics(), freshMetrics()];
  const settings: any = { sessionTick: clock, switchAt: (wallSeconds || seconds) * 30, seats: [{ kind: 'current', tuning: { ...(mode === 'default' ? {} : { mode }), adaptation, compression, opponentId: 'switch' }, learning }, { kind: 'baseline', script: 'switch' }], metrics };
  const controllers = engine.configureBrains(settings);
  initial.restore();runtime.restore({ ...runtime.snapshot(), motionSeed: (seed + matchIndex * 7919) >>> 0 });
  const game = engine.createGameplay3D({ project: content.project, runtime, combatQueueSeed: (seed + matchIndex * 7919) >>> 0 });
  for (const actions of [['match:theater'], [], ['match:start']]) { game.advance({ actions });game.drainAudio(); }
  const advanceStarted = performance.now();let ticks = 0, winner: string | undefined;
  for (; running() && ticks < cap;) {
    const elapsed = performance.now() - started;
    settings.sessionTick = wallSeconds ? elapsed * 60 / 1000 : clock;
    game.advance();game.drainAudio();ticks++;clock++;
    if (wallSeconds ? elapsed >= nextSample : clock % 300 === 0) {
      samples.push({ seconds: clock / 60, wallSeconds: elapsed / 1000, ...probe(controllers[0]?.learning?.()) });nextSample += 5000;
    }
    if (elapsed >= nextProgress) {
      const status = summarize(trials);
      const progress = { version: 1, opponentKey: 'switch', wallSeconds: elapsed / 1000, simulatedSeconds: clock / 60,
        completedSets: status.completed, cappedSets: status.capped, attemptedSets: trials.length + 1,
        learning: controllers[0]?.learning?.(), samples: samples.slice(-6) };
      await Bun.write(`${output}.progress.json`, JSON.stringify(progress));
      console.log(JSON.stringify({ wallSeconds: Math.round(elapsed / 1000), simulatedSeconds: clock / 60,
        completedSets: status.completed, cappedSets: status.capped }));nextProgress += 30000;
    }
    const match = game.combatMatch();
    if (match.phase === 'match-result') { winner = match.winner || 'draw';break; }
  }
  learning = controllers[0]?.learning?.();
  if (learning) learning = engine.readLearning(learning);
  const snapshot = !winner ? game.snapshot() : undefined;
  const terminal = snapshot ? { match: game.combatMatch(), combat: snapshot.combat?.state,
    entities: snapshot.entities.filter((entity: any) => ['a', 'b'].includes(entity.id)) } : undefined;
  trials.push({ candidateSeat: 0, seed: (seed + matchIndex * 7919) >>> 0, ticks, winner, ...sessionSetStatus(winner, ticks, cap),
    terminal, milliseconds: performance.now() - begin, setupMilliseconds: advanceStarted - begin, metrics });matchIndex++;
}
const time = (sample: any) => wallSeconds ? sample.wallSeconds : sample.seconds;
const switchTime = (wallSeconds || seconds) / 2;
const beforeSwitch = [...samples].reverse().find((sample: any) => time(sample) <= switchTime);
const guardValue = (sample: any) => {
  const rows = sample.habits.filter((row: any) => row.context.startsWith('near:'));
  const observations = rows.reduce((sum: number, row: any) => sum + row.samples, 0);
  return observations ? rows.reduce((sum: number, row: any) => sum + row.guard, 0) / observations : 0;
};
const baselineGuard = guardValue(beforeSwitch);
const detected = samples.find(sample => time(sample) > switchTime && guardValue(sample) >= baselineGuard + .2);
const report = { version: 1, command: process.argv, ...digests, mode, cap, requestedWallSeconds: wallSeconds || null, simulatedSeconds: clock / 60, wallMilliseconds: performance.now() - started, adaptation, compression,
  environment: { bun: Bun.version, platform: platform(), processor: cpus()[0]?.model, logicalCores: cpus().length },
  contentionNote: argument('contention-note', ''),
  opponentKey: 'switch',
  opponent: `Same opponent switches neutral rush/flurry to guard/jab at ${switchTime} ${wallSeconds ? 'wall' : 'simulated'} seconds; baseline safety during commitments.`,
  probabilityProbe: 'Three equal-prior hypothetical legal neutral alternatives, measured with the executed learningAdjustment and selector. Holding scores/context constant isolates learning; these are not observed counterfactual outcomes.',
  changeDetection: { criterion: 'Near-context observed guard fraction rises at least .2 above switch-time value.', beforeSwitchGuardFraction: baselineGuard,
  clock: wallSeconds ? 'wall' : 'simulation', secondsAfterSwitch: detected ? time(detected) - switchTime : null }, summary: summarize(trials), samples, learning, trials };
Object.assign(report, { totalActualSetsPerMinute: report.summary.completed * 60000 / report.wallMilliseconds });
await Bun.write(output, JSON.stringify(report, null, 2));console.log(JSON.stringify({ output, wallMilliseconds: report.wallMilliseconds, changeDetection: report.changeDetection, summary: report.summary }));
