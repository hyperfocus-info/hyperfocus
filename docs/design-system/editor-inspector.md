# Editor entity inspector

The task is to inspect and edit the selected 2D entity without losing its context.
Editing a property is the primary interaction; component administration and AI
refinement are secondary. This is a review candidate, not an approved design.

## Hierarchy and behavior

Previously, two boxed AI forms preceded Name and Transform. On a 390px screen,
Name appeared near the bottom of the first viewport. Component labels ranged
from 7–10px, nested behavior groups added borders, and the 820px workbench left
only about 176px for the inspector.

The selected name and identity now lead directly into Name, Transform, Appearance,
and Components. All common fields fit in the first mobile viewport. Native
disclosures retain discoverable component names, Character refinement, and
Generated TypeScript mapping without showing their full controls immediately.
AI review and Apply remain unchanged; opening a disclosure never mutates a project.
Component menus retain enable, duplicate, reset, and remove command hooks.

Existing Input, SelectControl, Button and typography supply the defaults. Numeric
fields use intrinsic columns with a 7rem minimum; labels stay above controls.
Component fields and Add forms stack. Behavior groups use spacing and legends
instead of nested boxes. Inputs are 36px minimum, 44px for coarse pointers.

The Editor uses the existing single-pane dock mode below 960px of workbench
width. Project, Workspace, Inspector, and Console remain available as tabs;
desktop layout and selection are preserved. A 760px threshold failed at tablet
width with 200% text. The revised threshold passes that exact reproduction.

Project transactions clone entity and component objects. Rendering by stable
entity/component/field keys now preserves focus and open sections across those
updates. Changing the selected entity intentionally resets local refinement
drafts and disclosures. Regression tests include false, zero and empty values.

The Add component form owns its pending choice separately from project data. It
retains that choice across same-entity edits, resets it when a singleton becomes
unavailable, and starts fresh on entity changes. The shell resolves Add through
the form's stable data attribute. Shared search and controlled-value behavior stay
in `SelectControl`.

## Before and after

| Viewport | Before | After |
| --- | --- | --- |
| Desktop 1440×1000 | [Original](../../.local/design-system/evidence/inspector/before/desktop.png) | [Current](../../.local/design-system/evidence/inspector/after/desktop.png) |
| Tablet 820×1000 | [Original](../../.local/design-system/evidence/inspector/before/tablet.png) | [Current](../../.local/design-system/evidence/inspector/after/tablet.png) |
| Mobile 390×844 | [Original panel](../../.local/design-system/evidence/inspector/before/mobile-panel.png) | [Current panel](../../.local/design-system/evidence/inspector/after/mobile-panel.png) |

Additional evidence: [expanded component](../../.local/design-system/evidence/inspector/after/mobile-component.png),
[refinement](../../.local/design-system/evidence/inspector/after/mobile-refinement.png),
[long name](../../.local/design-system/evidence/inspector/after/mobile-long-label.png),
[200% tablet text](../../.local/design-system/evidence/inspector/after/tablet-text200.png),
[last disclosure](../../.local/design-system/evidence/inspector/after/mobile-bottom.png).
The improvement is earlier access to ordinary editing and readable controls;
advanced components still require scrolling, and one-pane tablet editing trades
simultaneous canvas visibility for usable controls.

## Repeatable acceptance

Reuse the managed Editor and set `EDITOR_URL` to its returned URL:

```powershell
bun apps/engine-editor/scripts/design-system/capture-inspector.ts
bun test --conditions=browser apps/engine-editor/src/components/selection-inspector.test.tsx apps/engine-editor/src/scene2d/character-ui-actions.test.ts apps/engine-editor/src/app/editor-capability-parity.test.ts apps/engine-editor/src/editor-shell-boundary.test.tsx apps/engine-editor/src/editor-responsive-layout.test.ts apps/engine-editor/src/editor-workspace-layouts.test.ts
bun run typecheck:editor
bun run check:process-policy
```

`DESIGN_CAPTURE_PHASE=before` captures the source currently running; it cannot
reconstruct the previous implementation. `DESIGN_EVIDENCE_DIR` overrides output.
The script owns a headless browser and verifies no visible Windows windows.
It does not contact an AI provider or save project files.

The [report](../../.local/design-system/evidence/inspector/after/report.json) covers 1440, 820, 390, 2560px,
390×600, text scaling at both 390 and 820px, coarse pointers, empty/long names,
keyboard disclosure, all five real component sections, selection changes, and
final-control reachability. A visible X edit must synchronize the transform
component; the DOM-free command API then undoes it. Explicit
[handoffs](../../.local/design-system/evidence/inspector/after/command-handoffs.json) and a
[final snapshot](../../.local/design-system/evidence/inspector/after/final-snapshot.json) preserve the result.

The same checker now follows Component type through empty-search recovery,
keyboard Camera selection, retained choice, Add, the visible Camera card and
authoritative command snapshot, then one undo restoring the complete project.
It runs in the desktop inspector and 390px viewport, saving `component-add-*`
screenshots and before/after snapshots beside the report. This acceptance covers
the completed addition; popup filtering or button presence alone is insufficient.

Checkpoint: 25 focused tests / 373 assertions, Editor application/test typechecks,
targeted lint, browser checks, and process policy pass. The broader package
typecheck is blocked by existing creative-preset timeline types and optional
snapshots in the older AI review fixture. Source structure remains blocked by
the unrelated PadPilot evaluator directory (38 files against its 36-file baseline).
No baseline was raised and shared-server historical errors were not marked fixed.

## Limits and next task

This iteration covers the 2D entity inspector. Assets, 3D properties and project
input bindings retain separate requirements. The AI launcher still overlays the
lower-right work area; browser scrolling reaches the tested fields, but overlay
composition needs a dedicated real interaction check. Native-host acceptance is
not established. Design debt remains in [the canonical inventory](design-debt.md).

Next: **Editor project input bindings**. Repeated editable rows, long action names,
validation, add/remove operations and keyboard navigation will stress-test whether
the same control defaults support a practical settings table.
