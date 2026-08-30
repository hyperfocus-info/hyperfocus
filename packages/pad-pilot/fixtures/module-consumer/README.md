# Module consumer fixture

This is the smallest executable proof for an external PadPilot Module author. It
uses only declared `@hyperfocus/pad-pilot` exports and covers one controller-driven
Module manifest, QuickJS behavior, host-owned state, codec registration, producer
actions, and a framework-neutral UI definition.

## Run it

Prerequisite: Bun 1.4.x and this repository's root dependencies installed.

```powershell
cd C:\path\to\hyperfocus
bun.cmd test packages/pad-pilot/module-consumer.test.ts
bun.cmd run --cwd packages/pad-pilot typecheck
bun.cmd run --cwd packages/pad-pilot build
```

Success is local and deterministic after dependencies are installed; it needs no
PadPilot account, marketplace purchase, AI service, controller, or network request.
The test executes the manifest and Script Thread contract, typechecks the state/UI
surface, and creates a browser bundle from `verify.ts`.

## Safe next step

Use PadPilot **Add Module** for the host-owned starter bundle, then copy the manifest,
script registration, and UI-definition patterns from `verify.ts`. Request every
output capability you use: the fixture requests `keyboard-output` and `midi-output`
in addition to controller input and Module state.

Production renders the trusted starter UI and does not execute an installed custom
UI bundle until the sandbox broker ships. The public UI types are useful today for
local development and preserve the contract that will cross that sandbox later.

See the [Module author guide](../../../../docs/pad-pilot/module-author-guide.md) for
bundle layout, install limits, recovery behavior, and verification gates.
