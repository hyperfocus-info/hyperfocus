import { createGameplay3D, createHyperfocus3DRuntime, readCombatAiPolicy, type CombatAiPolicy,
  type GameplayProject3D, type PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import { collectTrialEvidence, type TrialEvidence } from '../../src/trial-evidence.ts';

const PAIRS = 128, LIFETIME_ALPHA = 0.01, MINIMUM_GAIN = 0.02, MAX_EVIDENCE_BYTES = 480000;
type Request = { candidate: CombatAiPolicy; active?: CombatAiPolicy; previous?: CombatAiPolicy; attempt: number; excludedSeeds?: readonly number[]; signal?: AbortSignal };
type Match = { seed: number; policies: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined]; signal?: AbortSignal };
type Outcome = { status: 'completed' | 'capped' | 'aborted'; winner?: 'player' | 'opponent' | 'draw'; ticks: number; report?: TrialEvidence };
type PolicySlot = 'candidate' | 'champion' | 'previous' | 'baseline';
type Trial = { seed: number; group: 'champion' | 'previous' | 'baseline'; candidateSeat: 0 | 1; control: boolean;
  policySlots: readonly [PolicySlot, PolicySlot]; status: Outcome['status']; winner?: Outcome['winner']; ticks: number };

function secureSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]!; }
function score(outcome: Outcome, seat: 0 | 1) { return outcome.winner === 'draw' ? .5 : outcome.winner === (seat === 0 ? 'player' : 'opponent') ? 1 : 0; }
function sameWeights(left: CombatAiPolicy | undefined, right: CombatAiPolicy | undefined) {
  const canonical = (policy: CombatAiPolicy | undefined) => JSON.stringify(Object.entries(policy?.scores ?? {}).filter(([, value]) => value !== 0).sort(([a], [b]) => a.localeCompare(b)));
  return canonical(left) === canonical(right);
}

