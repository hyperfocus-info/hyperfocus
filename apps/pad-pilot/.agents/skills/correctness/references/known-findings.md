# Known Findings

## 2026-04-15 - Audio-thread routing read shared strings

- Symptom: `processBlock` routed recut playback by comparing `selectedModuleId_` and playback-owner strings mutated off audio thread.
- Root cause: RT path read shared `std::string` state guarded nowhere; cross-thread mutation made behavior undefined.
- Fix pattern: Mirror selected module + recut owner into atomics with enum + stable key; audio thread reads atomics only; add source-contract test banning strings/locks in `processBlock`.
- Regression test added: `apps/pad-pilot/plugin/runtime/bridge-native-contract.test.ts` processBlock RT contract.
- Relevant files: `apps/pad-pilot/plugin/core/pad-pilot-processor.h`, `apps/pad-pilot/plugin/core/pad-pilot-processor.cpp`, `apps/pad-pilot/plugin/runtime/bridge-native-contract.test.ts`

## 2026-04-15 - Stale host subpayload dropped fresh state

- Symptom: stale controller-config echo caused provider to return from whole host-sync callback, skipping fresh module/input/editor state in same frame.
- Root cause: frame reconciliation coupled unrelated state application behind one stale-echo guard.
- Fix pattern: split host-sync into independent apply steps; stale subpayload suppresses only its own state domain.
- Regression test added: `apps/pad-pilot/ui/src/padpilot/provider.test.tsx` stale echo + matching echo cases.
- Relevant files: `apps/pad-pilot/ui/src/padpilot/provider.tsx`, `apps/pad-pilot/ui/src/padpilot/provider.test.tsx`

## 2026-04-15 - Import-time side effects broke tests

- Symptom: app tests threw unhandled `WebSocket` errors before render because module import opened devtools socket by default.
- Root cause: websocket setup and debug logging ran at import time; devtools defaulted on when env unset.
- Fix pattern: move side effects into lifecycle component, gate behind explicit opt-in env flag, clean up timers/sockets on unmount.
- Regression test added: app test suite exercises mounted app without devtools socket side effects.
- Relevant files: `apps/pad-pilot/ui/src/app.tsx`, `apps/pad-pilot/ui/src/runtime-flags.ts`, `apps/pad-pilot/ui/src/app.test.tsx`, `apps/pad-pilot/ui/src/app.acceptance.test.tsx`

## 2026-04-15 - Bridge batching replayed hot traffic

- Symptom: repeated parameter and automation update intents all flushed, flooding bridge during knob moves.
- Root cause: queue keyed by full serialized payload instead of semantic intent key; no dedicated hot-intent coalescing.
- Fix pattern: coalesce idempotent intents by semantic key, latest wins, flush coalesced updates before boundary events like touch end/stream close.
- Regression test added: `apps/pad-pilot/ui/src/bridge.test.ts` coalescing + ordering cases.
- Relevant files: `apps/pad-pilot/ui/src/bridge.ts`, `apps/pad-pilot/ui/src/bridge.test.ts`

## 2026-04-15 - Auxiliary native targets leaked warnings already isolated on shipping target

- Symptom: Auxiliary native targets leaked warnings already isolated on shipping target
- Root cause: CMake warning suppression and external-include isolation were applied to PadPilot plugin target but not padpilot-native-tests
- Fix pattern: Mirror warning-suppression and SYSTEM include rules across auxiliary native targets so contracts/tests see same warning envelope as shipping build
- Regression test added: bun.cmd run test:plugin-native and bun.cmd run build:plugin
- Relevant files: apps/pad-pilot/plugin/CMakeLists.txt

## 2026-08-02 - Host state arriving during a UI interaction vanished after unlock.

- Symptom: Host state arriving during a UI interaction vanished after unlock.
- Root cause: Provider dropped authoritative payloads while interaction count was nonzero and kept no pending snapshot.
- Fix pattern: Queue latest payload per canonical module; replay on final unlock; compare revisions; treat full host sync as authoritative epoch.
- Regression test added: Provider lock queues latest state, replays on unlock, rejects later stale delta.
- Relevant files: apps/pad-pilot/ui/src/padpilot/provider.tsx, apps/pad-pilot/ui/src/padpilot/provider.test.tsx

