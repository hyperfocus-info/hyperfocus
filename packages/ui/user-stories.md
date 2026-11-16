# Shared UI User Stories

Canonical consumer-story inventory for reusable UI surfaces in `@hyperfocus/ui`.
Application workflows belong in the owning app story document; this file covers
shared interaction contracts.

Story IDs are stable. Update this file when adding, removing, or materially
changing a reusable UI surface.

## Stories

UI-ATTENTION-001: As a user, I can identify the active task's primary action and
return home through the brand without losing drafts. Shared buttons default to
secondary and supporting panes can yield emphasis. Control tests and the
[real-consumer audit](../../docs/design-system/attention.md) own verification.

UI-PRIMITIVES-001: As an application author, I use shared buttons, inputs, labeled
form fields, container-responsive form grids, checkbox fields, tabs, segmented
controls, sheets, dialogs, tooltips, and menus so that first-party apps share
accessible interaction mechanics and dense forms retain usable spacing as their
own pane changes size. Icon actions remain reachable when tooltips wrap them
inside constrained toolbars.
Semantic type roles and 32/36px control defaults reduce per-screen styling choices;
coarse-pointer controls and menu rows reach 44px. Long labels wrap, explicit errors
remain visible, and untouched required inputs wait for interaction before native
invalid styling. The file-only `scripts/design-system/verify-showcase.ts` verifies
these defaults with real computed styles, keyboard paths, themes and 200% text.
Panel headings and empty states use the same semantic roles. Segmented choices
wrap within their container and preserve radio-keyboard behavior and touch targets.
Tab selection and resize reveal the active tab within its own strip without
moving page scroll or stealing editing focus.
Enabled actions and navigation provide pointer cursors and visible hover fills;
disabled controls retain their unavailable appearance and keyboard focus remains
visible. Hover preserves primary, destructive and selected-state meaning.

UI-OVERLAY-001: As a keyboard user, I open and close dialogs, sheets, popovers,
menus, and tooltips with predictable focus return and Escape behavior.
Escape dismisses only the most recently opened registered surface. Held Escape
and duplicate legacy listeners cannot dismiss the next surface; disposal does
not move focus out of a newer overlay. Native modal cancellation uses this same
registry. The forms/settings browser regression exercises two successive closes.
Dialog Tab navigation skips disabled and hidden controls and stays inside the
dialog when focus starts on its container.
Descriptive tooltips keep Escape priority without taking keyboard focus ownership:
Tab still wraps inside a dialog while a control's tooltip is visible, including
closed/open disclosures. Focus-owning menus and nested dialogs retain priority.
At narrow widths and enlarged text, the heading and Close stay inside the surface;
description and content share the bounded scroll body. The Character voice browser
journey verifies long-line error recovery, successful local synthesis, visible
reading space and focus return at 320px/200% text.

UI-SETTINGS-002: As a user, I navigate settings in a full view with a sidebar and
search, retain my draft during navigation, and reach the last setting at narrow
widths or enlarged text. `SettingsWorkspace` owns responsive chrome while hosts
own content and save behavior; descriptor forms use it through `PreferencesSurface`.
App settings shortcuts work inside text fields without capturing native editing.
Section icons remain present in desktop navigation and the compact section
selector; Books exercises both through `verification/tasks/theme-pack.ts`.

UI-FORM-ACTIONS-001: As a user, I read normal-weight field values and choose files
through a centered native chooser. Labeled controls and neighboring actions share
the same control track even when labels wrap or help text is present. The
`scripts/design-system/forms-settings/verify.ts` browser regression checks these
mechanics, responsive wrapping and file selection with actual extracted CSS.

UI-LABEL-001: As a user, I can read complete wrapped menu labels without redundant
tooltips covering adjacent actions. Icon-only, ambiguous and truncated controls
retain shared tooltips for hidden information; MenuItem's optional `tooltip`
supplies additional context explicitly. Compact tree labels still reveal their
full text through shared tooltips.

