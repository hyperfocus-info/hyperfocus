# DOM-free editor commands

The command session owns project validation, history, binary assets, snapshots, and handoffs without importing the DOM. The browser shell, direct CLI, and loopback API use this same implementation.

## Command plan

```json
{
  "requestId": "rename-001",
  "intent": "Rename the project and target mobile browsers",
  "commands": [
    {
      "type": "project.patch",
      "label": "Rename and retarget project",
      "operations": [
        { "op": "test", "path": "/name", "value": "Old Name" },
        { "op": "replace", "path": "/name", "value": "New Name" },
        { "op": "replace", "path": "/settings/targetProfile", "value": "mobile" }
      ]
    }
  ]
}
```

Use JSON Pointer paths. Supported patch operations are `add`, `replace`, `remove`, and `test`. Project validation runs before a mutated snapshot becomes authoritative. Unsafe prototype tokens, nonexistent replacements, invalid arrays, non-finite project data, and invalid engine declarations fail without mutating the current project.

## Command types

- `project.patch`: Apply up to 1,000 validated JSON Patch operations under one history label.
- `project.replace`: Replace the project with a complete migrated and validated `project` object.
- `project.create-starter`: Create `pong`, `platformer`, `blank-2d`, `3d-action`, or `showcase` with a `name`. Binary-backed starters use the injected asset host.
- `timeline.apply-recipe`: Expand `anticipation`, `lunge`, `impact`, `bite`, or `transform` into editable timeline keys and deterministic visual-effect cues. Provide an integer `frame`, a `primaryEntityId`, and a `secondaryEntityId` for `bite`; an optional stable `id` makes generated key/effect IDs reproducible.
- `timeline.set-clip-key`: Set or replace a stepped named Atlas clip cue for one `entityId` at an integer `frame`. Provide `clipId`; optionally provide `trackId` to target an existing unlocked clip track. Before its first cue, the entity keeps its sprite component's `animationClip` default.
- `asset.import`: Import one base64 file with `name` and `mimeType`. The command computes its SHA-256 and updates the canonical catalog.
- `asset.hydrate`: Restore base64 bytes for an existing catalog `assetId` without duplicating metadata or dirtying project history. Size and SHA-256 must match the open project.
- `asset.remove`: Remove an asset by `assetId` from the catalog and binary host.
- `history.undo` and `history.redo`: Traverse changes made in the current command session.
- `session.mark-saved`: Mark the current in-memory revision saved. File-backed persistence does this automatically.

## Direct CLI

Snapshot:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --project C:\game
```

Persist a plan with the crash-safe canonical pair writer:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --project C:\game --plan commands.json --out handoff.json
```

Validate without writing:

```powershell
bun.cmd apps/engine-editor/cli.ts agent --project C:\game --plan commands.json --no-persist
```

## HTTP API

Snapshot:

```http
GET /api/agent/v1/project?root=C%3A%5Cgame
```

An attached browser that must Play or preview binary-backed work can request the
complete pair with `&includeAssets=base64`, then execute `project.replace`
followed by `asset.hydrate` commands. This loopback-only transfer is capped at
24 MiB of unpacked assets; use the offline build or the native two-file Open flow
for larger projects.

Mutation:

```http
POST /api/agent/v1/commands
Content-Type: application/json

{
  "projectRoot": "C:\\game",
  "persist": true,
  "plan": {
    "requestId": "rename-001",
    "intent": "Rename the project",
    "commands": [
      {
        "type": "project.patch",
        "label": "Rename project",
        "operations": [{ "op": "replace", "path": "/name", "value": "New Name" }]
      }
    ]
  }
}
```

Requests for the same project root are serialized. The API is disabled when the server binds to a non-loopback address.
