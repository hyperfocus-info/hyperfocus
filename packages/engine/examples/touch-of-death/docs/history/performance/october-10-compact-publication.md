# Compact presentation publication — October 10, 2026

**Compact publication enables some live interpolated motion, but 165 Hz remains
unproven.** Worker `postMessage` wall time falls from 5.8–6.1 ms to about 0.6 ms.
Packing and decoding each take about 0.5 ms. Two candidate windows contain 175
changed interpolated submissions; both object-transport controls contain none.
No production promotion: overall timing controls drift, most display samples
still clamp to endpoints, and exact normal-AA repeatability remains unresolved.

## Controlled representation change

The [prior ownership prototype](october-10-display-interpolation.md) supplies the
control. Producer rate, display delay, simulation, renderer and resource checks
remain identical. Saved source-graph comparison finds changes only in world,
worker and host modules: representation packing and dictionary channel handling.
Both builds contain the same presentation/codec sources. No Wasm, GPU pass,
scheduling, resource-check or shader change is included.

`packed-frame.ts` writes entity TRS and material numbers as Float64, with Uint32
identity/flag indices. One reusable producer buffer holds 781,672 bytes for this
3,391-entity / 1,702-material scene: 81,566 numeric values and 32,286 indices per
publication. The 5,105-string dictionary is sent initially and when it changes.
Every receive attaches its dictionary before latest-frame coalescing; retained
packets keep their own dictionary reference. New channels need fresh channel state.

The numeric buffer is borrowed until the next pack; synchronous `postMessage`
must finish cloning it first. It is deliberately copied by structured clone,
not transferred. Existing numeric render packets retain their separate transfer
pool. The host decodes into two owned entity/material slots; a decoded slot may
be reused only after two further decodes. The display working frame stays separate.
Camera, lights and other frame metadata remain in the ordinary message envelope.
Inline capture copies its borrowed publication, including the dictionary.

The producer allocates one numeric backing buffer in each candidate trial,
including warm-up. It still scans/writes the entire encoded field set on every
publication; this is not incremental preparation. Decoding validates identifiers
and flags before slot mutation, then retains existing application and resource
liveness checks. Unit tests cover optional material/texture transitions, new IDs,
membership changes, signed zero, malformed packets and endpoint lifetime.
These byte/access counts are logical work, not measured RAM traffic or cache misses.
The allocation counter counts numeric backing buffers only, not total JS allocation.

| Hypothesis | Expected signature | Measured evidence | Decision |
| --- | --- | --- | --- |
| Object serialization is an avoidable publication floor | Lower synchronous post-call time after bounded pack/decode cost | Post 5.8–6.1→0.6 ms; pack/decode each 0.5 ms; producer through post 16.6–17.5→11.0–11.2 ms | Supported for this private workload |
| Exact Float64 reconstruction preserves presentation | Original endpoints/camera and intermediate hashes unchanged | 968 endpoint checks, 484 numeric repeats and complete state/intermediate sequences pass | Keep candidate; resource replacement and other scenes remain open |
| Faster publication supplies display-rate interiors | Nonzero interpolated samples with distinct submitted poses | 209 interpolated samples, 175 changed versus preceding submitted pose, out of 1,241 candidate submissions | Partial success; still far short of display-rate fresh motion |
| Full-loop gain is stable | Repeated controls and candidates agree across sessions | Control submission-rate spread 9.34%, candidate 0.23%; one short ABBA cohort | Overall gain inconclusive; no trustworthy paired acceptance interval |
| Same-version normal-AA output is exact | Zero pixel differences on repeated numeric samples | 12/14 repeats differ, at most 29 pixels / channel delta 4 | Gate remains open |

## Live observations and critical paths

One serial ABBA cohort, four fresh visible/focused Chrome sessions; six seconds
warm-up, restore, six seconds measurement each. Same rooftop seed/checkpoint,
1366×768/DPR 1, normal MSAA, full services, provenance/diagnostics, timer input
scheduling, two render buffers, nominal 60 Hz producer and 16.67 ms display delay.
AC/wake/focus and clock receipts pass. Empty callbacks remain about 165 Hz.
Boundary GPU/power observations are retained; CPU temperature, CPU clocks,
hardware cache counters, in-window process contention and observer overhead are
unmeasured. Existing user workloads remain running. No builds/tests or other
audit browsers overlap timing. These elapsed-time runs are not identical-work
replays; sampling paths and warm-up presenter history can differ.

