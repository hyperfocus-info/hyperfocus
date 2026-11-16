# Touch of Death

This private workspace example owns the game's combat tuning, procedural assets,
city authoring, appearance/network/training/reward contracts, host, and game docs.
It consumes the engine through public package entries. The editor imports its
`@hyperfocus/touch-of-death/*` exports for setup, authoring and standalone builds.

| Owner | Contents |
| --- | --- |
| `src/combat` | Current game balance, moves and combos |
| `src/presentation` | Authored fighters, city, effects, audio and project authoring |
| Other `src` folders | Portable game contracts and records |
| `src/replay` | [Protobuf archive format, compatibility and conversion](src/replay/README.md) |
| `host` | Bun relay, persistence adapters, packaging and host verification |
| `browser-tests` | Moderator UI tests, isolated from native HTTP globals |
| `docs` | [Game guide](docs/touch-of-death.md), [latest ten-persona quality audit](docs/touch-of-death-user-audit-20261024.md), approved art references and product decisions |

The [`/swarm` recipe](docs/swarm.md) supplies a source-owned CPU preparation
investigation to Harness. Browser freshness and exact-image acceptance remain
separate promotion gates.

The editor owns its command/history integration, native UI and standalone browser
shell. Its game integration tests remain in
[`apps/engine-editor/src/scene3d/game-integration`](../../../../apps/engine-editor/src/scene3d/game-integration).
The [navigation and inventory audit](docs/touch-of-death-ux-audit-20261024.md)
records wardrobe defects, reference research and the proposed simplification.
Editor installers for music, voices and directed fighters remain command adapters;
the game does not import the editor to run. Tactical experiments under
`host/tactical-evaluation` may compile instrumented engine source for a bounded
experiment; those source probes are not production runtime dependencies.

Generic simulation, rendering, physics, validation and model/WAV encoding stay in
the engine. Current tuning changes belong here. The engine's deprecated
`createTouchOfDeathPreset` and `configureTouchOfDeathCombos` exports retain frozen
0.0.x compatibility behavior until an explicit breaking release. Existing engine
regressions use that frozen fixture; game tuning tests run against this package.
Editor setup forwards the current movement and interaction factories unchanged.
The game's independent baseline-ratio tests and the editor's explicit numeric
adapter/UI expectations verify that tuning is applied once; an older editor
expectation is not authority to restore superseded game balance.

From repository root:

```powershell
bun run --cwd packages/engine/examples/touch-of-death typecheck
bun run --cwd packages/engine/examples/touch-of-death test
bun run --cwd packages/engine/examples/touch-of-death build
bun test apps/engine-editor/src/scene3d/game-integration --timeout 30000
```

The test command runs native game/host tests and browser tests in separate
processes. The latter reuses the repository DOM preload; it must not replace
Bun's HTTP globals in host protocol tests. PostgreSQL tests require an explicitly
configured disposable test database; ordinary local verification uses SQLite.

Use the [managed dev-server workflow](../../../../.agents/skills/dev-server/SKILL.md)
and [host README](host/README.md) to run a relay with a portable project pair.
The [package builder](host/package/README.md) verifies project, asset and runtime
identity before creating a local host artifact. Packaging does not deploy it.

Repeatable captures belong to the editor's
[native arena capture](../../../../apps/engine-editor/verification/arena-capture/README.md)
and the host's `verify-test-build.ts`; pass `--menus-only` for desktop/phone title
navigation without a match acceptance run. Existing image-album tooling creates
galleries; [`artifact-review/verify-browser.ts`](../../../../scripts/artifact-review/README.md)
checks their playback and navigation. Captures, albums, reports, projects and
databases belong in `.local/`. Temporary prose uses `.tmp.md` with owner/pruning
metadata. Extend these owners before creating another maintained local helper.
