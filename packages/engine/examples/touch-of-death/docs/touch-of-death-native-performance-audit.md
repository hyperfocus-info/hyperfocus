# Native-window performance audit and execution plan

The October 14 [four-path follow-up](touch-of-death-four-paths-audit.md) implements
and measures the four paths below, including actual Wasm/SIMD/parallel query
comparisons and the corrected ordinary worker/interpolation path.

October 13, 2026. **The ordinary playable is primarily limited by CPU preparation
and repeated whole-scene work in this workload. The GPU is active. The browser
can supply approximately 165 rAF opportunities/s; the game cannot use them.**
Neither tested optimization establishes a fresh-motion improvement beyond drift.
There is no evidence supporting a promise that one switch, SIMD conversion or
scheduler change will easily produce 165 Hz gameplay.

## What was measured

The existing lab now has an ordinary-playable native-window lane, using its
existing browser, focus, awake, profiler and configuration owners. No engine or
production defaults changed. No deployment occurred.

- 24 serial throughput trials: six ABBA blocks, 5 seconds warmup and 10 seconds
  measurement; 17,318 callback samples. No combination or timing retries after
  an inconclusive result.
- The shipped canonical project, local offline level-1 AI match with idle player,
  one saved street checkpoint, normal following camera, 3,420 entities. This is
  not a new rooftop/depot qualification. The 10-second windows include fighting
  and round-result phases; raw phase labels and separate fighting-only summaries
  are retained. Frozen simulation stays in fighting and changes the workload.
- Visible maximized Chrome 154.0.8037.58, 1280×665 CSS viewport, DPR 1.5,
  1920×998 render buffer, MSAA enabled. RTX 4070 Laptop GPU via ANGLE/D3D11.
  Display mode 1920×1200 at 165 Hz, AC power, High performance scheme, battery
  saver off. No OS/driver settings changed. Actual browser command lines record
  extension disabling and no frame-rate-limit or GPU-VSync override flags.
- All timed focus checks passed; all six bounded awake guards released without
  suspected sleep. Every owned browser cleanup receipt has zero remaining
  processes/windows. The shared managed servers remain running.
- Two separate five-second CPU/allocation/trace captures; eight untimed manual
  render captures, four exact self-repeat pairs; one additional HUD DOM A/B
  comparison; one paused-game rAF probe. These are not throughput trials.
- Two new CPU-profile attribution tests pass, the lab TypeScript check passes,
  and process policy reports zero violations across 4,937 files. Existing passing
  correctness suites were not rerun wholesale.

The first attempted reset stopped before any timed sample because JSON property
order changed; structural comparison showed equal values. Completed trials check
identical restored-state hashes within each block. The initial resolution block
restored before warmup and measures a later gameplay segment. Subsequent blocks
also restore after warmup, before measurement. **Do not pool that first block
with the later blocks.** Reload resets RNG and presentation/resource history;
manual warm restoration is checked against the cold restored gameplay state.
Presentation history during warmup is not a separately serialized/hash-verified
state. Manual image checks provide a limited same-sequence witness, not proof of
identical wall-clock presentation trajectories throughout timed trials.

## Results

Side values average two trial statistics, not pooled percentiles. Spread is the
difference between the two trials divided by their mean, not a confidence interval.
“Positions” counts changes in fighter root positions; it excludes limb animation,
does not prove full-pose freshness, and still counts simulation when geometry is
not drawn. Callback counts are CPU submissions, not physical presents.

| Contrast | Callbacks/s, A → B | Changed positions/s, A → B | Callback effect | Control / candidate spread | Actual removed work and interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| 50% resolution | 63.17 → 64.15 | 52.25 → 52.68 | +1.56% | 8.74% / 3.97% | Main buffer 1920×998 → 960×499: 75% fewer pixels. Shadow-map resolution and CPU preparation remain. Drift-inconclusive; later gameplay segment. |
| Clear-only | 70.46 → 78.77 | 51.12 → 51.63 | +11.80% | 1.74% / 1.30% | Draws ~888 → 0; triangles ~58,367 → 0. Simulation, sampling, application, compilation, HUD and Canvas2D post remain. Strong bound; no visible gameplay. |
| Post off | 67.34 → 75.32 | 50.43 → 51.34 | +11.86% | 16.61% / 2.86% | Post CPU median 0.25 → 0 ms; scene draws remain. Drift can explain the cadence result; visual ablation. |
| Simulation frozen | 71.95 → 91.77 | 51.14 → 0 | +27.54% | 2.58% / 1.48% | Steps ~60 → 0; all root positions repeat. Preparation still 6.70 ms median. Scene/camera work also differs after freezing. Not a gameplay improvement. |
| Selected HUD records | 71.34 → 70.51 | 51.01 → 51.44 | −1.16% | 2.24% / 5.07% | HUD search visits 19,720 → 82; 18 checked selected records, 12 projections unchanged. No established cadence or motion gain. |
| Checked actor slots | 67.66 → 72.04 | 50.83 → 51.14 | +6.48% | 10.40% / 0.57% | Primitive visual stage 0.65 → 0.40 ms median, p95 1.10 → 0.50. Candidate performs checked slots rather than linear searches. Whole-loop gain drift-inconclusive. |

