# Editor agent protocol

The browser exposes `globalThis.__hyperfocusEditorAgent` after editor startup.

## API

```ts
bridge.listActions(): readonly string[];
bridge.snapshot(): EditorAgentSnapshot;
bridge.perform(plan: EditorAgentPlan): Promise<EditorAgentHandoff>;
```

`perform` stops at the first failure and always returns a fresh snapshot. A plan contains at most 200 actions; a single wait is capped at 10 seconds.

## Plan shape

```json
{
  "requestId": "rename-project-001",
  "intent": "Open settings and rename the project",
  "actions": [
    { "type": "click", "target": { "editorAction": "settings" } },
    { "type": "input", "target": { "selector": "#setting-project-name" }, "value": "My Game" },
    { "type": "click", "target": { "editorAction": "save-settings" } }
  ]
}
```

## Actions

- `click`: `{ "type": "click", "target": target }`
- `input`: `{ "type": "input", "target": target, "value": "text or number" }`; dispatches `input` and `change`.
- `check`: `{ "type": "check", "target": target, "checked": true }`
- `key`: `{ "type": "key", "key": "s", "code": "KeyS", "ctrl": true, "target": target? }`
- `pointer`: `{ "type": "pointer", "target": target, "event": "click|dblclick|pointerdown|pointermove|pointerup", "x": 10, "y": 20 }`; coordinates are relative to the target.
- `drag`: `{ "type": "drag", "from": target, "to": target, "data": { "application/x-engine-asset": "asset-id" } }`
- `upload`: `{ "type": "upload", "input": "project|assets", "files": [{ "name": "file", "type": "mime", "base64": "..." }] }`
- `wait`: `{ "type": "wait", "milliseconds": 100 }`

## Targets

Prefer semantic targets because they remain stable across layout changes:

```json
{ "editorAction": "create-template", "template": "blank-2d" }
{ "editorMode": "play" }
{ "workspace": "script" }
{ "projectEntity": "player-01" }
{ "projectScene": "scene-main" }
{ "scriptPath": "src/player.ts" }
{ "scene3dEntity": "player" }
```

Use `{ "selector": "#specific-field" }` for a control without a semantic target. The snapshot's `controls` array supplies reusable targets, labels, values, checked state, and disabled state for every visible conventional control.

## File example

Encode bytes without a data-URL prefix:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\game\sprite.png")
$base64 = [Convert]::ToBase64String($bytes)
```

Send project files together in one upload action. Send imported source assets to the `assets` input. Add a short wait after a large asynchronous import, then inspect the returned project asset catalog.

## Interaction guidance

- Create a fresh snapshot before selecting generated entities, scenes, scripts, or component IDs.
- Keep activation-sensitive save/open/download actions in short plans.
- Use keyboard and pointer actions for canvas tools; verify their visible state or project data afterward.
- Use one plan per coherent user intent. A handoff is evidence, not a reason to skip visual verification.
