# Navigation, settings and forms

This contract records the user's Books feedback on 2026-10-26. It applies to
first-party applications, examples and generated interfaces. Harness settings
is the approved composition reference; the user's four screenshots are failure
references, not an invitation to change each application's visual identity.

## Navigation and commands

Give each navbar command one visible route, including its menus. Group related
commands in named dropdowns; omit secondary copy and saved-state narration from
the navbar. Keep unsaved/error state beside the affected work. A shortcut or action
search may invoke the same command without adding another navbar button.

Books keeps its task-navigation row. Its app row contains the home control,
**Book** and the named user menu, aligned right. A persistent bottom-right Help
fan owns tutorials, assistant and reporting. Book owns New, Import, Export, Recover,
and up to five recent books; the user menu owns Settings and sign-in/out. Menu
commands retain icons and readable names. Export and Recover are bounded tasks.

Keep the opening behavior consistent within a navigation group. Separate task
destinations from dialogs, commands and inspectors with named groups or dividers;
do not make users learn a different placement for each feature. Where a task can
open beside another, provide an explicit placement action as well as a modifier.
Moving or hiding a task preserves its identity and unfinished work. Independent
tasks and selection-dependent inspectors have different lifetimes.
Books' approved [task-tab and companion contract](../../apps/engine-editor/website/examples/books/docs/task-navigation.md)
records the 2026-10-27 decision and its scope.

Order menus and their children by expected task frequency, with stable positions.
Give distinct destinations distinct icons, shared with their tab representation;
use a separate group icon for a menu. Concise dropdown labels carry the choice,
while tooltips carry optional explanation. Favorites sit at the left of each row,
filled yellow when selected. Hover is lighter than the active selection. Input
and selected values use normal weight; reserve emphasis for visual hierarchy.
Prefer gap between related controls and consistent container insets. Tables keep
values unwrapped within a local horizontal scroller; inactive sort glyphs reveal
on hover/focus and the active direction stays visible. Column customization
supports search, visibility and keyboard reordering with saved layout.
This records the owner's 2026-10-27 Books refinements; verify each changed host.

Use tooltips for brief text-only explanations, including optional setting help;
keep descriptions associated with their controls for assistive technology.
Use disclosures when they reveal records, interactive controls or multi-step work.
Compact search/filter controls can lead with icons and placeholders while keeping
accessible names. Keep visible labels when input meaning, units or validation
would otherwise become ambiguous. The Books owner explicitly approved the compact
period picker and requested this distinction in the 2026-10-27 follow-up.

App settings open as a workspace view with searchable sections, responsive
navigation and a return action. Use `SettingsWorkspace`; hosts retain settings
state, save behavior, recovery and unsaved-change guards. A large preferences
surface does not become acceptable by giving its modal a scrollbar.
`PreferenceRow` keeps explanations behind its label disclosure; controls stay
visible and retain their accessible descriptions.

`Meta+,` opens settings; `Ctrl+,` also works for Windows/Linux. Preserve this
binding in empty/start states and while editing text. Common existing flows have
default shortcuts and discoverable names: action search (`Mod+K`), find (`Mod+F`),
save/export (`Mod+S`), and open/import (`Mod+O`) where those commands exist.
Creation, run/play and navigation defaults belong to each app's action catalog.
Do not install commands for absent workflows or steal native text editing, IME,
gameplay or DAW input. Existing explicit user bindings retain their owning policy.

Drawer launchers toggle their own drawer and expose its expanded state. Escape
closes only the most recently opened overlay; a nested menu closes before its
drawer. Restore focus to its trigger and unregister closed/unmounted overlays.
The shared overlay stack owns this ordering; app handlers respect consumed events.
Focused editing controls may consume Escape to cancel their current edit. Native
dialogs retain cancellable dismissal. Remove legacy host dismissal listeners when
migrating; see the [registry integration contract](../../packages/ui/README.md).

## Contextual actions and file locations

Every target with multiple actions provides a context menu: rows, cards, files,
tabs, objects and selected resources. Right-click, Shift+F10/the context-menu key,
and a visible actions button invoke the same commands for the same target. Keep
the primary action visible; group secondary commands in that menu and disclose
larger tasks in their owning workspace. Preserve existing selection and bulk-action
semantics; opening a menu never runs its command. Keep native menus for editable
text, links and selected text. This is the owner's cross-app requirement of
2026-11-01, including generated first-party interfaces.

Use `ActionMenu` with `contextTarget` for the owning surface, or the DOM-only
`@hyperfocus/ui/context-menu` binding for imperative hosts. Menus remain within
the viewport, support arrow/Home/End navigation and dismiss with Escape before
their parent overlay. A visible trigger retains keyboard and touch access and
receives focus on dismissal. Hosts retain command authorization and confirmation.

File-backed resources expose **Copy full path**, **Show in Explorer/Finder** and
**Open containing folder** when supported. File details show the absolute path
as selectable text, not only a truncated label or tooltip. Distinguish project
and exported media locations. Browser-only resources use their actual URL or
virtual path; never imply a local absolute path exists. Privileged hosts resolve
registered resource IDs, validate containment and launch file tools; shared UI
must not gain filesystem or process privileges.

## Geometry and typography

