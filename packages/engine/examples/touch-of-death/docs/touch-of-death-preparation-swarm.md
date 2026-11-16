# Touch of Death preparation swarm — 2026-10-17

Owner: Touch of Death performance lab. One-hour local investigation timebox,
09:54:38–10:54:38 UTC; three concurrent implementation lanes, one serial hardware
lane. Experimental evidence only; no engine or playable default was promoted.

The strongest supported direction is to retain preparation state and carry exact
changed/actively-interpolating lists through publication, working storage and
command consumption. Keep synchronous typed-array JS behind that pruned contract.
The combined candidate lowered display CPU tails in two ABBA blocks. Freshness
improvement did not survive the repeat's variation, and exact image qualification
remains blocked. Neither arithmetic acceleration nor immutable sampling earned a
whole-loop recommendation.

For the **next lab experiment**, use `diagnostic-recommended.json`: detached
sampling, endpoint application, owned writer journal, dirty publication,
`retainedPreparation=changed-lists`, retained JS, existing axis-aligned rays and
partitioning. Keep the 60 Hz producer, 16.667 ms interpolation delay, three buffers,
production MSAA and existing prepared rig/follower/material-alias options. This
configuration was measured as the control of the last contrast; its gain against
the old baseline was not measured directly. Do not add effects from different
contrasts. `recommended.json` preserves the previous conservative configuration.

## Experiment identity and qualification

Raw evidence root: `.local/engine-perf/preparation-swarm-20261017/`.

- One measured artifact: `artifact/index.html`, SHA256
  `c9342e3452e4806cb9c085fe692b4b3475e0a23f573b9e6c69b40d944852141c`.
  `artifact/sources.json` freezes the actual dirty-tree dependency graph;
  `manifest.json`, worker and runner snapshots accompany it. Earlier oracle repair
  artifacts are archived failures, not alternate timing builds.
- Checkpoint SHA256
  `98527ff27cc950dd512bb165d0f54ec9dc717b6cbe684d1f76310272e0c9d74c`.
  Canonical street fight; the checkpoint's restored motion seed/tick governs the
  scene, not merely the runner's nominal seed.
- Eight bounded ABBA blocks, 32 trials; each trial has 5 s warmup and 10 s timing.
  No builds, tests, captures or other hardware measurements overlap throughput.
  Six planned contrasts plus one combined repeat and one sampling follow-up.
- All 32 trials passed focus/visibility checks. Native maximized Chrome
  155.0.8059.80; 1280×665 CSS viewport, DPR 1.5, 1920×998 drawing buffer;
  RTX 4070 Laptop GPU, driver 32.0.15.6094, High performance AC policy. Browser
  flags, priority, affinity and display configuration stayed fixed. MSAA policy
  and context antialiasing were recorded; exact GL sample count was not captured.
  Boundary power readings do not establish thermal equilibrium.
- Eight wake guards have clean release/no-sleep receipts; all eight timing browser
  trees have identity-checked cleanup receipts. The shared managed game server is
  not owned by this run.

The image oracle now starts paused before the first scheduled presentation,
disables the startup guide, restores the same checkpoint, clears display history,
captures endpoints at 0/16.667/33.333/50 ms without intermediate draws, and uses
the same 37.5/41.667/41.667 ms sample/flush history for every executor. It captures
the final PNG synchronously before asynchronous hashing. Recorded
`native-image-history-v2` history is now a timing eligibility gate alongside
gameplay/work, command and camera equality. Images run outside timing.

All seven configuration pairs matched that history, gameplay/draw work, command
bytes and camera bytes. Four passed strict self/cross pixel equality: producer
revisions, display preparation, equivalent JS/scalar rays and retained JS/SIMD.
Combined preparation, scalar/SIMD rays and the final sampling pair failed a
self-image comparison. Decoding the first two failures found one changed pixel
with maximum channel difference 1; that does **not** waive the exact gate or
establish the cause. The combined repeat deliberately reused its original failed
image receipt, with configuration/artifact/checkpoint identity checked, rather
than retrying for a passing image. History bias is repaired; residual pixel
repeatability remains unresolved. `/tod-ai-policy` returned an attributed optional
404; this was recorded as an environment limit, not hidden as successful service
coverage. Canvas images do not qualify DOM HUD rendering.

## Frame and freshness evidence

