# October 10: material tables plus shadow batching

**The combination removes work, but promotion remains inconclusive.** Eight
ABBA/BAAB trials reach 140–145 submissions/s and 56–61 changed poses/s. The paired
submission effect is +12.28%, with an exploratory interval of −0.38% to +26.54%.
Control spread is 15.54%, above the declared 5% gate. Same-version normal-AA
repeats fail. Useful deterministic 165 Hz gameplay remains unproven.

## Controlled change and structural evidence

The control is the [complete material-table pipeline](october-10-display-material-table.md).
The candidate adds the [previously isolated shadow batching](october-10-display-shadow-batching.md).
Both retain compact publication, material revisions, full services, 60 Hz fixed
simulation/producer requests and 16.67 ms interpolation delay. Producer binaries
match. Frozen source graphs differ only in the shadow pass and diagnostic label.
Do not add the separately measured gains or pool these sessions.

| Rooftop checkpoint | Shadow draws: table / combined | Total GL calls: table / combined | Surface + outline draws, both | Upload bytes, both |
| --- | ---: | ---: | ---: | ---: |
| 0 | 896 / 200 | 13,495 / 6,535 | 299 | 339,744 |
| 60 | 1,233 / 277 | 18,385 / 8,825 | 373 | 340,832 |
| 240 | 1,567 / 419 | 24,469 / 12,989 | 514 | 349,408 |

All other renderer counters match, including material bindings 257/325/468 and
ordered expanded shadow primitive dimensions. Shadow batching adds scalar
lookahead over existing commands; no new explicit arrays, staging copies or GPU
uploads. Mesh/resource checks remain live per merged range, with unchanged main
validation. Material-table storage, scans and private texture uploads remain on
both sides. These are logical work counts, not measured cache misses, RAM-bus
traffic or allocation rate. The checkpoints contain no skinned instances.

## Input evidence and repeatability

The initial unmodified builds fail full copied-argument equality between owners:
material-ID blob 9 differs. A separate byte probe finds unused words, but its
hashes do not match the original capture; retrospective binding correctly fails.
That original evidence gap remains recorded.

The new shared manual diagnostic queries the current program and table uniforms
before each instanced draw, records the actual used ranges, and retains upload
bytes in that same capture. It runs only inside explicit command capture, with
no hook or query in automatic rendering. The newly captured differences total
768/960/1,032 words across ordinary/restore/AA-off checkpoints; none are read by
those draws, and all other upload blobs match. The gate binds this proof to the
current capture prefix, manifests, checkpoint and complete blob-hash arrays.
Full-upload equality still reports false. This is not complete resident-GPU-state
proof. Synchronous diagnostic queries perturb scheduling and cannot be timed.

Verified builds pass 966 publication checks, 1,932 interpolation endpoint checks,
966 repeat/audio checks and 483 inline source-mutation probes against archived
references, including the restore/teleport schedule. Normal-AA repeat results:

| Capture | Nonexact adjacent image pairs | Equal recorded initial state/calls/uploads |
| --- | ---: | ---: |
| Original builds, eight redraws | 58 / 96 | 96 / 96 |
| Shared draw-use observer, ordinary + restore | 16 / 28 | 28 / 28 |
| AA-off diagnostic | 0 / 12 | 12 / 12 |

Counts include separate raw and composited comparisons. Both versions fail their
own normal-AA repeats; this is not a cross-version equality requirement. Maximum
channel difference is 10 in the original captures, with up to 177 changed pixels.
The query-instrumented result cannot clear the less invasive failure.

## Eight live trials

i9-13900HX, RTX 4070 Laptop, Chrome 154.0.8037.58, rooftop seed 714, visible/focused,
1366×768, DPR 1, normal 4× MSAA. Timer scheduling, two-buffer fresh worker,
six-second warmup, restore, six-second measurement, fresh browser per trial.
Both builds retain the same provenance/work counters and asynchronous whole-render
GPU queries; observer overhead is uncalibrated. Manual draw observation is off.
No builds, tests, traces, image readbacks or second audit browser run during timing.

| Trial | Variant | Submissions/s | Changed poses/s | Repeats | Interval p50 / p95 / p99 / p99.9, ms | GPU p50 / p95, ms |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | Table | 138.26 | 58.00 | 58.00% | 6.6 / 10.5 / 16.3 / 19.2 | 4.133 / 5.765 |
| 2 | Combined | 140.60 | 56.44 | 59.81% | 6.5 / 10.0 / 15.7 / 20.6 | 2.502 / 4.247 |
| 3 | Combined | 144.91 | 61.16 | 57.75% | 6.2 / 9.5 / 14.8 / 18.0 | 2.421 / 3.958 |
| 4 | Table | 118.86 | 45.98 | 61.26% | 8.0 / 12.2 / 16.1 / 21.7 | 4.886 / 6.778 |
| 5 | Combined | 139.96 | 55.68 | 60.17% | 6.5 / 10.0 / 16.0 / 17.8 | 2.559 / 4.449 |
| 6 | Table | 124.90 | 51.82 | 58.46% | 7.6 / 11.1 / 16.6 / 23.8 | 4.631 / 6.536 |
| 7 | Table | 124.79 | 49.95 | 59.92% | 7.7 / 11.0 / 16.2 / 22.9 | 4.536 / 6.619 |
| 8 | Combined | 142.74 | 57.50 | 59.67% | 6.4 / 9.8 / 15.1 / 17.9 | 2.441 / 3.945 |