## 2026-08-02 - Lost JUCE native completions leaked pending promises forever.

- Symptom: Lost JUCE native completions leaked pending promises forever.
- Root cause: Native listener registry had no deadline, rejection path, or timer cleanup.
- Fix pattern: Give every native call a bounded timeout; remove listener before resolve/reject; clear timer; catch fire-and-forget bridge calls.
- Regression test added: Native picker with no completion rejects on timeout and leaves bridge reset clean.
- Relevant files: apps/pad-pilot/ui/src/bridge.ts, apps/pad-pilot/ui/src/bridge.test.ts

## 2026-08-02 - Closing editor during async chooser or queued load could dereference destroyed editor.

- Symptom: Closing editor during async chooser or queued load could dereference destroyed editor.
- Root cause: MessageManager and FileChooser callbacks captured raw this.
- Fix pattern: Capture Component::SafePointer, guard shutdown, cancel owned choosers before teardown; parse external revisions with from_chars.
- Regression test added: Shipping plugin build plus source contract bans raw async captures and stoull revision parsing.
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-editor.cpp, apps/pad-pilot/plugin/core/pad-pilot-editor.h, apps/pad-pilot/plugin/runtime/bridge-native-contract.test.ts

## 2026-08-02 - Concurrent producers could overwrite or lose realtime queue entries.

- Symptom: Concurrent producers could overwrite or lose realtime queue entries.
- Root cause: The shared queue implemented SPSC head/tail semantics but processor paths had multiple producers and consumers.
- Fix pattern: Use a bounded per-cell sequence-number MPMC queue with CAS ownership; drain only after producers stop; exercise real concurrent uniqueness.
- Regression test added: padpilot-native-tests 4-producer/2-consumer uniqueness plus realtime-correctness-contract.test.ts
- Relevant files: apps/pad-pilot/plugin/runtime/lock-free-queue.h, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-02 - Queued realtime commands from state A mutated replacement state B.

- Symptom: Queued realtime commands from state A mutated replacement state B.
- Root cause: Full graph replacement and incremental command queues had no shared state-generation identity.
- Fix pattern: Stamp every producer event and command with a graph epoch; bump only after quiesced replacement; reject stale entries and request canonical resync.
- Regression test added: realtime-correctness-contract.test.ts graph replacement epoch contract
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-processor.cpp, apps/pad-pilot/plugin/runtime/runtime-types.h, apps/pad-pilot/plugin/runtime/input-thread.cpp, apps/pad-pilot/plugin/runtime/script-host.cpp, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-02 - A coalesced script wake could be lost forever, and haptics stalled while SDL was idle.

- Symptom: A coalesced script wake could be lost forever, and haptics stalled while SDL was idle.
- Root cause: The semaphore token and pending flag were cleared in separate operations, while the SDL timeout branch skipped queue draining.
- Fix pattern: Coalesce with one atomic wait/exchange state so notification and consumption cannot diverge; drain auxiliary queues on timeout as well as event paths.
- Regression test added: padpilot-native-tests wake test plus realtime-correctness-contract.test.ts wake and idle-haptic contract
- Relevant files: apps/pad-pilot/plugin/runtime/wake-signal.h, apps/pad-pilot/plugin/runtime/input-thread.cpp, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-03 - Mutable persistence roots could redirect writes and recursive cleanup through reparse points

- Symptom: Mutable persistence roots could redirect writes and recursive cleanup through reparse points
- Root cause: Stores treated any existing root as trusted and used lexical containment without revalidating symlink or junction ancestors
- Fix pattern: Centralize no-reparse containment guards; fail construction closed; recheck before reads writes moves extraction replacement and bounded deletion
- Regression test added: Native ModuleStore PresetStore and ManagedFileStore linked-root regressions
- Relevant files: apps/pad-pilot/plugin/runtime/storage-path-safety.cpp, apps/pad-pilot/plugin/runtime/module-store.cpp, apps/pad-pilot/plugin/runtime/preset-store.cpp, apps/pad-pilot/plugin/runtime/managed-file-store.cpp

## 2026-08-03 - Internal parameter sync could drop unrelated concurrent host automation callbacks

