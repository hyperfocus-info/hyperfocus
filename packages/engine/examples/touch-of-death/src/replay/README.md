# Replay archives

`@hyperfocus/touch-of-death/replay` owns downloaded confirmed-input recordings.
`encodeReplayArchive({ value })` writes `.pb` files;
`readReplayFile({ bytes })` accepts those files and legacy JSON recordings or
`{ recording, stoppedReason, appearance?, startFrame? }` envelopes. The relay, editor game
shell, converter and benchmark share this codec. No existing file is rewritten.

Files contain `HFRP` (four ASCII bytes), envelope version `1` (one byte), then
the protobuf `hyperfocus.touch_of_death.replay.Archive` from
[`proto/replay.proto`](proto/replay.proto). The MIME type is
`application/vnd.hyperfocus.replay+protobuf`. Downloads are uncompressed; tooling
compares equal gzip separately. Regenerate bindings with
`bun run --cwd packages/engine/examples/touch-of-death generate:replay`.

The engine validates recording versions, content identity, seed, contiguous frame
pairs, actions and planar directions. Shared match identity, frame index, seat and
zero Y coordinates are implicit in the wire layout. Doubles preserve input
precision. Appearance preserves names, icons and catalog choices; absent appearance
differs from two null fighter appearances. Uploaded images and account IDs are
excluded. Recording mode and partial-recording reasons survive save and reopen.
Optional field 4, `start_frame`, bookmarks a frame within the recording. Older
archives open at zero; older protobuf readers safely ignore the bookmark. The
game opens a bookmarked replay paused, with bounded seeking and takeover intact.

Private-set results offer an explicit replay-link upload and a local download.
The bookmark follows the decisive contact chain with one second of lead-in;
missing contact history falls back to zero. Links open on the same game host and
require matching content. They expire seven days after creation. Names and
wardrobe choices are disclosed before sharing; account IDs and uploaded pictures
remain excluded. Creating a link does not leave the room or send anyone a message.

`host/replay-share` owns same-origin authenticated creation, opaque public reads,
duplicate-request reuse and expiration. Limits are 512 KiB per link, eight active
links per account, 128 total and 16 MiB of encoded payloads; download remains
available when a limit is reached. The existing JSON-only durable service store
keeps the canonical HFRP bytes as versioned `hfrp:1:` base64, with owner, checksum
and expiry metadata. This is a text-boundary adapter, not a replacement codec.
SQLite restart and backup behavior are tested; a live PostgreSQL deployment has
not been exercised for this feature.

The boundary rejects files over 20 MiB, more than 36,000 frames, excess repeated
fields and corrupt/unsupported envelopes before activation. Generated decoding
has a recursion limit; a wire preflight bounds repeated-message allocation.
Unknown additive fields are ignored and dropped on domain re-export. Keep field
numbers stable; incompatible meaning requires a new envelope/recording version.
This is not an opaque lossless proxy for future protobuf fields. Legacy readers
cannot read `.pb`; use the converter's replay shortcut to export compatible JSON.

The owner requested adoption on 2026-10-07 after the archive comparison. This
accepts extra codec CPU for smaller cold files, not a hot-loop optimization.
Live input/replication keeps the engine binary codec. Saved practice situations
and in-memory checkpoints have different contracts and retain their format.
Measurements and remaining representative-data limits live in
[serialization evidence](../../../../../../docs/serialization-evidence.md).

Convert without overwriting the source:

```sh
bun run protobuf:convert to-json --format replay --input match.pb --output match.json
bun run protobuf:convert to-protobuf --format replay --input match.json --output match.pb
```

Codec tests cover old JSON, training, partial archives, exact inputs, appearance,
corruption, allocation bounds and additive fields. The editor's
[replay controls](../../../../../../apps/engine-editor/src/scene3d/replay/README.md)
own browser playback and download acceptance.
