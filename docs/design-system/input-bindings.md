# Editor project input bindings

The task is to map project actions to keyboard keys and gamepad buttons, then
save a coherent draft. This iteration is a review candidate, not user approval.

## What changed

Previously every action expanded capture, manual entry, gamepad indices, rename
and removal at once. One action consumed most of a mobile viewport. Small labels,
nested boxes and equal-weight buttons made the list difficult to scan. Save was
below unrelated preferences, invalid submissions erased drafts, and rename used
a browser prompt.

The list now shows each action and its bindings first. Native disclosures reveal
Capture keyboard key, Rename and Remove action; manual entry and gamepad indices
sit under Other binding methods. Add action precedes the list. A compact Save bar
stays above the rows while editing. Labels use shared typography, forms reflow
intrinsically, and long identifiers wrap. Existing FormField, Input and Button
provide geometry, focus and disabled states; no generic editable-table API was
introduced.

The Settings content pane has an explicit height within its tab panel so it owns
scrolling. Browser verification caught the previous unbounded pane: programmatic
focus scrolled the surrounding tabs and hid the sticky Save bar behind the dialog
header. The acceptance check verifies the actual Save hit target after a long edit.

Inline rename preserves context. Failed submissions retain their drafts and
show local errors. Shared bindings remain allowed and explicitly explained.
Only one action captures a key at a time; Escape, Tab, leaving the button, window blur and closing
the action cancel capture. Changes remain staged until Save settings.

## A visual task exposed a save bug

The old rename helper updated references in a temporary project, but the view
retained only the input array. Save discarded the reference changes.

The view now stages a complete project snapshot. `editor-input-draft.ts` derives
targeted reference edits by scene/entity/component/field identity. Save checks
the original mappings and affected reference values before applying input and
reference changes together in one history transaction. Unrelated current scene
edits survive. Concurrent input/reference changes produce an error and retain
the draft; reopen Settings to reconcile them. Renaming does not permit deleting
a still-referenced action.

Stable action keys keep drafts and focus intact when another row changes. A
successful add or rename opens and focuses its resulting row. Successful Save
refreshes the baseline so the next edit can be saved too.

## Visual evidence

| State | Before | After |
| --- | --- | --- |
| Desktop 1440×1000 | [Original](../../.local/design-system/evidence/input-bindings/before/desktop.png) | [Current](../../.local/design-system/evidence/input-bindings/after/desktop.png) |
| Tablet 820×1000 | [Original](../../.local/design-system/evidence/input-bindings/before/tablet.png) | [Current](../../.local/design-system/evidence/input-bindings/after/tablet.png) |
| Mobile 390×844 | [Original](../../.local/design-system/evidence/input-bindings/before/mobile-panel.png) | [Current](../../.local/design-system/evidence/input-bindings/after/mobile-panel.png) |

Additional states: [inline error](../../.local/design-system/evidence/input-bindings/after/mobile-error.png),
[expanded tools](../../.local/design-system/evidence/input-bindings/after/mobile-expanded.png),
[long action](../../.local/design-system/evidence/input-bindings/after/mobile-long-action.png),
[last of 24 actions](../../.local/design-system/evidence/input-bindings/after/mobile-many-actions-bottom.png),
[empty list](../../.local/design-system/evidence/input-bindings/after/mobile-empty.png),
[expanded 200% touch](../../.local/design-system/evidence/input-bindings/after/touch-expanded-text200.png),
and [saved referenced rename](../../.local/design-system/evidence/input-bindings/after/mobile-referenced-rename-saved.png).

The comparison demonstrates a scanable action list and commit boundary rather
than exposing all controls immediately. It adds one disclosure step before
editing an existing action. Hardware gamepad input itself was not exercised;
the visible gamepad-binding authoring path was.

## Repeatable acceptance

Reuse the managed Editor and set `EDITOR_URL` to its returned URL:

```powershell
bun apps/engine-editor/scripts/design-system/capture-input-bindings.ts
bun test --conditions=browser apps/engine-editor/src/app/input-map-editor.test.tsx apps/engine-editor/src/app/editor-input-draft.test.ts apps/engine-editor/src/editor-input-model.test.ts apps/engine-editor/src/app/editor-capability-parity.test.ts apps/engine-editor/src/components/editor-center-content.test.tsx
bun run typecheck:editor
bun run check:process-policy
```

`DESIGN_EVIDENCE_DIR` overrides output; `DESIGN_CAPTURE_PHASE=before` captures the
currently running source, not a reconstructed historical version. The script
owns its headless browser, verifies actual Windows window visibility, and uses a
disposable project without filesystem saves or real AI calls.

The [report](../../.local/design-system/evidence/input-bindings/after/report.json) records viewport, scaling,
touch, draft validation and editing checks. DOM-free fixtures provide a larger
action list and reference cases; visible UI edits exercise Save and command undo.
[Command handoffs](../../.local/design-system/evidence/input-bindings/after/command-handoffs.json) and the
[final snapshot](../../.local/design-system/evidence/input-bindings/after/final-snapshot.json) retain evidence.

Focused unit/component validation passes: 19 tests / 298 assertions, plus Editor
typechecks and targeted lint. Broader package typechecks retain unrelated
creative-preset and older AI-fixture errors. Source structure remains blocked by
the PadPilot evaluator file-count baseline; the touched Editor shell baseline
was ratcheted downward.

## Durable lessons and limits

- Save must include semantic side effects, not only visible form values.
- Preserve invalid drafts; clearing a successful optional add field must not
  display a required-field error.
- Keep commit controls reachable while the list grows; test actual hit targets.
- Retain row identity through parent updates and give capture an explicit owner.

Other Editor preferences still use the older dense layout. The design system
does not yet provide a generic table, capture control or draft transaction API.
Remaining work belongs in the [debt inventory](design-debt.md).

Next real surface: **Harness jobs roster**. It will test the same readable list
defaults against asynchronous state, large lists, and selection/detail hierarchy
in another application.
