# Touch of Death: source-owned primitives comparison

The later [unchanged-transform sampling audit](touch-of-death-entity-sampling-audit.md)
tests the next producer-owned reuse primitive in eight additional trials.

October 12, 2026. Producer-owned numeric-validation reuse is measurably cheaper
inside application, and camera culling measurably reduces submission/GPU work.
Both improve fresh motion in depot; neither establishes a fresh-motion gain in
rooftop. These results justify retaining the engine implementations, not changing
every consumer's default. They do not establish that the existing primitives are
the best JavaScript can provide.

This follow-up adds **16 valid serial trials**, two independent rooftop/depot
A/B/B/A comparisons, to the [previous campaign](touch-of-death-165-audit.md).
There were no combination trials or timing retries. One diagnostic artifact was
built and used throughout:
`24d1b6d76e183dee4fd24f5896bdbcac4ed6970ef5b58af371519d253ae0aa2c`.
The historical campaign's 344 trials are a separate evidence set.

## Comparisons and decision

Camera A disables culling; B uses the current engine-owned conservative packet
culler, including resource checks, finite/shape checks and Float64 bounds.
Journal A uses checked producer transforms; B uses the new bounded, synchronous
producer-owned validation journal. Camera culling is enabled on both journal
sides. All other options in each block match.

Both controls use the previous tuned configuration: compact publication,
working-frame reuse, certified interpolation layout, endpoint producer
application, material revisions, batched shadows, primitive slots and partitioned
rays. They are **not the original full-object lab baseline**. Gameplay, actor
groups, shadows, outlines, lighting, VFX, HUD, post, resolution and MSAA remain
enabled. Simulation/producer targets stay at 60 Hz with fresh-input handshakes
and 16.67 ms interpolation delay. Requested `paced-pipeline` records effective
`pipeline`; there is no claim of a different scheduling implementation.

Values average the two trial statistics; percentiles are not pooled. Variation is
the absolute difference between each side's trials divided by that side's mean,
not a statistical confidence interval.

| Candidate / arena | Changed poses/s, A → B | Effect | Control / candidate spread | Decision |
| --- | ---: | ---: | ---: | --- |
| Camera / rooftop | 76.26 → 72.77 | -4.57% | 5.77% / 28.33% | Drift-inconclusive; no established regression or gain. |
| Camera / depot | 53.91 → 59.75 | +10.82% | 7.36% / 0.05% | Gain exceeds observed variation. |
| Producer journal / rooftop | 69.23 → 74.52 | +7.64% | 11.56% / 1.06% | Drift-inconclusive. |
| Producer journal / depot | 51.36 → 58.23 | +13.38% | 9.05% / 8.27% | Gain exceeds observed variation, with substantial spread. |

The public camera option defaults to **false** after this comparison; the
provisional default-on implementation was not retained. Producer transforms
remain **checked** by default. Both alternatives are available in their engine
owners, and both remain selectable in the existing lab. No experiment was deleted.
No new configuration qualifies for promotion across both arenas, independently
of the still-failing exact-image gate below.

## Current cadence

| Arena / block / side | Steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Repeats | Pose/input age p50, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop / camera / A | 59.87 | 76.26 | 133.07 | 7.25/10.30/12.60 | 77.65% | 42.35% | 25.25/33.95 |
| Rooftop / camera / B | 59.82 | 72.77 | 133.21 | 7.35/10.30/12.75 | 77.88% | 45.41% | 25.65/33.70 |
| Depot / camera / A | 59.81 | 53.91 | 122.56 | 8.05/10.65/13.50 | 89.63% | 55.82% | 27.25/32.20 |
| Depot / camera / B | 59.80 | 59.75 | 133.18 | 7.35/10.20/11.95 | 73.77% | 54.88% | 25.80/32.50 |
| Rooftop / journal / A | 59.84 | 69.23 | 135.75 | 7.15/10.00/12.30 | 74.90% | 48.79% | 26.30/33.15 |
| Rooftop / journal / B | 59.88 | 74.52 | 135.50 | 7.10/10.20/12.20 | 71.02% | 44.74% | 25.68/32.80 |
| Depot / journal / A | 59.85 | 51.36 | 132.98 | 7.35/10.30/12.75 | 76.20% | 61.10% | 27.25/31.70 |
| Depot / journal / B | 59.82 | 58.23 | 135.54 | 7.30/10.20/12.00 | 71.20% | 56.77% | 25.95/31.95 |

### Work saved and retained

