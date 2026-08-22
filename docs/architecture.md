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