- Symptom: Internal parameter sync could drop unrelated concurrent host automation callbacks
- Root cause: One process-wide atomic suppression flag hid callbacks on every thread while a silent parameter set was in progress
- Fix pattern: Scope suppression with thread_local processor identity and reject non-finite host values before dirtying canonical state
- Regression test added: realtime-correctness-contract.test.ts callback-scope and finite-ingress contract
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-processor-automation.cpp, apps/pad-pilot/plugin/core/pad-pilot-processor.h, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-02 - Graph epoch rollover could publish duplicate generations

- Symptom: Concurrent lifecycle changes near integer rollover could stamp unrelated graph states with the same epoch or publish the reserved zero epoch.
- Root cause: A fetch-add plus corrective store made rollover a multi-writer race.
- Fix pattern: Advance generations with one compare-exchange loop; reserve zero permanently; test uniqueness with concurrent rollover callers.
- Regression test added: Native concurrent rollover test plus source contract for centralized epoch advancement.
- Relevant files: apps/pad-pilot/plugin/runtime/runtime-types.h, apps/pad-pilot/plugin/core/pad-pilot-processor.cpp, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-02 - Plugin metadata advertised data paths that did not exist

- Symptom: Hosts could route mono buses or MIDI to a plugin whose processing path required stereo audio and ignored MIDI buffers.
- Root cause: JUCE bus and MIDI capability declarations drifted from the actual processBlock contract.
- Fix pattern: Treat host metadata as executable API; declare only supported layouts and data directions; protect declarations with source contracts.
- Regression test added: realtime-correctness-contract.test.ts host bus and MIDI declaration contract.
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-processor.cpp, apps/pad-pilot/plugin/CMakeLists.txt, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-02 - Stateful output actions survived ownership teardown

- Symptom: A Module reset, replacement, permission revocation, or shutdown could leave synthetic keys or automation gestures held indefinitely.
- Root cause: Begin/down actions had no owner-scoped ledger and teardown compensation path.
- Fix pattern: Track every externally visible held action by owner; make begin/end idempotent; release all outstanding actions before any owner lifecycle boundary.
- Regression test added: Native ScriptHost held-key lifecycle tests and processor automation gesture lifecycle contracts.
- Relevant files: apps/pad-pilot/plugin/runtime/script-host.cpp, apps/pad-pilot/plugin/runtime/script-host.h, apps/pad-pilot/plugin/core/pad-pilot-processor-automation.cpp, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp

## 2026-08-02 - Window-level control gestures outlived their UI owners

- Symptom: Pointer release after unmount could commit stale values, leak listeners, or leave an interaction lock active.
- Root cause: Gesture cleanup existed only in the normal pointer-up path and was recreated as local closure state.
- Fix pattern: Keep one idempotent cleanup function per mounted control; invoke it before a new gesture and during unmount; route keyboard commits through the same boundary semantics.
- Regression test added: Slider, knob, and Recut waveform unmount-during-drag tests.
- Relevant files: apps/pad-pilot/ui/src/components/elements/slider.tsx, apps/pad-pilot/ui/src/components/elements/knob.tsx, apps/pad-pilot/ui/src/modules/recut/components/waveform-display.tsx

## 2026-08-02 - Aggregate bridge payload limits were bypassable by nested fields

- Symptom: Individually valid nested protobuf or JSON fields could combine into an oversized host-state frame and exhaust memory or message time.
- Root cause: Validation checked selected leaf sizes after decoding but did not bound total bytes, nesting depth, or repeated-field counts before allocation.
- Fix pattern: Reject oversized frames before parsing; preflight protobuf wire structure and bounded JSON depth/counts; keep serializer output under the same aggregate budget.
- Regression test added: Native malformed/oversized bridge and plugin-state contracts.
- Relevant files: apps/pad-pilot/plugin/runtime/plugin-state-wire.cpp, apps/pad-pilot/plugin/runtime/bounded-json.h, apps/pad-pilot/plugin/runtime/bridge-native-contract.test.ts, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp

## 2026-08-02 - Dependency lock remained vulnerable after direct packages were current

