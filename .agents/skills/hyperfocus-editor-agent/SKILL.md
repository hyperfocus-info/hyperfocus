---
name: hyperfocus-editor-agent
description: Operate the Hyperfocus Engine Editor through its typed browser action protocol, create reproducible action-plan scripts, collect explicit JSON handoffs, and manage project-local Bun dependencies. Use when an agent needs to create, open, inspect, edit, play, profile, build, import, export, or otherwise operate an editor project instead of only changing repository source.
---

# Hyperfocus Editor Agent

Use the editor's public agent bridge rather than relying on brittle coordinates or private application state. Treat each operation as a short observe-act-verify-handoff cycle.

## Start and attach

1. Build and start the editor from the repository root:

   ```powershell
   bun.cmd run build:editor
   bun.cmd run dev:editor
   ```

2. Open `http://127.0.0.1:8796` in a Chromium browser started with a loopback-only remote debugging port and a dedicated non-personal profile. Close that browser when the task is done.
3. Capture the initial structured snapshot:

   ```powershell
   bun.cmd apps/engine-editor/cli.ts agent --cdp http://127.0.0.1:9222 --url http://127.0.0.1:8796 --out before.json
   ```

If an automation-capable collaborative browser is already attached, use its evaluate facility to call `globalThis.__hyperfocusEditorAgent.snapshot()` or `.perform(plan)` directly. The global bridge is the contract; the browser driver is only a transport.

## Perform work

Read [references/protocol.md](references/protocol.md) before authoring the first plan. Keep plans small and give every plan a unique `requestId` and a concrete `intent`.

Run a saved plan and persist its handoff:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --cdp http://127.0.0.1:9222 --url http://127.0.0.1:8796 --plan plan.json --out handoff.json
```

Use `--plan -` to read JSON from stdin. Inspect the returned `ok`, `results`, and `snapshot` before sending another plan. Stop on a failed action, correct the target from the new control inventory, and retry with a new request ID.

The protocol deliberately covers semantic clicks, fields, checkboxes, keyboard input, pointer/canvas input, drag-and-drop, project and asset uploads, and bounded waits. This is the browser equivalent of the user's interaction surface. Use specific semantic targets (`editorAction`, `workspace`, `projectEntity`, and similar) before raw CSS selectors.

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
- If a user-visible operation cannot be expressed by the protocol, add a typed action plus a real test. Do not silently fall back to undocumented private globals.

## Hand off explicitly

Every mutation must end with the JSON handoff produced by `perform`. Read [references/handoffs.md](references/handoffs.md) and report:

- request ID and intent;
- whether every action completed;
- resulting project, mode, workspace, selection, and dirty state;
- the verification performed;
- unresolved errors and the next safe action.

Before finishing, capture a final standalone snapshot even if the last action failed. For visual or interaction-sensitive work, also verify the rendered result in the collaborative browser and retain a screenshot or recording when available.
