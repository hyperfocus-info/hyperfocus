# Seeded city arena

`applyTouchOfDeathCity({ declaration, combat, settings, previousSettings })` builds
the five-district arena atomically. The Combat inspector's **City generation**
controls and `scene3d.setup-city` accept the same settings: uint32 seed, scenery
density (.25–1), standard/compact footprint, hazard frequency (.25–2), and entity,
physics-body and moving-body budgets. Defaults are seed 0, density 1, standard,
frequency 1 and budgets 6000/768/64. Invalid settings or an exceeded budget leave
the project unchanged. Entities include reserved effects in the budget count.
Compact compresses horizontal architecture by 10%; fighter and weapon dimensions
stay unchanged. Density removes breakable scenery, never routes or weapon stock.

Every generation also runs `generation/presentation.ts` before its atomic commit.
Missing materials, unsupported/excess lights, unprotected foreground geometry,
missing/cyclic fade parents and dressing detached in arena variants are rejected.
Fade history runs in simulation time, nested dressing follows its final parent
opacity, stock counters retain support, and shadow coverage follows cutaway opacity.
The [arena capture gate](../../../../../../../apps/engine-editor/verification/arena-capture/README.md)
checks actual rendered framing, lighting, source cadence and synchronized sound.
Its recordings default to 60 fps; this is independent of live frame-time budgets.

The [structural district modules](overhaul/README.md) give each of five districts
three physical arrangements. New matches select positions for whole buildings,
covered passages, platforms and cover before combat. The same bounded entity pool
serves all arrangements; changing a seed changes routes and silhouettes around
the retained street, rooftop and inventory anchors. The
[neighborhood modules](neighborhood/README.md) retain the construction–market–depot
roof circuit and fifteen shared inventory stations. This is authored modular
assembly within a fixed district footprint. It does not stream nearby detail or
generate arbitrary street networks. Generation budgets reject over-budget scenes;
they do not dynamically unload physics. Renderer instancing and culling remain
responsible for drawing cost; frame-time performance still requires measurement.

Remaining arena acceptance work: qualify active fights on a defined minimum
machine (scenery-only captures do not measure AI, contacts or combat effects),
playtest access-time fairness and movement between stock clusters, and review
thin-tool recognition and ghosted foreground furniture at normal camera distance.
The 1 October local evidence is under `.local/touch-of-death/arena-quality/`;
its sampled visual and interaction passes do not certify every seed or the whole
game's release gates. The city kit regression still imports two private engine
presenters; move those presenter-specific assertions into engine-owned tests
when resolving that test ownership debt, without adding public API solely for tests.

The staged city belongs to elites above government. Repeated modules, observation
slits, concealed equipment and service routes carry that premise without changing
combat rules. Their controlled city tests adaptability for a clone-army program.
The [semantic palette and lighting](style/README.md) put fighters and immediate
danger above usable objects and routes, then architecture and the distant city.
Charcoal structure remains quiet; bright orange identifies usable stations and
hazard controls, red signals danger, and blue identifies observation technology.
Ordinary public paint is muted ochre. Market canvas, residential masonry, transit
steel and utility equipment have distinct subdued colors instead of orange trim
on every box. Geometry remains primitive and untextured by default.

The [civilian finishing pass](finishings/README.md) articulates five ground aprons
around the dark road network and adds clustered signs of use: shop shutters,
serving drawers, notices, laundry, selected warm windows, delivery labels and
worksite plans. Repeated repair panels and identical human-study monitors in the
observation gallery reveal the institution beneath that ordinary use. The pool
is capped at 256 render-only pieces, follows authored hosts and introduces no
extra physics, fake pickups or new timed simulation.

