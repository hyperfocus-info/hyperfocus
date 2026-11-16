# Retained producer publication audit — October 14, 2026

Implemented the upstream numeric publication slice and fixed an adapter aliasing
regression found during measurement. **It reduces publication work and display
CPU tails, but does not establish a fresh-motion gain or qualify for promotion.**
Keep production defaults and the previously recommended native baseline unchanged.
The candidate remains selectable as `retainedPublication=dirty`.

This follows the [publication adapter audit](touch-of-death-retained-publication-audit.md).
The [slice contract](../../../../../spikes/persistent-world-worker/retained-presentation/README.md)
owns writers, invalidation, ownership and compatibility. The new option requires
the native worker/interpolated pipeline and a retained executor. Full publication
remains available in the same build. No simulation, camera, AA, resolution,
interpolation-delay, executor kernel or resource-validation policy changed.

## What changed

The producer captures final presentation values, compares exact numeric inputs,
and publishes only changed rigid-candidate rows. Full fallback entities and all
materials retain the original codec. The receiver applies every ordered update
before host coalescing and retains immutable numeric snapshots. Owned transforms
feed the retained adapter directly; rotating/variant pairs reconstruct only their
fallback records. Missing sequences, malformed rows and topology changes fail
explicitly. Reset epochs carry complete baselines.

The first implementation shared placeholder vector arrays. Switching a row into
rotation fallback changed the alias graph and caused 33–36 working-storage
allocations per warmup/trial lifetime, versus 2 in the control. A regression test
reproduced this. Independent immutable placeholder vectors restore the original
alias layout: the corrected candidate and control both recorded **2 allocations**
in every final trial. The corrected artifact changes only `publication.ts` from
the first artifact; the source diff is saved.

The producer still scans 3,420 ordered records to detect changes. Its gameplay
presentation, source frame, material processing, scene application, compilation
and separate 730,112-byte render packet remain. This is an upstream publication
optimization, not yet a producer calculation-pruning optimization.

## Bounded measurements

Completed **8 timing trials**: one initial ABBA block and one corrected ABBA block
after the reproduced alias regression. Every trial used 5 seconds warmup and
10 seconds measurement. No further timing, combination or executor sweep ran.
Two separate allocation lanes each compared A/B over three 3-second intervals;
heap sampling and explicit collection stayed outside throughput.

Same canonical street checkpoint, seed 1337, visible/focused maximized Chrome 155.0.8059.80 for all timing trials,
1280×665 CSS viewport, DPR 1.5, 1920×998 drawing buffer, production MSAA, RTX 4070
Laptop GPU, 60 Hz producer, three buffers and 16.667 ms interpolation delay.
Actual browser flags, power, geometry, GPU and source identity are saved per run.

Final numbers average the two trial statistics, not pooled percentiles. **Control
is the existing retained JS adapter with full publication**, not the original
production renderer. The original-display promotion comparison was skipped.

| Metric | Full publication | Corrected dirty publication |
| --- | ---: | ---: |
| Fixed simulation steps/s | 59.93 | 59.90 |
| Changed fighter-root poses/s | 68.27 | 65.55 |
| Submissions/s | 153.41 | 156.71 |
| Submission interval p50 / p95 / p99, ms | 6.065 / 12.080 / 12.190 | 6.060 / 9.360 / 12.163 |
| Intervals strictly above 1000/165 ms | 51.17% | 48.48% |
| Main callback wall p50 / p95 / p99, ms | 4.173 / 7.948 / 8.983 | 4.042 / 7.398 / 8.385 |
| Display preparation p50 / p95 / p99, ms | 1.510 / 5.242 / 5.820 | 1.550 / 4.818 / 5.435 |
| Main publication p50 / p95, ms | 1.362 / 1.762 | 1.012 / 1.305 |
| Endpoint decode p50 / p95, ms | 0.550 / 0.767 | 0.370 / 0.525 |
| Producer wall p50 / p95 / p99, ms | 11.410 / 16.103 / 19.837 | 12.060 / 16.793 / 19.617 |
| Producer compute p50, ms | 10.260 | 10.805 |
| Producer packing p50 / p95, ms | 0.782 / 0.938 | 0.808 / 0.972 |
| Command submission p50 / p95, ms | 0.883 / 1.580 | 0.972 / 1.610 |
| Async GPU p50 / p95 / p99, ms | 1.923 / 3.341 / 4.683 | 2.032 / 3.367 / 4.648 |
| Repeated fighter-root poses | 55.47% | 58.17% |
| Pose age p50 / p95 / p99, ms | 26.39 / 35.99 / 42.11 | 26.84 / 35.78 / 41.02 |
| Input-age proxy p50 / p95 / p99, ms | 30.77 / 42.70 / 45.49 | 30.34 / 41.67 / 44.34 |

