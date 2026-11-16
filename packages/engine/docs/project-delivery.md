# Web asset delivery

Web builds load required content first. Optional music and later scene resources
load when used. The canonical `.hyperfocus/project.json` + `assets.hfp` pair
remains complete; delivery is a derived output and preserves asset hashes.

## Build and host

```sh
bun run build:game -- --project ./my-game
bun run build:game -- --project ./my-game --out ./release/web
bun run build:game -- --project ./my-game --offline --out ./release/game.html
```

The default output is `dist/web/`. Serve the complete directory over HTTP(S).
The editor's **Build web game** downloads this directory as a ZIP. **Build offline
HTML** creates the full single-file download for `file://` use. Both use the same
gameplay and music playback code; optional music failure does not prevent play.
Offline download size includes the complete catalog.

Web output contains a small `index.html`, hashed runtime modules, hashed project
JSON, a startup archive, compressed group packs, and individual hashed asset objects. The document pins
`delivery-<sha256>.json`; `delivery.json` is its inspection alias. `build.json`
records every output's size, MIME type and hash. Publish a complete new version
atomically and retain old hashed files while existing sessions may use them.

`createWebDeliveryHandler` from `@hyperfocus/engine/tooling/build-project` serves
only inventoried files with byte ranges, HEAD, CORS, compression and cache headers.
`verifyWebDeliveryDirectory` checks all output hashes before packaging. Hosting
adapters stay outside the DOM-free engine contracts.

## Selection and runtime acquisition

`@hyperfocus/engine/project/delivery` exports the planner, manifest validator,
builder and bounded loader. Automatic selection includes active scene resources,
project-wide references and declared dependencies. Music references use native
media streaming; small effects use decoded buffers. Every original asset remains
in the export, including unreferenced content.

Menu-based 3D combat stages its fight sounds in `combat-audio`. UI cues, bus
impulses, explicit startup rules and references outside combat remain required.
The standalone host downloads and decodes that bank before entering play, with
retry and return-to-menu actions. Offline builds prepare the identical bank from
embedded bytes. Banks above the 16 MiB encoded preparation budget keep their
existing startup classification. Music remains independently streamed.

Asset inspector **Web delivery** overrides are stored in
`extensions.hyperfocusDelivery = {version: 1, assets: {...}}`. Each asset rule has
`load: "auto" | "startup" | "on-demand"`, optional `group`, `dependencies`, and
`playback: "auto" | "buffer" | "stream"`. Groups use portable names; `startup` is
reserved. Required visual/structural references override an on-demand hint.
Dependencies are validated and cycles rejected. The editor command
`asset.set-delivery` applies the same policy with undo/redo and persistence.

Computed asset names in project code cannot be inferred. Declare a group or a
startup rule and acquire it explicitly through the host's asset loader.
`createDeliveryLoader` exposes `acquire`, `acquireGroup`, `bytes`, and `dispose`;
it defaults to four concurrent reads and a 64 MiB byte cache. Fetched binaries
are size/hash verified. Returned bytes are borrowed. Hosts own cancellation and
decoded-resource lifetimes. Native streamed audio relies on immutable publisher
objects and HTTPS; it does not download a whole song just to hash it first.

Version 1 manifests can include `packs[group] = {url, sha256, size, assets}`.
`acquireGroup` uses that verified compressed transport and checks its exact object
set before exposing bytes. `bytes` and `acquire` retain individual addressing;
`acquireGroup(name, {playback: "buffer"})` excludes streamed songs even when an
authored group mixes both playback kinds.
old manifests without packs still work. Generated packs omit startup and streamed
objects, and cap unpacked size at 64 MiB. Pack URLs accept the same external base
or digest map as individual objects. Exported originals remain available.

The standalone hook exposes `assets` and 2D `switchSceneAsync`. Scene activation
and save restoration acquire images before changing the world; a failed request
can be retried. The 2D host retains decoded images for the current and reset
scenes. 3D startup cooks resources reachable from its active scene and global
extensions; dynamic 3D scene replacement remains a host responsibility.

## Scripts

Web builds use Bun browser ESM with splitting. Literal `import('./feature')`
creates an optional chunk, fetched on activation. The editor's supplied-source
compiler supports the same boundary and rejects unresolved imports. Normal
static imports stay mandatory. Offline builds bundle these modules into the HTML
while retaining deferred activation. Deferring execution inside one IIFE does
not reduce network bytes.

Generated HTML preloads the entry's static ESM dependency closure. It starts
bounded manifest/project/core requests immediately; the runtime adopts those
promises and checks their normal sizes and hashes. Project and core acquisition
also overlap on older HTML without the early bootstrap. Page disposal aborts the
owned requests. Optional chunks and packs receive no startup preload hints.

The bootstrap and runtime use the same `readDeliveryStream` implementation.
Known-size objects allocate one destination buffer and copy incoming chunks into
it immediately; the manifest's unknown-size path grows within its 4 MiB bound.
Truncation, overflow and empty chunks fail with reader cleanup. Hosts
allow 30 seconds for response headers and 30 seconds between body chunks; this is
an inactivity timeout, not a limit on a progressing slow download. A failed early
request gets one fresh runtime attempt; subsequent asset failures remain retryable
through the existing loader/menu. Cancellation never triggers that retry.

`createDeliveryLoader().diagnostics()` (also available on the standalone
`assets` hook) reports actual read attempts, cache hits, shared pending reads,
failures, received/verified bytes and peak concurrently declared transfer bytes.
`snapshot()` retains active/queued/cache counts. These are transfer and cache
observations, not peak process memory: decoded media, unpacked packs, renderer
resources and caller-retained bytes have their own lifetimes. Cold start, warm
reload, first fight and offline reopening remain separate acceptance scenarios.
The standalone diagnostics also report accepted manifest/project/core byte counts
and early-request adoption/retries without retaining startup buffers. Loader read
counters cover subsequent acquisitions; streamed media and partial failed
responses are not included. Decoded byte counts are not compressed network usage
or proof of browser HTTP-cache hits.

## Separate asset origins

Pass `--asset-base-url https://cdn.example/game/` to preserve hash paths on a
different host, or `--asset-map urls.json` for `{ "<sha256>": "https://…" }`.
The editor exposes both in **Asset hosting**. URLs must be public HTTPS without
credentials or fragments. Runtime scripts and the manifest stay beside the game.
Generated CSP allows the exact asset origins; no hosting secrets enter the game.

The repository provides a resumable UploadThing adapter:

```sh
bun apps/engine-editor/scripts/asset-delivery/uploadthing.ts release/web release/urls.json
# Explicit publication; UPLOADTHING_TOKEN exists only on this publishing host:
bun apps/engine-editor/scripts/asset-delivery/uploadthing.ts release/web release/urls.json --upload
```

The first command is a dry run. The second verifies and uploads optional objects and packs,
checkpointing a hash-to-URL map after each success. Rebuild using that map. Test
the resulting public URLs with `scripts/asset-delivery/probe.ts <url> <bytes>
<game-origin>` in the editor app: range, CORS, MIME and cache behavior must work
for the selected provider. Provider pricing and account provisioning are separate
from export policy; see the [audit](../../../apps/engine-editor/docs/asset-delivery-plan.md).
