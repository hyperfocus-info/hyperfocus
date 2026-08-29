# Shared UI User Stories

Canonical consumer-story inventory for reusable UI surfaces in `@hyperfocus/ui`.
Application workflows belong in the owning app story document; this file covers
shared interaction contracts.

Story IDs are stable. Update this file when adding, removing, or materially
changing a reusable UI surface.

## Stories

UI-PRIMITIVES-001: As an application author, I use shared buttons, inputs, tabs,
segmented controls, sheets, dialogs, tooltips, and menus so that first-party apps
share accessible interaction mechanics.

UI-OVERLAY-001: As a keyboard user, I open and close dialogs, sheets, popovers,
menus, and tooltips with predictable focus return and Escape behavior.

UI-WORKBENCH-001: As an application author, I compose persistent panes through
`PanelGroup` and workbench primitives so that resizing, collapse, persistence, and
narrow-layout behavior are consistent.

UI-PREFERENCES-001: As an application author, I define shared-user, app-user,
project, and session preferences through one model so that chrome settings do not
leak into project data.

UI-COMPOSER-001: As an application author, I reuse composer controls for prompts,
attachments, model/runtime selectors, and send states while the host maps actions
to its own commands.

UI-TRANSCRIPT-001: As a reader, I see markdown, code, tables, blockquotes, and
streaming transcript content rendered safely and legibly across apps while long
histories keep Markdown parsing and mounted DOM bounded to the visible window.

UI-TERMINAL-001: As an application author, I embed terminal surfaces with bounded
history, keyboard handling, search, and resize mechanics while the host owns the
process and transport.

UI-SOURCE-EDITOR-001: As a creator, I edit source text through a reusable editor
surface whose document state, selection, and host commands remain explicit.

UI-TREE-001: As a keyboard user, I navigate hierarchical project data through a
shared tree with stable selection, expansion, and accessible labels.

## Verification

Reusable UI behavior is covered by colocated tests under `packages/ui/src`. Use
[Package Testing](../../docs/package-testing.md) for verification scope and
[DESIGN.md](../../DESIGN.md) for design acceptance.

Related: [Repository user-story map](../../docs/user-stories.md).
