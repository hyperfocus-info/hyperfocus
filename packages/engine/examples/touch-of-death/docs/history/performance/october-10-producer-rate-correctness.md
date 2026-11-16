# Producer-rate correctness and clock boundaries — October 10

**A 60 Hz producer preserves this replay's gameplay, but interpolation and live
latency remain untested.** The experiment also found a floating-point clock
boundary discrepancy that would bias a naive rate comparison. Its correction is
private; no production clock or renderer change is promoted.

## Workload and observation

One compact-rooftop checkpoint, seed 714, four logical seconds of fighting,
neutral player input, unchanged AI and fixed 60 Hz simulation. Each producer rate
uses both inline and worker owners with full numeric-packet, presentation-sequence,
per-frame standalone simulation and independent pose oracles. Chrome 154.0.8037.58
is visible/focused at 1366×768 on the RTX 4070 with normal MSAA. These manual
captures include hashing and image readbacks: they provide correctness evidence,
not throughput, physical presentation or input-to-visible latency.

The current worker advances simulation inside `world.render()` and stops producing
when input or packet storage is unavailable. It has no independent simulation
publisher. The existing packet exposes final instance matrices and skin palettes,
not the local joint poses needed for correct interpolation. Linear interpolation
of these final matrices is not an acceptable architecture shortcut.

## Boundary discrepancy and private candidate

At 60, 120 and 165 producer samples/s, the unmodified clock completes 239 fixed
steps by exactly 4,000 ms. Gameplay hashes agree at matching committed steps.
At five shared timestamps (133⅓, 266⅔, 533⅓, 1,066⅔ and 2,133⅓ ms), however,
the 60 Hz replay is one committed step behind the 165 Hz replay. Repeated subtraction
leaves its accumulator just below the fixed-step threshold. Its nominal 60 Hz
schedule also includes two zero-step samples and one two-step sample.

The private candidate admits boundaries within a bounded rounding allowance:
`min(stepMs × 1e-6, 8 × Number.EPSILON × max(1, abs(nowMs), stepMs))`.
It retains signed rounding debt rather than discarding it. The original source
and generated mailbox bundle are the only changed source-graph entries; the
rebuilt unmodified control has identical main/worker executable hashes to the
existing artifact. This is a numerical scheduling experiment, not an FPS change.

Pure-clock tests cover 60/120/165/240 Hz through ten logical minutes, real
pre-boundary timestamps, repeated timestamps, event consumption, pause, catch-up
limits, monotonicity and disposal. The corrected real replay completes 240 steps
at all three rates, with no shared-timestamp discrepancies. All overlapping
committed states match the unmodified clock; the final additional step is checked
against the independent standalone simulation oracle.

## Corrected-clock results

| Producer samples/s | Prepared frames | Fixed steps | Zero-step preparations | Changed pose comparisons | Repeated pose comparisons / longest run |
| --- | ---: | ---: | ---: | ---: | ---: |
| 60 | 241 | 240 | 0 | 184 | 56 / 14 |
| 120 | 481 | 240 | 240 | 184 | 296 / 29 |
| 165 | 661 | 240 | 420 | 184 | 476 / 41 |

Pose identity includes submitted instances, joints, morphs and camera; it is not
pixel identity or proof of a physical present. Some repeated poses accompany
legitimate gameplay updates or holds. Interpolation must preserve intentional
holds rather than fabricate movement. Logical first-observation lag has p50/p95
0/0 ms at aligned 60 and 120 Hz, and 3.03/4.55 ms at 165 Hz. These are synthetic
sampling offsets, not measured real-time pose age or input latency.

Across both clocks, 5,532 frame states pass the standalone oracle and 5,532 pose
observations pass the independent pose oracle. The original and corrected clock
each pass cross-rate gameplay-state comparisons. All 18 inline/worker normal-AA
checkpoint pairs pass the existing ≤100 changed pixels / ≤3 channel-difference
gate; two corrected-clock pairs are not byte-identical (21 pixels at difference 1,
and one pixel at difference 3). Six additional cross-rate checkpoints pass: 60 vs
165 Hz is exact at all three checkpoints; 60 vs 120 differs by two pixels at
difference 1 only at the final checkpoint. This short proof does not resolve the
earlier long-run MSAA variation.

**Next milestone:** use the corrected clock only as an experimental control while
building owned presentation endpoints with local TRS/joints, explicit discontinuity
and resource versions, and bounded lifetimes. Then compare live current scheduling,
60 Hz production plus display-rate interpolation, and an evidence-driven third
schedule. Measure pose age and visible response against the direct control before
accepting any added interpolation delay. KO/recovery, restore/input schedules,
other arenas, skinned crowds, sustained runs and production acceptance remain open.