Neither gameplay-preserving optimization establishes a fresh-position gain beyond
observed within-side variation. No combination was justified. Retain the deployed
configuration: VSync/rAF on, post-first HUD, full visual/simulation features,
resolution 1, normal quality. Keep selected HUD and actor slots as diagnostics
until they have a useful full-loop result, not merely a smaller work counter.

Representative instrumented baseline and its paired HUD candidate:

| Metric | Baseline | Selected HUD |
| --- | ---: | ---: |
| Simulation steps/s | 59.90 | 59.93 |
| Changed root positions/s | 51.01 | 51.44 |
| Callbacks/s | 71.34 | 70.51 |
| Repeated root positions | 28.40% | 26.91% |
| Interval p50 / p95 / p99, ms | 12.20 / 18.30 / 24.20 | 12.20 / 18.30 / 24.15 |
| Intervals exceeding 6.06 ms | 98.68% | 99.16% |
| Callback CPU p50 / p95 / p99, ms | 11.90 / 16.65 / 20.50 | 12.05 / 16.15 / 19.30 |
| Preparation p50 / p95, ms | 7.30 / 9.45 | 7.70 / 10.05 |
| WebGL elapsed query p50 / p95 / p99, ms | 2.57 / 3.69 / 4.32 | 2.59 / 3.74 / 4.57 |

The paused game receives **164.69 rAF callbacks/s**. The fighting-only portions of
the representative baseline receive about 76 callbacks/s. The old user trace
contains 29.78 callbacks/s with a 29.24 ms median callback duration. That older
30 FPS state was **not reproduced** on the current deployed artifact. Its exact
configuration and competing-load equivalence are unknown. Old compact-fixture
1366×768 results, current native-window results and that profiled session cannot
be treated as a controlled before/after. Current native color-buffer pixel count
is 1.83 times the old lab viewport; the resolution experiment nevertheless did
not establish a pixel-bound result here.

## Where the engine falls short

The ordinary consumer's [display path](../../../../../apps/engine-editor/src/standalone-3d.ts)
calls `runtime.sampleFrame`, `gameplay.snapshot` and `runtime.applyFrame` each
display. The [runtime sampler](../../../src/project/runtime-3d.ts) explicitly
samples the integer simulation tick at 60 ticks/s. These are consumer/dataflow
gaps despite the reusable optimized primitives already present in the engine.

| Rank | Gap | Measured evidence | What is redundant / required |
| --- | --- | --- | --- |
| 1 | Full preparation repeats on the display clock | Baseline preparation 7.30 ms median; zero-step callbacks still 10.20 ms CPU median, 13.00 ms p95. | Same-tick world/material reconstruction is often redundant. Camera, active animation and changed presentation still require correct updates; a tick alone is not a safe cache key. |
| 2 | Obstruction and material work repeatedly traverse the scene | Obstruction stage 1.80–1.85 ms median, ~2.15–2.35 ms p95 in controls. Separate profile attributes ~654 ms of five seconds inclusively to obstruction presentation. | Static target transforms, membership and unchanged material associations can be retained. Current camera/actor/weapon rays, fade history, resource epochs and moving obstacles must invalidate correctly. |
| 3 | Efficient storage is converted back to temporary objects | Sampling ~0.60 ms, full snapshot ~0.60–0.70 ms, application ~1.55–1.60 ms, appearance ~0.90–0.95 ms median. | A complete 3,420-entity save/rollback snapshot is excessive for small presentation consumers. Changed transforms, bounds and resource-liveness checks remain required. |
| 4 | HUD and hidden UI lack a consistent work schedule | 19,720 HUD visits for two fighters; roughly 0.8 ms browser style work/callback. Menus, reports, appearance and availability hooks still execute on the frame path. | Project bars using the current camera; update resource text on change; refresh hidden panels on relevant state changes. Not all HUD work can safely run every third frame. |
| 5 | Ordinary presentation is tied to a 60 Hz simulation clock | ~60 steps/s, ~51 changed root positions/s; `createRuntimeFrameSampler` passes integer tick at 60 ticks/s. | A faster callback alone cannot create intermediate simulation poses. The existing worker/interpolation machinery is not the ordinary inline path's default. |
| 6 | Rendering still needs a bounded budget at larger sizes | ~880–900 draws, ~243 shadow draws; GPU median ~2.6 ms and p99 ~4.3–4.5 ms in measured controls. | Draws, transparency, shadows and post have real cost. Reducing pixel count or removing the scene did not remove the CPU bottleneck. Larger displays remain unqualified. |