Submission rate improved 2.15%; control/candidate ranges were 0.77%/1.26% of their
means. Main p95/p99 improved 6.9%/6.7%. Fresh-root rate changed **−3.99%**, within
the candidate's **20.17%** variation (control 0.56%): inconclusive. Candidate trials
were 72.16 and 58.93 changed poses/s. Fighting-only rates also diverged, 79.72 and
61.16/s; the round-result phase does not explain it away.

Only 18.0% and 9.5% of candidate displays used interior interpolation. The median
requested sample time was 6.0–7.4 ms beyond the newest available endpoint; most
displays therefore reused that endpoint. More submission capacity did not reliably
become fresh motion under the unchanged latency policy.

The first, defective adapter showed +2.33% submissions and +1.18% changed poses
(within 5.45% candidate variation). Its main p99 worsened from 9.03 to 9.42 ms.
Those samples remain saved; they are not merged with the corrected results.

## Work removed and work remaining

| Boundary | Evidence | Interpretation |
| --- | --- | --- |
| Endpoint numeric payload | Median 790,352 → 563,396 bytes, −28.7% | Full material payload remains. Counts exclude strings, metadata and the separate transferred render packet. |
| Owned entity serialization | 2,636 rigid candidates examined; median 261 changed rows sent; 784 fallback rows always sent | Most unchanged candidate rows disappear from serialization. The producer comparison scan remains. |
| Owned object decoding | Numeric rows consumed directly; median 24, p95 66 rotating/variant records reconstructed | Full owned TRS object reconstruction disappears; fallback and material decoding remain. |
| Receiver snapshots | Median 104,928 logical bytes copied; receive p50/p95 0.063/0.113 ms | Immutable chunk ownership costs work. This runs in message delivery before display publication; it is not included in `publishMs`. |
| Static storage | Producer numeric comparison cache 290,700 bytes; receiver snapshot numeric extent 331,776 bytes, 54 chunks | Changed chunks are copied and shared by bounded endpoint history. These are additional to the retained executor and ordinary object/string storage. |
| Renderer/application | 3,992 membership visits/display; roughly 2,612 owned resource checks; 808–850 fallback entities and 1,724 materials applied | Resource checks and remaining preparation were preserved. |
| GPU update | Two matrix uploads/display; candidate median 176,992 bytes, p95 239,776; CPU call p50 about 0.02 ms | No GPU upload removal. Different sampled poses change timed work distributions; deterministic oracle work is equal. |

Receiver copy measurements describe consumed packets. Superseded messages are
still applied before coalescing, but their individual receiver times are not all
retained in display telemetry. Producer cumulative counters include publications
that the display later supersedes. Byte counts are logical stores/copies, not RAM
traffic or cache misses. Worker post cloning is not separately timed in this lane;
message delivery also includes queueing.

Producer presentation remains about **7.18 ms median**: obstruction work 2.67 ms,
scene application 1.36 ms, directed fighter presentation 1.08 ms. Sampling remains
1.14 ms and packing 0.81 ms. Nested stage durations are not added. Input waiting
is 3.63 ms median, message delivery 3.45 ms, buffer waiting 0; those are not CPU
execution claims. The whole current limit spans producer execution and endpoint
availability/scheduling, with main-display tails still over the 6.06 ms budget.
The tiny retained numeric kernel is not the dominant measured cost.

The corrected artifact's separate 9-second allocation lane estimated 2,464.6 MiB
of main-thread allocations for full publication and 1,460.2 MiB for dirty
publication. At the retained publication function itself, sampled self allocation
fell from 158.4 to 6.5 MiB; the original decoder fell from 135.0 to 54.4 MiB. The
new receive/fallback sites added about 3.9/5.4 MiB. These are sampling estimates,
not exact allocation bytes. Much of the total difference also appears in existing
HUD callbacks; this single A/B profile cannot causally assign the entire reduction
to transport or claim a proportional GC/cadence gain.

After explicit collection, main heap grew 45.77→50.69 MiB in the control and
45.25→49.83 MiB in the candidate; producer heap grew 28.71→33.40 and 28.75→33.48 MiB.
Main backing storage ended at 93.02/93.06 MiB. Bounded protocol storage is established
by ownership and capacities, but the short whole-engine heap series does not
establish a plateau or long-duration stability. The initial allocation lane is
also saved separately and is not pooled with the corrected artifact.

