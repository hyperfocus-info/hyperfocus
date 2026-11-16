# Structural district arrangements

`authorCityOverhaul` replaces the duplicated court shells and generic prop field
after base-city authoring. It preserves the street network, ten fighter starts,
six-metre roof anchors, stairs, lifts, traffic, hazards and weapon stations. Four
cloned roof slabs are replaced by fixed support platforms and large moving wings;
market, residential and depot also lose the orphan central breach panel. Utility
retains its breach and concealed equipment. Each
district authors three arrangements of the same primitive entity pool:

| District | Arrangements | Changing structures |
| --- | --- | --- |
| Construction | Scaffold yard; Cross-site office; North extension | Assembly gantry and bench, unfinished frame, scaffold approach, site office and formwork |
| Market | Morning aisles; Delivery court; Night market | Street stalls, large striped canopy, covered serving aisles, kiosk and delivery stack |
| Residential | Courtyard; Through apartments; Balcony court | Courtyard entrances, apartment wing, open room, laundry passage and terrace screen |
| Depot | West loading; Split platforms; East interchange | Boarding shelter, roof dispatch kiosk, loading cover and platform approaches |
| Utility | Compressor court; Bypass court; Split service yard | Near-court pipework, roof cooling equipment, pressure towers and service cover |

The separate apartment divider keeps its persistent destructible ID, but now
forms a 2.8-metre-high, 1.8-metre-deep left return at the first porch in all three
layouts. Its left attachment clears the boiler footprint and dry exit; the former
two-storey slab obscured the domestic windows. Its cracks and broken forms move
with it. This replaces the orphaned thin wall visible beside the new
entrances; ordinary heavy attacks still open it and checkpoint recovery retains
the opening. The join and all attached offsets have a layout regression.

`kit.ts` records every piece's three positions, including attached visual details
and predefined broken forms. Variants change physical passages and approaches;
they do not create another copy of the district or park unused colliders off-map.
Solid modules use static box collision. Thin attached art follows its support's
camera fade. Equal trims share a material only when they follow the same support
and source color, so independent walls retain independent fading. Existing
renderer instancing handles those batches. The combat camera's conservative
render culling includes the `tod:city:overhaul:`, `tod:city:finish:` and
`tod:city:neighborhood:` pools. Its bounding sphere and five-metre margin preserve
nearby offscreen shadow casters; culled art retains its physics, destruction and
saved state. The October 1 five-district A/B reduced 93–270 rendered instances and
4–17 main and shadow draws per view, with byte-identical paired gameplay images.
Shared-workstation RAF timings did not establish a stable FPS improvement.

`furniture.ts` dresses the fifteen retained neighborhood station anchors without
changing their colliders, positions, stock selection or interaction definitions.
Construction uses material-stack seams; market uses serving recesses, shelves and
delivery straps; residential reuses its top and handle as cabinet dressing; depot
adds primitive wheel faces to service carts; utility reuses small status details
on equipment cases. Eighteen nonphysical pieces are added only to construction,
market and depot. Residential and utility reuse existing pieces because their
district caps are nearly full. All added pieces share an owner/source camera-fade
material and retain the owner's destruction association when one exists. Existing
station furniture remains unbreakable; this pass does not add pickup behavior.

At full density, the overhaul pools contain 75 construction, 149 market, 159
residential, 130 depot and 160 utility pieces. These counts remain within the
existing district limits. Density may reduce optional breakable cover groups,
while station dressing and inventory anchors remain. The sixty pooled weapons,
thirty active pickups and fifteen inventory arrangements are unchanged.

`roof-core.ts` keeps the market and residential starts, stocked items, furniture
and approach links supported while moving more roof area than it fixes in place.
Transit and utility have distinct networks of platform islands and movable deck
wings. Tests compare traversable floor coverage between arrangements and walk the
routes with ordinary inputs. Moving decorations alone cannot satisfy this check.

The September 30 comparison at `.local/touch-of-death/arena-overhaul/index.html`
uses the same fighter poses and camera for three actual match-selected layouts
per district, at street and roof level. Its geometry hashes verify the selected
placements, separately from screenshots. The fixed road backbone and starting
platforms remain recognizable across matches; construction's close street view
changes less than its wider scaffold and compound routes.

