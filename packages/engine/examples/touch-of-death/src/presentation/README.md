# Touch of Death presentation

For visual generation and repair, start with the [Art Constitution](../../docs/touch-of-death-art-constitution.md)
and the [bounded art evaluation workflow](../../../../../../apps/engine-editor/verification/art-direction/README.md).
Existing generated assets are not automatically approved references.

Current combat setup keeps the longer ordinary recovery for blocks and whiffs.
Landed hits, including hits absorbed by armor, use shorter authored recovery and hit-only follow-ups;
the ten-frame input buffer supports repeat jabs and dash conversions. The current
[combat tuning](../../docs/touch-of-death.md#combat-feel--2026-10-17) owns movement,
hitstop, hitstun, launch, grabs and dive commitment. Wheel kicks use one 22-damage
contact and one restrained sweep.
Live relative closing velocity mildly scales hit damage, stun and launch (±10%
maximum). The [game guide](../../docs/touch-of-death.md)
owns exact tuning; `combat/tuning/impact.test.ts` covers contact and commitment.

Movement values remain editable in Combat → Move timing and advanced rules
→ Movement and through `scene3d.set-combat`; generic practice defaults are separate.

`feedback/` adds presentation-only defender shake during hitstop, isolated body
tints/rims for light/heavy hitstun, armor, fire, tech protection and blockstun,
and bounded contact/dash, timing, armor, flame, ember and smoke effects. Materials
are registered by the directed-art installer before renderer construction;
wardrobe variants and shared source materials stay independent. Armor and tech
use local cues instead of the legacy guard sphere. Reduced motion removes shake
and pulse and reduces particle rays. These effects preserve existing timing colors
and remain candidates for owner taste review.

Health and stamina dividers stay at fixed quarters of the full native meter
track as resources fall or refill. The accessible meter value and gradual round
recovery remain authoritative; dividers never scale with the remaining fill.

`cookTouchOfDeathAudio({ sampleRate: 24000 })` in `audio.ts` cooks authored
layered mono WAVs. `cookTouchOfDeathAudioVariants` adds three takes for each
recurring sound. The [audio installer](../../../../../../apps/engine-editor/scripts/touch-of-death-audio/README.md)
imports and binds these through validated editor commands, retains music,
countdown and environment warning/collapse, and calibrates four voice takes per
fighter reaction. Combat audio edits base assignments, optional result music,
sound banks and voice banks; every change uses the ordinary undoable command.

Bodily hits, floor slams and wall bounces have different constructions. Wood and
metal contacts, pickup/drop/throw, grabs, utility tools, surface movement, air/wall
traversal, vehicles and round/match outcomes have dedicated optional cues with
legacy fallbacks. Fire, water, traffic and quiet city/machinery grains retain
distance, live-phase and repetition bounds. Ordinary generated-weapon swing wear
does not imply contact. Voices give hurt precedence over effort and attack.
Machinery uses a low motor and filtered noise; recurring grains contain no
sustained metallic ringing carriers. Its peak preserves the former motor level
after removing those carriers. `audio.test.ts` verifies the cooked spectrum.
Bounce contacts retain their initial metallic accent, body and grit, with a
14 ms ring decay rather than a ringing tail across recurring impacts.

Cooked peaks stay below 0.73; city grains peak below 0.11. Short faded tails leave
room for the next exchange. Playback preloads short banks, prioritizes critical
cues, ducks music briefly and fades music across match phases. Game settings has
separate effects, character voice and ambience sliders alongside Master/Music.
Signal, routing and rollback tests run offline without speaker playback;
audible taste review remains separate from those objective checks.

The Combat inspector also exposes directional guard coverage, wall traversal
timing/stamina, and **Grapples and held objects**. Choose an existing non-fighter
scene object, its material, durability, reach and light/heavy moves. This uses the
same `scene3d.set-combat` command as headless authoring and remains undoable.
Touch of Death setup enables grapples and wall traversal; existing projects can
enable interactions explicitly. G / D-pad down grapples, picks up or throws;
the current input mapping is shown in game controls. Practice's optional
**Physical interaction history** reports object wear, shortened reach, wall
state and causal transitions. The [game guide](../../docs/touch-of-death.md)
owns prototype acceptance and remaining design gaps.

Grab reach measures the hand's reach to the opponent's hurt surface, so the
radius-one fighter bodies can grapple from ordinary collision spacing. A fresh
Interact press also breaks an incoming grab during its window. Stick aim selects
nearby tools or opponents; held tools always throw on Interact. Walls block grab
and pickup targeting. The city authors ten worksite offcuts distributed across
its courts: timber braces with cut shoulders and detached handrails with
welded mounting tabs. The nearby hint names the tool and shows the mapped
pickup control; held-object feedback shows mapped attacks, throwing and remaining
durability. This guidance never overrides stick intent or obstacle checks.
Nearby discovery, selected-target text and the pickup marker exclude inactive
district-pool objects. `fight-hud/interaction-prompt.test.ts` preserves the October
2026 regression where hidden flour/oil stock displaced a visible nearby tool.
Pickup reach measures the visible shaft rather than its center, with a close
off-axis allowance. The shared selector drives both the prompt and execution.
Held light attacks visibly thrust the tool and heavies swing it with both hands.
Worksite and existing training-blade moves use 1.5 times the unarmed damage and
guard damage; block admits 30% move damage as additional chip, parry 10%. Chip
cannot kill, and parry keeps its usual stun/deflection response. Wood splits to
half reach against metal or at half durability; metal retains its length until
broken. Three authored scars and three fragment objects per tool expose that wear.
`authorCityWeaponTools` refreshes only these tools, accessories and moves; follow
with `applyInstalledCityModels` to retain installed sculpted models.
Successful grab techs give both fighters twelve frames to separate and prevent
same-tick regrabs. Hit-stunned bodies cannot be grabbed again; blocking targets
remain grabbable. Human and AI techs use the same fresh press and advertised window.
Dropped tools fall harmlessly onto live arena surfaces; removed support lets
them fall again. Their position and velocity remain part of the saved fight.
Pickable tools use a fine warm-ivory edge through the existing toon outline
pass, including while held. The 0.00085 width preserves small object faces rather
than filling them with the former 0.005 white silhouette. `authorInteractableItemOutlines` isolates their
materials from terrain and can upgrade an existing declaration without moving
objects or changing combat. Broken fragments do not gain pickup outlines.
Four cracked plaster infill panels and a cycling freight lift use the shared rules.
Fixed service lanes now carry two carts, two cars, a bus and a freight shuttle;
a raised transfer platform connects two loading docks. Their shared moving
colliders carry either player, with painted routes and visible terminal lights.
Delivery layouts vary from one nearby introductory brace to distant street tools
and rooftop starts requiring descent, rather than immediate weapons at every start.

Rounds continue in the current arena: after the lethal impact pause, players have
three live seconds to strike the ragdolled opponent. Only the match winner emotes;
between rounds the defeated fighter gets up locally and both refill combat resources. Broken surfaces, tool wear and
city motion persist. New matches rotate through ten authored city starts and their
associated tool placements; later rounds keep the current positions and damage.
During the last ninety recovery ticks, displayed health and stamina refill and
the local damage/exhaustion effects fade; actual combat resources refill only at
resume. Terminal match defeats retain their damage presentation. Failed parry
and recovery timing shed downward streaks; success expands into white rings.
Reduced motion keeps the failed cue's downward shape without moving particles.
The wardrobe's **Get up** slot includes free Stand up and collection unlocks for
Roll up, Kip up and Materialize, with previews and recovery particles. Unlocks
use the existing Rewards boxes and are checked locally and by profile publishing.

The Combat inspector's Touch of Death setup cooks four ordinary GLB assets and
adds a toon arena, mirrored martial-artist stand-ins, and editable feedback
objects. Setup shares the normal command transaction and undo history. Models
remain portable packed assets; no remote downloads or secondary renderer are
required. Existing scene objects are retained.

`cookTouchOfDeathModels` prepares sources before the transaction.
`applyTouchOfDeathPresentation` requires registered model assets and two existing
fighters. It appends ordinary meshes, materials, and entities. The humanoid model
is a static prototype silhouette; its separate hands and combat pose provide
readable attacks without requiring an imported skeletal rig.

The portable gameplay presenter follows these optional sibling objects during
Play and standalone delivery:

| Fighter ID suffix | Feedback |
| --- | --- |
| `:left-hand`, `:right-hand` | Guard pose, punch reach, windup and launcher |
| `:face`, `:belt` | Decorative attachments |
| `:guard-shell` | Guard strain and brief tech protection |
| `:guard-meter` | Guard strength; gradual refill during broken guard |
| `:impact` | Hit recoil and perfect-parry flash |
| `:armor` | Available escape charge; enlarged during armored swing |

Both hand objects opt a fighter into primitive pose presentation. Imported
characters without them retain their own authored animation. The visual presenter
changes evaluated frames only: combat state, saved project data, and physics are
unaffected. Replace models/materials freely; these attachment offsets assume a
roughly two-metre fighter with a hip-level origin. This is prototype presentation,
not a substitute for final character animation.

`fighter-models.ts` adds nine optional portable detail meshes for existing
fighters: shaped heads, swept hair, clenched hands, sleeves, forearms, trousers,
rounded boots, tied belts and facial features. Import the results of
`cookTouchOfDeathFighterDetailModels`, then call
`applyTouchOfDeathFighterDetailModels` with their asset IDs and the existing actor
IDs inside the normal project transaction. The upgrade changes mesh references
and matching base wardrobe variants; colliders, transforms, material colors,
equipment and appearance selections remain intact. Independent wardrobe shoe
materials receive a subdued rim. Head, limbs and boots use continuous sculpted
profiles instead of intersecting spheres; sculpted facial planes, swept hair and
cloth folds remain static geometry on the existing attachment frames. The base
face is upgraded alongside wardrobe variants so an unequipped opponent cannot
retain the old box-shaped face. The jaw and nose share one surface. It is
safe to reapply.
Recook the base fighter and wardrobe models to include the tailored torso,
lapels, jacket seams, rounded footwear and finer facial variants. These remain
procedural articulated models, not production skeletal character assets.

`effects-model.ts` cooks a tapered contact stroke used by fresh setup. Existing
projects import `cookTouchOfDeathImpactModel()`, then call
`applyTouchOfDeathImpactModel` and `articulateTouchOfDeathFighters` in the same
normal project transaction. Cream core strokes and shorter amber fragments follow
the actual contact impulse and expire deterministically. They preserve the twelve
existing effect entities, physical state and character animation. The city uses
filtered directional shadows; see the [city art workflow](city/README.md).

`fighter-models.test.ts` checks portable cooking, sole alignment, catalog
compatibility, physical-state preservation and repeatable upgrades.

Verification: `bun test apps/engine-editor/src/scene3d/game-integration/presentation.test.ts packages/engine/src/project/3d/combat-visuals.test.ts`.

Screen feedback reaches its former maximum at 60% damage and ramps to three
times that strength near 99%, with peripheral blood marks, translucent red and
subtle pulsing blur. Stamina loss independently desaturates the scene and adds
slight motion blur. HUD colors remain readable. Practice uses the same feedback;
online and replay presentation follow the local/controlled fighter. Reduced
motion disables shake and blur while retaining static resource feedback.
Impact shake is four times its previous amplitude; the existing dolly and bloom
curves remain unchanged. Screen-effect and compositor tests cover the thresholds.

During the final 90 ticks before the next round, displayed health/stamina refill
smoothly and resource screen effects fade. Simulation resources still refill at
the round boundary; terminal match results never refill or restart the loser.
Failed parry/tech cues shed downward streaks, while successful timing keeps its
expanding rings. Reduced motion retains distinct static shapes.
`authorInteractableItemOutlines({ declaration, combat })` gives usable objects
fine ivory edges through isolated materials, preserving terrain and
broken-fragment materials. Apply it after assigning item models/materials.
The thirty district models use flat-shaded bevels, open rims, handles and distinct
tool profiles. Ceramic, paper, glass, wood, painted equipment and dull steel have
separate solid colors and roughness; no textures or extra scene entities are added.
Exposed tools use lighter steel with a restrained metallic response so their
broad faces remain visible against dark worktops without thickening the outline.
`scene3d.setup-city-weapons` refreshes these generated models and materials.
The weapon inspector's **Resting pose** authors the portable `restPose` field:
containers and chairs stand upright, while blades, plates and trays rest on their
broad face. These placements use actual support height. Presentation raises the
mesh center by its half extent, including after a drop, without changing pickup
positions or held/thrown behavior. Legacy projects may retain the centered shaft.

Controller launch steering preserves analog magnitude. Touch of Death accepts
live input throughout hitstop and for three simulation frames afterward; the
correction replaces the previous launch adjustment, without moving the fighter
back through scenery. Practice and matches use the same rule. Analog hitstop
snapshots omit absent optional fields so ordinary save/export remains valid even
before the first jump; `combat-rollback/influence.test.ts` preserves this regression.

Practice → Learn a technique → **Steer your launch** repeats the dummy's ordinary
launcher so the player can compare partial and full stick influence. The lesson
shows measured stick magnitude, observed launch rotation, and the remaining
steering window. **Dummy steering and recovery** instead changes the opponent's
inputs; its heading states that distinction. Optional input history preserves
analog magnitude during hitstop, and frame diagnostics retain the last observed
contact, damage, move timing and stun after fighters recover. These are observed
values, not a prediction of frame advantage or a score for the player.

Passing vehicles and authored fading overhead geometry preserve camera framing
through their existing occlusion materials. Static support slabs and opaque
custom geometry retain physical camera clearance. There is no automatic orbit
that changes screen-relative movement during a traffic crossing.

The optional **Add free demo wardrobe** action cooks eight more ordinary GLBs
and adds eleven editable slots through `scene3d.setup-wardrobe`. Each actor has
independent cosmetic materials. Compatible variants reuse existing attachment
frames; the catalog never targets defensive rings or contact effects. The
[wardrobe workflow](../../../../../../apps/engine-editor/src/scene3d/appearance/README.md) owns player saves, online publication
and catalog editing. `wardrobe.test.ts` compares full simulation and physics state
over 600 real input ticks with/without appearance, including AI and physical hits.

Supported community, Quick Play, private-fight and training hosts also offer
shared Top prints and Profile emblems through the picture gallery. Explicitly
shared, unreviewed images are immediately visible to eligible viewers. Emblems appear beside the
authenticated fighter's name; hide, block and revocation restore the fixed icon.
These are host-owned account settings, not project mutations or combat state.
See [uploads](../../../../../../apps/engine-editor/src/scene3d/uploads/README.md) for capability, sharing and cleanup rules.
