# Neutral Export

Neutral export is an explicit escape hatch for moving a project to another engine. It does not change the saved project: `.hyperfocus/project.json` and `.hyperfocus/assets.hfp` remain the only two canonical files.

In the Editor, open **Project** or **Build** and choose **Export for another engine**. On browsers with the File System Access API, select a parent directory. The Editor creates a fresh `<project-name>-neutral-export/` child and refuses to open or overwrite one that already exists. If directory access is unavailable, it downloads one deterministic standard ZIP with the same ordinary file tree.

The output is:

```text
project-name-neutral-export/
  project.json
  manifest.json
  assets/
    <logical-id>--<original-name>
```

`project.json` is the canonical deterministic JSON with no fields silently removed. Imported assets are recovered from the verified content-addressed pack and retain byte-identical contents. `manifest.json` records the source format/version, project SHA-256, each asset's logical ID, original name, MIME type, safe relative path, size and SHA-256, plus ordered JSON-Pointer diagnostics.

Diagnostics are also written to the Editor console as `[code] /json/pointer message`. They identify generated assets without original bytes, behavior modules requiring a port, unknown component types, enabled engine post effects, and extension namespaces. These are warnings about translation work, not dropped records: their authored data remains in `project.json`.

The Editor reports the output name, ordinary file count, packed/unpacked byte evidence, project digest, and warning count. Permission errors include the browser's reason. A failed directory write removes its incomplete child when the host allows it; otherwise the error says that an incomplete child may remain. Neither path marks the project saved, writes to `.hyperfocus`, generates wrappers, or contacts a network service.

The command-line equivalent is:

```sh
bun run export:project -- --project <game-directory> --out <new-export-directory>
```

The CLI uses the same shared manifest, filename, limit, and diagnostic implementation. Its destination must not exist and is installed from a staged directory. The browser fallback archive is ZIP-store encoded with stable ordering and no timestamps, so identical input yields identical bytes.
