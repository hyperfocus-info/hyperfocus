# Producer entity application — October 11, 2026

**Keep `entityApplication=original`.** The retained-input implementation removes
88–90% of full producer transform comparisons, but adds change detection and
storage. Rooftop fresh motion regressed 13.4%; depot's apparent 3.4% gain is
drift-inconclusive. This is a completed, rejected promotion candidate, retained
as an experimental diagnostic control. No combination or follow-up timings ran.

This closes the next task from the [producer audit](touch-of-death-producer-audit.md).
It does not establish a Wasm/SIMD or additional-worker opportunity: the tested
redundant work was input conversion/validation, and eliminating most of it did
not improve the complete loop.

## Configuration and scope

One artifact contains both implementations:
`575a1edd9eff902c5e8c745ab17436cc2003014450161fa71609b5e78eb1286f`.
[Identity and source hashes](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/artifact.json),
[raw trials](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/entity-application/summary.json),
[derived analysis](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/analysis.json)
and [validation receipts](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/validation.json)
are retained. The artifact and frozen sources are archived by hash.

A is the existing **compact publication + working-frame reuse** diagnostic
control, original materials/renderer/rays, all gameplay enabled. B changes only
`entityApplication` to `retained-input`. This A is not the original full-object
lab baseline, and today's rates cannot be compared causally with older sessions.
No simulation, latency, AA, visual-workload or browser-limit setting changed.

Eight serial visible/focused trials: A/B/B/A in rooftop, then depot. Each warms
5 seconds, restores the seeded checkpoint and presentation history, then measures
10 seconds. Fixed camera, 1366×768, DPR 1.0000000298, resolution 1, MSAA 4,
Chrome 154.0.8037.58, RTX 4070 Laptop / ANGLE D3D11, AC High performance.
The inherited launch profile requests no VSync/frame-limit override; actual
command lines and before/after power receipts are saved. Thermal state and
other user workload are unrecorded. No builds, tests, images or profiles ran
during throughput measurement.

## Measured result

Values average the two trial statistics, not pooled percentiles. All timing
values are milliseconds. Changed poses are measured independently of submissions
and fixed simulation steps.

| Arena / strategy | Steps/s | Changed poses/s | Submissions/s | Interval p50 / p95 / p99 | >6.06 ms | Repeated poses | Pose age p50 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Rooftop original | 59.86 | 52.97 | 116.45 | 8.40 / 11.25 / 13.75 | 100% | 54.29% | 29.60 |
| Rooftop retained | 59.84 | 45.86 | 110.23 | 8.90 / 11.85 / 15.35 | 100% | 58.23% | 30.55 |
| Depot original | 59.72 | 42.19 | 116.45 | 8.35 / 11.30 / 14.45 | 99.96% | 63.59% | 30.25 |
| Depot retained | 59.77 | 43.64 | 114.41 | 8.55 / 11.40 / 13.70 | 99.96% | 61.70% | 29.80 |

| Stage, p50 unless stated | Rooftop A → B | Depot A → B |
| --- | --- | --- |
| Producer compute | 10.30 → 11.10 | 12.00 → 11.30 |
| Fixed simulation | 1.85 → 1.95 | 2.30 → 2.15 |
| Producer presentation | 5.65 → 5.95 | 7.05 → 6.50 |
| Apply frame, including materials/rigs | 2.35 → 2.65 | 2.55 → 2.45 |
| Compile only | 0.30 → 0.30 | 0.30 → 0.30 |
| Endpoint packing | 0.55 → 0.60 | 0.70 → 0.60 |
| Metadata, including packing | 0.85 → 0.95 | 1.00 → 0.90 |
| Worker post call | 0.60 → 0.60 | 0.60 → 0.60 |
| Main publication, publication rows only | 0.70 → 0.80 | 0.75 → 0.70 |
| Decode, included in main publication | 0.55 → 0.60 | 0.55 → 0.55 |
| Display preparation | 2.60 → 2.80 | 2.70 → 2.70 |
| GL submission | 2.20 → 2.30 | 1.95 → 1.95 |
| Asynchronous GPU p50 / p95 / p99 | 4.79 / 6.19 / 7.02 → 4.96 / 6.84 / 7.94 | 3.89 / 5.68 / 6.71 → 3.99 / 5.72 / 6.71 |
| Input wait | 5.40 → 5.75 | 4.45 → 4.90 |
| Buffer wait | 0.00 → 0.05 | 0.00 → 0.10 |
| Input-age proxy | 31.95 → 32.55 | 31.65 → 31.50 |

Rooftop changed-pose effect −13.44%, control spread 1.35%, candidate spread
11.71%: both B trials were slower than both controls. Apply time increased
12.77%, versus 4.26% control and 11.32% candidate spread. This is evidence against
enabling this strategy, not a precise portable regression estimate.

Depot changed-pose effect +3.43% is smaller than 8.69% control spread and 12.95%
candidate spread. Apply's −3.92% equals control variation and is inconclusive.
Producer compute fell 5.83%, but most of that change was in presentation upstream
of the modified applicator; this block does not attribute it to transform reuse.
No retries were used to resolve variation.

CPU stages nest and CPU/GPU execution overlaps; do not add these durations.
Compute excludes subsequent metadata; metadata includes packing. Waiting is not
CPU execution. Submissions are not proven physical presents. Interior samples
occurred in all eight trials, unlike the earlier full-object campaign, but useful
motion remains far below 165 Hz.

## Actual work and ownership

