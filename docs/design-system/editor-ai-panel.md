# Editor AI: conversation and review first

2026-09-19. Candidate visual reference, not user approval.

## Task and structure

The creator describes a project change, reviews the proposal, then explicitly
applies it. The old panel gave suggestions, credentials and four profile selectors
permanent space. At 390px, these squeezed the transcript into a small nested
viewport even before a proposal arrived. Conditional grid children also competed
for rows whose positions assumed a fixed set of states.

**Project assistant** now has three stable regions: a compact header, a scrolling
conversation/review body, and an anchored composer. The header retains provider,
model and inheritance scope. **AI settings** temporarily replaces the body;
closing it preserves the draft and proposal. **Try a suggestion** opens examples
only when requested, and choosing one fills and focuses the prompt without a run.

The shared ChatComposer has no profile selectors in this consumer. Shared
SelectControl, FormField/Input and Button provide the local settings screen.
There is no new generic chat shell or settings framework. Desktop width is bounded
at 38rem; at 600px and below the panel uses an 8px viewport inset and dynamic
viewport height. Long review and configuration content scroll independently of
the anchored composer.

## Behavior preserved and corrected

Shared provider/reasoning defaults, explicit Editor overrides, per-run refresh,
task-derived context, semantic command compilation and revision guards remain.
Nothing applies automatically. Apply/Revert regressions exercise the real DOM-free
session, including newer edits that must not be reverted.

The redesign exposed and fixed two existing failures: the review helper's default
eight-action cap hid later actions, and a failed planning request discarded its
draft. Every proposed action now appears, and failures restore the request for
explicit retry. Cancel remains beside Send while planning. Late cancelled results
cannot publish a proposal.

Credential setup is inside settings and only shown for the direct runtime.
CLI account copy does not imply verified access. Saves disable duplicates, retain
failed drafts, clear drafts on provider change/close, and report storage separately
from provider access. Refreshing the same provider retains the save outcome.
Escape dismisses the top selector, then settings, then the panel, returning focus.
The panel remains nonmodal so desktop project work can continue alongside it.

## Visual evidence

The real catalog is unchanged between before and after, including its currently
unhelpful research-model fallback and missing API key. This is layout evidence,
not model-quality or credential validation. Password fields are masked even when
empty. Browser profiles are disposable; no real provider call or project write
was made.

| State | Before | After |
| --- | --- | --- |
| Desktop 1440x1000 | [Original](../../.local/design-system/evidence/editor-ai-redesign/before/editor-ai-desktop.png) | [Current](../../.local/design-system/evidence/editor-ai-redesign/after/desktop.png) |
| Tablet 820x1000 | [Original](../../.local/design-system/evidence/editor-ai-redesign/before/editor-ai-tablet.png) | [Current](../../.local/design-system/evidence/editor-ai-redesign/after/tablet.png) |
| Mobile 390x844 | [Original](../../.local/design-system/evidence/editor-ai-redesign/before/editor-ai-mobile.png) | [Current](../../.local/design-system/evidence/editor-ai-redesign/after/mobile.png) |
| Short 390x600 | | [Current](../../.local/design-system/evidence/editor-ai-redesign/after/short.png) |
| Settings | | [Desktop](../../.local/design-system/evidence/editor-ai-redesign/after/settings-desktop.png), [mobile](../../.local/design-system/evidence/editor-ai-redesign/after/settings-mobile.png), [last controls](../../.local/design-system/evidence/editor-ai-redesign/after/settings-short-bottom.png) |
| Scaling/input | | [200% text](../../.local/design-system/evidence/editor-ai-redesign/after/text200.png), [touch](../../.local/design-system/evidence/editor-ai-redesign/after/touch.png) |

The mobile conversation/review body is now 541px tall in an 828px panel. The gain
comes from both progressive disclosure and reclaimed viewport space; it is not
solely a typography change. Settings and review can remain long, but they cannot
push the prompt or Send below the panel.

Clearly intercepted fixtures verify [twelve actions and long intent](../../.local/design-system/evidence/editor-ai-redesign/after/fixture-long-review-mobile-top.png),
[Apply after scrolling](../../.local/design-system/evidence/editor-ai-redesign/after/fixture-long-review-mobile.png),
[request failure](../../.local/design-system/evidence/editor-ai-redesign/after/fixture-error-mobile.png), and
[planning cancellation](../../.local/design-system/evidence/editor-ai-redesign/after/fixture-loading-mobile.png).
The fixture run responses are synthetic; the catalog, controls, layout and command
session are real. Browser validation leaves the session revision unchanged.

## Repeatable acceptance

Start/reuse the managed Editor and set `EDITOR_URL` to its returned URL:

```powershell
bun apps/engine-editor/scripts/design-system/capture-editor-ai-review.ts
bun test --conditions=browser apps/engine-editor/src/ai/editor-ai-panel.test.tsx apps/engine-editor/src/ai/editor-ai-lifecycle.test.tsx apps/engine-editor/src/ai/editor-ai-actions.test.ts apps/engine-editor/src/ai/editor-ai-client.test.ts
bun run typecheck:editor
bun run typecheck:packages
bun run check:process-policy
```

The original `capture-editor-ai.ts` command delegates to this current validator;
the original layout can only be reproduced from its corresponding source state.
`DESIGN_EVIDENCE_DIR` overrides output. The runner owns headless browser cleanup
and checks actual Windows window visibility. The [report](../../.local/design-system/evidence/editor-ai-redesign/after/report.json)
records geometry, hit testing, all twelve review rows, empty/short prompts,
suggestion focus, nested Escape, draft recovery, cancellation, 44px touch targets,
and no unexpected AI writes.

Checkpoint: 22 targeted tests / 234 assertions, Editor/package typechecks and
browser acceptance passed. The unrelated source-structure gate still fails on
the PadPilot synaesthetic-evaluator directory (38 files versus baseline 36).
No native host, paid provider connection or end-to-end model quality is claimed.
The shared Editor supervisor retains historical website/build errors outside this
surface; this pass did not mark that backlog resolved. The current UI build and
browser run passed with zero page errors, and the shared server remains running.

## Remaining debt and next surface

The [inventory](design-debt.md) owns remaining work. The subsequent
[action review](#action-review) adds direct field previews and
explicit generated parameters. Shared transcript metadata retains legacy
typography. Catalog-order model fallback and silent optional storage failures
remain separate issues. The [property inspector](editor-inspector.md) records
the subsequent field-hierarchy and stable-focus work.

## Action review

Proposals identify affected objects and fields. Direct patches show resolved
Before/After values, removal is explicit, and long values stack at narrow widths.
The first action is expanded; other actions use disclosures. Fields are paged in
batches of twenty without dropping actions. Apply follows the complete review.

Generated commands first expose their parameters, then **Preview generated
changes** executes the compiled commands in an isolated command session and asset
host. Apply remains disabled for pending, failed, oversized, stale or incomplete
previews. The preview includes command results and generated asset byte counts;
it establishes data outcomes, not rendered quality. Applying may allocate new IDs.

`apps/engine-editor/src/ai/editor-ai-review-model.ts` and its tests own direct
review behavior; `editor-ai-outcome-preview.ts` owns isolated execution. Disposable
screenshots and review notes live in `.local/design-system/`, with reusable
decisions retained here and in the design-debt inventory.