Values below are means of the two trial quantiles per side, **not pooled
percentiles**. CPU is the main display callback; changed roots count distinct
displayed fighter-root positions, not full-pose freshness or physical presents.
Separate blocks have visibly different baselines; compare only within a row.
The old configuration is `control.json`, the prior diagnostic best; it differs
from the conservative `recommended.json` retained separately.

| ABBA contrast, A → B | CPU p95 ms | CPU p99 ms | Changed roots/s | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Journal detached → immutable sampling | 7.438 → 7.738 | 8.423 → 9.003 | 82.03 → 78.17 | Work removed; no whole-loop gain |
| Original → sparse display preparation | 7.893 → 7.305 | 8.780 → 8.480 | 79.61 → 78.15 | Lower tails; median CPU and pose age worsen |
| Old configuration → combined immutable+sparse | 7.713 → 6.810 | 8.738 → 7.810 | 74.33 → 84.21 | Promising first block, image blocked |
| Equivalent SoA JS → scalar Wasm rays | 6.828 → 6.640 | 7.620 → 7.545 | 83.49 → 81.09 | Effects within observed variation |
| Equivalent scalar → SIMD rays | 6.370 → 6.665 | 7.225 → 7.920 | 85.22 → 82.42 | No full-loop gain; image blocked |
| Retained matrix JS → SIMD | 6.338 → 6.533 | 6.940 → 7.225 | 84.20 → 83.52 | Kernel remains too small |
| Combined repeat, same A/B | 7.085 → 6.250 | 8.235 → 7.235 | 81.35 → 89.13 | CPU tails repeat; freshness is drift-explained |
| Sparse display, detached → immutable sampling | 6.568 → 6.523 | 7.343 → 7.382 | 86.68 → 83.92 | No justification for immutable storage |

The first combined changed-root gain was 13.30%, versus side spreads 3.23%/1.19%.
The repeat's 9.56% gain is inside its candidate spread of 12.07% (control 6.37%).
Thus there is no stable measured freshness improvement to promote.

| Combined metric | First A → B | Repeat A → B |
| --- | ---: | ---: |
| Main CPU p50 ms | 4.208 → 4.233 | 3.835 → 3.938 |
| Display preparation p95 ms | 5.090 → 4.045 | 4.603 → 3.853 |
| Callback interval p95 / p99 ms | 12.085 / 12.183 → 12.005 / 12.170 | 9.108 / 12.130 → 6.888 / 12.125 |
| Submission callbacks/s | 153.35 → 155.49 | 158.55 → 159.73 |
| Producer wall p50 / p95 ms | 10.500 / 14.418 → 8.898 / 12.935 | 9.433 / 13.113 → 8.430 / 11.935 |
| Pose age at submit p95 / p99 ms | 34.28 / 38.68 → 31.28 / 35.35 | 32.08 / 34.43 → 30.06 / 34.17 |
| Input sample to submit proxy p95 / p99 ms | 42.83 / 44.53 → 42.90 / 45.05 | 43.38 / 44.77 → 42.89 / 45.21 |
| GPU p50 / p95 / p99 ms | 1.965 / 3.329 / 4.712 → 1.950 / 3.461 / 4.899 | 1.837 / 3.054 / 4.078 → 1.868 / 3.162 / 4.544 |

GPU elapsed queries have 49,846 valid samples, five pending, zero disjoint/invalid
samples. They cover `renderer.render`, excluding Canvas2D HUD, compositor and
scanout. CPU, producer wall, GPU and nested preparation spans are separate and
must not be added. The last block sustained about 59.9 simulation steps/s.
Input timestamps are a sampled-input proxy, not measured physical input latency.
No 165-Hz gameplay, global optimum or frozen-scene extrapolation is established.

## Work removal, copies and storage

The producer spike uses existing source/authored-scale generations to issue frozen
TRS tuples for eligible nonwriters. The packer treats three validated immutable
tuple identities as an exact revision token, with mutable numeric fallback.
It retains ordered identity/discrete checks and every live resource check. Failed
packing now forces a fresh baseline epoch so partially updated caches cannot lose
a later delta. This is bounded static-source tracking, not a complete dynamic
writer-issued changed-ID protocol.