City rebuilds preserve the inventory owner's catalog, arrangement selections and
object state definitions. [Weapon authoring](weapons/author.ts) owns district
stock; neighborhood stations provide shared, validated placement anchors.
Short props now occupy actual tabletop surfaces, with long tools and spare props
in small asymmetric floor clusters beside the furniture. All positions use the
actual support plane. Mounted stock follows its station when a seed rebuild moves
that station; customized floor placements remain absolute. A natural fight
exhausting several clusters still needs playtesting.
Station dressing distinguishes material stacks, serving counters, household
cabinets, service carts and utility cases across fifteen furniture stations.
Roof stations prefer a contested rear-center location; footprint support accepts
joined slabs while rejecting real gaps. Eighteen nonphysical details share their owners'
camera fade; residential and utility reuse existing pieces to retain their caps.

**Set up district weapons** (`scene3d.setup-city-weapons`) refreshes the existing
city inventory and its portable models in one undoable transaction. The catalog
has 30 objects across eleven families, with 60 pooled entities. Five districts each
offer three arrangements of six pickups: 30 objects are active per match. Worksite
tools, residential household props, market food/serving items, depot equipment and
utility supplies use different pools. Consecutive matches change each district's
arrangement independently of fighter starts. Rounds retain wear, charges, spent
items and deployed zones; practice is fixed. Nothing replenishes during a fight.

Dedicated weapons inherit directional combat roles. Heavy tools and shields have
two attacks; fragile props and distractions use the same single action on either
button. Spray tools bash on Light and spend finite charges on Heavy, with a visible,
wall-blocked cone and temporary grounded drag on an undefended hit. Oil, detergent
and marbles deploy visible temporary zones affecting both grounded fighters.
Jumping clears their movement restriction. Models, weapon names, kits, ammo/effects,
district arrangements and placement coordinates remain individually editable in
the Combat inspector through `scene3d.set-combat`. Guns remain deferred.

Focused inventory verification lives in `weapons/*.test.ts`, `tools.test.ts`,
`traffic.test.ts`, the combat interaction suite and the inspector tests. Export
handoff and desktop/narrow evidence live in `.local/touch-of-death/district-weapons/`.

`authorCityOverhaul({ declaration, combat, seed })` replaces cloned court walls,
their decorative cladding, the earlier street annexes and scattered generic props.
Construction has an unfinished concrete frame and a walk-through site office;
the market has striped halls and serving aisles; residential has apartment wings,
balconies and rooms; transit has long concourses and loading shelters; utility
has compressor towers, pipe gates and an observation gallery. The preserved base
owns stairs, lifts, the worksite roof, the utility breach, hazards and traffic. The
four repeated court roof slabs and three orphan breach panels are removed. Small
fixed platforms support the validated starts, weapon stations and route landings;
large roof wings move between arrangements. Market and residential decks change
between rear, southeast and southwest extensions; transit and utility use split
platforms. The market bridge runs west of its starting fight so it does not conceal
the stalls. The modules
remain individually editable primitives with physical routes and cover.

A narrow, supported 36-metre maintenance catwalk connects the worksite and north
roofs above the freight route. The broad ground route, ordinary stair approaches
and existing moving lifts remain alternatives. A residential interior divider can
be broken to change the room's path, retaining its debris for the match. Breaking
the existing north utility infill reveals concealed observation equipment through
the normal environment reveal state. No popup explains the clue. Thin decorative
pieces follow their supporting geometry's camera fade.

The divider's real-input regression also covers a shared terrain-contact defect:
when a stationary attack capsule overlaps both a thin wall and a prop behind it,
equal-time contact selection must prefer the intersected line-of-sight wall. A
later-listed prop must neither absorb that hit nor make it disappear. The engine
environment session owns this rule; ordinary obstruction checks still prevent
striking through an intact intervening wall.

The [overhaul tests](overhaul/README.md) bound district geometry and check every
structural arrangement against fighter starts, stocked pickup positions and full
moving-body envelopes. Ordinary-input tests exercise interiors, platforms and
balcony access. These checks do not establish visual variety or natural fight
flow; those require matched-camera captures and playtesting. The
[underground service passage](underground/README.md) opens two
real street entrances, provides shared human/AI traversal and preserves its damage
through saves and rounds. It is one utility route rather than a complete laboratory
district. [Contained hazards](hazards/README.md) now activate from damaged equipment;
[the transfer carriage](machinery/README.md) can jam in place. Cars/bus retain solid
wrecks; fast following traffic can crash into them, while slow traffic queues.
Crash state persists and produces the existing environment-break audio once.
Six render-only background occupants are
separate from the fighters; protected galleries now appear in rooftop views behind
the railway. Their primitive silhouettes still need art iteration. Population
simulation, spreading fire/water and vehicle redirection remain separate work.

