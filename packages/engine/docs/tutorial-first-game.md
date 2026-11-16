# Your first playable game

This path starts with two files, gives you immediate movement in the browser, makes one safe gameplay change, and produces one standalone game. It assumes you are running commands from the Hyperfocus engine checkout with Bun installed.

## 1. Create the game

```sh
bun run create:project -- top-down ./my-first-game --name "My First Game"
```

The new directory contains only:

```text
my-first-game/
  .hyperfocus/
    project.json
    assets.hfp
```

`project.json` is ordinary readable JSON. `assets.hfp` is a standard ZIP and is empty in this color-shape starter. Hyperfocus has not generated a package, scene class, entity wrapper, or dependency tree.

## 2. Play while you work

```sh
bun run dev:game -- --project ./my-first-game
```

Open `http://127.0.0.1:8797` and move with WASD or the arrow keys. Leave this terminal running. The dev command watches the two project files and any TypeScript behavior files you explicitly reference later.

If an edit is invalid, the browser keeps showing the last good game and displays the build error. Fixing the file rebuilds and reloads automatically; you do not need to restart the command.

## 3. Make one gameplay edit

In a second terminal, increase the player's movement speed:

```sh
bun run edit:project -- --project ./my-first-game --player-speed 360
```

The running browser reloads. Movement is now faster. This command changes one data value, validates the whole project/archive pair, and crash-safely replaces the same two canonical files. It does not create a backup forest or generated source.

For manual data editing later, the value you changed is the player's `input` component `speed` in `.hyperfocus/project.json`. The narrow command is used here so your first save cannot leave mismatched JSON and asset files.

## 4. Build the standalone game

Stop the development server with Ctrl+C, then run:

```sh
bun run build:game -- --project ./my-first-game
```

The result is one playable HTML file under `my-first-game/dist/`, accompanied by
`<game>.html.receipt.json`. The HTML contains the validated project pair, runtime,
renderer, and assets; it has no CDN or editor-storage dependency. The receipt
identifies that exact artifact and its build inputs; it is not required to play.
The `dist` directory is disposable build output, not canonical project state.
See [build receipt verification](project-development.md#build-receipt).

## Verify the entire journey

Engine contributors can replay the clean-room path automatically:

```sh
bun run verify:beginner
```

The acceptance creates an OS-temporary project, launches the real dev server, proves keyboard input moves the player, performs the supported speed edit, observes live reload, introduces and repairs an invalid project edit to prove last-good recovery, builds one standalone HTML game, and removes all generated evidence. A passing JSON report is evidence for this exact path—not a claim that every advanced workflow is complete.
