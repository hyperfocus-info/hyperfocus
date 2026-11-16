# Bounded performance shape audit — October 16, 2026

**Complete: 24 timed trials; no production promotion or 165-Hz result.** The authorized window is
07:32–08:32 UTC (03:32–04:32 EDT), with a measurement cutoff and cleanup reserve.
This audit owns the outcome of that one-hour investigation; it does not authorize
another campaign, production settings change or deployment.

The existing native lab now exposes several previously implemented strategies
to the canonical playable project. A separate cloud CPU investigation completed
baseline evidence but stopped before producing candidate results. Local and
cloud source identities, correctness checks and timings remain separate.

## Scope and artifact

The frozen local artifact is
[`artifact/index.html`](../../../../../.local/engine-perf/swarm-shape-20261016/artifact/index.html),
SHA256 `fc5257caedaf2644ef92d6577745a70852f5c65b5359e65e2b419e884a889e7a`.
Its source graph SHA256 is
`6f36f168d447dba9de4bcf82baddfa932f25521b540f17c5616aae9844c140fa`;
the [manifest](../../../../../.local/engine-perf/swarm-shape-20261016/artifact/manifest.json)
and frozen source map retain implementation identity. The manifest's abbreviated
choice list omits several newly wired options; the source graph and inventory
below are authoritative.

The shared registry contains **80 controls**. This native artifact exposes
**16 configurable keys**; **64 are not independently exposed here**, including
existing arena-only strategies and fixed native policies. This is not an
integration or performance test of every experiment. The complete
[option/compatibility inventory](../../../../../.local/engine-perf/swarm-shape-20261016/inventory.json)
records names, values, sources, statuses, dependencies and unavailable controls.

The executor/publication/rig/layout slice has **34 valid contract points**:
six executors × full publication × two rig choices × two layouts, plus five
retained executors × dirty publication × two rig choices × original layout.
That is a compatibility count, not 34 completed tests or the full configuration
product. Dirty publication requires a retained consumer; certified working layout
requires full publication. Shared workers count as workers only when actual
cross-origin isolation and executor selection are observed.

Six serial A/B/B/A contrasts were selected from sixteen planned contrasts:

| Contrast | Control | Candidate |
| --- | --- | --- |
| `credit` | Retained JS/full publication | Existing endpoint-credit publication |
| `rig` | Retained JS/full publication | Existing prepared display rig |
| `obstructions` | Retained JS/full publication | Planned follower traversal + slot material aliases |
| `combined` | Retained JS/full publication | All three preceding candidates |
| `rays-wasm` | Combined + partitioned axis-aligned JS rays | Combined + partitioned scalar Wasm SoA rays |
| `executor-simd` | Combined + scalar Wasm retained executor | Combined + SIMD retained executor |

The first four share the **retained JS/full baseline**, not the original renderer.
The last two have matched combined controls. The selected combination is a
diagnostic interaction test; individual improvements are not assumed to add.

Ten contrasts were deferred for the time bound: `credit-rig`,
`credit-obstructions`, `rig-obstructions`, `dirty`, `certified`, `rays-js`,
`rays-simd`, `executor-wasm`, `executor-worker`, `executor-pool`. Observed fresh
world startup was about 41 seconds. The
[amendment](../../../../../.local/engine-perf/swarm-shape-20261016/matrix-amendment.json)
preserves complete resets and trial duration instead of shortening them. Deferred
contrasts are not performance failures; any launch-only failure without captures
or samples is not a completed experiment.

## Implemented changes and correctness evidence

These are integrations of existing strategies, plus one concrete correctness
repair. Resource liveness and direct live-storage repair remain active.

| Change | Actual work affected | Work that remains |
| --- | --- | --- |
| Endpoint credit | Omits redundant producer command compilation, full renderer-packet writes/reads and compiled-pose observation; writes a 64-byte credit | Full producer application, numeric/resource validation, compact display endpoint, full-capacity transfer pool, display compilation and drawing |
| Prepared display rig | Shares a synchronous rig lookup and repeated Euler preparation during interior poses | IK, required part writes, fresh output arrays, source lookups, application and rendering |
| Planned follower traversal and slot aliases | Reuses checked topology plans instead of rebuilding dependency/alias structures | Current fade/material values, queries, topology validation, gameplay and scene application |
| Certified working layout, available but deferred | Replaces alias Maps with revocable decoder layout checks for full publication | Binding/reference checks, restoration, interpolation, application and resource validation; dirty numeric layout is explicitly rejected |
| Retained light-packer repair | Resets light counters before packing current lights | The canonical live-light packer runs every display |

