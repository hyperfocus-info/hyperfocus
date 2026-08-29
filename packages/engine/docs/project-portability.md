# Portable Project Contract

Hyperfocus projects should be easy to understand without Hyperfocus and easy to move to another engine. The canonical project state therefore uses two files, both under a single `.hyperfocus` directory:

```text
my-game/
  .hyperfocus/
    project.json
    assets.hfp
  src/
    main.ts
    player.ts
  package.json
```

`project.json` is deterministic, UTF-8 JSON. `assets.hfp` is a deterministic, content-addressed ZIP archive with a project-specific extension. Ordinary TypeScript, tests, shaders, server code, and other human-authored source stay outside `.hyperfocus`. Hyperfocus must not copy source into generated wrappers or expand one authored object into a forest of generated files.

The two-file reader/writer and editor save/open path are implemented. `@hyperfocus/engine/project` creates deterministic project JSON, packs and opens the standard ZIP archive, verifies CRC-32 and SHA-256, rejects unsafe or orphaned entries, and exposes a programmatic generic exchange-file export. The editor writes or opens the pair through a directory picker, falls back to exactly two downloads or a two-file selection, reads legacy `.engine-project.json`, packs cached legacy imports, and restores validated pack contents to its disposable IndexedDB cache.

The editor now has an executable built-in/data-driven lane: Play and standalone HTML use the first-party `@hyperfocus/engine/project/runtime-2d` simulation, and the build embeds this exact validated pair with verified assets and an offline renderer. The lane supports input movement, built-in patrols, explicit solid tile values, swept AABB collision, scenes/snapshots, images/atlas frames, camera follow, start-triggered audio, touch/gamepad input, and the supported post stack. The browser button hard-blocks arbitrary TypeScript paths because it does not own those source files. The source-aware `bun run build:game -- --project <directory>` lane resolves those paths, statically bundles them in memory, and emits the same single HTML form without intermediate wrappers. `dev:game` watches the exact pair and authored bundle inputs, keeps the last good in-memory snapshot on errors, and live-reloads successful builds. Filesystem-capable writers now have staged directory-swap persistence and explicit recovery, Editor v2 has a machine-readable schema, and an independent fixture proves extraction without the project codec. Live custom-source execution inside the editor process remains release work.

## Design invariants

- Exactly two canonical files live under `.hyperfocus` for a saved project.
- Deleting editor caches must not lose a saved project.
- Generated builds, caches, profiles, thumbnails, and recovery journals are not canonical project state and must live elsewhere.
- `project.json` remains reviewable and deterministically serialized. Re-saving an unchanged project produces identical bytes.
- Asset bytes are addressed by a standard SHA-256 digest, not a database key, machine path, or engine-owned opaque identifier.
- `assets.hfp` remains readable by ordinary ZIP tools. The extension is a product association, not a proprietary container.
- Archive entries are deterministic: normalized paths, stable ordering, fixed metadata, no duplicate names, and no machine-specific timestamps.
- The writer compares storage with lossless compression per object and keeps the smaller representation. Already-compressed media should not grow merely to claim it was compressed.
- An asset is stored once for each distinct digest, even when several project resources reference it.
- Project references are relative logical IDs and hashes. They never contain absolute filesystem paths, browser object URLs, IndexedDB keys, or credentials.
- `extensions.hyperfocusSave` declares only a bounded, engine-neutral world-snapshot schema and slot policy. Live save profiles remain disposable browser user data outside `.hyperfocus`; see [portable runtime saves](./portable-runtime-saves.md).
- `extensions.hyperfocus3D` declares bounded neutral glTF/RGBA assets, materials, scenes, cameras, lights, entities, input controllers, rigid bodies, transform animation, audio policy, and save policy. It is fully described by the published v2 JSON Schema and the [portable 3D contract](./portable-runtime-3d.md); no GPU cache or engine-object serialization is canonical.
- Unknown additive JSON fields survive a read/write cycle when practical. A newer unsupported major format must fail explicitly instead of being silently rewritten.
- Opening, validating, packing, unpacking, and exporting a project must not require a network connection or hosted account.

## `project.json`

The JSON document is the human-reviewable source of truth for project structure. It contains:

- a public format discriminator and semantic schema version;
- project identity and settings;
- scenes, entities, components, tilemaps, atlases, input mappings, and other authored structured data;
- asset records that map stable logical IDs to SHA-256 object digests, byte lengths, MIME types, original names, and optional provenance;
- behavior references to ordinary source modules outside `.hyperfocus`;
- explicit extension namespaces for game- or tool-specific data.

