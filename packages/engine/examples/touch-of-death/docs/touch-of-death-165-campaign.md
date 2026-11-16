# Fresh-motion optimization campaign — October 11, 2026

**165 Hz fresh motion is not established.** This campaign is closed after 344
timed trials (two earlier trials invalid). All final 16 trials are valid. No
candidate was promoted and no experiment was deleted. The concrete avenues
investigated have been evaluated; this does not exhaust all possible optimizations.
See the [final audit](touch-of-death-165-audit.md) for current timings, configuration,
remaining limits and artifact 13 evidence. The sections below retain run history.

The original full-object baseline remains available. Current comparison controls
use compact publication and working-frame reuse, with original gameplay, renderer,
MSAA and input policy. The latest control also uses the measured endpoint-revision
combination described below; archived controls retain their exact settings.

The [lab](http://127.0.0.1:8807/lab/?arena=rooftop) has one active artifact and one
configuration contract. Archived artifacts and individual result identities allow
reproduction without pooling different builds. Evidence lives in
`.local/engine-perf/touch-of-death-lab/campaign-165/`;
[queue](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/campaign.json),
[implementation analysis](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/implementations/analysis.json)
and [display bounds](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/display-ceilings/analysis.json).

## Completed comparisons

The first artifact is
`2f00af448b05b91dffb627a579f2ce4aef3e1cebd0ac210416c305a40eb79d2b`.
Its 32 implementation trials and 24 display-bound trials completed with no invalid
trials. All 66,118 timed GPU query results were valid; focus and bounded wake
checks passed, and owned browser cleanup found no surviving processes.

Each contrast is A/B/B/A in rooftop and depot, serially, with 5 seconds warmup,
seeded world/history reset, and 10 seconds measurement. Viewport 1366×768,
resolution 1, original camera, 4×MSAA and inherited browser launch limits stay
fixed. The environment records Chrome, RTX 4070 Laptop/ANGLE D3D11 and power
receipts. Thermal state and unrelated user workload are not controlled. No builds,
tests, images or detailed tracing run during timing.

Values below average two trial statistics; they are not pooled percentiles.

| Candidate | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Conservative ray target partitions | 45.53 → 52.65 | 42.22 → 43.21 | Rooftop +15.64% exceeds observed control/candidate spreads of 7.88%/5.69%. Depot is inconsistent. |
| Checked primitive actor slots | 48.29 → 48.73 | 41.80 → 47.46 | Depot +13.54% exceeds spreads of 4.14%/1.87%. Rooftop is inconclusive. |
| Synchronous topology window | 50.87 → 48.05 | 41.95 → 39.40 | No useful gain. Removes a duplicate scan introduced by the lab stage observer; ordinary unobserved presentation already shares this binding. |
| Leased display inputs | 51.50 → 49.87 | 46.00 → 44.85 | No useful gain despite fewer transform comparisons. Live checks and compilation remain. |

The control submission rates are 109–116/s rooftop and 113–115/s depot across
these four blocks. Median intervals are approximately 8.4–8.9 ms, with p95
11.1–11.85 ms. Almost every interval exceeds 6.06 ms. Simulation still completes
about 59.8 fixed steps/s; repeats account for roughly 54–65% of submissions.
Median pose age is about 28–31 ms. These are CPU submissions, not proven physical
presents.

## Work removed and work retained

| Candidate | Direct work evidence | Retained work and storage |
| --- | --- | --- |
| Target partitions | Ray tests/publication: rooftop 12,097 → 858; depot 63,077 → 22,789. Obstruction median 1.50 → 1.30 ms and 2.35 → 2.15 ms. | Conservative group preparation plus exact ray oracle; simulation, fades, materials and rendering remain. Group planes use 3,456/2,304 bytes at checked checkpoints. |
| Primitive slots | Guard scan visits 9,477 → 0; 132 checked slot requests/publication. Primitive stage median about 0.95–1.00 → 0.45–0.50 ms. | Identity checks and fallback index rebuild; pose calculations remain. 1,412 typed bytes plus a Map whose memory was not measured. |
| Topology window | Validation entity visits 6,782 → 3,391 rooftop and 6,778 → 3,389 depot; material visits also halve. | First complete validation remains. This is an instrumentation-overhead contrast. |
| Display leases | Transform comparisons/display about 3,391 → 1,916 rooftop and 3,389 → 1,997 depot. | About 1,392–1,475 reused transforms still receive live checks. Cache 162,672–162,768 bytes. Display preparation remains about 2.65–2.80 ms. |

Producer compute remains about 10–12 ms. No candidate above establishes a total
compute gain across both arenas. Logical bytes and visits are not measured RAM
traffic or cache misses. CPU stages nest, and CPU/GPU execution overlaps; durations
must not be added to estimate a frame budget.

## Display bounds

| Contrast | Rooftop submissions/s, A → B | Depot submissions/s, A → B | Meaning |
| --- | ---: | ---: | --- |
| Clear-only | 115.42 → 154.92 | 105.98 → 154.78 | All scene draws disappear; frame preparation, simulation, HUD and post remain. Changed pose identities on a blank canvas are not visible motion. |
| Frozen presentation | 111.04 → 141.20 | 115.97 → 131.17 | Preparation becomes zero, fresh poses become zero, median pose age reaches about five seconds. Frozen geometry also has fewer draws. |
| Timer callbacks | 116.14 → 112.57 | 116.11 → 113.34 | No defensible scheduling gain. This does not change browser VSync or prove physical cadence. |

Full-scene GL submission medians are about 1.95–2.35 ms. Asynchronous GPU medians
are roughly 3.8–5.1 ms, with p95 often around or above 6.06 ms. Removing either
drawing or presentation preparation alone does not demonstrate 165 Hz useful
motion. This is a combined main-thread, producer and scheduling problem; GPU
tails also remain relevant.

## Correctness and active work

Structural verification is separate from performance. The first four candidates
passed seeded state, evaluated-frame, interpolation-repeat, packet and resource
checks. Exact image repeatability did not pass: 7/8 rooftop pairs and 0/8 depot
pairs were exact. A shader variant bypassing a constant uninstanced color varying
also failed depot repeatability. Earlier failed DITHER tests are not repeated.

The second artifact,
`86d662d0da7e1b160c7c271daf19218d3635caa7721b9267f3575a5742faa5d2`,
adds hidden-reticle positioning and the existing scalar f64 Wasm ray kernel.
Its HUD/reticle/Wasm/material-revision comparison passed structural checks in 32
untimed executions. Decoded image checks again found 7/8 exact rooftop pairs and
0/8 depot pairs; failures also occur in controls. No image tolerance is being
substituted for exact repeatability.

At checked checkpoints Wasm executes 67/217 kernel calls, copies 6,672/7,032 bytes
once per publication, retains 64 KiB memory and uses no fallback. Its inner
early-exit target-test count is unavailable; requested targets are an upper bound,
not proof of executed work. Live UI accounting passed in 64 retained rows.

The second artifact completed 32 timed trials. One rooftop material-revision
candidate lost focus and is invalid; it was not retried. The other 31 trials
passed focus/wake checks. There were 37,334 valid GPU query results and two pending
results in the invalid trial, with no reported invalid/disjoint results. Owned
browser cleanup completed. These are separate from the untimed checks above.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| HUD off | 55.03 → 50.35 | 35.40 → 35.72 | Diagnostic ablation. Submissions increase 117.81 → 139.38 and 107.39 → 138.19/s, but fresh motion does not improve beyond variation. |
| Hidden-reticle geometry omitted | 54.47 → 53.95 | 46.59 → 41.05 | Post-submission UI median falls about 1.05–1.10 → 0.10–0.20 ms; no useful cadence gain. Depot fresh motion regresses beyond observed within-side variation. |
| Existing scalar Wasm rays | 57.66 → 57.92 | 35.92 → 45.85 | Depot +27.66% exceeds control/candidate spreads of 15.74%/6.95%; rooftop is inconclusive. Depot total-compute improvement remains drift-inconclusive. |
| Material revisions | Invalid comparison | 49.19 → 47.85 | Depot preparation median 2.70 → 2.15 ms, but fresh motion remains inconclusive. Live resource checks remain. |

The reticle result is consistent with moving a layout cost to another operation;
that is an inference, not a traced attribution. Revisions reduce about 1,700 deep
display material comparisons to roughly three per display. Wasm still packs its
targets, uses scalar arithmetic and does not remove presentation application.
No second-artifact candidate establishes a fresh-motion gain across both arenas.
See `ui-kernel/analysis.json` for tails, pose age, work and individual controls.

An endpoint-credit candidate is implemented to omit unused producer render
command compilation and packet writing while retaining full frame application,
resource checks and bounded transfer ownership. It does not claim to remove the
producer's approximately 2.4 ms application cost. Together with changed-only HUD
DOM writes, checked HUD anchor selection and the compatible lookup/partition
pair, it is in artifact
`e917cbafbf3fb86e94869d26a375bcea89344232aa3a2e78ccb8330f2be565e7`.
Seeded structural and independent compiled-packet comparisons passed. Its 32
timed trials completed without invalid trials; all 37,190 GPU results were valid,
wake guards did not expire, and browser cleanup completed. The campaign total is
now 120 timed trials, one invalid. Intermittent exact image failures remain:
7/8 rooftop and 3/8 depot pairs were exact in this artifact's untimed lane.

| Third-artifact candidate | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Endpoint credit | 42.38 → 58.71 | 41.49 → 44.65 | Rooftop +38.54% exceeds observed spreads 10.29%/2.59%; depot drift-inconclusive. |
| Changed HUD writes | 56.05 → 56.04 | 48.16 → 47.43 | No fresh-motion gain. Depot submissions 116.53 → 124.53/s; post-submission UI median 1.20 → 0.30 ms. |
| Selected HUD anchors | 56.20 → 63.99 | 46.06 → 45.43 | Rooftop +13.86% exceeds spreads 2.70%/1.98%; depot inconclusive. |
| Lookup + partitions | 59.83 → 59.66 | 41.90 → 50.24 | Depot fresh +19.91% exceeds spreads 11.17%/4.76%; compute 12.10 → 10.40 ms, p95 16.70 → 12.60 ms. Rooftop inconclusive. |

Credit writes exactly 64 bytes and performs zero producer command compilations
or packet writes; 132 independent display-packet hashes match controls.
Transfer-buffer capacities remain 723,524/725,316 bytes. Logical packet writes
fall by 723,460/725,252 bytes per publication; compact endpoint packing remains
781,672/785,500 bytes. This is not a claim of less transferred buffer capacity or
measured RAM traffic. Full producer application and resource checks remain.

Separate live UI evidence contains 64 rows and four exact A/B/B/A DOM reversal
blocks. Selected anchors reduce HUD visits 7,838/7,834 → 82, plus 18 checked record
reads, with 72 retained slot bytes. At a repeated fixed pose, changed-only writes
reduce text/attribute/style setters 4/35/24 → 0/4/0. Four geometry reads, twelve
projections, two fighter bars, menu state and owner epochs remain unchanged.
Actual timed setter counts depend on gameplay and are retained in
`packet-hud/analysis.json`; fixed-pose counts are not substituted for live costs.

Most intervals still miss 6.06 ms. The producer pair's depot interval p50/p95/p99
is 8.50/11.40/13.95 ms; repeats are 56.24% and median pose age 28.30 ms. Simulation
is 59.83 steps/s, submissions 115.24/s and changed poses 50.24/s. These distinct
rates do not establish 165 Hz gameplay. No third-artifact candidate is promoted.

An untimed uniform-only guard isolation also failed exact repeatability:
16/20 comparisons were exact; four differed, including 16 raw pixels with maximum
channel delta two near the guard. Its lighting, textures, outlines and color
varying were disabled, with identical recorded command/state hashes. This rejects
that proposed fix. It does not identify a driver defect: complete GPU input and
pre-guard per-sample color/depth identity have not been proved.

Focused tests and engine/app typechecks passed for implemented candidates.
Engine build and installed-consumer checks passed again after the HUD primitive
change. The engine bundle-size gate still fails: aggregate runtime distribution
exceeds existing raw/gzip/brotli ceilings by 19,186/6,545/5,604 bytes;
project-runtime-3d gzip/brotli exceed ceilings by 4,194/3,577 bytes. These are
whole-dirty-tree results, not costs attributed solely to this campaign. Ceilings
were not changed.

## Renderer work and interpolation delay

The fourth artifact,
`b4e21cfd515ca6a392c30961dc9f15f3f7d4622fed3987dec49c6db328cace1f`,
completed another 32 valid trials with 36,590 valid GPU results, no focus/wake
failure and no surviving owned browser. The campaign total is 152 trials, one
invalid. The new independent renderer counters first caught a control defect:
camera culling accidentally supplied an unsorted shadow stream. Sorting the full
stream once before constructing culled views restores identical unculled shadow
ordering. The failed verification is retained in `render-policy-verification`;
corrected structural evidence is in `render-policy-fixed-verification`. Its image
lane has 8/16 exact pairs, so no candidate is promoted.

| Fourth-artifact contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Evidence and limit |
| --- | ---: | ---: | --- |
| Shadow batching | 47.89 → 65.68 | 45.18 → 41.48 | Rooftop +37.14% exceeds spreads 13.59%/4.42%; depot candidate variation explains its regression. |
| Camera culling | 53.95 → 63.37 | 38.59 → 47.72 | +17.46%/+23.68% exceed respective control/candidate spreads 9.32%/12.29% and 16.55%/14.84%. Strongest renderer candidate across these two short blocks. |
| Material table | 53.94 → 54.00 | 47.74 → 49.48 | Rooftop inconclusive; depot +3.65% narrowly exceeds spreads 2.88%/0.05%. Increased uploads and unresolved same-version image gate remain. |
| Delay 16.67 → 33.33 ms | 47.01 → 77.10 | 46.17 → 69.35 | Explicit latency tradeoff. Submissions fall 113.37 → 98.29 and 115.36 → 97.90/s; median input-age proxy rises 31.45 → 50.05 and 31.15 → 51.10 ms. |

Camera culling lowers median submission cost 2.20 → 1.80 ms rooftop and
2.15 → 1.30 ms depot; GPU medians fall 4.75 → 3.53 and 4.59 → 2.35 ms.
At the fixed checkpoint it removes main draws 978 → 581 and 950 → 262, while
unculled shadow calls remain exactly 901/871. Uploads increase because retained
instances are compacted. Shadow batching separately reduces shadow calls
901 → 224 and 871 → 277 with identical instance, triangle and upload counts.
Material-table rendering removes many bindings but increases checkpoint uploads
125,632 → 340,832 and 116,672 → 333,552 bytes. These are logical API bytes.

Longer delay brackets more endpoints, but median preparation rises from
2.75 → 4.60 ms rooftop and 2.65 → 4.70 ms depot. Median pose age becomes about
41 ms; every interval still exceeds 6.06 ms. The saved endpoint-availability
analysis explains why: an interior pose needs a delay between the newest
endpoint's age and that age plus the retained endpoint span. With only two
endpoints, increasing delay indefinitely does not help. This is separate from
simulation, which remains about 59.8 fixed steps/s. See
`render-policy/analysis.json` and `interpolation-availability.json`.

Untimed native-draw prefix localization finds 20/20 exact comparisons through
depot draw 1780, but only 6/20 through draw 1781, a transparent guard. This
localizes the first visible divergence; identical resolved color before that
draw does not establish identical MSAA sample color or depth. A fourth-artifact
diagnostic forcing only that guard's depth function to ALWAYS is 20/20 exact,
but it is an occlusion ablation, not a fix. An overhead-matched LEQUAL control
on the same artifact is only 10/20 exact, with maximum channel delta two. The
first recorded frames have identical initial state, uploaded blob hashes and
24,088 recorded calls; only the guard depth-function argument differs. This
supports a depth interaction, without yet distinguishing prior depth content
from guard rasterization. The failed first startup rejected a new registry
default against the older artifact; the completed control explicitly replays
the earlier artifact/config identity. Both failures and replay evidence remain.

The fifth artifact,
`22bca337fa3f4667433afddc6f51caf52bd1b446b292af28ae85f3728225e13a`,
adds the exclusive endpoint producer and first-interior setup counters. Eight
timed trials completed, all valid, with 9,029 valid GPU results and verified
focus/wake/cleanup. The campaign total is 160 trials, one invalid. Independent
display packets and seeded states match; 2/4 decoded image pairs are exact.

| Endpoint-only producer | Rooftop A → B | Depot A → B |
| --- | ---: | ---: |
| Application median, ms | 2.30 → 1.50 | 2.20 → 1.40 |
| Producer compute median, ms | 10.50 → 8.75 | 10.45 → 9.85 |
| Changed poses/s | 48.78 → 56.53 | 48.36 → 49.82 |
| Submissions/s | 110.08 → 114.66 | 114.52 → 112.99 |

Application savings exceed observed variation in both arenas; depot compute
savings do too. Fresh-motion effects are drift-inconclusive in both. All timed
candidate publications use the supported static path, with no full fallback.
Each still validates 3,391/3,389 entity transforms and resources and
1,702/1,717 material inputs/resources, applies eight lights and runs effects.
Static renderer comparisons/writes/cache copies are zero. This adds bounded
endpoint bindings and detached material caches; it does not free the bootstrap
renderer storage. Numeric validation scratch is 112 bytes. Skeletal, socket,
performance and physical-body frames retain the full fallback; zero static
counters are marked unavailable there. See `endpoint-application/analysis.json`.

First-interior setup alone costs median 1.5–1.6 ms, p95 1.9–2.3 ms. Complete
preparation on these samples is 4.8–5.4 ms, versus 2.6–2.9 ms on endpoints.
Every interior in this block is a first interior for its publication. Warm setup
allocates two Maps, checks 10,176/10,170 vector-alias pairs, restores the same
number of references and visits 3,391/3,389 entities for selection. These counts
justify trying decoder-certified layout reuse, with explicit checks against
mutable input topology. The whole setup duration is an upper bound, not a claim
that all of it disappears. The shortcut is not measured yet.

The image investigation also removed only outline depth writes while retaining
all draws: 16/20 comparisons still differ, ruling out outline depth as necessary.
All captured depth clears already have writes enabled and scissoring disabled;
stale depth from a masked clear is not the bug. Opaque depth geometry remains the
next input-identity gap. The probe is an ablation, not a renderer fix.

A subsequent untimed mirror covered all 131 opaque/guard draws across 18 frames.
Their CPU-issued vertex/index inputs match, with no untracked writes or fetch
errors, while 18/20 exact image comparisons still fail by at most two channel
levels. This narrows the gap to execution/state beyond those issued inputs; it
does not prove native GPU memory, per-sample depth or texture identity. The
selected shader path has no active fragment discard, custom depth, skinning or
morphing. Full point-light arrays are uploaded. Initial sampler assignments and
native linked shader identity remain outside the recorder. No shader change is
justified by this evidence. See `guard-resident-inputs/summary.json` and its
`shader-input-audit.json`.

The endpoint primitive passes seven focused tests (264 assertions), 49 affected
owner tests (1,162 assertions), engine/editor typechecks, package build and the
installed-consumer check. A declaration signature failure was repaired before
measurement. Bundle ceilings still fail: aggregate raw/gzip/brotli exceed them
by 25,802/8,434/6,980 bytes; project-runtime-3d gzip/brotli exceed them by
5,655/4,551 bytes. These are whole-tree totals, not isolated candidate costs.

## Combined work reductions

The same fifth artifact completed one compatible combination block, eight valid
trials with 9,912 valid GPU results and clean focus/wake/browser ownership. The
campaign total is 168 trials, one invalid. The combination enables endpoint
credits/application, primitive slots, target partitions, camera culling, shadow
batching, selected HUD anchors and changed-only HUD setters. Gameplay, AA,
simulation/publication rates and interpolation delay remain fixed. Structural
and independent packet checks pass, but same-version image repeats still fail;
it remains an experimental configuration.

| Arena/configuration | Fixed steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Repeats | Median pose/input-age proxy, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop compact/reuse control | 59.82 | 50.58 | 115.99 | 8.40 / 11.35 / 13.75 | 100% | 56.17% | 29.90 / 31.45 |
| Rooftop combined work | 59.87 | 82.34 | 137.39 | 6.70 / 10.45 / 12.35 | 65.34% | 39.84% | 24.53 / 34.25 |
| Depot compact/reuse control | 59.79 | 36.27 | 104.35 | 9.35 / 12.65 / 15.35 | 100% | 64.96% | 31.65 / 32.30 |
| Depot combined work | 59.81 | 69.70 | 139.00 | 6.55 / 10.70 / 11.85 | 60.26% | 49.63% | 25.30 / 33.40 |

Fresh gains +62.79%/+92.19% exceed observed control/candidate spreads
7.07%/0.93% and 3.32%/7.28%. These remain two short trials per side, not a
statistical acceptance claim. Producer compute medians fall 10.10 → 8.00 ms
and 12.30 → 9.10 ms. Submission cost falls 2.25 → 1.40 and 2.20 → 1.00 ms;
GPU medians fall 4.74 → 2.11 and 4.76 → 1.66 ms. Median post-submission UI
falls 1.10/1.20 → 0.30 ms. Preparation p95 remains 5.10/5.50 ms. CPU/GPU
times overlap. The input-age proxy becomes slightly older despite younger
visual pose age; both are reported rather than treating freshness alone as
an unqualified latency improvement. See `combined-work/analysis.json` and
`combined-work-plan.json` for exact configuration and all raw samples.

GPU median work is no longer the principal limit in this combination. Remaining
producer work includes obstruction preparation/queries (1.3/1.9 ms), sampling
(0.70/0.75 ms), fighter presentation (about 0.85 ms) and endpoint validation
(1.35 ms), within nested stages. Depot still lacks usable conservative cones
for seven target groups and performs many exact tests. Existing axis-aligned
ray selection can isolate redundant identity-quaternion transforms before a
new kernel is justified. The next display candidate removes repeated alias-Map
construction with checked decoder bindings; broad mutable-frame pooling remains
unsupported by earlier regressions.

The sixth artifact compares checked decoder layouts and existing axis-aligned
rays against that combination. Its untimed lane exposed a verifier accounting
error: four extra post-capture hash probes survived into the next capture's
global work counters. The initial capture therefore reports five or nine
applications depending on preceding probes. Saved receipts prove unchanged
per-application visits and exact warm counts; packet and gameplay comparisons
pass. The failed log is retained alongside successful offline reverification.
Future builds clear those counters at manual-capture and configuration boundaries.
Throughput already clears them at each display start and is unaffected. Exact
image repeatability remains unresolved.

## Checked layout and ray follow-up

Artifact six (`719a1c5d059bcc7fb929ec248c4699ecbed514c6c6b361cc628f66dd25f360af`)
completed 16 valid trials, 22,352 valid GPU results and clean focus/wake/browser
ownership. The campaign total is 184 trials, one invalid. Only 1/8 untimed exact
image pairs matches, so no promotion follows. The control is the combined work
configuration above; each candidate changes one strategy.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Checked decoder layout | 75.80 → 85.22 | 67.92 → 71.40 | Rooftop +12.43% is explained by 22.85% control drift. Depot +5.13% exceeds 2.45%/2.05% control/candidate spreads. |
| Axis-aligned rays | 84.19 → 83.83 | 70.89 → 63.82 | Neither establishes a fresh-motion gain. Depot producer median increases 8.65 → 9.00 ms; candidate freshness varies 15.69%. Retained, not selected. |

Checked layout cuts first-interior setup median 1.45 → 0.40 ms in both arenas,
and complete first-interior preparation 4.85 → 3.75 / 4.80 → 3.80 ms. It removes
two alias Maps per warm preparation while retaining 3N+3 reference restores, N
selection/blend visits, decoder binding checks and every application/resource
check. No certification fallback occurs. Decode medians rise 0.50 → 0.55 /
0.50 → 0.65 ms; publication medians rise 0.65 → 0.75 / 0.70 → 0.80 ms. Decode
is nested in publication. Extra bounded decoder storage is 6,782/6,778 binding
records, 33,910/33,890 binding references and 20,346/20,334 vector owners, plus
two active certificates. Each publication allocates three WeakRefs and one camera
reference array. These are logical storage counts, not measured heap bytes.

| Checked layout candidate | Rooftop | Depot |
| --- | ---: | ---: |
| Fixed steps / changed poses / submissions per second | 59.85 / 85.22 / 143.99 | 59.81 / 71.40 / 148.41 |
| Interval p50 / p95 / p99, ms | 6.65 / 9.65 / 11.50 | 6.35 / 9.55 / 11.55 |
| Intervals exceeding 6.06 ms / repeated poses | 64.44% / 40.65% | 56.15% / 51.72% |
| Median visual pose / applied-input proxy age, ms | 23.90 / 34.35 | 24.30 / 33.70 |

New obstruction spans put follower processing at about 0.35–0.40 ms rooftop and
0.70–0.80 ms depot, solids at 0.20–0.25 / 0.40–0.45 ms, and material aliases at
0.40–0.45 ms. Target and opacity preparation are each around 0.1 ms. These are
nested spans with observer overhead and quantized clocks, not additive independent
CPU costs. Setup/culling medians of zero mean below timestamp resolution, not no
work. `obstructionSubphasesComplete=1` and work counters qualify interpretation.
See `layout-and-rays/analysis.json`, including publication-only decode summaries.

## Publication rate and receiver versions

Artifact seven (`ee76d26d73b1643a0c6067807ecf4edb1dbf43a7d13ca25b3ecf33e8deb45b76`)
completed 24 trials; rooftop zero-step reprepare B1 lost focus and is invalid.
At that point the campaign total was 208 trials, two invalid. All 34,160 returned GPU queries
are valid; awake guards released and owned browser cleanup reached zero survivors.
Seeded state, frame and independent packet checks pass. Four of 12 normalized
image pairs match exactly, so no configuration qualifies for promotion.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Interpretation |
| --- | ---: | ---: | --- |
| Re-enable zero-step preparation | 84.67 → 77.89 | 67.02 → 61.37 | Rooftop invalid. Depot loses 8.44%, beyond 6.25%/0.26% side variation, but only 5–7 publications actually reuse work. Do not attribute the whole cadence change to those few calls. |
| Publish at 120 instead of 60 Hz | 77.42 → 80.31 | 65.17 → 68.81 | Gains 3.72%/5.59% are explained by control drift 12.62%/18.08%. Actual publication rates reach only about 75/s. |
| Receiver material versions | 78.91 → 77.20 | 70.85 → 58.61 | Rooftop drift-inconclusive; depot candidate varies 36.40%. No defensible fresh-motion gain. |

At requested 120 Hz, 136–183 publications per trial reuse preparation. Their
sample/game/read calls are zero, while endpoint validation, effects/lights,
packing and transport still execute. Median reused compute is about 0.9 ms;
packing remains about 0.5–0.6 ms outside that compute span. Simulation stays
near 59.9 steps/s. Display preparation increases about 2.7–2.8 → 3.1 ms, and
submission rate falls. Equal-tick publications and history replacement counters
increase; equal ticks are not an exact visual-equality oracle. Offline provenance
review finds many equal ticks are stepped hitstop updates, not zero-step reuse.
None of the measured evictions removes a pair that still brackets the requested
display time. Retaining original timestamps would therefore recover no interior
pose in those cases; retimestamping would change smoothing and latency. Input-age
proxy medians improve about 2.6 ms, without a proven fresh-motion gain.
Raw configurations, per-path spans and counters are in
`rates-and-versions/analysis.json`.

The untimed opaque-depth detail probe also rejected its hypothesis: suppressing
four selected opaque detail depth writes gives 4/20 exact images versus 6/20
for its matched control. Only those four recorded depth-mask arguments differ;
they are not necessary for the MSAA failure. Its browser cleanup initially left
four owned updater descendants. Exact PID/creation-time verification followed
by termination of that owned branch reached zero survivors; the original failed
receipt is retained. See `opaque-depth-details-analysis.json`. Historical owned
MSAA framebuffer and hardware OpenGL probes also contain failures; neither is
an established fix.

## Endpoint revisions and numeric material aliases

Artifact eight (`4a04b5812c5b23ddc621c9c642deaeb19235aeeea3ecb8fd79ce8daba6dbc866`)
completed 16 valid trials, bringing the campaign to **224 trials, two invalid**.
All 23,223 returned GPU queries are valid, both bounded awake guards released,
and owned browser cleanup found zero survivors. The checked-layout combination
above is the control; each candidate changes one strategy.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Interpretation |
| --- | ---: | ---: | --- |
| Numeric material aliases | 82.35 → 85.59 | 71.01 → 68.10 | Rooftop +3.94% exceeds 1.01%/0.89% side spreads. Depot candidate varies 17.42%; inconclusive. Retained, original selected. |
| Endpoint-issued material revisions | 72.06 → 89.28 | 67.93 → 74.98 | +23.90%/+10.38% exceeds observed control spreads 17.51%/4.91% and candidate spreads 4.03%/8.07%. Positive short-block evidence, not sustained acceptance. |

The endpoint owner derives revisions from its existing exact material checks.
It explicitly revokes them on failed application or reset and uses a distinct
issuer for full fallbacks. Display deep checks average 1,702 → 1.78 rooftop and
1,717 → 2.57 depot. All entity visits and material-resource checks remain.
Median display preparation falls 2.90/2.70 → 2.05 ms; producer compute remains
7.55/8.55 ms in the candidate. This removes redundant display comparisons, not
simulation, drawing, producer validation or all presentation compilation.

This costs one bounded producer revision array and **13,616/13,736 extra logical
payload bytes per publication**. The original endpoint path has no material
revision payload. Adapter copies are zero; worker structured cloning and receiver
storage remain. The older generic copied-byte counter does not include this new
payload, so it cannot establish unchanged total traffic.

| Candidate metric | Rooftop | Depot |
| --- | ---: | ---: |
| Fixed steps / changed poses / CPU submissions per second | 59.89 / 89.28 / 152.70 | 59.85 / 74.98 / 156.57 |
| Submission interval p50 / p95 / p99, ms | 6.00 / 9.25 / 11.25 | 5.80 / 9.10 / 11.70 |
| Intervals exceeding 6.06 ms / repeated poses | 48.98% / 41.37% | 44.75% / 51.96% |
| Median pose age / applied-input age proxy, ms | 23.08 / 34.20 | 23.25 / 33.50 |
| GPU p50 / p95 / p99, ms | 2.14 / 2.78 / 3.11 | 1.67 / 2.35 / 2.54 |

Input proxy medians rise from 32.95/33.15 ms in the paired controls; the short
block does not prove a latency improvement. GPU time overlaps CPU work. Neither
the submission rate nor the improved fresh-pose rate establishes useful 165 Hz.

Numeric aliases remove one temporary Map, 62 representative arrays and thousands
of material/alias Map operations per publication. Exact comparisons, alias writes,
stale deletion and entity visits remain; five bounded typed buffers cost
21,824/22,032 bytes. This work reduction does not establish a cross-arena gain.

Untimed seeded state, evaluated-frame, interpolation and independent packet/work
checks pass. Four of eight normalized image pairs match exactly. Both revision
candidate pairs match in this lane, but same-renderer controls still fail; the
known MSAA issue is unresolved. No promotion follows. The initial verifier failure
incorrectly assumed the original endpoint issuer contained a full revision array;
the actual payload is empty. The corrected strict zero-versus-M×8 oracle passed
against the saved captures without rebuilding or recapturing; its failure log is
retained. Focused engine tests, lab/engine/editor type checks, package build and
installed-consumer checks pass. Existing bundle ceilings still fail and are
unchanged. See `artifact-8.json`, `aliases-and-revisions/analysis.json` and
`best-measured-artifact8.json` for identities, costs and the experimental config.

Offline availability analysis retains the original changed-pose metric. In the
previous 24-trial block, every advancing interior sample changed pose, but such
brackets existed for only 24.3%/18.8% of control submissions. Many repeats occur
after the newest endpoint is exhausted; continued equal-tick runs also repeat.
Equal ticks alone do not prove frozen pixels or authorize reuse. These observations
do not uniquely assign missing brackets to CPU execution, transport, pacing or
intentional hitstop. The saved `fresh-motion-hitstop-audit.json` makes that limit
explicit; it does not replace whole-trial fresh Hz with a conditional pass metric.

## Follower traversal, scheduling, renderer and writer selection

Artifact nine (`7a58d9a42a7e703ff51e028c9dc15a4f9dca2c4b3f18c38eb4c478c23b9b1154`)
completed 32 valid trials: **256 cumulative trials, two invalid**. All 49,772
returned GPU queries are valid, awake guards released without expiry or suspected
sleep, and browser cleanup found zero survivors. These contrasts use the endpoint
revision combination, original renderer and rAF as their control.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Planned followers | 83.87 → 79.66 | 65.11 → 66.87 | Both drift-inconclusive. |
| Timer display wake | 81.69 → 86.00 | 69.61 → 71.18 | Both drift-inconclusive despite more submissions. |
| Material-table renderer | 82.79 → 90.92 | 67.97 → 74.03 | Apparent +9.81%/+8.92% gains are smaller than 13.52%/15.87% control spreads. |
| Certified writer selection | 87.22 → 78.59 | 73.63 → 63.24 | Rooftop candidate varies 25.34%. Depot −14.11% exceeds 3.37% control and 12.50% candidate spreads. Retained, disabled. |

Follower preparation falls about 0.40 → 0.20 ms rooftop and 0.80 → 0.60 ms
depot. Two transient Sets, recursive duplicate visits and static Map lookups
disappear; all 583/604 follower applications and 1,052/1,074 piece visits remain.
The plan retains 9,328/9,664 numeric bytes and shared immutable topology references.
This is a measured work reduction without a useful full-loop result.

Writer selection reduces first-interior setup 0.40 → 0.10 ms. Warm prefix scans
of 3,391/3,389 records become 352 checked selected reads, but current layout-ID
checks, reference restoration, blending, application and resource validation remain.
The retained numeric slot array is 1,408 bytes. Summed per-display storage counters
are not peak allocation or newly allocated bytes. The slower whole-trial result
prevents choosing this candidate despite its smaller setup cost.

Timer wake produces 168.23/175.32 CPU submissions per second, but only
86.00/71.18 changed poses; repeats rise to 48.72%/59.24%. Interval p50/p95/p99 is
5.65/8.60/10.20 ms rooftop and 5.40/8.50/10.40 ms depot, with 39.59%/37.78%
exceeding 6.06 ms. Median pose age is 23.70/24.20 ms and the applied-input proxy
33.15/31.95 ms. Simulation remains near 59.8–59.9 steps/s and publication near
58/s. This is neither 165 Hz motion nor evidence of physical presentation cadence.

The table renderer saves roughly 0.35 ms rooftop submission and 0.55 ms median
GPU time; depot changes are about 0.05/0.17 ms. Logical uploads increase by about
215/217 KB per display. Dynamic sampled triangle totals differ with pose selection;
untimed fixed-input work/packet verification is the workload-parity evidence.

Six of sixteen normalized image pairs match exactly. Failures include controls;
the rooftop table candidate reaches channel delta 7, while the other failed pairs
reach 1–2. Seeded state, evaluated frames, interpolation and independent packet/work
checks pass. No option is promoted or deleted. Detailed metrics and per-trial
variation are saved in `follower-and-display/analysis.json` and `artifact-9.json`.

A separate 10-second depot CPU-sampling lane is saved in
`endpoint-revisions-profile/`. Sampling is attribution, not another throughput
trial. The profiler's inferred `Object.assign.readWork` and
`Object.assign.readInputRevisions` names refer to applicator function bodies, not
expensive counter getters. The source audit found repeated lab actor classification
inside the full entity applicator and discarded quaternion norm calculations in
endpoint validation. These motivate the next two isolated candidates; neither
authorizes removing resource checks or changing gameplay.

## Endpoint validation and lab actor policy

Artifact ten (`8f8414c38da7f6e8aaf5a31d0f7ba15a6098b152f5463bcbdef37d5604c9e44d`)
completed 16 valid trials: **272 cumulative trials, two invalid**. All 24,733
returned GPU queries are valid; focus, bounded wake and owned browser cleanup pass.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Bounded quaternion validation | 87.33 → 83.46 | 63.81 → 69.33 | Rooftop candidate spread 20.19%; depot control spread 15.24%. No established gain. |
| Bound actor render policy | 90.31 → 88.75 | 69.02 → 74.73 | Rooftop inconsistent; depot +8.27% exceeds control/candidate spreads 5.11%/0.69%. |

The endpoint validator removes all 3,391/3,389 ordinary quaternion `hypot` calls
per publication. It retains finite-value and live-handle validation; near-threshold
inputs still call the original norm calculation. Producer application medians
change only 1.30 → 1.25 ms rooftop and 1.50 → 1.40 ms depot. Removing this scalar
work did not solve the motion bottleneck. Original remains selected.

Actor policy is **lab control overhead**, not redundant engine resource validation.
Warm full-scene actor classification disappears; whole-trial averages include one
classification pass after reset and fall to about 2.1 classifications per display.
Policy reads fall from roughly 5,444/5,221 to one, and rendered-group counter writes
from 2,053/1,832 to three. Each display still checks every slot ID/root epoch,
applies every entity and validates live resources. Storage costs 33,910/33,890
numeric bytes plus bounded ID and root strings, with no retained frame references.

| Bound actor candidate metric | Rooftop | Depot |
| --- | ---: | ---: |
| Steps / changed poses / submissions per second | 59.87 / 88.75 / 159.28 | 59.83 / 74.73 / 158.55 |
| Interval p50 / p95 / p99, ms | 5.70 / 8.70 / 11.20 | 5.80 / 8.95 / 11.35 |
| Intervals >6.06 ms / repeated poses | 42.91% / 44.11% | 44.67% / 52.70% |
| Median display preparation, A → B, ms | 2.10 → 1.70 | 2.25 → 1.80 |
| Median pose age / applied-input proxy, ms | 22.70 / 34.30 | 22.75 / 33.45 |
| Median producer compute / GPU time, ms | 7.35 / 2.10 | 8.50 / 1.62 |

Four of eight normalized image pairs match exactly. Failed candidate/control
pairs have the same mismatch counts in this lane (8 pixels, maximum delta 1
rooftop; 27 pixels, maximum delta 2 depot). This does not resolve the MSAA gate.
Seeded frame/state/packet checks pass. The original work verifier caught 3,161/3,158
extra quaternion setters on the first actor-strategy transition. A real-scene
fixture proves fresh quaternion binding caches cause one setter per newly bound
entity without changing packed transforms. The repaired oracle permits only that
bounded first-capture case; all later paired write counts remain exact. Saved
captures were reverified, not replaced; the original failure log is retained.

See `validation-and-dispatch/analysis.json`, `artifact-10.json` and the explicit
profile mapping in `endpoint-revisions-profile/source-attribution-audit.json`.
The offline analyzer was extended to include already-recorded actor counters; no
throughput samples were rerun. No candidate is promoted or deleted.

The scheduling audit in `timer-wake-audit.json` rejects a speculative rAF task
handoff for now: the timer contrast did not improve available interpolation
brackets beyond variation, and its message/input waits increased. Public writable
material and mesh storage also prevents skipping live validation using input
revisions alone. The next candidates target proven duplicate captures, diagnostic
counter dispatch and the existing Wasm kernel's partition-incompatible interface.

## Shared capture, material counters and partitioned Wasm

Artifact eleven (`e5098d1b45eae120e288be3ce807a1539b603169c44866d54571febd5f88bc89`)
completed 24 valid trials: **296 cumulative trials, two invalid**. All 36,817
returned GPU queries are valid. Focus, bounded wake and owned browser cleanup pass.
The three candidates share this artifact and the preceding endpoint-revision control.

| Contrast | Rooftop changed poses/s, A → B | Depot changed poses/s, A → B | Finding |
| --- | ---: | ---: | --- |
| Shared presentation capture | 83.14 → 82.00 | 63.31 → 71.34 | Rooftop inconclusive; depot +12.69% exceeds observed control/candidate spreads 2.78%/0.86%. |
| Aggregated material diagnostics | 87.39 → 90.15 | 72.29 → 66.94 | Rooftop gain below 4.82% control spread; depot candidate inconsistent. |
| Partitioned scalar Wasm | 82.81 → 90.23 | 71.41 → 75.75 | Rooftop gain below 17.91% control spread; depot +6.08% exceeds spreads 5.17%/1.39%. |

`game.presentAndReadPresentation(frame, { entityIds, capture: 'shared' })`
removes six duplicate component captures per fresh preparation. One full detached
combat capture and the post-presentation entity/velocity read remain. Independent
capture stays the default; arbitrary observers fall back unless the caller accepts
the explicit read-only contract. Reuse-only preparations execute zero captures.
Snapshot time falls from 0.3–0.4 ms to zero, but the full composite capture now
appears inside presentation. Producer compute medians change 8.40 → 8.20 ms rooftop
and 9.20 → 9.10 ms depot. The recorded full producer span, including later metadata
and packing but excluding worker posting, changes 9.15 → 8.95 ms and 9.90 → 9.80 ms.
The moved timing boundary is not a 0.4 ms saving, and
the depot fresh-motion gain is not attributed solely to that small median change.

Material aggregation removes per-material lab policy reads and dictionary-counter
writes. Input scans, live 28-float/five-texture-slot checks, resource validation,
revision storage and renderer updates remain. The original loops keep their
existing bookkeeping; constant boundary diagnostics are present on both sides.
The candidate adds one short-lived work object per application. Policy reads fall
1,703/1,718 → one and counter writes about 3,403/3,432 → 2.20/2.24 per display.
Display preparation
does not improve reliably, so this is retained without selection.

Ranged Wasm retains the same ordered conservative groups and scalar f64 arithmetic.
It packs targets once per fresh preparation, owns a fixed 64 KiB memory and counts
actual early exits. Arena captures preserve exact query order/results and actual
ray-test counts with no fallback. The general eye-inside fixture documents one
extra Wasm target test versus the JavaScript early return. This is not SIMD.
Obstruction-stage medians fall about 0.15 ms in each arena; producer compute medians
change 8.15 → 7.30 ms rooftop and 8.75 → 8.40 ms depot. Other stage changes and
control drift prevent attributing the entire difference to the kernel.

All 204 saved paired rows pass structural verification. The original strict run
failed on the first control's material history: candidates perform 10/80 additional
unchanged-form checks, while changed looks take validating writes. An original-owner
fixture and both warmed repeats justify only this bounded first-row allowance.
Raw counts and the original failure remain saved; no rebuild or recapture followed.
Only two of twelve normalized image pairs are exact (maximum channel delta two),
so no candidate is promoted. Public build, installed consumer and focused editor
checks pass; complete-tree bundle ceilings remain exceeded and unchanged.

See `capture-diagnostics-wasm/analysis.json`, `artifact-11.json`, and the saved
`residual-capture-transport-audit.json`, `resource-liveness-source-audit.json` and
`display-transform-source-audit.json`. The latter audits find no justified broad
resource-check cache or unconditional transform-setter replacement. One redundant
AI learning clone remains, but its sampled bound is only about 0.04 ms/publication.

## Input handshake and the compatible combination

The same eleventh artifact completed two further eight-trial blocks: **312
cumulative trials, two invalid**. These sixteen trials are valid, with 24,740
valid GPU results, successful focus/wake checks and zero owned browser survivors.
No runtime rebuild occurred between these comparisons.

The input-policy diagnostic compares fresh-input handshakes with asynchronous
input under the existing timer producer scheduler; both use rAF display. It does
not isolate this policy against the usual pipeline control. Waiting disappears
(median 2.15/2.00 ms to zero), but input messages, acknowledgements and simulation
still execute. The producer may reuse its last accepted input.

| Input-policy metric, A → B | Rooftop | Depot |
| --- | ---: | ---: |
| Changed poses/s | 68.56 → 76.72 | 52.92 → 64.35 |
| Submissions/s | 158.40 → 146.18 | 162.31 → 156.07 |
| Intervals >6.06 ms | 43.66% → 58.57% | 42.00% → 49.39% |
| Input-age proxy p99, ms | 52.85 → 55.65 | 52.40 → 55.10 |

The rooftop gain is smaller than candidate variation; depot gains 21.59%, beyond
control/candidate spreads of 2.46%/7.93%. Producer execution does not get cheaper:
full-span medians rise 9.35 → 9.85 ms and 10.25 → 10.50 ms. Four of 4,375
publication-to-producer joins are unavailable, so the analyzer excludes incomplete
whole-span effect comparisons rather than replacing missing spans with zero.
Worse submission tails, the changed input contract and no comparison against the
normal pipeline prevent selection. Three of four untimed image pairs are exact.
See `input-handshake/analysis.json` and `input-handshake-result.json`.

The compatible combination changes only shared capture, partitioned scalar Wasm
and bound actor rendering. It retains the control's fresh-input policy, 60 Hz
simulation/publication targets and 16.67 ms interpolation delay. All three work
proofs pass together in 68 untimed paired rows; one of four image pairs is exact.

| Combination metric, A → B | Rooftop | Depot |
| --- | ---: | ---: |
| Fixed steps/s | 59.79 → 59.89 | 59.84 → 59.84 |
| Changed poses/s | 79.39 → 82.54 | 64.84 → 68.64 |
| Submissions/s | 152.15 → 152.15 | 154.52 → 157.52 |
| Interval p50 / p95 / p99, ms, candidate | 6.15 / 9.55 / 11.90 | 5.80 / 9.10 / 11.05 |
| Intervals >6.06 ms | 52.41% → 51.02% | 47.75% → 45.82% |
| Repeated poses | 47.62% → 45.63% | 57.86% → 56.24% |
| Median display preparation, ms | 2.00 → 1.70 | 2.15 → 1.75 |
| Median pose age / input-age proxy, ms, candidate | 23.50 / 33.35 | 23.50 / 32.65 |
| Median producer compute, ms | 8.75 → 8.25 | 9.25 → 8.95 |
| Median asynchronous GPU, ms | 2.13 → 2.14 | 1.68 → 1.61 |

The 3.97% rooftop fresh-pose gain is below 7.57% control and 11.04% candidate
variation. Depot gains 5.85%, but candidate variation is 8.29%. Display preparation
does improve beyond observed variation in both arenas; useful-motion throughput
does not. The combination therefore remains experimental. One of 4,657 full
producer joins is missing, recorded explicitly. See
`capture-rays-actors/analysis.json` and its saved configuration/raw trial files.
Individual gains were not added together, and neither policy nor combination is
promoted or deleted.

## Sparse materials and prepared rigs

Artifact 12 is
`7780a66a68e947816fa069819b31396db8a6d1e66f301b0443800a38d336b797`.
`material-rig-plan.json` compares two independent candidates against the existing
endpoint-revision control. It preserves gameplay, visual workload, 60 Hz producer,
16.67 ms interpolation delay, MSAA, camera and browser profile. These controls
are the optimized campaign stack, not the original full-object lab baseline.

| Candidate | Rooftop fresh poses/s, A to B | Depot fresh poses/s, A to B | Actual removed work |
| --- | ---: | ---: | --- |
| Fixed material baseline | 74.37 to 87.57 | 65.62 to 64.37 | Logical compact payload falls 57.34% / 56.15%, including initial template transmission. Median worker post falls 0.60 to 0.30 / 0.40 ms. |
| Prepared producer rig | 85.62 to 88.03 | 65.61 to 71.67 | Per fresh standing preparation: frame Maps 5 to 1, scans 2,060 to 412, counted trig calls 5,648 to 400. |

All four fresh-motion effects are explained by observed control variation.
Rooftop material gain is 17.75% versus 18.27% control spread; depot loses 1.90%
with 7.09% control and 29.24% candidate spread. Rig gains are 2.82% / 9.23%
versus 3.61% / 18.20% control spread. No combination or promotion follows this
block, and neither candidate is deleted.

Material packing medians are 0.55 to 0.30 ms rooftop and 0.55 to 0.40 ms depot;
the depot packing change is candidate-inconsistent. Decode is 0.65 to 0.65 ms
and 0.75 to 0.65 ms; the latter is inconclusive. Every adopted endpoint still
restores all 1,702 / 1,717 mutable materials and retains resource checks. Final
changed-slot unions are 43 / 130. The receiver holds one immutable template and
records one detached copy per trial, 456,136 / 460,156 bytes, within the two-generation
bound. Producer revisions, slots and template storage are separately counted.
Logical payload excludes metadata/dictionary encoding and separately reported
revision arrays; it is not measured RAM traffic. Worker receiver counters remain
zero before hydration; actual receiver evidence comes from main publication rows.

Rig fighter-stage p50/p95/p99 improves from 0.80/1.05/1.30 to 0.60/0.90/1.05 ms
rooftop and 0.85/1.15/1.50 to 0.70/0.85/1.10 ms depot, beyond observed stage
variation. Part visits/writes (824/144), eight IK solves, two source Maps and
104 quaternion outputs remain. All zero-step reuse rows execute zero rig work;
prepared lookups retain no frame references. Display rig preparation was subsequently tested separately; see the final audit.

Current candidate timings, each the mean of two trial statistics:

| Arena / candidate | Steps/s | Fresh poses/s | Submissions/s | Interval p50/p95/p99 ms | Misses >6.06 ms | Repeats | Median pose/input age ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop / sparse materials | 59.88 | 87.57 | 152.76 | 6.10/9.05/10.45 | 51.26% | 42.44% | 23.45/34.15 |
| Rooftop / prepared rig | 59.89 | 88.03 | 155.18 | 5.85/8.90/11.35 | 45.82% | 43.11% | 23.05/34.10 |
| Depot / sparse materials | 59.82 | 64.37 | 155.00 | 6.00/8.85/11.00 | 48.84% | 58.40% | 24.65/32.90 |
| Depot / prepared rig | 59.78 | 71.67 | 156.76 | 5.80/9.10/11.55 | 44.34% | 54.12% | 23.45/33.50 |

Median producer compute is 7.6 to 9.65 ms across candidates; display preparation
is 2.0 to 2.25 ms, submission 1.0 to 1.4 ms, and asynchronous GPU 1.66 to 2.18 ms.
These spans overlap and must not be added. The 60 Hz producer has a 16.67 ms
period; interpolation means its work is not a separate 6.06 ms-per-display task.
Current samples still show many newest-endpoint clamps and repeated poses. Lower
CPU cost alone has not established useful 165 Hz motion, nor do submissions prove
physical presents. Full tails, waiting, work and individual controls are in
`material-rig/analysis.json`; four of 9,308 full-producer joins are unavailable.
Incomplete joins are excluded from whole-span effect comparisons.

All 16 trials are valid, all 24,644 GPU queries valid, focus/wake checks pass and
owned browser cleanup has zero survivors. The untimed lane separately verifies
136 paired rows across eight receipts: exact gameplay/frame/compiled-packet
resets, work removal and retained resource checks. Three of eight same-version
pixel pairs are exact; the five failures include controls, with maximum channel
delta two. Both sparse-material candidate image pairs pass, but this neither
resolves the renderer's repeatability issue nor establishes a throughput win.
The first artifact failed only in the untimed probe, whose structured clone
stripped private packet authority. The corrected probe preserves the exclusively
received packet while cloning other metadata. Its real-decoder regression test,
failed artifact and original log are retained. Package build, installed-consumer
and type checks pass; the complete dirty-tree package still exceeds existing
bundle ceilings, which were not raised.

One separate depot CPU profile resolves the exact ranged Wasm kernel:
129 samples, 193.679 ms sampled self/inclusive weight in a 10,281.715 ms window
(1.884%). Binary export/index/offset and caller ancestry identify the kernel;
zero fallbacks and fixed 64 KiB storage are recorded. This is a small sampled
share, not an FPS or elapsed-time speedup bound. It does not justify treating a
SIMD rewrite as the large remaining win. Physics position-reader and inactive
freeze-scan opportunities likewise have small or unisolated measured bounds.
See `artifact12-ranged-wasm-profile/kernel-attribution-audit.json` and
`remaining-source-opportunities-artifact11.json`.

Independent raw-work audits are `material-rig/material-publication-work-audit.json`
and `material-rig/rig-preparation-work-audit.json`. The original defaults remain
recommended; `materialPublication=baseline` and `rigPreparation=prepared` are
diagnostic options with proved work savings and inconclusive fresh-motion effects.

## Artifact 12 reproduction

Use the named plan with a new output directory and the matching archived artifact:

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase campaign --plan .local/engine-perf/touch-of-death-lab/campaign-165/material-rig-plan.json --output .local/engine-perf/touch-of-death-lab/campaign-repro
bun.cmd spikes/persistent-world-worker/lab/runner/producer/analyze-producer.ts .local/engine-perf/touch-of-death-lab/campaign-repro
```

The runner saves complete effective configurations, artifact/runner/source hashes,
raw samples and environment receipts. A newer active artifact is a new comparison;
do not label it a reproduction of an archived binary. Current recommendation
remains diagnostic compact/reuse for investigation, with no new promotion.
