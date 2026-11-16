# Touch of Death lab: fresh-motion follow-up, October 10, 2026

Later implementation: [working-frame clone removal](touch-of-death-working-frame-reuse.md).
The live lab now serves that build. This report's original artifact is preserved
in [its hash archive](../../../../../.local/engine-perf/touch-of-death-lab/artifacts/47654f4721553967751f9c25f8312c3b4fe6290f359f2ce05e46464763f67170/).

**Endpoint serialization and cloning are the largest supported bottleneck in this
instrumented lab.** Compact publication improved changed-pose rate by 60% in
rooftop and 59% in depot. It still delivered only 28–33 changed poses/s. No tested
configuration qualified for promotion across both arenas: exact same-version
image repeatability failed. Keep the original baseline as the conservative
reference, not as a claim of validated 165 Hz gameplay.

The [existing lab](http://127.0.0.1:8807/lab/?arena=rooftop) and its 51-option
contract were reused. No game artifact was rebuilt or instrumented further.
Artifact SHA-256 remains
`47654f4721553967751f9c25f8312c3b4fe6290f359f2ce05e46464763f67170`.
All evidence is under
[fresh-motion](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/):
[analysis](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/analysis.json),
[recommended configuration](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/recommended.json),
[unpromoted compact candidate](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/candidate-compact.json),
[primary raw samples](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/primary/),
and [targeted diagnostic](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/diagnostic/).

The prior evidence was audited before launching a browser. All 25 saved raw trials
reproduce their summaries: 2,966 submissions and 7,583 fixed steps. There were
21 coarse trials and one freeze ABBA, not three completed repeat blocks. Baseline
coarse submissions ranged 12.75–24.45/s; changed poses ranged 11.84–22.11/s. The
freeze repeat reached 81.26–82.86 submissions/s with **zero changed poses**.
Its controls reached 13.31–15.32 submissions/s and 12.15–13.91 changed poses/s.
The [prior audit](../../../../../.local/engine-perf/touch-of-death-lab/fresh-motion/prior-audit.json)
contains every trial, tails, phase measurements, variation and exclusions.

Correctness evidence is separate: 134 seeded reversals, 134 live transitions and
12 exact 100-ms image pairs are saved. The raw test log proves **12 tests / 294
assertions**; the verification receipt claims 13 / 302 without the updated raw
log. Passing game suites were not rerun. Thirty-seven controls had never been
varied in timing. This campaign adds publication, material revisions and shadow
batching; the other 34 remain untimed. The existing
[historical inventory](../../../../../.local/engine-perf/touch-of-death-lab/historical-inventory.json)
still records unported pools/interning, rejected shader pairs, external replay,
synthetic/service-removal/Wasm fixtures, detailed observers and retained lookup
work without reversal controls.

The follow-up completed **24 primary trials**: three contrasts, two arenas, ABBA.
One permitted diagnostic added a rooftop ABBA for exclusive object adoption.
Every trial warmed for 5 seconds, then restored the original seeded checkpoint
and empty presentation history immediately before measuring 10 seconds. Warmup
warms browser/resources; world reconstruction is excluded from measurement.
Rooftop seed is 5; depot seed is 3. Checkpoint hashes, requested/applied/effective
configuration, artifact/frozen-source/runner hashes and exact runner source copies
are saved with each result. There were no simulation or visibility ablations.

Chrome 154.0.8037.58 ran visibly and natively focused, serially, at 1366×768,
unit DPR, scale 1 and 4-sample MSAA on the RTX 4070 Laptop. Camera, interpolation
delay (16.667 ms), 60 Hz producer selection, two worker buffers, paced-pipeline
scheduling, power plan and launch profile stayed fixed. Actual command lines are
saved: inherited limits, with no VSync/frame-limit override. AC, battery saver off
and High performance remained unchanged. GPU boundary clocks were 210–240 MHz;
clocks/thermals were observed, not locked. The 165 Hz desktop mode does not prove
physical presentation cadence.

Across 28 trials: **7,744 submissions, 5,912 changed poses, 1,804 repeats, 28 initial
incomparable poses, 16,790 fixed steps, zero dropped simulation time**. All 7,744
asynchronous GPU queries were valid; none were absent, invalid or disjoint. Native
foreground and page focus/visibility checks passed. All three bounded awake
guards released without expiry or suspected sleep. Timing browsers were closed
and their process identities verified absent. Three optional discovery endpoints
returned startup 404s per arena; no game/worker or managed-server runtime errors
were recorded.

The initial runner falsely flagged all primary viewports because visible Chrome
reported DPR `1.0000000298023224`. Every trial had that identical DPR and a
1366×768 canvas. Offline validation uses a 1e-6 tolerance; original flags remain
in the raw files. There are no remaining invalid timed trials. No trials were
repeated to correct this flag. Builds, tests, captures, traces and other audit
browsers were absent from timing windows.

The following cells are means of the two trial statistics, not pooled percentiles.
“Compact” is the fastest measured candidate, **not a best valid configuration**.

| Arena/configuration | Fixed steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Repeats per trial | Pose age p50/p95, ms |
| --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| Rooftop baseline | 59.77 | 20.52 | 25.42 | 39.30 / 44.05 / 49.85 | 100% | 48 / 47 | 71.15 / 79.90 |
| Rooftop compact | 59.85 | 32.81 | 41.53 | 23.60 / 29.30 / 36.05 | 99.87% | 87 / 83 | 45.50 / 55.60 |
| Depot baseline | 59.71 | 17.93 | 24.68 | 40.45 / 44.95 / 48.30 | 100% | 69 / 63 | 72.90 / 78.65 |
| Depot compact | 59.83 | 28.44 | 40.34 | 24.05 / 29.55 / 35.40 | 100% | 122 / 112 | 45.75 / 55.15 |

Applied-input-age proxy medians are 71.15 → 45.55 ms rooftop and 72.90 → 45.75 ms
depot. Compact repeats account for 20–21% / 29% of submissions, versus baseline
19% / 26–27%. Higher submission rates did not eliminate repeated poses.

| Contrast | Changed-pose effect | Control spread / candidate spread | Decision |
| --- | ---: | ---: | --- |
| Compact, rooftop | +59.92% | 0.87% / 8.77% | Large diagnostic gain; image gate fails |
| Compact, depot | +58.67% | 1.71% / 7.91% | Large diagnostic gain; one exact image pair passes |
| Revisions, rooftop | −3.87% | 0.99% / 10.19% | No consistent gain |
| Revisions, depot | −2.67% | 2.49% / 5.39% | No gain; submission difference is drift-inconclusive |
| Shadow batching, rooftop | +3.94% | 2.84% / 0.38% | Small signal, low confidence |
| Shadow batching, depot | +2.06% | 4.82% / 1.20% | Drift-inconclusive; stopped |
| Object adoption, rooftop diagnostic | +24.29% | 5.23% / 18.15% | Copy-removal signal; substantial candidate variation |

Spreads are pair ranges divided by pair means, not confidence intervals. No
combination was measured: no candidate passed exact self-repeatability in both
arenas, revisions brought no gain, and depot shadow cadence was drift-explained.

| Rank / bottleneck | Measured execution and work | Confidence and remaining work |
| --- | --- | --- |
| 1. Endpoint cloning and message serialization | Baseline main publication 26.65/27.35 ms → compact 15.60/15.80 ms, rooftop/depot. Worker `postMessage` wall time 5.00/5.10 → 0.55/0.55 ms. Compact packing 0.50 ms and decoding 0.50–0.60 ms. Retained full-object clones 1/publication → 0. | High confidence this is expensive CPU work. A working-frame clone still occurs once/publication. Producer gameplay/presentation, render-packet write/read, message delivery, decoding, application and all drawing remain. |
| 2. Producer preparation and full display application | Compact producer compute medians 10.55/11.20 ms; display preparation 2.55/2.65 ms. Revisions reduce display deep material checks 1,702 → 8.6–9.3 and 1,717 → 11.8 per submission; preparation improves about 0.65/0.60 ms. | High confidence in counts, no demonstrated whole-loop revision gain. Every display still visits 3,391/3,389 entities, validates about 1,700/1,712 material resources and applies/compiles once. Producer still checks all 1,702/1,717 materials/publication. |
| 3. Shadow commands and GPU workload | Batching reduces shadow draws about 976 → 222 rooftop and 875 → 293 depot. Whole WebGL submission medians 1.95 → 1.60 and 1.80 → 1.55 ms; whole-renderer GPU medians 8.10 → 7.56 and 6.58 → 6.39 ms. | Command reduction is proven; fresh-motion effect is weak/inconclusive. Shadow command scans, geometry, light preparation, main/outline passes and uploads remain. No separate shadow-pass CPU/GPU duration is available. |

The adoption-only diagnostic changes `publication=owned`, preserving full-object
worker messages and disabling packing/decoding. Main publication medians change
27.4/26.3 → 16.6/13.6 ms; copied publications become zero and working clones remain
282/349. Changed poses rise 20.03/21.11 → 23.24/27.88 per second. Worker post time
remains 7.9/4.9 ms versus 5.1/4.9 in controls. Its p95 intervals are 46.2/33.1 ms
versus 45.0/43.5: no consistent tail improvement. This supports the redundant
retained clone as a cost, while compact additionally reduces serialization.
The separate blocks do not permit adding their gains or assigning all residual
publication time to a single clone instruction.

Worker input waiting falls about 27.6/28.0 → 12.6/12.2 ms with compact; buffer
waiting falls 15.5/15.4 → 10.0/9.2 ms. These are backpressure/waiting, not CPU
execution. Receiver deserialization is not isolated from message delivery.
Synchronous CPU-path spans are wall durations and can include GC or preemption.
Baseline producer compute is 10.9/12.25 ms, including simulation 3.25/3.80 ms and
presentation 5.25/6.00 ms. Producer apply is about 2.1–2.3 ms and compile-only
0.2–0.3 ms; these are nested measurements, not extra additive costs.

No candidate removes query scans, entity application, physics, AI, environment,
actors, post, HUD, shadows or resource-liveness checks. Batching preserves sampled
instance totals and uploads. The untimed 1-second checkpoint has identical
aggregate dispatched instances (20,150 rooftop / 18,755 depot across the manual
probe's multiple draws) in baseline and batching, and final uploads 125,632 /
116,672 bytes. The main/outline triangle counter is unchanged; a separate shadow
triangle counter is missing. Timed uploads remain approximately 131 KB / 117 KB
per submission. Material comparisons—not all material work—are removed by revisions.

Packet storage remains two buffers: 1,447,048 / 1,450,632 bytes. Material comparison
capacity stays 224,664 / 226,644 logical bytes in 3,404 / 3,434 buffers. Compact
adds one reusable packer buffer, 781,672 / 785,500 bytes, with one recorded packer
allocation; 81,566 / 81,966 numbers and 32,286 / 32,443 indices are written per
pack. Decoding uses the existing two-slot object storage. Numeric copy accounting
increases from 723,524 / 725,316 to 1,505,196 / 1,510,816 bytes/publication because
it now includes compact data; opaque full-object clones are excluded. These are
logical bytes, not measured RAM traffic or cache misses. Heap boundaries span
84–469 MB across trials; allocation rate, retained heap and GC cost were not measured.

Compact whole-renderer GPU p50/p95/p99 is 4.86/6.63/7.17 ms rooftop and
4.46/5.99/6.67 ms depot, versus baseline 7.44/8.58/10.67 and 6.61/7.73/9.92 ms.
Compact does not remove graphics work: that GPU-time change must not be credited
as a GPU optimization. Cadence/driver/clocks were not isolated. Async GPU durations
exclude Canvas2D/HUD/compositing and overlap CPU work; do not add them.

Useful 165 Hz motion is currently prevented primarily by CPU serialization and
cloning on the producer-to-display path, with substantial producer work remaining.
Even compact publication alone costs 15–16 ms on the main thread. Scheduling is
also relevant: every primary sample is an endpoint or a snap, **none is an interior
interpolated pose**. Baseline usually exceeds the 33.34-ms endpoint-span guard;
compact mostly reaches current endpoints. The existing 16.667-ms delay and
backpressure policy were held fixed, so their independent ceiling remains unknown.
GPU tails can also exceed 6.06 ms. This is not a GPU-only limit, a proven physical
present rate, or evidence that a cached scene can deliver 165 Hz gameplay.

Redundant work demonstrated here is the second retained full-object copy and
repeated deep material comparisons. Working-frame cloning remains the largest
measured display cost category, although its exact instruction-only time is not
isolated. Fresh gameplay still requires simulation, changed-pose presentation,
resource validation and drawing; freezing or hiding that work is not an optimization.

The longer image lane first exposed inconsistent histories after worker-setting
transitions. Those initial receipts are retained in `images/`; they are not valid
repeatability pairs. The runner was corrected to perform an explicit existing-worker
reset for both repeats, matching the timed protocol. All eight normalized
1-second gameplay snapshots then matched. Exact decoded pixels still differed:

| Version | Rooftop changed pixels / largest channel delta | Depot changed pixels / largest channel delta |
| --- | --- | --- |
| Baseline | 0 / 0 | 18 / 15 |
| Compact | 9 / 2 | 0 / 0 |
| Revisions | 18 / 1 | 15 / 2 |
| Shadow batching | 8 / 1 | 15 / 2 |

These are same-version comparisons, not comparisons between renderer versions.
The existing image-parity owner decoded saved PNGs outside timing and failed its
exact gate. Differences are small but the gate was not relaxed. Their cause was
not investigated, and AA/shaders were not changed. Adoption-only has no new image
acceptance evidence. Therefore **fresh motion improved in diagnostic timing, but
no tested optimization satisfied all requirements across both arenas**.

One next implementation task: **remove the remaining per-publication working-frame
`structuredClone` in the existing display owner using its ownership-safe reuse
path**, retaining resource-liveness checks and proving deterministic seeded history
and same-version images before promotion. This report does not start that work.

Reproduce deliberately from the repository root, using the existing artifact and
managed server's returned URL (`PERF_URL` if different):

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase images --output .local/engine-perf/touch-of-death-lab/fresh-motion-repro/normalized
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase primary --output .local/engine-perf/touch-of-death-lab/fresh-motion-repro
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase diagnostic --output .local/engine-perf/touch-of-death-lab/fresh-motion-repro
```

Each phase refuses reuse of a started output directory. `primary` is exactly 24
trials; `diagnostic` is exactly the one four-trial rooftop adoption block. The
saved plan/source copies document the original run, including the DPR correction.
No further timing or combination campaign was launched. Runner typechecking and
process policy passed; these checks are not performance evidence.
