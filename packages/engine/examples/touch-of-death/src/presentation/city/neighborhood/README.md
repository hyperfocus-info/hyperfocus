# Connected neighborhood modules

`authorCityNeighborhood({ declaration, combat, seed, density })` adds a closed
worksite–market–depot rooftop circuit and two open-ended covered street annexes.
It refreshes only `tod:city:neighborhood:` entities and their material copies.
Final city assembly replaces the annexes with the larger
[structural district modules](../overhaul/README.md); the circuit and stations
remain. Annex traversal tests below exercise the helper in isolation.
The existing north catwalk, ground routes, stairs, lifts, traffic and damage rules
remain. Deck tops stay at six metres and bridges clear all moving-body envelopes.
The market turn centers at x=40.8, leaving headroom over both sides of the
retained stair flight; the worksite link extends to meet it. The delivery hall
also stays clear of this corrected ordinary walking route.

The depot connector uses either the north approach at z=34 or a longer rear
approach at z=44. The market spine at x42 and rear landing support both. Its west
placement leaves the market starting camera clear of the former foreground bridge.
Each of the
ten starting locations alternates the complete connector and its trim through
ordinary `spawns.props` transforms. Selection happens before combat, and existing
match snapshots retain the selected transforms across rounds, saves and replay.
The authoring seed chooses the initial variant and the placement order for nearby
station furniture; it does not consume the weapon-selection random stream.

Fifteen semantic station IDs in `stations.ts` match the weapon thread's three
existing pickup clusters per district. Each result gives supported pickup slots,
district, tactical role and the supporting floor entity. The inventory staging
pass places short items on actual counter surfaces and larger props alongside.
It uses exact support-plane heights rather than the older 15 cm floating row.
Roof furniture first tries a shared rear-center pocket. Its complete base may
span joined slabs, but the support validator rejects even small uncovered gaps.
This fixes the worksite table being forced behind only one fighter because no
single roof half covered its whole footprint. Mounted stock follows the table
through full city rebuilds; ordinary customized floor placements stay fixed.
The inventory owner controls stocking, arrangements, weapon mechanics and access
balance. The visibly dressed exercise corner and equipment racks give unusual
finds a place; repeated observation slits imply the elites operating the test.

Density changes station decoration, never slot count or route colliders. The
module stays below 180 entities and 45 colliders, including fifteen thin physical
station caps so dropped items settle on the visible top. It uses existing primitive meshes,
materials and support-following camera fades. It adds no AI, physics fragments,
per-frame generator or new persistence protocol.

Run `bun test packages/engine/examples/touch-of-death/src/presentation/city/neighborhood`.
Tests cover all ten spawn envelopes, full moving-body travel envelopes, supported
and unobstructed station slots, deterministic refresh, seed variation, ordinary
worksite-to-market traversal, walking through the covered market past utility
equipment, actual per-start connector physics, and JSON restoration.
Rendered composition and natural fight flow need the owning city
pass's visual/playtest evidence.
