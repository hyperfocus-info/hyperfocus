# Low-Level Performance Spike Audit

Audit date: 2026-08-29

This audit covers the engine, first-party examples, Engine Editor, and Harness. It
asks where WebAssembly, SIMD, data layout, spatial indexing, allocation control,
and UI windowing can improve measured work. The conclusion is deliberately
narrow: use WASM for large numeric batches, prefer algorithm and layout wins
before a language boundary, and do not treat object pooling as an automatic win.

## Executive decision

Do not add a broad "performance mode" or move browser orchestration into WASM.
The evidence supports seven small, separate contracts, now implemented:

1. A configurable numeric batch policy and distinct scalar/SIMD production WASM
   artifacts. `auto` prefers supported SIMD, forced variants remain reproducible,
   and fixed startup scratch avoids hot-path allocation; explicit growth remains
   available for variable workloads.
2. A protocol reader/codec range path that creates no backing buffer, payload copy,
   or payload view per parse. Copying remains the default when ownership escapes.
3. A fixed-capacity retained cursor for one stable, fully overwritten record type.
   This is not a general object pool and must expose borrowed lifetime explicitly.
4. A framework-neutral multi-resource capacity governor with atomic acquisition,
   bounded queues, cancellation, FIFO by default, and optional aging-bounded bypass.
5. A shared bounded/windowed transcript contract in `packages/ui`, with host-owned
   persistence. Typed prefix offsets, binary-search window selection, and measured
   heights bound mounted Markdown work without crossing into the engine.
6. Reversible editor field deltas with dirty-section serialization and configurable
   periodic full checkpoints; arbitrary transactions retain the safe snapshot path.
7. A split browser distribution whose eager root and complete reachable chunk graph
   are budgeted separately. Unreachable build-only sharing chunks are removed.

The existing render frame pool also exposes `clear`, `fresh`, and caller-verified
`overwrite` record strategies. The MMO demo defaults to the measured `fresh` path;
the safe shared default remains `clear`.

These contracts share benchmark/report conventions and the capacity governor where
resources truly overlap, but they do not collapse into one performance-mode object.
Numeric kernels, binary ownership, frame records, async permits, editor history,
and variable-height DOM rows have different lifetime and correctness rules.

## Method

The new `bun run bench:low-level-spikes` command runs serial A/B/B/A samples,
performs warmup, checks output parity, forces GC before each round, and records p50,
p95, throughput, heap size, and object count. Workloads execute serially so they do
not compete for CPU. The implemented report is written to
`.local/engine-perf/2026-08-28/low-level-spikes-implemented.json`; newer protocol,
browser-variant, editor-history, scheduler, transcript, and bundle reports live in
their owning `.local` evidence directories.

The local calibration run used Windows 11, an Intel Core i9-13900HX, 32 logical
CPUs, 64 GB RAM, repository-pinned Bun 1.4.0, two warmups, and four A/B/B/A rounds.
Power, thermal, and competing-load state were not captured, so its millisecond
values are diagnostic for that host only. The batch-256 baseline is conservative,
forced backends remain available, and browser hosts can calibrate per-operation
thresholds through the public policy. Structural work counts and scaling behavior,
not this one clock rate, own the efficiency claim.
All fixtures for a group coexist in the same process; heap counters are useful for
detecting runaway behavior but not for attributing retained memory to one candidate.
Use separate-process heap profiles before a memory-driven production decision.

