# Touch of Death: compact publication with reuse

The subsequent [raster audit](touch-of-death-raster-repeatability-audit.md) repairs
draw-recorder coverage and localizes the remaining image failure; promotion is
still blocked.

2026-10-10. **Keep working-frame reuse. Existing compact publication is the next
measured win: about 94% more changed poses in both arenas. It remains diagnostic
only because depot failed exact image repeatability.** Gameplay snapshots and
evaluated presentation frames matched. The control also failed depot's image
gate; this neither establishes a transport-caused defect nor excuses the failure.

This completes the comparison proposed by the
[retained-copy audit](touch-of-death-retained-copy-audit.md). No new algorithm,
artifact rebuild, renderer change, latency-policy change or additional candidate
was introduced. Only the existing verifier, runner and offline analyzer changed.

## Measured result

A is the prior recommendation: original lab baseline plus `workingFrame=reuse`.
B changes only `publication=compact`. Original clone baseline remains available;
it was not remeasured. Do not subtract numbers from older campaigns.

Eight serial trials: A/B/B/A in rooftop and depot, each with 5 seconds warmup,
then seeded checkpoint/presentation-history reset and 10 seconds measurement.
Values below average the two trial statistics; percentiles are not pooled.

| Arena/config | Steps/s | Publications/s | Changed poses/s | Submissions/s | Interval p50 / p95 / p99, ms | >6.06 ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Rooftop reuse | 59.82 | 32.10 | 25.72 | 37.23 | 28.45 / 36.05 / 41.15 | 99.87% |
| Rooftop compact + reuse | 59.83 | 55.54 | 49.89 | 117.22 | 8.30 / 11.20 / 13.05 | 100% |
| Depot reuse | 59.70 | 35.26 | 25.04 | 37.10 | 27.00 / 31.50 / 36.70 | 99.59% |
| Depot compact + reuse | 59.76 | 56.47 | 48.53 | 115.84 | 8.35 / 11.35 / 13.90 | 100% |

| Arena/config | Repeated poses | Pose age p50 / p95 / p99, ms | Input-age proxy p50, ms |
| --- | ---: | --- | ---: |
| Rooftop reuse | 30.48% | 51.95 / 77.50 / 87.90 | 52.05 |
| Rooftop compact + reuse | 57.22% | 29.90 / 42.25 / 51.80 | 31.40 |
| Depot reuse | 32.07% | 48.25 / 57.10 / 66.50 | 48.25 |
| Depot compact + reuse | 57.87% | 29.45 / 37.85 / 45.20 | 31.40 |

Fresh-motion gains: **93.97% rooftop, 93.83% depot**. Control range/mean variation
was 6.14% / 0.38%; candidate variation was 3.71% / 9.54%. Effects greatly exceed
control drift; two repeats are not confidence intervals. Rooftop's control is
visibly variable. No trials were retried.

Compact produced 543 interior interpolated submissions; controls produced zero.
About 51–53% of compact displays reused the previous endpoint. This differs from
repeated-pose percentage: a new endpoint can also have an unchanged pose.

## Attribution and actual work

These are mean trial medians. Producer stages nest within compute, decoding
nests within publication, and waiting/transport can overlap execution.
**Do not add these durations or add CPU and GPU time.**

| Measurement, ms | Rooftop A → B | Depot A → B |
| --- | --- | --- |
| Main publication, publication rows only | 14.35 → 0.70 | 13.40 → 0.70 |
| Worker post wall time | 5.50 → 0.60 | 5.10 → 0.60 |
| Packing / decoding | 0 / 0 → 0.55 / 0.50 | 0 / 0 → 0.55 / 0.50 |
| Producer compute | 12.00 → 10.30 | 12.10 → 11.15 |
| Producer presentation | 6.10 → 5.80 | 6.50 → 6.55 |
| Producer application + compilation stage | 2.65 → 2.65 | 2.50 → 2.65 |
| Display preparation | 2.75 → 2.60 | 2.65 → 2.65 |
| WebGL submission | 2.15 → 2.20 | 1.80 → 1.95 |
| Async GPU p50 / p95 / p99 | 4.88 / 6.91 / 10.32 → 4.79 / 6.15 / 6.86 | 3.90 / 5.55 / 6.99 → 3.85 / 5.63 / 6.99 |
| Input waiting | 17.40 → 5.45 | 15.60 → 4.50 |
| Buffer waiting | 3.10 → 0.10 | 2.60 → 0.00 |
| Matched post-end to host-receive wall interval | 11.65 → 4.70 | 10.50 → 3.85 |

