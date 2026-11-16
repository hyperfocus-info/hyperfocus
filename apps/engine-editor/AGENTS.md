# Editor implementation

`EditorCommandSession` owns project state, validation, history, snapshots, and
handoffs. Browser UI calls that authority; hosts own filesystem persistence.
App preferences must not dirty portable projects or enter project undo history.

Every ordinary creative/project action needs a complete visible UI journey and
equivalent DOM-free command coverage. Semantic macros expand to individually
editable portable data and commit as one undoable operation. Keep
[`editor-capability-parity.ts`](src/app/editor-capability-parity.ts) and its test
current when either surface changes. Raw JSON alone is not an ordinary UI journey.

- Implementation: search [README.md](README.md) for the affected workspace or
  command; [DESIGN.md](../../DESIGN.md) owns first-party UI contracts.
- Operating an editor project: use [hyperfocus-editor-agent](../../.agents/skills/hyperfocus-editor-agent/SKILL.md).
  Use browser automation for visual/runtime verification, not project mutations.
  Expensive scripted generation and delegated work use the root
  [shared execution boundary](../../docs/agent-outcomes.md#one-execution-path-for-every-agent),
  including when launched from an external agent. Editor validation remains required.
- Website authoring/export: [website/README.md](website/README.md).
- Release: `bun run ship-check editor --plan`; [distribution](../../docs/distribution.md#engine-editor)
  owns extracted archive and package-consumer acceptance.

For a changed action, exercise its visible flow, command validation, undo, and
persistence where affected. Use focused browser-condition tests and managed
`dev:editor`; do not require the whole editor suite for a copy-only edit.
