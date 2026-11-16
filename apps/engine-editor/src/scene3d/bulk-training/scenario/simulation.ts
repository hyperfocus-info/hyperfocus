import { createGameplay3D, createHyperfocus3DRuntime, readCombatProject3D, type GameplayProject3D, type PortableAsset3D, type CombatAiLearningEvidence, type CombatAiLearningProbe } from '@hyperfocus/engine/project/runtime-3d';
import type { ContextualTrialInput } from '../adaptation/session.ts';

export type ScenarioResult = {
  action: string; repetition: number; opponentSeed: number; status: 'complete' | 'partial' | 'censored' | 'unexecuted';
  outcome: string; dealt: number; received: number; reward: number; ticks: number; executed: boolean;
  /** Total observed response-window consequences, not damage attributed to the selected move. */
  rollout?: { complete: boolean; ticks: number; healthDealt: number; healthReceived: number; roundsWon: number; roundsLost: number; reward: number; terminal?: boolean };
};
export type ScenarioComparison = { action: string; reference: string; pairedComplete: number; meanNetDamageDifference: number | null; wins: number; ties: number; losses: number; scope?: 'fixed-response-window' | 'direct-action-window' };
export type ScenarioProgress = {
  version: 1; status: 'reconstructing' | 'testing' | 'complete'; scope: 'conditional-checkpoint';
  seed: number; frame: number; seat: 0 | 1; context: string; actions: string[]; repetitions: number; repetitionOffset?: number; windowTicks: number;
  ticks: number; reconstructionTicks: number; completed: number; total: number; stateDigest?: string;
  decisionProbe?: CombatAiLearningProbe;
  comparisonTolerance?: number;
  legalOptionCount: number; testedOptionCount: number; requestedChoices: number; observedLegalOptions: string[]; exhaustive: boolean;
  rolloutTicks?: number; windowCoverage?: { complete: number; total: number; requestedTicks: number; observedTicks: number };
  current?: { action: string; repetition: number; ticks: number };
  results: ScenarioResult[]; comparisons: ScenarioComparison[];
};
type Options = { project: GameplayProject3D; assets: readonly PortableAsset3D[]; seed: number; frame: number; seat: 0 | 1; context: string;
  actions: string[]; input: ContextualTrialInput; repetitions?: number; repetitionOffset?: number; windowTicks?: number; exhaustive?: boolean };
type OutcomeRows = NonNullable<CombatAiLearningEvidence['outcomes']>;
type DirectResult = Pick<ScenarioResult, 'status' | 'outcome' | 'dealt' | 'received' | 'reward' | 'ticks' | 'executed'>;
const canonical = (action: string) => action.startsWith('forced:') ? `attack:${action.slice(7)}` : action;
const key = (row: OutcomeRows[number]) => [row.context, row.action, row.facts.targetStamina, row.facts.targetHealth, row.facts.targetMotion].join('|');
function integer(value: number, min: number, max: number, name: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`Invalid scenario ${name}.`);
}
function variationSeed(seed: number, repetition: number) {
  let value = (seed ^ Math.imul(repetition + 1, 0x9e3779b9)) >>> 0;
  value ^= value << 13;value ^= value >>> 17;value ^= value << 5;return (value >>> 0) || 1;
}
/** Diagnostic identity, not a security checksum. Checkpoint equality is also checked directly. */
function digest(text: string) {
  let value = 0x811c9dc5;for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  return `fnv1a-32:${(value >>> 0).toString(16).padStart(8, '0')}`;
}
function stateText(value: unknown) {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}
export function compareScenarioResults({ results, actions, tolerance = 0 }: { results: readonly ScenarioResult[]; actions: readonly string[]; tolerance?: number }): ScenarioComparison[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw Error('Invalid scenario reporting tolerance.');
  const reference = actions[0]!;
  return actions.slice(1).map(action => {
    const differences = results.filter(row => row.action === action).flatMap(row => {
      const control = results.find(other => other.action === reference && other.repetition === row.repetition);
      if (!control) return [];
      if (row.rollout || control.rollout) return row.rollout?.complete && control.rollout?.complete
        && (row.rollout.ticks === control.rollout.ticks || row.rollout.terminal || control.rollout.terminal)
        ? [row.rollout.healthDealt - row.rollout.healthReceived - control.rollout.healthDealt + control.rollout.healthReceived] : [];
      return row.status === 'complete' && control.status === 'complete' ? [row.dealt - row.received - control.dealt + control.received] : [];
    });
    return { action, reference, pairedComplete: differences.length, meanNetDamageDifference: differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null,
      wins: differences.filter(value => value > tolerance).length, ties: differences.filter(value => Math.abs(value) <= tolerance).length, losses: differences.filter(value => value < -tolerance).length,
      scope: results.some(result => result.rollout) ? 'fixed-response-window' as const : 'direct-action-window' as const };
  });
}
function observedTotals(before: OutcomeRows, after: OutcomeRows, action: string, context: string, partial: boolean) {
  const old = new Map(before.map(row => [key(row), row]));let dealt = 0, received = 0;
  for (const row of after) {
    if (row.context !== context || row.action !== canonical(action)) continue;
    const prior = old.get(key(row)), prefix = partial ? 'partial' : 'complete';
    if (row[`${prefix}Count`] <= (prior?.[`${prefix}Count`] ?? 0)) continue;
    dealt += row[`${prefix}Dealt`] - (prior?.[`${prefix}Dealt`] ?? 0);received += row[`${prefix}Received`] - (prior?.[`${prefix}Received`] ?? 0);
  }
  return { dealt, received };
}

