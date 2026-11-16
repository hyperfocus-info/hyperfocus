# Touch of Death: final 165 Hz campaign audit

The later [source-owned primitives comparison](touch-of-death-standard-primitives.md)
records reset repairs, engine integration and 16 additional trials. Counts and
artifact identities in this report describe the completed earlier campaign.

**Useful 165 Hz motion was not achieved.** The campaign completed 344 timed trials,
including two earlier invalid trials. The final 16 are valid. Parallel candidate
development and serial A/B/B/A comparisons found real work savings, but neither
final candidate establishes a fresh-motion improvement in both arenas. No
experiment was deleted and no candidate was promoted.

The campaign stops after evaluating its concrete, evidence-supported avenues.
This does **not** establish that all possible optimizations are exhausted.
Remaining small, unisolated and correctness-dependent opportunities are listed
below. [Earlier results](touch-of-death-165-campaign.md) retain the full history.

## Current measurements

The final artifact is
`1b82bd5c531e56d62a9693ecc1b94e35d8ae9290062c769421d1c1229b9fd548`.
Each candidate was independently compared with the same tuned control, in
A/B/B/A order in rooftop and depot: 5 seconds warmup, seeded checkpoint/presentation-history
reset, 10 seconds measurement. Values average the two trial statistics, including
percentiles; they are not pooled percentiles. A and B are within-block comparisons.

The tuned control uses compact publication, working-frame reuse, endpoint-issued
material revisions, endpoint-only producer application, camera culling, batched
shadows, primitive slots and partitioned rays. It preserves gameplay, all actor
groups, MSAA, resolution 1, 60 Hz simulation/producer targets, fresh-input
handshakes and 16.67 ms interpolation delay. It is **not** the original full-object
lab baseline. Requested `paced-pipeline` executes the recorded `pipeline` mode.

| Arena / block / side | Steps/s | Fresh poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Repeats | Pose/input age p50, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop / rig / A | 59.88 | 82.53 | 147.96 | 6.45/9.60/11.75 | 57.24% | 44.13% | 23.90/33.95 |
| Rooftop / rig / B | 59.83 | 80.37 | 149.46 | 6.40/9.35/11.50 | 55.58% | 46.12% | 24.05/33.25 |
| Rooftop / copies / A | 59.79 | 82.29 | 146.25 | 6.55/9.55/11.60 | 58.50% | 43.69% | 24.00/33.50 |
| Rooftop / copies / B | 59.88 | 87.72 | 152.86 | 6.00/9.05/10.60 | 49.27% | 42.45% | 23.25/34.00 |
| Depot / rig / A | 59.81 | 68.65 | 156.36 | 5.90/9.10/11.65 | 45.78% | 55.91% | 24.05/32.45 |
| Depot / rig / B | 59.77 | 65.77 | 158.58 | 5.80/8.80/12.30 | 45.10% | 58.38% | 24.20/31.95 |
| Depot / copies / A | 59.87 | 67.72 | 156.55 | 5.90/9.05/11.00 | 46.61% | 56.58% | 23.90/32.75 |
| Depot / copies / B | 59.79 | 58.74 | 156.25 | 5.80/9.10/11.35 | 45.39% | 62.28% | 25.20/31.85 |

| Candidate | Rooftop fresh effect; A/B spread | Depot fresh effect; A/B spread | Decision |
| --- | --- | --- | --- |
| `displayRigPreparation=prepared` | -2.61%; 18.29%/15.37% | -4.19%; 0.50%/11.24% | Rooftop drift-inconclusive; depot candidate-inconsistent. |
| `transparencyCopy=runs` | +6.59%; 17.99%/3.60% | -13.26%; 5.43%/20.44% | Rooftop drift-inconclusive; depot candidate-inconsistent. |

The depot copy result is not a reproducible large regression: candidate spread
exceeds the effect. Both implementations remain selectable with original defaults.
No combination is justified by this block. There is no newly accepted "best"
configuration. Earlier compact/reuse and endpoint-revision comparisons improved
fresh motion, but exact image acceptance still prevents promotion. Historical
full-object baseline rates of 20.52/17.93 fresh poses/s are from another artifact
and session; they are not a paired speedup denominator for this table.

## What the candidates actually change

Display rig preparation shares one ordered lookup and prepared Euler coefficients
within each interior pose evaluation. All 12,224 measured rows satisfy its work
contract: 8,414 endpoint rows and 25 snaps explicitly do zero rig work; 3,785
interiors still run their writers, including 1,275 repeated submitted poses.
Frozen presentation was not exercised in these timed trials.

Per interior evaluation, frame Maps fall from 4–5 to 1, input visits from
1,408–1,760 to 352, temporary map-construction arrays from 8–9 to zero, and tracked
trig calls from 5,648 to 400. Two source-rest Maps, 144 part writes, eight IK solves,
104 quaternion outputs, entity application, resource checks and compilation remain.
No frame references escape the call. These are bounded logical storage counts,
not a measured heap or GC improvement.

