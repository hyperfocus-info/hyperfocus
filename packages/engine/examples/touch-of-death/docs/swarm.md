# Touch of Death swarm investigation

For portable lab verification and repair, use `touch-of-death-lab` with
`executionKind: "engineering"`. Its [trusted recipe](../src/swarm/lab-recipe.ts)
prepares engine declarations and declared root browser types, then checks material
revisions, native configuration/oracle receipts, saved-run sharing, lab types and
process/guidance policy. It requires explicit service allowlisting. It does not
run a CPU benchmark or qualify browser images; missing canonical inputs and
rendered evidence remain separate gates. Use `touch-of-death` only for the CPU
performance investigation described below.

For tutorial work, use the separate `touch-of-death-tutorial` trusted
[engineering recipe](../src/swarm/tutorial-recipe.ts). It runs focused UI/tutorial
and reward tests, then the source-authored portable browser journey at
`apps/engine-editor/scripts/tutorial-composition/swarm.ts --verify`. Linux Chromium
and its system dependencies install only in the remote workspace. Reports and six
declared captures remain in the run's durable artifact storage. Failed baseline
journeys identify defects; independent candidate checks must pass before review.
This fixture verifies current runtime/tutorial behavior without uploading ignored
canonical project or music assets. It does not establish canonical art acceptance,
physical controller behavior or hardware display performance.

The trusted [`/swarm` recipe](../src/swarm/recipe.ts) supplies the current game
consumer to the Harness coordinator. It declares preparation, correctness and
benchmark commands; remote clients cannot supply arbitrary verification commands.
The coordinator supplies immutable source, isolated candidates, budgets, artifact
storage and the exclusive measurement-worker lease. No historical timing is used
as a baseline.

The first portable scenario constructs a seeded compact city through the real
game authoring code, cooks existing procedural models, and executes current
combat tuning through the public engine runtime. Each trial warms 120 frames,
restores gameplay and presentation history, then records 240 frames. Its primary
metric is producer presentation time. Simulation, frame sampling, entity
application, command preparation, total CPU duration and structural counts are
retained separately. The scenario is a CPU preparation diagnostic, not the
historical rooftop/depot browser workload.

Three separate hypotheses examine writer-originated dirty propagation,
presentation scheduling, and allocation/preparation. Each investigator must use
current evidence and may reject its hypothesis. Scheduling cannot be confirmed
from this CPU fixture alone. Heap boundary observations are not allocation rates;
the runner reports unavailable allocation/GC measurements as null.

The trusted [application probe](../src/swarm/probe.ts) applies the same detached
city frame twice, changes and restores one input coordinate, then corrupts one
live render coordinate independently of that input. Engine counters and state
hashes distinguish repeated comparisons from required repairs. The recipe binds
two causal claims to measured JSON predicates; inconsistent intervention/state
receipts omit a predicate and remain inconclusive. Run
`bun packages/engine/examples/touch-of-death/scripts/swarm/probe.ts --allow-local`
for an untimed local diagnostic. Acceptance timing leaves these counters disabled.
This probe establishes neither a speedup nor permission to skip live validation.

The CPU profiling instrument runs the same workload under Bun's sampling profiler
on the exclusive measurement worker. The [performance lab analyzer](../../../../../spikes/persistent-world-worker/diagnostics/swarm/profile.ts)
validates the sampled graph and emits compact stack attribution; the raw profile
and workload receipt remain attached. This diagnostic includes startup and warmup,
and its timings never enter performance acceptance. A valid profile identifies
places to investigate; it does not authorize a proposed optimization.

The following remain promotion blockers even if CPU timings improve:

- Current-revision exact same-version image repeatability. Historical failures
  remain visible; no image tolerance replaces this contract.
- Repeated full-loop rooftop/depot comparisons and the broader six-arena
  correctness/resource checks.
- Browser main-thread tails, interpolation and display freshness. CPU submission
  counts do not prove physical presentation.