UI-SELECTION-001: As a keyboard, touch, or assistive-technology user, I choose
from labeled descriptive options through one responsive control that shows small
sets completely and adds immediate search and meaningful tag filters for large
sets without relying on native HTML selects.
Open options preserve distinguishing name suffixes; wrapped rows grow inside a
bounded scrolling list. Both adapters have a 27-option enlarged-text regression
in `scripts/design-system/selection-labels/capture.ts`, including keyboard
selection, focus return and popup bounds.
Controls hidden for a single option reappear when additional options arrive.
Search and filters stay visible while only the option list scrolls, including
selection of the last item at 200% text. Full-label tooltips wrap long names and
measure their height before clamping to the viewport.
Host validation can associate an error with the trigger. Rejected selections retain
the accepted label and DOM value; correction clears the error. The selection
`invalid-state.test.tsx` regression preserves this controlled-value boundary.
Invalid selections also suppress their tooltip, preserving visible associated
recovery text when focus returns from the picker.

UI-COLLECTION-001: As a user, I narrow multiple categories with a searchable
`TagPicker`, see and remove my selected tags, and return focus after dismissal.
Small catalogs show all choices; large catalogs keep search above a bounded list.
As a frequent user of model or audio catalogs, I favorite the accepted selection
without changing it, see favorites first, and filter large catalogs to Favorites.
`FavoriteSelectControl` preserves the existing single-value keyboard contract;
the favorite action is outside the listbox. Hosts own storage and semantic tags.
`selection/collection-controls.test.tsx` covers filtering, controlled values,
disabled choices, favorite ordering, and keyboard dismissal.

UI-WORKBENCH-001: As an application author, I compose persistent panes through
`PanelGroup` and workbench primitives so that resizing, collapse, persistence, and
narrow-layout behavior are consistent. Arbitrary workbenches use recursive split
trees and tab stacks with add/move actions in every dock, pointer and keyboard
resizing, close/reopen memory, responsive single-stack collapse, and host-owned
named presets. Closed-panel dock memory survives serialize/parse/reopen, subject to
the host's current allowed-panel identities. Panel-group switchers appear only in narrow mode and resize handles
only in resizable layouts, including hosts without a global hidden-element reset.
Calling `showPanel` also selects that destination in the narrow stack, so host
navigation cannot leave newly opened content hidden behind the previous pane.
Dynamic descriptor removal normalizes the rendered tree before lookup. Hosts can
retain editor nodes while tabs reorder, split, close and reopen; Books' packaged
`verification/tasks/dock.ts` exercises this with native drag and keyboard input.

UI-PROJECT-CHAT-001: As a user, project conversations in Harness and Books share
the transcript/composer layout and Enter, Shift+Enter and IME behavior. Host
commands and state remain scoped. `composer/project-chat-composer.test.tsx`,
Harness chat suites and Books' packaged assistant journey cover both consumers.

UI-FEEDBACK-001: As a reporter, I review a bug description, explicit app context
and an optional screenshot before opening a GitHub draft. I submit on GitHub;
images require explicit attachment there. Closing discards this dialog lifetime,
pending captures cannot update a later report, and app data is never read by the
primitive. `feedback` tests cover review invalidation and long-report fallback;
Books' native dock journey verifies image decoding and an intercepted draft URL.

UI-PREFERENCES-001: As an application author, I define shared-user, app-user,
project, and session preferences through one model so that chrome settings do not
leak into project data.
Controls retain their nodes and focus when the host publishes new values. Search
has explicit clear/empty recovery; controls use their setting names and help
text, and host-owned save failures remain beside Save without discarding drafts.
The [Editor settings capture](../../docs/design-system/editor-settings.md) proves
these contracts in the real application.
Narrow panes use a section picker, avoid repeating the selected section heading,
and put Reset after the settings. A common scope is shown once; mixed-scope rows
keep their individual labels.

UI-COMPOSER-001: As an application author, I reuse composer controls for prompts,
attachments, model/runtime selectors, and send states while the host maps actions
to its own commands. Asynchronous catalog choices appear after loading and recover
after an empty refresh, so discovery cannot permanently hide profile overrides.
`src/composer/chat-composer.test.tsx` verifies that selection journey; the Editor
AI capture checks actual controls and readable Send text at narrow widths.
Small-height and narrow composers reserve less space for an empty draft. Empty
transcript guidance uses modest padding; host checks measure the visible reading
area through clipping ancestors, not only the transcript's own height.