- Symptom: Package audit reported critical and high vulnerabilities through transitive tooling and UI dependencies despite current direct version ranges.
- Root cause: The lockfile retained vulnerable transitive resolutions with no enforced minimum override.
- Fix pattern: Audit the resolved lock, upgrade direct dependencies, pin narrowly scoped patched transitive overrides, reinstall, and require a zero-finding audit gate.
- Regression test added: bun.cmd audit final release gate.
- Relevant files: package.json, bun.lock

## 2026-08-02 - Dynamic host tail metadata could become stale or understate serial effects

- Symptom: Hosts could cache a zero or short tail before a long delay chain was loaded, then truncate offline render or playback cleanup.
- Root cause: VST3 exposes a maximum-tail query but JUCE has no tail-change invalidation; the estimator also treated chains as parallel-only and misread delay seconds.
- Fix pattern: Advertise one stable supported-topology upper bound from construction; estimate validation tails by summing serial nodes and taking the maximum parallel chain.
- Regression test added: Native eight-node maximum synced-delay tail and serial/parallel estimator tests.
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-processor.cpp, apps/pad-pilot/plugin/audio/convolver-module-graph.cpp, apps/pad-pilot/plugin/runtime/fx-graph-native-tests.cpp

## 2026-08-02 - Serialized controls and telemetry claimed DSP that native never implemented

- Symptom: Users could adjust named FX parameters and read named meters while audio was unchanged or processed by a different effect.
- Root cause: Protobuf compatibility fields, UI registry definitions, and native parameter support evolved independently.
- Fix pattern: Pin a native-supported control allowlist; exclude or force-bypass whole effects whose names are false; preserve old wire fields only for decode compatibility; test every shipped preset against the allowlist.
- Regression test added: FX node registry/native-control contract, compatibility bypass, preset, and native unsupported-ID tests.
- Relevant files: apps/pad-pilot/ui/src/modules/fx/node-registry/native-control-contract.ts, apps/pad-pilot/ui/src/modules/fx/fx-node-registry.test.ts, apps/pad-pilot/plugin/audio/convolver-module-graph.cpp

## 2026-08-02 - Pre-hydration edits were overwritten by the first host snapshot

- Symptom: A fast UI edit made just after mount appeared briefly, then vanished when initial host state arrived; mount-time fallback effects could also overwrite persisted state.
- Root cause: Generic Module updates immediately marked fallback-derived state dirty without distinguishing pre-hydration optimistic edits from authoritative host data.
- Fix pattern: Queue pre-hydration patches, reflect them optimistically, merge them onto the first authoritative snapshot, then emit once; make controlled feature state reconcile later host changes without echoing equal values.
- Regression test added: Provider pre-hydration merge plus Generator post-mount dashboard reconciliation and session-state persistence tests.
- Relevant files: apps/pad-pilot/ui/src/padpilot/provider.tsx, apps/pad-pilot/ui/src/modules/generator/index.tsx, apps/pad-pilot/ui/src/modules/generator/components/generator-dashboard.tsx

## 2026-08-02 - Byte-bounded response readers remained vulnerable to tiny-chunk floods

- Symptom: A response under the byte cap could allocate millions of chunk objects and retain a reader lock after failure.
- Root cause: The client accumulated an unbounded array of transport chunks and treated malformed successful JSON as a typed value.
- Fix pattern: Bound both bytes and chunk count, grow one bounded buffer, cancel and release the reader in finally, and reject malformed or empty success payloads.
- Regression test added: Marketplace fragmented-stream, malformed-success, oversize, cancellation, and reader-release tests.
- Relevant files: apps/pad-pilot/ui/src/apps/pad-pilot-marketplace/api.ts, apps/pad-pilot/ui/src/apps/pad-pilot-marketplace/api.test.ts

## 2026-08-03 - Async UI fixtures accepted mixed-source capability state

- Symptom: Recut tests intermittently saw pad assignments, busy state, or markers from different phases of a sample replacement.
- Root cause: The import helper returned after a new source label and any cached waveform appeared, before canonical state and the capability frame both identified a loaded, fully analyzed source.
- Fix pattern: Await the semantic completion boundary: requested source identity, canonical and frame loaded flags, complete analysis progress, and nonempty markers/waveform data.
- Regression test added: Recut pad mapping, empty-pad playback, pending-analysis overlay, and marker-drag lifecycle cases now share the settled-source boundary.
- Relevant files: apps/pad-pilot/ui/src/modules/recut/recut-module.test.tsx

