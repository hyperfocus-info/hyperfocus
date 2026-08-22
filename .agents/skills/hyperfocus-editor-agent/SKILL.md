---
name: hyperfocus-editor-agent
description: Operate Hyperfocus projects through the DOM-free editor command API, create reproducible command plans, collect explicit JSON handoffs, and manage project-local Bun dependencies. Use when an agent needs to inspect, create, edit, import, or persist an editor project; use browser automation only for visual or runtime verification.
---

# Hyperfocus Editor Agent

Use the DOM-free command session for project work. It is the same validated state and history authority used by the browser UI, but it does not require a browser. Treat each operation as a short observe-act-verify-handoff cycle.

## Operate directly

Read [references/commands.md](references/commands.md) before authoring the first command plan. Capture the canonical project snapshot without starting the editor:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --project C:\path\to\game --out before.json
```

Run a plan and persist it through the engine's crash-safe canonical pair replacement:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --project C:\path\to\game --plan commands.json --out handoff.json
```

Use `--no-persist` for a validated dry run and `--plan -` for stdin. The filesystem host opens and verifies the canonical `.hyperfocus` pair, applies commands through the shared session, and uses the engine's crash-safe directory swap when persisting.

## Call the loopback API

Start the local editor server only when another process needs HTTP:

```powershell
bun.cmd run dev:editor
```

Then use `GET /api/agent/v1/project?root=<encoded-project-root>` and `POST /api/agent/v1/commands`, or let the CLI use that API:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --api http://127.0.0.1:8796 --project C:\path\to\game --plan commands.json --out handoff.json
```

The mutation API is enabled only on loopback bindings and rejects cross-origin browser requests. Keep plans small and give every plan a unique `requestId` and a concrete `intent`. Inspect `ok`, `results`, `persisted`, `projectHash`, and `snapshot` before continuing.

## Use the browser only when needed

The browser exposes `globalThis.__hyperfocusEditorCommands`, backed by the same command session. Use it when a browser is already attached. Read [references/protocol.md](references/protocol.md) only for visual controls, canvas gestures, screenshots, accessibility checks, downloads, or runtime/play verification.

CDP is a compatibility transport for those visual tasks, not the normal project-editing API:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --cdp http://127.0.0.1:9222 --url http://127.0.0.1:8796 --plan ui-actions.json --out visual-handoff.json
```

## Manage custom libraries

Use the editor's Bun wrapper for project-local packages. It executes Bun with an explicit argv and project cwd; do not construct a shell command from package names.

```powershell
bun.cmd apps/engine-editor/cli.ts deps list --project C:\path\to\game
bun.cmd apps/engine-editor/cli.ts deps add zod@4 --project C:\path\to\game --exact
bun.cmd apps/engine-editor/cli.ts deps add typescript --project C:\path\to\game --dev
bun.cmd apps/engine-editor/cli.ts deps remove zod --project C:\path\to\game
bun.cmd apps/engine-editor/cli.ts deps install --project C:\path\to\game --frozen
```

Use `--optional` or `--peer` only when the package contract requires that section. Use `--trust` only after explicitly reviewing and accepting that package's lifecycle behavior. The selected project must already contain `package.json`.

## Preserve editor boundaries

- Keep `.hyperfocus/project.json` plus `.hyperfocus/assets.hfp` authoritative. Do not hand-edit `assets.hfp` or IndexedDB.
- Put arbitrary TypeScript, tests, shaders, and server code outside `.hyperfocus`.
- Use the harness connection for AI runtime execution and credentials; the editor remains a thin client.
- Prefer the portable two-file save or neutral export actions over scraping browser storage.
- If project work cannot be expressed by the command session, add a typed DOM-free command and real test. Add visual compatibility actions only for genuinely browser-owned behavior.

## Hand off explicitly

Every mutation must end with the JSON handoff produced by the command session. Read [references/handoffs.md](references/handoffs.md) and report:

- request ID and intent;
- whether every command completed;
- resulting project hash, persistence status, project state, and dirty state;
- the verification performed;
- unresolved errors and the next safe action.

Before finishing, capture a final direct project snapshot even if the last command failed. For visual or interaction-sensitive work, also verify the rendered result in the collaborative browser and retain a screenshot or recording when available.
