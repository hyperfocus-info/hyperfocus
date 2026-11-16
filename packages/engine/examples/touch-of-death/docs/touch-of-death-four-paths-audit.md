# Four-path performance audit

October 14, 2026. Follow-up to the [native-window audit](touch-of-death-native-performance-audit.md).
The scope is the ordinary playable's full street checkpoint, not the smaller
rooftop/depot fixtures. All visual and gameplay features remain enabled. No
production deployment or global graphics/power setting change is part of this work.

**The strongest measured motion result is the retained worker with compact
interpolation: 136.32 submissions/s and 67.96 changed-root samples/s.** Its paired
direct-worker control delivers 58.86 and 50.47 respectively. The 34.66% root-motion
gain exceeds trial variation, but comes with older input/poses and does not
establish 165 Hz fresh gameplay. It is the recommended experimental configuration,
not a blanket production default. SIMD/parallel math was implemented and measured;
its local wins do not explain away the remaining whole-scene preparation cost.

## Implemented paths

| Path | Implementation and actual scope | Remaining boundary |
| --- | --- | --- |
| Retained render preparation | Public synchronous `runtime.withRenderView`; retained entity/TRS/material rows; certified immutable base looks; selected presentation snapshot; live resource validation | Still visits all authored entities/materials and rereads mutable values. This is the first milestone, not a complete revision-driven renderer. Timeline/physical-performance sampling explicitly falls back to detached frames. |
| Optional work policy | Public framework-neutral `createFrameWorkPolicy`; cadence, maximum age, revision, budget, urgency and bounded coalescing; ordinary host defers hidden-panel maintenance | Required input, simulation, visible gameplay HUD and drawing continue. The native worker host rejects the inline-only panel policy. |
| Producer/display ownership | Existing world worker, three transfer buffers, all gameplay services, 60 Hz producer; optional existing compact endpoint decoder/adoption/working-frame reuse and 16.67 ms interpolation delay | Direct worker sends compiled packets. Interpolated mode additionally sends full compact endpoints; changed-record-only publication is not implemented here. |
| Bulk numeric execution | Real scalar f64 and f64x2 SIMD Wasm in fixed SoA memory; checked partitioned live adapters; bulk scalar/SIMD and two persistent SIMD workers on actual captured queries | The two-worker math pool is an isolated actual-query replay, not an integrated asynchronous game presenter. No shared-memory or whole-engine Wasm conversion is claimed. |

The engine primitives have no DOM, framework, worker or Wasm dependency. Backend
selection belongs to the host and occurs outside the numeric inner loop. The
existing general JS oracle handles unsupported Wasm inputs, with explicit failure
and fallback counters. No resource-liveness checks were removed.

## Inline full-loop comparisons

Each row is one A/B/B/A block, 5 seconds warmup and 10 seconds measurement per
trial. Values average the two trial statistics, not pooled percentiles. Spread
is the two-trial range divided by their mean, not a confidence interval.
"Changed roots" counts fighter-position changes, not complete pose freshness.
Submissions are CPU submissions, not proven physical presents.

| Contrast, A -> B | Submissions/s | Changed roots/s | Submission effect | A / B spread | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Detached -> retained view | 69.01 -> 71.39 | 50.56 -> 49.49 | +3.44% | 1.68% / 7.17% | Inconclusive; candidate variation explains the effect. |
| Every-frame -> bounded panels, retained view on both | 71.63 -> 74.18 | 51.28 -> 51.33 | +3.56% | 0.36% / 1.20% | Small submission/tail improvement; no established motion improvement. |
| Partitioned JS -> partitioned scalar Wasm, retained view on both | 74.06 -> 70.19 | 51.47 -> 50.78 | -5.23% | 2.58% / 9.88% | Inconclusive, not evidence of a reliable whole-loop regression or gain. |
| Partitioned scalar Wasm -> partitioned SIMD | 73.93 -> 73.69 | 51.17 -> 51.11 | -0.32% | 0.98% / 1.60% | No useful full-loop difference. |

