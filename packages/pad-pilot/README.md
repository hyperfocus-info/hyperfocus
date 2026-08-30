# `@hyperfocus/pad-pilot`

Portable public contracts for PadPilot Module authors, marketplace tooling, and
non-native consumers. This package owns stable Module and capability identities,
validated manifests, QuickJS script types, factory metadata, bounded I/O helpers,
semantic-version handling, and update signing. It has no JUCE, DOM, Solid, or Audio
Thread ownership.

The framework-neutral `module-ui-contract` and `host-surface` exports type an
external UI entry without making this package own a rendering framework. The host
app compile-checks its injected service surface against the same contract.

## Define a Module manifest

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

Validation rejects traversal, invalid identities and semantic versions, duplicate
or malformed capabilities, oversized names and paths, and unsupported state schema
versions before a bundle reaches native installation.

## Define QuickJS behavior

```ts
import { registerPadPilotScriptModule } from "@hyperfocus/pad-pilot/script-contract";

registerPadPilotScriptModule({
  module: {
    moduleApiVersion: "0.1.0",
    healthCheck: () => true,
    onInput: (event) => event.type === "button"
      ? { type: "keystroke", keyCode: 65, isKeyDown: event.value > 0 }
      : null,
  },
});
```

The host still authorizes every returned action against the selected Module and its
declared capabilities. Module JavaScript runs only on the Script Thread.

## Type a Module UI entry

```ts
import type { PadPilotServiceHostSurface } from "@hyperfocus/pad-pilot/host-surface";
import { definePadPilotModule } from "@hyperfocus/pad-pilot/module-ui-contract";
import { manifest } from "./manifest";

declare const PadPilot: PadPilotServiceHostSurface;

export default definePadPilotModule({
  manifest,
  Component: () => {
    const [state] = PadPilot.hooks.useModuleState(manifest.id, { notes: "" });
    return state().notes;
  },
});
```

The component type is inferred from the author's UI framework. Production still
uses the trusted starter UI until external code can run in a sandboxed Module realm.

## Export map

- `.`: browser-safe identities, manifests, script contracts, semver, and factory metadata.
- `./module-manifest`: canonical manifest schema, types, limits, and helpers.
- `./module-ui-contract`, `./host-surface`: framework-neutral UI lifecycle, state,
  controller, file, analyzer, MIDI, host, sample, and FX service types.
- `./script-contract`: typed QuickJS input/action contract and global registration helper.
- `./module-identity`, `./automation-identity`, `./factory-modules`, `./file-import`, `./semver`: bounded portable contracts.
- `./marketplace-schema`, `./update-signing`: marketplace and release validation.
- `./bounded-stream`: browser-safe bounded stream reading.
- `./bounded-file`, `./subprocess`: Bun-only filesystem and process boundaries; do not import them in browser bundles.

Import only declared package exports. The manifest-backed export test verifies every
subpath, and the consumer fixture proves a Module can typecheck, execute, and bundle
using public imports only.

## Verification

```powershell
bun.cmd run --cwd packages/pad-pilot test
bun.cmd run --cwd packages/pad-pilot typecheck
bun.cmd run --cwd packages/pad-pilot build
```

See [Module author guide](../../docs/pad-pilot/module-author-guide.md),
[Package Testing](../../docs/package-testing.md), and the executable
[consumer fixture](fixtures/module-consumer/verify.ts).

First-time setup and recovery notes live beside it in the
[consumer fixture README](fixtures/module-consumer/README.md).
