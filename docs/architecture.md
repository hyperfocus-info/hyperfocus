# Architecture

Hyperfocus separates presentation contracts from privileged local capabilities.

```text
engine-editor --+--> @hyperfocus/ui
                +--> @hyperfocus/workspace
                +--> @hyperfocus/ai-core --typed WebSocket--> harness
                `--> @hyperfocus/engine

harness --------+--> @hyperfocus/ai-core
                +--> @hyperfocus/ui
                `--> local runtime adapters / SQLite / processes

pad-pilot ------+--> @hyperfocus/pad-pilot
                +--> @hyperfocus/ui
                `--> JUCE / QuickJS-NG / SDL2 / host persistence

pad-pilot-marketplace --> @hyperfocus/pad-pilot --> SQLite / auth / billing
```

`@hyperfocus/ui` may know about DOM interaction and Solid. It must not know about scenes, game entities, AI runs, repositories, Bun processes, or persistence.

`@hyperfocus/workspace` is DOM-free. It defines workspace identity, relative-path safety, file operations, watching, and task requests. Engine and harness hosts may implement those interfaces differently.

`@hyperfocus/ai-core` is framework-neutral. Its protocol is the canonical contract used by the harness server, harness UI, and editor client. API keys, model execution, persistence, and agent lifecycle remain harness responsibilities.

`@hyperfocus/engine` lives under `packages/engine` and does not import application or UI packages. The editor can bundle engine source at build time, but the engine package remains independently consumable.

## PadPilot boundary

`apps/pad-pilot` composes `@hyperfocus/pad-pilot` and `@hyperfocus/ui` with
privileged JUCE, QuickJS-NG, SDL2, processor persistence, embedded WebView, and
native validation adapters. `apps/pad-pilot-marketplace` is a sibling service for
Clerk, Stripe, SQLite, uploads, catalogs, and update delivery; it never imports
plugin app source.

`@hyperfocus/pad-pilot` is framework-neutral at its root and owns portable
Module/capability identities, schemas, limits, and bounded utilities. Bun-oriented
file/process helpers are explicit subpath exports. Both apps use package manifests
across boundaries and direct relative imports internally.

PadPilot's Audio Thread reads preallocated graph/runtime state only. SDL input
pushes to Script Thread; QuickJS Module logic pushes bounded commands toward Audio;
JUCE WebView renders on UI Thread. JSON/protobuf, JS, allocation, locks, I/O, and
logging stay off Audio Thread. Processor JUCE state remains canonical across host
save/restore.

The editor's AI connection is graceful degradation. Portable artifacts do not embed a Bun harness server, do not require network access, and do not duplicate provider credentials.

## Editor command boundary

`EditorCommandSession` is the DOM-free authority for editor project state, validation, history, binary-asset commands, snapshots, and explicit handoffs. The browser shell owns presentation and calls that session; it does not define a second mutation model.

Agents normally use the same command session through the in-process `hyperfocus-editor agent --project` command or the editor server's loopback HTTP API. The filesystem host verifies the canonical project pair before executing a plan and uses the engine's crash-safe directory replacement when persisting it. Project writes are serialized by resolved project root.

## Related

- [Documentation map](README.md)
- [Distribution](distribution.md)
- [Documentation governance](documentation-governance.md)
- [Application design standard](../DESIGN.md)
- [Engine guide](../packages/engine/readme.md)
- [Engine editor guide](../apps/engine-editor/README.md)
- [Harness guide](../apps/harness/README.md)

CDP and the visual compatibility bridge are outside the project command boundary. They exist for canvas gestures, runtime interaction, downloads, accessibility, screenshots, and end-to-end verification—not as the primary agent transport.
