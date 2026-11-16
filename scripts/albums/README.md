# Album presentation

This directory owns the image-album generator and installed album-library UI.
Machine configuration, music, spreadsheets, mix approvals and service operations
remain with the user's installed `album-bundle` skill.

`bun scripts/albums/image-album.ts <album-directory> [title]` builds the gallery,
its bounded local server and branding. Existing `brand.json` supplies a custom
logo and social metadata; originals are preserved. Brand assets are excluded
from the gallery's media count. Discovered HTML evidence pages (such as an audit
report) open as HTML; unknown file extensions remain downloadable binary data.
The generated `/healthz` endpoint supports the managed `site-preview` readiness
check; serve the album through that supervisor surface.

## Audit evidence at scale

`bun scripts/albums/audit-evidence.ts --cohort <campaign-directory> --cohort
<another-campaign> --out <album-directory>` imports the frozen campaign's persona
directories. It preserves each capture's persona, seed, frozen goal, source,
attempt and nearest result path in `album.json` version 1. Result JSON is copied
by hash and opens from the viewer; original paths remain visible. Identical PNG bytes share one hash-named
media file; their capture records remain distinct. Imported outcomes are
`unassessed`: an image or successful runner cannot establish mission completion.
Sources are never deleted. Existing hash media must validate before reuse.

Campaign persona paths may name any JSON manifest inside the cohort. Optional
`deviceClass` (`desktop` or `mobile`) and `scenarioId` fields on cohort entries
remain searchable and filterable in the gallery and its result viewer. These
describe the frozen mission; actual viewport/input evidence stays in the raw
receipt. Preserve failed attempts beside recovery captures.

### Audio audit evidence

Add `--audio-only` to the same importer to inventory WAV, MP3, M4A, AAC, OGG,
FLAC and Opus recursively across each cohort, including failed/superseded attempts
and unmatched shared fixtures. The campaign still supplies frozen personas.
`cohort[].runId` associates files whose path component equals the run ID or begins
with `<runId>.` or `<runId>-`; ambiguous associations fail. Unmatched files remain
`personaId: "unassigned"`. Shared persona directories are supported in this mode.
No external source song is traversed or copied. Originals are unchanged; identical
bytes share one hash-named file while every source capture keeps its own record.

`album.json` remains version 1. Audio items add `runId`, `sha256`, `audioRole`
(`source-fixture`, `rendered-output`, or `unknown`) and, for readable RIFF PCM/float
WAV headers, `durationSeconds`, `channels`, `sampleRate`. These are measurements,
not listening judgments. Other codecs retain native playback but have no imported
measurements. Role is inferred from source/fixture/input or export/render/print/
capture/output filenames; otherwise it is unknown. Outcome defaults to unassessed.
Nearest `<runId>.runtime.json`, `<runId>.result.json` or `results.json` is copied
as the result receipt, including for older attempts; that does not imply acceptance.

Optional cohort `audio-evidence.json` contains `{ "items": [{ "path":
"relative/file.wav", "runId": "P01", "attempt": "failed-1", "audioRole":
"rendered-output", "outcome": "failed", "caption": "Description" }] }`.
Only `path` is required; other fields override inferred values. Missing paths,
duplicate annotations and unknown/ambiguous run IDs fail. Do not add annotations
to frozen evidence: preserve the default unassessed label when no prior assessment
exists. All paths and captured attempts remain visible and searchable.

Repeat the import and builder commands after captures arrive; existing media are
hash-validated before reuse, new captures are added, and the manifest is rebuilt.
`--exclude <directory>` is repeatable for tool/fixture areas; the output directory
itself is always excluded. Keep exclusions explicit so the audio inventory remains
reviewable. Run import and generation through the task's existing outcome wrapper:

```powershell
bun run inspect:outcome --execute <task.json> '--' bun scripts/albums/audit-evidence.ts --audio-only --cohort <old-cohort> --cohort <new-cohort> --exclude <tool-area> --out <album-directory>
bun run inspect:outcome --execute <task.json> '--' bun scripts/albums/image-album.ts <album-directory> "Audit audio - all attempts"
```

Each cohort must have `campaign.json` before import. Album
hosting remains the managed `site-preview` surface. Native `<audio controls>`
plays the original file in the existing viewer; close and navigation stop playback.
Audio and video support byte ranges. `verifyAlbum({ ..., audios: count })` checks
all distinct audio sources for decodable metadata plus native playback, byte ranges
and close cleanup for the first audio capture. Browser verification is separate
from importer tests and still required before claiming the album is playable.

The builder accepts that explicit manifest or scans a conventional media folder.
Supplied malformed metadata and references to missing/escaped media fail with
diagnostics, including BOM-bearing JSON support. The same catalog supplies filters,
60-card pages and full filtered-set viewer navigation. Folder inventory is also
paged and created only when opened. Captions remain readable and screenshots fit
without cropping. Original images still load as previews; this bounds DOM work,
not thumbnail bytes or a measured interaction-latency budget.

Run `bun test scripts/albums` for importer/catalog contracts (also in
`test:repository`). Browser code is maintained in `image-album-client.ts`, bundled
into the portable page and shipped by `sync-presentation`; it participates in
ESLint and TypeScript checks. Use `verifyAlbum` with `decodeImages: 'all'` for full
media decoding or `'sample'` for two pages; reports state the actual scope.
Required controls, empty-search recovery, filter subsets, pagination and modal
focus return must pass. Video playback/range is claimed only when video exists.

`bun scripts/albums/sync-presentation.ts --skills-dir <directory>` installs the
owned presentation files, bundled builder dependencies and branding renderer, so
the installed skill runs outside the checkout. It preserves private
configuration and service logic, backs up changed files and writes hash receipts
under `.local/sync`. Restart only an idle, owned service when its routing changes.
The library's source identity is `library/brand.json`.

Use `scripts/artifact-review/verify-album.ts` for album behavior. Installing a
template does not regenerate previously created albums or deploy hosted copies.

Library rows prioritize listening: Play and a track action menu stay visible;
files, versions and detailed assessments live in the track workspace. The compact
table default hides peak, evaluation and video columns, while Columns preserves
sorting, reordering and custom visibility. Failed or active work stays visible in
the track row. This follows the user's 2026-11-01 request for progressive disclosure.
Each table has its own search over names, file paths, notes and values, including
hidden columns. Search survives rerenders and switching away and back within the
page; each album has an independent query. Bulk Select visible uses matching rows.

Album cards/rows, track cards/rows and file entries share right-click, Shift+F10
and visible action menus. Track menus expose selected audio/project full-path
copy and Explorer reveal alongside listening, editing, evaluation and video.
Files & versions shows selectable absolute paths, sizes and saved dates; file
menus also copy filenames/folder paths and open the containing folder. Album
menus target their own folder and planning sheet. The installed host resolves
registered file/album IDs for `/api/file-action`, never caller-provided paths.

`bun scripts/albums/verify-library.ts --url <managed-url> --out <.local-directory>`
exercises populated fixtures, disclosure, keyboard focus, draft retention and
evaluation recovery. `--live-paths` adds a read-only installed-app journey for a
nested project: displayed/copied paths agree with the registered file resolver.
Clipboard and fixture file actions are intercepted; no Explorer window opens.
Add `--live` only when local evaluation is authorized: it
also evaluates one randomly chosen export longer than 30 seconds through the UI
and verifies the saved measurement. It does not modify music or the planning sheet.
