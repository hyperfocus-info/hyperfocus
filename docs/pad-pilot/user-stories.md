# PadPilot User Stories

Canonical outcome inventory for the PadPilot app and public Module framework.
Shipped behavior remains documented in the nearest app or package README; this
file gives each durable user outcome a stable identity. Update the matching row
in [coverage-matrix.md](coverage-matrix.md) whenever a shipped story changes.

## Musicians and producers

PP-NAV-001: As a producer, I search, favorite, select, collapse, and restore the
Module list so I can reach the capability I need without losing workspace space.

PP-MODULE-001: As a producer, I create a starter Module with a valid identity,
edit its starter state, and reopen the editor without losing that state.

PP-MODULE-002: As a producer, I install a valid Module bundle and receive a clear,
recoverable error when the bundle is missing, malformed, unsafe, or incompatible.

PP-MODULE-003: As a producer, I reopen a project whose Module bundle is absent or
changed and keep its inert state and Presets until the compatible bundle returns.

PP-PRESET-001: As a producer, I create, select, update, and restore Module Presets
without one Module reading or overwriting another Module's data.

PP-INPUT-001: As a controller user, I inspect connected devices, choose layouts,
calibrate mappings, and persist controller preferences by stable hardware identity.

PP-STATE-001: As a DAW user, I save and reopen a session and recover canonical
Module, Preset, controller, imported-media, and editor state from the plugin.

PP-UPDATE-001: As a user, I discover a compatible signed PadPilot update, choose
a channel, stage it safely, and receive actionable failure or restart guidance.

PP-ACCESS-001: As a keyboard or assistive-technology user, I operate shared
controls and overlays with visible focus, accessible names, Escape behavior, focus
return, and layouts usable at normal and narrow plugin sizes.

PP-AI-001: As a producer or Module author, I request bounded AI assistance through
the public agent service, cancel it safely, and receive actionable errors without
factory-only bridge contracts.

## Factory Module outcomes

PP-FX-001: As a producer, I build, audition, automate, save, and restore an FX
graph whose visible controls map truthfully to bounded native DSP.

PP-RECUT-001: As a producer, I import a bounded sample through managed media,
create and edit chops, trigger held slices, and restore the lightweight project state.

PP-GENERATOR-001: As a producer, I turn musical intent into bounded valid MIDI,
revise suggestions, inspect progress, and drag or download the resulting file.

PP-ANALYZER-001: As a producer, I capture pitch and harmonic evidence, adjust
analysis settings, preserve the bounded take summary, and export valid MIDI.

PP-EDITOR-001: As a producer, I map controller input to validated MIDI, keyboard,
and automation actions and persist those mappings per profile.

PP-PERFORMANCE-001: As a performer, I play scale-aware notes from a controller,
change octave and profile, and release every held note across lifecycle changes.

## Module authors

PP-AUTHOR-001: As a Module author, I define and validate one portable manifest
from public `@hyperfocus/pad-pilot` exports without importing app-private source.

PP-AUTHOR-002: As a Module author, I start from a documented bundle layout and
public runtime contract, then typecheck and test my Module before installation.

PP-AUTHOR-003: As a Module author, I request explicit capabilities and receive
only selected-Module-scoped handles; unavailable operations fail explicitly.

PP-AUTHOR-004: As a Module author, I persist versioned Module state through the
host authority while keeping view-only state and raw media bytes out of host sync.

PP-AUTHOR-005: As a Module author, I use public controller, analyzer, MIDI, host
tempo, agent, file-import, sample, and FX services through bounded contracts.

PP-AUTHOR-006: As a Module author, I rely on factory Modules using the same public
capabilities and lifecycle rules available to installed Modules.

PP-AUTHOR-007: As a Module author, I get a safe default: QuickJS work stays on the
Script Thread, external UI code fails closed without the explicit development-only
override, and the Audio Thread never executes Module JavaScript.

## Host and framework operators

PP-HOST-001: As a plugin operator, I run PadPilot without allocation, locks,
blocking, I/O, or JavaScript in `processBlock`, including during graph replacement.

PP-HOST-002: As a support engineer, I diagnose important non-realtime native
actions and failures from the bounded rotating backend log without touching audio.

## Verification

The [coverage matrix](coverage-matrix.md) owns story-to-proof mapping. Package
expectations also live in [Package Testing](../package-testing.md); native and DAW
acceptance lives in [VST quality gates](vst-quality-gates.md).

Related: [Module author guide](module-author-guide.md), [factory Modules](factory-modules.md),
and [repository story map](../user-stories.md).
