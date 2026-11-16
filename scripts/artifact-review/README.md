# Artifact review

A review client for generated video, audio, images, and text. Its persistence is
the shared [@hyperfocus/review-store](../../packages/review-store/README.md)
SQLite primitive, also used by the synaesthetic evaluator's native structured
reviews. Generators register immutable assets; people annotate exact versions;
agents query durable feedback. No generation or publishing service is included.

The private workspace package `@hyperfocus/artifact-review` exposes `/create`,
`/schema` and `/server` for named repository hosts. The standalone review CLI and
Touch of Death's combined game/audio-review delivery share these same manifest,
HTTP and SQLite behaviors. Root CLI adapters retain their original commands;
internal consumers import the package directly. Host composition does not replace the shared review
surface or move its feedback between campaigns.

## Create and open a review

Write a small input file; media paths are relative to that input file:

```json
{
  "id": "my-review",
  "title": "Pick the strongest cut",
  "items": [{
    "id": "cut-a",
    "title": "First cut",
    "kind": "video",
    "media": "cut-a.mp4",
    "sections": [{ "id": "hook", "title": "Opening", "startSeconds": 0, "endSeconds": 2 }]
  }]
}
```

```powershell
bun.cmd scripts/artifact-review/create.ts input.json .local/my-review/manifest.json
$env:ARTIFACT_REVIEW_MANIFEST = (Resolve-Path .local/my-review/manifest.json).Path
bun.cmd .agents/skills/dev-server/scripts/dev.ts start artifact-review --json
```

The helper hashes the actual content and defaults version to 1. Increase the
version when changing the artifact; keep the campaign ID and item ID stable so
the history stays connected. Supply `text` instead of `media` for text
items. Optional `dimensions` define named score bounds; `sections` can anchor
feedback to passages or text. The runtime contract lives in [schema.ts](../../packages/artifact-review/src/schema.ts).

Curated reference inputs may include `expectedSha256`. Creation then rejects
changed source bytes before replacing the manifest. Update the hash and version
deliberately when revising a reference; do not silently attach its existing
feedback to a different capture.

The supervisor binds the review host to the local network and reports its port
(default 4318). Use `http://192.168.4.23:<reported-port>` on the current Wi-Fi.
Only listed media and the review UI are served. There is no account layer: people
with access to this local endpoint share the review. Never expose it to the public
internet. Credential files and arbitrary workspace paths are not served.

The host loads one manifest and builds the UI at startup. To switch reviews or
load UI edits, stop only this surface, then run the start command again:

```powershell
bun.cmd run dev:stop -- artifact-review
```

## Review and consume feedback

- For paired images, choose **Review before** or **Review after**. Overall feedback
  and region notes belong to that image only. **Actual size** enables pixel-size
  inspection inside a scrollable viewport; **Fit image** restores the comparison.
- Choose **Draw region**, drag over the selected image, write a note, then **Add
  note**. Touch dragging is supported. **Set region with keyboard** accepts image
  percentages. Saved rectangles remain aligned on resize; click a rectangle or its
  note's **Edit** button to revise it. Unsubmitted notes warn before changing images.

- Pause and choose **Note this moment**, or enter a start/end range. Add multiple
  notes, edit/delete them, and jump back to their timestamps.
- Use **Previous** and **Next** beside the player to move through larger batches;
  each output retains its own feedback.
- Choose a named section to annotate text or an evaluator suggestion.
- Overall notes and ratings save automatically. **Add note** commits a section
  annotation. No download/import step exists; agents query the shared database.
- Saves use the matching adjacent `review-descriptor.json` authority when present;
  otherwise they go to `feedback.sqlite` beside the manifest. Hosts may pass an
  explicit database; the standalone CLI accepts `ARTIFACT_REVIEW_DATABASE`.
  The latest review and every
  previous save are retained with their version/hash. Asset bytes are snapshotted
  in SQLite, so replacing a source file cannot change old review evidence. New
  versions start unrated; earlier versions remain in the history UI. Reviews are
  not persisted in the browser. Keep the page open and retry when a save fails;
  unsaved edits exist only in memory. Conflicting device edits require explicitly
  loading the saved copy before continuing.

`GET /api/manifest` returns the review with media URLs. `GET /api/feedback` returns
`{items: {[id]: {revision, updatedAt, review}}}`. Unsaved items have revision 0 and
null review. `PUT /api/feedback/:id` accepts `{expectedRevision, review}` from the
same origin, validates identity and anchors, and returns 409 on a stale revision.
`GET /api/history/:id` returns asset versions and their feedback revisions.
`/media/:id?version=<version>` reads that version's bytes from SQLite. The host
imports its previous `review_history` once, retaining old tables as migration
evidence. Missing original bytes for legacy reviews are labeled unavailable.
JSON manifests describe incoming assets; they do not store reviews.
Agents should read feedback, preserve the rated version, generate a new version,
and explain how its changes address specific annotations. A grade is not publishing
approval and does not automatically trigger generation.

## Existing consumers

Design-system evidence uses the same server and SQLite store:

```powershell
bun.cmd scripts/artifact-review/design-system/prepare.ts --batch next25-batch6
$env:ARTIFACT_REVIEW_MANIFEST = (Resolve-Path .local/design-system/review/manifest.json).Path
bun.cmd .agents/skills/dev-server/scripts/dev.ts start artifact-review --json
```

