# Hyperfocus Application Design Standard

This document is the source of truth for Hyperfocus application UI. It applies to
the harness, engine editor, and future first-party apps. It does not constrain the
Hyperfocus engine or third-party engine consumers: engine APIs, project formats,
rendering loops, and command surfaces remain framework-agnostic.

## Product principles

### Let data drive the form

Choose presentation from the meaning of the data, not from a generic card or
table template.

| Data | Default presentation |
| --- | --- |
| Categorical state | Semantic status chip, segmented control, or compact filter |
| Numeric value | Right-aligned tabular numerals, a visible unit, and a valid range |
| Events over time | Timeline or event stream; summarize before exposing raw logs |
| Hierarchy | Tree with keyboard navigation and persisted expansion state |
| Spatial/game data | Canvas with contextual overlays and explicit layer controls |
| Diagnostics | Severity summary, affected object, recovery action, then details |
| Large collection | Virtualized list with stable selection and row actions |
| Optional expert data | Disclosure, popover, inspector section, or command action |

Color and icons communicate a semantic role. They must not be the only way that
role is communicated.

### Reveal complexity progressively

Keep the primary action and the data needed for the current task visible. Put
secondary actions in responsive action groups, row hover/focus affordances,
popovers, or menus. Put specialist settings in real disclosures whose content is
removed from navigation when closed.

Use this disclosure order:

1. Primary task and current status.
2. Frequent contextual actions.
3. Secondary actions in an overflow or popover.
4. Advanced configuration in a disclosure or dedicated surface.
5. Raw data and logs after a human-readable summary.

Each surface has one primary focus. Supporting panes, badges, and controls must
remain legible without competing with that focus; decorative emphasis does not
earn hierarchy. Minimal layouts still retain enough labels, status, and guidance
to make the current task and the product's purpose clear.

### Design the invisible UI

Every interactive surface includes its hover, focus, keyboard, disabled,
loading, empty, error, success, and recovery behavior. Icon-only and ambiguous
controls have a shared tooltip and accessible name. Overlays share Escape and
focus-return behavior. Important workflows have contextual, re-openable guidance
that observes actual completion instead of merely advancing slides.

### Document user outcomes

Every first-party UI surface has a user-story owner routed through
[docs/user-stories.md](docs/user-stories.md). Shared reusable UI components use
[packages/ui/user-stories.md](packages/ui/user-stories.md). Material UI changes
must update the matching story entry in the same change; harness UI changes also
update the harness coverage matrix when a shipped `US-*` story changes.

## Semantic design tokens

Applications consume the shared `@hyperfocus/ui` semantic tokens. App code may
define product branding, but must not introduce a second vocabulary for basic UI
roles.

Required roles include canvas, surface, raised surface, overlay, border, text,
muted text, accent, focus, selection, information, success, warning, danger,
disabled, and scrim. Tokens also cover type families, tabular numerals, spacing,
radii, elevation, density, and motion duration/easing.

- Do not name reusable tokens after a literal color such as `cyan` or `violet`.
- Do not hard-code adaptive foreground, background, or status colors in app UI.
- Respect `prefers-reduced-motion` and the shared user preference.
- Focus indicators have at least a two-pixel visible outline with sufficient contrast.
- Dense application controls remain at least 28px high; primary controls are at
  least 36px. Touch layouts use at least 44px targets.

## Workbench and panel contract

Every persistent workbench pane is declared through the shared panel system and
has an id, label, axis, minimum/default/maximum size, collapse mode, and
persistence scope. Cards, dialogs, tooltips, and transient popovers are not
workbench panes.

Persistent panes must:

- be pointer-resizable without starving the primary pane;
- expose an accessible separator with current/minimum/maximum values;
- support Arrow, Shift+Arrow, Home, End, Enter, and double-click reset;
- provide an always-reachable collapse/restore action;
- clean up pointer capture on cancel or lost capture;
- persist a versioned, clamped layout through an app-owned adapter;
- become a drawer, sheet, or explicit mode at narrow widths rather than forcing a
  wide horizontal canvas.

## Preferences and settings

All first-party apps use the shared preference registry and surface. Definitions
provide a stable id, section, scope, title, description, search keywords, control
type, default value, and normalization.

Scopes are:

- `shared-user`: appearance, accessibility, density, numeric alignment, and
  cross-app interaction preferences;
- `app-user`: app layout, panel visibility, default workspace, and app behavior;
- `project`: portable game/project behavior such as target profile, locale,
  gameplay input, and game audio;
- `session`: temporary selections, popovers, peeks, and permissions.

Changing app chrome must never dirty project data or enter project undo history.
Project settings remain portable and framework-neutral.

## Responsive behavior

At narrow widths, preserve one fully usable primary pane. Secondary panes move to
drawers/sheets or explicit modes. Do not solve narrow layouts by setting a large
minimum width or shrinking three panes until none is usable.

Resizable panes respond to their own rendered width, not only to the browser
viewport. Use container-aware layout changes so action groups wrap or collapse,
multi-column content becomes a readable single column, and no text, input, badge,
or panel overlaps or clips at supported minimum sizes. Verify full-screen desktop,
narrow viewport, user-resized pane extremes, browser zoom, and increased base font
scaling. Inputs, status badges, foreground text, and text over imagery must retain
sufficient contrast in every supported theme and state. Align labels, fields, and
actions to a consistent local grid; avoid ornamental borders that imply hierarchy
or state without meaning.

## Contribution acceptance

A material UI change is complete only when it:

- uses shared tokens and primitives or documents why a new primitive is needed;
- identifies the data-to-form mapping;
- declares preference ownership and panel behavior;
- works with pointer, keyboard, and focus-visible navigation;
- covers desktop and narrow layouts;
- verifies loading, empty, error, disabled, and recovery states where relevant;
- updates the owning user-story document for material user-visible behavior;
- includes focused interaction tests and visual evidence for user-visible changes.
