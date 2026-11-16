# Editor and engine adversarial audit

Audited 2026-09-09 against the working tree based on
`0435b565c0b26eb1f2adc30122969245522833a5`, with substantial pre-existing changes.
This is a source and targeted-execution audit, not a clean-commit certification.
The original audit changed no production behavior. Repairs on 2026-11-01 close
EEA-01/05/07 and the 2D portion of EEA-02; statuses below distinguish those repairs
from the historical reproductions. The seeded history tests
and the [shared testing guide](../../../docs/adversarial-testing.md) preserve its
verification approach. This document owns the open findings below; readiness and
resilience documents route here rather than duplicate the backlog.

## Result and evidence levels

Fifteen findings remain wholly or partially open. Identity failures, asynchronous
editor mutation, input replay and export outcome propagation have highest repair
priority. Existing safeguards are substantial, but broad resilience scores do not
establish these edge cases.

**Reproduced** means executed against current code, including isolated drivers or
the installed dependency. **Source-established** means a complete failing path was
traced but its browser/hardware consequence was not executed. **Missing evidence**
does not assert a defect. P1 denotes corruption, wrong-object mutation, duplicate
actions or successful delivery with missing requested content; P2 covers narrower
contract, diagnostic, lifecycle and portability gaps. Severity is repair priority,
not a claim that every consumer reaches the trigger.

## Findings and repair status

### EEA-01 / P1: rejected registrations consume capacity

**Repaired 2026-11-01.** Creation validates before claiming body/constraint slots
or publishing IDs. [Lifecycle regressions](../src/physics/lifecycle/regressions.test.ts)
cover invalid 2D fields, 3D damping/quaternions and all five rigid-constraint
creation paths, then successful retry with the same IDs and one-slot capacity.
Finite destination/derived overflow remains separately tracked by EEA-03.
Historical reproduction:

**Reproduced.** [Rigid body creation](../src/physics/rigid-3d-api.ts), lines 88–108,
claims a slot before damping validation, and registers the ID before quaternion
validation. In a capacity-one world, adding a sphere with `linearDamping: -1`,
`angularDamping: -1`, or `rotation: [0,0,0,0]` throws, then a valid sphere reports
exhaustion. The quaternion case also leaves `hasBody("bad") === true` while
`diagnostics.bodies === 0`.

[2D creation](../src/physics/2d-operations.ts), lines 74–108, similarly consumes the
slot on rejected dynamic `mass: 0`. [Constraint creation](../src/physics/rigid-3d-constraints.ts),
lines 92–97 and 312–335, pops before validating endpoints and constraint fields.
A missing endpoint, negative stiffness or negative distance exhausts a one-slot
constraint store with zero live constraints.

Acceptance: validate all fields and derived values before commit, or restore every
changed structure on failure. Fill/reject/retry tests must compare live IDs,
occupancy, diagnostics and free capacity. [Rigid 3D](rigid-3d.md) now documents
the validated creation boundary and its remaining limits.

### EEA-02 / P1: stale indices address replacement objects

**Partially repaired 2026-11-01.** 2D body and joint handles now check generations
at public boundaries, remain representable in Int32 query buffers, and retire
instead of wrapping. Queries, rays, shape casts, contacts and joint endpoints
return the same identities. Removal clears prior contact results. See
[2D contracts](physics-2d.md) and [regressions](../src/physics/lifecycle/regressions.test.ts).
Rigid-3D constraint, transform and scene-resource reuse remain open. Historical
reproduction:

**Reproduced** for 2D bodies, rigid-3D constraints and transform hierarchy.
Create A, retain its numeric handle, remove A, create B: both handles are zero in a
capacity-one store. `setPosition(oldA, 99, 100)` moves B; `removeConstraint(oldA)`
deletes the new constraint; stale transform setters change the new transform.

Owners: [2D operations](../src/physics/2d-operations.ts), lines 108/127;
[2D resolution](../src/physics/2d.ts), line 275;
[constraint pool](../src/physics/rigid-3d-constraints.ts), lines 71–97;
[transform hierarchy](../src/render/3d-core.ts), lines 470–510.
[Scene resource pools](../src/render/3d-scene.ts), lines 177–203, have the same
raw-index design by inspection; individual mesh/material/texture/skeleton/light/
instance reuse was not executed.