Stage percentiles are not additive. GPU elapsed overlaps CPU and excludes
Canvas2D/compositor work. Of 5,639 timed instrumented callbacks, 5,631 GPU queries
were valid and eight were pending at export; none were invalid/disjoint. The first
16 production-artifact trials did not have GPU queries. Instrumentation's stage
observer invokes the existing checked topology fallback, adding a validation
pass compared with the uninstrumented path; both spike sides share it.

The two diagnostic allocation captures estimate 2.93/2.95 GB allocated over their
roughly five-second windows, including collected objects. Leading named sites
include rigid-body `state`, `sampleMaterial`, detached entity sampling, full-world
snapshot construction, the HUD's per-entity ID array, and shield/parry searches.
The minified profile's GC wall union is 191.9 ms, about 3.8% of its window; minor
GC p95 is 2.48 ms. **GC is a tail problem and an allocation symptom, not most of
the measured CPU time.** These are sampled allocation estimates, not exact
allocation counts, retained memory, RAM-bus traffic or cache-miss measurements.

## Research applied to this engine

`requestAnimationFrame` offers one callback before a rendering opportunity,
normally at display cadence; it does not lower detail, defer application work or
make JavaScript run in parallel. This engine already keeps a single outstanding
callback. Its common 12.2/18.3 ms intervals are consistent with missing two/three
opportunities on a 165 Hz display. Switching to timers does not prove faster
physical presentation. [MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

Scheduling should distinguish mandatory input/combat/presentation from bounded
deferrable jobs. `scheduler.yield` splits a task into later tasks; it does not
reduce its CPU cost. Idle callbacks may be delayed and cannot own combat or
time-critical input. Use time/dirty-state contracts and maximum staleness rather
than a universal “every three frames” rule whose time interval varies with FPS.
[Chrome scheduling](https://developer.chrome.com/blog/use-scheduler-yield),
[MDN idle callbacks](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)

SoA already exists in rigid-body storage and scene transforms. The missing piece
is keeping hot consumers on that representation: `world.body()` constructs a
detached body/shape record, sampling constructs entity/material records, and
application walks them back into stores. Typed arrays alone neither remove those
conversions nor prove SIMD execution. Stable packed layouts and avoiding needless
representation changes help V8 optimize. [V8 array representations](https://v8.dev/blog/elements-kinds)

Wasm SIMD supplies explicit 128-bit vector operations. It is suitable for a
resident batch of rays, bounds or transforms; packing thousands of JS objects
before each small kernel can erase the gain. The previous tuned worker profile
assigned only 1.884% of samples to its exact ranged Wasm kernel; the new ordinary
profile's largest numeric obstruction leaf is about 6%. Neither measurement
supports treating a math-only rewrite as the missing 2× whole-loop improvement.
Retain scalar JS fallback and include conversion/ownership costs in comparisons.
[V8 SIMD](https://v8.dev/features/simd), [previous measured kernel](touch-of-death-165-audit.md)

Workers can overlap producer and display work if state remains with its owner.
Repeated `postMessage` object graphs incur structured cloning; transferable
buffers move ownership, and shared memory requires synchronization plus appropriate
cross-origin isolation. OffscreenCanvas changes who owns rendering; it does not
remove scene preparation or accelerate GPU execution by itself. Reuse the existing
world worker and compact transport, rather than introducing per-entity jobs.
[MDN transport](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage),
[transferable buffers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects),
[OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas),
[Emscripten threads](https://emscripten.org/docs/porting/pthreads.html)

Pixel work grows with both dimensions and DPR. An engine should expose a pixel
budget and measured quality policy, with explicit visual tradeoffs, instead of
blindly rendering every window at device resolution. Batch draws and avoid
synchronous GPU queries/readbacks. Wasm WebGL calls still cross browser API
boundaries and do not bypass validation.
[MDN WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),
[Emscripten WebGL guidance](https://emscripten.org/docs/optimizing/Optimizing-WebGL.html)

## Concrete execution order

1. **Make ordinary presentation consume a versioned render view.** Start with the
   existing selected-entity read, owned sampling and checked lookup primitives.
   Separate save/rollback capture from display reads. Bind static membership,
   materials and obstruction target transforms once; update dirty records using
   authoritative simulation, camera, material and resource generations. Keep
   detached APIs for arbitrary consumers, and checked fallbacks for changed
   topology/resources. The first milestone is removing full-world snapshots and
   unchanged-material reconstruction from zero-step displays. This is the next
   implementation task; it attacks the measured 7+ ms preparation path.
2. **Add a framework-neutral work policy to the existing frame owner.** Required
   input/combat never drops. Optional jobs declare cadence, maximum age, dirty
   dependencies, cost estimate and coalescing policy. Hidden panels become event
   driven; telemetry refresh remains infrequent. Late frames defer optional jobs
   without accumulating unbounded catch-up work. HUD anchors remain coupled to
   the actual rendered camera. Keep DOM scheduling in the host adapter.
3. **Use the existing producer/display split with a compact render view.** Keep
   simulation at its deterministic 60 Hz. Keep producer buffers resident and send
   only bounded changed render data; do not reintroduce full snapshots on the main
   thread. Reuse existing interpolation and explicitly measure endpoint brackets,
   repeats and input/pose age. Interpolation delay is a latency choice, not a free
   optimization; do not silently change it to inflate a freshness counter.
4. **Only then specialize measured bulk math and GPU work.** Compare JS typed
   batches with Wasm SIMD for the remaining obstruction kernel, including packing.
   Choose workers only for sufficiently large independent batches. Retain the
   best tested backend by capability, with explicit fallbacks. Use GPU timing to
   choose batching or pixel-budget changes, not an assumption that GPU usage must
   be maximized.

Proposed engineering gates, **not predicted timings**: display CPU p95 below
4.5 ms, GPU p95 below 4.5 ms, producer completion p95 below 10 ms at 60 Hz, bounded
publication/adoption below 0.5 ms, and demonstrated fresh interpolated poses near
the display cadence under a declared latency policy. Measure tails and deadline
misses directly; do not add overlapping budgets. The current 16.65 ms callback
p95 must fall by roughly 73% to reach the proposed display budget. Until that is
demonstrated on maximized representative scenes, “easy 165 FPS” is not justified.
On this 165 Hz display, normal rAF cannot prove more than 165 physical presents/s.

## Evidence and reproduction

[Saved analysis](../../../../../.local/engine-perf/native-20261013/analysis.json)
links each block's raw samples, settings, source identity, reset and environment
receipts by directory name. [Recommended configuration](../../../../../.local/engine-perf/native-20261013/recommended.json)
retains production defaults. The original artifact SHA-256 is
`82767a4a0e3b16129208b6a25fa9c591f05a8ecf156f582945cc307dfad11f64`;
the single instrumented artifact is
`744f83cd94c5b249590d647f8d3136cf134b96c61c689664dc1c3b4100fa69e0`.
Its manifest and complete integrated source graph are saved in `instrumented/`.
It includes readable function names and inline source maps; the production
artifact is minified without maps. Profiles and captures remain separate files.
[Completion receipts](../../../../../.local/engine-perf/native-20261013/completion.json)
record sample/query totals and all 13 owned-browser cleanup results.

Use repository-compatible Bun 1.4.2; the machine's global 1.4.3 currently rejects
the repository bunfig. Reproduce one block using the saved artifact/checkpoint:

```powershell
$labBun = 'C:/Users/MindOverMelee/AppData/Local/npm-cache/_npx/22f2fe8d8bc13000/node_modules/bun/bin/bun.exe'
$env:PERF_NATIVE_ROOT = '.local/engine-perf/native-repro'
$env:PERF_NATIVE_ARTIFACT = '.local/engine-perf/native-20261013/instrumented/index.html'
$env:PERF_URL = 'http://127.0.0.1:8797/game/' # existing managed audio/game server
New-Item -ItemType Directory -Path $env:PERF_NATIVE_ROOT -Force
Copy-Item -LiteralPath '.local/engine-perf/native-20261013/checkpoint.json' -Destination "$env:PERF_NATIVE_ROOT/checkpoint.json"
& $labBun spikes/persistent-world-worker/lab/runner/playable-native.ts timing primitiveSlots
& $labBun spikes/persistent-world-worker/lab/runner/analyze-native.ts $env:PERF_NATIVE_ROOT
```

The local audio server returns recorded 404s for optional AI policy/ingestion and
demo metadata endpoints; all runs use the same offline fallback. This is not
hosted-service acceptance. Ordinary telemetry lacks full-pose age and input-age
proxies, exact allocation/copy/upload counters, and separate Canvas2D GPU timing.
Those remain explicit instrumentation gaps. Native maximum-size qualification
on other arenas, larger/4K displays and other hardware is missing. Exact image
parity at this checkpoint does not resolve the historical depot MSAA failure.
No extension memory, hardware cache-miss or RAM-bandwidth conclusion is claimed.
