# @hyperfocus/ui

`ActionMenu` supports right-click and Shift+F10/the context-menu key through the
same actions as its visible trigger. Pass `contextTarget={trigger =>
trigger.closest<HTMLElement>('[data-resource-row]')}` to bind an owning row/card;
the default target is its trigger. Bind only the primary actions menu to a given
surface. Nested resource surfaces take precedence; editable controls, links and
selected text retain their native menus. Pointer menus clamp to the viewport;
keyboard invocation uses the visible trigger and existing overlay focus rules.
DOM hosts use `bindContextMenu(target, open)` and `moveContextMenuFocus(menu, event)`
from `@hyperfocus/ui/context-menu`, retaining the returned binding cleanup. Hosts
own the visible trigger, menu lifetime, target identity and command policy. See
the [contextual-action contract](../../docs/design-system/navigation-settings.md#contextual-actions-and-file-locations).

The opt-in `@hyperfocus/ui/testing/browser` subpath exposes `inspectLayout({page})`
for host-side Playwright verification. It checks the existing attention contract
without requiring branding, throws on violations, and returns viewport dimensions,
document/body widths, overflow and horizontally clipped controls. Website and
Books use this owner. The optional `playwright-core` peer supplies its concrete
page types; this module has no privileged runtime dependency or component changes.
It is separate from core UI entries. Focused tests exercise attention failures
and DOM measurements without launching a browser.

`@hyperfocus/ui/dom` resolves authored element IDs with actual constructor checks:
`requireDomId`, `requireInput`, `requireButton`, `requireHtmlElement` and
`clickButton`. `requireEventTarget` validates delegated targets. Missing or wrong
node types throw. Pass a document explicitly for
independent hosts; constructors and documents use the same DOM realm. Imports
have no DOM side effects. Native Atlas controls and their tests consume this
owner instead of asserting that arbitrary elements are inputs or buttons.

`RecoveryNotice` requires an independent dismissal callback and keeps its Dismiss
button enabled alongside unavailable recovery actions. Hosts retain unsaved state
separately and own retries. Books uses it for opening/save failures and an outer
workbench recovery shell. Its component test and Books' `classes-recovery` artifact
journey enforce dismissal, retained data, and continued access to Preferences.

`SelectControl` remains controlled: `value` is the accepted selection, including
when `onChange` opens a confirmation or rejects a proposal. Its bubbling `change`
event exposes accepted DOM metadata by default. Imperative command owners may opt
into `changeEventValue="requested"` to read the proposal from `data-select-value`
during dispatch, then validate/commit it. After dispatch the metadata returns to
the current accepted prop even when the command rejects it. This mode does not
store selection state inside the control.

`Button` defaults to secondary; callers choose primary emphasis explicitly.
Icon buttons keep their token-sized square on both the control and its tooltip
wrapper, so constrained flex rows scroll or disclose actions instead of collapsing
their hit targets. Text-button tooltips retain responsive wrapping. The compiled
[presentation checks](../../scripts/ui-attention/README.md) exercise this contract.
`PrimaryActionScope active={false}` keeps supporting-pane commands available with
secondary emphasis. `HomeButton` groups a brand into one named control; its host
callback owns navigation and draft guards. See the [attention contract](../../DESIGN.md#respect-limited-attention)
and `src/primitives/attention/button.test.tsx`.

`inputAppearance(size)` returns the shared Input's StyleX attributes for legacy
DOM hosts. The Solid `Input` and Editor media dialog use the same appearance;
the host still owns input semantics and state.

`FileInput` accepts Input props plus `buttonLabel`; `Input type="file"` uses the
same centered chooser. Native input refs, file constraints, labels, form reset
and selection events remain available. Use `form.reset()` or dispatch `input`
after imperatively clearing `value` so the visible filename updates. Input and
select values use normal weight even inside an emphasized parent.

`FormActions` accepts standard div attributes and direct `FormField`/action
children. Its responsive grid shares label, control and help tracks, keeping
buttons aligned with controls despite multiline labels or descriptions. Fields
wrapped by an application component still work when that component renders a
`FormField` root. Use `FormGrid` for forms without adjacent action buttons.

`SettingsWorkspace` from `@hyperfocus/ui/preferences` is full-view settings chrome
with responsive section navigation, optional search and Close. Supply `sections`
(`id`, `label`, optional `icon`), controlled `activeSection`/`onSectionChange`,
optional `query`/`onQueryChange` and `onClose`, then render the selected contents as
children. Hosts filter content and own persistence/routing; the container supplies
no default subtitle or modal behavior. Give its parent a bounded flex/grid view.
`PreferencesSurface` uses the same chrome for descriptor-driven controls.

`installAppShortcuts` from `@hyperfocus/ui/shortcuts` installs at the app lifetime
and returns cleanup. Pass optional `target: Window` and `actions` containing
`id`, `key`, `run`, optional `enabled` and `allowInInput`. Keys use exact modifiers
(`Mod+,`, `Mod+Shift+p`, `Ctrl+s`, `Meta+s`, `Alt+p`); Mod means Ctrl or Meta,
never both. Imports require no DOM. Consumed events, IME and repeat are ignored;
editable targets require opt-in, and native typing, selection, clipboard and
undo keys remain protected there. Settings should use `Mod+,` with
`allowInInput: true`. Dispose the previous installer before replacing bindings.

`registerOverlay({ id, close, element?, restoreFocus?, focusOwner?, target? })` is also available
from the DOM-only `@hyperfocus/ui/overlay-stack` entry point. It registers only
for an overlay's open lifetime and returns idempotent cleanup. Supply the surface
element (or accessor) and invoking element as `restoreFocus` for drawers. Remove
legacy Escape dismissal listeners in capture, document, or earlier window listeners.
Focused and delegated controls can consume Escape first; otherwise window bubbling
dismisses the latest registration once and prevents later cascades/held repeats.
Cleanup does not steal focus from a newer surface. Register descriptive overlays
with `focusOwner: false`; `isTopFocusOverlay` ignores them for
Tab containment while `isTopOverlay` retains their Escape ordering. Tooltips use
this distinction so focusing a dialog's Close control cannot disable its focus trap.
For native dialogs, register
after `showModal()`; the browser's cancellable `cancel` event remains authoritative,
and an accepted native close synchronizes the host and releases registration. Shared `Dialog`,
popover, DOM selector and game modal use this owner.

Run `bun test --conditions=browser packages/ui/src/form packages/ui/src/preferences
packages/ui/src/shortcuts packages/ui/src/primitives/overlay-stack.test.ts` for
focused mechanics. `bun packages/ui/scripts/design-system/forms-settings/verify.ts`
builds actual StyleX, checks alignment/normal value weights/file choosing,
responsive settings and stacked Escape/focus at 1440, 820, 390 and 390px/200% text,
and writes evidence under `.local/design-system/navigation-2026-10-26/shared`.
Pass an output-directory argument to preserve a new run separately. The same
compiled fixture checks tooltip pointer travel, caller descriptions in Chromium's
accessibility tree, real Preferences Save errors and competing-primary/modal
scope detection. On Windows it records the owned browser's window inspection.
Actual consuming apps still need their host cascade and navigation verified.

`@hyperfocus/ui/task-review` provides the shared Harness and Editor review dialog,
progress, candidates, artifacts and outcome analysis. Outcome disclosures preserve
interpretation, methods, hypotheses, experiments, independent evaluations and
run-local learning; task criteria and demonstrated outcome remain separate. Hosts
own execution, artifact integrity and approval. Run `bun test --conditions=browser
packages/ui/src/task-review` and the managed-host fixture at
`apps/harness/scripts/swarm/verify-workflow.ts` for focused verification.

`QualityReview` leads with unresolved requirements and the next decision, using
titles from the quality-rule catalogue. Passed checks and technical receipts are
disclosed separately. Display titles stay out of persisted traces; stale results
remain explicitly invalid and human review is never inferred from passing checks.
Its component regressions and the Harness/Editor quality browser journeys cover
the rendered hierarchy and the runtime-to-view boundary.

`@hyperfocus/ui/game-menu` provides DOM adapters for bounded semantic action lists,
category panels and native modal focus. They do not import Solid, game state or
persistence. Real consumers are Touch of Death title/mode/pause/results actions,
Rewards/Settings categories, and Rewards/Settings/developer modals. Product shells
and CSS stay with the host; see [game-menu composition](../../docs/design-system/game-menus.md).
Run `bun test --conditions=browser packages/ui/src/game-menu` for their contracts.
Actions require nonblank IDs/labels and meaningful unavailable reasons; invalid
lists reject before changing the rendered controls or their command handlers.

`TagPicker` composes a searchable checkbox popover and removable selected chips for
multiple tags. FX ideas and Harness notes share it; small catalogs omit search.
`FavoriteSelectControl` composes the existing single-value selector with a sibling
favorite button, stable favorites-first ordering and a Favorites filter for large
catalogs. Harness models and Editor audio share it. Hosts own favorite persistence,
tag meaning and accepted values; neither control writes storage or project data.
`src/primitives/selection/collection-controls.test.tsx` covers controlled selection,
filtering, disabled options and keyboard focus return.
Run `bun packages/ui/scripts/design-system/collection-controls/capture.ts` for
desktop, 390px touch, and 200% text browser checks. It captures evidence under
`.local/design-system/evidence/collection-controls` and verifies hidden browser
ownership, popup bounds, search, multiple selection and favorites. Application
captures separately verify that the controls fit their host surfaces.
The Harness composer exposed overlap between the model trigger and favorite
button. The shared wrapper now reserves a nonshrinking action column and lets only
the selector shrink. The capture asserts non-overlap; the Harness replay at
`apps/harness/scripts/selection/capture.ts` checks the actual compact toolbar.
The host toolbar also wraps and reserves readable model width: a nonwrapping row
can otherwise squeeze the selector to zero even when its action column is intact.

Controlled selection metadata follows the accepted value during validation or
confirmation guards. The `selection/invalid-state.test.tsx` regression covers
rejected values and deferred mode changes; hosts own acceptance and persistence.
The same regression covers focus moving into a host confirmation: deferred popover
focus return must not pull focus back behind the dialog or reopen its tooltip.

Open selection options preserve complete names and size rows to wrapped content.
Both adapters keep large catalogs bounded; native CheckboxField inputs scale with
root text. The [fourth batch shared-control evidence](../../docs/design-system/next25-batch4-shared.md)
records real Atlas/FX consumers, the intermediate overlap failure and replay.

Narrow preferences use a section picker and place Reset after the controls;
segmented choices share the radio-keyboard contract. Panel and empty-state type
uses semantic roles, and tab selection reveals its own local strip without
moving focus. Selection popups keep search fixed while only options scroll;
long-label tooltips wrap and measure their actual height. The owning visual-system
handoffs link the screenshot-review regressions and refreshed host evidence.

Presentational Solid components styled with StyleX. It contains buttons, inputs, responsive form fields and grids, tabs, segmented controls, descriptive selection controls, panels, action menus, trees, overlays, chat composition and transcript rendering, an xterm surface, arbitrary dock/workbench layout mechanics, a descriptor-driven `PanelGroup`, and a CodeMirror source editor.

Shared components own interaction and accessibility mechanics, not application commands. For example, `ActionMenu` owns focus and overlay behavior while an application adapter maps selected items to domain actions; `PanelGroup` owns pointer and keyboard resizing while the host owns durable layout state.

`Tooltip` owns trigger/bubble hover, keyboard focus, description-token lifetime,
placement and ordered Escape dismissal. Host adapters may supply a skin class,
portal mount or direct `renderTrigger` bindings; do not copy its interaction logic.
The actual control receives the tooltip description while open. Existing help/error
IDs survive opening, caller updates, closing and disposal. The DOM title adapter
uses the same lifecycle. Tooltips remain hoverable across the trigger gap, and
native dialog content stays in the dialog's top layer. Keep accessible names
independent of tooltip descriptions.

Every host button adapter emits `data-ui-primary` for an emphasized primary
action; quiet variants omit it. The attention inspector uses this metadata in the
active view (the top modal, when present). Consumer tests must prove that two
competing primaries fail detection and a modal's one primary does not compete
with background actions. DOM geometry stubs establish metadata behavior only;
verify rendered geometry and interaction in the consuming host.

`Disclosure` wraps native details/summary with a 44px summary, visible focus and
wrapping content. Pass `title`, `children` and optional initial `defaultOpen`;
subsequent opening stays browser-owned and closing preserves child drafts.
The [seven Website consumers](../../docs/design-system/next25-editor.md) cover
keyboard closure, narrow width, 200% text and task-specific recovery.
PadPilot's [release notes and installation context](../../docs/design-system/next25-padpilot.md)
reuse the same primitive in a second host without additional variants.

`Popover` follows content growth and trigger resizing while open, including
asynchronously loaded selection options. Its observer disconnects on close.
Its minimum width is bounded by the viewport; oversized content scrolls inside
the overlay. `ActionMenu` wraps labels and reserves icon/shortcut columns even
when optional cells are absent. The [short-height Harness regression](../../docs/design-system/next25-batch2-surfaces.md)
checks actual popup bounds at 390px with 200% text.

Use the [visual system](../../docs/design-system/README.md) for semantic type roles,
tokens and proven compositions. `typography` exports eight StyleX roles; Button,
Input and FormField use these defaults, with 32/36px controls and 44px coarse-pointer
targets. Selection triggers and action-menu rows share geometry tokens. Host-owned
validation may pass `invalid` and `describedBy` to SelectControl. A rejected choice
keeps the accepted controlled value, including its DOM value marker; the host owns
the error text and validation. Invalid selections suppress their tooltip so it
cannot cover associated recovery text after focus returns; the [Website loop capture](../../docs/design-system/next25-batch5-website.md)
and existing rejection regression preserve this behavior.
See [business-field validation](../../docs/design-system/next25-batch3-website.md) for accepted-value recovery.
Host-owned loading uses `disabled`, `aria-busy`, and an informative label. Input error styling
uses `aria-invalid` or native `:user-invalid`, so untouched required fields do not
look invalid before interaction.

`PreferencesSurface` keeps controls mounted across value updates, labels sliders
and toggles by setting name, and accepts host-owned `saveError`/`resetDescription`.
The [Editor settings handoff](../../docs/design-system/editor-settings.md) owns its
real search, save/retry and narrow-layout evidence. `DockingWorkbench.showPanel`
reveals its destination in narrow mode as well as activating its desktop stack.

Build a file-only interactive reference with
`bun packages/ui/scripts/design-system/build-showcase.ts` from the repository root;
open `.local/design-system/showcase/index.html`. Run
`bun packages/ui/scripts/design-system/verify-showcase.ts` for owned-browser checks,
screenshots at 1440/820/390px, keyboard, themes, touch and 200% text. This reuses the
existing compiler and browser owner; it requires installed Playwright Chromium.

`PanelGroup` keeps separator labels under Solid's ownership. Its narrow-mode
switcher and resize handles hide through component styles, so standalone hosts
need no global `[hidden]` rule to get the correct responsive controls. Dynamic
panel descriptors and controlled layout normalize together before rendering,
including panels that disappear and return.

`DockingWorkbench` composes a recursive split tree of tab stacks. Every stack has
one add/move control; tabs can move by drag/drop or menu actions, split on any edge,
close into a remembered dock, and reopen without host-specific geometry code.
Closed panels retain that dock when layouts are serialized and parsed; hosts pass
all available panel identities to the parser, including currently closed panels.
Separators support pointer and arrow-key resizing, narrow containers collapse into
one operable tab stack, and named preset callbacks leave durable app-user storage
with the host. The serializable `DockLayout` model is Solid- and DOM-free.

Each `DockingWorkbench` mount owns its layout commands and drag state in a scoped
context. Tree views receive node/stack identity; they read commands at the point
of use. Panel identities may be added or removed; layout normalization filters stale IDs
before rendering. A descriptor's `content` should be a stable node when its
editor must survive moves. `onVisibilityChange` lets retained host editors attach
to the visible group. Hosts can hide presets, show per-tab close buttons and
control the focused narrow tab. Book/entity replacement still belongs to the
host lifetime owner.
Simultaneous owners are covered by `src/workbench/dock-workbench.test.tsx`.

Branded wrappers use the ordered dismissal registry described above and retain
responsibility for focus containment. `Popover` owns viewport clamping,
outside-click dismissal, Escape and optional focus return; `contentClass` supplies
product skins.

`SelectControl` is the first-party replacement for native HTML selects. Small
choice sets open as complete descriptive lists; sets above eight options add
immediate type-ahead search and optional tag filters. `createDomSelectControl`
provides the same contract to the engine editor's imperative shell while it is
migrated to Solid. Hosts own the selected value and any remote result stream.

`ChatComposer` accepts asynchronously loaded agent/provider/model catalogs. Its
selectors appear when options arrive and recover after empty refreshes; keep
catalog-dependent visibility inside Solid's reactive control flow. The regression
in `src/composer/chat-composer.test.tsx` covers discovery and selection after load.
With the managed Editor running, set `EDITOR_URL` to its returned URL and run
`bun apps/engine-editor/scripts/design-system/capture-editor-ai-review.ts` (the original
`capture-editor-ai.ts` delegates here). It checks desktop/tablet/mobile/short/touch
panels, disclosed async selectors, keyboard and 200% text, plus intercepted review,
error and cancellation fixtures. Evidence defaults to
`.local/design-system/evidence/editor-ai-redesign/after`; `DESIGN_EVIDENCE_DIR`
overrides it. Credentials are masked; real AI writes are blocked. This is Editor
browser evidence, not PadPilot or native-host verification.

The [Editor action review](../../docs/design-system/editor-ai-panel.md#action-review) uses
the same Button and typography defaults for Before/After fields, native
disclosures and paged field lists. Its review model remains Editor-owned. Run
`bun apps/engine-editor/scripts/design-system/capture-editor-action-review.ts` against
the managed Editor for actual Apply/Revert and responsive review evidence.

The Editor entity inspector proves these controls in a dense property surface.
`bun apps/engine-editor/scripts/design-system/capture-inspector.ts` checks selection,
real edit/undo, component disclosure, keyboard, touch and text scaling against
the managed `EDITOR_URL`. See the [handoff](../../docs/design-system/editor-inspector.md).

Input bindings reuse FormField, Input and Button for staged editable lists.
`bun apps/engine-editor/scripts/design-system/capture-input-bindings.ts` validates real
Save/undo, errors, capture, long lists and narrow/scaled layouts. The
[owning handoff](../../docs/design-system/input-bindings.md) records why the
project-specific draft and reference logic remains in the Editor.

Harness jobs reuse Button, ActionMenu and semantic typography in a virtual roster.
`bun packages/ui/scripts/design-system/capture-jobs.ts` uses the managed
`HARNESS_URL`, intercepts a synthetic job workspace, and blocks all outgoing
commands. It checks responsive list geometry and keyboard/menu interaction;
see the [handoff](../../docs/design-system/jobs-roster.md). Job-specific rows and
selection coordination remain application-owned.

PadPilot settings reuse Button, FormField/Input, SelectControl, and semantic type.
With its managed server running, set `PADPILOT_URL` and run
`bun apps/pad-pilot/scripts/design-system/capture-padpilot-settings.ts` from the root.
It checks real desktop/narrow/touch layouts, keyboard and text scaling, then clearly
synthetic long/loading/error catalogs. It blocks AI writes. See the
[settings handoff](../../docs/design-system/padpilot-settings.md) and canonical
[design debt](../../docs/design-system/design-debt.md); browser evidence does not
establish native-host behavior.

`ChatTranscript` safely renders Markdown through a measured, variable-height window. Its Fenwick prefix model keeps measurement updates logarithmic and DOM/Markdown work bounded as history grows. The simple path only needs `messages` and retains the newest 512 presentation rows; advanced hosts can tune that bound, estimated row height, overscan, stick-to-end behavior, and the pending-stream render interval. `hasPrevious` plus `onRequestPrevious` expose host-owned durable paging without moving persistence into this package. Pending rows coalesce source revisions and reconcile Markdown without replacing their stable row. Retained-window shifts preserve one reactive index per stable message key, preventing duplicate message owners as old rows leave the window. Optional application callbacks expose applied-revision counts for structural performance evidence.

`bun run bench:measured-window` records prefix writes, typed-array allocations, tree writes, and environment-labeled timing. The browser transcript test gates on mounted-node, unique-message, Markdown-update, and applied-revision counts at 100 and 10,000 messages; its elapsed time is diagnostic only.
The transcript now uses semantic type, restrained assistant grouping and labeled
responses in progress. Code and tables scroll locally; the conversation is a
keyboard-focusable viewport with Return to latest. Reading anchors survive
incoming messages and retained-window shifts. Virtual remounts are not live
announcements; a separate status announces response state/message count.
`bun packages/ui/scripts/design-system/capture-transcript.ts` validates the actual
Editor and PadPilot hosts via managed EDITOR_URL and PADPILOT_URL. See the
[handoff](../../docs/design-system/shared-transcript.md) for evidence and limits.

Its owned browser driver runs through Bun so repository TypeScript package exports
resolve consistently with the package test command.

It intentionally has no filesystem, process, persistence, credential, agent-runtime, engine-project, or AI execution ownership. Those capabilities are injected by application hosts.

DOM-free consumers can import source state from
`@hyperfocus/ui/source-editor/document` and all serializable workbench state from
`@hyperfocus/ui/workbench/model` without loading Solid or component modules.

`@hyperfocus/ui/tutorial` exports `createTutorialCoach` and `createTutorialSession`.
The DOM-free `@hyperfocus/ui/tutorial/session` entry provides evidence-driven
completion, stale-attempt rejection and an active-time success hold. Define an
objective and one to six steps with input, timing and success semantics; supply
real host evidence and reversible demonstration callbacks. Guided first fight and
technique Practice are the real consumers. The [tutorial contract](../../docs/design-system/tutorials.md)
contains the minimal example, theme boundary and acceptance checks.
`validateTutorialDefinition`, `validateTutorialFeedback` and `validateTutorialTiming`
are available from both tutorial entries for authoring preflight. The model and
coach use the same validators: rendering directly cannot bypass required lesson
content, show completion without every step, or count a demonstration as success.
Rejected observations leave progress/time unchanged; rejected renders preserve the
current UI and focus. Timing values are finite with a positive total and ordered
window; displayed windows clamp to that total, including fractional app time units.
Run `bun test --conditions=browser packages/ui/src/tutorial packages/ui/src/game-menu`.

Source-document snapshots are immutable values. Edit through `setText` or `reload`;
observer failures cannot interrupt edits, saves, or other subscribers. A save
captures the current text and updates `savedText` when the host promise resolves.
Edits or reloads during that save retain their text and remain dirty if they differ
from the completed write. Hosts should serialize external reloads with writes when
they need a clean disk snapshot; the document cannot infer external commit order.
Concurrent `save()` callers await the same active write. Use `flush()` for
save-and-close or export: it waits for that write, then saves newer edits until the
document is clean. Host failures reject and leave the document dirty for retry.

`bun run build` emits Solid DOM modules and extracted StyleX CSS to `dist/`. The build fails if a React JSX fallback or uncompiled `stylex.create` call reaches any JavaScript entrypoint.

Related: [shared UI user stories](user-stories.md), [application design standard](../../DESIGN.md), [StyleX integration](../../docs/stylex.md), [package testing](../../docs/package-testing.md), and [architecture](../../docs/architecture.md).

`@hyperfocus/ui/data-table` enhances semantic DOM tables with stable numeric/text
sorting, accessible column visibility/reordering and validated layout preferences.
Cells and headings stay on one line inside a locally scrolling table. Sorting
and column controls must remain reachable with enlarged text.
Import `@hyperfocus/ui/data-table/styles.css`; supply raw cell `data-sort-value`
values and persist `onChange` preferences in the host. The local album library's
album and track tables consume it. `@hyperfocus/ui/dom-tooltip` upgrades titles
for hover/focus, including native modal top layers. `@hyperfocus/ui/task-review/progress`
describes measured/indeterminate phases and stale heartbeats for DOM consumers and
`TaskReviewProgress`; hosts own workers, logs and evidence of completion.

Tables can supply `toolbar: HTMLElement` to place generated Columns controls
beside the host's search and filters. Disposal removes only generated controls;
the host slot and its actions remain owned by the caller. Books Transactions
uses this path. Columns uses a 36px desktop minimum and the existing touch target.

`@hyperfocus/ui/theme/contrast` owns opaque hex contrast and sRGB luminance math.
Books validates its semantic text/control pairs; Harness consumes the same math
through its existing theme model. Theme admission, fallback and persistence remain
host policies. Contrast numbers do not establish complete accessibility or taste.

`Dialog` keeps its heading and Close fixed while description/content scroll
together. Narrow gutters, intrinsic widths and viewport height bounds preserve
enlarged text without losing Close. The real Character voice regression checks
error recovery, reading space, focus trapping and Escape return at four sizes:
`bun apps/engine-editor/scripts/design-system/editor-workspaces/voice.ts` from the root.

`@hyperfocus/ui/branding` provides `BrandingFields` for editor-owned logo/social preferences; hosts own persistence and undo. `@hyperfocus/ui/attention` provides renderer-independent DOM inspection for active-view priority, names, cursors, home controls, overflow and optional document metadata. Website and Books browser verification consume it.

### Shared project chat and feedback

`ProjectChatLayout` and `ProjectChatComposer` from `/composer` own the Harness and
Books project-chat geometry. Hosts provide header, transcript, status, composer
controls and actions. Enter submits; Shift+Enter, IME, disabled state and host
keyboard cancellation retain their behavior. App state and requests stay local.

`BugReportDialog` from `/feedback` prepares reviewed GitHub issue drafts. Hosts
supply safe context and a repository; each opening snapshots that context and
owns its pending work. It never reads app records or credentials. Optional
screen capture uses the native chooser, hides the report during capture and
stops all acquired tracks. Selected files decode locally, are bounded and
re-encoded to PNG. The reporter downloads and attaches the image on GitHub;
draft URLs contain text only. Oversized text gets an explicit copy/paste fallback.
No API submission or upload happens in this primitive. `Button shape="circle"`
provides the shared round icon treatment for floating help actions.


`PanelHeader variant="view"` provides a spacious view heading with context, icon,
description and action slots. The default panel variant keeps its existing
compact geometry. `disclosureStyles.summary` centers native summary content
within its touch target; hosts retain native details/summary behavior.

`FavoriteSelectControl` keeps toggles beside individual options. With an
`optionAction`, `SelectControl` exposes a grid of sibling selection/action cells
rather than nesting buttons in a listbox option. Up/Down moves choices;
Right/Left moves between selection and action, and toggling preserves focus and
accepted value. Plain selection retains the listbox contract. Shared contextual
actions reserve geometry, reveal on row hover/focus, and stay visible on coarse
pointers; selected toggle state remains visible. See [DESIGN](../../DESIGN.md#reveal-complexity-progressively).

Dock descriptors may provide icons, `menuItems()` before Close panel, and an
optional `onDuplicate` command. The host owns duplication policy and lifetime.
No-op splits are disabled; drag renders one destination preview or insertion
line without changing layout until drop. Reduced motion is respected. A hidden
PanelGroup panel's edge handle supports single-click restoration as well as its
existing keyboard and drag controls. Books' packaged `dock,task-tabs` journeys
exercise the real shared owners and preserved editor nodes.
