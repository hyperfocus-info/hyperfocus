# Generic FX Graph State Ownership

Owner: PadPilot core/runtime

Deadline: 2026-09-30

Status: Open

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
