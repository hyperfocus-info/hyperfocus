# Touch of Death: remove the working-frame clone

Later bounded work: [retained-copy audit](touch-of-death-retained-copy-audit.md).
It tests existing worker-object adoption on top of this implementation; the
reuse-only recommendation remains unchanged.

The existing lab's `workingFrame: "reuse"` strategy now prepares writable entity
and camera storage only when an interior interpolation sample needs it. Endpoint
and snap displays allocate no working frame. Interior publications reuse one
owned destination, restoring transform-array bindings that fighter presenters
replace or share. Membership, alias topology, scene and history changes invalidate
the binding. Materials and other read-only metadata borrow retained endpoints;
application, compilation and resource-liveness checks still execute.

This is an opt-in lab implementation. The `clone` baseline and ordinary playable
defaults remain unchanged. Recommend **baseline plus `workingFrame: "reuse"`**
for diagnostic use. Fresh motion improves, but latency tails and the lab's
intermittent image-repeatability failure prevent an unconditional promotion.
No compact/revision/shadow combination was timed or enabled.

## Measured result

One serial ABBA block per arena: **eight trials**, 5 seconds warmup then 10 seconds
measurement. Each measurement restores the same seeded checkpoint and clears
presentation history. Chrome 154.0.8037.58, visible/native focus, 1366×768, unit
DPR, scale 1, four-sample MSAA, RTX 4070 Laptop, AC/High performance, inherited
browser limits, 60 Hz producer, two buffers and 16.667 ms interpolation delay
were held fixed. Actual launch flags and power observations accompany the raw
samples. There were no captures, builds, tests or other audit browsers during
timing. Values below average the two per-trial statistics on each side.

| Arena/config | Steps/s | Changed poses/s | Submissions/s | Interval p50/p95/p99, ms | >6.06 ms | Median pose age, ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Rooftop clone | 59.72 | 20.24 | 25.18 | 39.75 / 45.25 / 51.55 | 99.80% | 71.55 |
| Rooftop reuse | 59.82 | 27.47 | 38.33 | 26.95 / 34.20 / 38.20 | 98.58% | 48.30 |
| Depot clone | 59.73 | 17.88 | 24.59 | 40.20 / 45.85 / 48.30 | 100% | 72.55 |
| Depot reuse | 59.84 | 23.73 | 34.33 | 29.20 / 36.00 / 40.90 | 99.86% | 50.40 |

Fresh-pose gains are **35.74% rooftop / 32.70% depot**, versus baseline range/mean
variation of 1.31% / 2.23%. Candidate variation is 3.15% / 7.96%. Neither gain is
explained by control drift in this bounded comparison.

There is a tradeoff: repeated-pose shares rise from 19.05% to 27.87% rooftop and
26.68% to 30.49% depot as submissions accelerate more than fresh poses. Median
input-age proxies fall from 71.65 to 48.40 ms and 72.55 to 50.55 ms. Rooftop pose-age
p99 worsens from 88.05 to 94.85 ms; its second candidate reaches 120.60 ms. Depot
pose-age p99 improves from 84.45 to 69.25 ms. No timed sample is an interior
interpolated pose. This improves real changed endpoints, not 165 Hz gameplay.

| Work/time | Rooftop clone → reuse | Depot clone → reuse |
| --- | --- | --- |
| Main publication p50 | 25.85 → 13.25 ms | 26.05 → 14.20 ms |
| Producer compute p50 | 11.35 → 10.25 ms | 12.20 → 11.90 ms |
| Worker posting p50 | 5.20 → 5.05 ms | 5.15 → 5.40 ms |
| Display preparation p50 | 2.40 → 2.50 ms | 2.50 → 2.65 ms |
| Draw submission p50 | 1.90 → 1.90 ms | 1.70 → 1.80 ms |
| Async GPU p50 / p95 | 6.08 / 7.38 → 4.67 / 6.66 ms | 4.99 / 6.21 → 3.96 / 5.56 ms |
| Buffer wait p50 | 14.60 → 3.80 ms | 14.70 → 3.30 ms |

