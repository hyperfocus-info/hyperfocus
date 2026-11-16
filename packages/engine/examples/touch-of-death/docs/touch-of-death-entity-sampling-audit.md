# Touch of Death: unchanged transform sampling

October 12, 2026 local time. **Immutable TRS reuse does not earn promotion.**
It removes nearly half of the sampled transform allocations and source lookups,
but saves only 0.05–0.10 ms in sampling. Rooftop fresh-motion improvement is
drift-inconclusive; depot is slower with substantial candidate variation.
Keep `producerSampling=detached`. The alternative remains selectable for diagnosis.
This does not establish that JavaScript or the existing primitives are exhausted.

This is one implementation and eight serial A/B/B/A trials, rooftop then depot,
using the existing lab. There were no additional contrasts, timing retries or
combination trials. The [previous source-owned comparison](touch-of-death-standard-primitives.md)
is separate evidence. The current artifact has 75 controls:
`b121059fbd6c062f08256eeb0d55d48703a81f11049e569a16311bf0bb6fca9f`.

## What changed

`withSampledFrame({ entitySampling: 'immutable-trs', ... })` reuses frozen,
engine-owned position/rotation/scale tuples for undeclared, nonvolatile writers.
Frames, entity arrays and entity shells remain fresh. Commands, source changes,
authored scale changes and resets replace or invalidate tuples; escaped old
tuples cannot be changed. Motion/physics sources and declared writers remain
detached. Unsupported timelines or callbacks without the writer contract use
the checked detached path. Public `sampleFrame()` and default callback behavior
remain independently mutable. Resource validation remains in every mode.

The implementation extends the existing journal and frame sampler, with 39
sampling counters. The lab registry, atomic world reset, JSON/URL contract,
command API, build recipe and existing verification/analysis runner use the same
option. No game-specific ownership rule enters the engine.

A is the previous tuned diagnostic configuration with the owned validation
journal and detached sampling. B changes only `producerSampling`. A is **not the
original full-object lab baseline** and is not a universal engine recommendation.
Both retain full gameplay/rendering, camera culling, batched shadows, compact
publication, working-frame reuse, MSAA, 60 Hz simulation/producer targets,
fresh-input handshakes and 16.67 ms interpolation delay. Requested
`paced-pipeline` still records effective `pipeline`.

## Measured result

Each trial warmed for 5 seconds, restored the seeded checkpoint and presentation
history, then measured for 10 seconds. Same 1366×768 viewport, DPR, camera,
resolution and four-sample MSAA; Chrome 154.0.8037.58, RTX 4070 Laptop/D3D11,
AC power and existing High performance power plan. No OS/driver settings changed.
The inherited launch profile adds no VSync/frame-limit flags. No capture, tests,
builds or other audit browser ran during timing.

Numbers average two trial statistics, not pooled percentiles. Spread is the
absolute trial difference divided by the side's mean, not a confidence interval.

| Arena | Changed poses/s, A → B | Effect | A / B spread | Decision |
| --- | ---: | ---: | ---: | --- |
| Rooftop | 65.26 → 72.84 | +11.62% | 14.68% / 17.16% | Drift-inconclusive. |
| Depot | 63.76 → 54.09 | -15.17% | 5.97% / 24.51% | Both B trials below both controls; magnitude is candidate-inconsistent. |

| Arena / side | Steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Repeats | Pose/input age p50, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop A | 59.81 | 65.26 | 134.79 | 7.20/10.10/12.75 | 73.96% | 51.39% | 27.00/32.65 |
| Rooftop B | 59.85 | 72.84 | 133.71 | 7.30/10.15/12.45 | 78.52% | 45.33% | 26.30/33.45 |
| Depot A | 59.82 | 63.76 | 144.82 | 6.60/9.90/11.50 | 61.05% | 55.73% | 25.55/32.50 |
| Depot B | 59.83 | 54.09 | 140.21 | 6.90/9.90/12.40 | 65.75% | 61.36% | 26.75/31.85 |