## 2026-08-02 - Runtime barrel imports made registry initialization order-dependent

- Symptom: An FX registry test passed in the combined suite but failed alone with a temporal-dead-zone error; the combined UI runner could also remain alive indefinitely after completing work.
- Root cause: Registry definitions imported renderers, renderers imported the full PadPilot runtime barrel, and that barrel re-entered FX chain state before the registry constant initialized; sharing one Bun process also let leaked global resources cross file boundaries.
- Fix pattern: Keep low-level registry/rendering code on leaf element imports, never the capability runtime barrel; execute UI test files in isolated processes with explicit timeouts so order dependence and leaked handles fail locally.
- Regression test added: The UI gate now runs all discovered colocated test files independently, including the registry-first import order.
- Relevant files: apps/pad-pilot/ui/src/modules/fx/node-registry/renderers.tsx, apps/pad-pilot/ui/src/modules/fx/components/fx-select-field.tsx, apps/pad-pilot/scripts/test-ui.ts, package.json

## 2026-08-02 - Management-provider process checks violated bounded tooling deadlines

- Symptom: A PID identity check or timed-out evaluator could block for many seconds inside WMI or taskkill, overrun its caller deadline, and leak test work into the next case.
- Root cause: Safety-critical process cleanup delegated to unbounded synchronous system utilities; filtered WMI queries still depended on a globally unhealthy management provider.
- Fix pattern: Inspect PID, image, command line, and creation time through bounded native process APIs; validate the response; cap external tree termination and fall back to direct termination when its deadline expires.
- Regression test added: Windows identity, mismatch refusal, matching tree termination, and non-returning evaluator tests run under explicit deadlines.
- Relevant files: apps/pad-pilot/scripts/kill-padpilot-processes.ts, apps/pad-pilot/scripts/kill-padpilot-processes.test.ts, apps/pad-pilot/scripts/synaesthetic-evaluator/behavior-synthesizer.ts

## 2026-08-22 - WebView Module could pass arbitrary absolute or relative filesystem paths to native managed-media import

- Symptom: WebView Module could pass arbitrary absolute or relative filesystem paths to native managed-media import
- Root cause: padpilotImportFilePath trusted caller-provided path strings with no proof they came from a user-approved native picker
- Fix pattern: Canonicalize native picker selections into short-lived editor-owned authorizations; require absolute regular non-symlink files; consume authorization once before importing
- Regression test added: bridge-native-contract.test.ts WebView path authorization contract
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-editor.cpp, apps/pad-pilot/plugin/core/pad-pilot-editor.h, apps/pad-pilot/plugin/runtime/bridge-native-contract.test.ts

## 2026-08-23 - Stale lock recovery or unconditional unlock can delete a successor process lock

- Symptom: Stale lock recovery or unconditional unlock can delete a successor process lock
- Root cause: Filesystem lock deletion was not serialized and release did not verify acquisition ownership
- Fix pattern: Serialize recovery with an OS-backed coordination lock and use a unique owner token checked before deletion
- Regression test added: Race stale-lock contenders and replace the lock during an action; assert mutual exclusion and successor preservation
- Relevant files: apps/pad-pilot/scripts/directory-transaction.ts, apps/pad-pilot/scripts/directory-transaction.test.ts

## 2026-08-23 - Retried draft deletion reports cleanup complete after the first filesystem removal failed

- Symptom: Retried draft deletion reports cleanup complete after the first filesystem removal failed
- Root cause: Database deletion discarded bundle paths before cleanup succeeded
- Fix pattern: Persist cleanup paths in the deletion tombstone and clear them only after successful idempotent cleanup
- Regression test added: Inject first cleanup failure, retry deletion, and assert metadata survives until files are removed
- Relevant files: apps/pad-pilot-marketplace/src/db.ts, apps/pad-pilot-marketplace/src/server.ts, apps/pad-pilot-marketplace/src/server.test.ts, apps/pad-pilot-marketplace/migrations/005-draft-cleanup-paths.sql

## 2026-08-23 - Identity-cardinality churn resets a global rate limit