| Evidence scope | Removed work | Work/cost that remains |
| --- | --- | --- |
| Fourth endpoint in four-publication capture | Vector allocations/source map gets 10,260 → 5,310; scalar copies 20,520 → 10,620; trig calls 6,840 → 3,540 | 3,420 entity visits/shells and 10,260 authored-scale comparisons |
| Warm publication, journal fixed on both sides | 1,650 immutable rows skip 16,500 numeric reads: 62.59% of 2,636 candidate rows | 986 numeric rows plus all ordered identity, visibility, variant and material checks; fixed-history encoded rows/wire bytes identical |
| Checked endpoint application | Numeric validation reuse for 1,650 slots; endpoint renderer writes/fallbacks zero in measured workload | 3,420 live entity/transform checks and 1,724 material resource checks; reuse already exists on both isolated sides |
| Final display capture | Matrix output visits 1,885 → 184; redundant checked setter calls 7,836 → 0 over capture history | 184 matrix copies / 11,776 bytes; 3,992 membership slots, 2,612 resource checks, 808 fallback records, 1,724 materials |
| Sparse working preparation | Display-only setup p50 1.285 → 0.485 ms; p95 1.715 → 0.773 ms | Writer selection still visits 3,420 records; consume p95 stays about 0.498 ms |

Stable output uses an exact reverse command index; only changed/active matrix
rows and fallback rows are consumed. Canonical live validation remains dense.
Real-scene tests repair external mesh/material/visibility/bounds changes, reflect
layer changes, and reject dead resources or unsupported skeletons. This preserves
the declared retained owner's repair behavior. The owned display scene's source
TRS and world-matrix arrays are not rewritten after external mutation; renderer
command matrices remain authoritative and correct. Arbitrary writes to those
arrays or borrowed command storage remain outside the pre-existing single-writer
contract. Producer private pose maps have separate command/restore generations.
This is not a general mutable-scene dirty protocol.

Copies and storage are separate costs:

- Sparse display adds 64,704 typed bytes in the capture, increasing retained
  typed/command storage from 1,827,864 to 1,892,568 bytes. Timed candidates ended
  at 871 sparse JS records / 8,719 numeric slots and each recorded 871 new row
  allocations, with zero sparse fallbacks. Reset or endpoint-layout changes
  discard this storage. This is not a net heap reduction claim.
- Immutable sampling adds 54,720 typed generation bytes, 4,950 frozen vectors /
  16,500 scalars and 10,260 reference slots. Existing journal storage is 212,040
  bytes and publication source cache 290,700 bytes. Those costs were not earned
  by a whole-loop improvement; detached is the exploration recommendation.
- Dirty publication still transfers about 98.1 kB entity wire data/publication;
  the last comparison's packed payload median is 563,396 bytes on both sides.
  Immutable revisions avoid numeric reads, not transport.
- Display-only motion still caused about 259 command rebuilds and 95 MB of logical
  command copies per 10 s trial. Fixed-capture renderer upload stayed 146,752 bytes.
  Combined timed upload p95 remained about 240 kB/display. CPU command copying,
  transport encoding and GPU uploads are different counters, not summed RAM traffic.

The separate memory lane compares the old configuration to the **combined
immutable** candidate, not the detached recommendation. One A1/B1 sequence runs
three 3 s active cycles with explicit main/worker GC. Main plus worker used heap
after GC grows 59.515 → 64.313 → 66.853 → 69.724 MB for A and
56.045 → 60.182 → 62.882 → 65.718 MB for B. B ends 4.006 MB lower, but neither
side plateaus. Main-thread sampled allocation estimates are 3.037 → 1.848 GB
(−39.16%); these exclude worker allocations and are neither exact bytes nor a
throughput result. Recorded retained typed capacities stay fixed;
`rotationCacheBytes` counts cumulative logical writes, not capacity. Its fixed
131,072-byte array is already included in retained storage. No steady-state,
leak-free or net-memory conclusion follows. The memory
browser's cleanup receipt confirms no surviving owned processes or windows.

A final, separate 5 s main-thread CPU/allocation profile uses the recommended
detached configuration. The existing profiling path had left the worker suspended
after reset; it now resumes/pauses the worker explicitly and rejects a capture
whose service tick counter does not advance. This capture advances 316 → 616
service ticks, with focus/visibility true at both boundaries and clean browser
cleanup. `sameRuntimeMaterialLook3D` is the largest named JavaScript self-time
entry: 654.193 ms self / 711.466 ms inclusive in an approximately 5.017 s marked
window. Tiny negative CDP deltas make summed attribution differ from elapsed time
by 0.082 ms; sample attribution is not a precise CPU clock.
Its sampled allocation estimate is 109.58 MB, plus 47.97 MB in child `sameNumbers`.
Allocation sampling covers a slightly broader interval than the CPU marks.
These are main-thread sampled attributions under profiler overhead, not isolated
unprofiled costs or forecast savings; inclusive durations overlap. They support
material input preparation as the next investigation. The original timed runner
remains archived in `runner-source`; the profile-only runner revision is archived
separately under `profile-recommended`.

