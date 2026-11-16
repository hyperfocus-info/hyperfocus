# October 8: CCD budget correction and endpoint spike

The engine now rejects conservatively disjoint swept pairs before charging the
finite CCD contact-test budget. Previously distant scenery consumed that budget
and prevented later ragdoll bodies from testing walls/floors. This is a demonstrated
engine tunneling defect; it does not establish the cause of every historical
player-clipping report. The collision correction is promoted to the unconditional
engine path. The user requested removing the rejected endpoint shortcut after
the comparisons below. Its patches, runner, probe and generated builds were moved
out of active experiment paths into `retired-endpoint/` after policy review blocked
deletion. Benchmark records remain as historical evidence. Worker ownership
itself remains opt-in.

## Correctness reference

Freeze the preceding campaign's final diagnostic source graph and its six seeded
level-nine AI-versus-AI checkpoints. The reference changes only the KO world's
budget to capacity times twenty potential continuous corpse bodies. It can visit
all eligible pairs. A fresh original-budget control reproduces the earlier fight
paths and differs from the reference in every seed's final state. Matching that
starved control would preserve the defect.

The correction runs 1,800 fixed steps per seed, twice independently. All 10,800
per-tick serialized main-physics, KO-physics and combat comparisons match the
adequate reference; all six complete final snapshots match. Both repeats agree.
There are seven natural KOs and six recoveries, with eighteen active articulation
constraints and no CCD overflow in either physics world.

| Workload | Maximum admitted KO CCD pairs per step | KO overflows |
| --- | ---: | ---: |
| Construction 0 | 137 | 0 |
| Market 713 | 148 | 0 |
| Residential 930 | 106 | 0 |
| Depot 2026 | 97 | 0 |
| Utility 4294967295 | 86 | 0 |
| Compact rooftop 714 | 111 | 0 |

The reference visited up to 4,590 eligible pairs per step (roof: 4,580). The new
admission counts are a change in budget semantics, **not that many eliminated
contact tests or a measured speedup**. Both paths already reject distant bounds.
Enumeration still scans capacity and preserves both endpoint-normalization calls.
Complete coverage can cost more than the old truncated search; that is why the
performance control also uses the sufficient budget.

A separate adversarial fixture inserts 458 distant eligible colliders before a
thin floor/wall and twenty continuous bodies. With the original budget, twelve
later bodies cross the barrier. Candidate and adequate reference stop all twenty
and have equal physical-state hashes, in float32 and float64. Candidate visits
9,180 eligible pairs but admits twenty detailed pairs without overflow. Unit tests
also cover ten-body/default budgets, reciprocal filters, triggers, translating and
rotating targets, legacy checkpoint restore and genuine nearby-budget exhaustion.
Finite local budgets can still overflow; this change does not promise arbitrary
dense-world collision completeness.

## Diagnostics and separate optimization

The DOM-free gameplay API exposes detached counters for runtime and KO physics,
following replacement worlds after reset/restore. The worker's diagnostic rows
and campaign summaries now retain the omitted KO constraints and CCD counters.
Rows read the latest step; zero-step presentations can repeat them. Do not sum
these samples as if every presentation ran a physics step. API lifetime is owned
by [portable runtime](../../../../../docs/portable-runtime-3d.md); counter and
legacy-checkpoint semantics by [rigid physics](../../../../../docs/rigid-3d.md).

The rejected endpoint-normalization patch avoided restoring the moving body's same
saved quaternion/AABB on every distant reject. The first reject still restores it;
near-pair paths restore it before continuing. Other-body normalization stays intact
because repeated floating-point normalization can change its state. No cache
survives the individual sweep. With R rejected pairs across K bodies that encounter
a rejection, this removes R minus K redundant own-body restores.

That spike passes 96 exact typed-checkpoint comparisons, including signed zero,
nonunit restored rotations, interleaved near/far pairs, static/kinematic/continuous
dynamic targets, AABB queries and checkpoint replay. Six seeded runs also match the
corrected control's complete trajectories/counters and final snapshots, and the
adequate reference's physical hashes. It was removed because the windowed
comparison below did not establish a clear full-loop gain.

## Windowed verification and remaining gates

Frozen reference, corrected and endpoint browser artifacts were tested in depot
and rooftop. Each comparison has a separate A/B/B/A: twelve seconds warmup,
checkpoint reset, thirty seconds measurement, full services, two buffers, paced
fresh-input scheduling, VSync off, 1366×768/DPR 1 and the RTX 4070 on AC. Measure
fighting and round-result FPS, p95/p99 intervals, applied input age, dropped time
and phase coverage. Require stable controls and roughly a five-percent full-loop
win for the optional optimization, separately from the collision correctness fix.