| Recorded span, p50 ms | Rooftop A → B | Depot A → B |
| --- | ---: | ---: |
| Whole producer, including metadata/packing | 10.10 → 9.45 | 10.10 → 10.95 |
| Producer compute | 9.10 → 8.50 | 9.20 → 9.90 |
| Simulation | 1.95 → 1.75 | 2.15 → 2.20 |
| Producer presentation | 5.80 → 5.50 | 6.00 → 6.65 |
| Sampling | 0.90 → 0.80 | 0.90 → 0.85 |
| Game presentation | 3.55 → 3.45 | 3.75 → 4.45 |
| Obstructions, nested in game presentation | 1.65 → 1.75 | 2.10 → 2.70 |
| Endpoint application | 1.30 → 1.40 | 1.15 → 1.25 |
| Main preparation | 2.90 → 2.95 | 2.70 → 2.90 |
| Actual publication adoption | 0.95 → 0.90 | 0.90 → 1.10 |
| CPU draw submission | 1.50 → 1.50 | 1.10 → 1.10 |
| Asynchronous GPU drawing | 2.14 → 2.26 | 1.61 → 1.56 |
| Worker postMessage | 0.60 → 0.60 | 0.60 → 0.60 |
| Input wait | 4.65 → 4.50 | 4.10 → 4.30 |
| Buffer wait | 0.00 → 0.00 | 0.00 → 0.05 |
| Message delivery wait | 4.45 → 4.25 | 3.85 → 4.00 |

Rooftop's 0.10 ms sampling saving repeats in both trials. Depot's 0.05 ms mean
saving is smaller than candidate variation. Depot obstruction solids rose
0.40→0.70 ms and followers 0.80→1.15 ms; unchanged paired work/output proves this
is not an intentional removal of gameplay. Frozen-array access effects are a
possible explanation, **not a measured cause**. No JIT/cache-miss attribution was
collected. Whole-producer p95/p99 are 15.90/22.35→15.60/23.00 ms rooftop and
13.20/17.10→13.95/16.90 ms depot. Local allocation savings are insufficient evidence
to select a new default.

## Work accounting

Warm prepared-sample counts below exclude the first cold sample and zero-step
preparation reuse. Both are retained and separately verified in raw evidence.

| Work per prepared sample | Rooftop A → B | Depot A → B |
| --- | ---: | ---: |
| Fresh entity records | 3,391 → 3,391 | 3,389 → 3,389 |
| Fresh TRS vectors | 10,173 → 5,292 | 10,167 → 5,265 |
| Source Map gets | 10,173 → 5,292 | 10,167 → 5,265 |
| Scalar copies | 20,346 → 10,584 | 20,334 → 10,530 |
| Scalar writes, including computed quaternions | 33,910 → 17,640 | 33,890 → 17,550 |
| Yaw quaternion constructions | 3,391 → 1,764 | 3,389 → 1,755 |
| Trigonometric calls | 6,782 → 3,528 | 6,778 → 3,510 |
| Authored scale comparisons | 10,173 → 10,173 | 10,167 → 10,167 |
| Additional retained tuple arrays | 0 → 4,881 | 0 → 4,902 |
| Additional generation-buffer bytes | 0 → 54,256 | 0 → 54,224 |

B retains 16,270/16,340 scalar values and 10,173/10,167 reference-capacity slots,
in addition to the existing 62-byte/entity journal. Each world creates three
reference arrays and two typed arrays/buffers once. It freezes 4,881/4,902 tuples
on the first sample; subsequent timed samples add no freezes or cache misses.
Old tuples retained by callers are outside this bounded owner cache. These are
logical storage/construction counts, not measured heap allocation or RAM traffic.

All **4,567 publications and 11,041 displays** passed the saved counter audit.
Producer visits, numeric/live resource validation, material sampling, packing and
publication remain. Zero-step reuse accounts for 32 publications and executes no
sampling. Paired untimed rows preserve exact producer, display, draw, upload and
packet work; no bytes or rendering work are intentionally omitted by B.
The display `materialResourceChecks` counter covers matching-form checks, while
changed materials use validating writes; it is not a count of every resource
validation. The audit checks both paths without treating missing work as zero.

## Correctness, limits and next task

