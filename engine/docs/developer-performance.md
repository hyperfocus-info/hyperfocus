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

### Controlled timing gates

Wall-clock p50, p95, and p99 remain necessary because users experience time, not operation counts. Absolute timing gates run only on a documented reference environment or a controlled browser/CPU profile. Other machines report timing as diagnostic evidence.

No repository-owned reference runner is currently pinned. Therefore `bench:example:mmo-render:reference` is an explicit calibration command, not part of `check` or `release:verify`. Promote it to a release gate only after recording the runner model, operating system, Bun/browser versions, power mode, thermal policy, and CPU-throttling configuration.

Candidate comparisons run serially and repeatedly on the same machine. Prefer interleaved A/B/B/A trials and judge the median p95 across complete trials. Preserve raw samples, environment details, configuration, and workload counts.

Do not use a single start/end heap delta as an allocation gate. Record allocation rate, retained heap after controlled collection, GC activity when available, and high-water marks separately.

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
