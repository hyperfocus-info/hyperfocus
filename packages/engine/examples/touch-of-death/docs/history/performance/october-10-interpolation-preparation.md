# Interpolation preparation — October 10, 2026

**Reject the lazy entity-plan candidate for the current schedule.** It removes
about 83% of generic blend visits but increases interior preparation from 3.2 to
3.6 ms median. Each live interior sample builds a fresh plan; none amortizes it
across another display sample. The full loop remains the default. 165 Hz is
unproven, with every observed submission interval exceeding 6.0606 ms.

## Profile and hypothesis

The diagnostic samples the real rooftop scene at ordinary endpoints and midpoints
using the [compact publication prototype](october-10-compact-publication.md).
Both owners match its complete gameplay and intermediate pose sequences. These
are manual correctness captures, not throughput runs. Stage marks partition wall
time and include observer/scheduling overhead; they do not measure CPU self-time.
The unchanged-entity counter adds its own comparisons. Do not substitute these
durations for the separately measured unprofiled live path.

| Interior stage, 60 samples per owner | Inline p50 | Worker-owned p50 |
| --- | ---: | ---: |
| Generic entity interpolation, including counting observer | 0.7 ms | 0.8 ms |
| Fighter pair sampling, two calls | 0.1 ms | 0.1 ms |
| Fighter reconstruction, two calls | 0.4 ms | 0.4 ms |
| Wardrobe, two calls | 0.2 ms | 0.2 ms |
| Expression, two calls | 0.1 ms | 0.1 ms |
| Runtime application, one call | 2.1 ms | 2.3 ms |
| Scene compilation, one call | 0.3 ms | 0.3 ms |
| Complete instrumented preparation | 4.0 ms | 4.3 ms |

Each interior visits all 3,391 entities; an average 2,997.18 (88.39%) have identical
endpoint TRS and discrete fields. About 130.6 quaternions require slerp; both
fighters rebuild even during held motion. This capture equips no weapon. The
frozen wardrobe implementation already caches authored/frame lookups; current
disk source alone would have suggested an optimization already in the control.
Runtime application still consumes 3,391 entity, 1,702 material and eight light
records. Resource checks remain enabled.

The candidate builds a list lazily on the first interior of each publication.
It copies equal, otherwise unwritten entities once, then runs the existing blend
loop over changed entities and all downstream writers. Every publication discards
the old plan, even if IDs/images match. Endpoint sampling is unchanged.

The initial implementation passed ordinary/restore captures but failed a new
shared-array regression: moving and held entities can share working TRS storage,
making loop order observable. The guarded implementation keeps aliased entities
and every past downstream writer in original loop order. Initial reference maps
rebind when working records change; clears release their record references.
Downstream helpers receive only their selected writer entities and must not
introduce aliases outside that set without rebinding. This is a private ownership
contract, not a complete public scene/resource mutation protocol.

## Work and live result

Four serial ABBA trials, six-second warm-up, restore, six-second measurement;
fresh visible/focused Chrome, physical RTX 4070 Laptop, rooftop seed/checkpoint,
1366×768/DPR 1, normal MSAA, full services, compact publication, nominal 60 Hz
producer, 16.67 ms delay, timer input schedule, two render buffers and bounded
wake requests. Stage profiling is disabled. Saved source comparison finds only
the controller's `planEntities` option differs; producer and renderer graphs match.
No builds/tests or other audit browsers overlap timing.

| Metric | A1 full | B1 planned | B2 planned | A2 full |
| --- | ---: | ---: | ---: | ---: |
| Display submissions/s | 98.26 | 100.31 | 100.59 | 99.81 |
| Interpolated samples | 108 | 96 | 100 | 102 |
| Changed interpolated submissions | 87 | 79 | 81 | 86 |
| Repeated comparable poses | 48.56% | 49.59% | 49.75% | 48.67% |
| Interior preparation p50 / p95 | 3.2 / 3.8 ms | 3.6 / 4.2 ms | 3.6 / 4.4 ms | 3.2 / 3.8 ms |
| Main update-to-submit p50 / p95 | 7.4 / 10.8 ms | 7.3 / 9.9 ms | 7.4 / 9.6 ms | 7.3 / 9.8 ms |
| GPU whole-render p50 | 6.24 ms | 6.16 ms | 6.18 ms | 6.18 ms |
| Pose age at submission p50 | 31.0 ms | 31.0 ms | 30.6 ms | 30.6 ms |
| Input-sample-to-submit proxy p50 | 45.3 ms | 44.6 ms | 44.5 ms | 44.4 ms |