## Writer and invalidation coverage

`lab/producer-trs-scope.ts` owns the conservative built-in writer enumeration.
The full source-level inventory and counter predicates are in `producer.tmp.md`;
these are the covered writer families and boundaries:

| Writer/source | Invalidation and retained handling |
| --- | --- |
| Runtime construction/checkpoint restore | Cold epoch; restore/setTick invalidates before replacing private poses and seed; topology validated |
| Teleport/rotate/pose command batch | Batch validates first; affected IDs receive source changes before mutation |
| Controller/platform/circuit/rotator/physics | Every step marks all such slots; excluded from immutable caching even when asleep |
| Canonical sampler/authored scale | Private poses authoritative; exact authored-scale comparison every sample, including same-tick edits and signed zero |
| Fighter/locomotion/contact/travel/intro/dash/effect presenters | Entire fighter prefixes writable; event age, phase, input and reduced motion stay live |
| Grapple/weapon/interaction presenters | Weapon/fighter prefixes writable; ownership, throws, durability and contact remain checked |
| Match/KO/recovery | Writable fighter roots and original camera/reset histories |
| Environment surfaces/reveal/debris/warning/removal/tools | All dependency IDs writable; impact/phase/age/stopped-pose histories retained |
| Traffic chassis/wheels/hubs | Exact discovered cosmetic set writable; route, steering, roll and stop state remain live |
| Hazards/weapon utility particles | Hazard TRS writable; effects and activation/capacity histories use full path |
| Camera/clearance/service court | Camera/lights continue every presentation; no TRS cache authority inferred |
| Obstruction/cutaway/aliases | Visibility/material fields always checked; material sampling/application/packing remains full |
| Appearance/legacy poses | Actor prefixes writable; variant/material/style/pose transitions stay checked |
| Directed art/rigs/wardrobe/expression/cosmetics | Fighter/weapon prefixes writable; controller, transition, emitter, teleport and rewind histories reset normally |
| Timeline/physical performance/sockets/IK/root motion | Declared journal authority dropped; checked endpoint fallback for unsupported inputs |
| Custom callbacks/frame replacement/reentry/external application | Custom hyperfocusPlay rejected by scope; outside transaction uses checked fallback; mutable tuples cannot authorize skips |

Authority expires at synchronous return, including Promise returns. Reentry is
rejected. Propagated transaction failure, source changes during borrowing,
generation exhaustion, reset/restore,
identity/topology mismatch and owner recreation invalidate reuse. Graphics/history
clears use a coherent receiver snapshot. Missing, duplicate, reordered or malformed
transport sequences fail; new epochs require complete baselines. Renderer live
mesh/material/texture/instance validation and external-state repair remain distinct
from producer numeric revision reuse.

## Equivalent executors and deferred work

The corrected ray comparison shares one resident 64 KiB SoA layout, target
packing, accepted ranges, identity-quaternion specialization, general fallback and
renderer-consumable hit output. Eight archived batches (2,104 queries) matched the
engine oracle exactly. Per batch every backend copies 6,912 target bytes once and
uses 1,703 accepted ranges; JS/scalar evaluate 26,803 targets, SIMD 26,812 lanes
including paired extra lanes after a first-lane hit; odd tails are scalar.
The pinned ray binary is 1,902 bytes. The old different-
arithmetic and different-pruning ray rankings are not used as backend evidence.

Retained matrix JS is unrolled with the same f64 arithmetic and f32 storage
boundaries as scalar/SIMD. Complete output bytes match, including untouched rows.
Live nonempty batches were about 216 median / 265 p95 rows; both JS and SIMD took
0.015 ms median / 0.020 ms p95. These batches occurred on about 54–56% of displays.
Ray SIMD improved the inclusive obstruction stage in one block; dedicated ray
compute time was not isolated, and neither backend improved whole-loop freshness.
Keep serial JS.