| Work / measurement | Rooftop A → B | Depot A → B | Scope |
| --- | --- | --- | --- |
| Camera: CPU submission p50 | 1.80 → 1.50 ms | 1.70 → 1.10 ms | Savings exceed observed within-side variation. |
| Camera: asynchronous GPU p50 | 3.18 → 2.25 ms | 3.13 → 1.60 ms | -29.36% / -48.77%; full shadow workload retained. |
| Camera: recorded draws/display | 1,280 → 717 | 1,249 → 472 | Timed means; differing sampled poses prevent exact matched-count interpretation. |
| Camera: instances offered → retained | 2,053 → 1,003 | 1,833 → 287 | Candidate means; every offered instance remains in shadow input. |
| Camera: uploaded bytes/display | 131,422 → 195,556 | 117,276 → 135,674 | Additional compact camera matrices follow the complete shadow upload. |
| Journal: numeric validations/publication, p50 | 3,391 → 1,764 | 3,389 → 1,755 | 1,627 / 1,634 numeric validations and quaternion hypot calls reused. |
| Journal: producer application p50 | 1.45 → 1.10 ms | 1.50 → 1.20 ms | -24.14% / -20.00%; exceeds observed variation. |
| Journal: whole producer p50 | 9.55 → 9.15 ms | 10.60 → 10.35 ms | -4.19% / -2.36%; both drift-inconclusive. |
| Journal: sampling p50 | 0.80 → 0.80 ms | 0.80 → 0.85 ms | Detached entity allocation/copying still executes. |
| Journal: recorded packing p50 | 0.55 → 0.80 ms | 0.60 → 0.85 ms | No wire omission; the local application saving is not the whole-loop saving. |

The journal adds 210,242 / 210,118 typed bytes, two ID-reference slots per entity,
3,391 / 3,389 sample visits and 10,173 / 10,167 scale comparisons per ordinary
sample. Median source-generation invalidations are 723 / 724, with 1,130 commit
generation writes. These count potential writers, not actual changed values.
Every entity, transform, instance, mesh and material remains live-checked. The
declared 1,199 / 1,190 writable entities always receive numeric validation. Across
the four candidate trials, 19 detached zero-step applications use full checked
fallback; no borrowed frame authority survives return. No producer compile or
full packet publication is reintroduced.

The culler adds bounded command/matrix scratch, 32 bytes per cached mesh sphere,
resource and finite checks, sphere tests and retained-matrix copies. Skinned,
morphed, invalid or unsupported packets retain the original validation/draw path.
No light culling or shadow batching change is included in this candidate.

The counter audit verifies all **9,186 publications and 21,192 displays**, including
resource checks, journal accounting and exact upload formulas. These are logical
storage and upload counts, not measured RAM traffic or cache misses.

## Remaining limits

Representative journal-B spans show what remains after the local optimization.
They are nested/overlapping observations and must not be added.

| Measurement | Rooftop | Depot |
| --- | ---: | ---: |
| Whole producer p50/p95/p99, ms | 9.15/14.35/19.05 | 10.35/13.40/17.65 |
| Producer compute p50, ms | 8.15 | 9.35 |
| Simulation / presentation p50, ms | 1.80/5.25 | 2.20/6.10 |
| Obstruction / application p50, ms | 1.40/1.10 | 2.05/1.20 |
| Actual publication adoption / nested decode p50, ms | 1.05/0.75 | 1.00/0.75 |
| Worker posting p50, ms | 0.60 | 0.70 |
| Display preparation p50/p95/p99, ms | 2.75/4.25/5.00 | 2.90/4.35/5.10 |
| GL submission p50, ms | 1.50 | 1.10 |
| Asynchronous GPU p50/p95/p99, ms | 2.19/3.19/3.97 | 1.68/2.78/3.62 |
| Input wait / message delivery / host wait p50, ms | 4.80/4.65/0.20 | 4.60/4.35/0.20 |
| Buffer wait p50, ms | 0 | 0.05 |
| Publications/s | 57.73 | 57.68 |

1. **Producer presentation and display application remain substantial CPU work.**
   Reusing numeric validity removes about half the numeric checks but none of the
   full entity sampling, material visits, gameplay presentation, obstruction work
   or display compilation. Confidence: high for retained work, moderate for its
   precise contribution to cadence.
2. **Endpoint availability and display scheduling prevent fresh motion on many
   submissions.** About 70% of journal-B rooftop displays and 75% of depot displays
   clamp to the newest endpoint; many repeats also pair equal simulation ticks.
   Bracketed interiors do occur. Equal ticks are not proof of hitstop, and clamping
   alone does not identify CPU starvation. The current 16.67 ms delay and fresh
   input policy stay fixed. Waiting is not CPU execution. Confidence: high for
   missing bracketing, incomplete for scheduler/arrival causality.
3. **Rendering has removable work but is not the sole limit.** Culling reduces GPU
   time in both arenas, yet rooftop fresh motion remains inconclusive. Journal-B
   GPU p50 is 1.68–2.19 ms while producer spans and display preparation are larger.
   Confidence: high for the measured GPU saving; no claim that GPU tails vanish.

