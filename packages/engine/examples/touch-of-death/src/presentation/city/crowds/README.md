# Background occupants

`authorCityResidents({ declaration })` adds six render-only residents/workers in
three service galleries behind the existing north collision screen and train
envelope. Rooftop-height placement keeps occupants within the ordinary rooftop
camera view; passing trains briefly occlude them. It owns only
`tod:city:residents:*` entities/materials, is idempotent,
and adds 56 entities and four muted materials. Two workers have subtle fixed-period
arm motion. There are no NPC colliders, targets, routes, interaction rules or lore
messages; the fighter count does not change. Gallery placement deliberately stays
outside the playable collision boundary and away from underground entrances.

Run after expanded-city authoring. `author.test.ts` checks determinism, capacity,
protected placement and unchanged combat data. This is inhabited-city scenery,
not a crowd simulation or multi-opponent feature.