Acceptance: generation-checked public identities or equivalent stale rejection,
with explicit private slot indices and generation exhaustion policy. Rigid-3D
body handles already provide a safeguarded example. Specify any intentionally
borrowed index lifetime; calling a recycled index stable is insufficient.

### EEA-03 / P2: finite inputs can produce nonfinite persistent state

**Reproduced.** `precision: "float32"` 2D body creation accepts `x: 1e40`, then
`body().x` is Infinity. Transform `setPosition(handle, 1e40, 0, 0)` produces
Infinity in positions and the world matrix. Owners:
[2D storage](../src/physics/2d-operations.ts), line 90, and
[transform setters](../src/render/3d-core.ts), lines 506–510.

[Movement prediction](../src/net/movement-predictor.ts), line 75 onward, also
accepts finite positions `-1e308` at time zero and `1e308` at time one; with
`maxSpeed: 10`, `predict(2)` returns NaN position/velocity because subtraction
overflows before speed clamping.

Acceptance: validate destination representability and derived arithmetic before
mutation, including Float32 underflow of positive extents/masses. Reject or report
overflow without poisoning state. These extreme-value repros do not establish an
ordinary-coordinate simulation instability.

### EEA-04 / P2: 2D query completeness is unknowable after truncation

**Reproduced.** Two matching bodies queried into `Int32Array(1)` return one, with
no diagnostic; zero-length output returns zero. [queryAabb](../src/physics/2d-api.ts),
lines 190–200, stops at capacity. Its documented return is count written, so this
is a completeness/diagnostic contract gap, not a wrong count. Rigid-3D query code
already increments `queryTruncations` when more matches exist.

Acceptance: expose truncation or required count, and test zero/exact/overflow
outputs while keeping successful bounded writes allocation-free.

### EEA-05 / P2: interrupted driver accumulation bypasses the work ceiling

**Repaired 2026-11-01.** Each advance bounds executed updates independently of
incoming delta and retains excess time in `pendingSeconds`. An interrupted
advance skips rendering; continuation drains the remaining work. The
[loop regression](../src/runtime/loop.test.ts) proves a 15,000-step backlog drains
as 10,000 then 5,000 updates without losing simulation time. Historical reproduction:

**Reproduced.** With `step: .001, maxFrame: .05`, call
`advanceBy(600, { shouldContinue: () => false })` 300 times, then `advanceBy(0)`.
The latter executes **15,000 updates**. [loop.ts](../src/runtime/loop.ts), lines
29–42, validates a 10,000-update ceiling using only `maxFrame / step`; lines 76–99
retain interrupted accumulation and drain it without an execution-count limit.

Acceptance: independently bound work per advance and explicitly report retained
or dropped backlog. This is a direct-driver interruption issue. Ordinary RAF
pause/resume resets the accumulator and does not reproduce this backlog.

### EEA-06 / P1: server input sequence headers are discarded

**Reproduced with a mocked transport, no listening server.** Input sequence
`[2, 2, 1]` dispatches all three `fire` actions.
[authoritative-websocket.ts](../src/server/transport/authoritative-websocket.ts),
lines 85–87, forwards only `message.payload` into `receiveInput`. The room input
path supplies no replacement sequence guard. WebSocket's own ordered transport
does not make repeated application actions idempotent.

Acceptance: preserve sequence/session identity through admission, define replay
and u32-wrap policy, and prove duplicates/stale inputs cannot execute the action
again. Distinguish connection epochs on reconnect. Existing *snapshot* replay
guards do not protect this input path.

### EEA-07 / P2: rollback skips valid falsy state