Existing worker/pool execution was therefore deferred, not benchmarked for its own
sake. Its fixed shared/revision storage is 1,146,880 extra bytes. Dispatch/completion
additionally copy 188 bytes per changed input row, four bytes per selected index
and 76 bytes per result row.
Historical dispatch/poll delays already exceeded this residual arithmetic, and no
new workload established a crossover. Complete dynamic writer dirty lists,
material preparation removal, dense membership-scan removal and long-duration
heap stability also remain unproven. No unsafe liveness bypass was substituted.

## Delivery and next task

Portable validation before hardware: producer 62 tests / 1,881 assertions;
display 18 / 167; executor 24 / 175,163; root integration 20 / 531. Later focused
checks overlap these counts and are not additive. Lab and retained TypeScript
checks pass; process policy reports 5,181 files, zero violations. Real renderer
command/camera checks, images, counter receipts and raw trials are independent of
those self-authored tests. Production/release acceptance was not attempted.

**One next implementation task:** connect existing material writer revisions to
an exact changed/actively-fading material list so unchanged `sameLook`/`copyLook`
preparation is skipped. Keep `matchesForms` live validation and `updateMaterial`
repair on every applicable display. Cover previous/current cutaway union, fades,
variants, aliases, resets/restores, topology/resource changes and externally
modified forms. Acceptance requires counters proving skipped preparation with
unchanged repair, exact command/image qualification, then one bounded full-loop
ABBA. There are 1,724 repeated material visits/display and a supporting profile;
their isolated unprofiled cost has not been measured, so this is the next bounded
test, not a promised speedup.

The evidence root contains `matrix.json`, both `followup-*.json` plans,
`final-summary.json`, per-case `analysis.json`, raw `timing-saved/{A1,B1,B2,A2}.json`,
untimed `verify-saved` captures, image-difference reports, environment/cleanup
receipts, independent lane reviews, `memory-combined` and `profile-recommended`.
Reproduce a new run with
the same frozen artifact/checkpoint and a new output root through
`lab/runner/native-matrix.ts`; it uses the existing native runner. Preserve failed
receipts and keep images/profiling outside timing.

## Remote follow-up

The 2026-10-17 follow-up authors an opt-in native material revision adapter and
strict oracle receipt validation locally. It changes the diagnostic build, not
production engine files or defaults. `materialIdentity=revisions` connects
producer revisions through worker publication to display input reuse; dense
material visits remain. The lab README owns its counters and storage contract.
The oracle rejects absent hashes, malformed counters and noncanonical history;
it records untimed RGBA diagnostics without relaxing exact PNG equality.

The user permitted one hidden source snapshot/upload while games occupied the
workstation. Snapshot `a1f1c598029f5b255cd3976e0bf2705e2eee622d` was 137,627,803 bytes;
capture took 9.975 s and cloud ownership 16.912 s, missing the 15 s launch target.
No local tests, builds, browser launches or server restarts ran. The existing
coordinator reused that immutable source for both runs; no second upload occurred.

Run `9b0e3cf4-e2d9-4989-9a0c-ad25766713ab` blocked because the deployed CPU recipe
had no evaluator for the requested material/oracle verification outcome. Its
baseline passed 246 tests; skipped investigation tasks are not executed checks.
Continuation `15374228-30b7-461e-87a7-770b2c82870e` used the recipe's existing
transform probes. One shared source-bound receipt reports 3,202 unchanged-frame
transform comparisons with zero writes, and one necessary repair after external
live-storage corruption. Two predicates using that receipt are not independent
replications and do not establish a material or display speedup.

The continuation's focused remote command passed eight configuration/oracle tests
but failed to initialize the material suite: its source rewrite used an ambiguous
`const texture` anchor. Lab typechecking also failed, including unresolved public
engine and browser-automation declarations in the clean remote workspace. These
are failed checks, not candidate acceptance. Both investigation rounds exhausted
their per-agent token reservations. The second round nevertheless retained passing
receipts for nine saved-preview/server tests (43 assertions) and the guidance
check (110 files, 42 skills, zero errors). The campaign stopped at its two-round
limit at 22:32:10 UTC with outcome blocked; it did not continue spending until the
deadline. Across both runs, reported remote usage was 515,990 tokens and $0.8843
estimated worker compute, with no paid-model fallback. Shared weekly usage moved
from 1% to 5%; this includes other account activity. Estimates exclude persistent
hosting and are not a settled bill.

