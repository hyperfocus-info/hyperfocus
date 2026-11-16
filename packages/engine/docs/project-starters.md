# Minimal project starters

The project CLI creates a playable starting point without installing dependencies, contacting a network service, or generating source wrappers. Every starter initially contains exactly two files:

```text
my-game/
  .hyperfocus/
    project.json
    assets.hfp
```

Create a project from the repository checkout:

```sh
bun run create:project -- top-down ./my-game --name "My Game"
bun run create:project -- grid ./my-grid-game
bun run create:project -- platformer ./my-platformer
bun run create:project -- narrative-rpg ./my-narrative-rpg
bun run create:project -- authoritative-room ./my-room-game
bun run create:project -- 3d-action ./my-3d-game
```

Then validate and build it:

```sh
bun run create:project -- check ./my-game
bun run build:game -- --project ./my-game
```

An installed `@hyperfocus/engine` also supports the same authoring lifecycle, without
an editor checkout. With Bun and the package installed, create `author.ts`:

```ts
import { createProjectStarter } from "@hyperfocus/engine/tooling/create-project";
import { buildPortableProject } from "@hyperfocus/engine/tooling/build-project";

await createProjectStarter({ template: "top-down", outputDirectory: "./my-game" });
console.log(await buildPortableProject({ projectDirectory: "./my-game" }));
```

Run `bun author.ts`. For an existing project, omit creation, which intentionally
refuses to overwrite a directory. The installed package includes its standalone
runtime, authoring bundles, declarations and esbuild dependency. Authoring requires
Bun; browser engine imports do not load this host tooling.

`build:game` defaults to a streaming web directory under `dist/web/`; `--offline` produces a complete HTML download. It does not add wrappers to `.hyperfocus`. Keep authored TypeScript outside `.hyperfocus`; literal dynamic imports become optional web chunks. See [asset delivery](project-delivery.md) for hosting and selection policies.

## Starter scope

- `top-down` provides four-direction input, a following camera, collision boundaries, and a built-in patrol.
- `grid` provides a compact tile maze and grid-sized authored geometry. Movement is currently continuous within the grid; discrete turn/step rules remain game code or a future built-in.
- `platformer` provides the first-party deterministic platformer controller, gravity, grounded detection, rising-edge jump, coyote time, jump buffering, variable jump height, swept solid collision, platforms, a camera, and a moving hazard.
- `narrative-rpg` provides localized variable substitution and fallback text, branching dialogue choices, action-driven quest transitions, deterministic story snapshots, and checksummed browser save inclusion.
- `authoritative-room` provides the portable browser client and neutral room settings (`roomType`, tick rate, capacity, and replication policy) under the project extension namespace. Deployment/server wiring remains an explicit production step.
- `3d-action` provides a lit and textured glTF level, first-party rigid collision, follow camera, four-direction actor movement, a gesture-unlocked WAV cue, deterministic transform animation, and persisted browser state. Its glTF JSON, raw RGBA8 texture, and WAV are ordinary entries in `assets.hfp`; the starter still creates only the canonical pair. See [Portable 3D projects](./portable-runtime-3d.md).

Run `bun run create:project -- --help` for current syntax and descriptions. The CLI refuses to overwrite an existing directory. Its `check` command rejects extra canonical files, corrupt archives, unsupported runtime components, and invalid editor data with a direct diagnostic.

The five 2D/room starters use generated color shapes and no imported binaries, so `assets.hfp` is a valid empty standard ZIP. The 3D starter packs its neutral glTF JSON, raw RGBA8 texture, and WAV into that same compressed archive. Importing or removing assets still preserves the same two canonical filenames through content-addressed deduplication.
