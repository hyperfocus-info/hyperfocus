# Architecture

Hyperfocus separates presentation contracts from privileged local capabilities.

`@hyperfocus/website-host` owns the shared HTTP and Clerk OIDC boundary consumed
by Books and Trade Bot. Hosts own canonical domains, credentials, authorization
and application persistence; [its contract](../packages/website-host/README.md)
preserves app-specific encrypted session namespaces.

[Serialization guidance](serialization.md) owns measured codec selection,
JSON migration boundaries and hot-path comparison requirements.

Touch of Death has one [example package owner](../packages/engine/examples/touch-of-death/README.md).
The editor's command and UI adapters import that game; the example's runtime and
host import public engine contracts. The engine never imports the example.

Architecture changes have high freedom within these ownership boundaries. Prefer
the smallest model that serves named real consumers. Extract only for those
consumers, a repeated failure/manual workflow, or a measured bottleneck. A new
abstraction is complete when its real consumers use it and the affected contracts
are verified. For unresolved tradeoffs with different product consequences, show
the concrete alternatives and ask; record an approved decision beside its owner.

```text
engine-editor --+--> @hyperfocus/ui
                +--> @hyperfocus/workspace
                +--> @hyperfocus/ai-core
                +--> @hyperfocus/ai-runtime --> providers / local agent CLIs
                `--> @hyperfocus/engine

harness --------+--> @hyperfocus/ai-core
                +--> @hyperfocus/ui
                `--> local runtime adapters / SQLite / processes

pad-pilot ------+--> @hyperfocus/pad-pilot
                +--> @hyperfocus/ui
                +--> @hyperfocus/ai-core
                +--> packaged @hyperfocus/ai-runtime
                `--> JUCE / QuickJS-NG / SDL2 / host persistence

pad-pilot-marketplace --> @hyperfocus/pad-pilot --> SQLite / auth / billing
```

`@hyperfocus/ui` may know about DOM interaction and Solid. It must not know about scenes, game entities, AI runs, repositories, Bun processes, or persistence.

`@hyperfocus/workspace` is DOM-free. It defines workspace identity, relative-path safety, file operations, watching, and task requests. Engine and harness hosts may implement those interfaces differently.

`@hyperfocus/utilities` owns portable primitives shared by engine, UI, app hosts
and repository tooling. Consumers import focused subpaths; the package imports
no other Hyperfocus package and owns no app state, DOM, persistence or domain
commands. Its [contract](../packages/utilities/README.md) distinguishes legacy
validation, bounds and formatting policies so consolidation preserves behavior.

`@hyperfocus/ai-core` is framework-neutral. It owns the canonical Harness protocol plus portable AI execution profiles, catalogs, run envelopes, typed app-action plans, and explicit handoffs. It does not execute models or read credentials.

`@hyperfocus/ai-runtime` is privileged Bun code. It discovers direct-provider models, hosts extensible agent adapters, includes read-only Codex and Copilot CLI adapters when installed, and protects provider credentials with Windows DPAPI. A host app may call it in-process, mount its loopback HTTP adapter, or package its CLI runner. Provider and reasoning defaults may be shared machine-user state; explicit profiles and execution policy remain app-owned. Design context is derived per task, not stored as a shared preference; [AI context](design-system/agent-workflow.md) owns that routing. The [runtime package](../packages/ai-runtime/README.md) owns persistence and transport. Editor and PadPilot share its credential vault; Harness retains a separate protected store. Credentials and user defaults never belong to project state.

Privileged process creation is shared through `@hyperfocus/desktop-runtime/process`;
owned headless browser automation uses `/automation`. AI runtime, app hosts, and
repository tests consume these explicit Node/Bun subpaths. Engine runtime and UI
runtime do not depend on them; their development and browser-test tooling may.

`@hyperfocus/engine` runtime stays independent of application and UI packages.
Its project-build tooling currently bundles the editor-owned standalone host
through `scripts/project-build/build-authoring.ts`; that build dependency is
separate from the independently consumable engine runtime.

## PadPilot boundary

`@hyperfocus/review-store` is a privileged Bun/SQLite primitive shared by the
artifact review host and PadPilot's synaesthetic evaluator. Hosts supply their
database connection, validate domain payloads, and own access control. The package
owns immutable asset identities/bytes and append-only feedback scoped to asset
version and reviewer. It has no UI, generation, grading policy, or publishing logic.
See [the package contract](../packages/review-store/README.md).

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

PadPilot packages the Bun AI runner beside the standalone executable and in the VST3 Resources directory. The WebView invokes it through an asynchronous JUCE native function; model execution, process I/O, and credential access stay off the UI and Audio Threads. Development mounts the same runtime on the PadPilot app's loopback server. No Harness process is required.

The Editor mounts the same runtime in its own loopback server. Both apps degrade cleanly when no provider or CLI is authenticated. Portable project and DAW artifacts do not embed credentials, profiles, transcripts, or runtime state.

## App action boundary

AI responses are untrusted plans, never UI instructions. `hyperfocus-app-action-plan-v1` names bounded semantic actions against a captured revision. Each app compiles those actions into its existing DOM-free authority, shows a preview, requires explicit Apply, rejects stale revisions, and returns an explicit handoff. Deterministic bulk scripts resolve selectors and expand repeated work; models do not invent DOM selectors or repeat low-level mutations.

Editor plans compile into `EditorCommandSession`. PadPilot plans compile into processor bridge intents; the public Module text-generation API does not expose this global mutation authority.

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