The [district encounter audit](overhaul/encounters.ts) uses actual inventory
arrangements, destructible surfaces and moving equipment. It reports conservative
stock distance, including height and the worst arrangement, plus two authored
approach systems per district. All five roof starts can require descending to
street stock in some arrangements. This preserves the inventory owner's thirty
active pickups rather than placing a free tool behind every rooftop fighter.
Distance bounds and ordinary traversal tests do not establish equal access time,
exposure or natural multi-cluster fight flow.

Small chalk test numbers, concealed blue lenses and maintenance seams follow
their host structures through all three arrangements and camera fading. A narrow
machinery recess appears only in the utility observation gallery. The added
experiment dressing has no collision. One residential boiler on a courtyard edge
adds a local fire source through the existing impact activation, predefined
debris, exposure and save systems. Default generation has three equipment hazards;
maximum frequency has five, with sixty bounded local particles. Traffic and moving
machinery remain additional hazards. There is no fire propagation.

City authoring raises the local save-profile budget to at least 1 MiB while
preserving larger custom limits. The expanded delivered city produced a 262,742
byte save, exceeding the former 262,144 byte limit; this is a measured payload
capacity correction, not an unbounded limit. The authoring regression advances a
real city runtime for 120 ticks and exports its complete portable snapshot through
the public save-profile serializer under the declared policy. Browser delivery
still verifies actual save and load with the final authored assets.

`applyTouchOfDeathCity({ declaration, combat })` replaces the owned Touch of Death
arena with the assembled district beside an elevated railway. It preserves
fighter rigs, wardrobe, registered assets and unrelated authored objects. Calling
it again produces the same declarations. Parent setup commands own history and
persistence.

Tool authoring also synthesizes concrete weapon equivalents of the current attack
roles, including neutral and forward/back dash cancellations. Weapon damage and
reach come from its templates; source timing, travel and follow-ups remain intact.
Variants carry source/base metadata for inspection, AI selection and wear. The
engine's `combat-interaction/weapons` tests cover live ground/air use and rollback.

Visible neighboring facades bound the site without an invisible ceiling. The
north frontage has a three-metre base and closely spaced collision bars up
to 22 metres. Four glazed acoustic-screen bays and broad structural supports
make that boundary visible while exposing the elevated railway and staggered
service-building skyline. All original collision bars retain their transforms;
the former dense dark-bar rendering is now restrained translucent glazing.
Walls, roofs, moving equipment and decorative machinery fade to shader-rendered
mesh edges when obstructing either fighter's posed silhouette. Their existing
3.5% fade weights still drive transitions and shadow coverage; the fragment shader
removes the final interior instead of drawing a translucent solid. The final authoring
pass includes large nonphysical and cooked scenery; pickup weapons keep their
ordinary appearance. Sightline samples include extended hands, feet and head,
with a silhouette margin at both landscape and portrait camera distances.
Supporting slabs beneath both fighters stay opaque.
Hosts finalize character poses and combat effects through `beforeVisibility`
after camera framing and before obstruction queries. Visible guard, timing,
armor and contact cues add a bounded envelope of nine sightline samples per
fighter; inactive pools and decorative cosmetics do not clear scenery.
Large architecture within three metres of the camera lens also cuts away even
when it misses body rays, preventing foreground ceilings from filling the view.
Clear interiors prevent overlapping stair and room layers washing out attacks.
Low cover and stocked counters retain their existing fade weights, but resolve to
edges too; their trim follows the same cutaway strength. Coplanar triangle seams
are omitted. Edge streams are cached per mesh, with no new scene entities or draw
pass. The engine's [cutaway contract](../../../../../docs/first-party-3d-webgl2.md)
owns shader and resource behavior.
Legacy edge cages are hidden: their foreground lines could cross fighters'
ankles and resemble stray combat indicators. New authoring omits those meshes.
Mounted wall courses, door trim, paint and fractures follow their supporting
surface's fade through authored `:occlusion-follow:` material references, retaining
their individual colors without floating in front of the fighters. Shared trim
materials also fade when any of their instances obstructs a fighter, even if the
support itself stays clear. This keeps shared material batches intact. Distant
scenery skips detailed sightline tests through a conservative bound. Source
geometry, collision, saved state and the fitted camera pose are unchanged by
camera fading. `overhaul/kit.test.ts` and the engine's
`combat-visuals/defensive-clarity.test.ts` cover these presentation boundaries;
normal-distance gameplay captures remain the visual acceptance test.