Useful 165 Hz motion is still unproven. A 60 Hz simulation can support faster
interpolated display motion; the producer does not intrinsically need one step
per display. These measurements instead show inadequate display cadence and
temporal bracketing under the unchanged latency policy. CPU submissions are not
physical presents. There is no defensible claim that the current primitives are
optimal, or that a wholesale layout rewrite would win.

The next implementation task is to extend the existing producer-owned write
contract into **sampling unchanged entity spans**, instead of allocating/copying
all 3,389–3,391 records and only then reusing their validation. Keep the public
detached sampler and resource checks as fallbacks. This targets proven redundant
work inside producer presentation; the measured sampling span is only about
0.8 ms, so it must not be advertised as removing the entire 5–6 ms preparation.
No such extension or additional campaign was started here.

## Correctness, packaging and evidence limits

Two reset defects were repaired in the owning runtime. Authored transform reset
now clears transform/lease history; material-history reset clears detached
comparison and revision-owner history while preserving live resources and
monotonic epochs. All 55 recorded display-work counters match exactly across two
seeded runs at 17 checkpoints for each of eight arena/configuration cases. The
journal's independent frame and compiled-packet comparisons also match. No
time-zero counter tolerance was added.

Exact decoded image repetition passes **3 of 8 pairs**. The five failures affect
6–28 pixels with maximum channel difference 1–2, including controls and candidates.
This is still a failed exact gate; it was not relaxed or called a repair. Different
renderer versions were not required to match one another.

Focused owner tests and typechecks are recorded in the linked implementation
audits. After selecting default-off, the renderer suite passes 36 tests / 232
assertions. Package build and installed-consumer smoke pass. The current dirty
package still fails 63 bundle checks, including a 47,855-byte raw runtime
distribution overage and a 13,147-byte raw WebGL2-entry overage. Budgets were not
raised; earlier unrelated/experimental changes were already over budget, so this
is not an isolated attribution of every byte to the two candidates. Nothing was
published.

All 21,192 timed GPU queries are valid, with zero invalid/disjoint samples. Trials
used Chrome 154.0.8037.58, RTX 4070 Laptop GPU through ANGLE/D3D11, 1366×768,
DPR approximately 1, resolution 1 and four-sample MSAA. Each trial has 5 seconds
warmup, then a seeded checkpoint/presentation reset and 10 seconds measurement.
Native focus, visibility and bounded awake receipts pass; owned browsers are
gone and the shared managed server remains. Power settings were not changed;
thermal/frequency stability was not measured. Actual browser argv is saved; no
VSync/frame-limit override was requested or inferred from cadence.

Three optional host metadata URLs return 404 because the static lab server does
not implement those playable-host routes. They are preserved in browser logs;
the measured runtime error arrays and managed server error queue are empty.

## Saved evidence and reproduction

The [working lab](http://127.0.0.1:8807/lab/?arena=rooftop) has 74 registered options.
The original 51-option report is historical. The registry and generated inventory
remain the configuration/compatibility owners. The evidence directory is
`.local/engine-perf/touch-of-death-lab/standard-primitives/`:

- `intent.json`, `artifact.json`, `source/`, `camera-plan.json`, `journal-plan.json`:
  the declared contrasts, source/config identity and archived single artifact.
- `camera/analysis.json`, `journal/analysis.json`, their `campaign/` directories:
  complete raw samples, requested/effective settings, trial summaries, launch
  argv, GPU/focus/wake and cleanup receipts.
- `comparison-summary.json`, `counter-audit.json`, `reset-work-audit.json`:
  derived comparisons and explicit work proofs.
- `camera-verification/`, `journal-verification/`, `*-pixels.json`: untimed
  gameplay/frame/packet/storage evidence and exact decoded-image failures.
- `recommendation.json`: unchanged accepted baseline, public default decision and
  fully specified diagnostic candidate; `finalization.json` and
  `bundle-sizes-final.json`: final source/default and package-gate receipts.

The source snapshots precede the final public default decision. The culler itself
and timed artifact remain byte-identical; `finalization.json` records the later
public constructor default change. The lab always selected the strategy explicitly.

Reproduce against the existing artifact, from the repository root, serially:

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase campaign --plan .local/engine-perf/touch-of-death-lab/standard-primitives/camera-plan.json --output .local/engine-perf/touch-of-death-lab/standard-primitives-camera-repro
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase campaign --plan .local/engine-perf/touch-of-death-lab/standard-primitives/journal-plan.json --output .local/engine-perf/touch-of-death-lab/standard-primitives-journal-repro
```

Use the managed server's returned URL through `PERF_URL` if it differs. Do not
rebuild between contrasts. The commands intentionally create new evidence folders;
the completed original trials are not overwritten.
