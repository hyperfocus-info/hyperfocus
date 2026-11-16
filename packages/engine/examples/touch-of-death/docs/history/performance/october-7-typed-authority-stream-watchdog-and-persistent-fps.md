# October 7: typed authority, stream watchdog and persistent FPS

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## October 7: typed authority, stream watchdog and persistent FPS

**Prepared `ready-v2`; worker default remains off.** This batch moves complete
snapshot/restore/reset and next-match AI updates into the real standalone host's
`standalone/world-authority.ts`. Normal saves and the worker consume the same
typed asynchronous port. `__hyperfocusPlayable.snapshotAsync()` reads the actual
owner; a synchronous read after transfer rejects. Remote operations are ordered,
limited to 32 pending operations, and detach queued restore/policy data from the
caller. Initialization attaches the port only after success. Failed or disposed
owners never route reads or mutations back to the dormant main world.

This is the first production integration slice. The worker still uses private
injection for its frame loop, review bridge and host lifecycle. Appearance,
tutorial/routine and online/replay ownership still need migration; this batch
does not claim a complete replacement of that adapter.

FPS is now **always visible**, per the October 7 user instruction. An older
`showFps: false` preference cannot hide it, and disabling telemetry does not stop
the counter. Only fresh submissions count; after a second without a fresh sample,
the counter shows `0 FPS · waiting for frame`. VSync and telemetry remain separate
settings. Timing scripts also show FPS on their older control artifacts.

The automatic producer now has a progress watchdog. After five quiet seconds it
asks the owner for progress; a missing reply retires the owner. Two successive
probes with unchanged production and available buffers also detect a live but
stalled producer. Host-owned buffers, manual capture and acknowledged suspension
are legitimate idle states. Probes do not count as frames. Closing retires the
watchdog without interrupting pending learning/storage flushes.

Evidence remains in `.local/engine-perf/worker-readiness-20261007/`. `ready-v2` is
byte-identical to the `authority-candidate` used for command/session checks; its
runtime hash is `27b02c5c162459ca07210500a416a61b0b591286cd776072e3e9f282709e34ae`
and worker hash is `658bb2af5525d1b41e471aa15736e129c50caa8a7c2699b563375f52c26e1f56`.

Validation passes the visible local-play journey, legacy FPS preference migration,
authoritative public async snapshot, pause/inactivity/review/saved-situation/menu
flows, silent-worker failure with no application RPC, responsive producer stall,
and stale-FPS clearing. Automatic three-buffer checks pass **40 assertions**,
including retaining every buffer across multiple watchdog intervals without a
false failure or fabricated frame. Full-service checks pass **38 assertions**
with exact state and durable-learning parity. Nine focused tests / 67 assertions,
generated-host/spike typechecking, changed helper lint, source-structure and
process-policy checks pass. Whole-editor typechecking still reports only the
two pre-existing `directionMode` literal errors recorded in the [local-play readiness candidate](october-7-worker-local-play-readiness-candidate.md).

The control/candidate parity run passes **602** normal-simulation comparisons
and six exact state, numeric-packet and compact-presentation checkpoints. Image
acceptance remains open: four captures have zero or at most two changed pixels;
one has 58 changed pixels at at most 3/255; the cold first capture has nine changed
pixels at up to 6/255, exceeding the existing 3/255 limit. No tolerance was widened.
The preceding knockout campaign remains evidence for `ready-v1`, not a newly
repeated `ready-v2` knockout test.

Fresh timing uses the same foreground Chrome, 1366×768 DPR 1, city checkpoint,
full services, six-second warmup and eighteen-second samples recorded in the [local-play readiness candidate](october-7-worker-local-play-readiness-candidate.md).
FPS is visible in **both** variants. `authority` runs eight serial trials
A/B/B/A then B/A/A/B; `authority-playable` runs four A/B/B/A. All twelve trials
retain native foreground with no runtime errors. No audit build or test runs
during the measurements; other background work and thermal/power state remain
uncontrolled. Values are medians of trials' fighting samples.

| Metric | `ready-v1` (n=4) | `ready-v2` (n=4) | Normal v2 (n=2) | `ready-v2` (n=2) |
| --- | ---: | ---: | ---: | ---: |
| Fresh combat FPS | 85.96 | 87.46 | 62.25 | 86.24 |
| Frame interval p95 | 18.20 ms | 18.05 ms | 20.25 ms | 18.10 ms |
| Frame interval p99 | 20.95 ms | 20.50 ms | 24.35 ms | 21.80 ms |
| Input age p95 | 30.50 ms | 30.40 ms | 15.80 ms | 30.45 ms |
| Main work p50 | 5.40 ms | 5.30 ms | 14.00 ms | 5.45 ms |
| Worker compute p50 | 10.30 ms | 10.25 ms | — | 10.35 ms |

This establishes no material timing regression for the readiness batch, not a
new performance optimization. The normal/worker campaign retains a **38.5%**
fresh-FPS advantage, but its input-age endpoints differ and do not establish
lower input latency. The 165 FPS goal remains unmet. Packet storage stays at
1,460,224 bytes for two buffers and no fighting simulation time is dropped.
Uncollected main-heap readings vary with GC; they are not a worker memory/soak
gate. `ready-v2-readiness.json` binds the candidate and named acceptance receipts.

Next promotion work is the remaining frame/review/lifecycle port and mode-entry
ownership, then image parity, graphics-context recovery, physical controller
coverage and a longer soak. Profile the measured main-host/presentation costs
before changing buffer count or adding more workers.