The city camera aims .10 metres below the fighters' mean root height to retain
nearby floor clusters, with the same distance, elevation and fighter/HUD fit.
The original enclosed arena retains its .55-metre raised target. Secondary
cutaways reveal up to four nearest available loose pickups within six metres of
either fighter and within 1.5 metres of that fighter's floor. Held, thrown,
inactive and depleted objects do not clear scenery. These sightlines preserve
supporting floors and never expand the camera or change pickup state.
Pickup-only rays clear local cover with half-extents no larger than three metres,
so equipment behind a home cannot turn the entire building translucent. Fighter
sightlines still clear scenery of any size. When fighters align in depth, a local
presentation orbit eases their projected silhouettes apart, keeps its side through
world-axis crossings, and returns only along a clear path. It refits against the
rotated view axes without changing movement controls or save state. The normal
x-separated view and original arena retain their baseline yaw;
`camera-orbit.test.ts` reproduces native route and knockout positions and checks
portrait fit, bounded movement and crossing stability.
After fading, equivalent fully opaque city materials share an existing render
handle through a frame-only override. Authored material identities remain intact,
faded owners stay independent, and current texture, color, emissive, UV and toon
traits must match. Model variants keep their canonical material. This restores
instancing without merging transparent cutaways; `occlusion-batching.test.ts` and
`runtime-3d.test.ts` cover fade/restore batching and the renderer's override reset.

The city light rig uses warm directional light, cool ambient fill and five bounded
point lights centered above the district encounters. Market and residential pools
are warmer; depot and utility pools are cooler and subdued. Each point light has
an 18-metre range and intensity 1.7; their count remains five across arrangements
and rebuilds. These lights guide attention without adding emissive building edges.
Editor
play and standalone delivery share `../shadows.ts`: a fixed 2048 directional map
covers the bounded worksite without camera-follow shimmer. Other projects do not
allocate a map. Styling removes the old `tod:city:concrete-grain` binding to keep
the primitive surfaces flat. Other registered texture bindings remain editable;
styling does not introduce replacement textures or realistic assets.

At the central worksite, the street surrounds a building with opposite open doors. A direct route at x=0
connects z=8 to z=-10; the longer east bypass goes through x=10. The west exterior
has twelve half-metre stair risers at x=-8 leading to the roof. The east roof patch
is marked for demolition. A visible tracked gantry cutter lowers onto it after
five seconds of warning; removed geometry remains absent for the match. A cracked
east wall can break from a sufficiently fast combat impact, exposing concealed
observation equipment. Its cracks are readable from both sides. The passing train
is scenery beyond the playable boundary and cannot interrupt combat.

The east worksite freight lift is playable geometry. Its striped deck cycles
every ten seconds between 2.4m and 6.1m, repeatedly offering a different height
and a jumping route to the roof. Its guide rails, carriage and drive motor make
the motion visible. Both fighters use the same ordinary jump to board, are carried
by the existing support rules, and can jump off at any point. The lower stop leaves
two metres beneath the deck so a standing fighter cannot be squeezed through the
street by its descent. The original stair route remains available. The deck's
west edge at x=7.8 leaves the weak wall's immediate exit clear.

