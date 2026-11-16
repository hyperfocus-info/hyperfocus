# District inventory authoring

The [directed weapon kits](direction/README.md) own combat intent, family tradeoffs
and their animation contract. This document owns placement and inventory.

The catalog owns thirty weapon types, sixty pooled objects, five district pools
and fifteen arrangements. Each arrangement selects six existing objects; a match
activates thirty in total. No staging change replenishes objects or alters combat
stats, durability, ammunition, throws, rounds or saved match selection.

`staging.ts` replaces ruler-straight floor rows with supported clusters around the
actual fifteen stations. Up to two short props sit on the tabletop;
long tools and a spare item use an asymmetric fan beside the same station.
Candidates check all authored structural variants, fixed support and complete
moving-body envelopes. A validated original stock pocket is the fallback when a
counter approach would be obstructed. Authored positions denote the exact support
plane: street 0 m, roof 6 m, or the visible table top. Fifteen thin physical caps
match those visible tops, so ordinary dropped props settle there too. Resting visual orientation
belongs to the portable weapon presentation contract, not a furniture transform.

The sword and dagger use a rear support lane on the utility equipment rack;
nunchaku belong on the roof exercise station. These flat signatures fit completely
on the existing cap, clear the forward short-prop slots, and keep their original
catalog objects and arrangement membership. Long pipes still use nearby floor
positions. Seeded support and separation checks cover those semantic placements.

The refresh does not change any selected entity IDs, the six slots per arrangement
or the catalog dimensions. A city rebuild moves mounted items with their original
station-local coordinates, avoiding floating stock when the station's seed changes.
Custom nonstation placements retain their absolute coordinates. Compact rebuilds
avoid accumulating coordinate drift.

`staging.test.ts` checks three seeds, every structural/stock arrangement, mounted
support through rebuilds, falling loose props landing on the physical cap, and
actual walking plus directional pickup for both
fighter seats in all five districts. The traffic inventory tests retain thirty
active objects and a nearby opportunity bound for all ten starts. These are
support and access regressions; human playtests still determine access-time
fairness, exposure and whether fights exhaust several clusters naturally.
