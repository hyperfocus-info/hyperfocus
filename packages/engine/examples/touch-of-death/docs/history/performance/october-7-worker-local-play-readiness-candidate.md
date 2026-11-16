# October 7: worker local-play readiness candidate

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## October 7: worker local-play readiness candidate

**Prepared `ready-v1`; default remains unchanged.** The worker now supports more
of the real local-play host rather than only its timing loop. This is a private
artifact with incomplete host feature ownership, not a supported default release.
Evidence lives in `.local/engine-perf/worker-readiness-20261007/`: frozen sources,
artifact manifests, full HTML identity, native foreground receipts, raw frames,
state comparisons, images and owned-process cleanup. The main runtime hash is
`104114e36855f8740f61ee45baefec22ebc721cac43f501f7de6f44237a81d56`;
worker hash is `625665b178bcdd73dee5433244de46041c7014de3770ea6a0a63d043d2c5225c`.

### Implemented and exercised

- Save/load/reset and asynchronous complete snapshots target the authoritative
  world. Compact per-frame HUD data remains explicitly non-restorable. Durable
  AI revisions are queued for the next match; refreshing them does not erase
  current-fight input. The stale synchronous main-world snapshot fails explicitly.
- Mapped input, pause/resume, Drive actions, controller menu routing, review
  watch/retry/pause/return and the actual saved-situation dialog use that owner.
  The existing dialog accepts asynchronous review save/load. Live learning uses
  the actual host storage service and flushes on graceful close.
- Native blur/visibility suspends simulation and production at an acknowledged
  boundary, even without rAF. Resume rebases time and clears stale inputs and
  frames. Repeated resume requests cannot duplicate the fresh-input handshake.
- Requests and UI commands are bounded. Request timeout retires the owner and
  rejects all waiters. Initialization failure preserves normal-host authority;
  failure after transfer stops the candidate rather than resuming stale state.
  Returning a leased frame twice, or after close starts, is safe. Late transport
  messages no longer interrupt the asynchronous learning flush during shutdown.
- Host telemetry counts fresh packets, excludes paused/review frames from
  fighting FPS, and records worker compute separately from overlapping main CPU
  work, input age and frame age. Browser, DOM, audio, storage and GPU privileges
  stay in the host; engine mailbox/runtime/packet primitives remain framework-free.

The visible journey checks native inactive visibility, pause, review controls,
saved-situation persistence, menu return, failed startup and a nonresponsive
worker with 40 requests (32 timeouts and eight capacity rejections). Full-service
inline/worker checks cover exact state and durable-learning parity, save/load,
invalid restores and stale input. Command checks cover automatic three-buffer
operation, concurrent-mutation rejection and eight rapid suspend/resume cycles.

### Fresh combat measurements

Windows foreground Chrome, 1366×768 DPR 1, VSync, full services, the same frozen
city workload and source graph. The machine is the i9-13900HX / RTX 4070 Laptop
setup described below; other background activity is uncontrolled. Six seconds
warmup and eighteen measured seconds per trial, serial runs with no concurrent
audit build/test/profiling. Medians below are over trials' fighting samples.
`ready` uses eight trials, A/B/B/A then B/A/A/B. `playable` uses four, A/B/B/A.
All accepted trials retain native foreground and have no runtime errors.

| Metric | Old worker (`ready`, n=4) | `ready-v1` (`ready`, n=4) | Normal (`playable`, n=2) | `ready-v1` (`playable`, n=2) |
| --- | ---: | ---: | ---: | ---: |
| Fresh combat FPS | 89.06 | 89.09 | 61.22 | **88.82** |
| Interval p95 | 17.95 ms | 18.00 ms | 21.70 ms | 18.00 ms |
| Interval p99 | 18.80 ms | 20.95 ms | 24.75 ms | 20.50 ms |
| Input age p95 | 30.30 ms | 30.30 ms | 16.40 ms | 30.25 ms |
| Main work p50 | 4.20 ms | 5.30 ms | 14.35 ms | 5.30 ms |
| Worker compute p50 | 10.00 ms | 10.05 ms | — | 10.05 ms |

The fuller candidate preserves old-worker throughput and improves throughput over
the normal playable by **45.1%** in this campaign. It adds approximately 1.1 ms
of main work per presented frame; main busy time rises from 44.2% to 63.7%, and
p99 worsens against the narrower worker control. This is a measured integration
cost, not evidence that a particular UI helper caused it. Main input/render rAF
is approximately 163.9 Hz while fresh combat output is approximately 89 Hz.
Normal and worker input-age endpoints differ as documented below: these numbers
do not establish better input latency than normal or measure input-to-photon.

At 10.05 ms median worker compute, this remains short of the **6.06 ms / 165 FPS**
goal. Worker presentation costs about 7.1 ms and compile about 1.9 ms; main p95
is approximately 6.1 ms. These overlap and must not be added. Two packet buffers
retain 1,460,224 bytes; fighting samples report no dropped simulation time.
The initial `integration` campaign was stopped after a shutdown-flush error;
those partial timings are excluded. `ready` and `playable` were rerun after the
fix against the frozen artifact above.

### Correctness and remaining promotion gates

The initial 301-sample campaign passes 602 normal-simulation oracle comparisons,
six exact complete-state/numeric-packet/presentation checkpoints and the normal
renderer image gate (0–58 changed pixels, maximum 3/255 per channel). A separate
721-sample low-health campaign on `ready-v1` covers fighting → knockout/round
result at sample 62 → next round at sample 464. All **1,442** normal-simulation
oracle checks and nine inline/worker state, packet and presentation checkpoints
match exactly.

The expanded image gate is **open**: worker versus the normal renderer changes
0–95 pixels per 1366×768 image, with up to 9/255 channel difference. The existing
limit is 100 pixels and 3/255; it was not relaxed. Inline/worker images also have
small differences (up to 5/255), and normal/normal repeat captures reach 5/255 in
one frame. These controls show some repeat variation but do not explain every
worker difference. Retained knockout/recovery captures were visually inspected;
numeric equality is not being substituted for image acceptance.

Before a supported local-play default:

1. Replace build-time string injection with an explicit app-owned asynchronous
   world port used by the real standalone host. Keep engine scheduling/transport
   primitives game-neutral. Define checkpoint transfer and rollback of failed
   ownership changes; the retained dormant main world is not a valid fallback.
2. Complete or explicitly gate dynamic appearance/uploads, tutorials, opponent
   routines, AI report and online/replay/rollback entry points. Starting in one
   of those active modes is rejected, and bulk training is disabled, but the
   entire future navigation surface is not yet migrated or guarded. Do not
   present this artifact as general-play ready.
3. Resolve the expanded image gate, add progress detection for a stalled stream
   with no pending RPC, and exercise graphics-context recovery, actual gamepad
   hardware and a longer storage/memory soak. Current request timeouts and
   context-loss stop behavior are narrower guarantees.
4. Profile the added main-host work, then A/B any fix using fresh FPS, p95/p99,
   input/frame age and parity. Preserve the two-buffer configuration until a
   measured latency/throughput result justifies changing it. Extra buffers do
   not parallelize the sequential world or solve its 10 ms compute time.

Spike/generated-host typechecking, affected host lint, 12 focused tests with 92
assertions and process policy pass. Whole-editor typechecking is blocked by two
unrelated `directionMode` literal errors in
`packages/engine/src/combat/tuning/compatibility.test.ts`; those concurrent changes
were preserved. This preparation does not claim an editor release gate, a
complete memory optimization, or proof on other hardware.