37 focused engine tests (344 assertions), 6 verifier tests (112 assertions),
14 registry tests (458 assertions), engine/lab TypeScript checks, package build
and external installed-consumer smoke passed. The untimed lane checks two reset
runs at 17 checkpoints for A/B in both arenas: 68 paired comparisons, with exact
gameplay, frame and independent packet evidence and no initial-sample waiver.
Both B image-repeat pairs and rooftop A pass exact decoded pixels. Depot A fails:
30 changed pixels, maximum channel difference 2. That broader repeatability gap
remains; the candidate's two passing pairs do not resolve it.

All 11,041 timed GPU queries were valid; zero invalid/disjoint samples. Visibility,
focus and bounded awake checks passed, with no suspected sleep. Browser cleanup
records zero owned processes/windows; the shared managed server remains running.
Untimed runtime error arrays and supervisor errors are empty. The browser log
records six console 404s for the static fixture's optional metadata requests.
Bundle budgets still fail 63
checks in this dirty tree; this change adds 3,978 raw / 1,251 gzip / 1,119 Brotli
bytes to the previous runtime distribution. No budget was increased.

| Rank | Remaining gap | Evidence and confidence |
| --- | --- | --- |
| 1 | Producer presentation execution | 5.8–6.0 ms in A, with 3.55–3.75 ms game presentation and 1.65–2.10 ms nested obstruction work. High confidence in cost; reuse here is not yet proved safe or faster. |
| 2 | Endpoint availability and scheduling | A publishes 56.37/57.77 times/s; most submissions use endpoints, with 51–56% repeated poses and roughly 4 ms message/input waits. High confidence in observed availability; the recoverable scheduling fraction is unresolved. |
| 3 | Display preparation | 2.7–2.9 ms in A before CPU submission. GPU medians 1.61–2.14 ms and p99 3.41–3.86 ms are below 6.06 ms in this screen. High confidence this is not a GPU-only limit. |

Useful 165 Hz motion is still limited by producer/display CPU work and endpoint
availability. Immutable allocation reuse alone does not solve it. Interior
interpolated poses do occur, but repeated endpoints dominate; a roughly 140 Hz
submission rate is not 165 Hz fresh gameplay or proof of physical presents.
CPU/GPU spans overlap and the producer subspans nest: do not add them.

**One next implementation task:** extend generation-based ownership to the
producer's obstruction solid/follower preparation so unchanged inputs do not
repeat bounds/relationship preparation. Keep live-resource checks and detached
public outputs. First isolate those existing subphases with the detached control;
do not attribute the observed slowdown to freezing without evidence. This task
targets 0.70 ms rooftop / 1.20 ms depot of recorded nested work, not a promised
gain. It was not started in this campaign.

## Evidence and reproduction

Evidence root: `.local/engine-perf/touch-of-death-lab/entity-sampling/`.
`artifact.json` names the immutable artifact/source archive; `plan.json` is the
predeclared contrast. `verification/` contains receipts, hashes, frames/images,
pixel results and archived verifiers. `timing/campaign/` contains all eight raw
trials, effective settings, hardware/power/flags, focus/wake and cleanup evidence.
`timing/analysis.json`, `counter-audit.json` and `decision.json` record conclusions.
`recommended.json` is A for continued diagnostic use; it does not promote the
owned journal or tuned lab options to universal defaults.

Use the [working lab](http://127.0.0.1:8807/lab/?arena=rooftop) and import that JSON,
or `candidate.json` to inspect immutable sampling. From the repository root:

```powershell
# Reproduce against the existing pinned artifact, into a new evidence directory.
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase campaign --plan .local/engine-perf/touch-of-death-lab/entity-sampling/plan.json --output .local/engine-perf/touch-of-death-lab/entity-sampling-repro
# Offline analysis and per-publication work validation; no browser.
bun.cmd spikes/persistent-world-worker/lab/runner/producer/analyze-producer.ts .local/engine-perf/touch-of-death-lab/entity-sampling/timing
```

The artifact retains the pre-timing implementation. A later journal comment
clarification changes no code; final source and archived graph identities are
recorded separately. No further performance trials ran after these eight.
