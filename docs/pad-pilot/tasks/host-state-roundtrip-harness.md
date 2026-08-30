# Host State Round-Trip Harness

Owner: PadPilot plugin/runtime

Deadline: 2026-09-15

Status: Open

Progress (2026-08-29): repository-local pinned pluginval and Steinberg validator bootstrap is complete; pluginval strictness 10 passes and Steinberg extensive passes 537/537 after correcting the advertised default program name. The first-party `padpilot-processor-tests` target now proves two non-factory FX owner states survive a fresh processor instance. The broader before/after-prepare matrix, full state inventory, render comparison, corrupt/legacy fixtures, and four version-native FL Studio `.flp` fixtures remain open.

## Problem

Typed payload and wire-preflight tests do not call the VST/JUCE processor state boundary. pluginval and Steinberg validator cover host conformance when installed, but PadPilot CI still needs a first-party regression that proves its exact canonical Module state and render survive a fresh processor instance.

## Exit criteria

- Add a Windows native test target that exercises `getStateInformation` and `setStateInformation` on fresh processor instances.
- Cover restore both before and after `prepareToPlay`.
- Mutate and compare selected Module/Preset, FX topology and controls, accepted revisions, all 19 normalized host parameters, automation bindings, controller state, editor view state, and representative managed media.
- Render a deterministic fixture before save and after restore; compare steady-state output within the tolerance in `docs/pad-pilot/vst-quality-gates.md`.
- Run pluginval strictness 10 and Steinberg extensive validation in Windows CI through `bun run validate:vst3`; retain logs as build artifacts.
- Add one corrupted and one previous-schema snapshot to prove fail-closed and backward-compatible behavior.
