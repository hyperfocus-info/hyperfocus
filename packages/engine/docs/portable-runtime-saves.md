# Portable runtime save profiles

Hyperfocus save profiles are disposable browser user data. A project declares the save contract in `.hyperfocus/project.json`, but live progress is never copied into the project, `.hyperfocus/assets.hfp`, a standalone HTML build, or generated wrapper files. The canonical project remains exactly two files.

```json
{
  "extensions": {
    "hyperfocusSave": {
      "schema": "portable-world-snapshot-v1",
      "dataVersion": 0,
      "slotPolicy": "single",
      "slots": ["auto"],
      "defaultSlot": "auto",
      "restoreOnBoot": true,
      "editorPlay": "reset",
      "maxBytes": 262144
    }
  }
}
```

`portable-world-snapshot-v1` stores the active scene, deterministic clock, entity transforms, controller state, and input-edge state from the shared 2D runtime. Declared first-party systems can add keyed state providers; the story runtime uses `story` for dialogue, quest, and pending-command state. It is ordinary checksummed JSON and does not contain engine bytecode.

## Policy fields

- `dataVersion` is an integer from `0` through `256`. Older slots migrate sequentially before restore. The fixed world-snapshot schema has built-in identity steps; a statically bundled host can supply a `SaveMigrationRegistry` when a future data shape needs a real transform. Arbitrary migration paths are never evaluated.
- `slotPolicy: "single"` requires exactly one declared slot. `"named"` permits up to 16 explicitly named slots. Calls for undeclared names fail.
- `defaultSlot` is used when the host does not provide a slot name and must appear in `slots`.
- `restoreOnBoot` controls whether a standalone build attempts to restore the default slot before its first frame.
- `editorPlay: "reset"` starts every preview from authored state. `"restore"` carries preview state between Play sessions in the current editor tab only. Editor preview state is isolated from standalone profiles and is not exported.
- `maxBytes` bounds the complete checksummed profile envelope from 1 KiB through 4 MiB. The default project uses 256 KiB.

Invalid declarations block editor and CLI builds. Corrupt, future-version, or migration-failed browser data produces an explicit runtime diagnostic and the game continues from authored state so the player can delete or replace the bad profile.

## Standalone API and storage

When a save declaration exists, `globalThis.__hyperfocusPlayable` exposes asynchronous `save`, `load`, `deleteSaveSlot`, `deleteSaveProfile`, `exportSaveProfile`, and `importSaveProfile` methods, plus synchronous `reset` and the normalized `savePolicy`. The first-party 2D standalone player also provides **Save and restore progress** controls for saving, restoring, exporting and importing these same profiles. Import checks the declared byte limit before reading the file and requires an explicit checkbox to replace existing progress. Named policies expose a slot selector. A game UI can call the same methods or bind equivalent host controls.

Standalone builds store checksummed profile envelopes in IndexedDB. Commits use a bounded optimistic compare-and-swap transaction, so concurrent page instances retry instead of silently losing an update. Every read and write rechecks the declared byte limit. Profiles are keyed by the portable project ID and local profile ID.

`exportSaveProfile()` returns the complete UTF-8 JSON envelope for a player-controlled download or copy. `importSaveProfile(source)` verifies its SHA-256 checksum, game identity, limits, and migrations; it refuses to overwrite an existing profile unless the caller passes `true` explicitly.

`deleteSaveSlot()` removes one slot. `deleteSaveProfile()` removes all local slots for that profile. Clearing browser site data also removes the IndexedDB database. Deleting or clearing saves does not modify the project pair and cannot remove authored levels or imported assets.

## Privacy and portability

The built-in adapter performs no network requests, analytics, account lookup, or cloud synchronization. Save contents remain in the browser origin until the player exports or deletes them. A copied standalone file may receive a different browser storage origin, so portable transfer should use explicit export/import rather than relying on a browser's internal database.

Other engines can read the declaration and the exported checksummed JSON without adopting Hyperfocus storage. They can map the world snapshot into their own scene state or expose their own adapter behind the same atomic storage boundary.
