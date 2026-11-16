# Earlier visible-browser iteration

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Earlier visible-browser iteration

Visible Chrome reproduces the slowdown. The earlier comparison contrasts an actual,
focused desktop window with headless Chrome, then tests three optimization
candidates. These are automated matches in the normal game loop, not a recording
of the user's manual play. The original headless audit and collision findings are
retained below as earlier evidence.

### Workload and controls

Evidence: `.local/engine-perf/browser-comparison-20261006/`. `compare.ts` runs
fresh owned Chrome profiles serially; `owned-browser.ts` retains guardian cleanup
ownership. The user explicitly requested visible windows. Windows inspection
confirms a visible Chrome window for headed trials; page visibility and focus were
true before and after every measured window. No page errors occurred. Cleanup
records contain no surviving owned processes/windows. The shared managed server
was reused; only each owned browser's HTML response was routed to a private
candidate. The shared playable and the user's ordinary browser profiles were not
replaced.

All trials use Chrome 154.0.8037.58, 1366×768, DPR 1, VSync on, telemetry on, FPS
overlay off, hardware ANGLE/D3D11 on the RTX 4070 Laptop GPU, and the same saved
city match (`workload.json`). The human player remains idle while the AI fights.
The saved countdown uses queue seed 744909812 and a service-court start; it exposes
route-planning work and combat catch-up. This is one repeatable problem workload,
not coverage of every spawn, input sequence, or multiplayer mode.

Each trial has six seconds of warmup and an eighteen-second measurement. The
normal fixed-tick game loop remains in control. Comparison tables use fighting
frames only; round-result frames are retained separately. Small differences in
the first/last measured simulation tick are recorded, rather than treating the
wall-clock windows as identical frame ranges. Values below are medians of the
per-trial summaries, not percentiles pooled across trials. No audit compiler,
tests, or profiler ran during comparison windows. Existing user workloads were
left running. Windows power policy was High performance; thermals and actual CPU
clocks were unrecorded. These local measurements are not universal timing gates.

There are 28 valid timing trials: two ABBA rounds each for browser mode,
arithmetic, and navigation, plus one ABBA round for resolution. `*-plan.json`,
per-trial JSON/PNG/ownership/cleanup records, variant manifests, and the commands
in `compare.ts`, `build-variant.ts`, `summarize.ts` and `cpu-summary.ts` preserve
the experiment. The 574-module source graph was frozen before building arithmetic,
navigation and resolution variants, avoiding concurrent working-tree changes
between A and B. The earlier mode comparison uses its own identical artifact;
do not attribute differences between those two campaigns to one optimization.

### Headed versus headless

| Same exported artifact, four trials each | Visible Chrome | Headless Chrome |
| --- | ---: | ---: |
| Fighting submitted FPS | 13.21 | 14.41 |
| Frame interval p50 | 60.50 ms | 57.65 ms |
| Frame interval p95 | 169.75 ms | 159.00 ms |
| Frame interval p99 | 203.05 ms | 196.75 ms |
| Presentation preparation median | 33.15 ms | 32.35 ms |
| Render submission median | 6.75 ms | 6.50 ms |
| Empty-page requestAnimationFrame cadence | 163.93 Hz | 163.93 Hz |

The measured runtime SHA-256 is
`fa19dcf76f3c6fda895b6c1318ad8b9383c0cdc3d3d9e388275fafe58c1bf6cd`.
The slowdown is not exclusive to headless rendering. The empty page confirms
refresh callbacks near the monitor's 165 Hz refresh rate; combat consumes the budget.

The later navigation trials additionally record OS CPU counters and Chrome's
`Performance.getMetrics` before/after each window. System-wide CPU utilization was
approximately 3.7–8.2%, while renderer `ThreadTime` advanced 17.56–17.97 seconds in
18.71–18.88 elapsed seconds: roughly 94–96% of one thread. This supports a busy
main-thread diagnosis in those trials, rather than blaming background AI work
for most elapsed time. It does not exclude thermal limits or brief contention.
The existing browser telemetry itself does not collect these OS/CDP counters.

### Candidate results and decisions

Each row compares A and B within its own serial campaign. All candidate runs use
visible Chrome. Lower interval percentiles are better.

| Candidate | Trials A/B | Fighting FPS A → B | Interval p95 A → B | Decision |
| --- | ---: | ---: | ---: | --- |
| Exact WebAssembly `f64.sqrt` primitive | 4 / 4 | 13.72 → 14.74 | 153.65 → 115.20 ms | Apply: +7.4% FPS, −25.0% p95 |
| Spatially restricted route blockers/cache identity, on top of accelerated sqrt | 4 / 4 | 13.99 → 14.01 | 109.05 → 115.25 ms | Reject: negligible FPS gain, worse p95 |
| Half width/height drawing buffer, on top of accelerated sqrt | 2 / 2 | 16.60 → 16.09 | 91.00 → 96.25 ms | Reject: no measured benefit for reduced clarity |

The arithmetic candidate improves p99 from 169.65 to 129.75 ms and simulation
p95 from 103.50 to 63.05 ms. Its frame p50 **does not improve**: 58.45 → 61.40 ms.
The accepted benefit is reduced expensive-frame tails and higher average FPS in
this workload, not a uniform per-frame improvement. Full-loop windows include
changing workloads and frame sampling; these trials do not establish a precise
population effect or steady-state allocation improvement. Heap snapshots are
retained only as diagnostics, not an allocation or retained-memory gate.

