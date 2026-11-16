# Hyperfocus

Hyperfocus is a local-first Bun monorepo for an engine, editor, AI development
harness, PadPilot VST3 platform, marketplace service, and their reusable packages.

```text
hyperfocus/
|-- apps/
|   |-- engine-editor/
|   |-- harness/
|   |-- pad-pilot/
|   `-- pad-pilot-marketplace/
|-- packages/
|   |-- ai-core/
|   |-- desktop-runtime/
|   |-- engine/
|   |-- pad-pilot/
|   |-- ui/
|   `-- workspace/
|-- docs/
`-- package.json
```

The governing rule is simple: consumers install the smallest package that solves their problem, while first-party applications may compose several packages from this repository.

## Packages and applications

- `@hyperfocus/engine` is the browser/game/server engine and remains editor-independent.
- `@hyperfocus/ai-core` owns framework-neutral, zod-validated harness contracts and its WebSocket client.
- `@hyperfocus/workspace` defines safe project, filesystem, watch, and task interfaces without choosing a host implementation.
- `@hyperfocus/desktop-runtime` provides framework-neutral local-server, protocol-launch, shutdown-lease, and update-check primitives.
- `@hyperfocus/ui` owns Solid/StyleX presentation: primitives, composer, transcript, terminal surface, workbench, and source editor.
- `@hyperfocus/pad-pilot` owns portable Module/capability identities, schemas, limits, and bounded utilities.
- `hyperfocus-editor` is the portable editor application and future `bunx hyperfocus-editor` package.
- `@hyperfocus-info/harness` owns runtime execution, credentials, SQLite persistence, terminal sessions, and agent state.
- `@hyperfocus/pad-pilot-app` owns the JUCE VST3/standalone host, embedded Solid UI, QuickJS runtime, factory Modules, and host validation.
- `@hyperfocus/pad-pilot-marketplace` owns independently deployable auth, billing, SQLite, uploads, catalog, and update delivery.

Use the [documentation map](docs/README.md) to load only the area relevant to the task.
Use [documentation governance](docs/documentation-governance.md) when changing docs,
story inventories, coverage routes, or README ownership.
Read [Architecture](docs/architecture.md), [Distribution](docs/distribution.md), and
[Migration status](docs/migration/status.md) when changing package or release boundaries.

## Development

Requires Bun 1.4.0 or newer.

```powershell
bun install
bun run dev:harness
bun run dev:editor
bun run dev:pad-pilot
bun run check
```

PowerShell installations that block `bun.ps1` can use `bun.cmd` for the same commands.

## AI in the editor

The editor is fully usable without AI. Its AI panel connects on demand to a local harness (default `http://127.0.0.1:8787`), renders shared UI locally, and sends typed commands to the active harness project/thread. Credentials and runtime state never move into the editor.

Agents operate canonical projects through the DOM-free `EditorCommandSession`, either in-process with `hyperfocus-editor agent --project` or through the loopback HTTP API. The browser UI uses that same validated state/history authority; CDP is reserved for visual and runtime verification. Plans return explicit JSON handoffs rather than relying on hidden state. Project-local custom libraries are managed through `hyperfocus-editor deps`, a thin no-shell wrapper over Bun's add, remove, install, and dependency-list operations. See [the editor guide](apps/engine-editor/README.md) and the bundled `hyperfocus-editor-agent` skill.

## License

The [Hyperfocus Source-Available Game License 2.0](LICENSE) applies to all first-party
engine, editor, harness, shared packages, and other material governed by the root
license. PadPilot apps and
`@hyperfocus/pad-pilot` retain the
[MindOverMelee Source-Available License 1.0](apps/pad-pilot/LICENSE). Third-party
materials remain subject to their own terms; this includes separately licensed
third-party dependencies and assets. These are source-available licenses, not
OSI-approved open-source licenses. Licensor identity and reporting details still
need completion before publication; see [Licensing](docs/licensing.md).