UI-TRANSCRIPT-001: As a reader, I see markdown, code, tables, blockquotes, and
streaming transcript content rendered safely and legibly across apps while long
histories keep Markdown parsing and mounted DOM bounded to the visible window.
I can read older messages without incoming content moving my current message,
then use Return to latest with keyboard focus restored to the conversation.
Code and tables have local keyboard scrolling, long words wrap, and type scales
without overlapping measured rows. Virtual row remounts do not repeat live
announcements; response state remains available separately. Colocated component
and browser tests plus the [two-host capture](../../docs/design-system/shared-transcript.md)
cover these behaviors.

UI-TERMINAL-001: As an application author, I embed terminal surfaces with bounded
history, keyboard handling, search, and resize mechanics while the host owns the
process and transport.

UI-SOURCE-EDITOR-001: As a creator, I edit source text through a reusable editor
surface whose document state, selection, and host commands remain explicit.
Hosts can flush pending and newer edits before closing or exporting; failed writes
remain dirty and can be retried without losing text.

UI-TREE-001: As a keyboard user, I navigate hierarchical project data through a
shared tree with stable selection, expansion, and accessible labels.

## Verification

UI-TASK-REVIEW-001: As a user reviewing background work, I inspect dependencies,
worker progress, competing candidates, attributable findings and immutable
artifacts through shared presentation. Hosts own execution, permissions and
approval policy; unavailable or inconclusive work does not appear successful.
Outcome analysis keeps interpretation, expert methods, falsifiable hypotheses,
experiments, independent evaluations and run-local learning inspectable through
disclosures; task completion and demonstrated outcome remain separate.
Harness and Editor are the two consumers. Focused coverage lives in
`src/task-review`; `apps/harness/scripts/swarm/verify-workflow.ts` verifies both
real hosts with an explicitly simulated workload.

UI-TUTORIAL-001: As an author of a learning flow, I declare observable steps with
input, timing and success semantics, supply host evidence and reuse a canonical
coach. Only current player attempts earn completion; paused or background time
cannot skip acknowledgement. Native controls, feedback and focus stay stable
through progress, retry, demonstration and return. Guided first fight and Practice
  provide real consumer evidence; the [contract](../../docs/design-system/tutorials.md)
  owns the authoring example and validation route.
  Both model and presentation reject incomplete semantics before mutation. Invalid
  evidence cannot retain progress/time; direct rendering cannot claim premature
  or demonstration completion. Public preflight validators share these constraints.

UI-GAME-MENU-001: As a game UI author, I declare action priority and audience in a
bounded list, preserve focus through availability changes, and compose category
panels and modals that remove inactive controls and restore the invoking focus.
Touch of Death provides title, pause, Rewards and Settings consumer evidence.

UI-DISCLOSURE-001: As a keyboard or pointer user, I open a named disclosure with a
44px minimum target and visible focus, read wrapped content at 200% text, and close
it with descendants removed from navigation. Seven real Website consumers are
covered by the [authoring capture](../../docs/design-system/next25-editor.md).

Reusable UI behavior is covered by colocated tests under `packages/ui/src`. Use
[Package Testing](../../docs/package-testing.md) for verification scope and
[DESIGN.md](../../DESIGN.md) for design acceptance.

Related: [Repository user-story map](../../docs/user-stories.md).

UI-DATA-TABLE-001: As a library user, I sort numeric and textual columns, hide or
reorder columns with a keyboard, restore defaults, and retain my layout after
reload without changing source order. Metric help explains abbreviations on
hover and focus. Album and track tables are the initial real consumers.

UI-TASK-PROGRESS-002: As a user waiting for generated media, I distinguish queued,
authoring, rendering, verification, failure and verified completion. Unknown
progress remains indeterminate; a missing heartbeat never looks like success.
