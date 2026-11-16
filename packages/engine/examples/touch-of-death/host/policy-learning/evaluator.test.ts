import { expect, test } from 'bun:test';
import { createCombatAiPolicy, createGameplay3D, createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import { createTouchOfDeathPreset } from '../../src/combat/preset.ts';
import { createPolicyEvaluatorCore, createTrustedPolicyEvaluator, createTrustedPolicyMatchRunner } from './evaluator.ts';
import { collectTrialEvidence } from '../../src/trial-evidence.ts';

type Match = Parameters<Parameters<typeof createPolicyEvaluatorCore>[0]['runMatch']>[0];
const candidate = () => createCombatAiPolicy({ id: 'candidate', scores: { approach: 1 } });
const active = () => createCombatAiPolicy({ id: 'champion', scores: { approach: 0 } });
const previous = () => createCombatAiPolicy({ id: 'previous', scores: { approach: -.5 } });
function sequence() { let seed = 0;return () => seed++; }
function objective(match: Match) {
  const strength = match.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((sum, value) => sum + value, 0));
  const winner = strength[0]! > strength[1]! ? 'player' : strength[0]! < strength[1]! ? 'opponent' : 'draw';
  return Promise.resolve({ status: 'completed', winner, ticks: 1 } as const);
}

test('trusted evaluation uses fresh disjoint seeds, both seats and frozen champion controls', async () => {
  const evaluator = createPolicyEvaluatorCore({ randomSeed: sequence(), runMatch: objective });
  const result = await evaluator.evaluate({ candidate: candidate(), active: active(), previous: previous(), attempt: 1, excludedSeeds: [0, 1, 2, 3] });
  expect(result.approved).toBe(true);expect(result.evidence.trials).toHaveLength(1280);
  expect(result.evidence.guards.map(guard => guard.opponent)).toEqual(['previous', 'baseline']);
  const seeds = new Map<string, Set<number>>();
  for (let index = 0; index < result.evidence.trials.length; index += 2) {
    const a = result.evidence.trials[index]!, b = result.evidence.trials[index + 1]!;
    expect(a.seed).toBeGreaterThan(3);expect(a.seed).toBe(b.seed);
    expect([a.candidateSeat, b.candidateSeat]).toEqual([0, 1]);expect(a.policySlots).toEqual([b.policySlots[1], b.policySlots[0]]);
    const group = seeds.get(a.group) ?? new Set<number>();group.add(a.seed);seeds.set(a.group, group);
  }
  expect([...seeds.values()].map(group => group.size)).toEqual([128, 128, 128]);
  expect(new Set([...seeds.values()].flatMap(group => [...group])).size).toBe(384);
  for (const row of result.evidence.trials.filter(row => row.control)) {
    expect(result.evidence.trials.some(other => !other.control && other.group === row.group && other.seed === row.seed && other.candidateSeat === row.candidateSeat)).toBe(true);
  }
  expect(result.evidence.coverage).toMatchObject({ evaluatedMatches: 1280, retainedReports: 0, missingReports: 1280 });
});

test('candidate artifacts are frozen before random seed selection and each runner receives owned copies', async () => {
  const source = candidate(), nextSeed = sequence();
  const result = await createPolicyEvaluatorCore({ randomSeed() { source.scores.approach = -2;return nextSeed(); },
    async runMatch(match) {
      const outcome = await objective(match);
      for (const policy of match.policies) if (policy?.id === 'candidate') { expect(policy.scores.approach).toBe(1);policy.scores.approach = -2; }
      return outcome;
    },
  }).evaluate({ candidate: source, attempt: 1 });
  expect(result.approved).toBe(true);expect(result.evidence.artifacts.candidate.scores.approach).toBe(1);
});

test('seat advantage, noisy ties and insufficient practical confidence never promote', async () => {
  for (const winner of ['player', 'opponent', 'draw'] as const) {
    const result = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch() { return { status: 'completed', winner, ticks: 1 }; } })
      .evaluate({ candidate: candidate(), attempt: 1 });
    expect(result.approved).toBe(false);expect(result.evidence.direct?.mean).toBe(.5);expect(result.evidence.guards).toEqual([]);
  }
  const close = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch(match) {
    return match.seed < 38 ? objective(match) : { status: 'completed', winner: 'draw', ticks: 1 };
  } }).evaluate({ candidate: candidate(), attempt: 1 });
  expect(close.evidence.direct?.mean).toBeGreaterThan(.64);expect(close.approved).toBe(false);
});

