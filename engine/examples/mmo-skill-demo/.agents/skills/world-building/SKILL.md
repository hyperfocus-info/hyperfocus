---
name: world-building
description: Use when fleshing out the MMO skill demo world through visual density, living ecology, faction lore, gameplay points of interest, travel hooks, NPC or landmark placement, world docs, density heat maps, or future quest throughlines.
---

# World Building

Run a world-building loop that makes the map feel alive, readable, and motivated. Every content change needs a clear WHY grounded in nearby ecology, faction pressure, travel logic, service needs, or quest potential.

## Self Update

When the workflow exposes a stale heuristic, missing density signal, repeated placement mistake, or better world-building contract, patch this `SKILL.md` or bundled scripts before the final response. Keep updates concise and practical.

## Source Order

1. Read the player-facing world docs first: `./docs/world-building.md`, `./docs/world-travel.md`, and `./docs/future-quest-ideas.md` when present.
2. Inspect runtime world sources before editing: `./src/data/world.ts`, `./src/data/world-landmarks.ts`, `./src/data/world-creatures.ts`, `./src/data/world-factions.ts`, `./src/data/world-quests.ts`, and related render/data files touched by the task.
3. Run deterministic scripts before asking agents to reason from scratch:

```powershell
bun.cmd .\.agents\skills\world-building\scripts\heat-map.ts --format actions --sort priority
bun.cmd .\.agents\skills\world-building\scripts\plan-world-pass.ts --top 4
```

Use `--format markdown` for a full table and `--format json` when another script or subagent needs structured density data. Useful filters:

```powershell
bun.cmd .\.agents\skills\world-building\scripts\heat-map.ts --band sparse --zone void-rift --top 3 --format actions
bun.cmd .\.agents\skills\world-building\scripts\heat-map.ts --chunk 0 --format markdown
```

## Script Surface

Prefer scripts for repeatable discovery, generation, and handoff prep. Use AI judgment for WHY, selection, and final integration.

- `world-analysis.ts`: shared deterministic analyzer for chunks, density bands, zone catalogs, assets, quest hooks, and relocation targets. Import this instead of duplicating scoring logic.
- `heat-map.ts`: density triage. Use first to find sparse/dense chunks and WHY candidates.
- `plan-world-pass.ts`: creates bounded handoff packets with objective, evidence, owned paths, deterministic commands, candidate content, and acceptance checks.
- `asset-needs.ts`: lists local image keys and Craftpix search terms for a target chunk or zone. Use before downloading assets.
- `landmark-snippets.ts`: emits candidate `worldLandmarkPlacements` TypeScript entries. Review WHY and screenshots before committing generated snippets.
- `quest-seed.ts`: previews or appends deterministic future quest seeds. Use `--dry-run` first, then `--write` only when the seed belongs.

Useful handoff flow:

```powershell
bun.cmd .\.agents\skills\world-building\scripts\plan-world-pass.ts --band sparse --zone void-rift --top 2
bun.cmd .\.agents\skills\world-building\scripts\asset-needs.ts --chunk 5
bun.cmd .\.agents\skills\world-building\scripts\landmark-snippets.ts --chunk 5 --format ts
bun.cmd .\.agents\skills\world-building\scripts\quest-seed.ts --chunk 5 --dry-run
```

## Loop

1. Pick one bounded world-building goal: one zone, route, sparse chunk, over-dense chunk, faction edge, or quest throughline.
2. Gather evidence: nearby anchors, landmarks, NPCs, paths, resource tiles, faction docs, creature ecology, travel network, screenshot coverage, and current quest state.
3. State WHY before editing. The WHY must answer what belongs here, why now, what local tension it serves, and how it improves visual, gameplay, or lore readability.
4. Treat each map addition like a pin linked to a lore record. A new landmark, route marker, NPC cluster, or hazard should have at least one matching doc or quest seed unless it is purely refactoring existing content.
5. For sparse chunks, add content that fits adjacent ecology and faction logic. Prefer existing structures, landmarks, props, creatures, routes, camps, hazards, service fixtures, or environmental story reads before inventing new systems.
6. For over-dense chunks, spread content outward with an in-world reason: overflow camp, outskirts home, patrol route, market stall, shrine pocket, tunnel, portal, cave, aery, ferry, vent, or instanced space. Do not delete density unless it is redundant or visually noisy.
7. If existing assets cannot express the idea, use `craftpix-download` for suitable game art, place assets under local game folders, and wire them through existing asset/render paths.
8. Keep one reachable next goal visible in active play. New content should clarify routes, threats, services, or quest motives instead of becoming decoration only.
9. Update docs in the same change. Keep markdown high-level and link outward instead of dumping implementation detail.
10. Update `./docs/future-quest-ideas.md` whenever adding content with quest potential. Record the throughline, location, factions, player action, payoff, and why it belongs.
11. Run relevant checks. For visual world changes, run `bun.cmd run build`, targeted tests when touched, and `bun.cmd run screenshot:world` when camera-readability changed.