The light bug was independently reproduced: the retained compiler copied an
already populated light prefix and called an append-style packer without resetting
its counters. One active light became two; subsequent displays could accumulate
duplicate/stale rows. The new test uses the real canonical packer and checks
changed light values, enable/disable, adding a light, stable commands and a
membership rebuild. It failed before the fix and passes afterward. This does
**not** establish the cause of earlier image-repeat failures.

Local evidence is recorded separately:

- [Owner/constructor validation](../../../../../.local/engine-perf/swarm-shape-20261016/display-validation.json):
  12 passing tests, 96 expectations after the reproduced light failure; retained
  TypeScript check passed.
- [Adapter tests](../../../../../.local/engine-perf/swarm-shape-20261016/adapter-tests.log):
  seven passing tests, 13,015 expectations; includes 144 obstruction fixture
  transitions across checked backends. These are source-level fixtures, not
  browser transitions or timed trials.
- [Final configuration/qualifier checks](../../../../../.local/engine-perf/swarm-shape-20261016/config-final-tests.log):
  two passing tests, 12 expectations. These suites overlap; do not add their
  test counts as independent coverage.

Native configuration now records implemented fixed behavior: compact endpoints,
reused working storage, display pipeline, three transfer buffers and the actual
input/pipeline policy. Unsupported settings fail explicitly. Early untimed
receipts reported registry defaults for two buffers/paced scheduling; corrected
metadata was applied before timing. Execution already used the fixed native
settings. The worker primitive-lookup strategy remains selectable, but its
detailed counters are not propagated into native worker telemetry; this matrix
does not vary it.

## Local measurements and image gates

Each selected contrast uses the same seeded street checkpoint, production AA,
maximized viewport/DPR, resolution, camera, 60 Hz producer and 16.667 ms
interpolation delay. Trials run visibly and focused, serially, with **5 seconds
warmup and 10 seconds measurement**. Images and correctness checks run outside
throughput. The owned browser/awake guard and existing managed server retain
cleanup ownership. CPU submissions are not proven physical presents, and the
changed fighter-root position proxy is not complete animation freshness.

Exact-image failures remain promotion failures. Early completed pairs already
showed a failing `credit` control self-pair and a failing `rig` candidate
self-pair. Passing gameplay snapshots or equal draw counts do not waive that
gate. The qualifier distinguishes attributed optional local-service 404s from
game failures and retains them in receipts; it does not suppress arbitrary
browser errors. Untimed command/camera hashes narrow CPU-output versus graphics
state questions but do not establish equality of all GPU resources or post state.

**Completed: six ABBA blocks / 24 timed trials, plus 24 untimed captures.** All timed trial invalid flags are false; 35,333 submission samples include 35,323 valid GPU-query samples and ten pending, with no observed disjoint/invalid status. All six timed wake guards passed/released and owned browsers have identity-verified cleanup with no remaining processes/windows. The separate untimed browsers also have cleanup receipts. [Independent review](../../../../../.local/engine-perf/swarm-shape-20261016/final-independent-review.json) verifies the small trial summaries and ownership evidence.

The observed browser was Chrome 155.0.8059.80 on NVIDIA RTX 4070 Laptop GPU, native maximized 1280 x 665 CSS at DPR 1.5, drawing buffer 1920 x 998, production MSAA. Power boundaries show AC, high-performance scheme, battery saver off and 165-Hz display mode; they do not prove continuous clocks or physical presentation. The actual checkpoint is sceneId `level-3d`, tick 3, motionSeed 1084326641. The runner's `seed:1337` identifies boot RNG seeding, not generation of this saved checkpoint. Each trial records its checkpoint hash.

| Contrast | Changed roots/s A to B | Effect | A / B variation | Submissions/s A to B | Disposition |
| --- | ---: | ---: | ---: | ---: | --- |
| credit | 63.06 to 68.47 | 8.58% | 15.03% / 3.32% | 149.58 to 150.12 | Drift-inconclusive |
| rig | 63.07 to 60.33 | -4.34% | 1.84% / 6.61% | 148.27 to 139.95 | Drift-inconclusive |
| obstructions | 63.52 to 65.73 | 3.48% | 3.42% / 1.59% | 148.02 to 147.20 | Marginal; gain barely exceeds control range |
| combined | 62.14 to 70.90 | 14.10% | 12.80% / 5.23% | 148.50 to 148.74 | Promising; uncertain magnitude, no cadence gain |
| rays-wasm | 74.74 to 66.54 | -10.97% | 0.17% / 1.60% | 146.78 to 141.98 | Adverse result for this implementation |
| executor-simd | 68.58 to 68.90 | 0.46% | 5.91% / 7.92% | 147.06 to 148.54 | Drift-inconclusive |