It does not contain asset bytes, generated runtime code, local editor layout unless the author elects to share it, secrets, caches, or absolute paths.

The generic JSON and ZIP encoding APIs are published on `@hyperfocus/engine/project`. The Editor v2 document shape is published as [JSON Schema draft 2020-12](./schema/editor-project-v2.schema.json). It covers required records, field types, numeric and collection bounds, enumerations, colors, digest syntax, and the rule that saved imported assets carry a SHA-256 reference. JSON Schema cannot express every graph invariant used by the editor: unique IDs across arrays, parent/reference existence, parenting cycles, atlas sequence references, the equality of `values.length` and `columns * rows`, and `allocationMs <= frameBudgetMs` remain semantic validation requirements. Consumers must run those checks in addition to schema validation before executing a project.

## `assets.hfp`

The asset pack is a ZIP container. A logical asset reference in `project.json` points to an entry with this shape:

```text
objects/sha256/<first-two-hex>/<remaining-hex>
```

The entry name is derived only from the lowercase SHA-256 digest. Original filenames and MIME information remain in `project.json`; they are metadata, not archive paths. This prevents collisions, deduplicates identical files, and avoids leaking local directory layouts.

The pack writer must reject path traversal, absolute paths, invalid hashes, duplicate entries, digest mismatches, decompression bombs beyond configured bounds, and sizes that disagree with `project.json`. Readers must verify the digest after decompression before exposing bytes to loaders.

ZIP is chosen for escapeability and broad tooling support. The `.hfp` suffix allows OS association without hiding the representation. A user may make a copy named `assets.zip` and inspect it with standard archive tools; Hyperfocus documentation and tests must preserve that property.

## Source and behavior modules

Human-authored code stays human-authored. A behavior record such as `{ "module": "./src/player.ts", "export": "updatePlayer" }` is metadata pointing out of `.hyperfocus`; it does not cause the editor to generate `PlayerBehavior.ts`, component wrappers, scene classes, or serialization glue. Relative source-module paths resolve from the project root that contains `.hyperfocus`, not from inside `.hyperfocus` itself. The standalone editor build executes documented `builtin:` behaviors and data-driven input. Unknown built-ins and source-module paths fail its browser-only preflight rather than being ignored. The CLI source lane statically imports relative modules that remain inside the project root, rejects missing/non-function exports and unresolved/external chunks, and produces one IIFE HTML artifact.

A custom behavior export receives a `PlayableBehaviorContext2D` and returns `void` or `{ velocityX, velocityY }`. The context contains a read-only entity/component snapshot, sorted active actions, fixed delta, tick, and simulation time. The portable runtime applies returned velocity through the same collision path as built-in input. Registry keys are the explicit `module#export` pair; `playableBehaviorKey` and `PlayableBehaviorRegistry2D` are public on `@hyperfocus/engine/project/runtime-2d`.

Runtime integration should use a small explicit loader boundary. Projects may bypass the loader and consume the JSON and asset pack directly. No game rule should depend on an editor process, global registry, cloud account, or undocumented binary object.

## Escape hatch

Portability is a release gate, not a promise of perfect one-click conversion to every competing engine. The completed generic export must:

1. Validate the project and every referenced digest.
2. Emit the public project JSON unchanged or migrated to a selected documented version.
3. Unpack assets to ordinary files with a deterministic manifest mapping logical IDs to relative filenames and hashes.
4. Emit neutral structured data without executable Hyperfocus runtime code.
5. Report engine-specific components it cannot translate instead of discarding them.

The generic export may create many files because the user explicitly requested an interchange tree; the canonical Hyperfocus project remains two files. Target-specific exporters may be added later, but the generic export cannot depend on them.

The `exportHyperfocusExchange` API performs the basic programmatic neutral step. The shared neutral bundle and `export:project` CLI complete the manifest workflow: they validate the exact pair, emit canonical `project.json`, verified ordinary named assets, and a deterministic `manifest.json` with hashes and JSON-Pointer diagnostics for every preserved construct requiring target-specific work. The CLI refuses overwrite and installs a fresh staged directory atomically. The Editor's **Export for another engine** action uses those same semantics, prefers a fresh user-selected directory, and falls back to one deterministic standard ZIP without altering canonical storage. See [neutral export](./neutral-export.md).

