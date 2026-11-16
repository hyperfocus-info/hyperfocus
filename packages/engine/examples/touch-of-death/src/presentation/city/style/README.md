# City art direction

`applyCityStyle({ declaration })` styles the assembled city after structural
authoring. `roles.ts` assigns meaning from stable entity IDs and source material
roles. `palette.ts` applies the palette to ordinary materials and their independent
camera-fade copies. `lighting.ts` supplies the shared light rig. Reapplication is
idempotent and leaves combat data, physical positions, inventory and unrelated
projects unchanged.

The scene keeps its crude primitive silhouettes. Fighters and immediate danger
have priority, followed by usable objects and routes, architecture, then the
distant city. Broad roofs, banners and every building edge should not compete
with a pickup or an active warning. District identity comes from physical
arrangements, height, negative space and a restrained material family.

These are authored RGB colors before scene lighting:

| Role | Color | Use |
| --- | --- | --- |
| Charcoal structure | `#293238` | Quiet beams, mounts, cladding and ordinary edges |
| Concrete | `#56595A` / `#85847F` | Broad building planes and lighter concrete |
| Asphalt | `#252C2E` | Street fighting spaces |
| Interactive orange | `#F58A3D` | Hazard supply controls and useful station labels/handles |
| Danger red | `#E75439` | Scheduled danger cues; active fire retains its local effect material |
| Route/chalk | `#BCB8A7` / `#D2CEC0` | Sparse stair, entrance, road and test-zone markings |
| Public paint | `#896440` | Muted civilian paint, distinct from interactive orange |
| Market canvas | `#A58A69` / `#36564C` | Sand and faded green awnings and stripes |
| Residential | `#78676F` / `#77766F` | Muted masonry and roof surfaces |
| Transit | `#4B5B60` | Boarding shelters and depot equipment |
| Utility | `#505C50` | Industrial casings and ordinary pipework accents |
| Simulation blue | `#385D72` | Observation glazing and secured technology |
| Active blue | `#64B9D0` | Small lenses, indicators and simulation screens |
| Distant city | `#222C32` / `#354046` | Receding skyline modules |
| District paving | `#494B46`, `#55534B`, `#4D484B`, `#434C50`, `#414B43` | Worksite, market, residential, transit and utility aprons; dark streets remain distinct |
| Paving edge / joint | `#74796F` / `#303633` | Sparse drains, expansion cuts, repaired surfaces and bridge edges |
| Aged paper | `#AAA592` | Civilian notices, construction drawings and delivery labels |
| Produce | `#7A8750` / `#95804E` | Contained market produce; subdued relative to usable stock |
| Domestic glazing | `#B69C71` | Warm porch windows and small stall lamps |
| Observation glazing | `#385D72`, 20% alpha | Three gallery panes reveal repeated human studies |
| Oversight brass | `#948052` | Small crest and window trim of the privileged observation bay |

Weapon entities retain the inventory catalog's own material colors. Furniture
labels use muted public paint; an empty cabinet does not promise an orange
interaction. Useful equipment controls remain orange without repainting every
household object orange. Residential lamps and domestic windows use warm light;
blue is reserved for technological clues. Generic orange stripes, huge gantry
beams and canopy bands become quiet structure or muted district materials.
Moving lift boarding edges use the route color. Fast traffic bodies use subdued
transit steel so their existing red end lights remain distinct. The utility
control gate's decorative flanges and flow bands stay quiet; they do not activate
the nearby fire equipment and must not advertise an orange interaction.

[`furniture.ts`](../overhaul/furniture.ts) differentiates the fifteen existing
station boxes without moving their colliders or stock. Worksite stations have
stack seams, market counters have recessed serving faces and a small shelf,
delivery cases have straps, residential cabinets reuse their top and handle,
depot carts have primitive wheel faces, and utility cases reuse a tiny status
light. Eighteen nonphysical pieces are added across construction, market and
depot; residential and utility reuse their existing pieces to retain district
entity caps. Owner/source materials keep attached dressing in the same camera
fade group. Station furniture does not gain new breakability or pickup behavior.

The directional key uses warm `[1, .96, .89]` light at intensity 1.65; ambient uses
cool `[.66, .75, .83]` fill at .78, and rim light is subdued at .3. Five point lights
have fixed district centers, intensity 1.7 and range 18 metres:

| District | Center | Light color |
| --- | --- | --- |
| Construction | `(0, 9, 8)` | Warm work light `[1, .78, .49]` |
| Market | `(50, 9, 18)` | Warm serving light `[1, .81, .57]` |
| Residential | `(-50, 9, -18)` | Warm domestic light `[1, .85, .69]` |
| Depot | `(0, 9, 42)` | Cool transit light `[.78, .87, .9]` |
| Utility | `(0, 9, -42)` | Muted industrial light `[.76, .86, .73]` |

The lights distinguish useful local spaces from the distant shell. Their count
does not grow with seed, structural arrangement or density. Compact generation
scales the light centers horizontally by .9 alongside the district geometry;
light height, intensity and range remain unchanged.
Only the existing directional shadow map is allocated. Additional lights still
need frame-time measurements; a bounded count is not proof of negligible cost.

Small numbered chalk plates, identical concealed camera dimensions and service
seams in [`experiment.ts`](../overhaul/experiment.ts) reveal the artificial city
gradually. They follow the supporting structure's three positions and camera fade.
A machinery glimpse is confined to the utility gallery. No large blue floor or
floating billboard announces the premise.

The old stock `tod:city:concrete-grain` texture binding is removed from all channels.
Other custom bindings and UV data remain editable. No new texture, imported asset
or detailed mesh is introduced by styling. Attached art retains its owner's fade
while keeping separate semantic colors; styling does not change collision or
saved destruction.

`palette.test.ts` checks quiet architecture against interactive orange, a small
blue camera lens, retained alpha/custom textures, five local lights and repeated
application. Run `bun test packages/engine/examples/touch-of-death/src/presentation/city/style`.
The [encounter tests](../../../../../../../../apps/engine-editor/src/scene3d/game-integration/city/overhaul/encounters.test.ts) cover causal hazards, stock
and routes. Roof starts can require descending to stock in some arrangements.
Final visual acceptance requires ordinary gameplay captures at normal camera
distance, with both fighters visible; isolated prop previews do not establish it.
