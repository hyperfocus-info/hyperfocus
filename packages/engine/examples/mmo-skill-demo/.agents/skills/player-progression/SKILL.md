---
name: player-progression
description: Use when designing, auditing, extending, or documenting MMO Skill Demo player progression, durable 10s/10m/10h/100h loops, onboarding-to-mastery gates, fatigue versus boredom balance, faction/world progression, future quest bridges, living-world gameplay/lore payoff, or ./docs/world-player-progression.md updates.
---

# Player Progression

Run progression work as a principal systems designer: protect the player from cognitive overload and under-stimulation while making the world feel more alive through visual, gameplay, and lore causes.

## Self Update

When a run exposes stale heuristics, missing scan data, repeated progression mistakes, or a better subagent contract, patch this `SKILL.md` or `./.agents/skills/player-progression/scripts/progression-scan.ts` before final response unless the user requested a read-only or dry-run pass. Keep the update practical.

## Source Order

1. Read `./docs/world-player-progression.md` first when present.
2. Read nearby high-level world context: `./docs/world-building.md`, `./docs/world-travel.md`, and `./docs/future-quest-ideas.md`.
3. Inspect runtime sources before editing: `./src/data/world-quests.ts`, `./src/data/world-factions.ts`, `./src/data/world-creatures.ts`, `./src/data/world-landmarks.ts`, `./src/data/world-recipes.ts`, `./src/data/world-materials.ts`, `./src/data/world-reputation.ts`, and touched client/server surfaces.
4. Run evidence scans before design:

```powershell
bun.cmd .\.agents\skills\player-progression\scripts\progression-scan.ts --format markdown
bun.cmd .\.agents\skills\world-building\scripts\plan-world-pass.ts --top 4
```

Use `--format json` when another script or subagent needs structured input.

## Loop

1. Establish inputs. If the user omits them, infer conservatively from the repo and state the inference: target genre/core hook, target audience, and one centered mechanic.
2. Map current and proposed play across four bands: 10-second sensory/tactile, 10-minute tactical/rewarding, 10-hour strategic/habitual, and 100-hour hobby/mastery.
3. Pick one weakest lifecycle link: onboarding gap, thin 10-minute cadence, unearned 10-hour complexity, missing 100-hour mastery pull, sparse world space, over-dense world space, or quest bridge drift.
4. State WHY before edits:

```markdown
WHY: [local evidence] means [world logic]. This change adds/moves [content] so the player can read [visual/gameplay/lore effect] at [loop band] and it can later support [quest or mastery throughline].
```

5. Make bounded changes. Prefer one band plus one faction, route, zone, questline, mechanic, or docs section per pass.
6. Use world-building workflow when adding physical world density, ecology, landmarks, route reads, asset needs, or future quest locations.
7. Update docs in the same change. `./docs/world-player-progression.md` is the primary progression record. Update `./docs/future-quest-ideas.md` when the change creates quest potential. Update world/travel docs when physical world meaning or route behavior changes.
8. Keep markdown high-level: player goals, friction, reward meaning, gates, and links to related docs. Avoid code-heavy explanations.
9. Run relevant checks. For docs or skill-only changes, validate the skill and run its scan script. For game code, run `bun.cmd run build` and targeted `bun.cmd test src\tests`. For visual world changes, run `bun.cmd run screenshot:world`.

## Required Output

For full player-progression audits, planning passes, or large progression changes, produce these four sections. For narrow implementation, verification, or skill-meta QA tasks, answer in the shape requested by the task instead.

### 1. The Progression Matrix

Use a Markdown table with rows for 10s, 10m, 10h, and 100h. Columns:

- Key Systems Introduced
- Active Player Goal
- Source of Friction / Challenge
- Core Reward / Metric of Progress

### 2. Onboarding vs. Mastery Strategy

Define a gatekeeping system for each transition. Name what mastery is tested before more complexity unlocks. List what must be automated, simplified, or hidden early to prevent overload.

### 3. Red Flags & Frustrations

List three fun-killers for each band. Make them specific to this repo's MMO action, faction, crafting, travel, and world-density loops.

### 4. Interactive Refinement Prompts

Ask exactly three critical design questions when producing the full four-section design output. Target the weakest lifecycle link. Do not ask for facts that repo files can answer.

## Subagent Contracts

Spawn subagents only for bounded, non-overlapping work and only when the current tool context permits it. Give each subagent a concrete path-owned contract and raw scan output.

- Loop mapper: read docs and progression scan; return one 10s/10m/10h/100h gap list; no edits.
- World density scout: run world-building scan commands for one zone or chunk; return WHY candidates; no edits.
- Lore bridge scout: read `./docs/future-quest-ideas.md` and one faction or route; return quest bridge candidates; no edits.
- Docs worker: edit only `./docs/world-player-progression.md` or only `./docs/future-quest-ideas.md`.
- Implementation worker: edit one owned runtime slice, such as `./src/data/world-quests.ts` only, or `./src/data/world-landmarks.ts` plus required asset registration only.
- Verification worker: run requested build/test/screenshot commands and report failures with paths.

If ownership overlaps or paths are uncertain, use BranchFS isolation for experiments and do not promote isolated edits without explicit flush/promote flow.

## Balance Heuristics

Prevent overload by hiding or simplifying systems until the player has proved the lower loop: reputation math, multi-faction tradeoffs, advanced recipes, rare material chains, premium travel, dungeon prep, and meta optimization should not compete with first movement, combat, gathering, and quest clarity.

Prevent boredom by adding new readable decisions at mastery moments: a route choice, faction consequence, creature ecology shift, recipe fork, hazard response, party role, or world event. Do not rely on bigger numbers as the main novelty.

World additions should carry at least two roles:

- Visual read: silhouette, landmark, route marker, ecology sign, service fixture, danger cue.
- Gameplay read: local goal, unlock, combat pocket, gather source, craft input, travel gate, recovery point.
- Lore read: faction value, settlement pressure, ecology, debt, trade, corruption, preservation, extraction, mastery.

Thin-but-solid loops need threat, stage, route, or choice variation before large new systems. Dense-but-confusing loops need relocation, gatekeeping, or UI simplification before more content.
