# Adversarial boundary testing

This guide owns reusable testing principles for editor, engine, application,
storage, and transport boundaries. Product findings belong in the owning audit;
the first application is the [editor and engine audit](../packages/engine/docs/editor-engine-adversarial-audit.md).
Performance measurement remains owned by the
[engine performance workflow](../packages/engine/docs/developer-performance.md).

## What must survive a boundary

Test the externally observable result when an inner stage reports skipped work,
unsupported input, cancellation, stale identity, or exhausted capacity. An inner
diagnostic is insufficient if the caller still reports a successful operation.
Shared imports and source-string assertions establish wiring, not execution or
visual parity. Trace the result through preview, Play, persistence, and delivery.

Every finding needs the accepted input, operation sequence, expected invariant,
actual result, owning code, evidence level, and a regression acceptance condition.
Separate reproduced defects, source-established defects, missing evidence, and
performance hypotheses. Passing existing tests cannot resolve an uncovered case.
Do not label an unexecuted browser or process-crash scenario verified.

## Invariants by boundary

| Boundary | Required adversarial checks |
| --- | --- |
| Scheduling | Huge, negative, nonfinite and repeated timestamps; hidden/resumed lifecycle; callback interruption and reentrancy. Bound actual updates per advance independently of incoming delta. Define backlog retention/drop and report it. |
| Capacity and identity | Zero when supported, one, exactly full, one over, reject then retry, free then reuse, double free and stale access. A failed operation leaves occupancy, free list, IDs and diagnostics consistent. Public long-lived identities need generation checks or equivalent invalidation. |
| Numeric storage | Validate the destination representation and intermediate arithmetic, not just finite input. Exercise Float32 overflow/underflow, huge coordinate subtraction, zero divisors, degenerate contact normals and quaternion drift. |
| History | Compare exact canonical project JSON against an independent snapshot oracle across deltas, checkpoints, replacements, scene changes, asset removal and macros. Verify redo clears on a committed branch, rejected edits preserve both stacks, and immutable snapshots are not mutated through aliases. |
| Asynchronous mutation | Guard after awaits or retain one owner across the operation. Exercise a pending import/save against project replacement, undo, disposal and competing commands. Scope revision/hash preconditions to the state actually committed. |
| Persistence | Reject missing migrations and bad checksums; normalize or reject unsupported numeric values consistently. Exercise quota, disabled storage, compare-and-swap conflicts and interrupted writes. Canonical files and disposable recovery caches need separate assertions. |
| Networking | Loss, duplicate delivery, reorder, sequence wrap, stale input, clock skew, evicted delta bases, reconnect and interest churn. Never emit half an entity when a byte budget is exhausted. Test diagnostic propagation and eventual resynchronization. |
| Rendering and export | Context loss before first draw and mid-delivery, restore/reupload, hardware limits, zero draws, NPOT texture/filter combinations, codec dimensions, queue pressure, last-frame/finalization cancellation and resource cleanup. Verify actual draws/encoded samples, not only capability names. |
| Performance | Count scans, allocations, copied bytes, serialized sections, sorts, draws, queue depth and retained resources. Measure complete frame/interaction tails under representative GC/load separately. Pooling and WASM need end-to-end comparisons including conversion costs. |

## Correct the oracle before generating inputs

- Presence is independent of stored value. Replay from `0`, `false`, empty text,
  `null` and `undefined`; separately exercise missing and evicted history entries.
- Interleave owners of shared memory: allocate A, grow through B, then read and
  write A. Release A, acquire another lease, then try A's old methods and release.
  Include the production module artifact as well as a synthetic memory fixture.
- Defer both loading and restoration when testing replacement. Race each against
  disposal and a newer request; assert final identity/state and cleanup counts.
- Repeated interrupted advances must respect the per-call execution bound while
  reporting the backlog that remains. Exercise the accumulated sequence, not only
  the largest permitted single delta.

