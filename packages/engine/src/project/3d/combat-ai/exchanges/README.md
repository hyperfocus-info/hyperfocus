# Combat exchange evidence

`recorder.ts` collects actor-tagged observations for the outcomes report. It never
changes gameplay or grants a learned reward. Both current and completed segments
contain `exchanges.actors`, `samples`, `open` and `coverage`.

Actor rows count damage dealt/taken, committed damaging attack starts, and chains
started/completed/broken/escaped/censored. Attack starts cover AI seats observed
through `choice`; damage and chains include their opponents. Physical event IDs
are deduplicated across Theater perspectives. Blocks can contribute actual chip
damage but cannot start a hit chain. Zero-damage corpse contacts earn no credit.

A positive hit or guard break starts a chain for its attacker and target. Ordered
contact records retain event IDs, move IDs, simulation frames and actual damage.
The next committed snapshot establishes whether the target was in hitstun;
`committedStun` distinguishes that evidence from a damaging contact that never
controlled the target. Initial health comes from the pre-step snapshot. Actual
damage exhausting that health confirms a knockout immediately, including when
the host stops requesting decisions at round end.

Endings distinguish knockout, observed recovery, tech, escape, counterhit,
simultaneous trade, other interruption and censored evidence. A recovery counts
as a broken chain; it does **not** prove an available follow-up or avoidable drop.
Knockout means a lethal observed chain, not necessarily a full-health TOD:
`initialTargetHealth`, `damage`, `hits` and `committedStun` preserve that distinction.
Tech/escape/interruption samples also retain the ending event. Unknown fatal
damage is censored instead of awarded as a knockout. Boundaries censor open chains
with their reset/restore/capacity cause. `report()` returns detached values and
never closes or modifies pending evidence.

Storage is bounded to 16 actors, 32 open chains, 32 completed samples, 32 contacts
per chain, and 256 deduplicated event IDs for the newest event frame. Coverage
reports rejected actor observations, discarded samples/contacts/events, duplicate
events, stale events and contacts without a health baseline. Samples whose
`droppedContacts` is nonzero retain aggregate damage/hits but are incomplete
sequence evidence. Older event frames are ignored; after the newest frame exceeds
256 event IDs, further events in that frame are rejected to avoid counting
evicted duplicates. Hosts must feed ordered frames and use the outcomes boundary
before resetting or restoring a simulation.

`recorder.test.ts` verifies real simulated lethal contacts, corpse exclusion,
committed recovery, distinct escape/interruption outcomes, shared Theater feeds,
pure reads, reset censoring and explicit truncation. Run from `packages/engine`:
`bun test src/project/3d/combat-ai/exchanges/recorder.test.ts src/project/3d/combat-ai/outcomes.test.ts`.