- Symptom: Identity-cardinality churn resets a global rate limit
- Root cause: Global and evictable identity buckets shared one capacity-bounded map
- Fix pattern: Keep trusted global buckets in a separate non-evictable map while bounding identity buckets
- Regression test added: Overflow identity capacity between two global consumes and assert the second remains limited
- Relevant files: apps/pad-pilot-marketplace/src/rate-limit.ts, apps/pad-pilot-marketplace/src/rate-limit.test.ts, apps/pad-pilot-marketplace/src/server.ts

## 2026-08-23 - Development seed conflict overwrites an existing bundle before rejecting ownership

- Symptom: Development seed conflict overwrites an existing bundle before rejecting ownership
- Root cause: Filesystem mutation ran before transactional slug-owner validation
- Fix pattern: Reserve and validate database ownership first, then atomically replace the managed bundle from a synced sibling temp file
- Regression test added: Pre-own the seed slug and assert rejection leaves bundle bytes and seed user unchanged
- Relevant files: apps/pad-pilot-marketplace/src/seed.ts, apps/pad-pilot-marketplace/src/seed.test.ts

## 2026-08-24 - Database startup appears healthy even when applied migration history no longer matches required schema

- Symptom: Database startup appears healthy even when applied migration history no longer matches required schema
- Root cause: An unconditional legacy reconciler created tables and columns after migrations, masking drift
- Fix pattern: Make migrations the sole schema writer, verify applied checksums, then fail closed against an explicit required-schema and critical-index contract
- Regression test added: Damage an applied schema column and assert startup rejects it instead of recreating it
- Relevant files: apps/pad-pilot-marketplace/src/db.ts, apps/pad-pilot-marketplace/src/db.test.ts

## 2026-08-24 - Capability telemetry from a previous Module replayed into the newly selected owner

- Symptom: Capability telemetry from a previous Module replayed into the newly selected owner
- Root cause: Capability caches did not bind frames to open ownership or enforce monotonic sequence numbers
- Fix pattern: Accept frames only for an open selected-owner handle, reject non-increasing sequences, and clear replay state on close or owner change
- Regression test added: Late, cross-owner, out-of-order, and stale-cache bridge/analyzer/FX regressions
- Relevant files: apps/pad-pilot/ui/src/bridge.ts, apps/pad-pilot/ui/src/bridge.test.ts, apps/pad-pilot/ui/src/padpilot/analyzer.ts, apps/pad-pilot/ui/src/padpilot/fx-capabilities.ts

## 2026-08-24 - Malformed native JSON crossed the bridge as trusted typed state

- Symptom: Malformed native JSON crossed the bridge as trusted typed state
- Root cause: Native promise responses were parsed and cast without runtime shape or requested-size validation
- Fix pattern: Validate every native JSON response at the bridge boundary and re-check caller-specific limits before exposing it
- Regression test added: Malformed picker response and over-request-limit managed import regressions
- Relevant files: apps/pad-pilot/ui/src/bridge.ts, apps/pad-pilot/ui/src/bridge.test.ts

## 2026-08-24 - Module aliases produced different capability handles and state-cache keys

- Symptom: Module aliases produced different capability handles and state-cache keys
- Root cause: Canonical Module identity logic was duplicated across bridge, provider, state, and capability clients
- Fix pattern: Centralize canonical IDs, aliases, capability handles, and selected-capability resolution in one fail-closed identity module
- Regression test added: Alias canonicalization, capability handle, selected catalog, bridge, provider, hotkey, MIDI, analyzer, and FX regressions
- Relevant files: packages/pad-pilot/src/module-identity.ts, packages/pad-pilot/src/module-identity.test.ts, apps/pad-pilot/ui/src/bridge.ts, apps/pad-pilot/ui/src/padpilot/provider.tsx

## 2026-08-24 - Timed-out subprocess cleanup returns while the child is still alive

- Symptom: Timed-out subprocess cleanup returns while the child is still alive
- Root cause: The deadline rejected immediately after kill and callers awaited proc.exited without a bounded reap
- Fix pattern: Centralize terminate-and-reap with a second explicit deadline and await it on timeout and stream failures
- Regression test added: Fake async child proves rejection waits for reaping; hanging candidate validator stays bounded
- Relevant files: packages/pad-pilot/src/subprocess.ts, apps/pad-pilot/scripts/process-runner.test.ts, apps/pad-pilot/scripts/synaesthetic-evaluator/behavior-synthesizer.ts, apps/pad-pilot/scripts/synaesthetic-evaluator/synaesthetic-evaluator.test.ts

