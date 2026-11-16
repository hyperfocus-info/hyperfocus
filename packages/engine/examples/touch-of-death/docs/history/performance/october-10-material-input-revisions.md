# Per-material input revisions — October 10, 2026

**Preparation improves; full-frame capacity remains inconclusive.** Producer-issued
revisions avoid 99.77% of deep material-input comparisons in the live candidate,
while retaining live resource/storage checks. Endpoint preparation falls from
2.1–2.3 ms to 1.5 ms median. Paired submission effects are −1.14% / +2.58%, with
4.64% control spread. Keep this private; 165 Hz remains unproven.

## Mechanism, ownership and counted work

The [publication-token experiment](october-10-material-input-versions.md) lost
reuse whenever a new publication arrived. This follow-up derives per-material
revisions during the producer applicator's existing exact input comparison.
There is no second producer comparison pass. Changed input gets a new safe-integer
serial after successful application; unchanged input retains its serial even
when live resources require repair. Duplicate IDs retain ordered last-writer
semantics. Unversioned calls revoke the incoming identity shortcut.

The inspected synchronous order remains sample, game presentation, appearance/
motion, directed presentation, application, compile/packet write, then endpoint
packing. A Float64 revision array is borrowed until the next application and
cloned by synchronous messaging before reuse. Inline publication copies it.
The receiver scopes revision numbers to a producer UUID and restore epoch; clear,
owner replacement and epoch changes revoke ownership. Received endpoint arrays
remain owned by their publications. The existing cutaway-selection traversal
fills one reusable interior revision array from the selected endpoint per material.

Only incoming deep look comparison is skipped. Every successful unchanged binding
still checks declared alpha mode, material activity, packed numeric values, flags,
texture handles and texture activity. Failed application cannot mark changed input
clean. Resource/teleport correctness beyond this fixed-resource display prototype
remains open; this does not provide a general resource invalidation protocol.

The instrumented actual applicator uses 128/1,024 materials, two forms and five
texture slots, over 100 applications. At 1,024 materials with 1% changing each
sample, deep comparisons fall from 102,400 to 1,100. Output hashes, resource checks,
numeric scans, writes, copies and backing allocations match the control. Held
inputs avoid all 102,400 deep comparisons while retaining 204,800 material checks,
1,024,000 texture checks and 5,734,400 numeric comparisons. Fixture-issued revisions
isolate consumer work; separate tests and the real browser exercise derivation.

The two live candidates avoid 2,092,099 of 2,096,864 deep comparisons (99.7728%).
They still visit all 1,702 materials on every display. Each publication adds
13,616 revision bytes plus UUID/envelope overhead; acquired publications total
7,311,792 numeric revision bytes. The interior selection performs 900,358 extra
numeric stores inside its existing traversal. Producer and consumer applications
also write a revision per visited record. The consumer application and interior
buffers each retain 13,616 bytes and allocate once at the tested fixed membership;
two received endpoint arrays and the producer array are additional storage.
Each receiver publication creates two small context objects. Counters and protocol
costs are included in candidate timings. These are logical work/storage counts,
not cache misses, measured RAM-bus traffic or complete retained memory.

## Short live ABBA screen

Four serial trials, six-second warm-up and six-second measurement after restore.
Visible focused Chrome, physical monitor, i9-13900HX / RTX 4070 Laptop, AC and
bounded wake requests; rooftop seed/checkpoint 714, 1366×768/DPR approximately 1,
normal MSAA, full services, packed transport, nominal 60 Hz producer, 16.67 ms
delay, full entity interpolation, timer schedule and two render buffers.
No audit builds/tests/other audit browsers overlapped timing. Both runtime
artifacts rebuild the same frozen graph. Only the private material protocol,
applicator, producer output/controller and generated runtime differ; rendering
algorithms are unchanged. Both graphs contain 693 modules.

| Metric | A1 control | B1 revisions | B2 revisions | A2 control |
| --- | ---: | ---: | ---: | ---: |
| Submit interval p50/p95/p99/p99.9, ms | 9.4/13.6/16.8/21.7 | 9.8/13.1/16.8/18.1 | 9.9/13.1/17.2/19.1 | 9.8/13.9/18.2/18.8 |
| Intervals over 6.0606 ms | 100% | 96.60% | 98.04% | 100% |
| Endpoint preparation p50/p95, ms | 2.1/2.4 | 1.5/1.8 | 1.5/1.8 | 2.3/2.8 |
| Interior preparation p50, ms | 3.1 | 2.6 | 2.6 | 3.4 |
| WebGL submission wall p50/p95, ms | 2.7/5.4 | 3.0/6.3 | 3.3/6.5 | 2.9/5.6 |
| Main-to-submit p50/p95, ms | 7.1/9.2 | 7.0/10.1 | 7.1/9.6 | 7.4/10.0 |
| GPU draw p50/p95, ms | 5.82/8.16 | 6.05/8.61 | 5.98/8.37 | 6.11/8.94 |
| Display submissions/s | 104.04 | 102.86 | 101.89 | 99.33 |
| Repeated comparable poses | 48.96% | 50.49% | 48.86% | 49.25% |