[Engine implementation](../../../src/project/3d/runtime/entity-transforms.ts)
selects its application function once at runtime creation. The runtime owns exact
Float64 input values, packed transform results and input revision numbers. Every
incoming entity is still checked for changes; no mutable frame is trusted by
identity. Unchanged inputs skip finite checks, Float32 conversion and the original
quaternion comparison, then compare live packed bits. Changed live storage takes
the original repair path. Instance/mesh/material checks execute on every entity.

| Per producer publication, mean | Rooftop A → B | Depot A → B |
| --- | ---: | ---: |
| Entity visits | 3,391 → 3,391 | 3,389 → 3,389 |
| Full transform comparisons | 3,391 → 390.65 (−88.48%) | 3,389 → 340.30 (−89.96%) |
| Additional input revision scans | 0 → 3,391 | 0 → 3,389 |
| Retained-path live transform checks | 0 → 3,000.35 | 0 → 3,048.71 |
| Material input comparisons | 1,702 → 1,702 | 1,717 → 1,717 |
| Logical publication bytes | 1,505,196 → unchanged | 1,510,816 → unchanged |
| Additional persistent typed storage | 0 → 434,048 bytes | 0 → 433,792 bytes |

The zero in A's retained-path counter does not mean A omits live checks: they
remain inside its full transform comparisons. All 4,356 timed publications
satisfy the counter identities. Depot required nine live-transform repairs in each B trial;
the cache did not conceal those writes. Three fixed typed buffers add 128 bytes
per entity; this is incremental storage, not total heap. Heap boundary samples
are retained but cannot establish an allocation rate or retained-memory delta.

Both sides retain two endpoints and one interpolation destination, with zero
working-frame or retained-object publication clones. No draw/upload/transport
work was removed. Timed average draws differ slightly with sampled poses; paired
untimed inputs preserve packets, transform writes, queries and resource checks.
Logical bytes are not measured RAM traffic or cache misses.

## Correctness, failures and remaining limits

45 focused unit/runtime/registry tests passed, with 1,539 assertions. They cover
reorder/partial records, normalized rotations, signed zero, invalid inputs,
external storage edits, resource destruction, movement and rollback. These are
separate from eight untimed browser executions, 22 paired timestamps and four
same-version image-repeat pairs. Frames, packets and seeded state matched.
Both candidate image pairs and rooftop control repeated exactly; depot control
differed at 21 pixels, maximum channel delta 2. The known MSAA issue remains;
candidate repeats passing here do not establish its repair.

The initial verifier incorrectly compared aggregate display counts on the first
capture (six versus eight applications). Its corrected per-application check
was run against saved receipts, without recapturing. Initial and corrected code
and logs remain available. No failed performance trial was discarded: all eight
completed valid, all 9,138 GPU queries valid, zero disjoint/invalid queries,
focus checks passed, both bounded awake guards released without sleep/expiry.
All six owned browser cleanup receipts show no surviving owned processes.

Typecheck, package build and installed-package consumer passed. Bundle budgets
fail: this change adds 2,332 raw / 769 gzip / 769 Brotli bytes to the runtime entry
and aggregate relative to the preceding saved package. The complete runtime
distribution is now 12,810 raw bytes over its unchanged ceiling. This failure
was not waived. No inline/packet-mode timing, long-run acceptance or all-control
suite was repeated. The new control uses a world reset, preserving its worker;
the original setting remains the engine default.

## Bottlenecks and next task

| Rank | Current evidence using A | Confidence |
| --- | --- | --- |
| 1. Producer presentation/application CPU | 10.30/12.00-ms compute; presentation 5.65/7.05 ms, apply 2.35/2.55 ms. Obstruction presentation alone 1.50/2.45 ms. Post-hoc transform revisions did not improve the loop. | High observed cost; exact removable share remains unknown. |
| 2. Display preparation and scheduling | 2.60/2.70-ms preparation, 54–64% repeated poses, 4.45–5.40-ms input waits; publications only 53.78–55.62/s. | High observations; waiting does not establish CPU work or a scheduler-only cause. |
| 3. GPU tails | GPU p99 7.02/6.71 ms, beyond 6.06 ms. | Valid asynchronous queries; this test did not isolate individual passes. |

Useful 165 Hz motion is constrained by producer CPU work, with display cadence
and GPU tails also limiting it. Transport is much smaller after compact+reuse;
it is not the dominant measured stage in this configuration. Required work still
includes changing gameplay/poses, live validation and drawing. This candidate
removes redundant conversions, but re-detecting unchanged input is not free.
**No newly tested configuration improved fresh motion defensibly across both arenas.**

**One next task:** make producer presentation writers issue trustworthy transform
change lists, starting with unchanged environment transforms, so unchanged inputs
need not be rediscovered by a full scan. Preserve a separate live-resource check
and measure the writer bookkeeping itself. Do not add another post-hoc cache or
assume this validates a Wasm/SoA/multithread rewrite.

## Use and reproduce

The [working lab](http://127.0.0.1:8807/lab/?arena=rooftop) uses the existing panel
and command API. [recommended.json](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/recommended.json)
selects compact+reuse with original entity application for diagnostic work;
[candidate.json](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/candidate.json)
selects the measured experiment. Neither promotes compact transport to normal
gameplay. The original full-object baseline remains available. Configured URLs
are saved in [delivery.json](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/delivery.json);
[option metadata](../../../../../.local/engine-perf/touch-of-death-lab/entity-application/option-inventory.json)
and historical exclusions are saved alongside the results.

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase entity-application --output .local/engine-perf/touch-of-death-lab/entity-application-repro
```

This runs one eight-trial block against the existing artifact. No further phase
starts automatically.