## 2026-08-24 - Applied SQL migration deletion or post-apply mutation can leave unverifiable schema history

- Symptom: Applied SQL migration deletion or post-apply mutation can leave unverifiable schema history
- Root cause: Migration startup tracked only IDs and did not bind every applied row to a present immutable file checksum
- Fix pattern: Persist SHA-256 per migration, backfill legacy rows once, reject checksum drift and applied IDs missing from disk, then validate the required schema contract
- Regression test added: Database startup rejects modified and deleted applied migration files, verifies legacy backfill, and fails closed on schema drift
- Relevant files: apps/pad-pilot-marketplace/src/db-bootstrap.ts, apps/pad-pilot-marketplace/src/db.test.ts

## 2026-08-24 - File-integrity cache can bless bytes that were never hashed

- Symptom: File-integrity cache can bless bytes that were never hashed
- Root cause: Cache warmup recorded only path metadata while trusting a caller-supplied checksum
- Fix pattern: Warm integrity caches only through the same hash-and-stable-fingerprint verification used by cold reads
- Regression test added: Bundle verifier rejects replacement bytes presented before cache warmup
- Relevant files: apps/pad-pilot-marketplace/src/module-transfer.ts, apps/pad-pilot-marketplace/src/module-transfer.test.ts

## 2026-08-24 - State-migration function discovery can hang Script Thread

- Symptom: State-migration function discovery can hang Script Thread
- Root cause: QuickJS global accessor lookup ran outside execution watchdog
- Fix pattern: Wrap every Module-controlled property access and callback in ExecutionBudgetGuard
- Regression test added: Native runaway migration getter completes within one second
- Relevant files: apps/pad-pilot/plugin/runtime/quick-js-host.cpp, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp

## 2026-08-24 - Packaged embedded UI omitted CSS or copied stale browser assets

- Symptom: Packaged embedded UI omitted CSS or copied stale browser assets
- Root cause: CMake tracked only the JavaScript bundle and the VST3 post-build step read a separate development output directory
- Fix pattern: Build JavaScript and CSS into one dedicated CMake-owned directory; embed and deploy from that exact output; contract-test both assets and the source path
- Regression test added: Native source contract plus clean plugin build verifies main.js and main.css use the embedded-ui output
- Relevant files: apps/pad-pilot/plugin/CMakeLists.txt, apps/pad-pilot/scripts/build-ui.ts, apps/pad-pilot/plugin/runtime/realtime-correctness-contract.test.ts

## 2026-08-24 - Legal host state was rejected or controller fields were silently truncated across layer boundaries

- Symptom: Legal host state was rejected or controller fields were silently truncated across layer boundaries
- Root cause: Wire ingress budgets and field limits were duplicated independently in processor runtime and UI code
- Fix pattern: Centralize native legal maxima; derive aggregate frame envelopes from constituent caps; mirror decoded-byte limits in UI with source contracts
- Regression test added: Native state-wire contracts and UI bridge-ingress boundary tests
- Relevant files: apps/pad-pilot/plugin/runtime/state-wire-limits.h, apps/pad-pilot/plugin/runtime/controller-config.h, apps/pad-pilot/ui/src/bridge-ingress.ts

## 2026-08-24 - Preset tooling could parse an unbounded manifest and retain unsafe existing filenames

- Symptom: Preset tooling could parse an unbounded manifest and retain unsafe existing filenames
- Root cause: Manifest updates used Bun file.json with a type cast and validated only the new entry
- Fix pattern: Use stable bounded UTF-8 reads, runtime schema and cardinality validation, then validate every retained entry before atomic replacement
- Regression test added: Preset utility oversized-manifest and unsafe-retained-entry regressions
- Relevant files: apps/pad-pilot/scripts/preset-utils.ts, apps/pad-pilot/scripts/preset-utils.test.ts

## 2026-08-24 - Shipped FX states passed UI validation but were rejected or interpreted differently by native consumers