Side statistics average two trial statistics, including percentiles; they are not pooled quantiles. Variation is the within-side range divided by its mean, not a confidence interval. Obstruction-only exceeds its control variation by just 0.06 percentage points. Combined exceeds control variation by 1.30 points, with candidate ranges separated from controls, but the gain magnitude remains uncertain. No repeated campaign was used to obtain a preferred result.

| Configuration | Steps/s | Changed roots/s | Submissions/s | Interval p50 / p95 / p99, ms | >6.0606 ms | Repeated roots | Pose age p50 / p95, ms | Input-age proxy p50, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| Paired baseline | 59.94 | 62.14 | 148.50 | 6.063 / 12.120 / 12.212 | 51.11% | 58.16% | 27.64 / 38.12 | 30.86 |
| Combined candidate | 59.96 | 70.90 | 148.74 | 6.065 / 12.110 / 12.205 | 52.64% | 52.31% | 26.20 / 35.54 | 31.02 |
| Best observed, combined + partitioned axis-aligned JS | 59.91 | 74.74 | 146.78 | 6.065 / 12.123 / 12.230 | 52.96% | 49.05% | 25.58 / 35.35 | 31.27 |

The best-observed row is the control of the matched ray block; it was **not paired against the baseline**, so its additional apparent benefit cannot be attributed to partitioning from this run. The strict 6.0606-ms statistic includes timer/refresh quantization around a 6.065-ms median. It is not a physical missed-present count. The approximately 12.1-ms p95 intervals and display CPU tails are the clearer cadence limitation. Producer simulation remains 60 Hz; only 11-22% of sampled displays are interior interpolation across these trials. A changed-root proxy is not full-pose freshness.

| Measured stage | Combined control p50 / p95 / p99, ms | Combined candidate p50 / p95 / p99, ms |
| --- | --- | --- |
| Display CPU wall span | 4.31 / 8.23 / 9.40 | 4.22 / 7.88 / 9.04 |
| Display preparation | 1.63 / 5.42 / 6.11 | 1.51 / 5.25 / 5.90 |
| WebGL submission | 0.95 / 1.66 / 1.86 | 0.91 / 1.72 / 2.02 |
| Asynchronous GPU | 2.08 / 3.40 / 4.89 | 1.98 / 3.41 / 4.75 |
| Producer wall span | 12.16 / 17.75 / 21.33 | 11.09 / 15.49 / 19.11 |
| Producer computation | 10.91 / 16.52 / 19.90 | 10.03 / 14.27 / 17.88 |
| Producer presentation | 7.31 / 8.82 / 10.08 | 7.06 / 7.98 / 8.84 |
| Producer obstruction preparation | 2.76 / 3.47 / 4.00 | 2.48 / 2.93 / 3.31 |
| Producer application | 1.35 / 1.65 / 2.14 | 1.27 / 1.57 / 2.00 |
| Compact endpoint packing | 0.80 / 1.00 / 1.20 | 0.78 / 0.95 / 1.11 |
| Display endpoint publication | 1.30 / 1.73 / 2.41 | 1.32 / 1.76 / 2.35 |
| Endpoint decode | 0.50 / 0.74 / 1.36 | 0.49 / 0.65 / 1.26 |
| Input waiting | 3.63 / 6.41 / 8.99 | 3.65 / 6.35 / 9.09 |
| Message delivery wall delay | 3.51 / 6.23 / 8.23 | 3.50 / 6.16 / 8.92 |
| Buffer waiting | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 |

These spans nest or overlap; do not add them. Input waiting and message delivery are wall delays, not CPU execution. CPU display p95 remains 7.73-8.30 ms across control groups, while GPU p99 is around 4.7-4.9 ms. The measured retained transform executor is only approximately 0.005 ms median and 0.020 ms p95 in the matched scalar/SIMD block: both have the same timer-level result. This is strong evidence that accelerating that already-small slice alone cannot close the frame budget.