All 2,456 GPU samples are valid. GPU time excludes post/HUD/compositor and overlaps
CPU work; do not add it to CPU duration. WebGL wall time is not thread CPU time.
Its increase accompanies the preparation reduction; queueing/backpressure is a
hypothesis, not established causality. Worker-through-post medians are
10.8/11.3/11.0/11.1 ms; post-call medians remain about 0.6 ms. Empty-page callback
means are 6.058–6.062 ms, approximately 165 Hz, without proving physical presents.

Candidates have pose-age medians 30.0/30.5 ms and applied-input age proxies
43.1/43.2 ms; no physical input-to-visible latency is measured. Longest comparable
repeat runs are 29/28; only 306/313 changed poses occur in the candidate windows.
Each trial observes 359 fixed steps, with no missing interior step IDs.

Control/candidate submission spreads are 4.64%/0.95%. There are only two live pairs,
with different elapsed-time workloads, so no reliable acceptance confidence
interval is claimed. Short p99.9 is effectively the observed maximum. CPU clocks/
temperature, in-window competing activity, allocation rate, working set and
sustained retained memory are unrecorded. Boundary GPU/power receipts are retained;
heap-used endpoints are not a leak or retention measurement.

| Hypothesis | Expected signature | Result / uncertainty | Correctness | Decision |
| --- | --- | --- | --- | --- |
| Revisions preserve reuse across publications | Most deep comparisons disappear without extra producer comparison scan | 99.77% avoided live; new arrays/stores/transport counted | Resource mutation, duplicates and ownership fixtures pass | Supported bounded mechanism |
| Less preparation raises fresh display capacity | Paired full-loop gains beyond drift | −1.14% / +2.58%; control spread 4.64% | Numeric gameplay/pose checks pass | Inconclusive; no promotion |
| Each version repeats its own AA image | Zero differing decoded pixels | 12/14 repeats differ, at most 20 pixels/channel delta 2 | Exact gate fails | Unresolved |

## Correctness and reproducibility

Completed short and restore captures cover both owners: 968 exact endpoint,
484 repeated-pose and 484 audio-once checks, plus 242 inline ownership-poison
checks. Full producer state/presentation sequences and intermediate pose hashes
match the compact-publication references. Restore, viewport, pause/resume and
reduced-motion inputs are covered. These are bounded rooftop checks, not the six
arenas, skinned crowds, dense collision or sustained acceptance campaign.

The first short capture failed cross-owner equality only because a lifetime
diagnostic serial differed by four after warm-up. All 183 sampled poses and work
counts matched. The comparator now omits that owner-local ordinal while retaining
work, state and pose equality, with a regression test. The failed raw capture and
`serial-diagnostic.json` remain; the completed retry has a new prefix.

Raw root: `.local/engine-perf/material-revisions-20261010/roof/`. It owns the frozen
build graphs/patches, structural results, `revision-short-fixed`,
`revision-restore`, `revision-abba-plan.json`, all display/producer rows, image
plans/results, `screen-summary.json` and cleanup/wake receipts. Use the
[integrated workflow](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment)
with fresh output names. Set `PERF_REBUILD_RUNTIME=1` before recipe and build for
both artifacts; `PERF_DISPLAY_MATERIAL_VERSIONS=0` for both and
`PERF_DISPLAY_MATERIAL_REVISIONS=0`/`1` for control/candidate. Keep all other settings
as the recorded plan, with artifacts in control,candidate,candidate,control order.
Use `PERF_MATERIAL_MODE=control`/`revisions` for `incremental/material-structure.ts`.
Run `image-parity.ts` with the saved image plan and `PERF_PIXEL_EXACT=1`; this run
correctly exits 1 after saving all comparisons and cleanup. A tolerance pass
cannot satisfy same-version determinism.

Focused verification: 51 presentation/version/trace tests with 598 assertions,
seven patched legacy/storage tests with 85 assertions, and two capture-comparison
tests with 11 assertions pass. The experiment TypeScript check passes. Process
policy reports zero violations across 4,893 files. All 18 cleanup receipts are
empty; ten wake requests released without expiry or suspected sleep. Some cleanup
receipts refer to the same browser. The shared managed server remains running
with no unresolved errors.

## Next discriminating work

Deep input comparison is now almost absent; further reductions there cannot
explain the remaining frame budget. Preserve this variant as a preparation-cost
control. Investigate the larger WebGL wall interval and GPU/driver scheduling
with separate low-overhead traces and fixed fresh-work render controls, then test
the already screened batching/shadow changes on this complete pipeline. Explain
control drift before promotion. Continue the exact-AA diagnosis separately; no
numeric pass or cached-scene rate closes that gate. Final library ownership/data
contracts still await representative implementation comparisons and wider gates.
The [submission follow-up](october-10-submission-backpressure.md) finds increased
command-buffer waiting and heavily occupied GPU-process CPU in a separate trace.