**Repaired 2026-11-01.** Presence uses `Map.has`; saved `0`, `false`, empty text,
`null` and `undefined` all replay in [rollback tests](../src/runtime/rollback.test.ts).
The scoped `hyperfocus/explicit-map-presence` rule guards locally tracked Map
lookups; [code style](../../../docs/code-style.md#resource-and-state-boundaries)
owns the general rule. Historical reproduction:

**Reproduced.** [rollback.ts](../src/runtime/rollback.ts), lines 199–201, tests
`if (!snapshot) return`. For generic numeric state initially zero, one tick with
local input one followed by remote frame-zero input one leaves state **1**, rather
than replaying to **2**. False and empty-string snapshots have the same check.

Acceptance: distinguish absence from value, including an explicitly valid
undefined state when the generic contract permits it; test late correction from
falsy snapshots and history-window rejection separately.

### EEA-08 / P2: accepted spatial indices can stop loop progress

**Source-established with arithmetic reproduction.**
[spatial-hash.ts](../src/server/replication/spatial-hash.ts), line 248 onward,
validates finite coordinates/radius but not safe derived cells or visited-cell
work. At `cellSize: 1`, `cellOf(2 ** 53, 0).x + 1 === cell.x`.
`queryNearby({ x: 2 ** 53, y: 0, radius: 0 })` therefore cannot advance its loop.
The nonterminating query was deliberately not run. Large radius arithmetic can
also overflow or demand impractical work.

Acceptance: reject unsafe/nonfinite derived cell bounds and bound query traversal
before looping, including huge finite radius/position combinations.

### EEA-09 / P1: pending non-atomic import can land in another project

**Reproduced.** Start a `baseRevision: 0` asset import and suspend `host.putAsset`.
Call `session.replace(createDefaultProject("Different project"))`, then resolve the
write. The import reports success and adds its catalog entry to the new project.
[editor-command-session.ts](../../../apps/engine-editor/src/editor-command-session.ts),
lines 162/223 and 630–649, guards atomic staging and concurrent `execute` calls,
but permits direct replacement/undo/transact during a non-atomic await. Its initial
revision check does not cover the project eventually mutated.

Acceptance: retain mutation ownership or revalidate project identity/revision
after asynchronous work. Specify cleanup of staged binaries. Test replace, undo,
redo and direct edits while a host operation is suspended. Atomic AI plans already
reject competing edits; this finding concerns the public sequential session path.

### EEA-10 / P2: recovery and portable save disagree on nonfinite extensions

**Reproduced.** `project.replace` with
`extensions: { audit: { pose: NaN, negativeZero: -0 } }` succeeds and retains NaN.
`session.serialize()` writes `{ "pose": null, "negativeZero": 0 }`, while
`createHyperfocusProjectFiles(session.project, [])` rejects nonfinite numbers.
[Editor validation](../src/project/editor.ts), line 603, only checks that extensions
are an object; [section serialization](../src/project/sectioned-serializer.ts)
uses JSON serialization directly. [Portable JSON](../src/project/index.ts), lines
140–147, correctly rejects nonfinite numbers and deliberately normalizes -0.

Acceptance: apply compatible recursive JSON validation before accepting authored
state, including DOM-free replacements and direct transactions. Test recovery and
canonical save together. Negative-zero normalization itself is not a defect.

### EEA-11 / P2: disabled local storage can prevent editor startup

**Source-established.** [editor-shell.ts](../../../apps/engine-editor/src/editor-shell.ts),
line 126, calls `readRecovery`; line 2717 calls `localStorage.getItem` outside the
parse/migration try/catch. A storage access exception escapes initialization.
First-run access at line 300 is likewise unguarded. Recovery quota errors on the
asynchronous write path at line 291 are caught, but this does not cover reads.
The single origin-wide recovery key also has no cross-tab revision arbitration;
that race remains unexecuted.

Acceptance: startup works with unavailable recovery storage and reports degraded
recovery explicitly. Browser tests must inject read denial, write quota failure
and competing-tab recovery writes, separately from canonical-pair persistence.

### EEA-12 / P1: lost rendering context still advances video export

**Source-established.** [3d-webgl2.ts](../src/render/3d-webgl2.ts), line 211, returns
`contextLost: true, skipped: true`. The
[canonical video renderer](../../../apps/engine-editor/src/motion/editor-3d-video-renderer.ts),
lines 104–105, ignores that result and composites the canvas. Encoder loops then
accept the frame and advance its timestamp. The outer operation can succeed with
stale/blank content even though the inner renderer detected loss.

Acceptance: fail delivery explicitly or restore and retry the same frame before
encoding. Test loss before frame zero and mid-export with a controllable renderer,
then `WEBGL_lose_context` in an owned headless browser. Reupload/restore unit tests
alone do not prove delivery recovery.

### EEA-13 / P1: advertised canonical video shadows never execute

**Source-established.** The same video renderer advertises `"shadows"` at line 10
and allocates a shadow target at line 73, but line 104 never passes
`shadowViewProjection`. [Backend shadow dispatch](../src/render/3d-webgl2.ts),
lines 247–265, disables shadows without that matrix. The compositor supplies no
replacement shadow operation. [Frame capability data](../src/frame/3d.ts), lines
930–932, nevertheless declares shadows supported for video.

Acceptance: a lit occluder/receiver fixture issues shadow draws and shows receiver
occlusion through canonical delivery, or the unsupported capability rejects
preflight. Import/source-string parity cannot prove a render pass occurred.

### EEA-14 / P2: skin palette preflight overestimates hardware capacity

**Source-established.** [Palette sizing](../src/render/3d-webgl2.ts), lines 894–897,
uses `floor((MAX_VERTEX_UNIFORM_VECTORS - 5) / 4)`. The
[current vertex shader](../src/render/webgl2/shaders.ts), lines 19–26, contains two
matrices, a vec4 and scalar uniforms besides the palette. At 256 vectors, the
accepted 62-joint palette plus two matrices and the vec4 already require 257
vectors. Shader compilation can still fail visibly; the preflight is inaccurate.

Acceptance: budget the actual active shader uniforms and test the accepted maximum
plus one. Correct the fake-driver test's obsolete five-vector assumption and
verify a constrained real driver. Do not hardcode a universal mobile bone count.

### EEA-15 / P2: cancellation during finalization still reports success

**Source-established export path; reproduced dependency semantics.**
[MP4](../../../apps/engine-editor/src/export/mp4-export.ts), lines 74–76, and
[WebM](../../../apps/engine-editor/src/webm-export.ts), lines 75–77, await
`output.finalize()` and return success without checking cancellation again.
The installed Mediabunny 1.52.2 `Output.cancel()` is a no-op in `finalizing` or
`finalized`. Creating an Output with WebMOutputFormat, BufferTarget and
EncodedVideoPacketSource("vp8"), then calling `start`, `finalize`, `cancel`, and
awaiting finalization reproduces **finalizing → finalizing → finalized**.

Acceptance: define the irreversible commit point, honor cancellation before it,
and avoid successful buffer download after cancellation. Suspend finalization in
an encoder-level test; the current abort-helper tests do not exercise encoding.
Direct-to-file commit semantics require a separate assertion.

### EEA-16 / P2: export destination has no cleanup owner during preparation

**Source-established.** [client.ts](../../../apps/engine-editor/src/client.ts),
lines 3297–3301, opens a writable before cancellable physics preparation; rejection
rethrows without aborting it. Audio preparation can fail before the encoder takes
ownership as well. [direct-video-file.ts](../../../apps/engine-editor/src/export/direct-video-file.ts),
line 14, returns the live writable.

Acceptance: own the destination from acquisition through handoff/commit and close
or abort exactly once on preparation failure/cancellation. Test a fake writable's
terminal calls, then actual File System Access behavior.

### EEA-17 / P2: unsupported-effect feedback contradicts Build rejection

**Source-established and existing rejection test passes.**
[client.ts](../../../apps/engine-editor/src/client.ts), lines 1627/1652, says
unsupported experimental passes are ignored by Play/Build.
[playable-build-assets.ts](../../../apps/engine-editor/src/playable-build-assets.ts),
line 340, emits error `UNSUPPORTED_POST_EFFECT`, consumed by Build readiness.
The matching rejection test passes.

Acceptance: one executable capability policy determines preview, Play, Build and
export outcomes, and user feedback derives from that result. This requires
behavioral contract review; changing prose alone does not prove parity.

### EEA-18 / P2: uncalibrated timing limits remain ordinary test gates

**Source-established.** Ordinary engine tests discover `*.bench.test.ts` under
`src`. Examples: `runtime/rollback.bench.test.ts:46` requires p95 below 1 ms;
`physics/2d.bench.test.ts:30` below 8 ms; `server/replication/mmo-load.bench.test.ts:29–30`
below 2/10 ms; `server/replication/mmo-scale.bench.test.ts:106,130,159,188` uses 250/50 ms
limits. These conflict with [developer performance](developer-performance.md),
which says no reference runner is pinned. The rigid-3D performance guide also
describes an unconditional one-second test ceiling.

Acceptance: correctness CI asserts steps/candidates/bytes/draws/cache/queue bounds;
timing stays diagnostic until a named environment is calibrated. Keep measured
tails as a separate lane. No timing-gate migration or GC/p99 benchmark was performed
by this audit.

## Verified safeguards and remaining evidence

| Requested surface | Evidence obtained | Still unverified |
| --- | --- | --- |
| Fixed step | Default monotonic clock, huge/negative delta clamp, positive step validation, finite remainder alpha, pause/resume reset; existing tests pass. | Actual ten-minute hidden-tab wakeup, backward custom-clock recovery, randomized interruption traces beyond EEA-05. Alpha normally advances even with zero updates. |
| Registries | Rigid-3D body generations reject stale references and retire before wrap; contacts/candidates report overflow; normal body overflow throws. | Exhaustive registry inventory; all zero/one/full/reuse permutations; scene resource pools beyond source review. |
| History | New seeded trace verifies exact serialized state across checkpoints, replacements, macros, scene/component changes and asset removal. Existing atomic rollback, stale-plan and serialization-count tests pass. | Real undo while Play is active and while physical work is pending. Source invalidates production cache; 3D Play intentionally retains its session, but end-to-end navigation behavior was not exercised. |
| Physics | Zero-size/invalid dynamic-mass rejection; static/kinematic mass distinction; closest-face fallback for zero-distance sphere/box; quaternion normalization; self-constraint rejection and removal cleanup. Physical-action/root-motion arbitration has existing behavioral tests. | Exact tile boundary/zero-motion sweep matrix, mixed box/constraint/ragdoll/IK random scenes and simultaneous presentation IK/root-motion/physical writers. No claim that this combination is already broken. |
| Saves | Save migration gaps/checksums reject; finite JSON validation and -0 normalization; binary journal checks; filesystem phase-hook recovery tests pass. | Actual process kill and fresh-process recovery; power failure; real IndexedDB quota/CAS/retry exhaustion and concurrent tabs. Browser save unit tests cover error normalization/unavailable construction, not transaction behavior. |
| Network | Snapshot duplicate/reorder/u32 wrap guards, delta-base validation, serialized Blob decoding, stale-socket rejection and rollback window diagnostics pass. Byte budgets reject/defer complete packets/segments with diagnostics. | Random fault-trace convergence, reconnect during snapshot/base eviction composition, same-tick interest leave/reenter and input replay repair. |
| WebGL | Fake-driver loss/restore/reupload, zero-instance skip, dimensions and skeleton diagnostics pass. | Actual context loss during export/upload, low-end uniform budget, NPOT/filter/mipmap hardware matrix. No concrete NPOT defect found. |
| Video | Odd dimensions blocked by current preflight; index-derived timestamps avoid cumulative summation; awaited `video.add` applies dependency backpressure; half-open range/sample counts pass. | Long audio/video drift, full-queue cancellation, final-keyframe decode and real browser finalization. Current even-dimension preflight also constrains WebM. |

Performance inspection found allocation candidates, not measured regressions:
2D broadphase string pair keys; spatial-hash public cell strings/objects despite
packed internal lookup keys; multipart replication Map/string keys/sorts per
packet; editor frame-stat array copy/sort and 3D Play snapshot/Map construction.
No new pooling or y-sort optimization is justified from these observations alone.
Resident collision WASM buffers genuinely remain resident between explicit writes;
existing tests cover that path. Pooling already has benchmark history including
losing candidates. Durable outbox overflow returns false and room code records
`persistence.append_event_overflow` before skipping broadcast; application-level
producer acknowledgment remains a separate contract question.

## Execution record

Windows, Bun **1.4.2**. These commands ran against the working tree. Counts overlap
where a file was run by two audit slices; do not sum them as unique coverage.

| Command from repository root (`bun.cmd test` prefix) | Result |
| --- | --- |
| `packages/engine/src/runtime/loop.test.ts packages/engine/src/physics/2d.test.ts packages/engine/src/physics/rigid-3d.test.ts packages/engine/src/physics/ragdoll-3d.test.ts packages/engine/src/physics/physical-performance-3d.test.ts` | 170 pass, 1,115 assertions |
| `packages/engine/src/save packages/engine/src/project/filesystem.test.ts packages/engine/src/net/authoritative-client.test.ts packages/engine/src/net/movement-predictor.test.ts packages/engine/src/server/replication/replicator.test.ts packages/engine/src/server/replication/spatial-hash.test.ts` | 67 pass, 234 assertions |
| `packages/engine/src/render/3d-webgl2.test.ts apps/engine-editor/src/export/export-range.test.ts apps/engine-editor/src/export/export-cancellation.test.ts apps/engine-editor/src/motion/editor-3d-renderer-parity.test.ts` | 30 pass, 173 assertions |
| `apps/engine-editor/src/export/release-preflight.test.ts apps/engine-editor/src/playable-build-assets.test.ts` | 22 pass, 66 assertions |
| `apps/engine-editor/src/commands/atomic-plan.test.ts apps/engine-editor/src/editor-command-session.test.ts apps/engine-editor/src/motion/editor-3d-renderer-parity.test.ts` | 62 pass, 507 assertions |
| `apps/engine-editor/src/commands/history-adversarial.test.ts` | 4 pass, 12,513 assertions |

The new history test runs seeds **1, 42, 24301, 3735928559**, **280 operations per
seed**, then full undo/redo sweeps. The first 40 edits cross the 32-delta checkpoint;
the trace covers mixed snapshots/deltas, accepted/rejected edits and branching.
Its failure includes seed and operation prefix. This is a history oracle, not a
complete editor/browser fuzzing harness.

A separate executed diagnostic used seed **10035238**, 16 randomized spheres and
10,000 steps at 1/120 second, with zero gravity, frictionless elastic contacts and
random linear/angular velocities. State remained finite; maximum quaternion norm
error was **4.440892098500626e-16**, maximum per-step translational energy increase
was **0**. This controlled fixture proves neither arbitrary energy conservation nor
containment in an unbounded world.

Local observation probes reproduced EEA-01–05, EEA-06–10 and dependency semantics
for EEA-15. They lived under `.local/editor-engine-audit/` and `.local/engine-audit/`;
their observed-defect assertions are not passing correctness gates. The minimal
inputs, sequences, results and owners above remain durable without those files.

Handoff checks: editor TypeScript (`bun.cmd x tsc --noEmit -p
apps/engine-editor/tsconfig.json`), ESLint on the new history test, and
`bun.cmd run check:process-policy` passed (2,620 files, zero violations). All 150
local links across the ten touched Markdown files resolve, and scoped
`git diff --check` passes. `check:source-structure` fails on oversized files,
declarations and directories outside this audit's edits. Documentation policy
reports seven passes and one unrelated failure: PadPilot coverage lacks
`PP-EVAL-002`, `PP-EVAL-003`, and `PP-EVAL-004`. No full repository `check`, browser
delivery verification or release certification is claimed.

## Follow-up order and closure

1. Repair EEA-01/02/09 with state-machine regression tests; cover failed operations
   as well as successful reuse and undo. Do not broaden validation after consuming
   capacity or introduce new unguarded public indices.
2. Close delivery propagation EEA-12/13/15/16 and the shared capability outcome in
   EEA-17. Require encoder-boundary assertions and actual visual delivery evidence.
3. Repair input replay/rollback and numeric/work bounds EEA-03–08/10; make storage
   failure and query truncation observable to the owning operation.
4. Add the missing network convergence, save/kill/load and capacity-model harnesses
   from the shared guide; promote the controlled physics diagnostic into the
   physics lane with explicit fixture assumptions. Extend history testing to
   suspended host/Play/cache operations. These four broader harnesses are **not
   claimed implemented** by this audit.
5. Replace EEA-18's unconditional timing gates with work assertions, then collect
   reference-qualified complete-loop p99/GC evidence for measured optimization.

Close an EEA item only with its desired-outcome regression and relevant boundary
verification. Record the command/result and remove or qualify contradicted claims
in the owning guide. Unit success, shared types, changed wording and speculative
performance improvements are insufficient closure evidence.
