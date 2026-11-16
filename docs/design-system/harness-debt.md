# Harness preferences and execution evidence

The screenshot-review follow-up reserves intrinsic header space for application
and surface context. Help and Trace now live in Workspace actions; notifications
and execution pause/resume remain visible. Preferences use shared radio-based
segmented controls with arrow-key navigation instead of unrelated text buttons.
Run `bun packages/ui/scripts/design-system/harness-debt/capture.ts --settings-only`
for all nine sections at desktop, 320px and 200% tablet text, header collision and
label-overflow checks, and workspace-menu keyboard/focus recovery. The report
labels this narrower scope; prior Jobs/trace captures are not refreshed by it.

Health now leads with the diagnosis and presents summary metrics as aligned
semantic rows. Keybindings use flat divided rows with integrated remove controls.
Run `bun packages/ui/scripts/design-system/harness-debt/capture-health.ts` for the
separate desktop/mobile/200% Health captures and metric overlap checks; its
`health-report.json` records that bounded scope.

The 2026-09-21 pass closes the observed browser scope of DD-004 and DD-016.
The shared visual constitution and tokens remain authoritative; this is the
consumer handoff, not a second component system.

## Problems corrected

- All nine settings sections inherited tiny tracked labels and decorative row
  borders. Preference rows now use readable headings, wrapping explanation and
  simple separators. General and IDE subrows follow the same composition.
- Viewport breakpoints selected two-column settings at 200% text even when the
  actual columns were too narrow. Intrinsic grids now fit their available space;
  zero-minimum grid tracks prevent nested fields from widening the page.
- The legacy Input is now an import adapter to the canonical shared Input.
  Local button dimensions are minimums with 44px coarse-pointer targets;
  textareas fit their container and preserve native resizing.
- Narrow navigation changed selected settings without showing their destination.
  The host now uses the existing controlled PanelGroup mode. Settings, project
  navigation, job/run selection and assistant selection hand off to Work;
  selecting the same settings section again also reveals it.
- Job detail exposes Next and run/edit actions before optional schedule and
  ownership facts. Trace keeps run identity, failure and evidence; repeated job
  attributes and duplicate agent counts no longer compete with its log.
- Trace context has a bounded height, optional run context is disclosed, and
  the log uses the remaining space without its footer overlapping it.
- Health retains column correspondence in a labeled, keyboard-focusable local
  horizontal viewport. Long values wrap; mobile no longer stacks unlabeled
  cells. Window choices expose their pressed state.
- Dialog headings use semantic type, omit an uninformative default eyebrow,
  and reserve header/footer space around one shrinking scroll region. The job
  editor retains its existing validation and schedule-preview transport.
- Context menus now share overlay priority, select enabled rows with arrows,
  Home/End, fit the viewport, and return focus on Escape without closing the
  parent dialog. Existing Tab and pointer dismissal remain available.

The same sub-caption typography pattern was removed from assistant, project
navigation, chat/tool/Markdown metadata, notification/setup/mode composition,
app chrome, IDE chrome, status chips, context menus and button groups. Terminal
and code glyph sizing was deliberately left to their own display preferences.
These adjacent consumers have focused component coverage; the browser matrix
below establishes settings and execution acceptance, not every possible state
of every adjacent component.

## Evidence and reproduction

- [Before jobs/detail](../../.local/design-system/evidence/harness-debt/before/desktop.png) and
  [after detail](../../.local/design-system/evidence/harness-debt/after/desktop-job-detail.png).
- [320px settings](../../.local/design-system/evidence/harness-debt/after/mobile-preferences-workspace-memory.png),
  [200% settings](../../.local/design-system/evidence/harness-debt/after/tablet200-preferences-general-ui.png),
  [320px trace](../../.local/design-system/evidence/harness-debt/after/mobile-trace.png),
  [200% Health table](../../.local/design-system/evidence/harness-debt/after/tablet200-health-table.png),
  [scaled job editor](../../.local/design-system/evidence/harness-debt/after/tablet200-job-edit.png).
- [Machine report](../../.local/design-system/evidence/harness-debt/after/report.json) and
  [owned browser window inspection](../../.local/design-system/evidence/harness-debt/after/browser-windows.json).

Use the managed Harness server, then:

```powershell
bun.cmd apps/harness/scripts/build-ui.ts
bun.cmd packages/ui/scripts/design-system/harness-debt/capture.ts
bun.cmd run typecheck:harness
```

The build ensures screenshots use current compiled StyleX assets. Capture uses
the real app with intercepted boot/diagnostic fixtures, 120 jobs and 120 long
execution events. It forwards no WebSocket commands and aborts non-GET API
requests. It covers all nine preference sections at desktop, 320px and 820px
with 200% text; job metadata keyboard disclosure, edit/cancel/focus return,
full log evidence, trace reading area, local Health scrolling, context-menu
keyboard recovery and touch control geometry. Errors fail the run. Browser
processes are owned, headless and closed in finally; the shared server remains.

Focused regression command:

Validation: 218 focused tests pass (796 assertions including the final table-role
regression). The 55-group browser matrix passes with no page errors or visible
owned windows. Actual trace reading space is 570px desktop, 171px at 320px and
135px at 820px with 200% text; the footer does not overlap it. Harness typecheck,
targeted lint and the current UI build pass.

```powershell
bun.cmd test --conditions=browser apps/harness/ui/src/app.test.tsx apps/harness/ui/src/components/preferences-modal.test.tsx apps/harness/ui/src/components/preferences apps/harness/ui/src/components/primitives/dialog.test.tsx apps/harness/ui/src/components/primitives/execution-log.test.tsx apps/harness/ui/src/components/primitives/dropdown.test.tsx apps/harness/ui/src/components/background-jobs-panel.test.tsx apps/harness/ui/src/components/background-jobs apps/harness/ui/src/components/trace-panel.test.tsx apps/harness/ui/src/components/assistants-panel.test.tsx apps/harness/ui/src/components/markdown-content.test.tsx apps/harness/ui/src/components/project-sidebar.test.tsx apps/harness/ui/src/ide/ide-workbench.test.tsx
```

Do not infer real scheduler recovery, credential persistence, provider execution
or native acceptance from intercepted UI evidence. Existing historical server
errors remain in the development registry; this pass does not mark them fixed.
The unrelated evaluator folder still exceeds its source-count baseline.
