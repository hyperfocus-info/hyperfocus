# Touch of Death: alpha coverage and repeatability audit

October 11, 2026. **Alpha compositing is repaired. The intermittent exact MSAA
image mismatch is NOT repaired. No configuration is newly promoted.**

The existing lab offers `renderer=source-over`; `original` preserves the frozen
baseline. Both timing sides use compact publication and working-frame reuse.
No new lab, AA algorithm, gameplay rule or latency policy was introduced.

## Defect and repair

`bindMaterial` used `SRC_ALPHA` for both RGB and source alpha. A guard with
alpha 0.2 changed opaque background coverage from 1 to **0.84**:
`0.2 * 0.2 + 1 * 0.8`. Source-over requires `0.2 + 1 * 0.8 = 1`.

The engine now uses `blendFuncSeparate`, preserving RGB factors and the existing
additive convention. A regression test first failed at 0.84, then passed for
opaque/partial coverage, RGB weighting and additive behavior. Native observations
confirm alpha 255 throughout the sampled 160×140 region in all ten corrected
fixed-packet renders; the old version included alpha 214.

The lab selects the correction at the graphics ownership boundary. It removes
no geometry, shadows, copies, scans, uploads or resource checks. This fixes
compositing, not the remaining repeatability failure.

## Remaining image defect

The localized draw is two `tod:guard` sphere instances: draw 1,781 in depot at
logical 1,000 ms. Captured transforms, vertex/normal/UV buffers, shader source
and sampled uniforms match across resets and are finite. Skinning, morphing,
textures and cutaway shading are inactive for that draw. Array uniforms were
sampled at their first element; this is not complete resident GPU-state proof.

| Untimed isolation | Result | Conclusion |
| --- | --- | --- |
| Constant-color guard, lighting disabled for that draw | 10/20 raw/post pairs differ, including the tracked region | Guard lighting math is unnecessary for the small RGB variation. Ablation only. |
| Separate alpha factors through interception | 18/20 pairs differ | Coverage alone does not repair repeatability. |
| Premultiplied output/blending | 14/20 pairs differ | Failed probe; not integrated. |
| Observed NVIDIA hardware OpenGL through ANGLE, same artifact | 4/20 pairs differ, one pixel at (689,410), delta 1 | No exact-repeat remedy; failure pattern differs from D3D11. |
| Corrected renderer, guard instances dispatched separately | 18/20 pairs differ | Splitting this draw is not a remedy; not integrated. |
| Corrected renderer, native pass-boundary reads | Opaque region 0/8 differences; after transparency 3/8, delta 1, alpha always 255 | Remaining RGB variation precedes PNG/Canvas2D and survives correct alpha coverage. |

Each 20-pair cohort comprises eight adjacent-redraw transitions and two reset
comparisons, observed in raw/post layers, not 20 independent trials. Readbacks
perturb execution. The split probe records its two native calls separately;
the ordinary recorder sees one outer call, not one-to-one native coverage.

The earlier recorder repair remains: stable primitive selection no longer
overwrites draw observers every frame. Its zero-draw diagnostic failure and
subsequent complete 1,821-draw captures remain in `raster-reset/`.

Normal verification passes seeded gameplay, evaluated frames, packet/camera
and ownership checks. Both rooftop image pairs are exact. Depot objects differs
by **39 pixels**, compact by **27**, maximum channel delta **1**. The strict
image gate fails. Both publication formats are affected; this is not evidence
of compact/reuse gameplay corruption. The exact raster/blend/resolve or driver
operation remains unknown; a renderer/resource bug is not completely excluded.

## Current timings

Eight serial A/B/B/A trials, 5 seconds warmup and 10 seconds measurement, with
the seeded checkpoint and presentation history restored before measurement.
Both sides use compact+reuse. **A = original blending; B = corrected source-over.**
This is diagnostic repair timing with a known image failure, not promotion.
Values average two trial statistics; percentiles are not pooled.

| Arena/version | Steps/s | Changed poses/s | Submissions/s | Interval p50 / p95 / p99, ms | >6.06 ms | Repeats | Pose age p50 / p95, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Rooftop A | 59.80 | 60.30 | 117.07 | 8.15 / 11.40 / 14.40 | 99.96% | 48.27% | 28.80 / 38.30 |
| Rooftop B | 59.83 | 52.74 | 113.57 | 8.60 / 11.55 / 14.25 | 100% | 53.51% | 29.75 / 41.10 |
| Depot A | 59.73 | 46.05 | 117.36 | 8.30 / 11.15 / 13.45 | 99.96% | 60.58% | 29.60 / 39.55 |
| Depot B | 59.78 | 47.94 | 116.81 | 8.35 / 11.15 / 13.40 | 100% | 58.76% | 29.05 / 37.45 |

Rooftop B averages **12.53% fewer fresh poses**: 46.36/59.12 versus controls
60.71/59.88. Candidate spread is 24.18%, control spread 1.38%: **possible
regression, inconsistent; no no-regression acceptance**. Depot's apparent
+4.10% is smaller than 26.58% baseline spread: **drift-inconclusive**.
Neither comparison was repeated.

