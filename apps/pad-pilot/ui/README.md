# Frontend Architecture

The frontend is the embedded SolidJS application that renders PadPilot inside the plugin editor.

It is not the source of truth for audio-critical state. The UI is a fast editing and visualization layer that talks to the native host through the PadPilot bridge.

`ui/` is the embedded surface inside `apps/pad-pilot`. Hyperfocus root scripts
provide common gates; app-local scripts own embedded/native details.

## Core Concepts

### Elements

Elements are reusable frontend primitives used to build Module interfaces and shared PadPilot surfaces.

Primary locations:

- `ui/src/components/elements`
- `ui/src/components`
- `ui/src/padpilot`

These should stay composable, host-safe, and visually coherent with the rest of the plugin. Prefer building new module surfaces out of existing elements before adding one-off controls.

### Nodes

Nodes are the UI and state representations for FX graph units and other module-specific editable building blocks.

Relevant areas:

- `ui/src/modules`
- `ui/src/modules/fx`
- `ui/src/modules/fx/node-registry`

A node should expose a clear editing surface, map to stable host-recognizable state, and avoid unnecessary reactive churn while dragging or automating controls.

### API Interfaces

The bridge between UI and native code is centered around a small set of interfaces:

- `ui/src/bridge.ts`: stable public facade plus host message transport, subscriptions, and intent dispatch
- `ui/src/bridge-contracts.ts`: shared host state, intent, import, and bridge option contracts
- `ui/src/bridge-native-contracts.ts`: JUCE native invocation and bounded file-import contracts
- `ui/src/bridge-ingress.ts`: bounded legacy JSON and protobuf host-frame decoding
- `ui/src/bridge-capability-streams.ts`: capability subscription ownership, revision filtering, and intent coalescing
- `ui/src/module-sdk.ts`: the module-facing API used by the frontend to talk to the host
- `ui/src/padpilot/provider.tsx`: provider layer for controller input, module state hydration, and scoped module surfaces
- `ui/src/padpilot/hotkeys.tsx`: PadPilot hotkeys wrapper that re-exports TanStack Solid hotkeys and adds controller-aware macro support
- `ui/src/proto`: protobuf codecs and payload helpers for binary-backed module state

If a module has codec-backed state, keep that path authoritative and do not silently fall back to ad hoc JSON hydration. FX `ppfx1:` import codes are canonical Base64 of the existing protobuf `PresetFile` envelope, not a second state format; see [FX compact Preset codes](../../../docs/pad-pilot/fx-compact-preset-codes.md).

Large module internals use small stable facades so consumers do not depend on implementation ownership. Generator prompt, intent, style-DNA, tracker, repair, fallback, and client orchestration live in separate domain files under `ui/src/modules/generator/utils`; `codex-client.ts`, `generator-options.ts`, and `generator-massage.ts` preserve their public import surfaces. FX node protobuf definitions stay runtime-independent under `ui/src/modules/fx/node-registry/definitions`; renderer groups and shared renderer primitives are registered separately, with `renderers.tsx` as the compatibility facade.

External Module UI bundles fail closed by default until they can run behind a source-bound sandbox broker. The `PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI=true` override is development-only and gives that code the full privileges of the host WebView. Production enablement is tracked in [Sandbox External Module UI](../../../docs/pad-pilot/tasks/sandbox-external-module-ui.md).

## Analyzer Capability

PadPilot exposes analyzer access as a public module capability, not built-in Analyzer magic.

- Use `PadPilot.analyzer.subscribe({ onFrame })` for the live analyzer feed.
- The public feed is a stable wrapper shape, not the generated native `AnalyzerFrame` protobuf type.
- Feed subscription is read-only. Capture and export are separate explicit actions through `PadPilot.analyzer.startCapture()`, `stopCapture()`, and `saveMidi()`.
- `PadPilot.hooks.useAnalyzerFeed()` is the Solid convenience helper. It auto-closes on component cleanup.
- The bridge deduplicates duplicate analyzer subscriptions for the selected module, auto-closes on module switch and page teardown, and preserves the last mapped frame in UI state so views can freeze gracefully.
- `NoteHeatmap` stays props-driven and backend-agnostic. Modules should map analyzer wrapper data into element props instead of depending on protobuf-generated shapes.

## Agent And MIDI APIs

- Use `PadPilot.askAgent({ prompt, system, model })` for provider-backed text generation. Modules should not hand-roll fetch calls for the PadPilot agent bridge.
- Use `PadPilot.midi.beginDrag(midiData, filename)` for generic SMF byte drags, or `PadPilot.MidiDragBlock` for the shared drag/download UI.
- Use `PadPilot.createProducerActions(moduleId, options)` for owner-scoped live MIDI notes/CC, validated keyboard shortcuts, host automation gestures, and persisted Module-local profile adapters. Dispose it with the Module so held notes and touches are released.
- Live MIDI reaches the VST3 MIDI output through a bounded lock-free queue. Keyboard transport commands are explicit shortcuts, not a claim that PadPilot owns a DAW transport API.

## Sample Capability

PadPilot exposes sample editing and playback through public sample capabilities, not factory-module-only Recut glue.