The removed work is one whole-frame clone per retained publication: controls
perform 988 such clones across four trials; candidates perform zero. Because
all timed samples are endpoints/snaps, candidate working-storage allocations are
also zero. Full-object retained-publication copying and worker serialization
remain. Every display still visits 3,391 / 3,389 entities, checks 1,702 / 1,717
material inputs, validates roughly 1,700 / 1,713 live material resources and applies
the frame once. Draws, shadows, triangles and uploads per display remain similar;
they were not removed. Packet-copy counts remain 723,524 / 725,316 logical bytes
per publication. Higher publication throughput increases aggregate transport work.

CPU publication remains the largest measured span; reduced waiting is a
backpressure effect, not eliminated CPU execution. GPU time changed despite
similar drawing work, so it is not evidence of a GPU optimization. Durations
overlap and must not be summed. Logical bytes are not measured RAM traffic;
heap boundary readings do not establish allocation rate or retained memory.
Submissions are not proven physical presents.

Useful 165 Hz motion remains blocked by the 13–14 ms main publication span,
10–12 ms producer work and endpoint-holding schedule; GPU tails also exceed
6.06 ms. This implementation removes redundant CPU copying without claiming
to remove the remaining transport, preparation or scheduling limits.

## Correctness and limits

Eight focused ownership/codec tests passed (56 assertions), plus nine applicable
resource-liveness tests (36 assertions). Scoped TypeScript and process-policy
checks passed. The broad prior correctness campaign was not repeated.

Untimed verification covers both publication formats in both arenas, eleven
checkpoints, endpoints and repeated interior samples, and two seeded resets per
configuration. Complete evaluated frames match clone versus reuse and across
resets. All 528 saved native packet/camera comparisons pass, including 96 interior
samples. One owned destination serves all six interior publications; endpoint-only
startup allocates none. Resource validation remains active.

All four candidate image-repeat pairs are pixel-exact in the final build. Three
of four controls are exact; depot/object/clone differs by 21 pixels, maximum
channel delta 2. The strict image batch therefore **fails overall**. No threshold
was relaxed, no image retry was used, and this task does not claim to fix the
pre-existing intermittent rendering issue. The initial implementation failed its
compact storage-allocation assertion (six allocations instead of one); its
receipts and artifact remain saved. Restoring owned vector bindings fixed that
defect before timing.

All eight timed trials are valid: 2,449 submissions, 1,791 changed poses, 650
repeats, eight initially incomparable poses, 4,794 fixed steps and no dropped
simulation time. All 2,449 GPU queries are valid. Focus checks and both bounded
awake guards passed; owned browser process trees were verified closed. Managed
server errors are empty; optional discovery endpoints still return startup 404s.

## Configuration and reproduction

Use the [working lab](http://127.0.0.1:8807/lab/?arena=rooftop&config=%7B%22schema%22%3A%22touch-of-death-lab-v1%22%2C%22config%22%3A%7B%22workingFrame%22%3A%22reuse%22%7D%7D)
or import [configuration.json](../../../../../.local/engine-perf/touch-of-death-lab/working-frame-reuse/configuration.json).
Artifact SHA-256:
`2b1d4095a2edd01538e3f9dc8dde087607a1a5625f8b0300ee571e5f9d3eb4e9`.
The previous report's artifact is archived under its original
`47654f4721553967751f9c25f8312c3b4fe6290f359f2ce05e46464763f67170` hash.

```powershell
# Existing artifact; new output directory preserves the delivered evidence.
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase working-frame --output .local/engine-perf/touch-of-death-lab/working-frame-repro
```

[Analysis](../../../../../.local/engine-perf/touch-of-death-lab/working-frame-reuse/analysis.json),
[raw trials and archived runner](../../../../../.local/engine-perf/touch-of-death-lab/working-frame-reuse/working-frame/),
[final untimed evidence](../../../../../.local/engine-perf/touch-of-death-lab/working-frame-reuse/verification-fixed/),
and [initial failure](../../../../../.local/engine-perf/touch-of-death-lab/working-frame-reuse/verification/failure.json)
retain exact configuration/source identity and limitations. This implementation
and its bounded validation are complete; no further campaign was started.