The four plaster infill panels beside the front/back doors now also break from
combat impacts, with attached cracks, paint and trim removed together. Concrete
side walls and steel headers stay intact. District weapon arrangements use
existing pickup, attack, durability and throw rules. Stock is selected before
combat and is not replenished during rounds.

`authorCityActivity({ declaration, combat })` in `traffic.ts` refreshes only owned
traffic, its local route markings and the ten match delivery layouts. Two slow
loaded carts, three cars, a depot bus and an at-grade freight shuttle animate on
bounded routes. Cars follow continuous two-lane circuits, turn through real arcs,
face forward throughout and ease from straight-leg speed into slower turns. The
east companion starts half a circuit away instead of copying a bumper-close
translation. Bus and freight are double-ended service shuttles at 16 and 18 m/s,
with terminal dwell. Saved match motion seeds select cadence and phase;
vehicle parts share their pivot, heading and timing. Wheels, cabins, windows and end lamps make them
recognizable; painted lanes and terminal beacons show where they travel. A raised
east transfer deck moves between two fixed loading docks. These use the existing
animated box collision and moving-support rules: both fighters can board, ride,
jump off or route around them. The five fast vehicles reference the existing
toward-heavy move for contact damage/stun, with a 3 m/s minimum closing speed;
parked vehicles and the slow carts do not become surprise damage sources.
Complete rotated car sweeps clear all district arrangements and initial fighter
envelopes in standard and compact maps. Prop/station stocking reserves return
lanes and turns. Circuit wrecks retain their collision and actual impact heading;
linked trim, later crashes, portable restoration and rollback agree. Regression
routes are `vehicles/circuit.test.ts`, `vehicles/wrecks.test.ts`, and the engine's
`motion/circuit-motion.test.ts` and vehicle motion/rollback suites.
Vehicle bodies fade for camera clearance; attached details follow their body fade.
The original elevated background train and five vertical freight lifts continue.

District modules own breakable formwork, delivery stacks and other local cover.
Each uses one collider and two persistent, noncolliding broken forms, selected
with the district's structural arrangement. Density can remove these cover groups
without removing a route or changing inventory stock. Existing impact rules own
destruction; there is no fragment physics or item replenishment. The older
`authorCityProps` and `prop-models.ts` helpers remain separately testable, but the
final city assembly removes their repeated generic prop field.

`details.ts` adds worn panel seams, patched facades, rusted fittings, stair
nosings, road drainage and rail-car doors/bogies without changing the traversal
colliders. The concealed camera attaches to the surviving north edge of the
weak wall, so losing the roof cannot leave it floating. Wall and roof debris
consist of 12 and 18 separately authored render-only fragments. Their rest poses
are editable; removal-frame presentation moves them from the lost surface to
those poses, then leaves the rubble visible. The cutter retracts after removal.
Rewinding restores both intact surfaces and exact intermediate fragment poses.

`architecture.ts` establishes the district silhouette with varied roof crowns,
cornices, fixed utility housings and risers, selective warm windows, rail structure,
gantry ribs and flush street repairs. Slate and oxidized teal distinguish steel
from ochre plaster and pale concrete. Together with `frontage.ts`, the architecture
is bounded to 260 static cosmetic pieces; original traversal colliders and
demolition timing stay unchanged. The additional pieces establish five
staggered blocks with setbacks, cornices and rooftop utilities beyond the train,
plus the gantry's hydraulic service lines, running wheels and counterweight.
Reauthoring preserves registered custom city texture bindings and UV transforms,
including their obstruction-fading material copies. The style pass removes only
the old stock concrete-grain binding.

