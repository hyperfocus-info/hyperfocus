# PadPilot

PadPilot is a source-available VST3 platform plugin for turning controllers and other input devices into first-class workflow tools inside a DAW.

It is designed to let musicians, producers, and technical users map physical input to repeatable workflow actions, audio behaviors, and custom interfaces without forcing those workflows into a single hardcoded plugin concept.

PadPilot is also three things at once:

- A VST3 platform plugin that hosts Modules, manages Presets, owns persistence, and routes controller input, UI, and audio graph state.
- A marketplace-driven platform where users can upload and download free or paid custom Modules.
- A frontend component system and API bridge that lets developers build custom Modules against a VST backend without writing native UI glue from scratch.

## Product Model

### PadPilot

The VST3 platform plugin. Hosts Modules. Manages Presets. Handles controller input, scripting, UI, and audio graph routing.

### Module

A user-installable capability layer written in TypeScript and bundled with Bun.
A Module defines behavior, routing logic, UI panels, and interactions with PadPilot APIs.
Modules never execute on the Audio Thread.

### Preset

A saved mapping state within a Module.
Presets define button mappings, modifiers, axis behavior, and mode or state configuration.

## Why It Exists

Most DAW workflows still treat controllers as generic MIDI sources or per-plugin automation surfaces. PadPilot is intended to be a more programmable layer:

- map gamepads, MIDI devices, and other inputs into workflow actions
- build custom controller-driven Modules for specific production tasks
- persist module state in the plugin processor so projects reopen correctly
- extend the platform through installable Modules instead of forking the plugin

## Architecture At A Glance

- Native backend: C++20, JUCE, VST3, CMake
- Scripting and runtime logic: QuickJS-NG on the Script Thread
- Input polling: SDL2 on a dedicated Input Thread
- Frontend UI: SolidJS bundled with Bun and embedded in the JUCE WebView
- Bridge and state transport: protobuf-backed host or UI messaging where binary payloads matter

## Module Author Surface

PadPilot now exposes a unified hotkeys layer for Module authors.

- Use the injected `PadPilot.hotkeys` public surface instead of importing app-private source or `@tanstack/solid-hotkeys` directly inside Module code.
- `PadPilot.hotkeys` mirrors that same wrapper on the global PadPilot surface.
- The PadPilot wrapper re-exports the TanStack Solid hotkeys API and adds controller-aware bindings and mixed keyboard/controller recorders. Native `keyboardOutput` execution is available only to the selected, ready Module when its manifest declares `keyboard-output`.
- `PadPilot.hooks.useInputDevices()` exposes the current host-published input devices, while `useGamepad()` remains available as a compatibility facade over the primary gamepad.
- `PadPilot.HotkeyMacroField` provides a shared recorder and editor for keyboard and controller macros so Modules do not need to rebuild that UI.

Custom external UI bundles are disabled by default because they cannot share the privileged host WebView safely. Starter UI and sandboxed QuickJS behavior remain available. `PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI=true` is an explicit development-only override; production enablement is tracked in [Sandbox External Module UI](../../docs/pad-pilot/tasks/sandbox-external-module-ui.md).

PadPilot also exposes analyzer capabilities for Module authors.

- `PadPilot.analyzer.subscribe({ onFrame })` opens a selected-module-only analyzer feed and returns cached wrapper frames instead of raw protobuf messages.
- `PadPilot.analyzer.startCapture()`, `stopCapture()`, `setTuningHz()`, `setDetectionSensitivity()`, and `saveMidi()` are explicit analyzer actions, separate from read-only feed subscription.
- `PadPilot.midi.beginDrag(midiData, filename)` starts a generic native MIDI drag from SMF bytes; `PadPilot.MidiDragBlock` wraps the same API for UI.
- `PadPilot.askAgent({ prompt, system, agent, provider, model })` posts text-only Module requests through PadPilot's app-embedded runtime so Modules do not own provider fetch or credential plumbing. The configured app-user profile supplies defaults; installed agent adapters and direct-provider models are selectable globally.
- The global **Suggest AI** button captures bounded processor state, asks for `hyperfocus-app-action-plan-v1`, previews semantic actions, and dispatches them only after explicit Apply. It never mutates WebView DOM or gives Modules access to global mutation authority. Bulk Module-state and capability scripts keep repeated work deterministic.
- Production VST3 and standalone builds package `padpilot-ai-runtime.exe`; the asynchronous native bridge keeps model and process work off the Audio and UI Threads. Dev uses the same runtime through the PadPilot loopback server. Harness is not required.

PadPilot also exposes a host-managed file import bridge for Module authors.

