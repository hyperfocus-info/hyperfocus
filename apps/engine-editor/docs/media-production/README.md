# Media production recipes

Choose a production family and a bounded action before generating a music film.
Use [native media and character actions](native-media.md) for image exposures,
bounded footage decoding, layered compositing and editable action sequences.
Use the [editable visual score](visual-score.md) to bind musical voices/events
to motif states, movement and directed shots with safe regeneration.
The [catalog](../../scripts/music-video/recipes/catalog.ts) contains 52 original
briefs in 18 families. It is planning infrastructure: most branches still need
authored assets or integration work, and none of these new briefs has visual
quality approval. The [audit](audit.md) owns priorities and evidence limits;
the [handoff](handoff.md) owns the production sequence. The
[professional music-video gap audit](music-video-gap-audit.md) compares the native
foundation with 1980s–2020s references and tracks remaining production gaps.

User direction, 2026-10-24: keep 45–75 second cuts, ambitious music synchronization
and effects, but replace the previous collection's repeated abstract shapes and
fluid bouncing with different subjects, actions and media. This preference applies
to varied music-video collections. It does not prohibit an explicitly requested
abstract study. The machine's music location remains in local user instructions.

## Choose a branch

For narrative films, apply the [creative contract and polish checks](narrative-quality.md)
before generating assets. That document owns the subsequent 6/10 feedback and
the requirement for prepared highlights with visible consequences.

| Family              | Three bounded recipes, unless noted                 | Production requirement                                         |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| 8-bit action        | Rooftop courier; dungeon key; arcade boss           | Pixel silhouettes, discrete poses, readable traversal          |
| 16-bit spectacle    | Rail escape; RPG summon; harbor pursuit             | Layered scenery, action clips, effects with exposure control   |
| 64-bit adventure    | Tower climb; island race; museum heist              | Original low-poly characters, terrain and purposeful 3D camera |
| Kids adventure      | Lost kite; bridge repair; moon seed                 | Readable goals, safe geography, acting and cause/effect        |
| Voxel construction  | Bridge build; machine chain; cave rescue            | Discrete placement, world state and traversal                  |
| Painted fable       | Rain station; wind delivery; forest machine         | Layouts, painted environments and character choices            |
| Rubber-hose cartoon | Angry piano; kitchen band; moon boxer               | Authored extremes, held drawings and escalating gags           |
| Anime fight         | Rooftop parry; train duel; rescue clash             | Anticipation, contact, impact poses and screen direction       |
| Stop-motion         | Clay letter; paper city; object orchestra           | Replacement poses, prop acting and capture continuity          |
| Early 3D horror     | Motel loop; elevator floor; pool reflection         | Constrained viewpoint, visibility and deliberate reveals       |
| Mascot horror       | Empty stage; repair bench; party room               | Venue geography, surveillance and threat state changes         |
| Found footage       | Forest signs; parking level; service tunnel         | Search route, discoveries and intermittent threat visibility   |
| Surreal performance | Room through prop; wardrobe world; pocket universe  | Performance coverage, plates, masks and compositing            |
| Narrative cinema    | Missed train; broken radio; night bicycle           | Actor continuity, motivated cuts and a payoff                  |
| Collage             | Newspaper city; passport journey; botanical machine | Cutout pivots, layering, material and montage rhythm           |
| Psychedelic optical | Optical score; impossible room; ink current         | Developing motifs and separate musical voices                  |
| Type and broadcast  | Type city; broadcast takeover; one word transform   | Legible typography, information hierarchy and phrase timing    |
| Abstract formation  | Formation study (one recipe)                        | Explicit study mode; existing procedural generator             |

These labels describe production languages, not hardware emulation. N64-like
adventure and early low-poly horror have separate camera and action plans.
Named references route to requirements; they do not supply characters, footage,
rights, rigs or finished animation. Research and access limits live with the
[source records](../../scripts/music-video/recipes/sources.ts), also displayed in
the generated inventory.

## Plan and inspect

Run from the repository root. Use fresh paths under `.local/`; commands refuse
to overwrite an existing report. The browser inventory filters recipes and
downloads a one-recipe brief. JSON plans can instead select explicit recipe IDs
or use seeded selection without replacement across families.

```powershell
bun apps/engine-editor/scripts/music-video/recipes/cli.ts html .local/media-recipes/inventory.html
bun apps/engine-editor/scripts/music-video/recipes/cli.ts catalog .local/media-recipes/catalog.json
bun apps/engine-editor/scripts/music-video/recipes/cli.ts plan apps/engine-editor/scripts/music-video/recipes/examples/ten-films.json .local/media-recipes/plan.json
bun apps/engine-editor/scripts/music-video/recipes/cli.ts audit <films.json> .local/media-recipes/batch-audit.json
bun apps/engine-editor/scripts/music-video/recipes/cli.ts check <plan.json> <evidence.json>
```

The planner uses the shared `compileArtDirection` contract. It rejects unknown
recipes, duplicate bindings and insufficient planned diversity. Palette and title
changes do not count. `single-family-study` is an explicit exception with named
recipes. The structural audit reopens canonical projects and recognizes the
previous formation generator; unknown projects require rendered review.

`native-building-blocks` means commands exist but the selected scene/action still
needs authoring. `integration-needed` names a workflow that must be implemented or
proven. `generator-available` currently applies only to the abstract study.
Asset bindings are declarations, not a file or license verification. A plan is
never a render or an approval.

## Validate changes

```powershell
bun test apps/engine-editor/scripts/music-video/recipes
bunx tsc --noEmit -p apps/engine-editor/scripts/music-video/tsconfig.json
```

Changes to creative editor capabilities also follow the editor's
[implementation contract](../../AGENTS.md). Expose each operation through the
command session, AI catalog, visible controls and persistence; retain Undo and
prove the resulting native preview/export. Do not turn the inventory into a
second authoring engine.