| Cost, ms; medians unless stated | Roof A → B | Depot A → B |
| --- | --- | --- |
| Producer computation | 9.65 → 10.55 | 11.45 → 11.05 |
| Producer presentation, within computation | 5.40 → 5.70 | 6.65 → 6.35 |
| Producer apply/compile, within computation | 2.55 → 2.80 | 2.70 → 2.70 |
| Host publication, publication rows only | 0.65 → 0.65 | 0.70 → 0.70 |
| Worker post | 0.60 → 0.60 | 0.60 → 0.60 |
| Endpoint packing | 0.50 → 0.55 | 0.55 → 0.55 |
| Endpoint decoding | 0.50 → 0.50 | 0.60 → 0.55 |
| Display preparation | 2.55 → 2.75 | 2.60 → 2.60 |
| WebGL submission | 2.10 → 2.20 | 1.95 → 1.95 |
| Main receipt through submission | 6.10 → 6.50 | 6.20 → 6.25 |
| GPU p50 / p95 / p99 | 4.64/5.92/6.81 → 4.94/6.43/7.42 | 3.91/5.49/6.43 → 3.84/5.38/6.30 |
| Input wait | 5.50 → 5.70 | 4.65 → 4.50 |
| Message delivery wall time | 5.25 → 5.45 | 4.45 → 4.30 |

Buffer wait medians: 0–0.05 ms. Input-age proxy medians: 31.45–32.45 ms.
Delivery includes IPC/deserialization/dispatch delay, not measured CPU execution.
Overlapping CPU/GPU durations are not added.

Totals: 4,788 fixed steps, zero dropped simulation time, 4,145 changed poses,
5,128 repeats, 1,513 interior interpolated submissions. All **9,281 timed query
statuses were valid**, zero invalid/disjoint. Focus/awake checks passed.
Chrome 154.0.8037.58, RTX 4070 Laptop / ANGLE D3D11, 4×MSAA, 1366×768,
DPR approximately 1, scale 1, AC High performance. Observed display mode 165 Hz;
callback/submission cadence is slower. Submissions are not proven physical
presents. Outside-window power snapshots do not establish continuous throttling.

## Remaining gaps

| Priority | Evidence | What remains |
| --- | --- | --- |
| Correctness blocker | Raw RGB still varies after transparency; depot exact images fail | Exact GPU operation remains unidentified. No backend workaround is accepted. |
| 1. Producer CPU | 9.65–11.45 ms computation; presentation alone 5.40–6.65 ms | Already exceeds 6.06 ms. Necessary simulation/preparation remain; removable fraction is unmeasured. |
| 2. Repeated display application | Every submission visits 3,391/3,389 entities and checks 1,702/1,717 materials | All 5,128 repeats get full application/compilation: 17,383,470 visits and 8,769,691 material checks. Strongest remaining reuse opportunity. |
| 3. Drawing and delivery | Approximately 2,032/1,830 draws, including 977/875 shadow draws, 131/117 KB uploaded per display; GPU tails exceed 6.06 ms; delivery takes 4–5 ms | Separate shadow GPU cost and transport-versus-dispatch attribution remain missing. |

Both timing sides have zero working-frame and retained-publication clones, and
at most one interpolation destination allocation per trial. Compact payloads
remain 781,672/785,500 bytes; packets 723,524/725,316 bytes, two host buffers.
The correction removes **no work**. Repeated submissions account for 634,845,696
uploaded bytes and 9,869,515 draws. Logical bytes are not RAM traffic/cache
misses; boundary heap snapshots are not allocation-rate evidence.

Useful 165 Hz motion remains limited by producer execution, repeated display
work and delivery/cadence, with GPU tails also material. Serialization's old
27-ms host cost is gone in compact+reuse. The prior transport result remains in
the [compact/reuse audit](touch-of-death-compact-reuse-audit.md); this block does
not remeasure objects versus compact or prove a new speedup.

**One next performance implementation:** reuse compiled presentation when the
sampled endpoint/alpha, camera and resource epochs are unchanged, retaining
resource-liveness checks and reset invalidation. Repeats spend 2.5–2.65 ms in
preparation; this is an upper bound, not a promised saving. Resolve the
exact-image blocker before promotion.

## Evidence and reproduction

Root: `.local/engine-perf/touch-of-death-lab/raster-fix/`.
`delivery.json` contains the configured managed URL.
`corrected-diagnostic.json` is compact+reuse+source-over;
`recommended-reference.json` retains baseline+reuse as a reference, not a
new acceptance claim. `timing-analysis.json`, `timing/alpha-coverage/` and
`diagnostics.json` retain statistics, raw samples, effective configs and failures.

Artifact: `e228914b3751f5184c60f88111d3932d196aae2bd857d1a1acebb9ede8baa720`.
One rebuild integrated the correction; older artifacts remain archived.
Original/table implementations and game/transport code stayed frozen. Changed
modules: facade, corrected renderer, registry and its embedded bundle copy.
Failed probes affect only recorded untimed sessions.

```powershell
bun.cmd .agents/skills/dev-server/scripts/dev.ts start touch-of-death-lab --json
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase alpha-coverage --output .local/engine-perf/touch-of-death-lab/alpha-repro
bun.cmd spikes/persistent-world-worker/lab/runner/analyze-alpha.ts .local/engine-perf/touch-of-death-lab/alpha-repro
```

Untimed corrected verification: `lab/smoke.ts --compact-reuse --source-over
--output <new-folder>`, followed by the existing exact image decoder.
`verify-raster.ts` retains bounded probes; flags and source are saved.
The failed OpenGL profile is restricted to untimed verification.

35 relevant tests / 460 assertions, scoped TypeScript and process policy pass.
Automated ownership/packet checks and image repeatability are separate evidence.
All owned browsers closed; managed server has no unresolved errors. Optional
startup API 404s remain logged. No captures, readbacks, tracing, builds, tests
or second audit browser ran during the eight timing trials.
