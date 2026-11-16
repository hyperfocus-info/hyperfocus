# October 10: empty native draw-dispatch cost

**Removing zero-instance draw calls has no established capacity benefit.** Paired
capacity changes -0.14%, exploratory 95% interval [-5.94%, +6.01%]. Candidate
variation is 5.89%, exceeding the 5% gate. Both modes remain near 109 samples/s.
This is an inconclusive empty-draw comparison, not proof of equivalence or the
cost of ordinary nonempty draws. No optimization is promoted.

## One controlled change

The control is the preceding `zero-instances` artifact, not full rendering.
The candidate removes its six native draw calls while retaining producer work,
command traversal, material/mesh bindings, resource checks, uploads, post and HUD.
Its counters report zero actual draws. Two renderer source files differ exactly
as declared; both artifacts have the same simulation worker binary.

Rooftop seed 714 uses visible focused Chrome 154.0.8037.58, RTX 4070/ANGLE D3D11,
1366 by 768/DPR 1, normal AA/VSync, AC and full services. Eight fresh-browser
trials follow ABBA/BAAB. Each runs twelve seconds of warmup plus a contiguous
661-sample warmup, restores the checkpoint and measures 661 FIFO samples at
165 logical samples/s. CPU profiles, traces, allocations and system polling are
off; matched asynchronous GPU queries remain. No throughput readbacks occur.

| Hypothesis | Controlled variable | Expected signature | Result / decision |
| --- | --- | --- | --- |
| Dispatching empty draws materially limits the remaining fresh-work path | Omit native zero-instance calls; retain state/binding work | Lower main-thread draw time and improved capacity | Draw p50 decreases 0.10 ms; paired capacity interval crosses zero and candidate drift fails the gate. No established full-loop benefit. |

## Correctness and observations

Separate one- and two-buffer diagnostic replays each observe zero native draws
over all 661 measured frames and reach the full-render reference's final state.
Twelve raw/composited PNG pairs are byte-identical to the zero-instance control.
These contain no geometry and do not pass production gameplay image acceptance.
Counter wrappers and readbacks remain confined to those diagnostics.

All 5,288 timing samples pass final-state, tick/step and pose-transition checks.
Median draw count changes from 2,299 to zero; material bindings remain 1,145 and
submitted upload bytes 125,632. Counts describe API requests, not physical memory
traffic or driver work. All eighteen browser cleanup receipts pass, with no runtime
errors. State/pose equality does not mean that the deliberately empty output is
visually correct gameplay.

| Median trial metric | Zero-instance control | No native draws |
| --- | ---: | ---: |
| Capacity, samples/s | 109.58 | 109.37 |
| Within-mode capacity spread | 4.81% | 5.89% |
| CPU submission interval p50 / p95, ms | 7.50 / 12.65 | 8.15 / 12.85 |
| CPU submission interval p99 / p99.9, ms | 16.90 / 24.10 | 16.65 / 21.80 |
| CPU submission deadline misses at 6.06 ms | 76.14% | 76.44% |
| GPU range p50, ms | 0.1004 | 0.0983 |
| Worker compute / preparation p50, ms | 6.95 / 5.20 | 7.05 / 5.25 |
| Main-thread / draw p50, ms | 3.95 / 2.20 | 3.90 / 2.10 |

The paired p95 submission-interval ratio effect is -1.37%, exploratory interval
[-3.20%, +0.51%], where positive means improvement. The GPU ratio effect is +2.08%,
interval [+0.76%, +3.41%], but the absolute median difference is only 0.002 ms;
this does not explain a path missing most 6.06 ms deadlines. One four-pair cohort
cannot establish independent-session repeatability. CPU and GPU stages overlap.

Empty-page callback rates are 163.37–165.04 Hz (1.01% spread). Warmup gaps are
24.5–30.2 ms. Each trial has 660 valid GPU queries and one pending, with no reported
disjoint/invalid results. Scene-wide poses repeat on 72.27% of comparable transitions.
Physical scanout, input-to-visible latency, CPU thermals, continuous clocks and
sustained memory behavior remain unobserved in this short diagnostic.

This result does not support empty native draw dispatch as the next major target.
Preparation and retained binding/traversal work remain expensive. Ordinary draws
can incur different validation, residency and device work, so actual draw/material
scaling and the remaining pass ablations still need separate evidence. Production-AA
repeatability, fresh-motion architecture comparisons and six-arena/stress acceptance
remain open; cached or empty rendering cannot close them.

## Reproduction

The [runner README](../../../../../../../spikes/persistent-world-worker/README.md)
owns recipe and browser commands. Local artifacts under
`.local/engine-perf/fixed-render-fifo-20261009/roof/` include the
`no-draw-dispatch` build/patches/plan, `no-draw-dispatch-build-check.json`,
`no-draw-dispatch-proof-check.json`, and the `fifo-no-draw-dispatch-abba` plan,
raw rows, analysis and `fifo-no-draw-dispatch-validation.json`. Retain these until
rendering attribution and dependent architecture decisions close.

Run `bun spikes/persistent-world-worker/rendering/ablation-results.ts` with
`PERF_ROOT` set to that directory, `PERF_PREFIX=fifo-no-draw-dispatch-abba`,
`PERF_CONTROL_ARTIFACT=zero-instances`, `PERF_CANDIDATE=no-draw-dispatch` and
`PERF_FIXED_REFERENCE` pointing to its `fifo-full-smoke-1-worker-2-fresh.json`.
The updated analyzer also reproduces the earlier full-render/zero-instance
statistics exactly. Seven focused tests (29 assertions) and spike typechecking pass.