/** Internal runner boundary for deterministic tests. Production uses only the trusted factory below. */
export function createPolicyEvaluatorCore(options: { runMatch(match: Match): Promise<Outcome>; randomSeed?: () => number }) {
  return {
    async evaluate(request: Request) {
      if (!Number.isSafeInteger(request.attempt) || request.attempt < 1) throw Error('Evaluation requires a positive durable attempt ordinal.');
      // Own validated policy copies before drawing any held-out seed or awaiting work.
      const candidate = readCombatAiPolicy(request.candidate), active = readCombatAiPolicy(request.active), previous = readCombatAiPolicy(request.previous);
      if (!candidate) throw Error('Evaluation candidate is required.');
      const excluded = [...request.excludedSeeds ?? []];
      if (excluded.length > 4096 || excluded.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw Error('Invalid excluded evaluation seeds.');
      const used = new Set(excluded), randomSeed = options.randomSeed ?? secureSeed;
      function seeds() {
        const result: number[] = [];
        for (let tries = 0; result.length < PAIRS; tries++) {
          if (tries >= 10000) throw Error('Could not draw independent evaluation seeds.');
          const seed = randomSeed();
          if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Invalid evaluation seed source.');
          if (!used.has(seed)) { used.add(seed);result.push(seed); }
        }
        return result;
      }
      const alpha = LIFETIME_ALPHA / request.attempt / (request.attempt + 1), radius = Math.sqrt(Math.log(1 / alpha) / (2 * PAIRS));
      const trials: Trial[] = [], reports: TrialEvidence[] = [];
      const artifacts = { candidate, champion: active ?? null, previous: previous ?? null, baseline: null };
      const guards: { opponent: 'previous' | 'baseline'; candidateMean: number; championMean: number; improvement: number; passed: boolean }[] = [];
      let direct: { mean: number; lowerBound: number; passed: boolean } | undefined, droppedReports = 0;
      const evidence = () => ({ version: 1 as const, attempt: request.attempt, artifacts, pairsPerOpponent: PAIRS,
        alpha, lifetimeAlpha: LIFETIME_ALPHA, minimumGain: MINIMUM_GAIN, direct, guards, trials, reports,
        coverage: { evaluatedMatches: trials.length, retainedReports: reports.length, droppedReports, reportLimit: 8, maxBytes: MAX_EVIDENCE_BYTES,
          missingReports: trials.length - reports.length - droppedReports },
        assumptions: 'Fresh uniform seed pairs; each pair averages both seats. Hoeffding controls direct-champion false promotion across durable attempt ordinals. Frozen guards are aggregate non-regression, not statistical non-inferiority.' });
      function result(approved: boolean, reason: string) {
        let retained = evidence();
        const size = () => new TextEncoder().encode(JSON.stringify(retained)).byteLength;
        while (reports.length && size() > MAX_EVIDENCE_BYTES) { reports.shift();droppedReports++;retained = evidence(); }
        if (size() > MAX_EVIDENCE_BYTES) throw Error('Trusted evaluation evidence exceeds its bound.');
        return { approved, reason, evidence: retained };
      }
      if (request.signal?.aborted) return result(false, 'Evaluation cancelled.');
      const championSeeds = seeds();
      const opponents = [
        ...(previous && !sameWeights(previous, undefined) ? [{ group: 'previous' as const, seeds: seeds() }] : []),
        { group: 'baseline' as const, seeds: seeds() },
      ];
      async function play(seed: number, group: Trial['group'], subject: 'candidate' | 'champion', opponent: PolicySlot, control = false) {
        let total = 0;
        for (const candidateSeat of [0, 1] as const) {
          if (request.signal?.aborted) throw Error('Evaluation cancelled.');
          const policySlots: Trial['policySlots'] = candidateSeat === 0 ? [subject, opponent] : [opponent, subject];
          const policies: Match['policies'] = [artifacts[policySlots[0]] ?? undefined, artifacts[policySlots[1]] ?? undefined];
          const outcome = await options.runMatch({ seed, policies: structuredClone(policies), signal: request.signal });
          if (!['completed', 'capped', 'aborted'].includes(outcome.status) || !Number.isSafeInteger(outcome.ticks) || outcome.ticks < 0
            || outcome.status !== 'aborted' && outcome.ticks < 1
            || outcome.status === 'completed' && !['player', 'opponent', 'draw'].includes(outcome.winner ?? '')
            || outcome.status !== 'completed' && outcome.winner !== undefined) throw Error('Trusted match returned an invalid outcome.');
          trials.push({ seed, group, candidateSeat, control, policySlots, status: outcome.status, winner: outcome.winner, ticks: outcome.ticks });
          if (outcome.report) { if (reports.length === 8) { reports.shift();droppedReports++; }reports.push(structuredClone(outcome.report)); }
          if (request.signal?.aborted || outcome.status === 'aborted') throw Error('Evaluation cancelled.');
          if (outcome.status !== 'completed') throw Error('A trusted evaluation match reached its tick cap.');
          total += score(outcome, candidateSeat);
        }
        return total / 2;
      }
      try {
        let total = 0;
        for (const seed of championSeeds) total += await play(seed, 'champion', 'candidate', 'champion');
        const mean = total / PAIRS, lowerBound = mean - radius;
        direct = { mean, lowerBound, passed: lowerBound > .5 + MINIMUM_GAIN };
        if (!direct.passed) return result(false, 'Insufficient independent improvement over the champion.');
        for (const opponent of opponents) {
          let candidateTotal = 0, championTotal = 0;
          for (const seed of opponent.seeds) {
            candidateTotal += await play(seed, opponent.group, 'candidate', opponent.group);
            championTotal += await play(seed, opponent.group, 'champion', opponent.group, true);
          }
          const improvement = (candidateTotal - championTotal) / PAIRS;
          guards.push({ opponent: opponent.group, candidateMean: candidateTotal / PAIRS, championMean: championTotal / PAIRS, improvement, passed: improvement >= 0 });
          if (improvement < 0) return result(false, `Candidate regressed against the frozen ${opponent.group} opponent.`);
        }
        return result(true, 'Passed independent champion improvement and every frozen-opponent guard.');
      } catch (failure) { return result(false, failure instanceof Error ? failure.message : 'Trusted evaluation failed.'); }
    },
  };
}

/** Server-owned content and engine simulation; client outcomes never enter this evaluator. */
export function createTrustedPolicyEvaluator(options: { project: GameplayProject3D; assets: readonly PortableAsset3D[]; maxMatchTicks?: number; snapshotLoop?: boolean }) {
  const maxMatchTicks = options.maxMatchTicks ?? 36000;
  if (!Number.isSafeInteger(maxMatchTicks) || maxMatchTicks < 1 || maxMatchTicks > 216000) throw Error('Invalid trusted evaluation tick cap.');
  return {
    async evaluate(request: Request) {
      const candidate = readCombatAiPolicy(request.candidate);
      if (!candidate) throw Error('Evaluation candidate is required.');
      const frozen = { ...request, candidate, active: readCombatAiPolicy(request.active), previous: readCombatAiPolicy(request.previous), excludedSeeds: [...request.excludedSeeds ?? []] };
      const runtime = await createHyperfocus3DRuntime(options.project, options.assets), initial = runtime.checkpoint();
      const runMatch = createTrustedPolicyMatchRunner({ ...options, runtime, restore: () => initial.restore(), maxMatchTicks });
      return createPolicyEvaluatorCore({ runMatch }).evaluate(frozen);
    },
  };
}

/** Shares an initialized world between fresh matches; no policy/controller state survives a reset. */
export function createTrustedPolicyMatchRunner(options: { project: GameplayProject3D; runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>>; restore(): void; maxMatchTicks: number; snapshotLoop?: boolean }) {
  return async ({ seed, policies, signal }: Match): Promise<Outcome> => {
    if (signal?.aborted) return { status: 'aborted', ticks: 0 };
    options.restore();options.runtime.restore({ ...options.runtime.snapshot(), motionSeed: seed });
    const game = createGameplay3D({ project: options.project, runtime: options.runtime, combatQueueSeed: seed, combatAiPolicies: policies });
    if (!game.snapshot().combat?.match) throw Error('Trusted evaluation requires a two-fighter combat match.');
    for (const actions of [['match:theater'], [], ['match:start']]) { game.step(actions);game.drainAudio(); }
    let slice = performance.now();
    for (let ticks = 1; ticks <= options.maxMatchTicks; ticks++) {
      if (signal?.aborted) return { status: 'aborted', ticks: ticks - 1 };
      let match;
      if (options.snapshotLoop === false) { game.advance();match = game.combatMatch(); }
      else match = game.step().combat?.match;
      game.drainAudio();
      if (!match) throw Error('Trusted evaluation lost its combat match.');
      if (match.phase === 'match-result') {
        const winner = match.winner || 'draw', report = game.aiReport();
        return { status: 'completed', winner, ticks, ...(report ? { report: collectTrialEvidence({ seed, ticks, status: 'completed', winner, report }) } : {}) };
      }
      if (performance.now() - slice >= 8) { await new Promise(resolve => setTimeout(resolve, 0));slice = performance.now(); }
    }
    const report = game.aiReport();
    return { status: 'capped', ticks: options.maxMatchTicks,
      ...(report ? { report: collectTrialEvidence({ seed, ticks: options.maxMatchTicks, status: 'capped', report }) } : {}) };
  };
}