- Use `PadPilot.sampleCapabilities.createHandles(moduleId)` to derive stable `sample-source`, `sample-analysis`, `slice-playback`, and `haptics` handles.
- `openEditorFrameStream()` subscribes to the generic `CapabilityFrameEnvelope` stream carrying `SampleEditorFrame`.
- Loading files, requesting analysis, applying slice playback state, triggering pads, and slice edits all go through `sendCapabilityIntent()` on the generic bridge surface.
- `sample-analysis` requests now support generic analysis-mode inputs such as `analysisMode`, `density`, `requestedBpm`, `projectBpm`, `manualMarkers`, `maxSliceCount`, and `includeCandidateTransients`.
- `SampleEditorFrame` now carries generic chop-editor state including waveform peaks, candidate transients, active slice markers, held and playing pad indices, BPM source and confidence, project BPM, analysis revision, and pad assignments that can explicitly mark pads empty.
- `slice-playback` triggers use press and release semantics through the same public path, so browser and native hosts can both support held slice playback without Recut-only glue.
- Recut Auto mode now ranks spectral-flux transients by interest, balances dense results across 16 timeline buckets, and leaves unused pads empty when a sparse set of chops wins.

## Hotkeys And Input Devices

Module code should use the PadPilot hotkeys wrapper instead of importing TanStack directly.

- Use the injected `PadPilot.hotkeys` surface; app internals use direct relative imports.
- The wrapper preserves the TanStack keyboard API and adds mixed keyboard and controller triggers and recorder support. Native shortcut-sequence execution requires the selected, ready Module to declare `keyboard-output`; undeclared output fails closed.
- `PadPilot.hotkeys` mirrors the same wrapper for code that consumes the global PadPilot surface.
- `useInputDevices()` and `bindInputDevices()` expose the full host-published input-device list.
- Each published input device now carries raw host input plus PadPilot canonical mapped input, detected layout metadata, runtime device id, and persistent hardware id.
- `useControllerConfig()` exposes the global persisted controller-routing state and save helper used by the controller preferences panel.
- `useGamepad()` and `bindController()` remain compatibility facades over the primary mapped controller row, not the first raw connected device.
- `ui/src/components/elements/hotkey-macro-field.tsx` is the shared recorder and editor element for keyboard and controller macros.

## State Management Rules

### Host State vs UI State

Use the plugin processor as the canonical source of runtime and module state.

UI state should be split into:

- persisted module or runtime state that must round-trip through the host
- ephemeral view state such as panel expansion, drag hover, selection affordances, or modal visibility

Do not blur those two classes of state. If the host needs to restore it after closing and reopening the editor or the DAW project, it belongs in processor-owned state.

### Persistence

Best practices:

- persist module state through bridge messages and host sync
- use protobuf codecs for structured high-value module payloads
- treat `localStorage` as a place for non-critical preferences only
- never store audio-critical values only in the browser cache

### Hydration

The frontend should not eagerly invent default persisted state and push it back to the host before authoritative host state arrives.

For codec-backed modules:

- wait for authoritative payloads from the host
- hydrate from the codec-backed payload path
- avoid JSON fallback writes that can overwrite native state during editor reopen

For analyzer capability consumers:

- treat analyzer feed frames as transient view data
- do not mirror analyzer state back from the UI; the processor owns and serializes the bounded canonical state
- expect `AnalyzerModuleState` through the generic `ActiveModuleStateFrame` / `activeModuleStateBase64` path, while live `AnalyzerFrame` telemetry arrives through the capability stream
- treat raw sensitivity-replay snapshots as session-only even though bounded take summary and note-event state restore with the project

## Testing Rules

- Tests are colocated next to the source files they verify.
- UI tests run from the Hyperfocus root through `bun run --cwd apps/pad-pilot test:ui`.
- Source-contract tests are acceptable where Bun runtime execution is the wrong tool for validating a Solid TSX contract.
- Do not reintroduce `ui/test` or any other separate subtree test directory.

## Performance Rules

- Avoid `requestAnimationFrame` polling for data the host can push at a bounded low rate.
- Keep hot reactive paths allocation-light, especially during pointer drags and meter updates.
- Reuse shared elements and stores instead of cloning state across components.
- Treat diagnostics and visualizers as decimated telemetry, not always-on full-speed rendering loops.
- Keep bridge message volume deliberate. If the host can push 10 to 15 Hz frames, do not also poll the same data from the browser.

## UI and Styling Conventions

- Bun is the bundler for the frontend.
- New or touched component presentation uses StyleX; do not add CSS Modules.
- Shared semantic tokens and PadPilot CSS variables carry theme intent.
- Preserve an intentional plugin aesthetic rather than default web-app styling.
- Build responsive module layouts that work in constrained plugin editor sizes.
- Keep controls readable and predictable under automation and rapid editing.

## Working Areas

- `ui/src/components`: shared UI surfaces and dialogs
- `ui/src/components/elements`: reusable low-level controls and visual primitives
- `ui/src/modules`: module-specific UI implementations
- `ui/src/padpilot`: provider, host integration helpers, shared frontend runtime types, and public PadPilot elements
- `ui/src/proto`: generated protobuf types and codec helpers
- colocated `*.test.ts` and `*.test.tsx` files next to source

## Common Commands

Run from the repository root.

```bash
bun run build:pad-pilot
bun run test:pad-pilot
bun run typecheck:pad-pilot
```

## Related Documentation

- [Root README](../README.md)
- [Backend README](../plugin/README.md)
- [Scripts README](../scripts/README.md)
- [PadPilot docs](../../../docs/pad-pilot/README.md)
- [FL Studio MVP Setup](../../../docs/pad-pilot/fl-studio-mvp-setup.md)