`--append` retains previous queued images while adding the selected batch; repeated
preparation replaces matching identities without duplicating them. Keep using the
same output directory so earlier feedback remains in its SQLite database.
Appended entries are also checked against their declared hashes; stale sources
abort preparation before it replaces the manifest.
`--batch all` includes the full evidence archive; `--output <manifest.json>` selects
an output path. Only exact before/after filenames are paired. Unmatched images are
labeled explicitly; matching filenames do not imply identical fixtures or states.
Item IDs remain stable across edits. Versions digest image bytes and review metadata,
so changed evidence never inherits a prior version's feedback. Keep the same output
directory to preserve `feedback.sqlite`. The manifest limit is 3,000. The [design evolution skill](../../.agents/skills/design-system-evolution/SKILL.md)
owns the implementation/review/debt loop.

### Integrity and relocation

Check source hashes separately from cached availability before sharing a review:

```powershell
bun.cmd scripts/artifact-review/inspect.ts .local/design-system/review/manifest.json --output .local/design-system/review/integrity.json
```

This command is read-only, follows the host's database authority, and never
creates a missing database. It fails for missing/changed source bytes or a
corrupt cache. A valid cached copy can still make media available while its
source is missing; the report preserves that distinction. Optional `--database`
selects the same explicit override supported by the host. The report does not
grade artifacts or certify human approval.

When evidence moves, use the owning preparer instead of editing asset identity:

```powershell
bun.cmd scripts/artifact-review/design-system/prepare.ts --relocate-from docs/design-system/evidence --output .local/design-system/review/manifest.json
```

`--evidence-root` overrides the new root (default `.local/design-system/evidence`).
Every source is hashed before writing. Matching bytes retain the campaign,
item, version and review metadata; SQLite is never modified. Changed bytes
normally abort the operation. After inspecting the change, `--revise-changed`
explicitly creates new versions for only those items and archives the old
manifest under adjacent `manifest-history/<sha256>.json`. That receipt preserves
historical identity; it cannot recover old bytes that were never cached.
Previously saved feedback remains attached to the old version. Run integrity
again after repair. Do not combine relocation with queue rebuilding or `--append`.

The six-item [task reference input](../../docs/design-system/reference-review.json)
records exact capture hashes, versions, theme, viewport, fixture and candidate
status. Rebuild it through the existing creator:

```powershell
bun.cmd scripts/artifact-review/create.ts docs/design-system/reference-review.json .local/design-system/reference-review/manifest.json
bun.cmd scripts/artifact-review/inspect.ts .local/design-system/reference-review/manifest.json
```

Those captures are local and absent from a clean checkout. Retain their bytes or
restore the matching archives; do not substitute a similar screenshot. The
input's sections distinguish intended use from limitations. Mark an exact version
approved only with identifiable human evidence; a passing check is still a
candidate. When superseding a reference, preserve the older version and feedback.

```powershell
bun.cmd scripts/artifact-review/marketing.ts .local/marketing-launch/v2/review-data.json .local/marketing-launch/v3/manifest.json
bun.cmd scripts/artifact-review/synaesthetic.ts exported-evaluation.json .local/audio-review/manifest.json
```

The optional evaluator presentation adapter accepts `id`, `runId`, `title`, `audioPath`, `report`, and
optional `expectedSha256`/`durationSeconds`. It exposes detected passages and
suggestions for review. Human taste uses a separate 1–5 scale; this adapter does
not update evaluator calibration eligibility, dataset splits, or machine scores.
The evaluator's native structured-review path uses the same SQLite package
directly, preserving those fields and its existing database ownership.

The current marketing review is reproduced by
`bun.cmd .local/marketing-launch/v7/assemble.ts`, then
`bun.cmd .local/marketing-launch/v7/preflight.ts`, followed by
`bun.cmd .local/marketing-launch/v3/prepare.ts`: ten new rendered videos, interleaved
across Editor, main-FX PadPilot, and animation/workflow cuts, followed by the prior 40.
Preflight checks browser display dimensions before immutable registration.
Concepts and standalone evaluator audio are excluded from this queue; their
previous SQLite assets/feedback remain preserved. The generic primitive and UI
still support those formats in other review contexts.

## User outcomes and validation

Covered: phone/desktop playback, multiple temporal and named-section annotations,
edit/delete, invalid-range recovery, server persistence, two-device conflict,
text review, evaluator audio, SQLite-only feedback, and version history. Images
support paired comparison and rectangular region notes; freehand drawing is not
implemented. Feedback stays separate for each exact image version.

Run contract/adapter/server tests from this directory with `bun.cmd test`.
The local bunfig avoids the root application's DOM test preload for native HTTP.
From the root, `bun.cmd scripts/artifact-review/verify-browser.ts --video-manifest <video-fixture.json> --audio-manifest <audio-fixture.json> --out <local-evidence>` exercises
the supplied test campaigns in an isolated temporary database and owned headless
browser. The fixtures need a video of at least seven seconds with a named section
and an audio item with a timed section; the runner supplies a disposable text item.
It does not write test ratings to the user's review. Follow with
`bun.cmd run check:process-policy` when changing host/browser lifecycle code.

`bun.cmd scripts/artifact-review/design-system/verify-browser.ts` verifies image
comparison, pointer/touch regions, keyboard bounds, actual-size zoom, independent
feedback, draft guards and edit/reload/delete in an isolated database. It writes
screenshots and a report to `.local/design-system/review-verification/`.

The reusable agent workflow is [artifact-review](../../.agents/skills/artifact-review/SKILL.md).

For an image/video album made by the existing image-album skill, reuse the same
CLI with `--album-url <managed-url> [--images N] [--videos N] --out <local-evidence>`.
It checks inventory, lazy image decoding, full-size modal navigation, wraparound,
Escape, sound-enabled video playback, byte-range responses, filters and narrow
layout. Media and feedback remain read-only; reports go under `.local`.