| Strategy | Counter-proven work change | Work/storage remaining |
| --- | --- | --- |
| Endpoint credit | Producer compile calls, packet writes and host packet reads 1 to 0; 730,112-byte written packet payload to 0, 64-byte credit written; compiled-pose provenance removed | 730,112-byte buffer capacity retained; separate 790,352-byte compact endpoint still packed/cloned/decoded; full producer application remains |
| Prepared rig | Timed p95 lookup builds 5 to 1, input visits 1,760 to 352, temporary arrays 9 to 0, trig calls 5,648 to 400 | 704 part visits, 144 writes and eight IK solves remain on active interior samples; median counters are zero because most displays are endpoints |
| Planned followers + slot aliases | Alias Map builds 1 to 0, representative arrays 62 to 0, follower Sets 2 to 0; follower calls 1,208 to 604 while applications remain 604 | 22,108-byte alias and 9,664-byte follower-plan storage; current opacity/fades/queries and checked topology remain |
| Retained SIMD | Same retained numeric input/output and pruning as scalar; no established whole-frame benefit | 3,992 membership visits, approximately 2,612 resource checks, 808 fallback entity applications and 1,724 material applications at median persist per display |

Obstruction median time fell 2.76 to 2.45 ms in its isolated block: follower phase 1.11 to 0.95 ms and alias phase 0.49 to 0.36 ms; these subphases are included in total obstruction time. GPU uploads remain approximately 154-177 KB median per display, with two upload calls; shared/resident CPU storage is not shared GPU storage. Retained slice capacity is 1,827,864 bytes. These are logical byte/storage counters, not measured RAM traffic or cache misses. Main-heap boundary deltas are saved but include telemetry export and GC variation; no allocation-rate or memory-stability acceptance claim follows.

The ray block preserves partition pruning but compares different arithmetic/layout: specialized axis-aligned JS skips quaternion work, while the existing scalar Wasm SoA kernel retains general rotation/slab math and checked packing/export boundaries. The observed -10.97% fresh-root result rejects this configured candidate here; it does **not** establish that equivalent Wasm code is intrinsically slower. The [source audit](../../../../../.local/engine-perf/swarm-shape-20261016/ray-comparison-scope.tmp.md) records available counters and their non-equivalent accounting.

Nine of twelve self-repeat image pairs were exact. Credit's control, prepared rig's candidate and SIMD's candidate failed. All 24 captures matched gameplay, normalized command packets and camera hashes. These hashes omit some GPU resources/post state. Moreover packet and credit verification currently perform different intermediate draws, so cross-configuration history is not fully controlled. The three passing cross-configuration pairs do not waive that limitation. The 54 timed console errors are attributed one-for-one to three optional service 404 endpoints; no arbitrary errors were waived.

**Recommendation: leave production defaults unchanged.** [recommended.json](../../../../../.local/engine-perf/swarm-shape-20261016/recommended.json) preserves the native baseline. [diagnostic-best.json](../../../../../.local/engine-perf/swarm-shape-20261016/diagnostic-best.json) saves the strongest observed fresh-root configuration for investigation only. Combined work removal is promising, but no candidate satisfies complete promotion evidence, and none demonstrates useful 165-Hz motion. No experiment was deleted for these small/noisy effects.

**Supported shape and next task:** keep renderer-consumable retained arrays, but move exact dirty authority to engine-owned producer writes. Consume changed transforms/material bindings and topology revisions before full sampling, copying and repeated application; retain destination/resource invalidation and checked fallback for external writers. The cloud's unchanged-frame 3,202-scan probe proves the redundant traversal and separately proves why input identity alone cannot bypass live-storage repair. This is the next bounded implementation task, not an instruction to rewrite the simulation in Wasm. JS, Wasm and SIMD remain executors behind the same pruned contract; workers must separately earn their scheduling/latency cost.

Remaining gaps: exact image-history/reset acceptance; full-pose freshness rather than root proxies; long-run memory evidence; ten deferred contrasts including the worker/pool combinations, dirty publication and certified layout; no second arena sweep; and no global-optimum claim. The current measurements locate CPU preparation and producer/delivery timing as the principal remaining limits; they do not identify every source of scheduler/GC jitter.


Raw state is under the
[matrix evidence directory](../../../../../.local/engine-perf/swarm-shape-20261016/matrix):
each case retains its requested configs, effective settings, artifact/runner
identity, captures, raw trials, command logs and ownership receipts.

## Cloud outcome: baseline evidence only