- Symptom: Shipped FX states passed UI validation but were rejected or interpreted differently by native consumers
- Root cause: Processor admission and audio graph validation independently encoded supported node types and finite parameter rules
- Fix pattern: Own the complete FX state validator in one native header and make every processor and graph consumer call it; contract-test every shipped typed effect
- Regression test added: Native FX graph and source contracts cover Reverse Tremolo Saturation Delay and EQ field parity
- Relevant files: apps/pad-pilot/plugin/audio/fx-state-validation.h, apps/pad-pilot/plugin/audio/convolver-module-graph.cpp, apps/pad-pilot/plugin/core/pad-pilot-processor-automation.cpp, apps/pad-pilot/plugin/runtime/fx-native-contract.test.ts

## 2026-08-29 - Adding transparent parallel FX racks makes output progressively louder

- Symptom: Adding transparent parallel FX racks makes output progressively louder
- Root cause: Every parallel rack received full input and the graph summed full dry-bearing outputs without compensation
- Fix pattern: Define the rack summing equation explicitly and normalize the rendered parallel sum before applying master wet/dry
- Regression test added: Render the maximum legal count of empty chains and assert sample-identical unity
- Relevant files: apps/pad-pilot/plugin/audio/convolver-module-graph.cpp, apps/pad-pilot/plugin/runtime/fx-graph-native-tests.cpp, docs/pad-pilot/vst-quality-gates.md

## 2026-08-29 - An FX toggle persists in UI state but does not change rendered audio

- Symptom: An FX toggle persists in UI state but does not change rendered audio
- Root cause: Canonical state classified the field as realtime-supported while the AudioCommand enum queue and graph switch omitted it
- Fix pattern: Maintain a control ledger from state field through bounded command to DSP and require the exact command to change rendered samples
- Regression test added: Apply node mute and solo through AudioCommand and assert the native graph accepts them and mute silences the lane
- Relevant files: apps/pad-pilot/plugin/runtime/runtime-types.h, apps/pad-pilot/plugin/core/pad-pilot-processor-automation.cpp, apps/pad-pilot/plugin/audio/convolver-module-graph.cpp, apps/pad-pilot/plugin/runtime/fx-graph-native-tests.cpp

## 2026-08-29 - DAW project state restores bindings but can lose host-visible parameter positions

- Symptom: DAW project state restores bindings but can lose host-visible parameter positions
- Root cause: Processor state serialized automation metadata and mirrored FX targets but omitted the APVTS master and macro normalized values
- Fix pattern: Persist one exact-size bounded parameter snapshot at the processor host-state boundary and restore it silently with backward compatibility
- Regression test added: Serialize the full 19-value snapshot and reject overflow partial and non-finite state before protobuf admission
- Relevant files: apps/pad-pilot/utils/proto/bridge.proto, apps/pad-pilot/plugin/core/pad-pilot-processor-persistence.cpp, apps/pad-pilot/plugin/runtime/plugin-state-wire.cpp, apps/pad-pilot/plugin/runtime/padpilot-native-tests-main.cpp

## 2026-08-29 - VST3 advertises a factory program with no host-visible name

- Symptom: VST3 advertises a factory program with no host-visible name
- Root cause: The JUCE template-style processor returned one program while getProgramName returned an empty string
- Fix pattern: Give every advertised program a stable non-empty name and make Steinberg extensive validation a release gate
- Regression test added: Steinberg Scan Programs reports Default and the extensive suite passes 537 of 537 tests
- Relevant files: apps/pad-pilot/plugin/core/pad-pilot-processor.cpp, apps/pad-pilot/scripts/validate-vst3.ts, docs/pad-pilot/vst-quality-gates.md

## 2026-08-29 - FL Studio validation aborts before rendering when no FL64 process is running

- Symptom: FL Studio validation aborts before rendering when no FL64 process is running
- Root cause: PowerShell Get-Process returns exit 1 for a missing named process when its empty pipeline is used directly
- Fix pattern: Materialize the optional Get-Process result with array syntax so an empty result exits successfully, then reject only non-empty PID output
- Regression test added: FL Studio command contract asserts the safe array-materialized process query
- Relevant files: apps/pad-pilot/scripts/fl-studio-validation.ts, apps/pad-pilot/scripts/fl-studio-validation.test.ts, apps/pad-pilot/scripts/validate-fl-studio.ts
