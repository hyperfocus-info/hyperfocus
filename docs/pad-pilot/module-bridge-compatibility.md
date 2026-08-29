# Module Bridge Compatibility Boundary

Removed legacy bridge intents:
- `openStream("analyzer")`
- `closeStream("analyzer")`
- `analyzerStartCapture`
- `analyzerStopCapture`
- `analyzerSetTuningHz`
- `analyzerSetDetectionSensitivity`
- `analyzerBeginMidiDrag`
- `analyzerSaveMidi`
- `setParam` and `setParamLegacy`
- `createPreset`, `savePreset`, `createPresetProto`, and `savePresetProto`
- `beginMidiDrag` and `setHostTempo`
- `browseSampleSource` and `browseImpulse`
- direct FX UI usage of host visualizer frames outside `PadPilot.capabilities.fxVisualizer`

Public replacements:
- `PadPilot.analyzer.*`
- `PadPilot.capabilities.fxGraph`
- `PadPilot.capabilities.fxVisualizer`
- `PadPilot.IO.pickFile` plus `PadPilot.IO.importFile`
- capability-authorized `PadPilot.MidiDragBlock` and `PadPilot.HostBpmButton`

Removal gate:
- shipped Analyzer module uses only public analyzer APIs
- shipped FX module uses only public FX capability APIs for graph, visualizer, and automation paths
- browser dev-host parity tests pass for install/load outcomes and capability transport
- local install, missing-bundle, and incompatible-host flows pass
- no hard-coded built-in capability routing remains in app shell or editor input handling

The gate is complete. Native Analyzer state now travels through the generic active-Module state
frame and live data travels through `analyzer-feed`. Automation and MIDI export mutations require
selected, ready Modules with matching declared capability handles. Generated MIDI bytes, host tempo,
FX wet/dry, and native sample imports no longer have raw bridge bypasses.

One product-policy exception remains outside the capability bridge: the temporary guest/demo UI path
targets FX wet/dry directly. It is client-visible, is not an authorization boundary, and is tracked for
removal in [Harden Guest/Demo Mode](tasks/harden-guest-demo-mode.md).