## Correctness and limits

Focused validation: **35 tests, 998 expectations**, including coalescing, old
snapshot retention, resets, malformed sequence rejection, numeric/fallback
transitions, resource liveness and working-storage alias stability. Both affected
TypeScript projects pass. No production API or default was changed.

Sixteen untimed production-AA captures completed. All gameplay snapshots match
and all have 319 regular draws, 237 shadow draws, 64 outline draws, 42,652 triangles
and 490 instances. The first artifact's two verification blocks passed. On the
corrected artifact, JS candidate self-repeat is exact, but JS control differs at
3 pixels, worker control at 6 pixels, and worker candidate at 1 pixel; each maximum
channel difference is 1. **Both corrected verification commands fail the strict
gate.** Causes remain unassigned; no retry was used to obtain a passing pair.
The analyzer now includes failed/incomplete capture blocks instead of omitting
them when `results.json` is absent.
The two failed corrected verification commands did not save `environment.json`
under the runner's original success-only write. Their plans, per-capture geometry,
actual launch commands and cleanup receipts remain. The runner now saves launch
environment before verification so future failures retain it; no missing historical
environment was fabricated and no image block was rerun for this logging repair.

All eight timed trials passed focus checks. Both bounded awake guards released
without reported sleep. Across them, 12,450 GPU queries were valid, one remained
pending, and none were invalid/disjoint. Submissions are not physical presents;
changed fighter roots are not a complete skeletal-pose identity. The strict
6.060606 ms statistic also counts normal 6.065 ms quantized callback intervals.
No CPU/GPU durations are summed.
All eight owned browser instances were cleaned up with process identities checked.
The shared managed server remains running; its unresolved-error report is empty.
Process policy passed with 4,942 files and zero violations.

## Decision and next task

Keep dirty publication as an experimental option. Its receiver savings are real,
but the fresh-motion, exact-image and whole-engine memory-stability gates do not
support promotion or a 165 Hz gameplay claim.

**One next implementation task:** have the existing producer presentation writers
emit exact dirty revisions for stable environment transforms, then consume those
revisions in checked scene application and this publication codec. Keep liveness
checks and a compatibility fallback. This moves pruning ahead of the repeated
calculations/scans; this experiment only compressed their completed results.
The 2.67 ms obstruction stage remains an additional ceiling, with its removable
fraction not isolated by this experiment. No further campaign ran here.

## Evidence and reproduction

All inputs, raw samples, images, heap profiles, source snapshots, cleanup receipts
and configurations are in `.local/engine-perf/retained-producer-20261014/`.
`analysis.json` describes the first block; `alias-fix/analysis.json` describes the
corrected block, including failed image gates. `candidate.json`, `control.json`
and `recommended.json` preserve the distinct choices.

Initial artifact SHA256:
`dea16a3584f2f78af0544df9e0573bb8b18da0a8f50bc0d10a14e896e60b7aa2`.
Corrected artifact SHA256:
`2b3ffe0f03c4d17674e5eb16e13878f3b51b251bd783a2b9d0079a5aa6b93230`.

Use the existing managed server's returned URL and a fresh output directory:

```powershell
$bun='C:/Users/MindOverMelee/AppData/Local/npm-cache/_npx/22f2fe8d8bc13000/node_modules/bun/bin/bun.exe'
$env:PATH=(Split-Path -Parent $bun)+';'+$env:PATH
$env:PERF_NATIVE_ROOT='.local/engine-perf/retained-producer-repro'
New-Item -ItemType Directory -Force $env:PERF_NATIVE_ROOT | Out-Null
Copy-Item '.local/engine-perf/retained-producer-20261014/checkpoint.json' "$env:PERF_NATIVE_ROOT/checkpoint.json"
$env:PERF_NATIVE_ARTIFACT='.local/engine-perf/retained-producer-20261014/alias-fix/artifact/index.html'
$env:PERF_URL='http://127.0.0.1:8797/game/'
$env:PERF_SLICE_ISOLATED='1'
$env:PERF_SLICE_RESET_RACE='0'
& $bun spikes/persistent-world-worker/lab/runner/playable-native.ts timing retainedProducer
& $bun spikes/persistent-world-worker/lab/runner/analyze-native.ts $env:PERF_NATIVE_ROOT
```

The managed URL is a routing target. Opened without this runner, it serves the
ordinary game, not the frozen diagnostic artifact. A reproduction remains a
diagnostic comparison, not an acceptance claim.