test('durable attempt ordinals tighten the direct gate with a summable lifetime error budget', async () => {
  const evaluate = (attempt: number) => createPolicyEvaluatorCore({ randomSeed: sequence(), runMatch: objective }).evaluate({ candidate: candidate(), attempt });
  const first = await evaluate(1), later = await evaluate(1000);
  expect(first.evidence.alpha).toBe(.005);expect(later.evidence.alpha).toBeCloseTo(9.990009990009991e-9, 15);
  expect(later.evidence.direct!.lowerBound).toBeLessThan(first.evidence.direct!.lowerBound);
  let budget = 0;for (let attempt = 1; attempt <= 1000; attempt++) budget += .01 / attempt / (attempt + 1);
  expect(budget).toBeLessThan(.01);
  for (const attempt of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) await expect(evaluate(attempt)).rejects.toThrow('ordinal');
});

test('a direct champion win cannot conceal regression against a frozen opponent', async () => {
  const result = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch(match) {
    const candidateSeat = match.policies.findIndex(policy => policy?.id === 'candidate');
    if (candidateSeat >= 0 && match.policies.some(policy => policy?.id === 'previous')) {
      return { status: 'completed', winner: candidateSeat === 0 ? 'opponent' : 'player', ticks: 1 };
    }
    return objective(match);
  } }).evaluate({ candidate: candidate(), active: active(), previous: previous(), attempt: 1 });
  expect(result.evidence.direct?.passed).toBe(true);expect(result.approved).toBe(false);
  expect(result.evidence.guards[0]).toMatchObject({ opponent: 'previous', improvement: -1, passed: false });
  expect(result.reason).toContain('regressed');
});

test('caps, aborts and runner failures fail closed without finishing or rewarding partial evaluation', async () => {
  const cap = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch() { return { status: 'capped', ticks: 36000 }; } })
    .evaluate({ candidate: candidate(), attempt: 1 });
  expect(cap.approved).toBe(false);expect(cap.evidence.trials).toHaveLength(1);expect(cap.reason).toContain('cap');
  const controller = new AbortController();
  const abort = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch(match) { controller.abort();return objective(match); } })
    .evaluate({ candidate: candidate(), attempt: 1, signal: controller.signal });
  expect(abort.approved).toBe(false);expect(abort.evidence.trials).toHaveLength(1);expect(abort.reason).toContain('cancelled');
  const cancelled = await createPolicyEvaluatorCore({ runMatch: objective }).evaluate({ candidate: candidate(), attempt: 2, signal: controller.signal });
  expect(cancelled.evidence.trials).toEqual([]);
  const failure = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch() { throw Error('World failed'); } })
    .evaluate({ candidate: candidate(), attempt: 1 });
  expect(failure.approved).toBe(false);expect(failure.reason).toBe('World failed');
});

function arena() {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const actor = (id: string, x: number) => ({ id, meshId: 'mesh', materialId: 'material', position: [x, 1, 0], scale: [.6, 1.6, .6], rotationY: 0,
    physics: { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true } });
  return { project: { activeSceneId: 'logic', scenes: [{ id: 'logic', entities: [] }], extensions: {
    hyperfocusCombat: { version: 1, config: { ...createTouchOfDeathPreset(), maxHealth: 1 }, match: { difficulty: 9 },
      movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16 },
      fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] },
    hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
      meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [],
      materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
      scenes: [{ id: 'arena', camera: { position: [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [],
        entities: [actor('a', 0), actor('b', 1.4), { id: 'floor', meshId: 'mesh', materialId: 'material', position: [0, -.25, 0], scale: [100, .5, 100], rotationY: 0,
          physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] }],
      audio: { policy: 'gesture-unlock', cues: [] }, save: { restoreOnBoot: true, slot: 'auto', maxBytes: 65536 } },
  } }, assets: [{ id: 'gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(JSON.stringify(gltf)) }, { id: 'bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(positions.buffer) }] };
}

