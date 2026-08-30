# Build a PadPilot Module

This is the supported first path for a Module author. It uses only public
`@hyperfocus/pad-pilot` contracts and the host-provided PadPilot surface.

## What is supported

- A Module bundle is a ZIP with `padpilot-module.json` at its root.
- Optional QuickJS behavior runs on the Script Thread and receives bounded input events.
- Canonical Module state and Presets round-trip through the plugin processor.
- The verified installed Module gets a trusted host-owned starter UI by default.
- Custom external UI JavaScript is not executed in production until the sandbox
  broker is complete. `PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI=true` is a local
  development-only override, not a distribution setting.

Factory Modules use the same public capability authorization and state paths. They
may ship custom host-bundled UI; installed custom UI remains behind the sandbox gate.

## 1. Start with the public contracts

Inside this monorepo, use the workspace package. An external source checkout can
point a package manager at the repository/package revision it has reviewed.

```ts
import { definePadPilotModuleManifest } from "@hyperfocus/pad-pilot/module-manifest";

export const manifest = definePadPilotModuleManifest({
  id: "controller-notes",
  name: "Controller Notes",
  version: "1.0.0",
  moduleApiVersion: "0.1.0",
  minHostVersion: "0.1.0",
  uiEntry: "ui/ui-entry.js",
  scriptEntry: "script/module.js",
  stateSchemaVersion: 1,
  capabilities: ["controller-input", "module-state"],
});
```

Write the returned object to `padpilot-module.json`. Keep ids lowercase kebab-case,
use semantic versions, use forward-slash bundle-relative paths, and request only
capabilities the Module uses.

## 2. Add bounded Script Thread behavior

```ts
import { registerPadPilotScriptModule } from "@hyperfocus/pad-pilot/script-contract";

registerPadPilotScriptModule({
  module: {
    moduleApiVersion: "0.1.0",
    healthCheck: () => true,
    onInput: (event) => {
      if (event.type !== "button" || event.mappedControlId !== 0) return null;
      return { type: "keystroke", keyCode: 32, isKeyDown: event.value > 0 };
    },
  },
});
```

Bundle this entry for QuickJS without Node-only APIs. The host validates the API
version, applies execution deadlines and memory bounds, and rejects actions whose
capability was not granted. `keyboard-output` is required for `keystroke`;
`fx-graph` is required for `audioCommand`.

Optional state migrations implement `upgradeState(stateJson, from, to)` and return
the next bounded JSON state. Each adjacent step runs under its own watchdog; the
processor commits only after the complete migration succeeds.

## 3. Use the safe starter surface

Custom UI source can type its framework component and injected service surface
without importing app-private files:

```ts
import type { PadPilotServiceHostSurface } from "@hyperfocus/pad-pilot/host-surface";
import { definePadPilotModule } from "@hyperfocus/pad-pilot/module-ui-contract";
import { manifest } from "./manifest";

declare const PadPilot: PadPilotServiceHostSurface;

export default definePadPilotModule({
  manifest,
  Component: () => {
    const controller = PadPilot.hooks.useGamepad();
    const [state, setState] = PadPilot.hooks.useModuleState(manifest.id, { notes: "" });
    if (controller().buttons[0]) setState({ notes: "A pressed" });
    return state().notes;
  },
});
```

The public type contract does not bypass the safety gate below; it lets the same
entry compile in development today and remain portable to the sandboxed runtime.

Choose **Add Module** in PadPilot to materialize a starter bundle under:

```text
%APPDATA%\PadPilot\modules\installed\<module-id>\<version>\
|-- padpilot-module.json
|-- script\module.js
`-- ui\ui-entry.js
```

With the production safety default, PadPilot ignores external UI code and renders
its trusted starter component. The starter's notes demonstrate host-owned Module
state. Script behavior still loads through QuickJS when the Module is selected and
ready.

## 4. Package and install

The ZIP root—not a containing folder—must include `padpilot-module.json` and every
declared entry, asset, and migration file. Keep the archive below 128 MiB; the host
also enforces entry-count, per-entry, expanded-size, path, symlink, and traversal
limits.

Install through `PadPilot.modules.installBundle()` or the app's Module install
flow. Installation stages and validates the archive before replacing an existing
version. A failure leaves the previous install and processor-owned state intact.

## 5. Verify before sharing

Use the public consumer fixture as the minimal manifest, Script Thread, controller,
state, codec-registration, and UI-definition contract:

```powershell
bun.cmd test packages/pad-pilot/module-consumer.test.ts
bun.cmd run --cwd packages/pad-pilot typecheck
bun.cmd run --cwd packages/pad-pilot build
```

Then test create, install, select, input, state save/reopen, missing-bundle recovery,
and capability denial in the PadPilot dev host. Native/release work also follows the
[VST quality gates](vst-quality-gates.md).

## Public host surface

The selected Module can use the injected `window.PadPilot` surface for host-safe UI
and services. Important namespaces include `hooks`, `hotkeys`, `IO`, `midi`,
`analyzer`, `host`, `sampleCapabilities`, `capabilities.fxGraph`,
`capabilities.fxVisualizer`, and `createProducerActions`. Service availability is
capability-scoped; handle denial is a normal explicit state, not a reason to bypass
the public bridge.

Related: [`@hyperfocus/pad-pilot`](../../packages/pad-pilot/README.md),
[Module bridge compatibility](module-bridge-compatibility.md), and
[user stories](user-stories.md).