## Density Heuristics

Sparse does not mean empty is always wrong. Leave intentional breathing room for travel danger, wilderness silence, or future gates, but mark it as intentional in docs or code comments if it affects future passes.

Over-dense does not mean lively is wrong. A town center can be crowded when services, market pressure, or ritual activity justify it. Fix density when it hides reads, stacks similar functions, or makes adjacent chunks feel dead.

When the complaint is "I can travel several screens without a camp/attractor," fix both layers: add a visually distinct landmark catalog entry and a nearby runtime creature congregation. Props alone can make the map look denser while still leaving play empty.

When the complaint is about gatherable source density, verify both distribution and map readability: count common nodes against the three-screen travel target, then make sure resource pins are visible and filterable so density helps exploration without permanently cluttering navigation.

Good additions usually combine at least two roles:

- Visual read: silhouette, landmark, resource shape, route marker, danger cue, service fixture.
- Gameplay read: travel hub, quest handoff, combat pocket, crafting material, faction gate, recovery point, vendor, contract board.
- Lore read: ecology, faction value, social pressure, conflict, ritual, trade, debt, extraction, preservation, corruption, mastery.

Prefer layered world records over isolated decoration. Strong world tools connect places, maps, timelines, factions, pins, and discovery state; mimic that locally by tying each authored chunk change to nearby docs, future quest ideas, faction data, and screenshot areas.

Procedural helpers should keep designer control. The heat map is a triage surface, not an autopatcher: it should expose density evidence, candidate moves, and quest hooks, then require a WHY before code changes.

## Subagent Use

Use subagents only for bounded, non-overlapping work. Keep contracts concrete and path-owned:

- Density scout: run `heat-map.ts` or consume `plan-world-pass.ts` for one chunk or zone; return sparse/dense evidence and candidate WHY statements.
- Lore scout: consume a handoff packet, read docs and data for one faction or route, then return compatible additions and quest throughlines.
- Asset scout: run `asset-needs.ts`, find existing usable assets first, then use Craftpix only for the named visual need and report license/source/path.
- Implementation worker: start from `landmark-snippets.ts` or `quest-seed.ts`, edit one owned file set only, such as `./src/data/world-landmarks.ts` plus related asset registration, or only `./docs/future-quest-ideas.md`.
- Verification worker: run screenshots/tests for changed surfaces and report failures with file or screenshot paths.

Handoff packet rule: when delegating, include the output from `plan-world-pass.ts` instead of prose-only instructions. The packet should define objective, evidence, WHY, owned paths, commands, and acceptance checks so the subagent spends tokens on integration, not rediscovery.

If ownership overlaps or paths are uncertain, use BranchFS isolation for experiments and do not promote isolated edits without explicit flush/promote flow.

## WHY Format

Use this shape in commit notes, docs, or final summaries:

```markdown
WHY: [local evidence] means [world logic]. This change adds/moves [content] so the player can read [visual/gameplay/lore effect] and it can later support [quest throughline].
```

Examples:

- A sparse forest edge near predator signs can gain a watering hole because prey movement would naturally attract hunters, wolves, and patrol quests.
- Too many villagers in a town square can move to outskirts homes, a work camp, a nearby cave, or an instanced route because real settlements spread labor, storage, and danger response around the center.
- A dense market can push debt collectors to a nearby checkpoint because commerce creates enforcement pressure outside the stall cluster.
