# VST Functionality Audit — 2026-08-29

Scope: FX signal flow, Module audio ownership, realtime toggle propagation, processor persistence, host validation, and durable AI quality controls.

## Verdict

The reported loudness and ineffective controls were real native-backend defects, not only UX confusion.

State persistence has substantial implementation—bounded processor-owned protobuf state, typed runtime snapshots, managed-media recovery, and restore paths—and now passes pluginval's black-box state restoration checks. The official Steinberg conformance suite also passes. FL Studio save-close-reopen remains the final host-specific proof because its four version-native projects require one-time interactive authoring in FL Studio 2026 and 21.

## Findings

### Critical — parallel chains multiplied the source

Every active chain copied the full input and the graph added every chain output. Empty, transparent, or bypassed chains therefore produced `N * input`; eight racks could add `20 * log10(8) = 18.06 dB`. Master wet/dry then mixed that already duplicated rack signal against the original input.

Resolution: divide the parallel sum by rendered-chain count, distinguish an unconfigured transparent graph from a configured rack with no rendered chains, and keep the latter's wet path silent. Native coverage now asserts eight transparent chains preserve unity and muting the only configured chain silences the wet rack.

### High — node mute and solo were UI-only

Canonical state accepted `NodeState.muted` and `NodeState.solo`, and the UI committed them, but the realtime diff command surface contained neither command. The processor classified those fields as realtime-supported while never sending them to the graph.

Resolution: add bounded node mute/solo commands, queue them from state diffs, apply them in the Audio Thread graph, and assert the command changes rendered samples.

### High — public master wet/dry targeted one Convolver

The `fx-graph` capability action named `set-master-wet-dry` emitted `setConvolverWetDry`. It changed the first matching Convolver node or failed when none existed; it did not change graph master wet/dry.

Resolution: emit `setMasterWetDry` and cover the bridge contract plus zero-wet native render.

### High — FX processed while another Module was selected

`processBlock` always ran the FX graph. Recut already had selected-owner gating; FX did not. Switching Modules could leave stale FX audible and made Module selection semantically false.

Resolution: derive FX activity from the selected ready Module's declared `fx-graph` capability. Ramp inactive graphs to dry with the preallocated structural bypass and stop processing after completion.

### High — host state had no executable release gate

The processor implements `getStateInformation`/`setStateInformation`, validates and bounds state, persists accepted revisions, and applies restored selected-Module runtime state. Existing tests mostly proved codecs, individual runtimes, or source wiring; the initial environment had neither pluginval nor the Steinberg validator.

Resolution in this pass: add a checksum/commit-pinned repository-local validator bootstrap, fail-closed `apps/pad-pilot/scripts/validate-vst3.ts`, pluginval strictness 10, Steinberg extensive validation, and a bounded FL Studio 2026/21 command-line render harness. pluginval passed. Steinberg's first run exposed a nameless advertised program; naming it `Default` changed the result to 537 passed and 0 failed. FL Studio 26.1.1.5547 and 21.2.3.4004 were detected, but their four version-native `.flp` fixtures still need interactive creation before automated rendering can run.

The first-party processor-instance round-trip missing from CI is tracked in `docs/pad-pilot/tasks/host-state-roundtrip-harness.md` with owner, deadline, render comparison, old-schema, and corruption exit tests.

### High — host automation positions were not in processor state

The state protobuf saved automation bindings but omitted the normalized values of the three master parameters and 16 macro slots. Selected FX state happened to mirror many targets, but that did not satisfy JUCE's requirement to return all parameter values, and it left non-FX or unbound host-visible positions dependent on host-specific replay behavior.

Resolution: schema version 8 stores exactly 19 bounded finite normalized values, restores them without generating automation gestures, accepts older snapshots without the field, and rejects partial, oversized, or non-finite snapshots. Native wire tests cover the legal maximum and overflow.

### Medium — generic `fx-graph` capability state is still factory-ID coupled

Capability authorization is generic, but FX state parsing, runtime ownership, visualizer state, automation reconciliation, and imported-IR recovery still contain built-in `fx` ID branches. A user-created Module can declare `fx-graph` yet cannot own the complete runtime/persistence path promised to the factory FX Module.

Resolution: tracked in `docs/pad-pilot/tasks/generic-fx-graph-state-ownership.md`. Do not claim the public capability is complete until its exit tests pass.

## Evidence run

- Root TypeScript typecheck: passed after all implementation and script changes.
- Plugin runtime suite: 38 passed, including the new routing, command, Module-gating, and persistence contracts.
- UI suite: 513 passed across 93 isolated files.
- Script suite: 133 passed, including validator pin/integrity, FL command construction, sample-aligned unity/dry/restore, wet-difference, cosmetic-mute, and equal-level polarity-corruption regressions.
- Native DSP/protobuf target: passed after a clean isolated configure and build. It rendered the new unity-gain, master-dry, node-mute, and all-chains-muted cases.
- Native updater target and application acceptance suites: passed; acceptance covered 15 Marketplace server cases and the full shipped Module walk.
- Debug VST3 target: built successfully with no PadPilot compiler warnings.
- Release VST3 build: passed and deployed transactionally to `C:\Program Files\Common Files\VST3\PadPilot.vst3`.
- pluginval 1.0.4 strictness 10: passed, including plugin state, state restoration, automation, parameter-thread safety, bus, and fuzz tests.
- Steinberg validator v3.8.1 build 84 extensive: first run found the empty program name; after correction, 537 passed and 0 failed.
- FL Studio probe: found FL Studio 2026 at 26.1.1.5547 and FL Studio 21 at 21.2.3.4004. Automatic render evidence is pending the four documented `.flp` fixtures.
- Full repository test command: stopped on one independently reproducible Marketplace stream-release assertion (`module-transfer.test.ts`); 75 other Marketplace tests passed. This is outside the VST change and must not be misreported as a clean full-suite result.

## Prevention added

- `$vst-quality` repository skill with rendered-sample and host-state evidence standards.
- Native transparent-parallel, master-dry, and node-toggle regressions.
- Source contracts tying UI/canonical diffs to native commands and Module gating.
- Pinned validator bootstrap plus `validate:vst3` release wrapper with deterministic arguments and tests.
- FL Studio 2026/21 golden-project harness with deterministic input WAV, quantitative render assertions, bounded child processes, and fixture instructions.
- Durable routing, persistence, FL Studio, and research contracts in `docs/pad-pilot/vst-quality-gates.md`.