- Use `PadPilot.IO.importFile(fileOrPath, { category: "sample", maxBytes })` when a Module accepts browser `File` uploads or native file paths.
- The returned record includes a managed PadPilot path, content id, and display name suitable for lightweight module state.
- Raw imported media bytes stay in plugin-owned persistence, not module UI state or host-sync frames.
- Native backend actions and failures outside the Audio Thread should be written to the PadPilot backend log at `%APPDATA%/PadPilot/logs/padpilot-backend.log` so release-build debugging has a stable artifact.
- `PadPilot.hooks.useAnalyzerFeed()` is an optional Solid helper over the same public analyzer capability.
- Shipped Modules must use the same public PadPilot APIs available to user-created Modules. The built-in Analyzer is a reference Module, not a privileged internal-only path.
- Analyzer tuning, detection sensitivity, take summary, and bounded note-event state are serialized by the plugin processor and restore with the DAW project.
- Raw analysis snapshots are session-scoped. Sensitivity re-analysis applies only to takes captured in the current plugin session; a restored take remains exportable but cannot be re-analyzed without a new capture.

## Repository Guide

- [Frontend README](./ui/README.md) for UI architecture, PadPilot elements, module surfaces, bridge rules, and colocated frontend tests.
- [Backend README](./plugin/README.md) for native architecture, thread model, persistence, and real-time constraints.
- [Marketplace README](../pad-pilot-marketplace/README.md) for the browser dev host, API surface, storage layout, and colocated marketplace tests.
- [Scripts README](./scripts/README.md) for the root-owned Bun and CMake workflow.
- [PadPilot docs](../../docs/pad-pilot/README.md) for audits, tasks, Module contracts, and product guides.
- [FL Studio MVP Setup](../../docs/pad-pilot/fl-studio-mvp-setup.md) for host-specific setup and validation notes.
- [VST Quality Gates](../../docs/pad-pilot/vst-quality-gates.md) for measurable audio, persistence, validator, and FL Studio release contracts.

## Common Commands

Run these from the Hyperfocus repository root.

```bash
bun run dev:pad-pilot
bun run dev:pad-pilot-marketplace
bun run build:pad-pilot
bun run build:pad-pilot-native
bun run test:pad-pilot
bun run typecheck:pad-pilot
bun run --cwd apps/pad-pilot generate:proto
bun run --cwd apps/pad-pilot test:plugin-native
bun run --cwd apps/pad-pilot bootstrap:vst-validators
bun run --cwd apps/pad-pilot validate:fl-studio
bun run --cwd apps/pad-pilot validate:vst3
```

PadPilot is a first-party Hyperfocus app surface. Root scripts own common entrypoints;
app-local scripts own native/plugin workflows. Marketplace is an independent sibling
app, and portable contracts are exported by `@hyperfocus/pad-pilot`.

## Repository Layout

- `plugin/`: native plugin source, `plugin/CMakeLists.txt`, audio graph, runtime, and generated native protobuf outputs
- `ui/`: embedded SolidJS frontend, PadPilot element primitives, module UIs, bridge, and colocated UI tests
- `../pad-pilot-marketplace/`: Bun server, SQLite-backed service state, uploads, and colocated marketplace tests
- `scripts/`: root-owned build, dev, proto, copy, and release automation written in TypeScript
- `utils/proto/`: protobuf schema source shared across native and UI generation
- `../../docs/pad-pilot/`: audits, tasks, testing notes, and host or architecture documents

## Development Principles

- Canonical runtime and module state lives in the plugin processor, not the WebView.
- The Audio Thread is treated as real-time critical: no allocations, no locks, no blocking calls, no JavaScript execution.
- Debug builds are for local debugging. Release builds are for benchmarking and shipping.
- Modules extend PadPilot without executing on the Audio Thread.
- Tests live next to the files they verify. PadPilot does not use separate app-owned `/test` directories.
- Non-vendored maintained and generated filenames are expected to use kebab-case.

## Verification

Portable migration gate:

```powershell
bun.cmd run typecheck:pad-pilot
bun.cmd run test:pad-pilot
bun.cmd run build:pad-pilot
```

Native, validator, and FL Studio gates are defined in
[VST Quality Gates](../../docs/pad-pilot/vst-quality-gates.md) and require a
provisioned Windows audio host.

## Status

PadPilot is an actively evolving platform. The current focus is high-performance native execution, reliable state persistence, controller-driven workflows, and a Module ecosystem that can support both free and paid distribution.

The current marketplace and account pass includes eager app-shell auth bootstrap, a sliding backend session cookie, canonical SQLite-backed account entitlements, Stripe-driven First Class and PadPilot lifetime checkout flows, and a temporary guest-mode degradation path tracked in [Harden Guest/Demo Mode](../../docs/pad-pilot/tasks/harden-guest-demo-mode.md). Marketplace admission control remains process-local, so production is single-process until [Distributed Admission Control](../../docs/pad-pilot/tasks/marketplace-distributed-admission-control.md) is complete.

The current updater pass adds marketplace-backed PadPilot build discovery, stable or beta release channels, signed staged directory-patch artifacts for `.vst3` bundles, and a Windows helper that applies the prepared bundle after PadPilot and its host process exit. The embedded single-key verification boundary is tracked in [Manage Updater Signing Keys](../../docs/pad-pilot/tasks/manage-updater-signing-keys.md) before public automatic updates.