## Evidence and reproduction

The next component milestone now has a private
[local skeletal pose history](../../../../../../../spikes/persistent-world-worker/presentation/README.md).
Six tests (291 assertions) cover analytic joint motion, ownership, held poses,
shortest-path rotation, discontinuities, invalid publications and excessive
endpoint gaps. The final visible RTX 4070 browser capture matched all seven
analytic-reference images exactly under normal MSAA after identical warm-up
sequences. Both owned browsers cleaned up successfully. Focused TypeScript
checking passed. These are untimed component checks, not full-game parity or a
performance gain. Game endpoint integration and live latency remain open.
Local evidence: `.local/engine-perf/local-pose-history-20261010/retained-metadata/`;
retain until the interpolation integration decision is resolved.

The primitive fighter requires a different adapter. An untimed 2,535-sample
characterization of the existing `blendArtMotion` found 240 endpoint failures
among 1,014 endpoint checks: every weight-zero sample in the two locomotion
sequences. Maximum joint coordinate error was 6.265 mm, despite bone lengths
remaining correct within numerical precision. The blend inherits the destination's
`authored` knee data even at weight zero. Substituting the source's authored fields
at that endpoint reduced all transform differences below 2.5e-15, isolating the
cause. Do not reuse this transition blend unchanged for display interpolation.

Interior joint coordinate differences from direct fractional source sampling
reached 62.316 mm for light and 23.015 mm for heavy. These are approximation
diagnostics, not evidence of gameplay or image failure; the source sampler is not
a continuous gameplay oracle. The next adapter needs exact endpoints, continuous
joint reconstruction and explicit handling of authored poles and attachments.
No production presenter changed. TypeScript checking passed. Raw rows and source
hashes: `.local/engine-perf/fighter-blend-20261010/attribution/fighter-blend.json`;
retain until the primitive fighter interpolation decision is resolved. The
[presentation probe instructions](../../../../../../../spikes/persistent-world-worker/presentation/README.md)
own reproduction and scope.

The private `local-joints` candidate now passes 1,254 exact endpoint checks across
4,389 samples; the existing blend fails 360 checks in that expanded cohort. The
cohort includes walk, mixed walk/run and run instead of the original speed 3/7
inputs, which both saturate the run blend. At weights 1e-6 and 1-1e-6, candidate
joint coordinate error against fractional source sampling stays below 1.41e-7 m.
Interior approximation errors remain; endpoint fidelity does not establish the
right motion between endpoints. Fixed bone lengths remain within 6.7e-16 m.

The refined fighter browser fixture passes 16 normal-MSAA comparisons exactly:
12 endpoint pairs, two held poses and two interior redraw checks. A box tool uses
the production attachment presenter; unit tests verify the two-handed shaft.
The final run has no browser errors or focus losses, and both owned browsers
cleaned up. Ten presentation tests / 345 assertions and focused TypeScript checking
pass. Evidence is under `.local/engine-perf/fighter-blend-20261010/`, specifically
`gait-local-joints/`, `gait-transition/` and `gait-browser/`; retain until integration
and interpolation decisions are resolved.

This candidate allocates intermediate motion records and remains outside the
production schedule. [Real presenter endpoint capture](october-10-fighter-endpoints.md)
now proves reconstruction and restore provenance; resource/teleport/weapon-identity
invalidation still precedes live scheduling. Whole-game camera/HUD/effects, KO, image parity, memory/copy costs and
input latency remain gates. No throughput gain or 165 Hz claim follows from these
untimed component results.

Root: `.local/engine-perf/fixed-render-fifo-20261009/roof/`. The six
`producer-rate-{60,120,165}` / `producer-clock-{60,120,165}` captures retain both
owners, hashes, raw committed-state sequences and images. `producer-rates-rate-parity.json`
and `producer-clock-rate-parity.json` own cross-rate results; `clock-build-check.json`
and `producer-clock-state-compatibility.json` own source/state compatibility.
Image plans, pixel reports and cleanup receipts remain beside them. Retain these
until the scheduling and production-clock decisions are resolved.

The [worker runner](../../../../../../../spikes/persistent-world-worker/README.md)
owns commands. Use `verify.ts` with `PERF_PROVENANCE=1`,
`PERF_RETAIN_STATE_SEQUENCE=1`, `PERF_COUNT_VISUAL_CHANGES=1`, the same frozen
artifact/workload and `PERF_CAPTURE_HZ` set to each rate. Checkpoints are 0, one
second and four seconds in that rate's frame indices. The saved receipts distinguish
the two clocks; do not pool them or compare hashes by sample index across rates.