/** Bounded conditional experiments against one exactly restored real-game checkpoint. */
export async function createScenarioSimulation(options: Options) {
  const { seed, frame, seat, context } = options, repetitions = options.repetitions ?? 8, repetitionOffset = options.repetitionOffset ?? 0, windowTicks = options.windowTicks ?? 240;
  integer(seed, 0, 0xffffffff, 'seed');integer(frame, 0, 36_000, 'frame');integer(repetitions, 1, 16, 'repetitions');integer(windowTicks, 12, 600, 'window');
  integer(repetitionOffset, 0, 15, 'repetition offset');integer(repetitionOffset + repetitions, 1, 16, 'repetition range');
  if (seat !== 0 && seat !== 1 || !/^(near|far):(ground|air):(ground|air):(guard|committed|neutral|stunned)$/.test(context)) throw Error('Invalid scenario state context.');
  const actions = [...options.actions];
  if (actions.length < 1 || actions.length > 64 || new Set(actions).size !== actions.length || actions.some(action => typeof action !== 'string' || !action || action.length > 160)
    || options.exhaustive !== undefined && typeof options.exhaustive !== 'boolean') throw Error('Invalid scenario legal alternatives.');
  const input = structuredClone(options.input);
  if (input.opponentKeys.length !== 2 || input.models.length !== 2 || input.opponentKeys.some(key => typeof key !== 'string' || !key || key.length > 128)) throw Error('Invalid scenario opponent input.');
  const declaration = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (!declaration || !(declaration.config.maxHealth > 0)) throw Error('Scenario replay requires an authored combat health maximum.');
  const maxHealth = declaration.config.maxHealth;
  let runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>> | undefined = await createHyperfocus3DRuntime(options.project, options.assets);
  runtime.restore({ ...runtime.snapshot(), motionSeed: seed });
  let game: ReturnType<typeof createGameplay3D> | undefined;
  let checkpoint: ReturnType<ReturnType<typeof createGameplay3D>['checkpoint']> | undefined;
  let checkpointText = '', verified = false, forcing = false, forced = false, executed = false, disposed = false;
  let initialOutcomes: OutcomeRows | undefined;
  let direct: DirectResult | undefined, healthDealt = 0, healthReceived = 0, roundsWon = 0, roundsLost = 0;
  let previousHealth: [number, number] = [0, 0], previousRounds: [number, number] = [0, 0];
  const progress: ScenarioProgress = { version: 1, status: 'reconstructing', scope: 'conditional-checkpoint', seed, frame, seat, context, actions,
    repetitions, ...(options.repetitionOffset !== undefined ? { repetitionOffset } : {}), windowTicks, ticks: 0, reconstructionTicks: 0, completed: 0, total: repetitions * actions.length, results: [], comparisons: [],
    legalOptionCount: 0, testedOptionCount: 0, requestedChoices: actions.length, observedLegalOptions: [], exhaustive: false, comparisonTolerance: maxHealth * .001,
    rolloutTicks: 0, windowCoverage: { complete: 0, total: repetitions * actions.length, requestedTicks: repetitions * actions.length * windowTicks, observedTicks: 0 } };
  function override(observedSeat: 0 | 1, observedFrame: number, candidates: readonly { id: string }[]) {
    if (observedSeat !== seat || observedFrame !== frame || forcing && forced) return undefined;
    const probe = game?.combatAiLearningEvidence()?.[seat]?.probes.at(-1);
    if (!checkpoint || !probe || probe.frame !== frame || probe.context !== context || actions.some(action => !candidates.some(candidate => candidate.id === action))) throw Error('The reconstructed scenario does not match its observed context and legal alternatives.');
    const completePool = actions.length === candidates.length;
    if (candidates.length > 64 || options.exhaustive !== false && !completePool) throw Error('An exhaustive scenario must request every observed legal option.');
    progress.legalOptionCount = candidates.length;progress.observedLegalOptions = candidates.map(candidate => candidate.id);progress.exhaustive = completePool;
    if (!forcing) { verified = true;return undefined; }
    progress.decisionProbe ??= structuredClone(probe);
    forced = true;return progress.current?.action;
  }
  game = createGameplay3D({ project: options.project, runtime, combatQueueSeed: seed, combatAiPolicies: input.policies,
    combatAiLearning: input.models, combatAiTuning: [{ opponentId: input.opponentKeys[0], exploration: input.exploration, learningFrozen: input.frozen }, { opponentId: input.opponentKeys[1], exploration: input.exploration, learningFrozen: input.frozen }], combatAiDecisionOverride: override });
  game.startCombatAiLearningEvidence();
  if (!game.combatMatch()) throw Error('Scenario replay requires a two-fighter combat match.');
  for (const actions of [['match:theater'], [], ['match:start']]) { game.advance({ actions });game.drainAudio(); }
  function startReplication() {
    if (!game || !checkpoint) throw Error('Scenario checkpoint is unavailable.');
    checkpoint.restore();
    const snapshot = game.snapshot();
    if (stateText(snapshot) !== checkpointText) throw Error('Scenario checkpoint restore changed the physical or controller baseline.');
    const opponent = seat === 0 ? checkpoint.state.combat?.ai : checkpoint.state.combat?.playerAi;
    if (!opponent) throw Error('Scenario replay requires both AI controllers.');
    const repetition = repetitionOffset + Math.floor(progress.completed / actions.length), action = actions[progress.completed % actions.length]!;
    const originalRandom = opponent.policy.random;opponent.policy.random = variationSeed(seed, repetition);
    try { checkpoint.restore(); } finally { opponent.policy.random = originalRandom; }
    game.startCombatAiLearningEvidence();
    progress.current = { action, repetition, ticks: 0 };forcing = true;forced = false;executed = false;initialOutcomes = undefined;
    direct = undefined;healthDealt = healthReceived = roundsWon = roundsLost = 0;
    const state = game.combatState(), match = game.combatMatch();
    if (!state || state.fighters.length !== 2 || !match) throw Error('Scenario response window requires two committed fighters.');
    previousHealth = [state.fighters[seat]!.health, state.fighters[1 - seat]!.health];
    previousRounds = seat === 0 ? [match.playerWins, match.opponentWins] : [match.opponentWins, match.playerWins];
  }
  function captureDirect(model = game?.combatAiLearning()?.[seat], evidence = game?.combatAiLearningEvidence()?.[seat]): DirectResult {
    if (!game || !progress.current) throw Error('Scenario replicate is unavailable.');
    const { action, ticks } = progress.current;
    const trace = model?.traces.find(trace => trace.frame === frame && trace.chosen === action);
    const status = !forced ? 'unexecuted' : trace?.status === 'complete' ? 'complete' : trace?.outcome === 'partial-contact' ? 'partial' : 'censored';
    const totals = status === 'complete' || status === 'partial' ? observedTotals(initialOutcomes ?? [], evidence?.outcomes ?? [], action, context, status === 'partial') : { dealt: 0, received: 0 };
    const reward = status === 'complete' || status === 'partial' ? trace?.reward ?? 0 : 0;
    return { status, outcome: trace?.outcome || (status === 'unexecuted' ? 'selector-not-reached' : 'unknown-window'), ...totals, reward, ticks, executed };
  }
  function finishReplication() {
    if (!game || !progress.current) throw Error('Scenario replicate is unavailable.');
    const { action, repetition, ticks } = progress.current, finished = game.finishCombatAiLearningEvidence();
    direct ??= captureDirect(finished?.learning[seat], finished?.evidence[seat]);
    const terminal = game.combatMatch()?.phase === 'match-result', complete = forced && (ticks >= windowTicks || terminal);
    const rollout = { complete, ticks, healthDealt, healthReceived, roundsWon, roundsLost,
      reward: Math.max(-1, Math.min(1, (healthDealt - healthReceived) / maxHealth + .25 * (roundsWon - roundsLost))), ...(terminal ? { terminal: true } : {}) };
    progress.results.push({ action, repetition, opponentSeed: variationSeed(seed, repetition), ...direct, rollout });
    if (progress.windowCoverage && complete) progress.windowCoverage.complete++;
    progress.completed++;progress.comparisons = compareScenarioResults({ results: progress.results, actions, tolerance: progress.comparisonTolerance });
    progress.testedOptionCount = new Set(progress.results.filter(result => result.status !== 'unexecuted').map(result => result.action)).size;
    if (progress.completed === progress.total) { progress.status = 'complete';delete progress.current;forcing = false; }
    else startReplication();
  }
  function step() {
    if (!game) throw Error('Scenario simulation is disposed.');
    if (progress.status === 'reconstructing') {
      const state = game.combatState();
      if (!state || state.frame > frame || progress.reconstructionTicks >= 36_000) throw Error('The requested scenario frame was not reached within the original set.');
      const match = game.combatMatch();
      if (state.frame === frame && (match?.phase === 'fighting' || match?.phase === 'countdown' && match.ticks === 1)) {
        checkpoint = game.checkpoint();checkpointText = stateText(game.snapshot());
      }
      game.advance();game.drainAudio();progress.reconstructionTicks++;progress.ticks++;
      if (verified) { progress.stateDigest = digest(checkpointText);progress.status = 'testing';startReplication(); }
      return;
    }
    const current = progress.current;if (!current) return;
    game.advance();game.drainAudio();current.ticks++;progress.ticks++;progress.rolloutTicks = (progress.rolloutTicks ?? 0) + 1;
    if (progress.windowCoverage) progress.windowCoverage.observedTicks++;
    const state = game.combatState(), match = game.combatMatch();
    if (!state || state.fighters.length !== 2 || !match) throw Error('Scenario response window lost its committed fighters.');
    const health: [number, number] = [state.fighters[seat]!.health, state.fighters[1 - seat]!.health];
    healthReceived += Math.max(0, previousHealth[0] - health[0]);healthDealt += Math.max(0, previousHealth[1] - health[1]);previousHealth = health;
    const rounds: [number, number] = seat === 0 ? [match.playerWins, match.opponentWins] : [match.opponentWins, match.playerWins];
    roundsWon += Math.max(0, rounds[0] - previousRounds[0]);roundsLost += Math.max(0, rounds[1] - previousRounds[1]);previousRounds = rounds;
    if (!direct) {
      const model = game.combatAiLearning()?.[seat], pending = [model?.pending, model?.next].find(attempt => attempt?.frame === frame && attempt.action === current.action);
      if (pending && pending.started >= 0 && !executed) { executed = true;initialOutcomes = game.combatAiLearningEvidence()?.[seat]?.outcomes ?? []; }
      const trace = model?.traces.find(trace => trace.frame === frame && trace.chosen === current.action);
      if (forced && trace && trace.status !== 'pending') direct = captureDirect(model);
    }
    if (current.ticks >= windowTicks || match.phase === 'match-result') finishReplication();
  }
  return {
    get finished() { return progress.status === 'complete'; },
    advanceTicks({ ticks }: { ticks: number }) {
      if (disposed) throw Error('Scenario simulation is disposed.');integer(ticks, 1, 600, 'tick chunk');
      for (let index = 0; index < ticks && progress.status !== 'complete'; index++) step();
    },
    progress() { return structuredClone(progress); },
    dispose() { disposed = true;game = undefined;runtime = undefined;checkpoint = undefined; },
  };
}
