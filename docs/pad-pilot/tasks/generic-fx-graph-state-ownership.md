# Generic FX Graph State Ownership

Owner: PadPilot core/runtime

Deadline: 2026-09-30

Status: Resolved 2026-08-29

## Problem

The public `fx-graph` capability authorizes selected ready Modules generically, but several native state and media paths still key behavior to the factory Module ID `fx`. This is a temporary public-API exception: a user-created Module declaring the same capability cannot yet own the same graph, Preset, visualizer, automation, and imported-IR lifecycle.

## Exit criteria

- Resolve one selected FX graph owner by ready Module capability, never factory status or Module name.
- Store accepted revision and serialized `FxChainState` under that owner Module ID.
- Apply Presets and restored state for any valid selected `fx-graph` owner.
- Scope visualizer frames, automation reconciliation, and managed IR recovery to the same owner.
- Preserve isolation when switching between two different FX-capable Modules and between FX/non-FX Modules.
- Add native processor-level save/restore coverage using a non-factory FX-capable Module record.
- Add a contract that rejects new runtime branches keyed to `kFxModuleId` where capability ownership is required.
- Remove this exception from the audit and public API documentation.

## Resolution

The processor now resolves the selected ready `fx-graph` capability owner once
and uses that Module ID for graph state, revisions, Presets, visualization,
automation, persistence, and managed-media healing. Switching owners preserves
isolated graph revisions; reinstalling the selected owner refreshes capability
ownership; and first selection creates canonical default graph state.

`padpilot-processor-tests` installs two non-factory FX Modules and proves
selection isolation plus `getStateInformation`/`setStateInformation` roundtrip
through a fresh processor. Native source contracts reject renewed factory-ID
coupling in ownership-sensitive processor files.
