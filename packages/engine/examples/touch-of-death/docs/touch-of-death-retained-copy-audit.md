# Touch of Death: retained-copy audit, October 10, 2026

The later [compact-with-reuse audit](touch-of-death-compact-reuse-audit.md)
completes the transport comparison proposed below.

**The remaining main-thread endpoint copy was removed by an existing strategy,
but this did not establish a fresh-motion gain.** Publication handling fell from
about 13.8 ms to 0.4 ms. Submissions rose to 104–108/s while changed poses stayed
near 25–27/s. Keep **baseline plus `workingFrame: "reuse"`** as the diagnostic
recommendation. Exclusive adoption remains experimental.

The eight raw trials from the [previous implementation](touch-of-death-working-frame-reuse.md)
were recomputed before this work. They confirmed that retained-publication
copying remained after removal of the working-frame clone. This task used the
existing `publication: "owned"` path with reuse, without changing transport
representation, renderer, simulation rules or latency policy.

## Changes delivered

- Added the atomic `owned-reuse-experimental` preset. It changes exactly
  `publication` and `workingFrame`; the original baseline remains available.
- Fixed a configuration bug: inline ownership accepted `publication: "owned"`
  while silently copying borrowed producer arrays. Stage/apply/import now reject
  that combination before changing requested/effective configuration or epochs.
- Extended the existing untimed verifier to freeze exclusively received endpoint
  graphs and check retained inputs across subsequent publications.
- Added one bounded `retained-copy` runner phase. It compares reuse alone with
  reuse plus adoption, ABBA in rooftop and depot, and refuses reused output paths.
- Added publication-only timing summaries. A repeated display's zero publication
  time must not dilute the measured cost of actual publications.

No new runtime algorithm was necessary: this closes an ownership/configuration
and evidence gap around existing code. The artifact's source differences are the
registry and its generated runtime-bundle copy. Producer, renderer and display
implementation sources match the previous artifact.

## Controlled measurement

Eight trials completed: 5 seconds warmup, checkpoint/history reset, then 10
seconds measurement. A = full-object copy plus working reuse; B = received-object
adoption plus working reuse. Thus A is the **previous recommendation**, not the
original clone-everything baseline. Means below average the two trial statistics.

| Arena/config | Steps/s | Publications/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Rooftop A | 59.81 | 34.32 | 27.49 | 39.72 | 27.00 / 31.75 / 37.75 | 97.35% |
| Rooftop B | 59.84 | 33.87 | 26.68 | 104.30 | 7.60 / 16.25 / 18.85 | 91.89% |
| Depot A | 59.76 | 34.70 | 24.41 | 37.27 | 27.30 / 32.20 / 38.30 | 98.18% |
| Depot B | 59.74 | 35.52 | 24.53 | 108.17 | 7.10 / 15.05 / 17.20 | 86.97% |

Rooftop fresh motion changes **−2.95%**, with 1.18% control variation and 10.52%
candidate variation. The magnitude is unstable; there is no defensible gain.
Depot changes **+0.47%**, smaller than 5.46% control drift and 3.73% candidate
variation: **inconclusive**. No retries or additional timing contrasts followed.

| Observation | Rooftop A → B | Depot A → B |
| --- | --- | --- |
| Repeated-pose share | 30.33% → 74.25% | 33.86% → 77.16% |
| Median pose age | 48.75 → 43.25 ms | 48.80 → 41.10 ms |
| Pose age p95 / p99 | 71.10 / 89.30 → 64.45 / 87.50 ms | 59.85 / 69.75 → 54.70 / 59.95 ms |
| Median input-age proxy | 48.90 → 43.35 ms | 48.90 → 41.35 ms |
| Actual publication p50 | 13.75 → 0.40 ms | 13.80 → 0.40 ms |
| Producer compute p50 | 11.60 → 12.05 ms | 11.90 → 12.30 ms |
| Display preparation p50 | 2.40 → 2.20 ms | 2.40 → 2.20 ms |
| Draw submission p50 | 2.00 → 2.15 ms | 1.80 → 1.80 ms |
| Async GPU p50 / p95 / p99 | 4.43 / 6.08 / 8.79 → 4.61 / 6.17 / 7.12 ms | 3.85 / 5.22 / 7.61 → 3.64 / 5.12 / 5.95 ms |
| Worker posting p50 | 5.25 → 5.65 ms | 5.15 → 5.45 ms |
| Input wait p50 | 16.20 → 16.00 ms | 16.15 → 15.40 ms |
| Buffer wait p50 | 2.75 → 0.10 ms | 2.95 → 0.00 ms |

Actual publication statistics use rows carrying publication metadata, including
genuine zero-duration publications. The unfiltered median is zero in B because
most displays have no new publication. Reporting that as zero publication cost
would be misleading.