`cookTouchOfDeathCityModels()` in `models.ts` produces fifteen ordinary GLBs: three
irregular chipped concrete fragments, a chamfered rail-car shell, industrial
housing, stepped hydraulic breaker, rounded tread assembly and open lattice
boom, construction brace, detached handrail, faceted road-car body and cabin,
twelve-sided wheels, a folded wreck panel, and a pointed flame tongue. Fire uses
the existing twelve-particle pool with tapered, rising silhouettes above its grate.
Wrecks retain their dark cabin
glass and collision bodies while swapping roof trim and lights for bounded hood,
roof, bumper and scrape pieces; no fragments acquire independent physics.
City setup cooks and deduplicates these assets in the
same reversible editor transaction as its geometry; refreshing weapon stock
only does not rewrite city assets. `applyTouchOfDeathCityModels({ declaration, assets })` installs imported
asset IDs; subsequent city rebuilds retain and use those mesh references. These
replace render meshes only. Fragment bounds preserve the existing resting height
and all saved removal-frame trajectories. Custom facets include flat surface
normals and UVs, while imported texture bindings stay editable.
The boom's struts are built at their world-space section thickness before
normalization to its nonuniform instance scale; diagonal braces remain 4.5cm
wide rather than stretching into overlapping boards.
Elevated architectural trim and static wall detail share the fighter-sightline
fade; cosmetic pieces omit collision edge cages. Foreground south-wall piers are
deliberately absent so they cannot split the camera's view between the fighters.

Editor play and standalone exports enable a bounded 2048 directional shadow map
for this city when `tod:key` is its first directional light. The fixed volume
covers the fighting space, roofs and nearby upper facades without camera-follow
shimmer. Other scenes allocate no map. Key-light direction remains authored scene
data; steep daylight keeps tall perimeter walls from shading the whole
street. The existing shadow pass includes visible translucent combat effects.

Combat audio exposes **Environment warning** and **Environment collapse** with
the existing asset picker and `scene3d.set-combat` command. Older projects fall
back to their countdown/guard-break assignments. The canonical local city uses
distinct worksite-alarm and concrete-collapse WAV assets.

Environmental triggers, reveal objects, warning lamps, debris and cutter movement
are ordinary authored `combat.environment` data. Runtime owns collision removal,
saved state, visible transitions and causal traces. The city adds no objective,
retreat penalty, power-up spawn or unequal player movement rule.

Verification:

- `bun test packages/engine/examples/touch-of-death/src/presentation/city`
- Authoring tests preserve actors/assets, load actual physics, move the train and
  climb from street to roof height using ordinary jumping inputs.
- Lift tests board either fighter through paid jump inputs, repeat the full cycle,
  detach jumps, preserve street clearance beneath descent, and reproduce exact
  positions after a JSON save/restore during ascent.
- Traffic tests check whole route envelopes against structures and all ten starts,
  ride a moving cart and transfer deck, detach paid jumps and replay a checkpoint.
  Delivery tests verify support beneath every district arrangement placement and preserve
  a mix of nearby and distant tools rather than automatic pickups at every start.
- [Structural arrangement tests](overhaul/README.md) check the assembled districts
  and ordinary-input routes. The older prop-helper visibility tests describe their
  isolated generic prop field, which the final assembly removes; they are not
  visual acceptance for the current arena.
- AI and pursuit fixtures cover rooftop ascent/descent, doorway shortcuts and
  restoration. The September 30 arena audit reproduced failures for difficulty-5
  ascent, difficulty-9 doorway pursuit and the interior shortcut even with all
  new neighborhood geometry and weapon layouts removed. The October 1 shortcut
  regression now attacks only after traversing the interior: the current jab
  otherwise hits during the initial opening before testing the route. Both-seat
  pickup presentation uses actual stocked locations, and the AI pickup fixture
  begins outside combat range before its periodic interaction decision. These
  fixtures pass without changing combat tuning. The breach planner now excludes
  generated weapon and dash-only attacks that an unarmed walking fighter cannot
  execute; it takes a doorway when a legal breach would cost more. Stair pursuit
  enters the next connected riser before a higher one, avoiding side approaches
  under the following corner. Difficulties three, five and nine reach the worksite
  roof and attack. The underground exit completes at tick 622 in the measured
  fixture; its bounded test allows 900 ticks for ordinary short-tread slowdown.

