# Hyperfocus Application Design Standard

This document is the source of truth for Hyperfocus application UI. It applies to
the harness, engine editor, and future first-party apps. It does not constrain the
Hyperfocus engine or third-party engine consumers: engine APIs, project formats,
rendering loops, and command surfaces remain framework-agnostic.

The [visual constitution](docs/design-system/visual-constitution.md) owns compact
visual principles. The [visual system](docs/design-system/README.md) routes tokens,
canonical controls, responsive compositions, reference screenshots, and validation.

## Taste and approval

Use these contracts and explicit user-approved references as defaults. The visual
system's evidence pages label implementation candidates; those screenshots are
not approvals. Search the affected surface and recorded feedback before making
a material composition, density, motion, or copy choice.

If the references disagree, present the actual alternatives. For example: show
the two inspector layouts and ask whether this task needs compact fields or more
space around the primary workflow. Do not ask for abstract style adjectives or
reopen settled control behavior. Continue independent functional work while a
necessary taste decision is pending.

Apply the [decision recording rule](docs/documentation-governance.md#subjective-decisions):
task preference stays local; product preference belongs to its owner; a reusable
shared decision updates this standard or the relevant visual-system reference,
with approval evidence and scope. Human feedback remains versioned through
[artifact review](scripts/artifact-review/README.md) when that workflow is used.

## Product principles

### Compose the task before styling controls

The system consists of atomic controls, semantic tokens, domain compositions and
quality constraints. Controls and tokens alone do not establish a usable screen.
Follow **intent → surface type → canonical composition → semantic content → validation**.
Resolve information architecture, composition, hierarchy, interaction and responsive
behavior before typography/spacing and decoration. Group by user intent and audience;
internal capabilities do not become primary navigation because they exist.

Start from the [composition routes](docs/design-system/README.md#choose-a-route),
then fill meaningful slots. Enforce demonstrated failures at the owning API or
validator: bounded complexity, explicit priority/availability, stable focus and
truthful completion. A lesson supplies observed success and corrective feedback;
an action list supplies semantic actions. Do not replace these contracts with
arbitrary markup followed by repeated visual repair.

Keep foundation mechanics, domain composition and product theme distinct. Promote
a rule or primitive for two named consumers or a demonstrated recurring failure;
approved product taste retains its original scope. Visual review still checks
composition, hierarchy, identity and consistency; passing constraints is necessary
but does not establish taste approval. Prefer bounded repairs that preserve
accepted decisions, and defer unrelated features.

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

### Respect limited attention

Application identity is authored data: every app has a logo, favicon, app icons,
asset manifest and social-preview metadata. Preserve established identities;
the approved missing-logo default is a simple SVG in the app's current colors
(user choice, 2026-10-26). Logo and Open Graph fields belong in editable project
preferences, with supplied-logo replacement and generated renditions. Use the
[branding contract](packages/branding/README.md) and shared
`@hyperfocus/ui/branding` fields. Image editing remains on the
[editor roadmap](apps/engine-editor/example-workspace/README.md#next-capabilities).

Use the fewest words and elements that make the task clear. Arrange a natural
reading order: current context, essential data, then the next action. Each active
view has **at most one primary action**; a read-only view need not invent one.
A modal becomes the active view; its background must not compete for attention.
Use quiet secondary actions and contextual menus instead of rows of accent buttons.

**Avoid subtitles by default.** Do not narrate what a heading, control or section
already says. A hero, landing, empty or error state may retain a short sentence
only when it materially explains purpose, recovery or the next decision. Keep
required field instructions, units, active filters, unsaved state and actionable
errors visible. Move optional explanations, export semantics, shortcuts and verbose
scope summaries into a nearby named disclosure, drawer, dialog or tooltip.
Printed/exported reports still include the context needed to interpret their data.

Prefer icon-only controls when recognition stays clear in context (close, search,
play, print); retain text for unfamiliar, ambiguous or consequential actions.
Icon-only controls require an accessible name, hover/focus help and touch-sized
targets. A tooltip does not repair an unintelligible icon.

The navbar's app logo and name form one home control, with pointer cursor, hover
and focus feedback. Use a link for a URL destination or a button for in-app home
navigation. Preserve drafts and existing unsaved-change guards. All buttons use
`cursor: pointer`, including disabled buttons; disabled semantics and appearance
still prevent activation. Text inputs and resize handles retain their own cursors.

Approved by the user's cross-project request on 2026-10-26. Examples: disclose
Books' long report scope and CSV explanation; remove the album's always-visible
viewing instructions. The 2026-10-28 Books audit and approved repair remove its
generic bookkeeping tagline from the working ledger to give records more space.
This applies to first-party apps, repository examples, generated templates and
the user's local album generators. [Research and audit](docs/design-system/attention.md)
record the supporting evidence and verification limits.

### Reveal complexity progressively

Use the [navigation, settings and form contract](docs/design-system/navigation-settings.md)
for unique grouped navbar commands, settings workspaces and shortcuts, drawer/Escape
ordering, normal-weight input values, aligned form actions and bounded dialogs.
It incorporates the user's Books corrections and Harness settings reference.

Keep the primary action and the data needed for the current task visible. Put
secondary actions in responsive action groups, row hover/focus affordances,
popovers, or menus. Put specialist settings in real disclosures whose content is
removed from navigation when closed.

Keep secondary actions inside the element they operate on: a tab's close control
belongs within its tab, and an option's favorite toggle belongs beside that option.
Reserve their space to avoid movement. Reveal them when the pointer enters the
containing row or it has keyboard focus; expose them on touch/coarse-pointer
layouts and keep selected state visible. Never hide critical actions or errors,
and never require hover to discover the only way to finish a task. Shared
`data-hf-reveal-group` / `data-hf-contextual-action` styling owns this behavior.
This records the user's Books correction on 2026-10-27; visual acceptance of a
particular implementation remains separate.

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

App-level failures must leave an independent escape route. Use `RecoveryNotice`
for dismissible failure messages; dismissal changes presentation, never saves or
discards data. Keep unsaved status separately reachable. Opening Preferences,
downloading retained work, and closing recovery must not depend on the failing
storage/network operation. A workbench render boundary must leave recovery tools
outside that boundary. Verify failure, failed retry, dismissal, navigation, and
successful recovery with injected faults in a real consumer before shipping a
changed recovery flow. Destructive reset is a separately confirmed last resort,
with exact scope and account identity; it is not the normal error exit.

Every interactive surface includes its hover, focus, keyboard, disabled,
loading, empty, error, success, and recovery behavior. Icon-only and ambiguous
controls have a shared tooltip and accessible name. Overlays share Escape and
focus-return behavior; host adapters forward the surface and trigger to that
owner. Popovers stay within the viewport and scroll enlarged content while
retaining the type scale. Important workflows have contextual, re-openable guidance
that observes actual completion instead of merely advancing slides.

Clickable actions and navigation use `cursor: pointer` and a visible
background change on hover. Shared controls own these states, retain semantic
primary/danger colors and focus-visible rings, and suppress hover feedback when
disabled; avoid a global hover fill that overrides them. Resize handles and text
editing retain their purpose-specific cursors. Clear text labels, especially
navigation and menu items, do not get redundant tooltips. Keep shared tooltips
for icon-only or ambiguous controls and useful information hidden by truncation.
This Hyperfocus-wide preference comes from the user's Books feedback on
2026-10-25: tooltips were intrusive in navigation, while menu hover backgrounds
and pointer cursors should be standard. For example, “Library” needs no tooltip
repeating “Library”; an icon-only action still needs a name and tooltip.

Generic tooltip hosts share the interaction owner in `packages/ui`: moving from
the trigger onto the bubble keeps help visible, focus also retains it, and Escape
dismisses only the newest overlay. Tooltip descriptions add their own ID to
`aria-describedby` and remove only that ID; help/error associations survive
show, hide, caller updates and cleanup. Host skins adapt presentation without
copying the interaction lifecycle.

Data tables support sorting meaningful columns, choosing visible columns and
reordering them, with keyboard controls and a reset. Hosts persist layouts by
table identity; sorting does not mutate source order. Use the shared
`@hyperfocus/ui/data-table` contract. Explain abbreviations and metrics on hover
and keyboard focus, including units, interpretation and measurement limits.
Long-running work exposes its actual phase, measured or indeterminate progress,
last update, errors, logs and recovery. Completion requires the promised result.
These defaults reflect the user's explicit Hyperfocus-wide request of 2026-10-25;
the album and track tables are the initial consumers.

Training workspaces follow the [Practice contract](docs/design-system/practice.md):
task setup, a clear working area, optional bounded instruments and observed feedback.
Keep configuration separate from live coaching, and preserve input ownership when
moving between them.

Tutorials follow the [learning composition contract](docs/design-system/tutorials.md):
objective, observable steps, input and timing, demonstration, correction and
automatic completion. `@hyperfocus/ui/tutorial` supplies the reusable coach and
attempt state; each host supplies real evidence and reversible demonstrations.

### Standardize selection controls

First-party applications do not use native HTML `select` elements. Use the shared
selection control so labels, descriptions, filtering, overlay placement, and focus
behavior stay consistent with project chat.

- For eight or fewer choices, opening the control shows the complete list. Do not
  add search, pagination, or virtualization to a small choice set.
- For more than eight choices, show type-ahead search. Forward each query change
  immediately when the host supplies streamed or remote results, and keep loading,
  empty, and recovery states in the same overlay.
- Add tag filters when they expose meaningful categories; do not manufacture tags
  merely to decorate the control.
- Each option has a stable value and concise label, with an optional icon,
  explanatory sublabel, search keywords, tags, and disabled state. Put important
  tradeoffs or disabled reasons in the sublabel; use a tooltip for the selected
  option or compact trigger when that context is otherwise hidden.
- The trigger has an accessible name. The popup uses listbox and option semantics,
  exposes selection and disabled state, supports Arrow keys, Home, End, Enter,
  Escape, and visible focus, and returns focus to its trigger after a choice or
  dismissal. Tabbing away closes the popup without trapping focus.
- Clamp the popup to the viewport, bound its height with scrolling, preserve at
  least 44px touch targets in touch layouts, and let the trigger and popup fit the
  available pane width without horizontal page scrolling.

Selection controls represent one chosen value. Use a segmented control when a
small categorical state benefits from every choice remaining visible, and use an
action menu when invoking commands rather than choosing durable state.

Action menus open below the trigger and align to its start edge by default.
Trailing toolbar/account controls may explicitly request end alignment. Shared
popover geometry clamps both edges to the viewport and flips above when needed;
hosts must not simulate anchoring with offsets. This Hyperfocus-wide rule follows
the user's Books menu-alignment feedback on 2026-10-26. Books navigation and the
shared ActionMenu tests retain the placement and keyboard evidence.

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
- Pair accent/status backgrounds with their semantic foregrounds. Validate the
  colors actually consumed by controls, including hover, muted text and status
  chips. Normal text needs 4.5:1; a 3:1 non-text check does not certify button
  labels. Disabled-state exceptions remain explicit.
- Operational labels, reasons and metadata use the shared type roles at or above
  caption. Do not shrink them below 12px/0.75rem to fit a composition. Spatial
  artwork exceptions need a local reason; user scaling remains respected.
- Respect `prefers-reduced-motion` and the shared user preference.
- Focus indicators have at least a two-pixel visible outline with sufficient contrast.
- Shared compact controls default to 32px and standard controls to 36px. Legacy
  dense controls retain a 28px floor until migrated. Touch layouts use at least
  44px targets, including menu items.

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

First-run views prioritize the first useful action; unpopulated inspection panes
appear when an object supplies context. Quality review shows human-readable
requirements, failed/unverified work and the next decision before IDs, versions
and propagation receipts. Technical evidence stays accessible in disclosures;
automated verification never implies human acceptance. Preserve mounted task and
navigation state when contextual panes appear or disappear.

Generic button adapters emit `data-ui-primary` for their actual emphasized state
and respect the active task/modal scope. An inspector returning zero without
seeing the host's controls is not acceptance. The
[presentation checks](scripts/ui-attention/README.md) own lint rollout, negative
fixtures and rendered validation; the [artifact-review tooling](scripts/artifact-review/README.md)
owns media integrity and exact-version feedback.

Game menus follow [canonical domain compositions](docs/design-system/game-menus.md):
intent → menu type → composition → semantic content → validation. Shared atomic
controls alone do not establish hierarchy or permit arbitrary root action growth.

A material UI change is complete only when it:

- uses shared tokens and primitives or documents why a new primitive is needed;
- identifies the data-to-form mapping;
- declares preference ownership and panel behavior;
- works with pointer, keyboard, and focus-visible navigation;
- covers desktop and narrow layouts;
- verifies loading, empty, error, disabled, and recovery states where relevant;
- updates the owning user-story document for material user-visible behavior;
- includes focused interaction tests and visual evidence for user-visible changes.

Run the affected flow in its host, inspect the actual result, and repair defects
before rerunning relevant checks. Scale the states and widths exercised to the
change; a copy correction does not require a full visual audit. Compilation alone
cannot establish layout, interaction feel, or taste approval.

### Engine editor command parity

The engine editor has one capability surface expressed through two equal routes:
the visible application UI and the DOM-free editor command API. Every ordinary
creative or project action must be complete in both routes. Semantic macros use
shared framework-neutral operations, produce the same validated portable state,
expand into editable data, and create one undo entry. A raw JSON editor, browser
automation, or a command-only feature does not satisfy the visible journey.
`apps/engine-editor/src/app/editor-capability-parity.ts` is the enforced ledger.
