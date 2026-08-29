# Scripts

`apps/pad-pilot/scripts` is the app-owned native, UI, validation, and release automation layer.

Common gates are reachable from Hyperfocus root scripts. Specialized native,
validator, proto, preset, and update commands remain in the app manifest.

## Rules

- Scripts live in `scripts/*.ts`.
- Bun is the only supported runtime for script execution.
- Prefer Bun APIs such as `Bun.file`, `Bun.Glob`, `Bun.build`, and `Bun.spawnSync` when they fit the task.
- Route bounded build/test subprocesses through `process-runner.ts`; every finite command needs an explicit deadline.
- After any change to files in `scripts/`, run `bunx tsc --noEmit` before considering the change complete.
- Script changes must preserve app/package boundaries and avoid marketplace source imports.

## Main Entry Points

- `build.ts`: top-level build orchestration
- `build-ui.ts`: frontend bundling with serialized, rollback-safe `ui/dist` promotion
- `dev.ts`: single-instance browser-first dev flow with serialized UI rebuilds and bounded reload notifications
- `generate-proto.ts`: protobuf generation from `utils/proto`; TypeScript and C++ outputs promote together only after a complete successful run
- `generate-factory-modules.ts`: generates the native Factory Module catalog from `utils/factory-modules.ts`
- `copy-vst3.ts`: transactional local plugin artifact deployment with crash recovery
- `bootstrap-vst-validators.ts`: installs checksum-pinned pluginval and builds the commit-pinned Steinberg validator under `build/vst-validators`
- `validate-vst3.ts`: runs pluginval strictness 10 and Steinberg extensive validation against the Release bundle
- `validate-fl-studio.ts`: probes FL Studio 2026/21 and performs bounded command-line golden-project renders plus WAV metric checks
- `generate-fl-studio-validation-presets.ts`: emits tested protobuf Preset envelopes and paste-safe FX state codes for the FL golden projects
- `create-fx-preset.ts` and `create-chain-preset.ts`: preset authoring helpers
- `create-plugin-update.ts`: builds a directory-diff patch archive and manifest for PadPilot `.vst3` bundle updates
- `process-runner.ts`: checked synchronous commands, build deadlines, canonical CMake environment, and the shared bounded async subprocess API
- `bounded-file.ts`: bounded, identity-checked file reads and hashes for build and release tooling
- `lines-of-code.ts`: simple repo metrics helper
- `kill-padpilot-processes.ts`: stops only process trees registered by `dev.ts`, after revalidating PID identity and creation time

## Common Commands

Run these from the repository root.

```bash
bun run build:pad-pilot
bun run build:pad-pilot-native
bun run dev:pad-pilot
bun run test:pad-pilot
bun run typecheck:pad-pilot
bun run --cwd apps/pad-pilot generate:proto
bun run --cwd apps/pad-pilot generate:factory-modules
bun run --cwd apps/pad-pilot test:native
bun run --cwd apps/pad-pilot test:acceptance
bun run --cwd apps/pad-pilot bootstrap:vst-validators
bun run --cwd apps/pad-pilot prepare:fl-studio-validation
bun run --cwd apps/pad-pilot validate:vst3
bun run --cwd apps/pad-pilot validate:fl-studio
bun run --cwd apps/pad-pilot synaesthetic:analyze -- "C:\path\full filename.mp3"
bun run --cwd apps/pad-pilot synaesthetic:serve
```

Useful targeted commands:

```bash
bun run --cwd apps/pad-pilot start
bun run --cwd apps/pad-pilot copy
bun run --cwd apps/pad-pilot create-fx-preset
bun run --cwd apps/pad-pilot create-chain-preset
bun run --cwd apps/pad-pilot create-plugin-update -- --base <old-bundle> --target <new-bundle> --base-version <old-x.y.z> --version <new-x.y.z>
```

Update releases are immutable per version/channel/platform/architecture. Each directory diff binds to one exact `--base-version`; generating a range from one base snapshot is rejected. The generator stages, extracts, and hash-verifies a bounded ZIP before publishing the release directory, and refuses to overwrite an existing signed release.

VST validator bootstrap is repository-local and idempotent; it does not modify global package state. The FL Studio gate requires the four version-native `.flp` fixtures documented in `validation/fl-studio/fixture-instructions.md`. `prepare:fl-studio-validation` generates their deterministic WAV plus Unity/Controls protobuf Preset codes, so only host routing and one wet/dry automation lane are authored in FL. Generated validator tools and render reports stay under ignored `build/` directories.

UI deployment copies one validated build output directly into `PadPilot.vst3/Contents/Resources/ui`, keeping `index.html`, `main.js`, and `main.css` at the same level. CMake passes its dedicated `embedded-ui` output explicitly, so packaged resources and native binary data come from the same build instead of a potentially stale `ui/dist`. Existing deployed assets remain available if staging or promotion fails.

External Module UI is compiled off by default. A build enables the privileged external UI realm only when its environment explicitly sets `PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI=true`.

Synaesthetic evaluator downloads and rewrite-service calls enforce URL, redirect, deadline, local-input-size, and streamed response-size bounds. Generated evaluator TypeScript is never requested or executed by default. Programmatic callers must explicitly set `allowUnsafeGeneratedCode: true`, and should do so only when the entire synthesizer runs inside a trusted OS sandbox because generated code and Bun subprocesses retain normal user permissions.

Synaesthetic audio/MIDI evaluations persist as immutable, versioned SQLite runs rather than duplicated HTML files. `synaesthetic:analyze` prints the complete filename, score, and stable local report URL. `synaesthetic:serve` builds and serves the shared Solid dashboard at `http://127.0.0.1:3217`; every stored result updates when that one dashboard template changes. The default Windows database is `%LOCALAPPDATA%\PadPilot\synaesthetic-evaluator\evaluations.sqlite`. Override it with `PADPILOT_EVALUATOR_DB_PATH` and the loopback port with `PADPILOT_EVALUATOR_PORT`.

## Path Expectations

- Native configure and build entrypoint: `plugin/CMakeLists.txt`
- Protobuf schema source: `utils/proto`
- browser/development UI output: `ui/dist`
- CMake embedded and packaged UI output: `build/plugin/embedded-ui`
- Marketplace runtime entry: `../pad-pilot-marketplace/src/server.ts`

## Related Documentation

- [Root README](../README.md)
- [Backend README](../plugin/README.md)
- [Frontend README](../ui/README.md)
- [Marketplace README](../../pad-pilot-marketplace/README.md)
- [PadPilot docs](../../../docs/pad-pilot/README.md)