The 196 candidate interiors perform 196 plan builds: zero live plan reuse.
They perform 114,469 generic entity blends plus 550,167 unchanged-entity copies.
Together this still populates all 33,910 output TRS components per interior, just
as the full loop does. This count excludes internal slerp and fighter rewrites.
Planning additionally scans every entity twice (identity validation and equality/
writer classification). It retains a 13,564-byte index buffer, one allocation per
owner lifetime here, plus record references and the writer set. All 352 selected
writer records remain forced; no initial transform aliases occur in these captures.
This describes logical work/storage, not cache misses or RAM-bus measurements.

| Hypothesis | Signature | Evidence / uncertainty | Decision |
| --- | --- | --- | --- |
| Many unchanged endpoints imply avoidable blends | Most generic visits disappear | About 83% fewer blends, but identical output-component writes and extra scans at this cadence | Work reduction is narrower than the blend counter suggests |
| Plan reuse improves the fresh path | Several interior samples share a plan; preparation decreases | Zero reuse; p50 increases 0.4 ms, p95 increases 0.4–0.6 ms | Reject for this schedule |
| Overall submission capacity improves reliably | Stable repeated gains, with fresher poses | Control spread 1.57%, candidate 0.28%, but only two pairs in one elapsed-time cohort; sampling work differs | Small capacity difference is inconclusive, not promotion evidence |
| Guarded skips preserve instructions | Original endpoints and intermediate poses exact | Final 968 endpoint / 484 numeric-repeat checks pass; alias regression repaired | Bounded correctness pass |
| Same-version MSAA is exact | Zero changed pixels | 13/14 repeats non-exact, at most 20 pixels / channel delta 2 | Existing repeatability gate remains open |

Candidate submit intervals p50/p95/p99/p99.9 are
`9.70/13.90/18.10/24.90 ms` and `9.80/13.20/18.00/22.00 ms`.
All intervals exceed one 165 Hz budget; 63.68% / 64.30% exceed 1.5 budgets.
Longest repeat runs are 28/26 after the first pose. Each trial observes 359 fixed
steps without interior gaps. All 2,403 GPU queries are valid; candidate p95 is
8.69/8.23 ms, excluding post/HUD/compositor. GPU and CPU overlap; do not sum them.
These are submission/pose observations, not physical presents or visible latency.
Repeated poses also include intentional held motion and hitstop.

There is no independent-session or trustworthy paired acceptance interval.
Boundary power/GPU receipts are saved, but CPU clocks/temperature, working set,
in-window contention, allocation rate and observer cost remain unmeasured. Main
heap-used boundaries (candidate 51.5→47.8 MB and 42.8→65.9 MB) do not establish
retained-memory stability. Short-run p99.9 is effectively an observed maximum.

## Correctness and reproduction

Final `guarded-short` and `guarded-restore` captures contain 484 publications
across inline/worker owners, with independent gameplay and pose oracles, 968 exact
endpoints, 484 numeric repeats, 484 once-only audio checks and 242 inline mutation
probes. All intermediate pose hashes match the compact-publication reference.
Restore/input changes cover viewport, pause/resume and reduced motion. Unit tests
also cover stationary state after prior motion, signed zero, material/visibility
changes, membership/reorder, aliases and retired writers. This does not establish
dynamic resource replacement, teleport, equipped-weapon, KO, skinning or six-arena
acceptance. The earlier unguarded artifacts remain failed for general aliasing.

Raw root: `.local/engine-perf/interpolation-preparation-20261010/roof/`.
`profile-short` / `display-profile` own diagnostic stage evidence;
`planned-*` / `blend-*` retain the unguarded investigation;
`guarded-*` artifacts/captures and `guarded-abba-plan.json` own final comparisons.
Source graphs, complete display rows, power/wake/cleanup receipts, images and
`source-comparison.json` are retained. `image-plan.json` contains the 14 final
same-version comparisons. Its old tolerance-based exit status is not exact parity.

Use the [presentation README](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment)
workflow with `PERF_DISPLAY_TRANSPORT=packed` and `PERF_DISPLAY_ENTITIES=full`
or `planned`. Set `PERF_DISPLAY_PROFILE=1` only for the separate allocating
diagnostic; run `display-results.ts` before `preparation-profile-results.ts`.
Live trials use profiling off and artifacts
`guarded-full,guarded-planned,guarded-planned,guarded-full` with four identical
`worker-2-fresh` / `timer` settings. Use new output prefixes for new sessions.

All 22 cleanup receipts are empty (some refer to the same comparison browser);
all 14 wake requests released without expiry or suspected sleep. Keep the shared
managed server running. All 34 focused tests / 494 assertions, focused TypeScript
and process policy pass; managed-server errors are empty.
Next test input scheduling and display delay independently
on the full-loop compact baseline. Further preparation work must remove complete
scans/copies or application work; fewer blend calls alone are insufficient.