The original inline control ran 59.84 fixed steps/s, with interval p50/p95/p99
12.20/18.30/24.25 ms, 99.64% above the 6.06 ms deadline, and 26.62% repeated roots.
CPU callback time was 12.50/17.20/21.10 ms; preparation alone was
7.70/10.05/11.75 ms. GL submission was 1.25/2.15/2.55 ms and asynchronous GL GPU
time 2.58/3.99/5.00 ms. These durations overlap or nest and are **not added**.

The bounded-panel candidate ran 59.86 steps/s, with interval
12.15/18.20/18.45 ms, 98.92% deadline misses and 30.71% repeated roots. Its paired
control's interval p99 was 23.75 ms. Faster callbacks did not raise the roughly
51 changed-root/s rate. Hidden panels ran about four times/s instead of once per
display; visible gameplay HUD, post-processing and rendering remained active.

Retained storage eliminated the full 3,420-entity snapshot in this path. The
sampled snapshot stage fell from 0.65 ms median to zero and material application
from 1.80 to 1.15 ms. Sampling itself rose from 0.60 to 1.00 ms: reuse still resets
records and compares current authored scalars. During the measured retained path,
the owner stayed at 3,420 entity records, 1,724 material rows, 1,724 immutable looks
and 17,363 tracked vector arrays, without creating more of these records.
That is bounded storage/allocation evidence for this owner, not a measurement of
all engine allocations or RAM traffic. Entity/material visits and live resource
validation still execute every display.
Deep display material checks fall from 1,724 to about 44 per sample (97.4% fewer),
while about 1,722 live-storage checks and two actual material updates remain.
Other frame, physics-view and presentation allocations are outside the retained
record counters; this evidence does not establish a whole-engine GC reduction.

## Worker and interpolation results

The corrected worker ownership block compares retained inline presentation with
retained direct-worker presentation: submissions 73.36 -> 58.96/s, changed roots
51.42 -> 50.76/s, main-thread CPU median 11.75 -> 1.90 ms. The producer is explicitly
60 Hz; moving it to a worker frees display CPU but does not itself generate more
motion. Both owners keep all gameplay services. The following interpolation block
is the useful paired comparison:

| Metric | Original inline control, contextual | Direct worker, paired A | Interpolated worker, paired B |
| --- | ---: | ---: | ---: |
| Fixed simulation steps/s | 59.84 | 59.91 | 59.92 |
| Changed fighter roots/s | 50.56 | 50.47 | 67.96 |
| CPU submissions/s | 69.01 | 58.86 | 136.32 |
| Interval p50/p95/p99, ms | 12.20 / 18.30 / 24.25 | 18.10 / 21.55 / 25.10 | 6.10 / 12.20 / 12.30 |
| Strict intervals >6.06 ms | 99.64% | 99.83% | 64.17% |
| Repeated root samples | 26.62% | 14.12% | 50.08% |
| Main CPU p50/p95/p99, ms | 12.50 / 17.20 / 21.10 | 1.90 / 2.65 / 3.15 | 5.40 / 8.35 / 9.60 |
| Async GL GPU p50/p95/p99, ms | 2.58 / 3.99 / 5.00 | 2.67 / 4.47 / 5.22 | 2.10 / 3.61 / 4.70 |
| Pose-age diagnostic median, ms | Uninstrumented | 13.10 at packet take | 25.70 before draw |

The original inline column is from the earlier block, not an additional paired
baseline-versus-combination experiment. The causal interpolation contrast has
submission spreads 0.30% / 4.14% and changed-root spreads 0.44% / 2.16%, far smaller
than its 131.59% submission and 34.66% changed-root gains. Fixed-step counts come
from service counters, including at most an in-flight boundary step; gameplay tick
differences are unsuitable because hitstop can hold the gameplay tick.