Interior preparation p50/p95/p99 changes from 3.25/3.85/4.45 to 3.10/3.70/4.25 ms
rooftop and 3.20/3.80/4.30 to 3.00/3.40/3.90 ms depot. Median changes remain within
observed variation; overall preparation medians stay 2.15/2.00 ms. Conditional
interior samples have different workload membership and cannot prove a whole-loop
gain. Producer application also becomes slower in the depot B trials; that code
is unchanged by this display strategy, so the difference is not attributed to it.

Transparency runs remove 39.46%/40.54% of matrix `set` and `subarray` calls. The
original already used native typed-array copies; there was no 16-element JavaScript
copy loop to eliminate. All 12,222 measured rows retain exactly 16 matrix values
and one handle write per instance, unchanged depth sorting and command order,
full shadow input, camera-retained uploads, shadows and outlines. Appearance
streams are absent in these arena samples. Numeric scratch capacity remains
493,052/492,820 bytes, with zero fallback and zero retained-source references.

The candidate adds native-view/property/alias guards and about 219/261 command
eligibility checks per draw. Logical copied bytes and upload formulas are unchanged;
absolute trial totals vary with cadence. Draw CPU p50 changes 1.45 to 1.40 ms
rooftop and 1.00 to 1.05 ms depot, both inconclusive. Independent untimed matched
inputs preserve every recorded sorted command, instance and appearance byte.

## What currently limits motion

Representative final control measurements below use the rig block's A trials.
These are separate observations, not additive frame-budget components.

| Measurement | Rooftop | Depot |
| --- | ---: | ---: |
| Producer compute p50, ms | 8.05 | 9.05 |
| Whole producer span p50/p95/p99, ms | 8.75/13.45/18.95 | 9.75/12.40/15.65 |
| Simulation / presentation p50, ms, nested in compute | 1.70/4.95 | 2.00/5.65 |
| Obstruction / producer application p50, ms | 1.35/1.35 | 2.10/1.45 |
| Actual publication adoption / nested decode p50, ms | 0.85/0.65 | 0.90/0.75 |
| Worker posting p50, ms | 0.60 | 0.60 |
| Display preparation p50/p95/p99, ms | 2.15/3.60/4.05 | 2.00/3.50/3.90 |
| GL submission CPU p50, ms | 1.40 | 1.00 |
| Asynchronous GPU p50/p95/p99, ms | 2.22/2.99/3.39 | 1.67/2.40/2.74 |
| Input wait / message delivery / host wait p50, ms | 3.75/3.55/0.20 | 3.50/3.20/0.20 |
| Buffer wait p50, ms | 0 | 0 |
| Publication rate/s | 57.98 | 58.41 |

| Rank | Remaining limit | Evidence and confidence |
| --- | --- | --- |
| 1 | Temporal availability plus producer execution/scheduling | 64–68% of rooftop and 70–76% of depot submissions clamp to the newest endpoint. Equal-tick endpoint pairs affect about 21–22%/32% of submissions; these categories overlap. Clamping proves a missing temporal bracket, not which thread caused it. High confidence in the availability gap; mixed causal attribution. |
| 2 | Required display application and compilation | Fresh-row main-to-submit medians remain about 4.85–5.35 ms, p95 6.35–7.15 ms across final groups. Revisions and checked reuse remove redundant comparisons, but mutable entity/resource validation and compilation remain. High confidence in cost; no further safe broad skip established. |
| 3 | Remaining publication repair and transport | Retained-object and per-publication working-frame clones are removed. Structured-clone worker transport, packing, posting, decode and mutable-record restoration remain. Sparse material publication reduced logical payload 56–57% in the preceding block without a stable fresh-motion gain. Medium confidence in residual cost; waiting is not serialization CPU. |
| 4 | Rendering and GPU | Final GPU group medians 1.61–2.23 ms and p99 2.72–3.75 ms do not explain the much lower fresh-pose rates alone. Earlier GPU tails could exceed 6.06 ms. Batched shadows and copy runs reduce calls, not all required work. No GPU-only diagnosis. |

A 60 Hz producer can support more display poses through interpolation; it is not
automatically a 60 FPS ceiling. It also does not owe a separate producer step every
6.06 ms. Longer delay and asynchronous input have already been tested: they change
latency policy and are not free gameplay-preserving gains. Frozen or blank scenes
cannot establish useful 165 Hz motion. CPU submissions are not physical presents.