Grounded AI routes around live box obstacles through the same physical openings.
For height changes it selects a reachable static landing, approaches a takeoff
point, spends the normal jump cost, and steers in the air through its existing
reaction delay. Downward pursuit chooses an actual edge before steering toward
the lower opponent. Removed supports invalidate the saved plan. Jump-corridor
checks reject obstructing ceilings and walls; navigation yields to combat.
The plan participates in AI capture/restore rather than hidden controller state.
This bounded planner handles up to 64 supports and does not plan landings on
moving, rotated or sloped surfaces.

`scene3d.setup-city` and the Combat inspector's **City generation** build/rebuild
the layout in one undoable transaction. **City transformations** edits its
thresholds, frame timing and feedback references. Practice's optional physical
interaction history exposes the state and causal trace. Save/checkpoint, delayed
online input and recorded replay tests cover removal and reset.

Local artifact and desktop/portrait visual evidence live in
`.local/touch-of-death/city/`, `.local/touch-of-death/city-refinement/`, and
`.local/touch-of-death/release-look/`;
the city remains a bounded stylized industrial slice rather than a finished city asset pack.

The standard district retains a 160 × 120 metre street footprint. Broad streets,
five twelve-step roof approaches and cycling freight decks connect the five
districts. The perimeter facades, acoustic glazing, railway and skyline remain
fixed while district modules change position. Standard and compact generation
share the same module counts; compact reduces horizontal dimensions by ten percent.

The five street spawn pairs occupy clear ground at the worksite, residential,
market, utility and depot districts. Their standard-size centers are (0,8), (-50,-18),
(50,18), (0,-42), and (0,42). Starting locations advance between matches; rounds
retain their current positions and arena damage. Fighter scale and movement
remain unchanged.


Ground routing builds its bounded corner graph from nearby obstacles (the
fighter-to-target bounds plus twelve metres), so distant courts do not exhaust
its 64-obstacle planning budget. Every proposed segment still checks all live
blocking geometry. Cache identity includes both the candidate set and current
blocker transforms/removals. AI route fixtures explicitly omit match spawn sets
so their authored rooftop/doorway starting poses are exercised.

Match layouts cover five street and five rooftop starts. The saved match
index begins from the session seed and advances on each new match; peers use the
same seed. Structural `arenaLayouts`, district `weaponLayouts` and the starting
location's depot connector use that saved index through separate selection rules.
All structural variants place the same non-animated entity IDs; geometry is
positioned before combat and stays fixed during the fight. Rounds retain selected
geometry, damage and item state; saves, reconnects and replay restore them through
the existing world snapshot. A new match advances the selection. No items appear
mid-fight. Practice uses a fixed selection. The Combat
inspector's Match starting locations > Prop layout uses the same validated
`scene3d.set-combat` command for editable placements.

Upright walls bound to the city's occlusion material fade when they obstruct the
fight camera instead of forcing it inside the fighters' framing. Opaque surfaces,
floors and roofs retain camera collision clearance.

Scheduled demolition communicates danger locally: amber perimeter lamps outline
the exact slab during its warning phase alongside the lowering cutter and beacon.
The lamps disappear with the slab. No terrain warning text replaces combat or
practice guidance. `authorCityDangerCues` refreshes these ordinary editable
entities and binds them through the existing environment `warningIds`.

Street-side fire and shallow-flood equipment now use ordinary surface destruction
to activate local damage/grounded-drag volumes. See [hazard authoring](hazards/README.md)
for placement, portable helper, grounded hazard-aware AI, bounded fire/water audio
and remaining simulation limits.

All five above-ground stair flights now use twelve half-metre risers with one-metre treads. Both underground entrances use the same rise and 0.75-metre treads. Their endpoints and footprints stay fixed. The stair regression walks both fighter seats through every flight without jump input; bounded sphere-corner support prevents short treads from trapping a fighter in a repeated upward collision. Static wall faces, insufficient headroom and deliberate jumps do not acquire an extra climb.
