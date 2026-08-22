# Hyperfocus

Hyperfocus is a local-first Bun monorepo for an engine, an engine editor, an AI development harness, and the reusable packages beneath both applications.

```text
hyperfocus/
├── apps/
│   ├── engine-editor/
│   └── harness/
├── packages/
│   ├── ai-core/
│   ├── ui/
│   └── workspace/
├── engine/
├── docs/
└── package.json
```

The governing rule is simple: consumers install the smallest package that solves their problem, while first-party applications may compose several packages from this repository.

## Packages and applications

- `@hyperfocus/engine` is the browser/game/server engine and remains editor-independent.
- `@hyperfocus/ai-core` owns framework-neutral, zod-validated harness contracts and its WebSocket client.
- `@hyperfocus/workspace` defines safe project, filesystem, watch, and task interfaces without choosing a host implementation.
- `@hyperfocus/ui` owns Solid/StyleX presentation: primitives, composer, transcript, terminal surface, workbench, and source editor.
- `hyperfocus-editor` is the portable editor application and future `bunx hyperfocus-editor` package.
- `@hyperfocus/harness` owns runtime execution, credentials, SQLite persistence, terminal sessions, and agent state.

Read [Architecture](docs/architecture.md), [Distribution](docs/distribution.md), and [Migration status](docs/migration/status.md) before changing boundaries.

## Development

Requires Bun 1.3.14 or newer.

```powershell
bun install
bun run dev:harness
bun run dev:editor
bun run check
```

PowerShell installations that block `bun.ps1` can use `bun.cmd` for the same commands.

## AI in the editor

The editor is fully usable without AI. Its AI panel connects on demand to a local harness (default `http://127.0.0.1:8787`), renders shared UI locally, and sends typed commands to the active harness project/thread. Credentials and runtime state never move into the editor.

## License

The imported [Hyperfocus Source-Available Game License 2.0](LICENSE) is the repository's current root license and is not an OSI-approved open-source license. Its definition of “Software” names only the engine, so it does not yet unambiguously cover every first-party app and package. Resolve that scope, the Licensor identity, and royalty contact details before publication; see [Licensing](docs/licensing.md).
