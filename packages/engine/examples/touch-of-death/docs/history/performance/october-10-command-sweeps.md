# Independent draw and material sweeps — October 10

**Rendering costs separated; no gameplay optimization promoted.** The public-engine
cube fixture now varies draw count at fixed material handles, and equivalent
material handles at fixed draw count. Both comparisons remain callback-paced near
130 Hz. A separate periodic-timer experiment does not restore 165 Hz.

## Controls and correctness

Chrome 154.0.8037.58, RTX 4070 / ANGLE D3D11, visible focused 1366×768 window,
backing ratio 1, normal MSAA, AC and Windows High performance. Each rendering
cohort has eight trials in ABBA/ABBA order, one browser session, three seconds of
warm-up and six seconds retained per trial. The two factors run in separate
sessions. Neither factor yet has an independent confirmation session.

The workload has 1,152 cubes, one mesh, three shading values, two lights, outlines
and 12 transforms alternating each callback. It has no fixed-step simulation,
input, skinning, shadows, post or HUD. This is a rendering fixture, not fresh-motion
gameplay. Both scene stores remain resident. Its 2,304-draw case is comparable in
count to the game's roughly 2,299 calls, not in geometry, state or resource costs.

Command splitting copies six command columns into bounded reusable storage and
borrows pose/light storage. It preserves instance order, mesh, material, skeleton
and flags. Equivalent aliases require multiples of three material handles. All
eight screening configurations have identical per-instance semantic hashes and
byte-identical fixed-tick PNGs under normal AA. This narrow proof does not close
the game's longer production-AA gate. Image readbacks run in a separate campaign.

## Results

Values are medians of four trial statistics; times are milliseconds. CPU submission
and asynchronous GPU query ranges overlap and must not be summed.

| Quantity | Draw sweep: 2,304 → 96 draws | Material sweep: 768 → 3 handles |
| --- | --- | --- |
| Material bindings, including outlines | 96 → 96 | 1,536 → 6 |
| CPU submission p50 / p95 | 1.05 / 1.25 → 0.10 / 0.20 | 1.50 / 1.80 → 1.00 / 1.30 |
| Preparation p50 | 0.10 → 0.10 | 0.10 → 0.10 |
| GPU query p50 | 5.62 → 0.90 | 7.11 → 5.83 |
| Callback rate | 130.51 → 130.40 | 130.59 → 130.65 |
| Paired callback effect, 95% interval | −0.10% [−0.85%, +0.65%] | −0.03% [−0.40%, +0.34%] |
| CPU submission interval p95 / p99 / p99.9 | 8.30 / 8.60 / 8.95 → 8.30 / 8.60 / 8.80 | 8.30 / 8.60 / 9.20 → 8.25 / 8.60 / 8.90 |

The draw cohort retains 6,267 frames; the material cohort 6,266. All GPU queries
are valid. Every recorded CPU submission interval exceeds 6.06 ms. Geometry work
and upload bytes remain fixed: 27,648 triangles and 73,728 bytes per frame including
outlines. Partition cost is separately recorded; its median is below the 0.1 ms
clock granularity, which does not establish zero cost.

Paired CPU-submission p95 ratios are 6.24× [5.80×, 6.72×] and 1.41×
[1.28×, 1.56×], respectively. These are exploratory four-pair log-ratio Student
intervals, not percent time saved or independent-session proof. Callback spread
is below 1%, while GPU p50 spread reaches 55.7% in the high-draw control and
41.3–47.1% in the material cohort. The material GPU effect is inconclusive;
the draw GPU magnitude also needs drift attribution. Boundary GPU temperatures
are 67°C with low idle clocks; these do not establish in-window clocks or thermal
stability. CPU temperature, in-window utilization, GC and residency are unobserved.

**Decision:** batching and material grouping have measurable submission costs in
this fixture. No end-to-end rate gain is demonstrated. Repeat under explained
cadence/clock conditions before using these magnitudes for library design. Retain
the earlier full-game preparation and scheduling priorities.

## Timer hypothesis

A separate visible empty-page ABBA/BAAB cohort retains 660 intervals per trial
after 165 warm-up callbacks. The candidate adds a requested 1 ms main-thread
interval; it delivers approximately 4 ms median intervals. Four paired effects
give −0.21% [−0.77%, +0.34%] callback-rate change. All eight trials remain
130.34–131.52 Hz, p50 7.60 ms and p95 8.20 ms. Reject this timer as a workaround;
it does not explain the earlier 130↔165 transitions. No OS or driver setting changed.

## Reproduction and retained evidence

Evidence lives in `.local/engine-perf/generic-command-sweeps-20261010/`: frozen
`sources.json` and `manifest.json`, `cases.json`, `draw-cases.json`,
`material-cases.json`, image diagnostic/validation, two `*-abba-session-1.json`
raw cohorts and `*-effects.json`, and `timer-cadence-session-1*`. All three timing
browsers and the image browser have empty cleanup receipts. Retain until the
dependent architecture and drift decisions are resolved.

The [scene-ceiling runner](../../../../../../../spikes/scene-ceiling/README.md)
owns build/run commands and `generic-effects.ts` flags. For these rendering
cohorts use the frozen root, the corresponding case file, four repetitions,
`PERF_RENDER_WARMUP_MS=3000`, `PERF_RENDER_MEASURE_MS=6000`, and
`PERF_GENERIC_IMAGES=0`. The saved plans pin the remaining inputs. The
[cadence runner](../../../../../../../spikes/persistent-world-worker/README.md)
owns timer modes and paired analysis; its saved plan records the exact order.