Local repairs after upload narrow the anchor, normalize endpoint/full material
issuers without disrupting interpolation, reset complete display history after a
rejected publication, and account for full-producer and normalization storage.
Twelve material tests are authored, including socket fallback and failed-publication
recovery. Those repaired files differ from the snapshot and remain unexecuted.
Do not apply the uploaded source's results to them. Targeted static review found
no further defect but does not execute the generated direct runtime application
seam, real retained sampling or complete browser artifact. The graph tests'
transpilation and anchor checks also do not qualify those integration boundaries.

Raw receipts and SHA-256-verified artifacts are retained under
`.local/engine-perf/preparation-remote-followup-20261017/`. The remote run provides
progress and evidence access, not a new playable build. The earlier frozen native
artifact remains saved; its managed preview is not started during the workstation
file-only restriction. No new full-loop tails, GPU time, freshness, pose/input age
or qualified ABBA comparison exist for this candidate.

The immediate implementation task is a trusted remote verification lane that
prepares the lab's declared dependencies, accepts an explicit immutable source
identity and runs the focused checks with retained receipts. Qualify the repaired
revision bridge there before adding exact changed/actively-fading material lists.
Browser qualification additionally requires explicitly supplied canonical assets
and a suitable presentation environment; the deployed CPU fixture cannot satisfy
that gate. Serial JS remains the supported executor recommendation.

## Local infrastructure and image repair, 2026-10-18

Local execution was subsequently authorized. The repaired material and graph
adapters now execute in the portable lab recipe: 47 tests / 347 assertions pass,
along with lab and Harness typechecking and process-policy checks. A fresh graph
build exposed snapshot callback ordering and audio readiness failures; the
adapters now retain the pre-presentation snapshot until the result exists and
await the existing audio preparation before worker startup. These changes belong
to the diagnostic build, not a promoted production engine change.

Swarm capabilities now expose trusted execution kind, instrument claims and
promotion limits. Explicit mismatches fail before source upload. The opt-in
`touch-of-death-lab` engineering recipe prepares engine declarations and browser
types before portable verification. Bounded reasoning previews and a report-only
budget finalization retain incomplete evidence without relaxing admission limits
or qualifying unfinished work. The existing cloud deployment has not yet been
updated; local passing tests are not remote acceptance.

The image investigation retained failed probes as well as passing results.
On the original frozen artifact, disabling MSAA, omitting transparent draws or
bypassing their blending made repeated raw/postprocess pixels exact. Disabling
dithering or transparent depth testing did not. All six probes had identical
state/frame/command/camera hashes. The variation already exists in raw WebGL
pixels; PNG serialization is not its source. This isolates a multisampling and
transparent-blending dependency for that checkpoint, not a driver defect.

A fresh artifact additionally exposed an uncontrolled browser interval while the
oracle awaited image digests between primary capture and redraws. The oracle now
copies all pixels synchronously and hashes afterward. Canonical history records
that scheduling, and frame/camera/packet-carried material inputs must remain
unchanged across capture. Texture pixel contents and complete GPU state are not
hashed. Algorithms may render different images, but each must reproduce its own
exact pixels from equivalent state/frame inputs; missing or mixed histories fail.
Final qualification uses completed browser error/response receipts after cleanup.
Failed runs and stale configuration/artifact/checkpoint evidence cannot admit
timing; five negative CLI fixtures exercise those rejection boundaries.

With this corrected history, artifact
`11a985b61255c600afcbbc11bb8655b2193dd39e48e7d974e92880e8e4bc161f`
passes four cold resets and sixteen redraws using native `aa=off`, retaining all
544 draws and 150 transparent draws. The same-artifact MSAA reversal still varies.
The supported diagnostic setting is single-sample rendering with synchronous
capture; arbitrary presentation intervals and production-quality MSAA remain
unqualified. Older and newer source versions have different frame/command hashes
and are not an isolated performance comparison. No timing or visual-quality
acceptance follows from these checks.

Raw results, failed builds, PNGs, hashes and owned-browser cleanup receipts are in
`.local/engine-perf/image-replication-20261018/evidence-index.json`; infrastructure
logs and deployment status are in `.local/swarm/infra-image-repair-20261018/`.
Saved builds remain accessible through the managed local runs server, without
keeping investigation workers alive. The next implementation boundary remains
the exact changed/actively-fading material list, followed by qualified images and
a bounded full-loop ABBA; serial JS remains the executor recommendation.