Input, textarea and selected-option values use normal weight (400). Labels may
use emphasis. `FormActions` aligns the control portions of labeled fields with
adjacent buttons, then wraps whole items at narrow widths. Do not center buttons
against the combined label/control/help height. `FileInput` owns chooser/name
alignment and preserves native file semantics.

Dialogs contain one bounded decision. Their shell stays within 90% of viewport
height; total content, including internal scroll overflow, stays within 1.5
viewport heights. These are repository validation budgets, not accessibility
standards. If the task exceeds them, use a view or split the task; do not shrink
type, hide required content or disable the check. Enlarged text still needs a
reachable close action, focus containment and bounded scrolling.

## Verification

Use [presentation checks](../../scripts/ui-attention/README.md) and the app's
actual populated flows. Static lint catches explicit patterns; browser geometry
catches CSS inheritance, wrapping and scroll content. Exercise menu reopening,
drawer toggling, nested Escape, settings shortcuts, focus return and retained
drafts. Compare desktop, intermediate, phone and 200% text states.

AI task guidance carries these rules. A passing empty start page or isolated
fixture does not verify populated reports, imports, settings or another host.
The real-layout regression cases prove the validator can reject the demonstrated
failures; screenshots still need inspection and do not imply taste approval.

The keyboard/focus mechanics follow the [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
and [menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
The OS may intercept Meta before a page sees it, which is why Ctrl remains an
additional binding. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey)

Evidence for this repair lives in `.local/design-system/navigation-2026-10-26/`.
Production and native-host acceptance remain separate from local browser checks.

## Repair coverage

The shared owners are `SettingsWorkspace`, `FormActions`, `FileInput`, the
shortcut installer and the ordered overlay registry in `packages/ui`. Input's
file variant also uses `FileInput`, so existing consumers receive its alignment.
Hosts keep business state and command policy; the engine has no UI dependency.

| Consumer | Changed behavior | Evidence boundary |
| --- | --- | --- |
| Books | Grouped app navigation with retained task row; settings/import/publication views; draft retention; drawer toggles; report/upload controls and report keyboard focus | 771 tests, 179 targeted artifact checks and 63 final-package checks; `books/.local/design-shell-2026-10-26/verification-migration.json`. Parent `books-final` checks 16 states; screenshots include populated imports and recovery. |
| Harness | Shared settings sections; one command route; non-shrinking workspace tabs; ordered overlays | `harness-final` checks 12 states; `harness-sections-final-r2` covers every settings section at desktop, phone and 200% text. Real local settings also inspected. |
| Editor | Project Center and settings are bounded views; one Save transaction; identity/input sections; optional setting help; telemetry in Debug | `editor-final-r3` checks eight fresh-start states. Actual identity/input sections inspected at 390px/200%; owning input journey verifies edit, capture cancellation, Save and Undo using disposable project data. |
| Website and Example workspaces | Settings views and common shortcuts; source editor stays mounted; one primary action | `website-final` checks 12 states. Existing Example project inspected with expanded social metadata at 390px/200%, reachable Save and retained project on return. |
| Juice Me Up business admin | Grouped role-aware menus, searchable settings, retained draft panels, nested Escape, optional methodology and one emphasized action across multiple forms | 27 admin/responsive tests pass; generated 17-product fixture inspected at four layouts. Parent verified primary transfer between subscription forms, settings shortcuts/search, retained drafts and nested Escape. `website/.local/navigation-2026-10-26/admin/report.json`; synthetic owner only, no saved business changes. |
| PadPilot | Settings/controller destinations preserve the mounted module | 26 focused tests; `padpilot-final-r2` browser capture passes desktop, narrow, enlarged-text and touch/fixture states. Native DAW acceptance remains DD-009. |
| Trade | Connections, Approvals and Appearance grouped under Settings; Appearance available before sign-in | `trade-final-r2` checks eight fresh-start states; existing paper workspace settings inspected. No trade or broker operations performed. |
| Albums | Installed generator/template updates, Mod+K search, bounded media viewer and full workspace for long library tasks | Ten-video local gallery verified, including 390px/200%, media controls and Escape focus return. Eight intercepted library fixture states pass; parent inspected the installed library's metadata/review workspaces and focus return without applying edits or starting generation. |
| Engine/reference examples | Existing-flow shortcut and consumed-key guards where applicable | ThreeArena bundle built; Motion Lab/MMO source audited. Gameplay, Touch of Death and native module skins were not browser-accepted in this navigation repair; absent settings workflows were not invented. |

The before captures preserve the reported Books navbar and preferences failures.
After captures have SHA-256 receipts in `after/captures.json`; they are candidates,
not owner taste approval. `shared/report.json` proves compiled primitive behavior
at four layouts, including 200% text, native file selection and nested overlays.
Real-layout negative fixtures prove the inspector rejects the demonstrated
failures, including squeezed navigation labels, excessive hidden scroll content,
clipped child controls and failed startup. Independent review closure is recorded
in `independent-review-r4/report.json`; these fixtures establish validator behavior,
not host or human taste acceptance. The unscoped Books replay had one report-stage
failure, repaired and covered by the passing targeted replay; it was not rerun in full.
The parent receipt is `verification.json`. Guidance, process and source-structure
checks pass; the broad code-style gate still reports dirty-tree debt.
Installed album templates were synchronized locally. Hosted copies were not
republished, and native DAW/gameplay acceptance is outside these browser receipts.
