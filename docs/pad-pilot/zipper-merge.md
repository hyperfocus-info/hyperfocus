# PadPilot zipper-merge audit plan

Status: first migration slice executed on 2026-08-29. This document remains the
canonical audit ledger and proof plan for remaining zipper slices.

## Outcome

Bring PadPilot into Hyperfocus as a first-party `apps/*` surface while preserving
its VST3 realtime, persistence, Module, Preset, marketplace, and validation
contracts. Merge documentation, skills, and UI primitives by ownership and
behavior—not by copying duplicate trees.

Both source worktrees were committed before relocation. The source repository is
kept as a recoverable archive while Hyperfocus becomes the canonical owner.

## Baseline evidence

This inventory records the pre-import state used to choose the first zipper
slice. The applied state is summarized under [Decisions applied](#decisions-applied).

- PadPilot source snapshot: commit `d10dae4` in
  `C:\Users\MindOverMelee\pad-pilot`.
- Hyperfocus pre-import snapshot: commit `97f7934` in
  `C:\Users\MindOverMelee\hyperfocus`.
- PadPilot uses `MindOverMelee Source-Available License 1.0`; Hyperfocus uses
  `Hyperfocus Source-Available Game License 2.0`. The imported PadPilot apps and
  package retain their nested license instead of being silently relicensed.
  Copyright, third-party notice, and bundled-asset provenance still need
  file-level review.
- PadPilot already uses package name `@hyperfocus/pad-pilot`, but  internal imports
  expose private source paths such as `@hyperfocus/pad-pilot/ui/src/...` through
  TypeScript aliases. Hyperfocus explicitly forbids aliases masking package
  ownership gaps.
- Imported PadPilot UI had 431 files, 22 element CSS Modules, 18 Module CSS
  Modules, and no StyleX components. Hyperfocus has a compiled Solid/StyleX pipeline, semantic
  tokens, overlay stack, preference registry, workbench layout, and shared UI
  package.
- Primitive names overlap only at `Button`, `ButtonGroup`, `Toast`, and `Tooltip`,
  but behavior overlaps more broadly: PadPilot `Modal`, tabs, dropdowns,
  searchable combobox, floating layer, and preference panel map to Hyperfocus
  dialog, tabs, action menu/popover, overlay stack, and preferences.
- PadPilot-specific primitives include knob, meter, waveform, MIDI export/drag,
  note heatmap, host BPM, controller macro, and managed file import behavior.
- Four Caveman skill entry files are exact duplicates. PadPilot-specific
  correctness, Module authoring, Generator, UI element, UI test, and VST quality
  skills contain unique product knowledge worth retaining.
- PadPilot CMake and build scripts resolve paths relative to the PadPilot project
  root. Moving the complete app under `apps/pad-pilot` is feasible before deeper
  package extraction.

## Preliminary ownership model

This is an audit hypothesis, not a final package interface.

```text
apps/
  pad-pilot/                 VST3/standalone host, native runtime, app UI,
                             factory Modules, app build and host validation
  pad-pilot-marketplace/     optional separate SaaS deployment boundary

packages/
  ui/                        generic Solid interaction, accessibility,
                             overlays, semantic tokens, preferences
  pad-pilot-*/               only if public Module consumers need installable,
                             manifest-backed SDK/UI contracts

docs/pad-pilot/              product roadmap, audits, tasks, host guides
```

Host apps own privileged filesystem, JUCE, process, persistence, credential, and
network adapters. Shared packages own portable contracts and presentation only.
Nothing moves QuickJS, JSON/protobuf work, allocation, locks, logging, or I/O onto
the Audio Thread.

## Audit lanes

### 0. Freeze provenance and establish baselines

1. Make recoverable checkpoint commits/tags or external patches for both current
   worktrees.
2. Record selected source commit, dirty snapshot policy, origin URL, excluded
   outputs, ignored secrets, generated files, binary fixtures, and asset licenses
   in `docs/migration/provenance.md`.
3. Inventory tracked, untracked, ignored, generated, and build-only files. Reject
   nested Git metadata, dependencies, caches, secrets, local databases, and build
   output.
4. Capture baseline commands and results before paths change: UI, marketplace,
   scripts, native tests, Release build, pluginval, Steinberg validator, and FL
   Studio gates. Mark unavailable gates unproven.

Gate: exact migration input is recoverable; failures are known before relocation.

### 1. Build a retain/merge/replace inventory

Create one ledger covering every PadPilot top-level area and every overlapping
Hyperfocus abstraction. Each row records owner, consumers, public surface,
thread/process boundary, persistence authority, tests, docs, skills, generated
artifacts, action (`retain`, `merge`, `replace`, `retire`), and proof needed.

Minimum domains:

- native processor, audio graph, QuickJS runtime, controller input, updater;
- bridge contracts, protobuf schemas/codecs, dev-host simulator;
- Module SDK, factory Modules, Presets, managed media;
- app shell, marketplace, Generator AI path, synaesthetic evaluator;
- primitives, preferences, overlays, styling, test harness;
- scripts, validation fixtures, CI/release, docs, AGENTS rules, skills.

Gate: no file moves without a ledger owner and verification route.

### 2. Confirm app and package boundaries

Audit three topology decisions:

1. `apps/pad-pilot` as one self-contained first slice.
2. Marketplace kept inside that app or promoted to
   `apps/pad-pilot-marketplace` because it has separate deployment, credentials,
   SQLite, billing, uploads, and scaling constraints.
3. Public Module API kept app-local initially or extracted into installable
   manifest-backed packages. If extracted, separate framework-neutral host/module
   contracts from Solid presentation bindings so non-UI consumers avoid Solid.

Evaluate existing Hyperfocus reuse:

- `@hyperfocus/ui`: overlays, focus, dialogs/popovers, tokens, preferences,
  workbench behavior;
- `@hyperfocus/ai-core`: typed Harness transport for Generator/agent work;
- `@hyperfocus/workspace`: safe portable file/task contracts where managed Module
  workflows fit; JUCE media persistence remains host-owned;
- `@hyperfocus/desktop-runtime`: update-source/version policy where compatible;
  signed VST patch application remains PadPilot-owned;
- `@hyperfocus/performance`: environment/evidence metadata, not Audio Thread DSP.

Gate: dependency arrows match `docs/architecture.md`; no alias-based private
cross-boundary imports remain in the target design.

### 3. Merge documentation by canonical owner

Build a doc crosswalk before copying prose.

- Root `README.md`: add PadPilot to app map; keep only product summary/commands.
- `docs/architecture.md`: add native host, WebView bridge, Script/Input/Audio/UI
  thread boundaries, and package arrows.
- `docs/distribution.md`: add VST3, standalone, marketplace, update, and validation
  artifact ownership.
- `docs/user-stories.md`: add PadPilot surface and coverage owner.
- `docs/pad-pilot/README.md`: route audits, tasks, host validation, factory Module,
  capability, and marketplace docs.
- `apps/pad-pilot/README.md`: own shipped behavior and local commands.
- nearest native/UI/marketplace READMEs: own implementation-local contracts.
- `apps/pad-pilot/AGENTS.md`: retain exact PadPilot/Module/Preset language,
  realtime golden rules, persistence rules, public API discipline, C++ build
  constraints, and backend logging rules.
- Remove duplicated rules and replace duplicate explanations with links. In
  particular, collapse repeated Recut import and backend logging sections.
- Update `docs/migration/provenance.md` and status when each slice lands.

Gate: every fact has one owner, every new permanent doc has an inbound route,
and documentation-policy tests cover the PadPilot graph.

### 4. Merge skills by scope, not filename

Create a skill crosswalk including trigger, scope, required references/scripts,
hard-coded paths, duplicated content, and post-move verification.

- Do not copy exact Caveman duplicates.
- Keep PadPilot correctness, VST quality, Generator audit, Module authoring, and
  PadPilot UI workflows app-local under `apps/pad-pilot/.agents/skills`.
- Merge behavior-first UI testing guidance into the narrowest reusable Hyperfocus
  UI testing workflow; keep PadPilot host/bridge cases in app-local references.
- Reconcile PadPilot element-authoring rules with `app-ui-standard`: preserve host
  prop forwarding, audio-widget semantics, controller accessibility, and
  host-safe behavior; adopt Hyperfocus tokens, overlay ownership, state scopes,
  and visual acceptance gates.
- Evaluate generic architecture/TDD/grill skills once at root scope; do not fork
  copies into each app.
- Move helper scripts with their owning skill or app, rewrite paths, and add a
  lightweight skill integrity check for broken links and missing scripts.

Gate: each workflow has one canonical copy per intended runtime scope and works
after source paths move.

### 5. Merge primitives through behavior matrices

For every overlapping control, compare props, events, keyboard/focus behavior,
overlay collision/clamping, disabled/loading/error states, accessibility, theme,
skin slots, lifecycle cleanup, and tests.

Classify controls:

- shared generic: buttons, button groups, dialogs, tabs, tooltips, popovers,
  overlays, toasts, fields, toggles, comboboxes, drawers, preferences;
- PadPilot domain: knob, meter, waveform, MIDI controls, note heatmap, host BPM,
  controller macro, managed file import;
- app composition: Module-specific panels and branded layouts.

Preferred direction: `@hyperfocus/ui` owns generic interaction/accessibility and
StyleX token integration. PadPilot wrappers own product branding, skins, audio
semantics, and Module-author-facing compatibility. Do not make generic primitives
depend on PadPilot, JUCE, host state, or audio concepts.

Migrate one primitive family per zipper slice:

1. add boundary/interaction parity tests;
2. deepen shared behavior behind the smaller public contract;
3. migrate PadPilot callers;
4. preserve compatibility exports where public Modules need them;
5. delete superseded implementation/tests instead of layering duplicates;
6. verify desktop, narrow plugin window, zoom, keyboard, focus, and host WebView.

Gate: zero duplicate behavior owner; no visual rewrite without behavior parity.

### 6. Deepen public Module and host boundaries

Audit these coupled clusters before proposing interfaces:

1. Host bridge + transport + provider + dev simulator
   - Coupling: shared state, queues, native promises, capability streams.
   - Dependency: local-substitutable through dev/in-memory transport.
   - Test impact: replace private/source tests with transport-boundary lifecycle,
     backpressure, revision, and recovery tests.
2. Generic overlay + floating controls + modal/tooltip/dropdown behavior
   - Coupling: portal ownership, collision, Escape, focus return, z-order.
   - Dependency: in-process DOM.
   - Test impact: one shared overlay boundary suite replaces duplicate control
     mechanics tests.
3. Preferences + local UI state + processor-owned state classification
   - Coupling: several localStorage helpers and app-specific preference panels.
   - Dependency: local-substitutable storage adapter.
   - Test impact: scope/normalization/persistence boundary tests replace per-callsite
     storage tests; audio state stays excluded.
4. Generator agent execution + marketplace Codex endpoint + Harness
   - Coupling: duplicate model/endpoint/settings/timeout/response logic.
   - Dependency: remote-but-owned port and adapters.
   - Test impact: typed request/result and cancellation tests at one portable port.
5. Marketplace HTTP + SQLite/file storage domains
   - Coupling: auth, billing, catalog, upload, release, admission control.
   - Dependency: local-substitutable SQLite/filesystem plus mocks for Clerk/Stripe.
   - Test impact: domain boundary tests retain transaction behavior while HTTP
     composition remains thin.

After inventory, present these as ranked deep-module candidates. Design alternate
interfaces only for candidates explicitly selected for implementation.

### 7. Execute zipper slices

Each slice must leave Hyperfocus buildable and own code, docs, tests, and migration
notes together.

1. Provenance + checkpoints.
2. Relocate PadPilot unchanged to `apps/pad-pilot`; make app-local commands pass.
3. Add root workspace/scripts/version/repository-size/license integration.
4. Establish marketplace boundary selected above.
5. Replace TS path aliases with manifest exports and direct internal imports.
6. Merge docs and scoped AGENTS/skills.
7. Merge generic primitive families one by one.
8. Extract public Module contracts only after consumers and package tests define
   the boundary.
9. Reuse Hyperfocus AI/workspace/preferences/update abstractions where behavior
   matrices prove fit.
10. Add release/CI artifacts and retire standalone PadPilot repository only after
    parity and rollback proof.

### 8. Verification gates

Every relevant slice:

- Hyperfocus repository size, source structure, code style, lint, typecheck, tests,
  docs policy, release readiness, and builds;
- PadPilot UI interaction/acceptance tests and public Module consumer smoke test;
- marketplace tests with temporary SQLite/filesystem and mocked external services;
- proto generation idempotence and C++/TypeScript schema compatibility;
- native unit/render tests; Debug and Release builds with zero PadPilot warnings;
- explicit Audio Thread review: no allocation, locks, blocking, logging, I/O,
  protobuf/JSON, or JavaScript;
- processor state save/restore and managed-media healing;
- pluginval strictness 10 and Steinberg extensive validation;
- FL Studio 2026 primary and FL Studio 21 compatibility renders/manual matrix;
- artifact/update signing path and installed VST3 smoke test.

Final gate: target monorepo is sole canonical source; source repo remains a
recoverable archive; no compatibility facade silently owns divergent behavior.

## Main risks

- Dirty-tree loss or accidental omission during snapshot.
- Big-bang path rewrite hiding behavior regressions.
- `@hyperfocus/pad-pilot` name collision between app and public SDK.
- StyleX/CSS Module build-pipeline conflict inside embedded JUCE assets.
- UI-owned defaults overwriting processor state during hydration.
- Generic UI package absorbing PadPilot/audio/host concepts.
- Marketplace credentials/network concerns leaking into plugin runtime.
- Release gate becoming impractically all-or-nothing; use fast, native, host, and
  release tiers while retaining strongest final gate.
- Generated protobuf and FL fixtures creating noisy history or stale artifacts.

## Decisions applied

1. Exact local state was committed in both repositories; no extra tag/checkpoint.
2. Marketplace is a separate `apps/pad-pilot-marketplace` deployment boundary.
3. Relocation parity was proven first; portable identities, schemas, limits, and
   bounded utilities were then extracted to `packages/pad-pilot`.
4. Hyperfocus's combined Solid/StyleX compiler is the UI build owner. Shared
   elements, app chrome, and all branded Module surfaces now use colocated
   StyleX; no CSS Modules remain under PadPilot UI source.
5. PadPilot's 1.0 license remains attached to both apps and the public package;
   Hyperfocus root licensing and release checks explicitly route that boundary.
