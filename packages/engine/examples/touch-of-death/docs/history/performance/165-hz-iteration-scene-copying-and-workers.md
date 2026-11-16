# 165 Hz iteration: scene copying and workers

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## 165 Hz iteration: scene copying and workers

Evidence: `.local/engine-perf/frame-workers-20261006/`. The control is the
previous iteration's accepted sqrt build, runtime SHA-256
`5c98a71e71d14074e883b8ce5aa1e6c6f142ad1284bf5646c3a3abd0370a450b`.
The same city checkpoint, visible focused Chrome, 1366×768/DPR 1, VSync, six-second
warmup and eighteen-second measurement are retained. Sources and artifact hashes
are frozen per candidate. No audit compiler, tests or profiler ran during timing
windows. The machine and background-work caveats below still apply.

There are 32 timing trials: eight each for entity indexing and direct sampling,
twelve in the worker/buffer screen, then four confirming the selected worker
configuration. The two CPU candidates each use two serial ABBA rounds. The
worker screen uses `A, B, C, D, E, F, F, E, D, C, B, A`, followed by an adjacent
ABBA for two workers/three buffers. This is screening evidence for the other
worker counts, not repeated isolated ABBA campaigns for each. Early plan files
inherited a generic "two serial ABBA rounds" description; their explicit
`sequence` fields and this account give the actual designs. The separate worker
smoke/parity runs and fixed-frame visual checks are not timing comparisons.

### Why offscreen entities still cost CPU

The renderer already skips hidden instances, and combat presentation already
has city-prop culling and a broad phase for camera obstruction tests. Those
decisions happen after substantial work: `sample3DFrame` creates entity and
material records; presentation searches and changes those records; `applyFrame`
resolves entity/mesh/material handles and applies every supplied transform.
The standalone host also constructed a full simulation snapshot and another
entity map before sampling. Rendering fewer entities therefore did not avoid
all that preparation for the 3,420 scene entities.

Not every offscreen entity is disposable: moving platforms, collisions, AI route
blockers and shadow casters have different relevance from camera-visible models.
`runtime.compile()` currently does not supply the scene compiler's frustum
planes. A camera-only filter on its shared command list would also remove
offscreen shadow casters. The correct next boundary is a persistent static scene
plus explicit changing/relevant sets for each consumer, rather than constructing
the whole scene and deciding visibility afterward.

### CPU candidates

Values are medians of fighting-phase trial summaries, compared within each
campaign. These are submitted game frames, not display scanout.

| Candidate | Trials A/B | FPS A → B | Frame p95 A → B | Decision |
| --- | ---: | ---: | ---: | --- |
| One entity index shared within a presentation pass | 4 / 4 | 16.98 → 17.09 | 87.90 → 95.10 ms | Reject; remove default integration |
| Sample directly from runtime poses, avoiding the intermediate save snapshot/map | 4 / 4 | 16.57 → 16.93 | 92.35 → 87.65 ms | Keep as a modest copying reduction |

The index reduced median presentation preparation from 32.85 to 30.95 ms but
did not improve the full loop; p95 worsened 8.2%. Its isolated sources and parity
test are retained with the experiment, not as a default abstraction.

Direct sampling improves aggregate p95 5.1%, p99 2.9%, and FPS 2.2%; median frame
interval is 54.60 → 53.85 ms. The first ABBA's p95 improvement was 6.4%, the
second's 1.9%, so the magnitude is variable and close to the acceptance threshold.
The change removes a concrete full-world copy/map, preserves detached frame
ownership and save snapshots, and shows no aggregate tail/median regression in
these trials. It does not solve all-entity sampling or establish a universal
speedup. The engine now provides `runtime.sampleFrame`; the standalone host uses
it. Simulation remains at 60 fixed ticks per second.

### Real worker and buffer experiment