The existing [performance lab](../../../../../spikes/persistent-world-worker/lab/README.md)
owns browser sampling, captures and profiling. Its rooftop/depot builder requires
these ignored inputs under `.local/engine-perf/`:

- `spatial-aa-20261010/attachment/roof/spatial-aa/sources.json` and
  `material-table-20261010/roof/control/sources.json`, keyed by original absolute
  Windows paths, plus `query-cache-rescreen-20261010/roof/target-cache/source-patches.json`.
- `worker-arena-campaign-20261008/workloads/{roof-compact-714,depot-2026}/index.html`
  and `workload.json`, containing the portable projects/assets and complete seeded
  simulation checkpoints. Rebuilding from these graphs reproduces the historical
  instrumented runtime; it does not establish a current-revision baseline.

The newer [ordinary-playable builder](../../../../../spikes/persistent-world-worker/lab/build/playable-native.ts)
already compiles current source and accepts `PERF_NATIVE_BASE=<portable-export.html>`.
Its default `.local/touch-of-death/production-defaults-20261013/web/index.html` is
also ignored. The embedded canonical project, imported assets and any streamed
`audio/<sha256>.mp3` files are project data, not reconstructible from a Git revision
alone. Use the existing [package verifier](../host/package/README.md) to validate
the project pair and export; do not replace them with a newly generated city.

A portable current-browser lane must preserve a hashed canonical input bundle,
compile baseline and candidate runtimes from their recorded revisions, and create
its checkpoint with that baseline runtime. The existing
[six-arena preparation](../../../../../spikes/persistent-world-worker/prepare-arena-workloads.ts)
owns seeds, match indices and exact replay checks, but currently loads a neighboring
frozen `sources.json`; it needs an explicit current-runtime input before reuse here.

The [browser owner](../../../../../spikes/persistent-world-worker/lab/runner/browser.ts)
also needs a Linux adapter: process inspection currently returns no command line,
native foreground verification returns false, and the awake guard rejects Linux.
Those guards must report actual supported capabilities, not synthetic success.
A virtual/headless display may qualify exact-image and browser-stage comparisons
under its recorded renderer; it cannot establish physical 165 Hz display delivery
or representative hardware-GPU performance. Keep the same-version image and
freshness contracts, using the existing runners' raw state, pose, interpolation,
viewport, AA, browser and renderer receipts. These missing inputs and adapters
remain explicit promotion blockers; the CPU fixture does not replace them.

The existing bounded preflight reads and integrates the locally available graphs
without compiling, launching a browser or writing an artifact:

```powershell
bun spikes/persistent-world-worker/lab/build.ts --check-graph
```

Passing that preflight does not prove portable inputs, current-runtime parity,
image repeatability or remote browser acceptance.

The [sampling audit](touch-of-death-entity-sampling-audit.md) and its linked
[source-owned comparison](touch-of-death-standard-primitives.md) are historical
background. Their results do not identify the current bottleneck.

Focused correctness checks from repository root:

```powershell
bun test packages/engine/examples/touch-of-death/src/swarm
bun test packages/performance/swarm
```

The coordinator executes
`bun packages/engine/examples/touch-of-death/scripts/swarm/benchmark.ts` inside
the selected provider, setting `HYPERFOCUS_SWARM_BACKEND=railway`. A direct
invocation refuses to run unless `--allow-local` explicitly selects a local
diagnostic. This flag does not establish a controlled timing environment.

The benchmark writes one JSON receipt to stdout with raw `samples`, scenario and
workload hash, runtime/CPU identity, warmup/duration, per-stage samples, memory
observations, structural counts and final-state hash. The coordinator retains
the raw receipt before destroying its workspace and compares paired trial
medians. It must compare final-state hashes and structural evidence before
promotion, and refuse a modified benchmark scenario.

The [2026-10-16 live Railway demonstration](../../../../../docs/harness/swarm-live-demonstration.md)
retained a fresh CPU baseline, passed 237 baseline correctness tests and ran three
isolated investigations. All three returned no patch and were rejected, so paired
candidate comparisons and browser acceptance remain unexercised. No optimization
or performance improvement is claimed.