The final row includes IPC, deserialization and dispatch, not isolated receiver
CPU execution. Saved clock bounds span about 0.5 ms. Displays without a new
publication are excluded from publication medians. More publications divide the
same ~60 simulation steps/s into smaller batches; lower simulation time per
publication does not establish a physics optimization.

| Work/storage | Observation |
| --- | --- |
| Retained full-object clones | Four controls copied 1,348 publications; candidates copied zero and adopted 2,242. |
| Working-frame clones | Zero on both sides. Each candidate allocated one interpolation destination and reused it; controls needed none. |
| Compact packing | One reusable payload allocation per trial: 781,672 bytes rooftop / 785,500 depot. Transport still copies the payload. Other metadata still uses structured objects. |
| Interpolation storage | 33,919 / 33,899 numeric slots and 10,176 / 10,170 binding references. These are capacities, not measured heap bytes. Decoder ownership remains two leased slots. |
| Render packets | Still 723,524 / 725,316 bytes per publication and two host buffers. Packet writing/reading still executes. |
| Logical copy-byte counter | 723,524 → 1,505,196 rooftop; 725,316 → 1,510,816 depot per publication. This includes packet plus compact buffers and excludes opaque object-clone bytes; total bytes/RAM traffic are not measured. |
| Scene scans | Still 3,391 / 3,389 entity visits and 1,702 / 1,717 deep material comparisons per display. Resource validation remains active. |
| Draws/uploads per display | Approximately 2,032 / 1,830 draws, 977 / 876 shadow calls, and 131 / 117 kB uploaded on both sides. No geometry, shadows or simulation work was disabled. |
| Draws/uploads per second | Rooftop 75,483 → 237,460 draws and 4.88 → 15.34 MB uploads; depot 67,714 → 211,148 and 4.34 → 13.53 MB. Repeated displays increase this work. |

Compact changes both representation and received-endpoint ownership. Earlier
adoption alone did not establish a fresh-motion gain; that supports serialization
as the additional source of improvement here. Separate campaigns cannot assign
an exact fraction of the gain to each mechanism.

## Bottleneck audit and recommendation

| Rank | Finding | Evidence/confidence |
| --- | --- | --- |
| 1 | Object publication was the largest removable limit in the reuse control. | ~94% more fresh poses, lower post/publication cost, unchanged rules and matching deterministic frames. High confidence for this artifact. |
| 2 | Producer CPU preparation now limits endpoint supply. | 10.3–11.15 ms compute; 55.5–56.5 publications/s. Presentation alone is 5.8–6.55 ms. High confidence that compute exceeds 6.06 ms; removable fraction unmeasured. |
| 3 | Repeated display preparation/submission remains substantial. | ~2.6 ms preparation and ~2 ms WebGL submission; every display applies, validates and compiles. Counted work is clear; safe avoidable fraction remains untested. |
| 4 | Scheduling/transport waits and GPU tails remain constraints. | Input waits 4.5–5.45 ms; receive interval 3.85–4.70 ms; GPU p99 ~6.9 ms. Waiting attribution remains incomplete. |

Useful 165 Hz motion is not achieved: all compact submission intervals missed
6.06 ms. CPU serialization/copying limited the control; compact exposes producer
CPU work, display work and scheduling/transport waits. GPU tails also exceed the
deadline. This is not a GPU-only diagnosis. Submissions are not physical presents.