The benchmark method follows the repository performance workflow and Bun's
[official benchmarking guidance](https://bun.sh/docs/project/benchmarking). Browser
promotion should also capture a Chrome Performance trace and Memory allocation
profile using the [Performance panel](https://developer.chrome.com/docs/devtools/performance)
and [Memory panel](https://developer.chrome.com/docs/devtools/memory-problems).

## Spike results

Lower p95 is better. Each collision row processes at least 262,144 overlaps per
sample with the named call batch size. The WASM path uses the shipped SIMD module
and current copied-input/copy-result bridge.

| Workload | Control p95 | Candidate p95 | Candidate delta | Decision |
| --- | ---: | ---: | ---: | --- |
| Collision batch 1: TS vs copied WASM | 27.337 ms | 189.585 ms | +593.5% | `auto` keeps small work in TS. |
| Collision batch 4: TS vs copied WASM | 9.626 ms | 45.999 ms | +377.9% | Boundary cost dominates. |
| Collision batch 16: TS vs copied WASM | 5.966 ms | 12.333 ms | +106.7% | Stay in TS. |
| Collision batch 64: TS vs copied WASM | 4.975 ms | 3.697 ms | -25.7% | Real win, but below the conservative default. |
| Collision batch 256: TS vs copied WASM | 4.811 ms | 1.209 ms | -74.9% | Default `auto` crossover. |
| Collision batch 1,024: TS vs copied WASM | 4.530 ms | 0.806 ms | -82.2% | Strong WASM win. |
| Collision batch 4,096: TS vs copied WASM | 4.505 ms | 0.727 ms | -83.9% | Strong WASM win. |
| Collision batch 16,384: TS vs copied WASM | 4.275 ms | 0.712 ms | -83.3% | Strong WASM win. |
| 100k particle transform: objects vs typed SoA | 5.117 ms | 2.241 ms | -56.2% | Prefer typed storage for dense numeric systems. |
| Typed interleaved AoS vs typed SoA | 2.772 ms | 2.615 ms | -5.7% | Variable across runs; choose by access pattern. |
| 50k AOI entities: full scan vs spatial hash | 53.170 ms | 2.654 ms | -95.0% | Algorithmic rejection comes before WASM. |
| 8k render records: fresh vs clearing pool | 4.049 ms | 15.893 ms | +292.5% | Keep safe clearing configurable, not automatic. |
| 8k render records: fresh vs overwrite pool | 3.401 ms | 3.185 ms | -6.4% | Toss-up outside the microbench; explicit option. |
| 8k render records: fresh vs retained cursor | 3.376 ms | 0.744 ms | -78.0% | Ship the bounded cursor abstraction. |

Distinct production scalar and SIMD modules now run equivalent resident
input/output arenas, isolating instruction-level gain from the JavaScript bridge
while also proving that packaging and loader selection reach the intended artifact:

| Batch | Scalar p95 | SIMD p95 | SIMD delta |
| ---: | ---: | ---: | ---: |
| 1 | 15.9 ms | 16.4 ms | +3.1% |
| 4 | 6.9 ms | 5.3 ms | -23.2% |
| 16 | 3.9 ms | 2.6 ms | -33.3% |
| 64 | 3.2 ms | 1.9 ms | -40.6% |
| 256 | 2.8 ms | 1.6 ms | -42.9% |
| 1,024 | 2.7 ms | 1.6 ms | -40.7% |
| 4,096 | 2.9 ms | 1.7 ms | -41.4% |
| 16,384 | 2.7 ms | 1.7 ms | -37.0% |

The collision result is consistent with WebAssembly's execution model: SIMD is a
fixed-width numeric facility, while JavaScript must still marshal values into the
module's linear memory. The [WebAssembly specification](https://webassembly.org/specs/)
and [V8 SIMD documentation](https://v8.dev/features/simd) support SIMD for
compute-heavy vector work; neither removes host-boundary or memory-transfer cost.
Growing WebAssembly memory can also invalidate or stale host views, so a retained
bridge must centralize growth and refresh views rather than publish raw long-lived
views. See the [WebAssembly JavaScript memory guide](https://webassembly.org/getting-started/js-api/).

The batch-one result shows that SIMD is not free. From batch four onward the
separate-artifact comparison attributes a 23% to 43% p95 win to SIMD with resident
inputs on this run. The copied-bridge matrix still owns end-to-end dispatch.

The 2026-08-29 Chromium 151 browser run repeated the resident-input result without
using it as a universal clock threshold. Batch one contained no four-lane group
and scalar was slightly faster; batches four and larger packed every element into
four-lane groups and SIMD was faster in that browser. Each timed call transferred
zero host-boundary bytes and both variants touched the same 29 logical bytes per
element. Firefox and WebKit were recorded as unavailable on this workstation. The
scheduled evidence workflow installs all three engines and sets them as required,
so an unavailable row fails that lane instead of becoming an implied pass.

## Engine audit

### Already on the right path

- Collision has scalar and SIMD AssemblyScript batch kernels, a parity-tested
  TypeScript fallback, preallocated scratch support, typed batch contracts, and
  one normalized dispatch policy outside the hot loop.
- Physics, particles, shared schemas, binary protocols, and several 3D paths
  already use typed arrays or columnar storage. Rewriting them into WASM without a
  profile would add build and bridge complexity before finding a bottleneck.
- Dynamic AOI uses a packed-key spatial hash with caller-reused outputs, and static
  geometry has Flatbush/BSP-style acceleration. The 95.0% AOI spike confirms this
  architectural direction.
- Shared arenas and binary protocols already make ownership and capacity explicit.
  They are prerequisites for worker or WASM kernels, but the current shared arena
  is not automatically the collision module's linear memory; joining them without
  a designed ownership boundary would preserve a copy or introduce view hazards.
- Render culling, sort output reuse, tile chunk reuse, and draw-data caches already
  have targeted benchmarks. Existing local results showed useful cull/stage/tile
  wins, while the generic render frame pool was slower than allocation.

### Highest-value engine spikes

1. Review the scheduled Chromium/Firefox/WebKit collision matrix and CPU profiles;
   copied TypeScript/WASM/auto browser thresholds still need per-host calibration.
2. Integrate a module-memory lease only for a consumer that can keep inputs
   resident. The arena now owns capacity, epoch, view refresh, exclusivity, and
   release; wrapping JS-owned arrays in a lease does not erase their copies.
3. Keep projectile spatial selection configurable. The density matrix showed that
   rebuilding a grid loses for one or sixteen queries on this host but wins strongly
   at 256; structural work likewise crosses from more work at one query to 0.6% of
   full-scan dominant work at 10k targets/256 queries.
4. Compare in-place JS, WASM SIMD, Canvas primitives, and GPU paths for full-frame
   post-processing. Include `ImageData`/upload time; a fast pixel kernel can still
   lose the end-to-end frame.
5. Extend the zero-view protocol range path to production codecs only when their
   synchronous borrowed lifetime can be proven. The structural gate is already
   zero backing allocations, copied bytes, and payload view objects per parse;
   separate-process heap evidence remains a diagnostic follow-up.

### Engine no-go list

- Do not move RAF, Canvas draw submission, Web Audio graph ownership, sockets,
  asset loading, DOM/UI, or async browser resource orchestration into WASM.
- Do not introduce WASM AOI while entity positions are object-owned and would need
  repacking every tick.
- Do not turn scalar collision calls into WASM calls. Batch first.
- Do not add a generic pool to code that allocates short-lived monomorphic objects
  unless an end-to-end trace proves GC pressure is material and the pool wins.
- Do not assume SoA always beats interleaved typed data. The typed-layout result
  moved across the clean-win threshold between runs and remains workload-specific.

## Example-consumer audit

### MMO skill demo

The 600-frame A/B/B/A render-call matrix held a median 793 drawn calls and identical
Canvas-operation counts. Fresh records improved median p95 from 7.125 ms to
6.731 ms (5.5%), p50 from 5.132 ms to 4.636 ms (9.7%), and process heap delta from
9.17 MB to 8.11 MB (11.6%). The demo therefore defaults to `fresh`; `clear` and
caller-verified `overwrite` remain explicit benchmark/configuration choices.

Server-side, prioritize interest-grid rejection, dirty masks, byte budgets, and
borrowed protocol buffers. A WASM server tick becomes credible only after a CPU
profile identifies one dense deterministic numeric kernel and its source data is
already typed.

### Three Arena

Three Arena already stores dense particles as fixed-capacity Float32 columns and
uses typed motion scratch. That matches the 56.2% object-to-typed result. Keep this
locality model and profile projectile/contact loops at stress scale before adding
WASM. GPU instancing, visibility, LOD/HLOD, shader count, and asset churn remain
more direct end-to-end 3D levers than a general CPU WASM layer.

### Motion Lab and smaller examples

Motion Lab's 15-character acceptance workload already has a 2 ms p95 gate. Its
matrix/vector scratch should remain allocation-aware, but it is not a WASM priority
until a larger crowd fixture misses the budget. Small Canvas and starter examples
should preserve the easy TypeScript baseline; requiring a WASM asset would harm
portability for unmeasured gain.

## Engine Editor audit

The Profile view previously labeled 100,000 scalar JS-to-kernel calls as a "WASM
SIMD" comparison. That mostly measured call-boundary overhead and did not exercise
the SIMD batch export. It now runs parity-checked typed batches, warms both backends,
uses A/B/B/A ordering, and reports p95 plus batch and operation counts.

Editor patch commands now mutate one owned project through reversible deltas,
stringify only dirty top-level sections on demand, and take a configurable full
checkpoint every 32 delta edits. A 250-entity smoke run preserved output parity and
reported the delta p95 as 70% below the clone control, but that wall time is local
diagnostic evidence; zero full serialization per edit and the explicit 1/32 clone
cadence are the durable claims.

Next Editor measurements should continue targeting real authoring workloads:

- complex arbitrary transactions, where `structuredClone` remains intentional;
- scene/tree/asset list updates at large counts;
- preview frame staging with the generic render pool versus a domain cursor; and
- the shared AI transcript's host-level append and persistence path now that shared
  Markdown rendering is bounded.

The 100-entry frame timing array's `shift()` is not a meaningful target. It is
bounded and tiny; replacing it before profiling would optimize noise.

## Harness audit

Harness is mostly I/O, SQLite, process orchestration, network framing, immutable
application state, Markdown, and DOM. WASM is a poor default for these paths. The
current websocket benchmark gives a useful counterexample: at 20,000 events and
batch size 32, batched loopback delivery improved from 359k to 469k events/s and
reduced backpressured sends from 7,105 to 218, while serialized bytes grew slightly.
The win came from fewer frames and less backpressure, not SIMD or compression.

CR-081 is closed by shared `ChatTranscript` windowing. A production-compiled
Playwright workload compared 201 final messages with 10,101 at desktop and narrow
widths. All three cases mounted 11 rows and at most 112 descendant nodes, stayed within
8 px of the end after five append batches, rendered GFM/code/table content, and
updated a pending Markdown row without replacing it, while every mounted row kept a
unique message owner after retained-window shifts. Harness history pages only on
request and bounds active UI state at 1,024 messages; hosts still own durable
persistence, actions, and message-domain models.

Harness backend follow-ups should profile immutable reducer churn with large real
fixtures and document extraction in separate processes. Use bounded indexes,
incremental state, worker isolation, or native/WASM libraries only where the profile
shows sustained CPU work. Do not pool UI model objects whose identity participates
in Solid reactivity.

## Implemented configurable contracts

### 1. Numeric batch policy

Normalize one plain options object outside the hot loop:

```ts
type NumericBatchPolicy = {
  backend?: "auto" | "typescript" | "wasm";
  minimumWasmBatchSize?: number;
  minimumWasmBatchSizeByOperation?: Record<string, number>;
};
```

The leaf call remains positional/typed and allocation-free. `auto` dispatches small
batches to the TypeScript implementation and large batches to a preloaded WASM
backend. A caller can force either backend for reproducibility and benchmarking.
The default threshold is 256 from the pinned Bun matrix; hosts can calibrate it.
Collision scratch capacity remains a separate kernel option. Loading failure still
falls back to TypeScript.

### 2. Fixed-capacity retained cursor

`createRetainedCursor({ capacity, create })` allocates exactly once, resets a numeric
cursor per frame, and returns stable records that the caller must fully overwrite.
Overflow throws by default or follows explicit bounded growth. It exposes a
borrowed `{ items, count }` view without maps, cloning, dynamic key deletion, or
ownership bookkeeping. Do not use it for heterogeneous optional-field records
until each kind has a stable reset/overwrite contract.

### 3. Windowed transcript

`ChatTranscript` keeps the abstraction presentation-focused and framework-specific;
it does not cross into `packages/engine`. The default path accepts messages only,
with configurable retained count, estimated height, overscan, and stick-to-end
behavior. `hasPrevious` and `onRequestPrevious` connect host-owned pagination while
persistence remains outside the component.

### 4. Multi-resource capacity governor

`createCapacityGovernor({ capacities, queueLimit, scheduling })` acquires all named
resources atomically. Strict FIFO is the simple default; work-conserving bypass is
explicit and becomes non-bypassable after its aging bound. Leases release exactly
once, cancellation removes queued nodes in constant time, and snapshots expose
active, peak, queued, rejected, cancelled, and bypass counts. Harness defaults are
host-configurable and structural suites exercise 100 agents and 1,000 mixed tasks
without exceeding provider, subagent, BranchFS, browser, or document caps.

### 5. Editor delta history and section serialization

Patch commands retain one owned project object, store inverse values, and mark the
affected top-level sections. Stable JSON is composed lazily and only dirty sections
are stringified. A full checkpoint every 32 delta edits bounds the inverse chain;
`deltaCheckpointInterval: 0` selects inverse-only history. Complex arbitrary
transactions keep full validation, clone, and snapshot semantics.

### 6. Protocol ownership and WASM scratch

Reusable binary readers reset over a byte range without constructing a subarray or
new `DataView` when the backing buffer is stable. Codecs can implement
`decodeRange(bytes, offset, length)` for zero-view synchronous reads. The collision
kernel separately reserves fixed scratch once at startup, fails clearly on overflow,
or uses explicit growth when the host chooses adaptability over hot-path allocation.

### 7. Split browser distribution

The browser root is 90,929 raw bytes instead of the prior roughly 150 KB eager
bundle. Six reachable shared chunks bring the full graph to 152,411 bytes; both
numbers, compressed sizes, focused consumer bundles, and the 1.6 MB package
aggregate have independent ceilings. Build-only chunks are pruned before publish.

## Promotion gates

A performance candidate can ship when all of these are true:

- parity and determinism tests pass;
- dominant work has an explicit complexity, copy-byte, allocation, queue, cache,
  DOM, GPU, or operation-count explanation and improves or stays within a bound;
- repeated serial timing does not materially regress on the tested profiles, with
  absolute time used as a gate only on a documented controlled reference runner;
- the representative end-to-end consumer also improves;
- allocation/retention and bundle/WASM bytes stay within explicit ceilings;
- fallback and forced-backend modes remain testable;
- borrowed data has documented ownership, lifetime, capacity, and growth behavior;
- browser features retain a no-WASM TypeScript baseline; and
- the result is reproduced on the pinned Bun release and target browsers.

Related: [developer performance workflow](developer-performance.md),
[performance hypotheses](engine-performance-hypothesises.md),
[performance abstraction plan](performance-abstraction-plan.md), and
[optimization history](engine-performance-optimizations.md).