The strict deadline metric includes 6.1 ms rounded rAF intervals. Clock resolution
is approximately 0.1 ms, so it overstates missed refresh opportunities near 165 Hz.
The supplementary fraction exceeding 1.5 refresh periods is 20.64% in the
interpolation pair; neither metric proves physical presentation cadence.
[Raw interval-gap check](../../../../../.local/engine-perf/four-paths-20261014/cadence-quantization.json)

Among 2,730 timed display telemetry rows, 530 are interior interpolations (19.4%),
1,393 are endpoints and 807 are snaps. Most snaps are the explicit unsupported
knockout fallback (799); phase boundaries and initial history account for the
rest. Faster repeated endpoints are not counted as a fresh-motion victory.
The configured interpolation delay stays at 16.67 ms throughout.

Interpolation costs 2.60 ms median display preparation and 5.45 ms at p95. Every
display still applies 3,420 entities and 1,724 materials; interior samples blend
all 3,420 entities. GL draw submission itself is only 0.85 ms median, and checked
camera/light packet preparation about 0.30 ms. Optional fine-grained working-setup
counters are disabled in this lane: their zero fields are not proof that those
operations disappeared.

Producer wall time rises from 9.25/13.35 ms median/p95 to 11.45/20.10 ms when it
also constructs interpolation endpoints. Acquired publication rate falls from
about 58.96 to 54.53/s despite the 60 Hz simulation. Compact packing costs 0.80 ms
median per publication; adoption/decode together cost 0.60 ms on the display
(decode alone 0.50 ms, nested within that total). Each endpoint contains 790,352
logical compact bytes in addition to a 730,112-byte compiled packet. The latter
uses three transferred buffers retaining 2,190,336 bytes; compact endpoint buffers
still use structured cloning in this prototype. Two endpoints are retained;
retained-object clones and working-frame clones both remain zero, with two bounded
working-storage allocations across warmup/reset and measurement.

Waiting is separate: median input-handshake wait grows from 0.60 to 4.10 ms,
message delivery from 0.55 to 3.85 ms; buffer-exhaustion wait stays zero. Delivery
includes cloning/dispatch and main-thread availability, and is not a measurement
of pure serialization CPU time. The direct-worker input-to-submit proxy is
21.40 ms median; the interpolation input-age proxy is already 30.45 ms **before**
drawing. The exact added input-to-photon latency is unmeasured.

Artifact6's interpolation fields named `poseAgeAtSubmitMs` and
`inputSampleToSubmitMs` were stamped before drawing. This report uses their actual
scope, not their names. Its legacy `renderSubmitMs` also encloses preparation and
other display work; use `nativeWork.drawMs` for GL submission. The final diagnostic
source separates before-draw/after-draw stamps, fixes the submission/post scopes,
and includes conditional publication fields in summaries. Timed artifact6 remains
immutable; those telemetry-only corrections are not presented as new timing data.

At the untimed checkpoint both direct and interpolated paths retain 146,752
uploaded bytes and 285 material bindings. There is no claim of reduced timed
GPU-upload traffic; these figures establish equivalent sampled work, not a
ten-second traffic integral.

## Actual-query numeric comparison

Eight ordered untimed batches from the ordinary playable contain 288 targets and
263 box queries each, with 26 hits. Every timed result is checked against those
hit sequences. Seven modes ran serially: 80 warmup batches per mode, then four
counterbalanced two-second trials per mode. Times include packing, validation,
partition construction and, where applicable, worker transfer/synchronization.
They exclude live target generation, gameplay and rendering.

| Implementation | Mean elapsed ms/batch | Range of four trial means, ms | Interpretation |
| --- | ---: | ---: | --- |
| General JS | 0.682 | 0.669-0.702 | Original ordered numeric workload. |
| Partitioned JS | 0.379 | 0.370-0.397 | 44.5% less elapsed time through less work. |
| Partitioned scalar Wasm, SoA | 0.340 | 0.329-0.348 | Another 10.2% below partitioned JS. |
| Partitioned SIMD, SoA | 0.339 | 0.334-0.348 | Indistinguishable from the scalar partitioned kernel. |
| Bulk scalar Wasm | 0.493 | 0.475-0.500 | Fewer boundary calls, but lacks partition pruning. |
| Bulk SIMD Wasm | 0.459 | 0.453-0.463 | 6.9% below bulk scalar. |
| Two persistent SIMD workers | 0.312 | 0.279-0.371 | 32.0% below bulk SIMD on average; benefit over the best partitioned serial path fits worker variation. |

