# Architecture

Hyperfocus separates presentation contracts from privileged local capabilities.

```text
engine-editor ─┬─> @hyperfocus/ui
               ├─> @hyperfocus/workspace
               ├─> @hyperfocus/ai-core ──typed WebSocket──> harness
               └─> @hyperfocus/engine

harness ───────┬─> @hyperfocus/ai-core
               ├─> @hyperfocus/ui (shared surfaces as migration lands)
               └─> local runtime adapters / SQLite / processes
```

`@hyperfocus/ui` may know about DOM interaction and Solid. It must not know about scenes, game entities, AI runs, repositories, Bun processes, or persistence.

`@hyperfocus/workspace` is DOM-free. It defines workspace identity, relative-path safety, file operations, watching, and task requests. Engine and harness hosts may implement those interfaces differently.

`@hyperfocus/ai-core` is framework-neutral. Its protocol is the canonical contract used by the harness server, harness UI, and editor client. API keys, model execution, persistence, and agent lifecycle remain harness responsibilities.

`@hyperfocus/engine` does not import application or UI packages. The editor can bundle engine source at build time, but the engine package remains independently consumable.

The editor's AI connection is graceful degradation. Portable artifacts do not embed a Bun harness server, do not require network access, and do not duplicate provider credentials.

## Editor command boundary

`EditorCommandSession` is the DOM-free authority for editor project state, validation, history, binary-asset commands, snapshots, and explicit handoffs. The browser shell owns presentation and calls that session; it does not define a second mutation model.

Agents normally use the same command session through the in-process `hyperfocus-editor agent --project` command or the editor server's loopback HTTP API. The filesystem host verifies the canonical project pair before executing a plan and uses the engine's crash-safe directory replacement when persisting it. Project writes are serialized by resolved project root.

CDP and the visual compatibility bridge are outside the project command boundary. They exist for canvas gestures, runtime interaction, downloads, accessibility, screenshots, and end-to-end verification—not as the primary agent transport.
