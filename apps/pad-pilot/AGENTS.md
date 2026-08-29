# PadPilot directives

Scope: `apps/pad-pilot`. Repository-level `AGENTS.md` also applies. Default to
`/caveman ultra` for user updates.

## Product language

**PadPilot**  
VST3 platform plugin. Host Modules. Manage Presets. Handle controller input,
scripting, UI, audio graph routing.

**Module**  
User-installable capability layer written in TypeScript, bundled with Bun.
Module define behavior, routing logic, UI panels, interactions with PadPilot APIs.
Never execute on Audio Thread.

**Preset**  
Saved mapping state inside Module. Preset define: button mappings, modifiers,
axis behavior, mode/state config.

Do not drift from these terms.

## Ownership

- `apps/pad-pilot`: JUCE/VST3/standalone host, QuickJS runtime, app UI, factory
  Modules, native validation, and host persistence.
- `apps/pad-pilot-marketplace`: HTTP, auth, billing, SQLite, uploads, releases.
- `packages/pad-pilot`: portable public identities, contracts, schemas, and
  bounded utilities. Import only manifest exports.
- `packages/ui`: generic Solid/StyleX interaction, overlays, focus, tokens, and
  preferences. It must not depend on PadPilot or audio/host concepts.
- `docs/pad-pilot`: canonical PadPilot audits, tasks, host gates, and guides.

Use direct relative imports inside an app. Cross-boundary imports require package
manifest exports; never restore private source aliases.

## Realtime rules

Inside `processBlock` (Audio Thread):

1. No allocation or container growth.
2. No locks.
3. No blocking, I/O, logging, OS polling, JSON, or protobuf work.
4. No JavaScript; QuickJS-NG runs only on Script Thread.
5. Preallocate in `prepareToPlay`.
6. Communicate through fixed-size lock-free FIFOs/atomics.

Threads: Audio owns DSP/graph reads; SDL input pushes to Script; Script runs
Module logic and pushes bounded commands; JUCE UI/WebView renders only.

Never mark native/audio work complete without a targeted allocation/thread-safety
review and applicable render tests.

## Build and code

- Windows baseline: VS 2022/MSVC v143, strict C++20, Windows 10 SDK; Release uses
  static `/MT`.
- JUCE, SDL2, and QuickJS-NG remain static `FetchContent` dependencies.
- Bun bundles Modules/UI. Modules use no Node-only APIs.
- Maintained/generated filenames use kebab-case; tests stay beside owners.
- Do not add explicit TypeScript implementation return types, unary `void` calls,
  casual casts, or hand-written store action interfaces.
- Build scripts live under `apps/pad-pilot/scripts`; after edits run app typecheck
  plus affected script tests.
- Standard builds must have zero PadPilot warnings.

## UI

- Use `@hyperfocus/ui` before duplicating generic interaction behavior. PadPilot
  wrappers own skins, audio controls, host semantics, and compatibility.
- Use StyleX for new or touched component presentation. Do not add CSS Modules;
  migrate touched legacy modules. Global CSS is limited to document/reset/vendor
  boundaries.
- Shared floating UI owns portal, Escape, focus, z-order, collision, and clamping.
- Prefer existing PadPilot elements over raw controls; promote repeated behavior.
- Buttons use `tooltip`, icon-only accessible naming, visible disabled state, and
  disabled cursor.
- Keep thin private view files folded into owners unless they define a real public
  primitive.

## State and public API

- Processor JUCE state is canonical. WebView/JS is a cache; changes flow through
  bridge then reflect back via host sync.
- `localStorage` is only for non-critical UI prefs.
- User Modules and factory Modules use the same public capabilities. No host/native
  behavior keyed to Module name or built-in status.
- Capability streams are opt-in, selected-Module-scoped, and bounded.
- Temporary public-API exceptions require an owned task under
  `docs/pad-pilot/tasks` with exit criteria and deadline.

Recut imports use public managed file import, persist managed copies plus plugin
fallback bytes, keep raw bytes out of UI/module state, and enforce 25 MiB in UI
and native paths.

Outside Audio Thread, important C++ actions/errors go to
`%APPDATA%/PadPilot/logs/padpilot-backend.log`. Never file-log on Audio Thread.

Factory Module changes must update `docs/pad-pilot/factory-modules.md` in the
same change. Long-term work belongs in `docs/pad-pilot/tasks`.
