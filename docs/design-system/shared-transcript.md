# Shared AI transcript

The screenshot-review follow-up reduces empty-message padding and compact
composer height so enlarged text retains reading space. Editor hides optional
provider metadata at narrow widths while keeping the assistant title visible.
Both host captures now check the transcript's visible intersection through its
clipping ancestors, rather than accepting an offscreen child with a large height.

The task is to read a conversation, inspect rich content, and return to the newest
response without losing one's place. Editor and PadPilot are the real consumers
for this iteration. Evidence remains a review candidate, not user approval.

## Observed friction

Role labels used roughly 10px tracked uppercase type and body text used an
independent 0.78rem size. Every response sat in a bordered bubble. Markdown relied
on host/browser defaults, and a long code line expanded scrollWidth to 1244px in
325px Editor and 317px PadPilot mobile transcripts.

PadPilot's positional grid assigned the growing row to different content when
optional error/proposal rows appeared. Its mobile conversation was only 90px high.
The shared transcript also lacked keyboard focus and an explicit return control.

## Defaults now encoded

ChatTranscript uses semantic caption/body/heading roles and the existing spacing
scale. User messages retain a raised background; assistant responses use quiet
grouping and readable role labels. Pending text keeps full contrast with a visible
Responding label. Sanitized Markdown still uses the existing renderer.

`transcript-markdown.tsx` supplies local presentation defaults: prose and long
identifiers wrap; code and comparison tables scroll within labeled, keyboard-
focusable regions. Headings, lists and quotations have predictable rhythm. These
renderers remain transcript-local, not a new general Markdown framework.

The conversation viewport is keyboard-focusable. Return to latest appears when
reading away from the end and restores focus to the viewport after activation.
Virtual remounts have live announcements disabled; a separate status reports
response state/message count. No screen-reader session is claimed by these checks.

The initial PadPilot pass gave the transcript a growing slot, but left selectors
inside a scrolling composer. The subsequent [Suggest AI iteration](padpilot-suggest.md)
moves setup and suggestions into Settings, keeps the composer visible and gives
the transcript its own bounded reading viewport. Feedback scrolls separately.
Short-height validation measures the reading area through clipping ancestors,
not just the height of a child or the reachability of Send. Profile, cancellation,
credential and reviewed Apply contracts remain intact.

## Reading stability is part of visual quality

The existing measured window and coalesced streaming remain intact. A new browser
regression reproduced a 275px jump when appending to a capped 10,000-message history.
The view now preserves a retained message's offset as earlier rows leave the
window and as measured heights change above it. Row transforms depend explicitly
on measurement updates. Auto-follow distinguishes its own scroll from a user
reading older content. The final retained-anchor check stays at -39px before/after.

In the Editor host, Space initially started canvas playback instead of scrolling
the focused conversation. The global shortcut now yields within a log. The
two-host capture preserves that reproduction; isolated component tests alone
could not detect it.

## Before and after

| Host / mobile panel | Before | After |
| --- | --- | --- |
| Editor | [Original](../../.local/design-system/evidence/transcript/before/editor-mobile-panel.png) | [Current](../../.local/design-system/evidence/transcript/after/editor-mobile-panel.png) |
| PadPilot | [Original](../../.local/design-system/evidence/transcript/before/padpilot-mobile-panel.png) | [Current](../../.local/design-system/evidence/transcript/after/padpilot-mobile-panel.png) |

Desktop/tablet, scaled, touch, empty/loading/error and history views sit beside
these images. The [host report](../../.local/design-system/evidence/transcript/after/report.json) records 32
checks: both 42-message conversations mount nine rows, append preserves the
older reading position, Return to latest reaches the end, and local code scrolling
works. Wide Markdown stays inside each viewport. PadPilot mobile improves from
90 to 233px; 200% text retains 169px, and the short view retains 119px with reachable Send.

The [shared browser report](../../.local/design-system/evidence/transcript/after/shared-browser-report.json)
records five structural/streaming workloads plus reading, scaling and retention
checks. Timing is diagnostic; bounded DOM and reduced stream work are gates.
Large repeated fixture strings are omitted from this retained report.

## Repeatable acceptance

Reuse the managed Editor and PadPilot servers and pass their returned URLs:

```powershell
bun packages/ui/scripts/design-system/capture-transcript.ts
bun run --cwd packages/ui test
bun run --cwd packages/ui build
bun run typecheck:editor
bun run typecheck:pad-pilot
bun run check:process-policy
```

Set EDITOR_URL, PADPILOT_URL and optionally DESIGN_EVIDENCE_DIR.
DESIGN_CAPTURE_PHASE=before captures the currently served source. The fixture
intercepts catalogs/responses and uses disposable browser state: no real AI call,
credential save or filesystem project persistence. Hosts currently return complete
responses, so host streaming is not fabricated; the shared browser fixture tests
pending streaming directly. Native PadPilot/DAW behavior remains unverified.

Full shared UI tests pass: 58 tests / 301 assertions. Shared UI build, Editor and
PadPilot typechecks, scoped lint and process policy pass. Focused PadPilot app/
responsive checks have eight passes and one unrelated settings-test failure on
obsolete copy and an incomplete preferences fixture. Broader package typechecking
retains creative-preset-authoring and older input-bindings-checks errors. Source
structure remains blocked by the PadPilot evaluator file-count baseline.

Owned browser and isolated PadPilot server were closed; Windows inspections found
no visible automation windows. The existing shared PadPilot lock was left alone,
and historical Editor errors were not marked resolved.

## Scope and next surface

No new tokens, theme engine, transcript transport or history store were needed.
Durable paging remains host-owned. This does not establish arbitrary history
replacement/prepend anchoring, selection retention for unmounted text, or native
assistive-technology behavior. Existing native acceptance remains in the
[debt inventory](design-debt.md).

Next real surface: **Editor asset inspector**. Its mixed image/audio metadata,
previews and recovery states will stress the field and rich-content defaults in
a concrete media workflow.
