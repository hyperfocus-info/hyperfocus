# October 9: incremental obstruction-query prototype

Historical cross-version pixel gate below. The owner's revised visual contract
permits those differences; the [October 10 awake re-screen](october-10-query-cache-rescreen.md)
records current correctness, work counts and inconclusive rooftop timing.

**The bounded query cache avoids repeated work and preserves state/packets in the
tested replays, but the longer production-AA image gate fails. It is not promoted.** The candidate
memoizes one pure geometric predicate; preparation, traversal, cutaway fades,
material application, rendering and the fixed simulation continue normally.
The [preparation profile](october-9-preparation-attribution.md) motivates this
narrow experiment. It is not a general unchanged-tick presentation cache.

## Inputs, ownership and invalidation

`spikes/persistent-world-worker/incremental/target-cache.ts` receives the existing
`anyTargetIntersects` implementation as a function. Two versions cover the exact
fighter-target prefix and the complete target list including pickups. Every
presentation compares and copies target coordinates into a bounded reusable pool.
Each query checks eye position, box position/quaternion/scale, padding, target
count/domain and version against detached double-precision signatures.

| Writer or event | Why reuse remains valid or is rejected |
| --- | --- |
| Animation, fighter motion, weapons/pickups, target membership | Changed final target coordinates/counts advance the appropriate version. |
| Camera/aspect, teleport, occluder transform | Final eye and box components are checked on every query. |
| Restore/reset or ID reuse | Identity selects storage only; all geometric inputs still determine validity. Tests include changed values returning to a prior state. |
| Entity/material membership or resource loads | Existing binding, visibility, broadphase, material/fade and resource logic still executes. Only the pure predicate is cached. New geometry supplied to it is checked. Resource loading is not generally optimized or fully exercised by this campaign. |
| Nonfinite data, unsupported count or capacity overflow | Use the original predicate; do not grow the cache. |

The private build retains caches in a WeakMap keyed by the existing immutable
authored-material map. Only authored identities enter it; transient entities keep
the ordinary query. Capacity is that map's initial size, with at most 2,048 target
slots. Typed signature storage costs 123 bytes per configured box; target tuples,
map entries and JavaScript overhead are additional and are not measured by that
number. Worlds own their caches through the weak key. No host/worker shared
mutation or new transport is introduced.

The cache does not skip the earlier obstruction broadphase, target construction,
camera clearance, material fades, follower traversal or scene application. Query
call counts therefore quantify avoided **batches**, not individual target rays or
all obstruction work. It still checks 14 geometric scalar inputs per eligible
query in the worst case and all target coordinates every presentation.

## Correctness evidence

Frozen control and candidate rebuilds use the same provenance-v2 graph and arena
HTML. Private source patches are saved beside their manifests; no production
engine import enables the cache. Artifacts and raw data live in
`.local/engine-perf/incremental-20261009/`.

Each short replay has 661 samples per owner at a requested 165 Hz and 11 events
covering restore, viewport/aspect, pause and reduced motion. Across depot and
rooftop, 2,644 independent full-state checks and 2,644 independent pose checks pass;
every packet/presentation sequence matches. Five normal-AA checkpoints per arena
pass the existing image gate: depot maximum 2/255 across six changed pixels,
rooftop maximum 1/255 across at most five. These are specific passing cohorts,
not a resolution of [normal-AA redraw variation](october-9-aa-command-capture.md).

Six focused tests, 684 assertions, additionally exercise every signature component,
fighter/pickup versions, in-place mutation, target membership, recycled IDs,
teleport/restore, replacement objects, detached target snapshots, overflow and
1,000 resets with bounded retained storage. The 300-frame mixed-input test compares
against the original engine predicate. These tests cover the pure-query seam,
not full resource/context recovery, skinned crowds or six-arena acceptance.

The longer 20-second sequence runs 3,301 samples per owner per arena, including
fighting and round-result phases. All 13,204 full-state checks and independent
pose checks pass, as do the complete packet/presentation sequence comparisons.
Normal-AA images fail at rooftop frames 1320, 2310, 2640, 2970 and 3300 (maximum
7/255, at most 30 changed pixels), and depot frame 0 (maximum 8/255 across 26
pixels). The existing threshold is unchanged. These failures remain failures
even though the separate identical-packet redraw study also finds AA variation.
Depot's failing frame zero reports 215 misses and no cache hits; cached-result
reuse cannot explain that frame's pixel difference.

| Long replay, excluding frame zero | Depot | Rooftop |
| --- | ---: | ---: |
| Eligible query calls | 796,957 | 93,895 |
| Avoided calls | 563,532 (70.71%) | 65,900 (70.18%) |
| Zero-step avoided calls | 507,374 (100%) | 59,858 (100%) |
| Stepped-sample hit rate | 19.39% | 17.75% |
| Target-scalar comparisons | 2,803,935 | 2,856,210 |

No counter reset or bypass occurs in either long replay. The work-count result
is deterministic for these input sequences; it is not a statistical timing gain.
Full-loop acceptance timing is deferred while production-AA failures are being
diagnosed. Tracking time, actual allocated/retained heap and the complete working
set are still unmeasured. A high hit rate alone does not prove a worthwhile cache.

The short rooftop candidate avoids 38,195 of 53,111 query calls (71.92%): 99.29%
on zero-step samples and 21.50% on stepped samples. It performs 550,440 target-scalar
comparisons. Counts exclude frame zero and use adjacent monotonic counter deltas.
Manual stage clocks include hashing/readback interference and cannot establish
end-to-end speedup; inline-versus-worker timing also changes thread placement.

## Reproduction and acceptance

`control-patches.json` and `target-cache-patches.json` select the sole algorithm
change plus identical output-counter fields. Build both with `build.ts`,
`PERF_REBUILD_RUNTIME=1` and explicit matching `PERF_FROZEN_SOURCES`,
`PERF_BASE_HTML`, `PERF_SOURCE_PATCHES` and `PERF_ROOT`. Keep their saved source
graphs and manifests with every result.

For manual parity use `verify.ts`, `PERF_ARTIFACTS=<control>,<candidate>`, the
matching `PERF_WORKLOAD`, `PERF_CAPTURE_HZ=165`, `PERF_PROVENANCE=1`,
`PERF_COUNT_VISUAL_CHANGES=1`, `PERF_CAPTURE_DETAILS=1`, `PERF_HEADLESS=0` and
`PERF_EXPECT_RENDERER=RTX 4070`. The short sequence uses checkpoints
`0,60,165,330,660` and the provenance-v2 `invalidation-schedule.json`.
The long sequence omits that schedule and uses `0,330,...,3300`.
Run `image-parity.ts` with `PERF_PIXEL_GATE=1` and the same prefix.
`incremental/report.ts` summarizes raw counters from `PERF_REPORT` prefixes;
it rejects missing rows, mismatched counter totals and counter resets.

Promotion still requires stable warmed same-worker paired full-loop improvement,
complete normal-AA parity, lifecycle/resource coverage and all six arenas plus
stress scenes. The [control study](october-9-cadence-and-controls.md) has not yet
established stable controls. The default playable and library contracts remain
unchanged; this is an implementation experiment, not the final architecture.

Wave verification: 19 focused tests / 770 assertions, focused TypeScript checks,
source-structure and process-policy checks pass. All 28 recorded owned browser
roots have empty cleanup receipts; the managed server reports no errors. The
repository-wide code-style gate still fails on existing dirty-tree assertion
debt and an unrelated physics-test numeric literal; no baseline was raised.
`verification.json` in this evidence root records exact receipts and source hashes.