Production `math/simulation/sqrt.ts` now selects a 39-byte, import-free and
memory-free `f64.sqrt` module once per realm, falling back to the existing portable
kernel when compilation is unavailable or blocked. It has no per-call conversion,
allocation or worker boundary. The standalone CSP allows `wasm-unsafe-eval`, not
JavaScript `unsafe-eval`. Correctly rounded finite arithmetic is preserved;
[the WebAssembly specification](https://webassembly.github.io/spec/core/exec/numerics.html#op-fsqrt)
defines the operation. No claim is made about preserving arbitrary NaN payload
bits. The broader deterministic trigonometric kernels remain unchanged.

The initial four `sqrt-*` trials are **excluded**: CSP blocked compilation and
the candidate used its fallback. The corrected `sqrt-enabled-*` campaign asserts
that the accelerated backend is active. Its control runtime hash is
`da523558e3008864e4cc15915b462e861a8d35c852b80775f26c9ea1abc0c4f3`;
the accelerated runtime is
`d960c2064a2102ca862e995dcf7353d6c31c607c1c8da8b4605226485e37f1b2`.

The route experiment passed exact-state checks but did not earn promotion. Its
source remains local in `candidate-obstacle-route.ts`; production navigation is
unchanged. Half-resolution means 683×384 drawing buffers at the same 1366×768
viewport. Shadow resolution, content, AI, and simulation rate were unchanged.
This experiment does not rule out shadow-pass or draw-submission costs: those
are distinct from main-buffer pixel count.

### Engine and abstraction priorities

A separate instrumented CPU profile (`profile-1-headed.*`) attributes roughly
43% of sampled time to gameplay advance, including approximately 22% to obstacle
route planning; 16% to combat presentation, including 9% to obstruction/cutaway
work; 6% to directed fighters; 5% to frame application; and 5% to render submission.
The portable square-root implementation accounts for over 9% self time across
its call sites. These inclusive categories overlap and must not be summed.
Profiling reduced FPS further, so its absolute stage durations are diagnostic,
not ordinary-play measurements. Unprofiled visible trials independently show
roughly 33–37 ms of presentation preparation per rendered frame.

| Priority | Evidence and concrete boundary | Tradeoff / acceptance for the next candidate |
| --- | --- | --- |
| 1. Stop rebuilding static scene presentation | `frame/3d.ts` copies scene entities/materials; `standalone-3d.ts` constructs snapshot maps; `project/runtime-3d.ts:applyFrame` revisits all entity handles, variants and materials. Thousands of records cross these layers each frame. | Cache compiled bindings and static data with explicit invalidation. Preserve detached snapshot ownership and timeline random access. Verify wardrobe, destruction, cutaways, rewind, camera movement and scene replacement. Count scans/copies before timing. |
| 2. Reduce repeated presentation lookups | Combat obstruction reconstructs maps and scans city geometry; knockout/fighter presentation repeatedly searches entity arrays. | Reuse indices within a frame or stable scene revision. Prove fades reset and skeletal/weapon transforms match; do not share mutable frame objects across consumers accidentally. |
| 3. Revisit navigation rebuild complexity | The profile shows expensive route construction and a long simulation tail; the first spatial-filter/cache-key candidate failed full-loop acceptance. | Measure corners, segment tests, rebuilds and cache invalidations before selecting a stronger change. Preserve exact tie order, moving blockers, hazard avoidance and combat checkpoints. |
| 4. Cull and batch main/shadow passes independently | About 2,700 draw submissions remain. `render/3d-scene.ts` accepts `frustumPlanes`, but project runtime `compile()` passes none. | Camera-only culling can incorrectly remove offscreen shadow casters. Require separate pass visibility or a safe union; compare images, draw counts and CPU/GPU timers. Cutaway material changes must not fade unrelated instances. |
| 5. Measure allocation, then consider buffers/workers | Profiles show GC and repeated detached data. A worker would still leave presentation and submission on the main thread. | Measure allocations and retained heap under controlled collection. Preserve rollback/input latency and buffer ownership. A broad worker or WASM rewrite is not justified by the small sqrt win. |

The transform primitive already checks for unchanged values; it is inaccurate to
claim every setter dirties the scene. Gameplay already exposes `advance`, and the
local review path uses it; an unused returned snapshot is not a newly discovered
cost in that path. The observed issue is repeated work around the primitives as
well as the primitives themselves. Reducing pixels, weakening AI, or increasing
physics substeps does not address most of that presentation work.

165 FPS allows **6.06 ms for the entire frame**. This iteration is still far from
that target and does not claim it is delivered. Acceptance needs repeated visible
browser measurements over more spawn/input sequences, including camera movement,
destruction and active human combat, after the dominant CPU work is reduced.

### Follow-up verification

- Arithmetic, retained-license, standalone-CSP and collision checks: 25 tests,
  47,908 assertions passed. The million seeded binary64 sample comparison checks
  the portable and accelerated paths; unavailable/blocked-WASM fallback is tested.
- The frozen control/candidate comparison passes complete checkpoints across
  1,062 physical-combat frames (`engine-parity.json`). The production Chrome/Bun
  gate independently passes the same eight scenarios; the native-math negative
  control still diverges at frame five (`production-determinism.log`).
- Engine source and test typechecks pass. Targeted ESLint has zero errors and two
  existing grandfathered numeric-literal warnings. Process policy passes.
- `final/` is a fresh production export. `final-verification.json` proves an
  actual focused Chrome window, one successful production sqrt-module
  compilation under the exported CSP, an updating FPS counter, collected
  telemetry, and no page errors. Its screenshot was inspected. Runtime hash:
  `5c98a71e71d14074e883b8ce5aa1e6c6f142ad1284bf5646c3a3abd0370a450b`.
  This verification run is not part of the timing comparisons. No shared release
  or deployment was replaced.