The experiment moves **`runtime.applyFrame` and command compilation** to one,
two or three real browser workers. The main thread still owns simulation,
presentation, input/UI/audio and GPU submission. This is deliberately a measured
boundary experiment; it does **not** implement or disprove the proposed complete
worker-owned simulation/presentation architecture.

| Worker screen, two trials each | Combat FPS | Frame p95 | Frame p99 | Selected frame age p50 |
| --- | ---: | ---: | ---: | ---: |
| Control, no worker | 15.90 | 96.85 ms | 112.45 ms | Not instrumented |
| 1 worker / 1 buffer | 6.74 | 221.65 ms | 269.65 ms | 126.0 ms |
| 1 worker / 2 buffers | 9.68 | 157.70 ms | 178.90 ms | 141.9 ms |
| 2 workers / 2 buffers | 10.93 | 181.80 ms | 227.30 ms | 155.3 ms |
| 2 workers / 3 buffers | 14.85 | 112.15 ms | 128.25 ms | 168.5 ms |
| 3 workers / 3 buffers | 15.15 | 115.25 ms | 133.50 ms | 164.0 ms |

The follow-up ABBA for two workers/three buffers gives **16.40 → 16.58 FPS**,
p95 **100.00 → 96.95 ms**, and p99 **118.30 → 128.00 ms**. It does not reproduce
a clear throughput win. Selected frame age is 150.4 ms median and 266.1 ms p95.
Age measures elapsed time from the source frame's RAF timestamp until the host
accepts its result, before GPU submission. It is neither input-to-photon latency
nor an isolated measurement of worker execution. This configuration stays off
by default.

In that confirmation, synchronously posting the full scene object takes a
median 6.65 ms, worker application/compilation/packet writing 7.75 ms, and copying
returned material/palette state about 0.10 ms. The input serialization alone
exceeds the 165 Hz frame budget. Three buffers permit ownership overlap between
running, ready and consumed results; they reduce stalls in this polling host,
but do not remove the expensive main-thread scene construction. Main work on
polls without a completed render is accumulated into the next rendered sample;
polling callbacks are never counted as extra render FPS.

The engine's new opt-in experimental primitives are `createBufferedFrames` and
`createRenderFramePacket3D`; [their ownership contract](../../../../../src/experimental/README.md)
defines the scope. They provide one to three transferable buffers, bounded
admission, newest-completed selection, stale-sequence and reset-generation
rejection, explicit lease release and observable executor failure. The host owns
Worker creation and termination; the engine imports no browser globals. The
packet is 730,112 bytes for this scene: 2,190,336 bytes with three buffers. This
is **packet storage only**, excluding cloned inputs, each worker's initialized
runtime/assets, renderer memory and GPU resources. Total worker memory remains
unmeasured. No SharedArrayBuffer deployment requirements or production worker
defaults were introduced.

Initial packets match the same main-thread compilation byte for byte. A separate
visible run checks 64 inputs (including 63 combat frames through tick 272): active
command/instance/light bytes and all material/palette bytes match exactly. It is
not multiplayer, rollback, texture-replacement or physical-timeline coverage.
The local adapter is a city benchmark, not a completed general game host.

### What to parallelize next

The next prototype should give an engine worker persistent ownership of the
world and presentation state. Send compact input commands and revisions inward;
send completed numeric render packets outward. Keep DOM input, menus, audio
integration and GPU submission in the host. This removes the full scene-object
message measured above. Merely displaying the same old packet at 165 Hz would
not meet the target for fresh game frames.

