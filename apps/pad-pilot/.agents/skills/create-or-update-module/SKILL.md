---
name: create-or-update-module
description: Create or refactor PadPilot Modules with SolidJS, public PadPilot APIs, StyleX, host-owned persistence, and verified audio-command coverage. Use for Module UI, audio controls, Generator/Analyzer consumers, or factory Module behavior.
---

# PadPilot Module Authoring

Work under `apps/pad-pilot/ui/src/modules`. A Module is a user-installable
TypeScript capability layer bundled with Bun; it never executes on Audio Thread.

## Boundaries

- Use public PadPilot capabilities. Factory Modules get no private bridge/native path.
- Store audio-critical state through `PadPilot.hooks.useModuleState`; C++ processor
  state remains canonical. `localStorage` is only for non-critical view prefs.
- Use `PadPilot.IO.importFile` for media. Persist returned path/name/content ID,
  never raw bytes or browser-only `File.path` assumptions.
- Map every audio-critical field to an actual bounded backend command. Clamp at
  command construction, not only in event handlers.
- Keep hot pointer/overlay/DOM state local. Use a module-private state/actions
  context when prop drilling crosses two component levels; do not expose raw setters.

## UI

- Reuse `@hyperfocus/ui` for generic overlay, dialog, tab, tooltip, popover, and
  preference behavior. Use PadPilot elements for knobs, meters, waveforms, MIDI,
  controller, host, skin, and managed-import semantics.
- Style new or touched presentation with StyleX and semantic/CSS-variable tokens.
  Do not add Tailwind, new CSS Modules, or cross-component selector overrides.
- Use flex/grid and `gap`; design for narrow plugin windows and keyboard/focus use.
- Use `<Show>` for meaningful Solid branches. Keep pure mappings in colocated helpers.
- Preserve PadPilot/Module/Preset terminology exactly.

## State proof

Before implementation, classify each field as `Audio-Critical`, `UI-Only`, or
`Derived`. Keep a `field -> command` checklist for every audio-critical field.
Missing backend coverage means remove or disable the control.

Tests must cover clamp/mapping helpers, exact command names/argument order,
provider lifecycle where used, and the primary DOM interaction. Verify audible or
observable backend effect for each affected control.

Run from repository root:

```powershell
bun.cmd run --cwd apps/pad-pilot typecheck
bun.cmd run --cwd apps/pad-pilot test:ui
bun.cmd run --cwd apps/pad-pilot test:plugin-contracts
```

Use the VST quality workflow when routing, wet/dry, bypass, gain, persistence, or
host compatibility changes.