The ordinary city combat camera leaves more space around close fighters to show
nearby routes and equipment. A brighter cool ambient fill keeps charcoal interiors
readable beneath the retained roof decks. Street modules occupy the normal starting
camera's view; far skyline differences alone do not satisfy visual acceptance.

The portable [`arenaLayouts` runtime](../../../../../../src/project/3d/combat-match/arena-layouts.ts)
selects one arrangement per district from the saved match index before combat.
The generation seed sets each district's authoring order; the match seed and
advancing match index select the resulting combination. Rounds retain geometry
and destruction. Saves, reconnects and replay use the ordinary world snapshot.
Selection excludes fighters, inventory entities, animated objects and entities
already controlled by starting-location placements. There is no mid-fight rebuild.

[Weapon authoring](../weapons/author.ts) continues to own the catalog, stock,
durability, depletion and fifteen weapon arrangements. Structural layouts retain
its existing supported station anchors and are validated against every authored
pickup arrangement. The inventory staging pass uses actual tabletop supports and
asymmetric adjacent floor clusters; mounted stock follows regenerated furniture.
Both seats can walk to and pick up a tabletop prop in every district through
ordinary inputs. Geometric opportunity bounds do not establish equal access time
or exposure; those still require playtest evidence.

Generation budgets cover the complete scene and reserved effects, static physics
and moving bodies. Density removes disposable cover groups; it preserves building
supports, routes and weapon stock. No distant-detail streaming, crowd simulation
or unconstrained fragment physics is introduced. Structural variety, visual
readability, fight flow and measured frame time have separate acceptance evidence.

`experiment.ts` adds a bounded pool of flush numbered plates, concealed camera
lenses and service seams. The same camera dimensions recur in otherwise different
districts; a narrow machinery recess appears only in the utility observation
gallery. These pieces have no physics and follow their host's position and camera
fade in every arrangement. Zone digits use quiet chalk, lenses use simulation
blue, and hardware uses charcoal. The wall plates use 1.6-times larger digits
than the first art-direction candidate so numbers remain legible at combat
distance. They never become large floating signs.

`encounters.ts` names each district's combat test and its two approach systems.
`auditDistrictEncounters` checks actual stock, destructible surfaces and moving
machinery rather than treating decorative clutter as tactical content. Its stock
distance includes twice the vertical separation and the worst inventory
arrangement. Every launch start has stock within 20 metres of that conservative
distance, a destructible element within 22 metres across physical arrangements,
and a moving hazard within 18 metres. Roof starts can require descending to street
stock; the audit reports this explicitly. The existing traversal tests establish
player movement along the named routes. These bounds do not establish equal
pickup access time or that fights naturally use every opportunity.

A single residential boiler closes the district's missing equipment hazard. It
uses the existing impact activation, fire exposure, twelve-particle local effect,
predefined debris and saved damage systems. It occupies a validated courtyard edge
with clear approaches and an escape, rather than repeating a trap crate at every
spawn. Hazard frequency now selects two to five equipment sites across the city;
there is no spreading fire or fragment physics.

Run `bun test packages/engine/examples/touch-of-death/src/presentation/city/overhaul` and
`bun test packages/engine/src/project/3d/combat-match/arena-layouts.test.ts`.
[Market/residential tests](../../../../../../../../apps/engine-editor/src/scene3d/game-integration/city/overhaul/market-residential.test.ts) check all arrangements'
spawn, pickup, stair and full moving-body clearance, ordinary movement through
aisles and rooms, and a paid jump from stairs onto an apartment balcony.
[Depot/utility tests](../../../../../../../../apps/engine-editor/src/scene3d/game-integration/city/overhaul/depot-utility.test.ts) cover their physical routes and
clearances. Runtime tests cover selection, ownership validation and persistence.

The full city suite currently retains three failing AI pursuit fixtures (doorway,
roof ascent and equal-speed cutoff). Player traversal coverage passes; that does
not establish that an AI opponent reliably follows every new route. Natural
multi-cluster fight flow still needs human playtesting.