| Priority | Concrete work | Tradeoff and acceptance |
| --- | --- | --- |
| 1 | Compile static entity/material bindings once; update dirty data and separate camera/shadow relevance before frame preparation | Explicit invalidation for destruction, wardrobe, fades, moving platforms, seek and scene replacement; equal images/state and reduced scans/bytes |
| 2 | Move authoritative advancement and presentation preparation behind an engine execution adapter with persistent worker-owned state | Compact messages, ordered inputs, bounded newest-frame publication; measure completed-frame FPS, input acknowledgements, age, catch-up and rollback |
| 3 | Partition independent transform/skinning/culling ranges and revision-tagged navigation jobs across a bounded pool | Stable reduction/commit order, reject stale world revisions, measure scheduling/transfer costs and total memory at each pool size |
| 4 | Separate main, outline and shadow command relevance/batching | Preserve offscreen shadows and independent cutaway materials; measure CPU and GPU work separately |

The 32 logical CPUs are available execution capacity, not 32 independent future
combat ticks. Later ticks depend on earlier contacts and inputs. An unlimited
queue or speculative future frames would trade responsiveness/correctness for
a misleading throughput number. More than three workers cannot help this
three-slot whole-frame experiment without partitioning a frame into independent
jobs. The existing `createSimulationBatch` is useful for independent training
trials; the texture-transcode scheduler is a FIFO for asset jobs. Neither has
the newest-frame ownership semantics needed here. Runtime primitives, execution
ownership and useful parallel partitions must change together.

### Verification and limits

- Focused runtime and buffer/packet checks: 36 tests, 1,234 assertions pass,
  including detached sampling through movement/quaternion changes/restore,
  transferable ownership, out-of-order results, reset, disposal, failure and
  layout validation before writes. The rejected index also passed its semantic
  checks; its rejection is based on performance.
- Engine source/test and editor source/test typechecks pass. Targeted ESLint has
  zero errors and six existing grandfathered numeric-expression warnings.
- A visible sampler oracle compares the complete old/new evaluated frame on
  317 calls, including 241 consecutive capture frames: exact values match.
  Five saved gameplay checkpoints also match. Three of the original five PNG
  pairs are byte-identical; the other two differ on 12 and 10 of 1,049,088 pixels,
  by at most one 8-bit colour level. Repeating the unchanged control also changes
  eight pixels by one level. Exact PNG equality is therefore not claimed;
  inspected captures show no material visual change. `oracle-state-parity.json`,
  `pixel-diff.json` and `control-repeat-pixel-diff.json` preserve both results.
- Package build and external installed-package consumer pass. The experimental
  native/rebundled entry is 23,198 bytes within its 24,000-byte budget. It adds
  4,576 bytes; direct sampling and its private pose/camera helpers add 307 bytes
  to the runtime entry.
- The full bundle gate fails on broader existing budgets. An isolated build
  without this iteration still measures the 3D runtime at 1,075,606 bytes against
  605,000, and physics-3D at 54,051 against 24,000, unchanged by this iteration.
  `package-delta.json` and `package-bundle-sizes.json` retain the evidence. Those
  budgets were not raised to conceal failures.
- Broad source-structure and code-style checks also remain red on existing
  repository debt, recorded in `source-structure.log` and `code-style.log`.
  The new sampler initially pushed the runtime constructor over its limit;
  private pose/camera readers were extracted and that violation is fixed. The
  changed runtime/host files have no remaining style violations from this work.
  These small final organization changes are covered by the sampler oracle;
  the timing table above refers to the frozen `sampled` artifact. The fresh
  final runtime is `bc012d7bf0348bce1fd3d7cf6cdbb4ba92a4c09840f21189f519ea2606a314fa`.
- All 32 timed windows stayed visible and focused, with no page errors; owned
  browser cleanup records are empty. Process policy passes with zero violations.
  The reused server's log and unresolved-error check are clean.
- The fresh final build runs in a focused visible browser, enables the production
  sqrt backend, displays the FPS counter and records telemetry with the matching
  runtime fingerprint, without page errors. `final-verification.json` and
  `final-visible.png` retain this smoke check; its FPS is not another A/B trial.
- This workload still falls far short of 165 FPS. No claim is made that the
  entire math pipeline has moved off the main thread, that all cores are useful,
  or that the collision questions below are resolved by these changes.
