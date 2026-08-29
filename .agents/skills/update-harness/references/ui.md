# Harness UI

Use this only for harness-specific UI ownership and integration. Read root
`DESIGN.md` and use `app-ui-standard` for the shared design system, panels,
preferences, responsive behavior, accessibility, and visual verification.

## Ownership

- Reuse or extend `packages/ui` for primitives, workbench behavior, preferences,
  transcript/composer surfaces, terminal UI, and other cross-app presentation.
- Keep harness product composition in `apps/harness/ui`; do not move persistence,
  agent lifecycle, credentials, filesystem access, or process control into UI packages.
- Existing harness-local primitives may migrate incrementally. Do not add a new local
  copy of a shared primitive or interaction contract.

## Solid and StyleX

- Use Solid component-owned roots for stores, memos, effects, and computations; do
  not create long-lived reactive computations at module scope.
- Use StyleX semantic tokens and `stylex.attrs`. Do not introduce Tailwind utilities,
  literal adaptive colors, native `title` tooltips, or bespoke overlay shells.
- Extend shared primitives when a required interaction is missing. Shared primitives
  and major containers expose stable kebab-case `data-test-*` hooks.

## Harness-specific behavior

- App shortcuts registered through TanStack Hotkeys must be visible in the hotkey
  preference model unless the call site documents why they are fixed.
- Render user-facing times through `apps/harness/ui/src/lib/time-format.ts`; keep raw
  ISO strings for transport, persistence, and sorting only.
- Surface caught UI and command failures through the shared toast path.
- Chat and answer textareas use Enter to send and Shift+Enter for a newline unless a
  local workflow documents a conflicting convention.

Verification and completion criteria live in `DESIGN.md`; do not repeat them here.