Chrome 154.0.8037.58 ran visibly/focused and serially at 1366×768, unit DPR, scale
1, four-sample MSAA on the RTX 4070 Laptop. AC, battery saver off and High
performance remained unchanged. Actual launch flags are recorded, with inherited
browser limits. Seed, checkpoint, camera, 60 Hz producer, two buffers, fresh-input
handshake, paced-pipeline schedule and 16.667 ms interpolation delay were fixed.
There were no builds, tests, captures, traces or other audit browsers during timing.

## Ranked findings

| Finding | Evidence | Confidence / implication |
| --- | --- | --- |
| Publication/input cycle limits fresh endpoints | B still produces only 34–36 endpoints/s; compute ~12 ms, worker posting ~5.5 ms, input wait ~15–16 ms. | High that fresh supply remains limited; exact transport/dispatch CPU attribution remains unresolved. |
| Repeated display work expands to consume the freed capacity | Roughly 67% of B displays reuse the identical endpoint request. Every display still applies/compiles and draws; none interpolates an interior pose. | High. More submissions are mostly repeated work, not useful motion. |
| The retained copy is redundant but not the sole current throughput limit | A makes 1,379 retained copies; B makes zero and adopts all 1,386 received publications. Both make zero working-frame clones. | High. Removal is real; fresh-motion benefit is unproven. |
| Inline adoption request silently contradicted effective behavior | Existing controller selected copying for inline while the registry accepted owned. | Fixed; six runtime rejection checks preserve state/epochs. |

The frozen source confirms that the host requests the next input **before**
display work. The removed copy could therefore overlap subsequent producer work.
This explains why a large isolated CPU saving need not increase endpoint supply.
Matched publication/receipt timestamps retain a further ~10.10 ms rooftop /
9.55 ms depot between worker post completion and host receipt. That interval
includes IPC, deserialization and dispatch delay; it is **not** an isolated CPU
measurement. Input waiting overlaps transport. These durations must not be added.

Per display, both sides visit 3,391 / 3,389 entities, compare 1,702 / 1,717 material
inputs and retain all resource checks. Drawing work stays near 2,035 / 1,830 calls
and 131 / 117 KB uploaded per display. Consequently B raises draws/s from about
80,576 to 211,651 rooftop and 67,974 to 197,336 depot; upload rate rises from
5.20 to 13.65 MB/s and 4.35 to 12.65 MB/s. These are logical upload bytes, not
measured RAM traffic. Packet copies remain 723,524 / 725,316 bytes per publication;
full-object message serialization still executes. No simulation, shadow,
post-processing or actor-update work was disabled.

## Correctness, evidence and remaining limits

Three affected registry tests pass, with 255 assertions. Scoped TypeScript passes.
Unchanged prior correctness suites were not rerun. Both arenas pass named-preset
application, export/import and baseline restoration. Invalid inline adoption is
rejected through stage, apply and import without changing state or epochs.

Untimed verification passes seeded resets, full evaluated-frame parity, all 264
native packet/camera comparisons and 48 interior samples. Forty-four adopted
publications were frozen; 160 retained-input checks detected no mutation. Interior
sampling uses one owned destination; timed endpoint-only sampling allocates none.
All four same-version PNG pairs are byte-exact. This bounded pass does not establish
that the historical intermittent renderer nondeterminism has been fixed.

All eight timing trials are valid: 5,777 submissions, 2,065 changed poses, 3,704
repeats, eight initially incomparable poses, 4,790 fixed steps and no dropped time.
All 5,777 GPU queries are valid; focus and both bounded awake guards pass. Owned
browser trees are closed and managed-server errors are empty. Heap boundary
observations are saved but do not measure allocation rate or retained heap.

Useful 165 Hz motion is still blocked by endpoint production/transport and the
current scheduling/interpolation policy. GPU tails and display CPU work also
exceed the deadline on some frames. The evidence does not isolate the residual
transport delay into CPU deserialization versus scheduling. Submissions are not
physical presents, and zero interior samples cannot establish 165 Hz motion.

**One next task:** apply the existing compact publication path alongside owned
working-frame reuse, isolating full-object message serialization from revisions,
shadows and latency-policy changes. This audit supplies a control and ownership
proof; it does not assume that combination will improve fresh motion. No such
additional comparison was run here.

## Delivery

Use the [lab](http://127.0.0.1:8807/lab/?arena=rooftop) and its named preset for the
candidate. The [recommended configuration](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/recommended.json)
remains reuse alone; the [candidate configuration](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/configuration.json)
enables adoption as well. Artifact SHA-256:
`ef6fa9f568437060533fc4fcc483b62ee52130c98b554e8e40edc53225e18dbe`.
Prior and current artifacts remain archived by hash.

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase retained-copy --output .local/engine-perf/touch-of-death-lab/retained-copy-repro
```

[Analysis](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/analysis.json),
[raw trials and exact runner sources](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/retained-copy/),
[ownership/image proof](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/verification/),
[transaction checks](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/transactions/),
[source audit](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/source-audit.json)
and [health receipts](../../../../../.local/engine-perf/touch-of-death-lab/retained-copy/health.json)
retain the inputs, raw evidence and limitations. The bounded task stops here.