The remote run `cd17ec69-1b2d-4b6c-96fc-32f9a5c0bb18` used immutable revision
`7e6b03e7d08a3034a621a984e4f69306129e9692`, separately from the local artifact.
It ended **BLOCKED / MODEL_BUDGET_EXHAUSTED**. The
[cloud audit](../../../../../.local/engine-perf/swarm-shape-20261016/cloud-audit.json)
verifies all 24 artifact hashes and retains exact evidence paths.

Completed: two baseline correctness commands (**240 tests; 83,850 expectations**),
one CPU diagnostic (**120 warmup frames; 240 measured samples**) and **one causal
probe reused by three experiment records**. No completed candidate implementation,
retained candidate patch, independent candidate validation or paired benchmark
result exists. Candidates 1/2 had no unfinished patch; candidate 3's patch capture
timed out, so its workspace contents are unknown. Cloud workspaces were cleaned.

| Cloud CPU fixture stage | p50 / p95 / p99, ms |
| --- | --- |
| Total CPU wall span | 13.278 / 25.365 / 59.121 |
| Simulation | 3.451 / 7.895 / 14.836 |
| Sampling | 1.417 / 4.477 / 7.847 |
| Presentation | 5.883 / 12.690 / 33.093 |
| Application | 1.914 / 5.054 / 7.479 |
| Command preparation | 0.111 / 0.245 / 0.386 |

This was Bun 1.4.3 on Linux/AMD EPYC, a 3,202-entity CPU fixture with no browser,
GPU, image, interpolation or fresh-motion measurement. Do not add percentiles or
compare these numbers causally with local Chrome/RTX timings. Memory boundary
observations are not allocation/GC rates or long-run stability evidence.

The probe establishes **3,202 transform comparisons and zero writes** for an
unchanged detached frame. One changed input still scans every transform. An
independent live-storage edit requires one repair write despite unchanged input
and gameplay. This supports pursuing input dirtiness together with complete
destination invalidation/fallback; it does not justify skipping resource checks.

The model stop occurred at next-call reservation admission, not the 16-call
limit. The ledger held 651,059 tokens versus the 750,000 run ceiling; settled
input/output usage was 506,060. Subscription admission reserves UTF-8 context
bytes plus 36,000 before calling the model. The exact rejected reservation and
limiting per-task/run predicate were not logged, so a more precise attribution
would be speculation. Compute was estimated at $0.375; provider-reported compute
charges are unavailable. No separately billed inference was reported.

## Reproduction and boundary

Use the frozen artifact and the existing managed game server; the run used
`http://127.0.0.1:8797/game/`. Opening that URL directly serves ordinary gameplay;
the native runner injects the diagnostic artifact. Use a fresh output root to
preserve evidence. The following invokes the existing serial runner with a new
one-hour deadline; it does not rebuild the artifact:

```powershell
$bun='C:/Users/MindOverMelee/AppData/Local/npm-cache/_npx/22f2fe8d8bc13000/node_modules/bun/bin/bun.exe'
$env:PATH=(Split-Path -Parent $bun)+';'+$env:PATH
$repro='.local/engine-perf/swarm-shape-repro'
New-Item -ItemType Directory -Force $repro | Out-Null
$plan=Get-Content '.local/engine-perf/swarm-shape-20261016/matrix-timing.json' -Raw | ConvertFrom-Json
$plan.root="$repro/matrix"
$plan.stopAt=(Get-Date).ToUniversalTime().AddHours(1).ToString('o')
[IO.File]::WriteAllText("$PWD/$repro/plan.json",($plan | ConvertTo-Json -Depth 12))
& $bun spikes/persistent-world-worker/lab/runner/native-matrix.ts "$repro/plan.json" verify
& $bun spikes/persistent-world-worker/lab/runner/native-matrix.ts "$repro/plan.json" timing
```

The remaining architectural gap is early exact writer dirtiness: current dirty
publication removes serialization after full production and comparisons have
already run. Renderer membership and mutable resource state need independent
invalidation authority before their compatibility scans can be removed safely.
Materials require the same distinction between immutable input identity and
live GPU-resource contents. The shared pruned contract can use JS or Wasm;
executor choice cannot remove preparation outside its kernel. These are source
findings, not a promise that an unmeasured design will reach 165 Hz.

Stop at the one-hour boundary with completed evidence and explicit gaps. Do not
automatically resume deferred contrasts, enlarge the architecture or promote a
configuration from a partial timing or image result.
