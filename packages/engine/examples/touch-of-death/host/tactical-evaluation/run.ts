import { resolve } from 'node:path';
import { cpus, platform } from 'node:os';
import { evaluationDigests, loadEvaluationEngine } from './build.ts';
import { arena } from './fixture.ts';
import { freshMetrics, summarize } from './metrics.ts';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) { const index = args.indexOf(`--${name}`);return index < 0 ? fallback : args[index + 1] ?? fallback; }
function count(name: string, fallback: number, minimum = 1) { const value = Number(argument(name, String(fallback)));if (!Number.isSafeInteger(value) || value < minimum) throw Error(`Invalid --${name}`);return value; }
const pairs = count('pairs', 8), seed = count('seed', 17001, 0), cap = count('cap', 36000);
const subject = argument('subject', 'adaptive'), opponent = argument('opponent', 'baseline');
const output = resolve(argument('out', `.local/touch-of-death/tactical-evaluation/${subject}-${opponent}.json`));
const checkpoint = argument('checkpoint', '') || undefined;
const engine = await loadEvaluationEngine({ checkpoint });
const digests = await evaluationDigests({ checkpoint });
const learningPath = argument('learning', '');
const savedArtifact = learningPath ? await Bun.file(resolve(learningPath)).json() : undefined;
if (learningPath && !savedArtifact?.learning) throw Error('Learning artifact has no model.');
const savedLearning = savedArtifact ? engine.readLearning(savedArtifact.learning) : undefined;
const retainLearning = !!savedLearning && savedArtifact.opponentKey === opponent;
let content = arena(engine.createTouchOfDeathPreset);
const projectDirectory = argument('project', '');
if (projectDirectory) content = await engine.openHyperfocusProjectFiles(await Bun.file(resolve(projectDirectory, '.hyperfocus/project.json')).text(), new Uint8Array(await Bun.file(resolve(projectDirectory, '.hyperfocus/assets.hfp')).arrayBuffer()));
const initialization = performance.now();
const runtime = await engine.createHyperfocus3DRuntime(content.project, content.assets), initial = runtime.checkpoint();
const initializationMilliseconds = performance.now() - initialization;
const spec = (name: string) => ({ kind: name === 'baseline' ? 'baseline' : name === 'previous-adaptive' ? 'previous' : 'current', tuning: { ...(name === 'default' ? {} : { mode: name === 'current' || name === 'baseline' ? 'baseline' : 'adaptive' }), adaptation: name !== 'no-adaptation', compression: name !== 'no-compression' },
  ...(['rush', 'guard', 'keepaway', 'switch'].includes(name) ? { kind: 'baseline', script: name } : {}),
  ...(name === 'held-out' ? { kind: 'baseline', policy: engine.createCombatAiPolicy({ id: 'held-out', scores: { space: .6, 'attack:heavy': .6, flank: .3 } }) } : {}) });
const trials: any[] = [];
const warmup = count('warmup', 1, 0);
for (let pair = -warmup; pair < pairs; pair++) for (const candidateSeat of [0, 1]) {
  const trialStarted = performance.now();
  const trialSeed = (seed + Math.max(0, pair) * 7919) >>> 0;
  const seats: any[] = candidateSeat === 0 ? [spec(subject), spec(opponent)] : [spec(opponent), spec(subject)];
  for (const index of [0, 1]) seats[index].tuning.opponentId = index === candidateSeat ? opponent : subject;
  if (savedLearning) seats[candidateSeat] = { ...seats[candidateSeat], learning: retainLearning ? savedLearning : engine.readLearning(undefined), tuning: { ...seats[candidateSeat].tuning, learningFrozen: true } };
  const metrics = [freshMetrics(), freshMetrics()];
  engine.configureBrains({ seats, metrics });initial.restore();runtime.restore({ ...runtime.snapshot(), motionSeed: trialSeed });
  const game = engine.createGameplay3D({ project: content.project, runtime, combatQueueSeed: trialSeed, combatAiPolicies: seats.map(seat => seat.policy) });
  for (const actions of [['match:theater'], [], ['match:start']]) { game.advance({ actions });game.drainAudio(); }
  const started = performance.now();let winner: string | undefined, ticks = 0;
  for (; ticks < cap;) {
    game.advance();game.drainAudio();ticks++;
    const match = game.combatMatch();
    if (match.phase === 'match-result') { winner = match.winner || 'draw';break; }
  }
  const ended = performance.now();
  const snapshot = !winner ? game.snapshot() : undefined;
  const fighterIds = new Set(snapshot?.combat?.state?.fighters.map((fighter: any) => fighter.id) ?? []);
  const terminal = snapshot ? { match: game.combatMatch(), combat: snapshot.combat?.state,
    entities: snapshot.entities.filter((entity: any) => fighterIds.has(entity.id)) } : undefined;
  const trial = { seed: trialSeed, candidateSeat, ticks, winner, terminal, milliseconds: ended - trialStarted, setupMilliseconds: started - trialStarted, advanceMilliseconds: ended - started, metrics };
  if (pair >= 0) { trials.push(trial);console.log(JSON.stringify({ pair, candidateSeat, winner: winner ?? 'capped', ticks, milliseconds: trial.milliseconds })); }
}
const evidence = { version: 1, command: process.argv, ...digests, environment: { bun: Bun.version, platform: platform(), processor: cpus()[0]?.model, logicalCores: cpus().length },
  fixture: projectDirectory || 'normal-health open arena', subject, opponent, pairs, seed, cap, initializationMilliseconds, learningPath: learningPath || null,
  contentionNote: argument('contention-note', ''),
  learningRestore: savedLearning ? retainLearning ? 'same-opponent-frozen' : 'different-opponent-reset' : 'fresh',
  assumptions: 'Actual gameplay.advance and runtime physics. Scripted opponents inherit baseline safety during stun/animation commitments. Baseline frozen before edits. CPU profiles are instrumented and include timer overhead; no rendering or network. Punish means damaging contact while target was visibly in move recovery at preceding AI observation. No counterfactual labels.',
  summary: summarize(trials), trials };
await Bun.write(output, JSON.stringify(evidence, null, 2));console.log(JSON.stringify({ output, summary: evidence.summary }));