test('trusted advance loop preserves snapshot-loop outcomes and complete bounded evidence from both seats', async () => {
  const fixture = arena(), runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets), initial = runtime.checkpoint();
  for (const maxMatchTicks of [1, 6000]) {
    const run = createTrustedPolicyMatchRunner({ project: fixture.project, runtime, restore: () => initial.restore(), maxMatchTicks, snapshotLoop: false });
    for (const seed of [4, 9]) for (const policies of [[candidate(), undefined], [undefined, candidate()]] as const) {
      initial.restore();runtime.restore({ ...runtime.snapshot(), motionSeed: seed });
      const game = createGameplay3D({ project: fixture.project, runtime, combatQueueSeed: seed, combatAiPolicies: policies });
      for (const actions of [['match:theater'], [], ['match:start']]) { game.step(actions);game.drainAudio(); }
      let ticks = 0;
      let winner: 'player' | 'opponent' | 'draw' | undefined;
      while (ticks < maxMatchTicks) {
        const match = game.step().combat?.match;game.drainAudio();ticks++;
        if (match?.phase === 'match-result') { winner = match.winner || 'draw';break; }
      }
      const status = winner ? 'completed' as const : 'capped' as const, report = game.aiReport();
      const expected = { status, ...(winner ? { winner } : {}), ticks,
        ...(report ? { report: collectTrialEvidence({ seed, ticks, status, winner, report }) } : {}) };
      expect(await run({ seed, policies })).toEqual(expected);
      const baseline = createTrustedPolicyMatchRunner({ project: fixture.project, runtime, restore: () => initial.restore(), maxMatchTicks });
      expect(await baseline({ seed, policies })).toEqual(expected);
    }
  }
}, 30000);

test('trusted engine runner finishes real seeded sets, retains bounded report evidence, yields and cancels', async () => {
  const fixture = arena(), runtime = await createHyperfocus3DRuntime(fixture.project, fixture.assets), initial = runtime.checkpoint();
  const run = createTrustedPolicyMatchRunner({ project: fixture.project, runtime, restore: () => initial.restore(), maxMatchTicks: 6000 });
  const one = await run({ seed: 4, policies: [candidate(), undefined] });
  const repeat = await run({ seed: 4, policies: [candidate(), undefined] });
  expect(one.status).toBe('completed');expect(repeat).toEqual(one);
  expect(one.report).toMatchObject({ seed: 4, status: 'completed', winner: one.winner });
  expect(one.report?.policies.some(policy => policy.policyId === 'candidate')).toBe(true);
  expect(one.report?.samples.length).toBeGreaterThan(0);expect(one.report?.limits.sequencesPerTrial).toBe(2);
  const retained = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch(match) {
    const outcome = await objective(match);
    return { ...outcome, report: one.report && { ...one.report, seed: match.seed, ticks: outcome.ticks, winner: outcome.winner,
      policies: match.policies.map((policy, index) => ({ fighter: index === 0 ? 'a' : 'b', policyId: policy?.id })) } };
  } }).evaluate({ candidate: candidate(), attempt: 1 });
  expect(retained.evidence.coverage).toEqual({ evaluatedMatches: 768, retainedReports: 8, droppedReports: 760, reportLimit: 8, maxBytes: 480000, missingReports: 0 });
  expect(retained.evidence.reports.map(report => report.seed)).toEqual(retained.evidence.trials.slice(-8).map(trial => trial.seed));
  expect(retained.evidence.reports[0]?.samples).toEqual(one.report?.samples ?? []);
  const large = structuredClone(one.report!);
  for (const sample of large.samples) {
    sample.contacts = Array.from({ length: 32 }, (_, frame) => ({ frame, eventId: String(frame).padEnd(512, '\\'), moveId: '招'.repeat(128), damage: 1 }));
    sample.hits = sample.damage = 32;sample.startFrame = 0;sample.endFrame = 32;
  }
  const compact = await createPolicyEvaluatorCore({ randomSeed: sequence(), async runMatch(match) { return { ...await objective(match), report: large }; } })
    .evaluate({ candidate: candidate(), active: active(), previous: previous(), attempt: 1 });
  expect(compact.approved).toBe(true);expect(compact.evidence.trials).toHaveLength(1280);
  expect(new TextEncoder().encode(JSON.stringify(compact.evidence)).byteLength).toBeLessThanOrEqual(480000);
  expect(compact.evidence.reports.length).toBeLessThan(8);
  expect(compact.evidence.coverage.droppedReports + compact.evidence.reports.length).toBe(1280);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 0);
  try { expect((await run({ seed: 9, policies: [candidate(), undefined], signal: controller.signal })).status).toBe('aborted'); }
  finally { clearTimeout(timer); }
  const submitted = candidate(), pending = createTrustedPolicyEvaluator({ ...fixture, maxMatchTicks: 1 }).evaluate({ candidate: submitted, attempt: 1 });
  submitted.scores.approach = -2;
  const cap = await pending;
  expect(cap.evidence.artifacts.candidate.scores.approach).toBe(1);
  expect(cap.approved).toBe(false);expect(cap.evidence.trials[0]?.status).toBe('capped');
}, 30000);
