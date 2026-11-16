# Seven Website editing tasks

These are seven additional consumer changes in the next-25 run. The evidence uses
compiled production Solid components and disposable in-memory sessions. It does
not establish hosted navigation, provider deployment, publication or live records.

The repeated owner is now [`Disclosure`](../../packages/ui/src/primitives/disclosure/disclosure.tsx):
native details/summary semantics, 44px minimum summary, semantic focus and type,
wrapping and contained content. Existing versions/transfer summaries had their own
44px patches; the other five were 17px at desktop. All seven now share the owner.
No command, publication, persistence or preference ownership changed. These are
transient disclosures inside the existing persistent Website inspector.

| Surface and observed failure | Similarity search and owner decision | Delivered task improvement |
| --- | --- | --- |
| Versions & recovery: loading an empty history produced no result | Searched versions arrays and load labels across apps/shared UI; this version store's loaded/empty state belongs in `recovery/panel.tsx`, summary mechanics in Disclosure | Announces count or explains how to create the first saved version |
| Add page/navigation: an already-used address remained actionable | Searched slug comparisons across Website project commands and client; portable validation remains authoritative, duplicate feedback belongs beside this form | Names the address conflict and disables duplicate creation while preserving the draft |
| Starters & quickstart: replacement confirmation omitted the selected starter | Searched pending starter and replacement confirmations across apps; starter identity is domain data, not shared modal state | Confirmation names the selected starter before the undoable replacement |
| Product table import: keyboard focus stayed at the initiating button after review appeared | Searched review focus/status patterns in Website import and Editor review; shared controls already own focus geometry, the task owns its destination | Announces and focuses the review summary before editable product rows |
| Deployment guide: Prepare remained available with missing target IDs/names | Searched deployment target/prepare validation across Website host and client; external target validation stays in the host | Disables incomplete preparation and explains which fields must be completed |
| Live settings transfer: malformed-file errors only appeared in the outer session error | Searched snapshot retry/stale review errors across client and commerce; shared session reporting remains intact | Shows the error and retry action in the transfer disclosure while retaining the session error |
| Collections/forms/quizzes: discard after an incoming project change retained the stale flag/baseline, blocking the next apply | Searched `setBaseline`, `setStale(false)` and discard flows across apps; this staged extension editor owns the snapshot contract | Discard accepts the latest baseline, clears stale state and permits a subsequent valid apply |

## Evidence and replay

Run `bun apps/engine-editor/scripts/design-system/next25-editor/capture.ts`.
The runner compiles actual consumers into a file-only fixture, owns its headless
browser, inspects Windows window visibility, and closes the browser in `finally`.
No server is started and no provider or user project is touched.

- [Before measurements](../../.local/design-system/evidence/next25-editor/before/report.json): original expanded default states, 1440px, 390px and 200% text at 390px.
- [After measurements](../../.local/design-system/evidence/next25-editor/after/report.json): the same viewport matrix, with empty history, duplicate address, named starter confirmation, product review, missing target, malformed transfer and discarded collection states.
- Screenshot names are `{versions,pages,starters,import,deployment,transfer,collections}-{desktop,narrow,scaled}.png` in those directories. For example: [before page form](../../.local/design-system/evidence/next25-editor/before/pages-desktop.png), [after conflict](../../.local/design-system/evidence/next25-editor/after/pages-desktop.png), [after transfer error](../../.local/design-system/evidence/next25-editor/after/transfer-scaled.png).
- All 21 after states fit horizontally; shared summaries are at least 44px. Enter opens and Space closes each disclosure. Review focus, disabled actions and visible recovery messages are asserted.
- Closing skips all disclosure descendants on the next Tab. The capture records a separate completion flag and browser errors in [validation.json](../../.local/design-system/evidence/next25-editor/after/validation.json).
- The baseline shows original default states; it is not a claim that each adversarial state was captured before implementation. The stale collection failure is preserved in the focused regression.

Ten focused tests pass across `commerce-authoring.test.tsx`, `commerce-sync-panel.test.tsx`,
`pages-panel.test.tsx` and `extensions/recovery.test.tsx`; Website TypeScript passes.
The tests retain import undo, stale snapshot guards, page command equivalence and
reference-safe removal. The new stale-discard regression preserves the external
collection and verifies that the next apply succeeds. Actual hosted deployment,
screen-reader speech and a real touch device remain outside this fixture boundary.

The public Disclosure contract test also verifies that `defaultOpen` initializes
the browser-owned state once: reactive host updates cannot reopen a user-closed
section or discard an unapplied child draft. This review fixed an initial reactive
binding that could otherwise override a user's toggle when `defaultOpen` changed.
