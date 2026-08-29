# Backend Architecture

The backend is the native PadPilot implementation: plugin lifecycle, processor-owned state, host automation exposure, controller ingestion, script runtime coordination, and the audio graph.

Performance discipline is not optional here. If the native layer violates real-time constraints, the entire product degrades no matter how efficient the frontend is.

## High-Level Layout

- `CMakeLists.txt`: native project entrypoint for configure and build
- `cmake`: shared native CMake helpers and dependency wiring
- `core`: thin JUCE processor/editor lifecycle entry points plus domain translation units for automation,
  modules, bridge/capabilities, persistence, runtime apply, analyzer UI, and file import
- `audio`: real-time graph and DSP node implementations
- `runtime`: module storage, preset storage, script host, input thread, and lock-free runtime plumbing
- `generated`: generated protobuf code used by host or UI bridge contracts

Embedded frontend assets are built into the CMake tree's dedicated `embedded-ui` directory. This keeps
compact no-sourcemap binary resources separate from the live development `ui/dist` output.

The old root-level `src/` and `cmake/` layout has been folded into `plugin/`. Native configure commands should now target `plugin/CMakeLists.txt`.

## Thread Model

PadPilot is split across distinct responsibilities:

- Audio Thread: DSP execution and graph command consumption. This path must stay allocation-free and lock-free.
- Input Thread: SDL2-backed device polling and event ingestion.
- Input Thread startup now owns SDL controller lifecycle: subsystem init, already-connected device enumeration, hotplug handling, and clean shutdown.
- Script Thread: QuickJS-NG execution for Module logic. This thread must never be treated as real-time audio execution.
- UI Thread: JUCE editor plus embedded WebView frontend.

The threads communicate through preallocated queues and explicit state handoff. Never move casual application code into `processBlock` because it seems convenient.

## Real-Time Rules

Inside `processBlock` and any code it calls:

- no heap allocation
- no locks
- no file or network I/O
- no blocking calls
- no JSON parsing or serialization
- no protobuf serialization
- no JavaScript execution

Required patterns:

- preallocate buffers in `prepareToPlay`
- use lock-free queues for thread handoff
- keep visualizer and diagnostics work off the critical path unless explicitly decimated and bounded
- treat host-facing persistence and UI sync as non-audio-thread concerns
- keep `getTailLengthSeconds()` stable across graph edits: VST3 has no tail-change notification, so
  PadPilot advertises the fixed 3,600-second supported-graph upper bound from construction

Live Module MIDI output is validated and decoded off the Audio Thread, then transferred as fixed-size
note/CC commands through a bounded lock-free queue. `processBlock` emits at most 128 commands plus a
bounded all-channel panic per block into the VST3 wrapper's pre-reserved MIDI buffer.

## Analyzer Service

The analyzer is now a processor-owned service, not codec-backed state owned by the built-in `analyzer` Module.

- Analyzer work stays off by default.
- `processBlock` only pushes analyzer audio when the selected module has opened the analyzer stream or capture is actively running.
- Audio-thread gating is atomic and branch-only. No analyzer locks, allocations, protobuf work, or file I/O were added to `processBlock`.
- The backend owns analyzer tuning, capture state, finalized take cache, and MIDI export helpers.
- Live analyzer routing is selected-module-only and auto-stops on module switch in V1.
- Analyzer frames and analyzer state snapshots are pushed separately to the UI bridge as decimated telemetry.
- Analyzer tuning, detection sensitivity, take summary, and bounded note-event state are included in processor-owned `PluginState` and restore through `getStateInformation` and `setStateInformation`.
- Raw analysis snapshots used to re-run detection at a new sensitivity remain session-scoped. Restored note events remain exportable, but re-analysis requires a new capture.

## Persistence Model

The plugin processor owns canonical runtime and module state through JUCE state serialization APIs.

That means:

- `getStateInformation` and `setStateInformation` are the source of truth for project restore
- UI state is a cache and editing surface, not the canonical store
- module state changes should flow into processor-owned state and back out through host sync
- reopening the editor should reconstruct state from processor snapshots, not browser defaults
- controller configuration is processor-owned state, persisted with `PluginState`, and rehydrated into the input thread plus UI on reload
- imported Recut media now persists as managed PadPilot cache files plus `PluginState.imported_media` fallback bytes for cache healing on restore
- raw imported audio bytes must not be added to UI module state or host-sync frames

## Controller Ingestion

Gamepad-class devices are normalized before they reach legacy module APIs.

- SDL ingestion keeps per-device raw buttons and axes plus live runtime metadata.
- The input thread maps Xbox, PlayStation, Switch, generic, and custom layouts into PadPilot's canonical browser-style gamepad order.
- `ControllerState` and direct audio-command mirroring now follow the primary configured controller row, not the first connected device.
- Persistent routing uses best-effort hardware ids for saved row matching and runtime ids for live session identity.
- Controller autodetect, connect/disconnect, and config-apply fallback paths log through the backend logger outside the Audio Thread.

## Automation Model

PadPilot exposes real host parameters through `juce::AudioProcessorValueTreeState`.

Current design goals:

- stable direct parameters for critical master controls
- stable macro slots for deeper Module or FX controls
- host automation should be driven through real JUCE parameter gestures, not UI-only messages
- automation bindings should persist with plugin state

This is required for host workflows such as FL Studio `Last tweaked`, automation clips, and controller linking.

## Debug vs Release

Do not judge plugin performance from a Debug build.

Use these rules consistently:

- `Debug` is for local debugging, assertions, stepping through code, and development instrumentation.
- `Release` is for benchmarking, profiling comparisons against other plugins, and shipping builds.
- If profiling or diagnostics are expensive, gate them explicitly instead of assuming debug-only behavior is representative.
- Never compare PadPilot Debug CPU numbers to production plugins such as ShaperBox and call it a meaningful result.

## Common Commands

Run from the repository root.

```bash
bun run generate:proto
bun run typecheck
bun run build:release
cmake -S plugin -B build/plugin -G "Visual Studio 17 2022" -A x64
cmake --build build/plugin --config Release --target PadPilot_VST3
```

For the full root-owned build workflow and script entrypoints, see [Scripts README](../scripts/README.md).

## Review Checklist For Native Changes

Before calling a native change complete, verify:

- no new allocations or resizes were introduced on the Audio Thread
- no locks or blocking work entered the DSP path
- state still restores correctly through processor serialization
- Release builds still compile and are the basis for performance measurement
- host automation and telemetry changes do not reintroduce GUI-driven audio instability

## Related Documentation

- [Root README](../README.md)
- [Frontend README](../ui/README.md)
- [Scripts README](../scripts/README.md)
- [FL Studio MVP Setup](../docs/fl-studio-mvp-setup.md)
- [FX Backend Gap Notes](../docs/fx-chain-backend-gap.md)

## Marketplace Note

Marketplace browser downloads do not currently install Modules into the native plugin runtime. Native installation and loading remain a separate future pass and must stay off the Audio Thread.

The native editor now also exposes updater bridge functions for runtime version discovery, update staging, and standalone restart-and-apply. All updater download, patch preparation, and helper-launch work stays off the Audio Thread.