All 6,472 GPU queries are valid. There are 6,464 submission intervals, 2,223
producer acquisitions and 2,872 observed fixed steps, with no missing step IDs
within observed spans. GPU queries exclude post-processing, HUD and browser
compositing. CPU and GPU times overlap; do not sum them.

Candidate missed-6.06-ms intervals remain 54.65–62.90%, versus 63.66–90.77% for
control. Longest repeats are 38–42 versus 32–38. WebGL wall p50 falls from 1.7–1.9
to 1.4–1.5 ms; main-to-submit p95 remains 6.6–6.9 ms. Candidate endpoint/interior
preparation is 1.4–1.5 / 2.4–2.5 ms, producer-through-post p50 10.9–11.3 ms,
pose age p50 26.6–27.5 ms and applied-input-to-submit proxy 38.1–39.3 ms.
The proxy is not input-to-photon latency, and submissions are not physical presents.

| Hypothesis / expected signature | Result / uncertainty | Decision |
| --- | --- | --- |
| Combining the changes removes additional command work | 6,960–11,480 fewer calls with unchanged non-shadow work/uploads | Structural evidence passes at these checkpoints |
| Fewer calls improve full-loop throughput | Four positive pairs, +1.69% to +21.92%; geometric effect +12.28%, interval −0.38% to +26.54%; control/candidate spreads 15.54% / 3.50% | Inconclusive under stability and uncertainty gates |
| GPU elapsed draw work falls | Median of trial medians 4.583→2.471 ms; all pairs improve, but control/candidate spreads 16.42% / 5.59% | Promising; repeat independent stable sessions |
| Faster drawing yields more fresh motion | Changed-pose effect +12.48%, interval −8.72% to +38.61%; roughly 58–60% candidate repeats | No demonstrated fresh-motion gain |
| Identical instructions reproduce an image | Both versions fail same-version normal-AA; AA-off exact | Determinism gate fails |

Intervals use paired log ratios, Student t, four pairs in one cohort; independence
is unverified. Wall-clock trials traverse different elapsed gameplay. No new trace
attributes this cohort's improvement to command-buffer waits; earlier traces are
separate evidence. Empty controls average 6.059–6.061 ms, with no suspected sleep.
Boundary GPU readings are 70–73°C and 210–585 MHz, outside the timed windows.
In-window clocks, CPU temperature, GC/allocation attribution, shader compilation,
resource residency and other-process activity remain unmeasured here. Heap
boundaries span 35.2–65.8 MiB; they do not establish retained memory or working set.

## Reproduction and next gate

Raw root: `.local/engine-perf/display-combined-20261010/roof/`; authoritative
capture/timing builds are under `verified/`. Owner: engine performance audit.
Retain until replacement evidence preserves source identities, samples and failures.
Verified runtime hashes: control
`e555feab7a22b2fea2a935b659bf61b009a8dc0f458b191e9c7c949afd8923c8`, combined
`b234a71be3d5264967509d57c5fea8e0796f7fa411796b9d36bae3222c64bcdc`;
shared producer `8092c0aff2a737e8dc5f46a049f37662144fd79ccc39686164539827f2ab1c66`.

Use `rendering/archive-renderer-recipe.ts` with the frozen `display-table` graph
from `display-material-table-20261010/roof`, archive `ceiling-20261009`, variant
`shadow-batch`, `PERF_RENDER_DISPLAY=1`, `PERF_RENDER_DISPLAY_BASE=table-all`.
Build both generated graphs/patches with `PERF_REBUILD_RENDERER=1`. Apply
`verification/table-draw-recipe.ts` to each result and rebuild into `verified/`.
Saved patches, graphs, manifests and `source-comparison.json` bind the artifacts.

Capture settings match the [isolated shadow recipe](october-10-display-shadow-batching.md#reproduction-and-evidence),
using `combined-capture`, `combined-restore`, `combined-aa-off`; verified captures
use one redraw. Run `upload-bytes-results.ts` before `display-shadow-results.ts`.
The root's original eight-redraw capture is retained separately. Each root's pixel
plans and reports are complete; exact normal-AA pixel commands exit 1 as expected.

For timing, run `bun.cmd spikes/persistent-world-worker/compare.ts` with
`PERF_ROOT` set to `verified/`, `PERF_PREFIX=combined-abba`, artifact order
`control,shadow-batch,shadow-batch,control,shadow-batch,control,control,shadow-batch`,
eight `worker-2-fresh` / `timer` entries, the retained roof-compact-714 workload,
warmup/measure seconds 6, reset-after-warmup, diagnostic/provenance, power/AC and
wake enabled, visible high-performance RTX 4070. Clear manual capture flags.
The saved `combined-abba-plan.json` records the configuration. Run
`presentation/display-live-results.ts`, `rendering/display-shadow-results.ts`
with correctness prefix `combined-capture` and timing prefix `combined-abba`,
then `control-drift.ts`. `screen-summary.json` retains exact derived values.

Seventeen focused tests pass (99 assertions), scoped TypeScript passes, and
process policy reports 4,893 files with zero violations. All 70 cleanup receipts
are empty; all 18 wake guards release. The shared game server has no unresolved
errors and stays running. No playable default changed.

Next establish a repeatable AA implementation or isolate the failing full-game
resource/draw interaction. Keep independent stable controls as a separate gate.
Then remove whole presentation scans/copies or producer work with explicit
invalidation, measuring fresh poses and latency. Six arenas, skinned/dense stress,
resource mutation, sustained memory/thermal and representative JS/Wasm comparisons
remain required before choosing the library architecture.
