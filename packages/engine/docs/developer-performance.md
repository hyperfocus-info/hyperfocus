# Developer Simplicity And Performance Contract

The engine should make the scalable path the shortest documented path. Low-level APIs remain available, but projects should not need to replace their lifecycle, input model, renderer, or diagnostics when they grow.

## Golden Path

- Use `createBrowserApp` for explicit fixed-step lifecycle, scoped keyboard input, cleanup, resolved configuration, and opt-in bounded metrics.
- Call `start()` explicitly after game state and render dependencies exist.
- Use `@hyperfocus/engine/render` structured render data and a stage for shared gameplay rendering.
- Supply a viewport cull rectangle whenever world calls can leave the screen.
- Record stage `submitted`, `drawn`, `skipped`, and `culled` counts in frame metrics.
- Keep immediate Canvas calls for authored overlays, debug views, and genuinely small scenes.
- Inject touch or virtual controls into a scoped input state. Do not install or mutate global input state.

## Performance Evidence

Every performance decision uses two complementary forms of evidence.

Portable efficiency answers whether the data is stored, processed, and displayed
with the right amount of work. Local latency answers how long that work took on one
host at one moment. Neither substitutes for the other, and a one-off timing win must
never be described as proof that an implementation is the most efficient design.

### Portable structural gates

These run in ordinary tests and must not depend on laptop speed:

- behavior and draw-count parity;
- Canvas or renderer operation counts;
- submitted, drawn, and culled records;
- objects, arrays, resources, and bytes created;
- cache size and hit/miss counts;
- queue depth, dropped work, and coalesced work;
- encoded and transmitted bytes;
- scaling ratios as workload size increases.

Structural reports should state the expected complexity and count the dominant
work directly: full-record scans, tree updates, bytes copied across a boundary,
typed-array/view allocations, retained entries, rendered nodes, DOM mutations,
serialized frames, and database rows touched. A candidate that is faster locally
but performs more unbounded work remains a risk, especially under contention.

### Controlled timing gates

Wall-clock p50, p95, and p99 remain necessary because users experience time, not operation counts. Absolute timing gates run only on a documented reference environment or a controlled browser/CPU profile. Other machines report timing as diagnostic evidence.

No repository-owned reference runner is currently pinned. Therefore `bench:example:mmo-render:reference` is an explicit calibration command, not part of `check` or `release:verify`. Promote it to a release gate only after recording the runner model, operating system, Bun/browser versions, power mode, thermal policy, and CPU-throttling configuration.

Candidate comparisons run serially and repeatedly on the same machine. Prefer interleaved A/B/B/A trials and judge the median p95 across complete trials. Preserve raw samples, environment details, configuration, and workload counts.

Record CPU model, logical CPUs, runtime/browser version, power source or power
profile, thermal/throttling state when knowable, and competing workload. Run at
least idle and contended tiers for scheduler/server changes; the contended tier
should include configured concurrency representative of many agents. When power
or thermal state cannot be read reliably, label it `unrecorded` instead of assuming
maximum clocks.

Use timing matrices to find crossover ranges, not magic universal constants. Keep
forced control/candidate modes for reproducibility, use a conservative portable
baseline, and expose host calibration or named low-power/balanced/throughput
profiles when the crossover varies materially. A faster computer should be allowed
to exploit capacity without making the baseline path harder; a slower or unplugged
computer must retain bounded work and backpressure rather than merely missing an
absolute millisecond gate.

Do not use a single start/end heap delta as an allocation gate. Record allocation rate, retained heap after controlled collection, GC activity when available, and high-water marks separately.

### Durable evidence lanes

The scheduled and manually dispatched `Performance evidence` workflow separates
three concerns:

- structural tests and reports count copies, view/allocation creation, queue and
  capacity peaks, history checkpoints, retained entries, and reachable bundle
  bytes;
- Chromium, Firefox, and WebKit execute the distinct production scalar/SIMD WASM
  artifacts plus the 100/10,000-message Markdown workload; configured required
  browsers fail the lane instead of being silently recorded as unavailable; and
- Linux, Windows, and macOS produce Bun CPU profiles for the same spatial-index
  workload.

Every JSON report uses `hyperfocus-performance-evidence-v1`: portable evidence and
calibration measurements cannot share a bucket. The workflow rolls reports into a
bounded 104-entry-per-benchmark history, restores that history on the next weekly
run, and retains downloadable artifacts for 90 days. Each adjacent record stores a
compatibility decision; timing is comparable only when workload config, runtime,
CPU, power, thermal, contention, device profile, and active-agent count match and
none of the required context is `unrecorded`.

Hosted-runner timings remain calibration data because cloud hardware, power, and
contention vary; parity and dominant-work counts are the portable gates. Local
reports continue to record unknown power or thermal state as `unrecorded`, which
deliberately prevents them from becoming a timing trend.

## Pooling And Reuse

Pooling is an allocation-control tradeoff, not an automatic CPU optimization. A pool may reduce GC pauses while increasing property-reset work and steady-state CPU time.

- Fresh allocation remains the default when it is faster and does not create harmful full-loop GC behavior.
- Promote pooling only with a full-loop win in frame p95/p99 or retained-memory stability.
- Keep caller-owned output buffers available as opt-ins when they reduce allocation pressure.
- Document aliasing and lifetime rules for every borrowed or pooled value.

## Bounded Runtime Rules

- Metrics have fixed series/cardinality limits.
- Async clocks declare whether backlog is coalesced, dropped, or queued.
- Queues and caches expose depth, capacity, drops, and evictions.
- Disabled diagnostics add no recurring work beyond an optional branch.
- Configuration defaults are available through a resolved configuration snapshot.

## Simplicity Checks

Before promoting an API, verify:

- the minimal example remains small and uses the production-shaped path;
- ownership and cleanup are visible in the call site;
- common configuration is optional and advanced configuration is grouped;
- invalid values fail at construction with an actionable message;
- the API does not duplicate an existing lifecycle, input, or rendering model;
- a project can adopt advanced rendering, metrics, networking, or workers without replacing its basic application structure.