| Metric | A1 object | B1 packed | B2 packed | A2 object |
| --- | ---: | ---: | ---: | ---: |
| Display submissions/s | 93.42 | 103.13 | 102.89 | 85.09 |
| Producer acquisitions | 207 | 265 | 264 | 195 |
| Interpolated samples / changed interpolated submissions | 0 / 0 | 105 / 87 | 104 / 88 | 0 / 0 |
| Changed submitted poses | 174 | 311 | 310 | 163 |
| Repeated comparable poses | 69.04% | 49.84% | 49.92% | 68.10% |
| Longest repeat run after first pose | 26 | 28 | 28 | 21 |
| Publication p50 (includes decode) | 1.0 ms | 1.1 ms | 1.1 ms | 1.0 ms |
| Main update-to-submit p50 / p95 | 6.0 / 8.5 ms | 7.1 / 9.6 ms | 7.2 / 9.6 ms | 6.6 / 9.2 ms |
| CPU WebGL p50 | 2.6 ms | 2.8 ms | 2.8 ms | 2.8 ms |
| Whole-render GPU p50 / p95 | 6.57 / 9.10 ms | 5.95 / 8.33 ms | 5.91 / 8.49 ms | 7.16 / 9.79 ms |
| Pose age at submission p50 / p95 | 40.9 / 55.6 ms | 30.5 / 42.8 ms | 30.5 / 43.0 ms | 44.0 / 60.1 ms |
| Input-sample-to-submit proxy p50 / p95 | 54.4 / 70.6 ms | 44.1 / 56.0 ms | 43.9 / 56.1 ms | 58.2 / 75.6 ms |

Candidate submission intervals p50/p95/p99/p99.9:
`9.50/12.80/15.90/20.00 ms` and `9.60/13.00/16.30/20.00 ms`.
Every candidate interval exceeds 6.0606 ms; 61.45% / 60.90% exceed 1.5 budgets.
These are CPU-submission observations, not physical presentation/deadline proof.
Short-run p99.9 is the observed maximum. All 1,241 candidate GPU queries are
valid; their range excludes post/HUD/compositor. CPU and GPU overlap, so their
times must not be summed. No GPU optimization is inferred from this cohort.

Fresh interior preparation costs 3.2/3.1 ms median versus 2.1/2.1 ms for endpoint
redraws. Main update-to-submit already exceeds the entire display interval;
GPU work has no reliable headroom either. Producer throughput still supplies
only about 44 publications/s, despite nominal 60 Hz scheduling. Candidate windows
observe 358/360 distinct fixed-step IDs without interior gaps. Interpolated poses
are not additional simulation steps, and changed poses are not proven scanouts.

Main heap-used boundaries are 42.9→67.7 MB and 65.9→59.5 MB. This neither proves
retained-memory stability nor measures working set, allocation rate or worker GC.
No physical input-to-visible-response latency was observed. Longer display delay
may improve interpolation coverage but must be evaluated against latency.

## Correctness, reproduction and next work

Both owners pass 61 ordinary and 181 restore/input publications: 484 independent
gameplay/pose-oracle checks, 968 endpoint comparisons, 484 numeric repeats and
484 synthetic once-only audio checks. Inline source poisoning passes 242 times.
Complete producer sequences and every sampled intermediate hash match the prior
owned object prototype. Maximum limb-length error is 1.23e-15. Restore, viewport,
pause/resume and reduced-motion coverage uses the existing schedule. Capture rates
are simulated sample times, not achieved display rates. Images include snaps,
held states and interior poses; packet equality does not prove all GL history.

Raw root: `.local/engine-perf/compact-publication-20261010/roof/`.
Artifacts: `display-owned-control`, `display-packed`; captures: `packed-short`,
`packed-restore`; live prefix: `packed-abba`. Source graphs, patches, manifests,
stage samples, per-display IDs, power/wake/cleanup receipts and images are retained.
`source-comparison.json` records changed modules. `image-plan.json` owns the 14
same-version comparisons; the old tolerance-based image tool exit status is not
an exact-repeatability gate.

Use the [presentation README](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment)
commands with `PERF_DISPLAY_TRANSPORT=packed` and build `display-packed`; rebuild
`owned` as `display-owned-control` from the same base graph. The live cohort uses
four `worker-2-fresh` modes, artifacts
`display-owned-control,display-packed,display-packed,display-owned-control`, and
four `timer` scheduling values. The retained `packed-abba-plan.json` owns all
other settings. Analyze with `display-results.ts`, `display-live-results.ts` and
`image-parity.ts`. No archived outputs should be overwritten for another session.

All 16 cleanup receipts have no owned processes/windows left (some duplicate a
shared comparison browser); all eight wake requests were released without expiry
or suspected sleep. All 30 focused tests / 475 assertions, focused TypeScript and
process policy pass; managed-server errors are empty. The shared server stays running.

Next isolate unchanged entity/interpolation work before attempting a higher
display rate; profile/count full-scene traversal versus fighter reconstruction.
Test display delay and input scheduling separately with input-age and repeat gates.
Dynamic resource/teleport epochs, intermediate-camera occlusion, equipped weapons,
KO/skinned/effect coverage, six arenas, independent sessions, sustained thermals/
memory, exact production-AA history and physical visible latency remain open.
Resident identities and bulk numeric transport are supported as a private design
direction; final library layout/worker topology still requires the remaining
architecture, implementation-language and end-to-end comparisons.
