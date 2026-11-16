---
name: player-skill-update
description: Change MMO Skill Demo player abilities, weapons, loadouts, targeting or status behavior, including a justified content-free engine primitive. Not for authoring agent skills or unrelated progression/world work.
---

# Player ability changes

Trace the affected ability through authored data, runtime, player feedback and
nearby tests. Keep balance, weapon identity, unlock rules, VFX and UI copy in the
demo. Use the engine's existing targeting, status and lifecycle primitives before
adding state flags. Extract only content-free behavior with real repeated use;
a helper requiring demo entity types or named weapons is not yet an engine API.
Any extraction needs engine tests and migration of its demo consumer together.

Held combat input repeats after the active ability ends and cooldown is ready.
Same-slot input during a cast/channel preserves that action. Add release-locks
only for an explicitly tap-only design. Preserve the controller journey from
[example guidance](../../../.agents.md).

Choose targeted ability/demo tests and build from the example root. For changed
engine MMO contracts, run affected `src/mmo` tests plus package `typecheck`,
`typecheck:tests` and `build:mmo` from `packages/engine`. Finish at the requested
behavior and covered regressions; a content edit does not require redesigning the
engine or maintaining agent skills.
