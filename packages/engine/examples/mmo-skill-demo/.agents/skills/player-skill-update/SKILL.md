---
name: player-skill-update
description: Use when updating player-facing MMO skills, weapons, ability loadouts, status effects, targeting behavior, or when creating or modifying local repo skills, especially to decide whether behavior belongs in the MMO demo or reusable engine APIs.
---

# Player Skill Update

Use this workflow for player ability changes in this demo, reusable MMO helpers in `./engine/src/mmo`, and local skill maintenance under `./.agents/skills`.

## Self Update

When this skill exposes a missing heuristic, stale boundary rule, repeated mistake, or better workflow, patch this `SKILL.md` before the final response. Keep updates concise and practical. Do not add extra README, changelog, or process docs unless the user asks.

## Player Skill Workflow

1. Explore the current game state, entity model, runtime loop, tests, and UI surfaces before editing.
2. Keep weapon identity, balance numbers, ability names, descriptions, VFX labels, UI copy, unlock rules, and content-specific effects in the demo.
3. Move only content-free primitives into `./engine/src/mmo` when they are reusable, already duplicated, or needed to avoid brittle one-off state flags.
4. Prefer small engine APIs around targeting, status tokens or bags, cooldown and active ability lifecycle, shape math, and lightweight runtime state.
5. Refactor the demo to consume any new engine primitive in the same change. Do not leave duplicate local and engine implementations drifting.
6. Cover engine primitives with engine tests and content behavior with demo tests.
7. Stop when the requested behavior and required verification pass.

Held combat inputs should auto-repeat once the active ability has ended and the slot cooldown is ready. Do not add release-locks unless the design explicitly requires tap-only behavior; same-slot input during an active ability should preserve the current cast/channel instead of restarting it.

## MMO vs Engine Boundary

Put behavior in `./engine/src/mmo` when it is content-free, reusable across examples or games, has no Staff, Wand, zone, NPC archetype, quest, or UI naming, and can be tested with plain shapes or small runtime objects.

Keep behavior in `./engine/examples/mmo-skill-demo` when it includes balance values, weapon flavor, art or effect names, quest and progression rules, map or zone assumptions, bespoke boss logic, or player-facing copy.

Delay extraction when the proposed API needs concrete `PlayerEntity`, `NpcEntity`, or current demo flag strings to make sense. First reduce it to generic inputs like `id`, `x`, `y`, `radius`, `team`, timestamps, or a compact runtime object.

Good extraction candidates:
- Targeting shapes and hit ordering.
- Status token or stack helpers.
- Ability cooldown, active cast, channel, tick, and once-per-event helpers.
- Projectile reflection or movement blocking only after more than one content path needs it.

Risky extraction candidates:
- Full ability definitions.
- Weapon loadouts.
- Damage formulas tied to balance or tuning.
- UI panels, labels, icons, and tutorial copy.
- Scenario-specific AI reactions.

## Local Skill Building

Create local skills under `./.agents/skills/<skill-name>/`.

Every skill needs a `SKILL.md` with YAML frontmatter containing `name` and `description`. The description should state the trigger clearly because it controls when the skill is selected.

Keep the skill short. Add references or scripts only when they remove real repetition. Avoid extra docs by default.

When modifying a skill, use the same edit discipline as code: inspect first, patch narrowly, and validate the frontmatter, path, and trigger wording after the edit.

## Verification

For engine MMO changes, run from `./engine`:
- `bun.cmd test ./src/mmo`
- `bun.cmd run typecheck`
- `bun.cmd run typecheck:tests`
- `bun.cmd run build:mmo`

For the MMO skill demo, run from `./engine/examples/mmo-skill-demo`:
- `bun.cmd test src\tests`
- `bun.cmd run build`

If PowerShell blocks `bun.ps1`, use `bun.cmd`.