- Interpolation alpha is normally `accumulator / fixedStep`. It can advance when
  zero simulation steps run. Do not freeze it merely because the update count is
  zero; never divide by that count. Define interrupted-backlog alpha separately.
- An unbounded physics world has no universal world-bounds invariant. Bound the
  test fixture with actual colliders when containment is required. Energy checks
  must account for gravity, motors, impulses, restitution, rotational energy and
  solver tolerance. Use controlled unforced fixtures for conservation tests.
- Convergence after network faults requires a specified quiet period with reliable
  delivery, repeated authoritative snapshots or a repair request. Permanent loss
  cannot imply convergence. Define discrete equality and numeric tolerances.
- JSON serializes nonfinite numbers as `null` and negative zero as zero. Reject
  nonfinite authored data before history/save; deliberate negative-zero
  normalization is valid. Different validation at recovery and canonical save is
  a boundary defect, not nondeterministic JSON itself.
- Use codec/backend capability checks for dimensions and skin palettes. A common
  device or codec limit is not a universal constant. The renderer must budget its
  actual active uniforms; a fake compiler does not prove hardware acceptance.
- Index-derived timestamps avoid cumulative summation drift. Use the encoder's
  required time unit and rounding; calculate each timestamp from the frame index,
  and verify final audio/video duration with the actual muxer and decoder.
- A thrown phase-hook exception is not a killed process. Process termination is
  also not a power-cut durability proof. Name the exact failure model tested.

## Five reusable adversarial harnesses

Each harness records seed, generator version, workload/configuration, failing
operation prefix and expected/actual state. Bias generation toward boundaries;
uniform random inputs rarely hit capacity, sequence wrap or exact contact.
Use injected clocks and deferred promises instead of sleeps. Minimize a failing
trace into a normal regression. Assertions test the desired contract; observation
probes that assert a current defect are explicitly separate from correctness gates.

| Harness | Model and termination | Acceptance |
| --- | --- | --- |
| Edit/history | Snapshot oracle; random valid edits, invalid guarded prefixes, undo/redo, scene/component/asset changes and atomic macros; exceed checkpoint interval, stay within the declared history retention limit. | Exact project JSON after every navigation and full undo/redo sweep; one entry per macro; rejected operations preserve revision/history; restored assets remain readable. A separate async fixture covers Play/cache/host lifecycle. |
| Physics | Seeded mixed fixtures plus a controlled unforced conservation fixture; 10,000 fixed steps, bounded work per step; include create/remove/reuse and competing transform writers. | Finite stored/derived state, normalized rotations, declared collision/containment tolerances, appropriate energy accounting and explicit winner/diagnostic for transform ownership. |
| Network | Reference authoritative state; deterministic trace of loss/reorder/duplication, u32 wrap, reconnect/base eviction, interest churn and byte saturation; finish with reliable repair traffic. | Exactly-once action acceptance within protocol policy; atomic packets; explicit stale/base rejection; convergence within a documented repair/work bound. |
| Save/kill/load | Fresh temporary project per seed; owned child signals phases, parent terminates child at each boundary, then a fresh reader loads or recovers; browser transaction tests are separate. | Valid prior/new canonical pair or explicit rejection; never success for a mixed/corrupt pair; bounded cleanup and conflict retries. Include archive/JSON phases and actual Windows replacement behavior. |
| Capacity | Model live identities/free slots; randomized fills, invalid registrations, removals and stale mutations at capacities 0/1/exact limit. | Every overflow/rejection visible; failed operations consume no capacity; stale IDs cannot touch replacements; no silent query truncation or out-of-range writes. |

Run subprocess/browser harnesses through the owned hidden-process and headless
automation APIs described in [development](development.md#process-and-browser-lifecycle).
Select only harnesses relevant to a change. Ordinary correctness gates use work
counts; timing gates require a documented reference environment. Keep raw timing,
GC and crash artifacts outside tracked documentation, with durable reproduction
commands and conclusions in the owning audit.