The retained clone was redundant under proven worker ownership. Reuse removes
repeated working allocation while preserving interpolation. Simulation,
changed-pose preparation, resource validation and drawing remain necessary.
Unchanged-scene application is repeated work; safely avoiding it was not tested.

**Keep baseline plus reuse as the recommendation. Compact plus reuse is the
fastest measured diagnostic configuration.** It improved fresh motion and pose
age without changing gameplay or visual workload, but failed image acceptance.

**One next task:** isolate and fix depot's same-version image non-repeatability
so this transport win can qualify for promotion. Keep AA, resources and workload
fixed; do not hide it with tolerance or another renderer. Gameplay/frame parity
narrows the fault beyond those inputs but does not identify the cause. No further
campaign starts here.

## Verification and reproducibility

Unchanged artifact SHA-256:
`ef6fa9f568437060533fc4fcc483b62ee52130c98b554e8e40edc53225e18dbe`.
Chrome 154.0.8037.58, RTX 4070 Laptop, 1366×768, DPR approximately 1, resolution
scale 1, actual 4×MSAA, inherited launch profile without VSync/frame-limit
overrides. Actual flags, camera/checkpoint/config identities and power receipts
are saved. AC power, High performance plan and battery saver off held at
boundaries; continuous thermal state was not measured.

Eight untimed runs proved seeded gameplay and canonical full-frame parity across
configurations/repeats, 264 packet/camera comparisons, 48 interior samples,
44 frozen received publications and 160 retained-input checks, including packed
bytes. Exact decoded images: both rooftop pairs passed; depot control changed
20 pixels (max channel delta 1), compact 21 (max 2). The strict image command
exited 1; both failures are retained.

Eight timed trials completed: 6,138 valid GPU queries, zero invalid/disjoint,
no focus/wake failures, no dropped simulation time and no invalid trials.
GPU queries exclude Canvas2D/HUD/compositing. Heap readings are boundary samples,
not allocation/GC measurements. No captures, synchronous readbacks, traces,
builds, tests or second audit browser ran during timing. Owned browsers closed;
the managed shared server remains available. Passing unit suites were not rerun.
TypeScript checking passed; configuration URL loading and API import/export and
reversal were checked separately after timing.

[Open the lab with reuse enabled](http://127.0.0.1:8807/lab/?arena=rooftop&config=%7B%22schema%22%3A%22touch-of-death-lab-v1%22%2C%22config%22%3A%7B%22workingFrame%22%3A%22reuse%22%7D%7D).
The [recommendation](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/recommended.json)
and [candidate](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/configuration.json)
are full registry exports. `compact-display-experimental` additionally enables
material revisions and is not the configuration tested here.

```powershell
bun.cmd spikes/persistent-world-worker/lab/smoke.ts --compact-reuse --output .local/engine-perf/touch-of-death-lab/compact-reuse-repro/verification
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase compact-reuse --output .local/engine-perf/touch-of-death-lab/compact-reuse-repro
```

Exact image decoding is separate: run `image-parity.ts` with `PERF_ROOT` set to
the verification directory, `PERF_IMAGE_BATCH` to its saved `pixel-batch.json`,
and `PERF_PIXEL_EXACT=1`. Offline analysis of delivered evidence:

```powershell
bun.cmd spikes/persistent-world-worker/lab/runner/producer/analyze-fresh-motion.ts .local/engine-perf/touch-of-death-lab/compact-reuse --phase compact-reuse
```

[Predeclared plan](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/predeclared-plan.json),
[analysis](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/analysis.json),
[raw trials/configs/runner sources](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/compact-reuse/),
[ownership/frame/image evidence](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/verification/)
and [delivery receipt](../../../../../.local/engine-perf/touch-of-death-lab/compact-reuse/delivery.json)
retain the result and its limits. No retries or further combination trials ran.
