---
name: hyperfocus-editor-agent
description: Inspect, create, edit, import, or persist Hyperfocus editor projects through the DOM-free command API. Use for project automation and project-local dependencies; browser tools verify visual or runtime behavior.
---

# Editor project operations

For source-backed app examples, use the separate
[example workspace](../../../apps/engine-editor/example-workspace/README.md)
and its validated CLI; `.hfapp` source projects are distinct from engine
`.hyperfocus` pairs and Website JSON. All three have visible editor routes.

Use the DOM-free command session shared with the UI. Before the first plan, read
[command plan](references/commands.md#command-plan), then search only the needed
command family. Use `baseProjectHash` for filesystem stale-write protection.

```text
bun apps/engine-editor/cli.ts agent --project <root> --out before.json
bun apps/engine-editor/cli.ts agent --project <root> --plan commands.json --out handoff.json
```

Plans use unique `requestId` values and concrete intents. `--no-persist` validates
without saving; `--plan -` reads stdin. Inspect `ok`, `results`, `persisted`,
`projectHash`, and `snapshot`; preserve [JSON handoffs](references/handoffs.md)
and capture the final direct snapshot even after a failed mutation.

Keep `.hyperfocus/project.json` and `.hyperfocus/assets.hfp` authoritative. The
host validates and atomically replaces the canonical pair; never hand-edit binary
assets or browser storage. Arbitrary source files stay outside `.hyperfocus`.
Credentials stay in the machine-user store, never project files or command plans.

For directed scene generation and bounded playable pipelines, use the app-owned
[art service](../../../apps/engine-editor/scripts/game-art/README.md#editor-ai-and-packaged-use)
through `art:create`, packaged `art`, or the Editor proposal UI. Preparation returns
an atomic command plan and immutable review evidence; `--project` targets editable
work and preserves manual changes. Do not open the evidence directory as working data.

Load these only when needed:

- [Game art direction](../game-art-direction/SKILL.md): generating or improving game
  visuals and motion; inspect approved examples before choosing an asset direction.
- [HTTP API](references/commands.md#http-api): another process needs loopback access;
  use `dev-server` and its reported URL.
- [Visual protocol](references/protocol.md): controls, canvas, downloads, Play,
  accessibility or screenshots. A command receipt alone cannot prove rendering.
- [Dependencies](references/dependencies.md): adding/removing project-local Bun packages.
- [Narrative film production](../../../apps/engine-editor/docs/media-production/narrative-quality.md):
  creating music films or carrying sequence-quality feedback into future recipes.
  Full-song/chapter work uses the [production commands](../../../apps/engine-editor/scripts/music-video/production/README.md)
  for cue/state contracts, derived handoffs, performance checks and export identity.
  Use its scoped revision path for corrections; retain saved decisions and reuse
  unchanged chapters instead of regenerating the brief from conversation history.
  Use the shared [actor motion defaults](../../../apps/engine-editor/scripts/music-video/actor-motion/README.md)
  for limb repair and foreground autopilot; do not fork a per-film bend solver.
  Use its contract and native evidence workflow before expanding a batch.
- [Creative release audits](../user-audit/references/creative-release-audits.md):
  the task requests release-quality creative acceptance.

Choose authoring actions from the brief and approved examples. An ordinary action
missing from commands or visible UI is a product gap. Implement its smallest
complete parity-preserving path when authorized; otherwise report the boundary
instead of silently expanding a project task into engine development.
