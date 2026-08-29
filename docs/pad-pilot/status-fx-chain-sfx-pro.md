# FX CHAIN SFX - PRO Status

Updated: 2026-08-29
Status: Functional

## Current implementation

### Frontend / SolidJS

- Protobuf-backed FX state, preset save/load, undo/redo, drag ordering, and host-synced module state.
- Fixed-capacity UI for up to 8 parallel chains and 8 serial nodes per chain.
- Realtime node meters and visualizers from native telemetry.
- 19 addable effect types whose visible controls have observable native DSP mappings.
- Native Reverse, Tremolo, and four-character Saturation nodes; expanded Delay tone recipes and adjustable
  low-shelf, bell, and high-shelf EQ frequencies.
- Two public tempo-syncable LFO sources and 16 fixed-capacity parameter routes stored in canonical FX state.
- Human-curated tag-driven idea generation plus 63 bundled chain presets: 1 system reset, 18 task-oriented utility chains, 13 creative chains, and 31 research-backed era/genre chains spanning the 1950s through 2020s. Preset discovery searches names and structured metadata, filters by category/favorite state, and provides transient Dry A/B plus peak-based output matching.
- Preset rail merges factory and host user presets; Save opens working create/overwrite/rename/favorite actions. A bounded `ppfx1:` paste action applies a complete protobuf `PresetFile` through canonical host state, with undo and strict module/schema/Base64/finite-value validation.
- Phaser, Rotary Speaker, and Pitch Drift are addable and run dedicated all-pass, rotor, and bounded
  variable-delay algorithms. Convolver imports a separate managed IR per node through the public IO API,
  exposes Blend, and persists deduplicated fallback media bytes within a 32 MiB aggregate budget for cache healing.
- Delay-bearing tempo divisions stop at `1/4T`; every allowed division is at most one beat. LFO-rate
  divisions retain the full list.

### Protobuf / tooling

- Source schemas live in `apps/pad-pilot/utils/proto/`.
- Generated TypeScript bindings live in `apps/pad-pilot/ui/src/proto/generated/`.
- Generated C++ bindings live in `apps/pad-pilot/plugin/generated/proto/`.
- `apps/pad-pilot/scripts/generate-proto.ts` owns regeneration and is part of the root build workflow.
- `apps/pad-pilot/scripts/generate-fl-studio-validation-presets.ts` produces tested binary Presets and matching paste codes for exact FL Studio Unity and Controls fixture state.

### Native / C++

- `apps/pad-pilot/plugin/audio/convolver-module-graph.*` implements the fixed-capacity 8 x 8 graph.
- Chains process in parallel; nodes process serially inside each chain.
- Rendered parallel chains use count compensation, so transparent racks preserve unity instead of multiplying dry gain.
- Structural protobuf commits configure the graph, node ordering, and state restore.
- Node peaks and waveform snapshots feed the visualizer protobuf path.
- Script-to-Audio Thread parameter updates use fixed-size commands after capability authorization.
- Delay storage is preallocated outside the Audio Thread for the documented high-rate tempo boundary.
- Reverse storage is preallocated in `prepare`; dual-LFO routing uses fixed arrays and block-rate parameter
  updates with no Audio Thread allocation, locking, I/O, or JavaScript.
- `getTailLengthSeconds()` advertises a stable 3,600-second upper bound from construction because VST3
  has no tail-change notification and hosts may cache the value. Internal estimation adds serial node
  tails and takes the longest parallel chain; it is validation data, not a dynamic host contract.

## Correctness coverage

- UI registry tests pin the addable effect set to the explicit native-control allowlist.
- State tests cover protobuf round-trip, graph bounds, addable-node defaults, and timing clamps.
- Native tests cover graph restore, reorder, preset restore, malformed values, serial/parallel tail bounds,
  block-partition invariance, high-rate delay storage, long reverb, EQ output gain, Reverse playback,
  Tremolo amplitude motion, public LFO routing, transparent parallel unity, master dry, and realtime node toggles.

Structural replacement is click-free today: the Audio Thread performs a preallocated wet-to-dry ramp,
the writer mutates only after reader quiescence, and playback resumes through a dry-to-wet ramp. An
immutable off-thread graph builder remains an optional latency optimization, not a correctness blocker.

Detailed residual gaps and the compatibility-only protobuf fields are tracked in
`docs/pad-pilot/fx-chain-backend-gap.md`.
