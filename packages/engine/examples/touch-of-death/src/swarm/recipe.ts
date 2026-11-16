/** Trusted host recipe. Commands are deployed configuration, never client input. */
export { touchOfDeathTutorialSwarmRecipe } from "./tutorial-recipe.ts";
export { touchOfDeathLabSwarmRecipe } from "./lab-recipe.ts";
export const touchOfDeathSwarmRecipe = {
  id: 'touch-of-death',
  name: 'Touch of Death CPU preparation investigation',
  preparationCommand: 'bun install --frozen-lockfile',
  validationCommands: [
    'bun test packages/engine/examples/touch-of-death/src/swarm packages/engine/examples/touch-of-death/src/combat packages/engine/examples/touch-of-death/src/replay --timeout 30000',
    'bun test packages/engine/src/project/3d/runtime packages/engine/src/project/3d/combat-visuals packages/engine/src/project/3d/presentation-capture.test.ts packages/engine/src/frame --timeout 30000',
  ],
  benchmarkCommand: 'bun packages/engine/examples/touch-of-death/scripts/swarm/benchmark.ts',
  benchmarkMetric: 'producer-presentation-ms',
  investigationInstruments: [
    {
      id: 'tod-unchanged-application', methodId: 'causal-probe',
      claim: 'Applying an unchanged detached city frame still compares every entity transform despite writing none.',
      command: 'bun packages/engine/examples/touch-of-death/scripts/swarm/probe.ts',
      timeoutMs: 120000, maxComputeUsd: 0.1, lane: 'investigation' as const,
      supports: { path: ['redundantUnchangedTraversal'], operator: 'eq' as const, value: true },
      contradicts: { path: ['redundantUnchangedTraversal'], operator: 'eq' as const, value: false },
      limitations: ['Untimed application counts do not establish a CPU benefit, allocation rate or browser display freshness.',
        'Current live transform storage can change independently of detached input; resource and live-state validation must remain.'],
    },
    {
      id: 'tod-live-storage-repair', methodId: 'causal-probe',
      implementationEligible: false, purpose: 'constraint' as const,
      claim: 'An unchanged producer frame can require a render transform repair after an external live-storage edit.',
      command: 'bun packages/engine/examples/touch-of-death/scripts/swarm/probe.ts',
      timeoutMs: 120000, maxComputeUsd: 0.1, lane: 'investigation' as const,
      supports: { path: ['liveStorageRequiresValidation'], operator: 'eq' as const, value: true },
      contradicts: { path: ['liveStorageRequiresValidation'], operator: 'eq' as const, value: false },
      limitations: ['One controlled live-coordinate intervention is a validity boundary, not a performance comparison.',
        'No browser, GPU, image-repeatability or display freshness acceptance.'],
    },
    {
      id: 'tod-cpu-profile', methodId: 'cpu-profile', implementationEligible: false, purpose: 'diagnostic' as const,
      claim: 'The current CPU workload provides sampled stack evidence for hotspot attribution.',
      command: 'mkdir -p .local/swarm-profile && rm -f .local/swarm-profile/cpu.cpuprofile && bun --cpu-prof --cpu-prof-dir .local/swarm-profile --cpu-prof-name cpu.cpuprofile packages/engine/examples/touch-of-death/scripts/swarm/benchmark.ts > .local/swarm-profile/workload.json && bun spikes/persistent-world-worker/diagnostics/swarm/profile.ts',
      artifactPaths: ['.local/swarm-profile/cpu.cpuprofile', '.local/swarm-profile/workload.json'],
      timeoutMs: 120000, maxComputeUsd: 0.1, lane: 'benchmark' as const,
      supports: { path: ['profiled'], operator: 'eq' as const, value: true },
      contradicts: { path: ['profiled'], operator: 'eq' as const, value: false },
      limitations: ['Sampled attribution includes startup and warmup; it does not prove a proposed causal mechanism.',
        'Profiler timing is excluded from performance acceptance; no browser or display freshness acceptance.'],
    },
  ],
  blockedPromotionReasons: [
    'CPU-only preparation results do not establish browser main-thread, GPU, interpolation or display freshness improvement.',
    'Current-revision same-version exact-image repeatability has not passed; historical failures remain a promotion blocker.',
    'Full-loop rooftop/depot and six-arena regression evidence must pass before promoting a performance candidate.',
  ],
  ownedPaths: ['packages/engine/src/', 'packages/engine/examples/touch-of-death/src/', 'apps/engine-editor/src/standalone/'],
};

export const touchOfDeathSwarmHypotheses = [
  'Dirty propagation: first reproduce CPU preparation baseline at the supplied source revision. Inspect original writers, entity/material revisions, invalidation and resource liveness. Determine whether earlier dirty propagation can remove actual work rather than filtering after scans. Reject the hypothesis if current measurements do not support it. Preserve checked fallbacks and deterministic resets.',
  'Presentation scheduling: investigate endpoint availability, producer publication, repeated poses and interpolation policy. CPU fixture measurements cannot establish display freshness, browser scheduling or input latency. Report this as a blocker when no current browser trace is available; do not infer scheduling improvements from CPU throughput or change simulation rate, interpolation delay or gameplay to manufacture a win.',
  'Allocation and preparation: use the current baseline to distinguish simulation, sampling, producer presentation, entity application and command compilation. Investigate retained state, repeated visits and temporary allocations using existing public engine contracts. Heap boundary deltas are not allocation rates. Do not rewrite JavaScript arithmetic or WASM without measured attribution.',
];

export const touchOfDeathSwarmGoal = `Investigate Touch of Death performance at the supplied immutable source revision and produce three independent candidates or evidence-backed rejected hypotheses.
First read packages/engine/examples/touch-of-death/docs/swarm.md and reproduce the trusted CPU preparation recipe. Historical numbers are background only. Keep the three investigations isolated. Each must produce diagnosis, current evidence, patch (if justified), correctness tests, performance hypothesis, scenario and risks.
Use current game tuning and public engine contracts. Preserve gameplay, deterministic checkpoint state, animation, temporal behavior and resource lifecycle. Do not edit the benchmark or its assertions to improve a score. Run correctness before timing. Compare repeated paired baselines/candidates only on the exclusive benchmark worker; record uncertainty and return INCONCLUSIVE — ENVIRONMENT NOISE when conditions are inadequate.
The CPU fixture is deliberately narrower than the browser acceptance goal: no GPU, browser scheduling, display freshness or interpolation claim follows from it. Exact same-version image repeatability and the full browser lanes remain promotion blockers. A valid outcome is no improvement. Do not combine incompatible patches or integrate without human approval.`;