The earlier separate profile assigns only 1.884% of its worker sample window to
the exact ranged Wasm kernel. That is not a fresh-motion speedup bound, but it does
not support a large SIMD rewrite. Remaining direct rotation-comparison bookkeeping
is about 0.061% of that main profile; the broader lab snapshot/reset owner is 2.29%,
with its removable enumeration portion unisolated. New sparse entity transport
would require a trustworthy writer revision/ownership contract for all wire fields.
Public mutable resource state prevents treating endpoint identity as permission
to skip liveness checks. GC, native raster state and browser scheduling remain
partly unattributed. These gaps are not labeled solved or universally unavoidable.

## Correctness and operational evidence

The final untimed lane has eight receipts, two seeded resets and 17 rows per reset:
272 captures, 136 paired rows. Gameplay snapshots, evaluated frames, compiled
packets and the new work invariants match. The original strict verifier failed on
two first-control time-zero transform-write counts: 1,406 versus 747 rooftop and
1,205 versus 763 depot. Four cold/warm witnesses prove equal outputs and full
comparisons with zero rig work. A narrowly bounded verifier allowance records the
existing renderer-history difference. **This is not a reset fix.** Raw counts,
the initial failure and the verifier's regression tests remain saved.

Only **1/8 exact image pairs pass**. The largest difference is 32 channel levels
at the same depot pixel in both control and copy candidate, with reversed colors.
Recorded sorted inputs match. This does not establish a driver defect or a new
copy-strategy defect; native per-sample depth/coverage and unrecorded resource
history remain unresolved. Images and the targeted saved-image location audit ran
outside throughput measurements. No tolerance substitutes for exact acceptance.

All 24,446 final timed GPU queries are valid, with zero invalid/disjoint results.
Focus and bounded wake checks pass; both awake guards were released. Owned browser
cleanup reports zero survivors and managed server errors are empty. Chrome
154.0.8037.58, ANGLE D3D11 on the RTX 4070 Laptop, viewport 1366×768, effective DPR
approximately 1, resolution 1 and 4×MSAA are recorded. No custom VSync/frame-limit
flags were supplied; cadence is observed, not inferred from flags. Power remained
on AC with the existing High performance scheme; thermal state and unrelated
desktop activity are not controlled.

Five of 9,317 publication-to-whole-producer joins are missing. They are excluded
from whole-span effect comparisons, never replaced with zeros. Focused rig,
sorter, recipe, verifier and registry tests passed separately from timing; engine,
editor and lab types passed. Earlier package build/consumer checks passed, while
the complete dirty-tree package still exceeds unchanged bundle ceilings. No new
full correctness suite was rerun for this documentation closeout.

## Recommendation and reproduction

Keep the original defaults unchanged. Use the existing tuned control
only diagnostically; keep both `displayRigPreparation` and `transparencyCopy` at
`original`. No configuration qualifies as an accepted cross-arena improvement
under the exact-image requirement, including an assertion that the baseline itself
has passed that requirement.

**One next implementation task:** make seeded reset restore the renderer's
transform comparison/history state, then require cold-versus-warm setter-work
parity without the first-row allowance. Keep native raster repeatability as a
separate acceptance check; fixing setter history alone is not evidence that the
MSAA failure is repaired. This addresses a proved correctness gap before promotion,
not a predicted FPS gain. No further campaign is running.

Use the [working lab](http://127.0.0.1:8807/lab/?arena=rooftop) and import either
[original baseline](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/recommended.json)
or [diagnostic control](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/diagnostic-control.json)
through the panel or `__todLab.import(jsonText)`. The command API's
`__todLab.baseline()` restores the baseline atomically.

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase campaign --plan .local/engine-perf/touch-of-death-lab/campaign-165/display-rig-sort-plan.json --output .local/engine-perf/touch-of-death-lab/campaign-repro
bun.cmd spikes/persistent-world-worker/lab/runner/producer/analyze-producer.ts .local/engine-perf/touch-of-death-lab/campaign-repro
```

Use the matching archived artifact; the runner records a new identity if the active
build changes. Saved [result and evidence index](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/display-rig-sort-result.json),
[raw samples](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/display-rig-sort/campaign/summary.json),
[independent final audit](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/display-rig-sort/final-concrete-avenues-audit.json)
and [configuration recommendation](../../../../../.local/engine-perf/touch-of-death-lab/campaign-165/recommendation.json)
pin source/configuration hashes. The archived
[option inventory](../../../../../.local/engine-perf/touch-of-death-lab/artifacts/1b82bd5c531e56d62a9693ecc1b94e35d8ae9290062c769421d1c1229b9fd548/option-inventory.json)
and [historical inventory](../../../../../.local/engine-perf/touch-of-death-lab/artifacts/1b82bd5c531e56d62a9693ecc1b94e35d8ae9290062c769421d1c1229b9fd548/historical-inventory.json)
state available options and porting gaps. All candidates and failure evidence are
retained.