Partitioning reduces actual scalar target tests from 71,155 to 26,803 in the
captured batch. It retains 263 box queries, 18 groups, 2,783 group tests and
1,703 kernel calls. SIMD tests 26,812 lanes because its final hit pair evaluates
both lanes. Each Wasm owner packs 6,912 logical target bytes and retains one
64 KiB memory; no fallback occurs on this capture. The two-worker bulk mode
recycles two 64 KiB transfer buffers, transfers 256 KiB of logical capacity per
batch round trip, and explicitly copies inputs into each worker's Wasm memory.
Transferred capacity is not copied RAM traffic, and no cache-miss measurement
was made.

This is positive evidence for Wasm and parallel execution on this workload. It
also shows why selecting them by name is insufficient: partitioning removes
more work than SIMD accelerates, and the live partitioned ABI still has many
short calls. Standard Wasm SIMD supplies 128-bit vectors; the exact f64 path uses
two lanes, preserving the JS operation order without relaxed math. SIMD does not
remove packing, branches, ownership transfer, validation or scheduling.
[V8 SIMD documentation](https://v8.dev/features/simd)

ArrayBuffer transfer moves ownership; it does not make the surrounding object
graph or explicit memory copies free. The replay includes these costs instead
of treating worker arithmetic time as total elapsed time.
[Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

## Measurement and correctness boundaries

Visible maximized Chrome 154.0.8037.58, CSS viewport 1280 x 665, DPR 1.5, canvas
1920 x 998, MSAA and resolution 1; RTX 4070 Laptop GPU via ANGLE/D3D11. Display
mode is 165 Hz, AC power, High performance scheme. Actual launch command lines
disable extensions and contain no GPU-VSync or frame-rate-limit override.
The shared managed game URL is `http://127.0.0.1:8797/game/`; the runner routes
that URL to the recorded immutable artifact in its owned browser.

Every trial reloads the seeded realm, warms, parks, restores the same tick-3
checkpoint, resets presentation/history and resumes with a rebased clock. The
full core checkpoint hash is checked before and after warm restoration. Throughput
keeps learning/replay services enabled; manual captures disable them to match the
synchronous photo-capture oracle. This service distinction is recorded and is
never counted as an optimization.

Manual image/state checks, unit tests, batch replay and full-game timing are
different evidence lanes. No capture, detailed trace, synchronous readback,
forced GPU completion, build or test runs inside throughput measurements.
GPU queries cover WebGL rendering, excluding Canvas2D/HUD/compositing. Power
observations are boundary samples, not continuous proof of clocks or thermals.
All source identities and raw samples are preserved under
[the campaign root](../../../../../.local/engine-perf/four-paths-20261014/).

Three defects discovered during the work were corrected:

1. Fractional 60 Hz clock subtraction could lose a step at an exact boundary.
   The simulation mailbox now uses a tightly bounded floating-point tolerance;
   regression checks cover long clock origins and genuinely early deadlines.
2. Resuming manual capture could charge paused inspection time to simulation.
   The ordinary host now clears its accumulator and rebases its clock. Eight
   earlier trials are retained under `results/` and explicitly invalidated.
3. The native worker controller bypassed the camera/light culling used by inline
   rendering. Its initial ownership block submitted about three times the draw
   work. Those four trials are retained but excluded. The corrected native bridge
   uses existing checked packet views, plus an untimed cross-owner rendering-count
   gate. The same checkpoint now matches at 319 main draws, 237 shadow draws,
   42,652 triangles and 490 instances, with the exact same endpoint image.

The packaged engine build and external consumer check pass. Saved focused logs
show three render-view tests, fourteen clock/session/capture tests and twelve
packet/scene-view tests passing; other focused ray/material/policy/SIMD checks
also passed during implementation. These counts are not performance trials.
The lab typecheck and process policy pass. **The bundle-size gate fails** in the
mixed working tree: aggregate runtime distribution is 58,659 raw and 19,824 gzip
bytes over its checked budget. This work contributes public code; the entire
overage is not attributed to it or excused as pre-existing. No budget was raised.

The old small-arena campaign's image failures are not requalified by this street
checkpoint. Exact self-repeat evidence here does not establish every arena,
browser, long-running session, resource mutation or interactive menu transition.

Completed evidence: 24 usable full-game trials, 12 invalidated earlier trials,
18,148 timed telemetry rows, 28 numeric replay trials, and 24 latest manual
captures forming 12 exact self-repeat pairs. All timed focus/wake checks pass;
18,126 GPU queries are valid, 22 remain pending at capture end, and none are
invalid/disjoint. All 27 owned-browser cleanup receipts have no remaining owned
processes or visible windows. Shared managed servers stay running and their
unresolved error list is empty. Optional local policy/ingestion/demo endpoints
return 404 and use the existing offline fallbacks; this is not a hosted-service
acceptance run. [Completion receipts](../../../../../.local/engine-perf/four-paths-20261014/completion.json)

## Ranked gaps and recommendation

| Rank | Supported bottleneck | Evidence | Confidence / implication |
| --- | --- | --- | --- |
| 1 | Display preparation still walks and applies the whole scene | 3,420 entities and 1,724 materials per display; preparation p95 5.45 ms, main CPU p95 8.35 ms in the fastest motion path | High. Tail display CPU exceeds 6.06 ms even though GL GPU p95 is 3.61 ms. |
| 2 | Endpoint availability and producer tails | Producer p95 20.10 ms, acquired endpoints 54.53/s, input wait 4.10 ms, only 19.4% interior displays | High for the limit; transport CPU versus main-thread dispatch delay is not fully isolated. Extra buffers would not fix measured zero buffer wait. |
| 3 | Required discontinuity/KO fallbacks and explicit latency policy | 799 KO snaps; pose age 25.70 ms before draw; input proxy 30.45 ms before draw | High. Increasing delay can create more brackets but adds latency; it is not a free optimization. |
| 4 | Remaining numeric obstruction work | Partitioning and Wasm reduce actual-query time, but incremental SIMD is negligible after pruning and live FPS differences fit variation | Strong local evidence; no established full-game backend winner. |

Use the saved **experimental** configuration for further playable evaluation:
retained render view, existing worker, compact adopted endpoints, working-frame
reuse, 60 Hz producer, 16.67 ms interpolation delay, checked camera/light culling,
full visuals, MSAA, native resolution and rAF. Keep JS ray math for now. Its useful
motion gain is real on this checkpoint, but the added latency, KO behavior,
single-scene qualification and bundle gate prevent an unconditional default
promotion. Keep the original inline baseline available. No automatic production
default or deployment was changed.

No additional combination was measured: the small panel-policy win is currently
inline-only, and the numeric candidates have no established incremental full-loop
gain. Combining them with the worker would either be unsupported or assume gains
that the data does not establish.

**One next implementation task:** make the display consume an engine-owned render
change set, applying only changed transforms/materials through retained checked
bindings. Keep static scenery resident and invalidate bindings on resource,
topology, reset and context generations. The acceptance target is removal of the
3,420/1,724 full application scans from unchanged displays, while retaining live
resource checks and exact same-version reset/image evidence. This directly attacks
the display tails and the main-thread input/delivery waits. It is the unfinished
revision-driven part of path 1, not another whole-engine rewrite.

165 Hz useful motion is not established. Current evidence supports CPU preparation
and endpoint/scheduling limits ahead of GPU execution. Wasm/SIMD/parallel execution
can improve an appropriate batch, but cannot remove required publication,
presentation, resource validation or rendering on their own.

## Saved configuration and reproduction

- [Combined analysis and per-block source/configuration identities](../../../../../.local/engine-perf/four-paths-20261014/analysis.json)
- [Recommendation and fixed host settings](../../../../../.local/engine-perf/four-paths-20261014/recommended.json)
- [Importable native candidate settings](../../../../../.local/engine-perf/four-paths-20261014/recommended-config.json)
- [Actual-query raw samples](../../../../../.local/engine-perf/four-paths-20261014/ray-replay/ray-replay.json)
- [Retained allocation/scan counters](../../../../../.local/engine-perf/four-paths-20261014/work-evidence.json)
- [Image/state verification ledger](../../../../../.local/engine-perf/four-paths-20261014/verification.json)

The native runner selects only its implemented registry keys. Legacy arena-lane
defaults also appear in its shared `nativeConfig` object; those are not the actual
worker transport contract. The plan and effective worker stats identify the
three-buffer owner, actual compact data, fixed services and scheduling. The
ordinary bridge is configured at reload through this existing runner; it does
not claim every arena UI switch is supported in the ordinary game.

Inline/numeric full-loop trials use artifact5 SHA-256
`c23e4795c991e1217024fa483bb98aa44855ab7810d2450319ff1a5388f4c1d1`.
Corrected worker trials use artifact6
`1d994861b9e1fb81263e7d0cbf0708d8b326b67efa8cea8949d2aed0b9f825b9`.
The final diagnostic artifact7 is
`673e6a48232d8404571800a6959b01b034be59ca4dffb9e7f5775c99597a8706`;
only telemetry scopes changed after artifact6. Its separate live telemetry smoke
passed; no new throughput numbers are attributed to it. All versions contain all
strategies. Development rebuilds corrected defects; no build was made per switch.
Manifests include complete source graphs, worker identities and readable maps.

Use repository-compatible Bun 1.4.2 (the machine's global 1.4.3 rejects its bunfig).
Reproduce the measured worker/interpolation block with the measured artifact:

```powershell
$labBun = 'C:/Users/MindOverMelee/AppData/Local/npm-cache/_npx/22f2fe8d8bc13000/node_modules/bun/bin/bun.exe'
$env:PATH = (Split-Path $labBun) + ';' + $env:PATH
$env:PERF_URL = 'http://127.0.0.1:8797/game/' # Reuse the managed URL.
$env:PERF_NATIVE_ROOT = '.local/engine-perf/four-paths-repro'
$env:PERF_NATIVE_ARTIFACT = '.local/engine-perf/four-paths-20261014/artifact6/index.html'
New-Item -ItemType Directory -Path $env:PERF_NATIVE_ROOT | Out-Null
Copy-Item .local/engine-perf/four-paths-20261014/checkpoint.json "$env:PERF_NATIVE_ROOT/checkpoint.json"
& $labBun spikes/persistent-world-worker/lab/runner/playable-native.ts timing interpolation
& $labBun spikes/persistent-world-worker/lab/runner/analyze-native.ts $env:PERF_NATIVE_ROOT
```

Use `artifact5/index.html` with `renderView`, `workPolicy`, `wasm` or `simd` to
reproduce the other measured contrasts. For the final corrected diagnostic, use
`artifact7/index.html`; set `PERF_NATIVE_CANDIDATE_PATH` to the saved
`recommended-config.json` and use `verify saved` for an untimed manual capture
comparison. Use a fresh evidence root so completed results are never overwritten.

The separate numeric replay uses the captured queries, not a new synthetic scene:

```powershell
$env:PERF_ROOT = '.local/engine-perf/four-paths-rays-repro'
$env:PERF_RAY_CAPTURE = '.local/engine-perf/four-paths-20261014/rays-renderView/batches.json'
& $labBun spikes/persistent-world-worker/wasm-cutaways/throughput.ts
```

Run these serially with other game/profiler windows closed. Stop after the declared
blocks; none of these commands launches an automatic optimization search.