All sixteen trials passed focus, reset, source/workload, row-capacity, runtime-error
and cleanup checks. The 39,970 acquired frames contain fifteen intervals at least
33 ms, none at least 100 ms, and a 72.30 ms maximum. No simulation time was dropped.
All local control/candidate repeat groups meet the five-percent stability bound.
Values are medians of complete per-trial fighting statistics; FPS counts fresh
CPU submissions, not physical display scanout. The measured environment remains
i9-13900HX, RTX 4070 Laptop through ANGLE/D3D11, Chrome 154.0.8037.58, AC power and
battery saver off. Existing user workloads remain active; CPU thermals and OEM
power policy are not continuously observed.

| Comparison / arena | Combat FPS, control → candidate | Change | Interval p95 / p99, control → candidate |
| --- | ---: | ---: | --- |
| Adequate reference → corrected / depot | 83.79 → 85.23 | +1.72% | 16.15 / 19.60 → 15.60 / 18.70 ms |
| Adequate reference → corrected / rooftop | 90.75 → 90.60 | −0.17% | 14.20 / 17.65 → 14.25 / 17.10 ms |
| Corrected → endpoint shortcut / depot | 81.62 → 80.91 | −0.87% | 17.40 / 21.85 → 17.80 / 22.30 ms |
| Corrected → endpoint shortcut / rooftop | 89.42 → 90.08 | +0.73% | 15.10 / 18.70 → 14.70 / 19.10 ms |

The shortcut's round-result FPS rises 70.11→72.13 in depot and 73.47→75.05 on
rooftop; KO p99 improves 21.05→19.90 and 21.25→20.45 ms. These modest phase-specific
changes do not establish the required general win. Applied-input-age p95 stays
within 0.20 ms of each local control. These AI-fight software ages do not measure
human key-to-photon latency. Promote the collision correctness fix and remove the
endpoint shortcut. No native-resolution promotion cohort was run for an
optimization that failed the initial full-loop gate.

The same corrected depot artifact measures 85.23 FPS in the first block and 81.62
in the second, despite stable local repeats. That between-block drift reinforces
the need for local controls; do not pool them to claim a small win. Its thermal,
scheduling or background-work cause is not isolated by these runs.

Windowed fixed-step verification compares the adequate inline reference with the
corrected worker: 2,882 standalone state-oracle checks, matching full state,
numeric packets and compact presentation, plus six pixel-exact AA-off comparisons
through KO and recovery. A second comparison of corrected inline versus endpoint
worker passes the same state/packet checks and all six normal-quality images under
the unchanged pixel gate: at most one changed pixel and a maximum channel delta
of two. This does not eliminate the preceding campaign's rare
MSAA repeatability finding or alter normal graphics settings.

A separate instrumented depot run validates the delivered diagnostic path without
contributing to acceptance FPS: 2,388 rows, including 491 with an active KO rig,
expose 469 bodies, eighteen constraints, up to 4,590 eligible CCD pairs and 97
admitted pairs. Both physics owners report zero overflow. Every row satisfies
eligible equals rejected plus admitted; no accounting mismatch occurs. This is
latest-step telemetry, not a sum across presentations.

Before the user dismissed Windows Search, four parity startups were rejected.
Native evidence
shows one correctly selected visible Chrome window on the accessible Default
desktop. Search retained foreground; attaching to its thread failed with access
denied, and both foreground requests failed. Dismissing Search resolved activation;
the resumed tests above ran in focused visible windows. Additional diagnostics
retain that failure evidence without weakening the gate. No headless timing was
substituted.

Promotion rechecks pass: 72 focused tests, test typechecking, and all four thin
floor/wall cases through the built public physics entry. Its default budget stops
all twenty bodies in both precisions with zero overflow. `promotion-proof.json`
binds the packaged bundle hash to that check and confirms the active source is
identical to the measured collision correction, without the rejected shortcut.

Focused physics, ragdoll, gameplay rollback and diagnostic-lifetime tests pass;
engine source/test and spike typechecks, package build, external consumer, source
structure and process-policy checks pass. Bundle budgets remain open without cap
changes: rigid native graph +172 raw/+59 gzip/+67 Brotli bytes; physical-performance
native +172/+60/+26; project-runtime native +2,617/+531/+493; aggregate runtime
+5,707/+1,732/+1,547. Project-runtime and aggregate include prior overages.

Retained collision graphs/patches, benchmark records, hashes and startup logs live in
`.local/engine-perf/worker-ccd-20261008/`. The reusable
[physics runner](../../../../../../../spikes/persistent-world-worker/physics/README.md)
owns collision reproduction. `window-abba.ps1` reruns the retained comparison;
the rejected shortcut's runner and executable artifacts are archived outside the
active paths.
The shared managed playable was not rebuilt or replaced.
