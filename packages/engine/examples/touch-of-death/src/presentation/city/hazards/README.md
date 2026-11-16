# Street equipment hazards

`authorCityHazards({ declaration, combat, frequency })` can be applied to an existing city
without resetting props, fighters, spawns, underground routes or other surfaces.
The full city macro calls it before props and neighborhood furniture. Reapplication replaces only its own
entities, materials, surfaces and hazard definitions. Direct reapplication preserves
the residential boiler owned by the structural district pass and reserves particle
capacity for all retained hazards.

Two damaged street-side supply housings provide optional interactions:

- North utility frontage: furnace supply at `(13.2, .8, -47)`, fire footprint
  centered `(11, .5, -47)`. Breaking it exposes flames with 2 damage every 30 live
  combat frames; leaving immediately stops exposure.
- South service frontage: pipe supply at `(-25.8, .8, 39)`, shallow flooded grate
  centered `(-28, .16, 39)`. Breaking it exposes water with .65 grounded voluntary
  movement speed; jumping leaves the drag behind.

Frequency above one adds a worksite fire at `(14, .5, 15)`; above 1.5 adds a
market flood at `(41.5, .16, 24)`. Frequency below .75 keeps only the utility fire.
Maximum frequency adds four solid housings, fewer than eighty authored pieces
and 48 bounded particles. Compact generation scales the site geometry with the
district while preserving fighter size.

The structural district pass additionally owns one residential boiler on the
courtyard edge: supply `(-51.3, .8, -14.5)`, fire footprint
`(-53.5, .5, -14.5)`. It uses the same activation and exposure rules. This closes
the residential equipment gap without putting identical trap crates at every
start. Complete city generation therefore contains three equipment hazards by
default and five at maximum frequency, reserving 60 local particles at maximum.
Its [encounter tests](../../../../../../../../apps/engine-editor/src/scene3d/game-integration/city/overhaul/encounters.test.ts) validate every structural
arrangement, stock placement, moving-body envelope and ordinary heavy activation,
escape and save restoration in standard and compact districts.

Painted edging, grates, cracked equipment, outlet, broken casing pieces and local
flame/ripple particles communicate the cause without text warnings. Supply caps
and pipes hide with their broken housing. Both zones leave routes around them,
avoid all ten authored starts, and add only two solid bodies and fewer than forty
entities. Their particles fit a minimum 536 scene effect allocation; runtime also
caps generic edited hazard effects to remaining scene capacity.

`author.test.ts` verifies bounded/idempotent geometry and actual ordinary heavy
attacks opening both supplies, visible activation, exposure damage, walking out
to dry ground and portable save.
Engine hazard regressions cover both seats, movement, KO/recovery and network
rollback. The helper does not provide fire propagation, volumetric fluid,
or lingering burns. High-level AI now compares visible active hazards against
solid-aware ground detours; dangerous crossings remain legal when needed.
Nearby fire and water-entry audio have dedicated optional Combat audio bindings,
cooked by `cookTouchOfDeathAudio`, with distance, phase and repetition bounds.
See the engine hazard README for exact route/audio behavior and remaining limits.

A browser regression exposed the original south pipe inside depot stairs. The
pipe now sits west of those stairs. `author.test.ts` checks both hazard volumes,
full fighter approach clearance and a northward dry exit against every authored
city collider, including seeded props; preserve this coverage when relocating
equipment. Failure evidence remains in the local functional-gaps browser report.

The maximum-frequency regression found the original worksite site overlapping a
seeded statue. Its fire moved from `(12,12)` to `(14,15)`. The market site moved
half a metre west to preserve a radius-one north exit beside the arcade wall,
including the compact district. Tests now cover all five footprints, full moving
traffic envelopes, all ten starts and a clear walking exit in both district sizes.
Ordinary heavy inputs activate both additional sites, then ordinary directional
inputs leave their effects; JSON restoration retains the resulting damage state.
