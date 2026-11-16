import { createGameplay3D, createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import { createSimulationBatch } from '@hyperfocus/engine/core';
import type { BulkProgress, BulkSimulationOptions } from './protocol.ts';
import { createPolicyExperiment } from '@hyperfocus/touch-of-death/learning/experiment';
import { collectTrialEvidence } from '@hyperfocus/touch-of-death/trial-evidence';
import type { PolicyResult, PolicyTrial } from '@hyperfocus/touch-of-death/learning/trials';
import type { ContextualTrialInput } from './adaptation/session.ts';

/** Each trial is a fresh, seeded AI 9 versus AI 9 first-to-three set. */
export async function createBulkSimulation(options: BulkSimulationOptions) {
  const { project, assets, seed, seedStride = 1, maxMatchTicks = 36_000 } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Invalid training seed.');
  if (!Number.isInteger(seedStride) || seedStride < 1 || seedStride > 0xffffffff) throw Error('Invalid training seed stride.');
  if (!Number.isInteger(maxMatchTicks) || maxMatchTicks < 1 || maxMatchTicks > 216_000) throw Error('Invalid training tick limit.');
  let runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>> | undefined = await createHyperfocus3DRuntime(project, assets);
  const initial = runtime.checkpoint();
  let game: ReturnType<typeof createGameplay3D> | undefined;
  let contextual = options.contextual;
  let evidenceFinished = false;
  function finishContextual() {
    if (contextual && game && !evidenceFinished) {
      const result = game.finishCombatAiLearningEvidence();
      if (result) progress.contextualResult = { input: contextual, ...result };
      evidenceFinished = true;
    }
  }
  const experiment = options.learning ? createPolicyExperiment({ seed, ...options.learning }) : undefined;
  let trial = experiment?.next();
  let finished = false, disposed = false, result: PolicyResult | undefined;
  const freshProgress = (): BulkProgress => ({ fights: 0, p1Wins: 0, p2Wins: 0, draws: 0, capped: 0, ticks: 0, droppedMoveSummaries: 0, seed, insights: [], moves: [] });
  let progress = freshProgress();
  progress.learning = experiment?.snapshot();
  function note(text: string) {
    if (progress.insights.at(-1) === text) return;
    progress.insights.push(text);
    if (progress.insights.length > 12) progress.insights.shift();
  }
  function summarize() {
    const report = game?.aiReport();
    if (!report) return;
    const summaries = [...report.segments.map(segment => segment.insights), report.insights];
    const moves = new Map<string, { hits: number; damage: number; whiffs: number; blocked: number; parried: number }>();
    for (const summary of summaries) {
      for (const row of [...summary.worked, ...summary.struggled]) {
        const totals = moves.get(row.moveId) ?? { hits: 0, damage: 0, whiffs: 0, blocked: 0, parried: 0 };
        if ('hits' in row) { totals.hits += row.hits;totals.damage += row.damage; }
        else { totals.whiffs += row.whiffs;totals.blocked += row.blocked;totals.parried += row.parried; }
        moves.set(row.moveId, totals);
      }
    }
    progress.droppedMoveSummaries = progress.droppedMoveSummaries === undefined || summaries.some(summary => summary.droppedMoves === undefined)
      ? undefined : progress.droppedMoveSummaries + summaries.reduce((total, summary) => total + summary.droppedMoves, 0);
    for (const [moveId, row] of moves) {
      let total = progress.moves.find(move => move.moveId === moveId);
      if (!total && progress.moves.length < 64) { total = { moveId, hits: 0, damage: 0, whiffs: 0, blocked: 0, parried: 0 };progress.moves.push(total); }
      if (total) { total.hits += row.hits;total.damage += row.damage;total.whiffs += row.whiffs;total.blocked += row.blocked;total.parried += row.parried; }
      else if (progress.droppedMoveSummaries !== undefined) progress.droppedMoveSummaries++;
    }
  }
  function start(trialSeed: number) {
    if (!runtime) throw Error('Training simulation is disposed.');
    initial.restore();
    progress.seed = trialSeed;
    runtime.restore({ ...runtime.snapshot(), motionSeed: progress.seed });
    game = createGameplay3D({ project, runtime, combatQueueSeed: progress.seed, combatAiPolicies: trial?.policies,
      ...(contextual ? { combatAiLearning: contextual.models, combatAiTuning: [{ opponentId: contextual.opponentKeys[0], exploration: contextual.exploration, learningFrozen: contextual.frozen }, { opponentId: contextual.opponentKeys[1], exploration: contextual.exploration, learningFrozen: contextual.frozen }] } : {}) });
    if (contextual) game.startCombatAiLearningEvidence();
    if (!game.snapshot().combat?.match) throw Error('Bulk training requires a two-fighter combat match.');
    for (const actions of [['match:theater'], [], ['match:start']]) { game.step(actions);game.drainAudio(); }
  }
  let batch: ReturnType<typeof makeBatch> | undefined;
  function makeBatch() { return createSimulationBatch({
    seed, seedStride, maxTrialTicks: maxMatchTicks,
    createTrial({ seed: trialSeed }) {
      if (!options.externalTrials) trial = experiment?.next();
      trialSeed = trial?.seed ?? trialSeed;
      start(trialSeed);let trialTicks = 0;
      return {
        step() {
          if (!game) throw Error('Training simulation is unavailable.');
          game.advance();game.drainAudio();trialTicks++;
          const match = game.combatMatch();
          if (!match) throw Error('Training match is unavailable.');
          progress.current = { seed: trialSeed, ticks: trialTicks, phase: match.phase, p1Rounds: match.playerWins, p2Rounds: match.opponentWins };
          if (match.phase === 'match-result') return match.winner;
          return undefined;
        },
        dispose() { game = undefined; },
      };
    },
    onTrial(outcome) {
      finishContextual();
      const report = game?.aiReport();
      if (report) {
        const trials = progress.trials ??= [];
        trials.push(collectTrialEvidence({ seed: trial?.seed ?? outcome.seed, ticks: outcome.ticks, status: outcome.status,
          winner: outcome.status === 'completed' ? outcome.result || 'draw' : undefined, report }));
        if (trials.length > 8) trials.shift();
      }
      if (outcome.status === 'completed') {
        progress.fights++;
        if (outcome.result === 'player') progress.p1Wins++;
        else if (outcome.result === 'opponent') progress.p2Wins++;
        else progress.draws++;
        summarize();
      } else {
        progress.capped++;summarize();note(`Set reached ${maxMatchTicks} ticks without a winner; excluded from the score.`);
      }
      if (experiment && trial) {
        experiment.record({ id: trial.id, status: outcome.status, winner: outcome.status === 'completed' ? outcome.result || 'draw' : undefined, ticks: outcome.ticks });
        progress.learning = experiment.snapshot();
        if (!experiment.next()) { finished = true;batch?.dispose(); }
      } else if (options.externalTrials && trial) {
        result = { id: trial.id, status: outcome.status, winner: outcome.status === 'completed' ? outcome.result || 'draw' : undefined, ticks: outcome.ticks };
        finished = true;batch?.dispose();
      }
    },
  }); }
  if (!options.externalTrials) batch = makeBatch();
  function advanceTicks({ ticks }: { ticks: number }) {
    if (disposed) throw Error('Training simulation is disposed.');
    if (batch) progress.ticks = (finished ? batch.progress() : batch.advance({ ticks })).ticks;
  }
  const snapshot = () => structuredClone(progress);
  return {
    get idle() { return options.externalTrials === true && (!batch || finished); },
    get finished() { return finished; },
    get completedTrial() { return result; },
    finishContextual,
    startTrial({ trial: next, contextual: nextContextual }: { trial: PolicyTrial; contextual?: ContextualTrialInput }) {
      if (disposed) throw Error('Training simulation is disposed.');
      if (!options.externalTrials || batch && !finished) throw Error('Training trial is already running.');
      trial = structuredClone(next);contextual = nextContextual;evidenceFinished = false;progress = freshProgress();result = undefined;finished = false;
      batch?.dispose();batch = makeBatch();
    },
    advanceTicks,
    progress: snapshot,
    advance({ ticks }: { ticks: number }) {
      advanceTicks({ ticks });return snapshot();
    },
    dispose() { disposed = true;batch?.dispose();game = undefined;runtime = undefined; },
  };
}