Every stable format version needs fixtures proving that an independent reader can list project metadata and recover byte-identical assets with only JSON, ZIP, and SHA-256 implementations. The Editor v2 fixture lives under `src/project/fixtures/independent-v2/`. Its archive is checked in as text-safe `assets.hfp.base64`; decoding that file produces the exact standard ZIP bytes. `src/project/independent-reader.test.ts` deliberately imports no Hyperfocus project API: it parses JSON, walks ZIP local and central records, handles stored/deflated entries, extracts the content-addressed object, and verifies its SHA-256 with the platform implementation. Round-trip codec tests separately prove stable JSON bytes, stable archive bytes, deduplication, digest verification, and preservation of unknown additive fields.

## Caches, recovery, and builds

Browser storage may accelerate editing, but it is disposable:

- IndexedDB may cache unpacked asset blobs keyed by digest.
- Local storage may keep bounded crash recovery data.
- A cache miss must be recoverable from the two canonical files.
- Saving must transactionally produce a mutually consistent JSON/pack pair or leave the previous pair intact.
- Build output belongs in a user-selected output directory such as `dist/`, not `.hyperfocus`.
- Profiles and verification evidence belong under `.local/` or another ignored diagnostics directory.

If a platform cannot atomically replace both files, the implementation should stage and validate the new pair before replacing either canonical file, retain the previous valid pair until commit, and provide an explicit recovery path.

Filesystem and CLI hosts use `writeHyperfocusProjectPair`, `readHyperfocusProjectPair`, and `recoverHyperfocusProjectPair` from the filesystem persistence module. A write follows this order:

1. Decode and fully validate the proposed JSON/archive pair before touching disk.
2. Recover or reject any earlier interrupted transaction.
3. Write and file-sync the complete pair into sibling `.hyperfocus.next`, then sync that directory.
4. Atomically rename an existing `.hyperfocus` to `.hyperfocus.previous` and rename the staged directory to `.hyperfocus`.
5. Reopen and validate the committed canonical pair before deleting the previous directory.

The sibling directories are bounded transaction artifacts, not canonical project files. Recovery never combines individual files. A valid canonical directory wins over an uncommitted stage; when the canonical directory has already been moved aside, a valid complete stage is promoted; when only the previous valid pair remains, it is restored. Invalid artifacts are preserved and reported instead of being guessed at or deleted. The returned evidence records whether directory metadata sync is supported by the host; file contents are always synced before rename.

## Runtime ownership and dependency policy

Low vendor lock-in does not mean outsourcing the engine to another engine behind an adapter. The completed Hyperfocus path will provide its own high-performance primitives for rendering, physics, audio, navigation, animation, scenes, persistence, networking, and production tooling. Hot paths should use typed buffers, bounded memory, deterministic algorithms, WASM/SIMD where measurement supports it, and public data contracts.

Web APIs and file standards remain legitimate platform boundaries. Importers and exporters may understand common interchange standards, but canonical project data must not require a proprietary hosted service or an external game runtime. Current dependencies and incomplete primitives must remain plainly documented until replaced; portability claims cannot be used to hide a required runtime peer.

## Migration from the current editor

The persistence migration is implemented for the first four items below. The complete editor migration is done only when every item is true:

- Existing `.engine-project.json` files open and migrate without losing supported fields. **Implemented.**
- Imported IndexedDB blobs can be packed into `assets.hfp`, with missing or stale blobs reported by logical asset ID. **Implemented.**
- New saves use `.hyperfocus/project.json` and `.hyperfocus/assets.hfp` as the authoritative pair. **Implemented.**
- Reopening a saved pair works without its prior IndexedDB entries; validated asset blobs are restored in one IndexedDB transaction. **Implemented and verified.**
- The standalone build consumes the same pair and runs documented built-in/data-driven behaviors and supported resources. **Implemented and browser-verified.** Editor Play uses the same simulation and restores authored state; the CLI bundles relative ordinary TypeScript behavior modules in memory with no generated wrappers. Live editor execution of those custom modules remains incomplete.
- A generic export recovers JSON plus ordinary asset files without importing Hyperfocus runtime packages. **Shared programmatic bundle, offline CLI directory workflow, Editor directory action, deterministic ZIP fallback, exact diagnostics, and clean-browser acceptance implemented.**
- Documentation, editor copy, examples, schema fixtures, and release verification all describe the same format version.
- Filesystem/CLI writes stage, sync, atomically swap, validate, and recover the pair without exposing mixed generations. **Implemented and fault-injection tested at each transaction boundary.**
- Editor project schema v2 is available as machine-readable JSON Schema, with semantic-only invariants explicitly identified. **Implemented.**
- An independent reader recovers fixture bytes with JSON, standard ZIP, deflate, and SHA-256 implementations while importing no Hyperfocus project codec. **Implemented and verified.**
