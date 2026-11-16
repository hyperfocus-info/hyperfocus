# Developer Simplicity And Performance Contract

The engine should make the scalable path the shortest documented path. Low-level APIs remain available, but projects should not need to replace their lifecycle, input model, renderer, or diagnostics when they grow.

## Golden Path

- Use `createBrowserApp` for explicit fixed-step lifecycle, scoped keyboard input, cleanup, resolved configuration, and opt-in bounded metrics.
- Call `start()` explicitly after game state and render dependencies exist.
- Use `@hyperfocus/engine/render` structured render data and a stage for shared gameplay rendering.
- Supply a viewport cull rectangle whenever world calls can leave the screen.
- Record stage `submitted`, `drawn`, `skipped`, and `culled` counts in frame metrics.
- Keep immediate Canvas calls for authored overlays, debug views, and genuinely small scenes.
- Inject touch or virtual controls into a scoped input state. Do not install or mutate global input state.

For selective 3D gameplay presentation, `game.readPresentation({ entityIds })`
returns detached poses and dynamic velocities for those entities, plus the current
play/combat capture. It omits behavior saves, held inputs and physics contacts.
Its `renderOnly` marker rejects accidental restore; use `game.snapshot()` or the
checkpoint API for independent saves and rollback. The opt-in worker host is its
first consumer. Full combat capture still has a cost; this is not a borrowed or
zero-allocation view.

