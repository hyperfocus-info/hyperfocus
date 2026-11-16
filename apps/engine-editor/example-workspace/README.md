# Example projects

Open **Examples** in the editor. Choose an example and create a separate project.
The original example and its operational data stay untouched.

| Project | Authoring and delivery |
| --- | --- |
| Books, Trade Bot, Drawing demo, Magic Map, MMO Field, MMO Skill Demo, Motion Lab, Three Arena, 3D WebGL | Source editor, Logo/Social preview controls, saved undo/redo, Build & run, Stop, source export/import |
| Juice Me Up | Its own Website visual editor, draft/history, preview, portable JSON and connected app export |
| Touch of Death | Create Touch of Death in the editor header; native scene/combat/assets/scripts controls and game builds |
| Website recipes | Website → Starters; ordinary sections, navigation, forms, quizzes and storefront controls |

Source files and history live in `.local/engine-editor/examples/<id>`. Build & run
saves the open file, builds current source, verifies its source hash and starts an
owned supervisor process. Stop releases that process. Preview databases are new
and excluded from source exports. Source tasks inherit only basic process paths,
not provider credentials. This is a local coding workspace, not a code sandbox.

`.hfapp` is a source project for reopening in an editor with the repository's
example tooling installed; it is not a production deployment. Dependencies are
host-owned links, excluded from exports and inaccessible through the file API.
Copied engine examples receive a reproducible local compiler mapping. Website
JSON and connected archives retain their existing standalone delivery contract.

## Command parity

`bun apps/engine-editor/example-workspace/cli.ts --help` lists projects or inspects
`--id`. Pass a JSON command with `--command` and save receipts with `--out`.
[commands.ts](commands.ts) is the same validated authority used by the visible UI.
`write` requires the inspected revision and the file's current hash; `undo` and
`redo` persist across reopening. Source edits cannot traverse paths or follow
symbolic links. Import never executes code; Build and Run are explicit actions.

`bun apps/engine-editor/example-workspace/verify.ts --run` creates real example
copies, builds and serves each, then checks source export/import identity. Its
receipts live beside the copies. Browser journeys and game behavior remain
separate from this HTTP/build evidence. Use the managed `editor` surface for UI
verification; the `example-workspace` surface is owned by its editor/CLI caller.

## Next capabilities

- Image editing: crop, padding, background removal and variants with preserved
  originals, reversible edits, small-icon review and regenerated asset manifests.
- Distribute the source-tooling dependency set with the standalone editor package;
  source example compilation currently requires the repository installation.
- Add project dependency installation through an explicit, reviewable package
  plan; existing templates use their declared installed dependencies.

The engine remains framework-neutral. Project identity is an editor-owned
`extensions.hyperfocusIdentity` value, applied at the app's export boundary;
machine appearance preferences do not enter portable project history.