Velocity-only presentation and locomotion consumers use the caller-owned
[`readVelocity` primitive](rigid-3d.md#create-and-step-a-world). Combat exchange,
AI feedback, defense, locomotion effects and hitstop observers share one detached
capture within their synchronous read-only phase. Mutation phases retain their
own capture/restore boundaries; external snapshots remain independent. These
changes remove redundant work without establishing a target-device speedup.

`game.presentAndReadPresentation(frame, { entityIds, capture: 'shared' })`
experimentally shares one detached combat capture between built-in presentation
and the selected read. Independent capture remains the default. Callbacks cause
an independent fallback unless the caller explicitly supplies
`observerContract: 'read-only'`: callbacks may change evaluated frame/camera
records, but must not mutate gameplay/runtime or captured state, retain capture
inputs, or reenter the operation. `onPresented` supplies a synchronous host timing
boundary. Shared mode reports `sharedCompositeCaptureMs` through the stage
observer; it is inside presentation time, not an additional duration to sum.
Work counters count actual component captures. Captures never persist across
invocations, including equal-tick hitstop, exceptions or resets. The returned
view remains detached and retains the complete existing combat fields.

`runtime.withRenderView({ sample, operation })` borrows retained entity/material
rows for one synchronous render operation. Do not retain/freeze its records or
return a Promise. Entity values are refreshed from current state on every call;
immutable base material looks are reused only while authored scalar values match.
Presentation can replace a row's `look`, but cannot mutate its frozen base look.
Timeline and physical-performance sampling explicitly fall back to detached
frames. `sampleFrame` remains the independent snapshot API. Applying either view
keeps resource validation and repairs external live-storage changes.
`readRenderViewWork()` reports visits, retained storage and allocations.

`createFrameWorkPolicy(jobs, clock)` from the core entry schedules **optional**
work inside the caller's existing frame callback. Jobs declare an interval,
maximum age and initial cost estimate. `run` receives remaining CPU budget,
revision and optional urgency; it coalesces pending work and forces expired jobs.
Input, fixed simulation and required rendering do not belong in this queue.
Visible interactions should be urgent. Reset the policy when rewinding its clock.
The policy creates no timers, workers or DOM dependencies and bounds pending
storage to the declared jobs. These primitives remain opt-in pending full-loop
acceptance; they do not change the default simulation or scheduling policy.

For diagnostic attribution, `game.presentFrame(frame, { onPresentationStage })`
reports completion of named combat-presentation stages. The host supplies clocks
and bounded retention; the engine reads no diagnostic clock. These stages are
nested within total presentation time and must not be added to that total again.
Keep this observer disabled in acceptance timing controls.

`createTargetRayQuery3D` from `@hyperfocus/engine/experimental/target-rays` provides the
existing sight-segment/box test with a selectable `general` or `axis-aligned`
strategy. Pass box-local eye coordinates, world-space targets, a target-prefix
count, box TRS and padding to `query.test(...)`. The segment interval remains
0.015–0.985. The default is `general`; the opt-in strategy skips identity
quaternion transforms and retains the general path for rotated or exceptional
inputs. It borrows arrays synchronously, retains no frame or result cache, and
allocates no per-query storage. Optional `diagnostics: true` exposes cumulative
`work` counts; `reset()` clears those counters. The
[producer audit](../examples/touch-of-death/docs/touch-of-death-producer-audit.md)
owns lab timing and the open acceptance limits.

Combat presentation also accepts a synchronous `PreparedTargetRayQuery3D`
owner as `targetRayQuery`. It prepares the current ordered targets once, answers
box queries, then releases its borrowed references in `finally`. Selecting an
external owner and the built-in partition owner together is rejected. This seam
does not remove resource or geometric validation and introduces no worker or Wasm
dependency into the engine. The [four-path audit](../examples/touch-of-death/docs/touch-of-death-four-paths-audit.md)
records the checked JS/Wasm/SIMD adapters and the separate parallel batch replay.

`createHyperfocus3DRuntime(project, assets, { entityApplication,
entityApplicationDiagnostics })` selects `original` (default) or experimental
`retained-input` transform application once at runtime creation. Retained input
owns detached exact TRS values, packed results and revisions; it still scans
incoming inputs and live transform storage. It retains no caller frame and adds
128 bytes per authored entity in three fixed typed buffers. Instance, mesh and
material validation always runs. With diagnostics enabled,
`runtime.readEntityApplicationWork()` borrows counters from the last application;
copy them before the next call. Runtime recreation clears the cache; checkpoint
restore is safe because both inputs and live storage are compared. The
[entity application audit](../examples/touch-of-death/docs/touch-of-death-entity-application-audit.md)
found no defensible gain and recommends `original`.

Hosts retaining a runtime across seeded world resets can call
`runtime.resetPresentationTransforms()` to restore authored entity TRS and clear
transform comparison/lease history, then
`runtime.resetPresentationMaterialHistory()` to clear detached material and input
revision comparisons. Suspend presentation and discard old interpolation leases
first. These explicit resets add no per-display work, preserve gameplay state and
live resources, and keep resource/revision epochs monotonic. Restore gameplay
through its checkpoint owner and rebuild presentation history separately.

Endpoint producers can declare `writableEntityIds` during
`runtime.acquireEndpointProducer()` and use
`runtime.withSampledFrame({ sample, operation, contract: 'declared-entity-writes' })`
to reuse numeric TRS validity inside a synchronous operation. The caller confines
TRS writes and aliases to those IDs, with no reentry, topology edits or runtime
mutation during the operation. Authority expires on return, including Promise
return; escaped detached frames take checked application. Entity/resource visits
always remain. The journal adds 62 typed bytes per entity plus ID references and
sampling/generation bookkeeping. It is opt-in; the [full-loop comparison](../examples/touch-of-death/docs/touch-of-death-standard-primitives.md)
finds cheaper application but no established fresh-motion gain in both arenas.

The same ownership window accepts `entitySampling: 'immutable-trs'` to reuse
unchanged, frozen nonwriter TRS tuples. Frame/entity shells and declared writer
vectors stay fresh; escaped shared tuples remain immutable. Motion/physics sources
are excluded, and unsupported timelines or missing writer contracts use detached
sampling. `readEntitySamplingWork()` exposes construction, copy, lookup, freeze
and bounded owner-storage counters. This is opt-in: the [sampling comparison](../examples/touch-of-death/docs/touch-of-death-entity-sampling-audit.md)
removes about half the vector allocations but does not establish a full-loop win.
Keep detached sampling as the default; do not infer speed from allocation counts.

## Performance Evidence

Every performance decision uses two complementary forms of evidence.

Portable efficiency answers whether the data is stored, processed, and displayed
with the right amount of work. Local latency answers how long that work took on one
host at one moment. Neither substitutes for the other, and a one-off timing win must
never be described as proof that an implementation is the most efficient design.

### Portable structural gates

These run in ordinary tests and must not depend on laptop speed:

- behavior and draw-count parity;
- Canvas or renderer operation counts;
- submitted, drawn, and culled records;
- objects, arrays, resources, and bytes created;
- cache size and hit/miss counts;
- queue depth, dropped work, and coalesced work;
- encoded and transmitted bytes;
- scaling ratios as workload size increases.

Structural reports should state the expected complexity and count the dominant
work directly: full-record scans, tree updates, bytes copied across a boundary,
typed-array/view allocations, retained entries, rendered nodes, DOM mutations,
serialized frames, and database rows touched. A candidate that is faster locally
but performs more unbounded work remains a risk, especially under contention.

For packaging changes, run `bun run build` and `bun run check:bundle-size` in the
engine package. Check complete native import graphs and rebundled consumers,
including every shared chunk. [Bundle evidence](bundle-size-evidence.md) defines
the measurement boundary and links historical tradeoffs, including a shared build
rejected for increasing native downloads. A smaller package total alone is insufficient.

### Controlled timing gates

Wall-clock p50, p95, and p99 remain necessary because users experience time, not operation counts. Absolute timing gates run only on a documented reference environment or a controlled browser/CPU profile. Other machines report timing as diagnostic evidence.

No repository-owned reference runner is currently pinned. Therefore `bench:example:mmo-render:reference` is an explicit calibration command, not part of `check` or `release:verify`. Promote it to a release gate only after recording the runner model, operating system, Bun/browser versions, power mode, thermal policy, and CPU-throttling configuration.

Candidate comparisons run serially and repeatedly on the same machine. Prefer interleaved A/B/B/A trials and judge the median p95 across complete trials. Preserve raw samples, environment details, configuration, and workload counts.

Record CPU model, logical CPUs, runtime/browser version, power source or power
profile, thermal/throttling state when knowable, and competing workload. Run at
least idle and contended tiers for scheduler/server changes; the contended tier
should include configured concurrency representative of many agents. When power
or thermal state cannot be read reliably, label it `unrecorded` instead of assuming
maximum clocks.

Use timing matrices to find crossover ranges, not magic universal constants. Keep
forced control/candidate modes for reproducibility, use a conservative portable
baseline, and expose host calibration or named low-power/balanced/throughput
profiles when the crossover varies materially. A faster computer should be allowed
to exploit capacity without making the baseline path harder; a slower or unplugged
computer must retain bounded work and backpressure rather than merely missing an
absolute millisecond gate.

Do not use a single start/end heap delta as an allocation gate. Record allocation rate, retained heap after controlled collection, GC activity when available, and high-water marks separately.

### Durable evidence lanes

The scheduled and manually dispatched `Performance evidence` workflow separates
three concerns:

- structural tests and reports count copies, view/allocation creation, queue and
  capacity peaks, history checkpoints, retained entries, and reachable bundle
  bytes;
- Chromium, Firefox, and WebKit execute the distinct production scalar/SIMD WASM
  artifacts plus the 100/10,000-message Markdown workload; configured required
  browsers fail the lane instead of being silently recorded as unavailable; and
- Linux, Windows, and macOS produce Bun CPU profiles for the same spatial-index
  workload.

Every JSON report uses `hyperfocus-performance-evidence-v1`: portable evidence and
calibration measurements cannot share a bucket. The workflow rolls reports into a
bounded 104-entry-per-benchmark history, restores that history on the next weekly
run, and retains downloadable artifacts for 90 days. Each adjacent record stores a
compatibility decision; timing is comparable only when workload config, runtime,
CPU, power, thermal, contention, device profile, and active-agent count match and
none of the required context is `unrecorded`.

Hosted-runner timings remain calibration data because cloud hardware, power, and
contention vary; parity and dominant-work counts are the portable gates. Local
reports continue to record unknown power or thermal state as `unrecorded`, which
deliberately prevents them from becoming a timing trend.

## Pooling And Reuse

Portable 3D startup cooks repeated mesh declarations once per canonical source,
effective external-buffer mapping and skin-admission mode. Parsed containers and
cooked rigs are reused only within that runtime construction. Input bytes remain
immutable until preparation settles; cooked arrays are borrowed immutable for
the scene lifetime. Each mesh still owns its registered handle and counts against
authored vertex/index budgets. A later runtime receives fresh cooked arrays.
The retained Touch of Death resource closure has 204 mesh declarations and 125
distinct cooking operations after this change; this is work/allocation evidence,
not a claimed wall-clock improvement.

`createFrameRecordSelection` from `@hyperfocus/engine/project/runtime-3d` binds a
fixed list of entity IDs to indices in evaluated frames. Stable frames read only
those slots; a missing or moved ID builds one temporary full index for that call.
Input records must have unique IDs. A missing ID is checked again on the next
call, so persistently missing selections still require a full scan.

The selector copies its configured IDs and retains only bounded numeric slots,
never previous-frame records. Each call returns a fresh array in configured-ID
order, borrowing the current records. Mutating a selected record changes the
original frame; the selection does not freeze, clone or cull scene state. Recreate
the selector when desired membership changes. Touch of Death uses it to bound
fighter presentation searches while physics and scenery preparation retain the
whole scene.

Pooling is an allocation-control tradeoff, not an automatic CPU optimization. A pool may reduce GC pauses while increasing property-reset work and steady-state CPU time.

- Fresh allocation remains the default when it is faster and does not create harmful full-loop GC behavior.
- Promote pooling only with a full-loop win in frame p95/p99 or retained-memory stability.
- Keep caller-owned output buffers available as opt-ins when they reduce allocation pressure.
- Document aliasing and lifetime rules for every borrowed or pooled value.

## Bounded Runtime Rules

- Metrics have fixed series/cardinality limits. Long-frame records name their
  source metric: `frame.ms` measures callback work, including `beforeUpdate`,
  while `frame.gap.ms` measures elapsed time between render starts. They overlap
  and must not be summed. `before-update.ms`, `update.ms` and `render.ms` partition
  callback work. Restarting a stopped browser app resets gap tracking; a host that
  keeps running in a hidden tab can still observe a scheduling gap.
- Async clocks declare whether backlog is coalesced, dropped, or queued. Without an `onTick` callback, advancing the clock retains no callback work under any policy.
- Fixed-step drivers consume a step at the update boundary and count a completed update even when its callback interrupts the frame. Callback resets remain authoritative; the next advance cannot replay that completed step.
- Every advance executes at most 10,000 updates even after repeated interruptions.
  Reaching the ceiling reports `interrupted` and `pendingSeconds`, retains the
  backlog, and skips rendering until a later advance completes. Interrupted alpha
  can exceed one and is not a completed-frame interpolation fraction.
- Queues and caches expose depth, capacity, drops, and evictions.
- Disabled diagnostics add no recurring work beyond an optional branch. With `createBrowserApp` metrics disabled, frames perform no profiling clock reads or timing-counter updates.
- Configuration defaults are available through a resolved configuration snapshot.

## WASM ownership

`createWasmMemoryArena().lease(bytes)` reuses backing storage but creates a
distinct checked lease object. Released leases reject reads/writes; their repeated
release cannot close another lease. Active access and epoch reads refresh typed
views after growth by any owner of the same module memory. The arena itself is
the privileged storage owner; its direct access/release methods are not a scoped
loan. Keep those methods at the owner boundary.

Release ends access, not allocation: retained capacity and the module allocator's
reclamation lifetime are separate. Fixed scratch capacity prevents additional
module allocation; it does not mean acquiring checked JavaScript lease handles
is allocation-free. Consumer-level growth/parity coverage lives in
`src/wasm/resident-memory.test.ts` and executes shipped scalar/SIMD artifacts.

`createHotSwappableWasmSimulator` accepts fresh candidate instances and uses
latest-request-wins ordering. A failed candidate leaves the installed module
intact, and superseded candidates are disposed. `dispose()` is terminal: it
invalidates pending commits, disposes the live module, and rejects future loads.
A loader that settles later is cleaned up then; disposal does not wait forever
for an unresolved loader. Callers coordinate simulation stepping during an async
state migration; request ordering does not freeze the module's internal state.

## Simplicity Checks

Before promoting an API, verify:

- the minimal example remains small and uses the production-shaped path;
- ownership and cleanup are visible in the call site;
- common configuration is optional and advanced configuration is grouped;
- invalid values fail at construction with an actionable message;
- the API does not duplicate an existing lifecycle, input, or rendering model;
- a project can adopt advanced rendering, metrics, networking, or workers without replacing its basic application structure.
