# Narrative film quality

Owner direction, 2026-10-24: the three `media-sweep-20261024/final-v2` films
were about 6/10. Preserve their good integration of art with the world. Improve
future work's resolution, motion, depth, polish, visible theme and prepared
highlight moments. The owner explicitly requested **no repairs to those films**.
Their exact MP4 hashes and feedback are retained in the local review store;
new films are new candidates, with no inherited grade or quality approval.

Later owner feedback, 2026-10-24: **The Ninth Panel** v6 was exceptional in
execution. Its exact project identity is
`93882d97521835d012620b53465f980b2cbdc9415d42f449208786d099af6694`.
Preserve its visible preparation, accumulated attempts and causal payoff as a
local reference. The collection's pace was not approved: the owner requested
twice as many actions and more in-between frames. This is not a blanket instruction
to double playback speed. The soundtrack and narrative duration remain deliberate.

The governing preference is coherence with consequence. Minimalism can be
effective; more detail, faster cuts and more particles cannot replace development.
The owner's references exemplify visual choices carrying meaning, not a request
to reproduce their characters or apply their appearance as a preset.

## Contract before assets

Owner rejection, 2026-11-07: the five `native-humanoid-films-20261107` films reused
the same Knight/Mage sources, blocky scenery and generic action clips. The owner
rejected this as music-video quality, including incorrect travel facing and long
walking filler. Technical delivery receipts did not approve those qualities.
For future films, settle art/tone through a compact reference comparison, then
prove a matched native frame and the hardest short performance before full-song
expansion. The [native production checks](../../scripts/music-video/production/README.md#native-look-development-and-pre-render-feedback)
preserve selected cast/reference identities and flag empty event intervals.

Plan meaningful developments throughout each second, with explicit emotional
holds where the viewer needs time. An action has an intention, target, reaction
and consequence; selecting `Walk`, `Interact` or `Cheer` does not supply them.
Camera, attention, body performance, contacts and world consequences need a shared
clock. Do not fill song length with a stretched traversal or decorate it with
meaningless cuts. Build background activity around what the lead is doing.
Missing geometry/material/rig capability is native editor implementation work;
keep the selected visual target rather than silently substituting primitive art.

Use `score-film/narrative-contract.ts` for new narrative recipes, alongside the
[branch planner](README.md). It validates complete timed progression, at least
two distinct preparations before the highlight, and time for an aftermath.
It stores intent and selects review frames; it cannot judge whether the film
communicates that intent. Supply:

- **Core tension:** the conflict the viewer should feel.
- **Visual grammar:** what color, spacing, framing and motion mean. Specify what
  changes meaning later; a motif returning unchanged is recurrence, not progression.
- **Progression:** setup, development, highlight and consequence with frame ranges
  and a visible change in each. Apply the swap test: if two scenes can exchange
  places without changing the experience, revise their causal relationship.
- **Medium test:** why this action benefits from animation, layered photography,
  pixel exposures, paper, panels or another selected medium.
- **Highlight:** the exact action, earlier preparations and lasting consequence.
  Design its hardest contact/transformation first, with lead-in and recovery.
- **Exclusions:** attractive choices that would dilute meaning or attention.
  Include motion and source-resolution risks, not just stylistic adjectives.

Theme must survive muted playback and a small-screen view. Explanatory prose on
the review page does not repair an unreadable film. A monochrome/one-color rule
is useful only if that color's ownership or meaning develops. Allow quiet moments
with purpose; reject a tableau whose camera and surface noise are its only action.
Creation warns when renamed story phases still request one locked composition.
This is a review trigger, not a universal ban on sustained shots. Before expanding
a collection, inspect one native setup-to-payoff sequence. A flat diagram with
better prose remains a blockout; improve its acting, staging and material art.
Do not propagate that unresolved treatment through all remaining recipes.

## Mechanical polish before effects

When character, animal, prop or composition ratios are uncertain, use
[image reference sampling](../../../../.agents/skills/game-art-direction/references/proportions.md)
before authoring geometry. Carry the measured relationships and their uncertainty
into the asset parameters, then compare a matched blockout with the inspected
reference. Approved cover art establishes its scoped appearance, not anatomical
truth. Correct proportions do not replace pose, contact or motion verification.

New narrative creation also requires `score-film/motion-plan.ts`: a project-specific
action target and pacing reason, or an identified reference video/project with an
observed action count over a measured duration. Do not invent a baseline when none
was reviewed. The default multiplier is one; a different multiplier needs a reason.
Count distinct visible primary/secondary events
with a consequence; exclude camera movement, blinking lights, grain and repeated
keys. Each action names its actor, anticipation, event, recovery, contact condition,
exposure plan and ten-consecutive-frame event burst. The inspector reports ten-second
windows without an event; deliberate holds need a purpose. Counts are declared
intent, so inspect the rendered sequence for redundant or invented actions.

`create.ts` rejects new narrative recipes without that plan. The explicit
`--allow-legacy-motion` option only reproduces an archived recipe and labels its
action-density evidence unestablished; it does not qualify a new production.
Separate action duration from shot duration. Declare `maxActionSeconds` when a
gesture must be brisk; increasing shot count does not fix a slow handoff. Keep
preparation and consequence readable. Add breakdown poses and
[state blends](state-blending.md) inside the same action time, rather than slowing
the action to display more drawings. Review the returned `reviewClips` at 1× as
well as ten-frame bursts: the latter diagnose local continuity, not overall pace.

For cutout work, `production/paper-rig.ts` authors editable layers with the engine's
pose/IK solvers. `production/performance.ts` supplies planted stride targets and
single-owner prop transfers. Supply character-specific art, measured pivots and
painted hand/foot anchors; these primitives do not provide an approved acting library.
Persist `musicPerformance` through a recipe's `performance` field. The native
verifier checks every declared joint and each focal actor's actual drawing exposures.
An animated source elsewhere in a chapter does not certify that actor.
Intentional expression holds need a reason. These checks do not establish occlusion,
believable weight or emotional performance; inspect complete decoded actions.

`production/motion.ts` freezes by evaluating and baking the delivery-frame grid
before holding it. Never replace an arriving key's easing with `hold`: the native
evaluator uses destination-key easing, which can freeze the approach and detach
sparsely keyed bodies from their limbs. The helper preserves integer-frame values;
nonlinear subframe interpolation is baked. Recheck attachments after retiming,
key reduction and freezes. Do not raise tolerances merely to make a defect pass.

`source-resolution.ts` measures the used crop against its largest screen size.
A 1536-pixel atlas may provide only a 384-pixel actor. Inspect the closest shot,
alpha edge and crop gutter at delivery size. Narrative recipes use 1920×1080
delivery and triple SVG decode dimensions with their authored viewBox preserved.
This prevents low-resolution vector rasterization; it adds no raster detail.
Pixel art declares its intentional pixel grid.

Creation and delivery verification write `resolution-receipt.json` from the persisted camera, entity scale,
active image and matte crops and archived PNG/SVG dimensions at every frame.
Rows retain each role's worst footprint; missing and raster-wrapped sources name
their image or matte role. Inspect its largest
footprints, including aftermath close-ups. It conservatively includes occluded
layers and reports unsupported codecs as unmeasured; it does not certify perceived
sharpness or reject deliberate pixel art. Disclose background enlargement separately
from hero detail, rather than describing only the wide shot's resolution.
SVGs containing image elements appear in `rasterWrappedAssets`: their decode
dimensions do not establish the embedded raster's detail. Review the original
raster and used crop separately, including images referenced through SVG defs/use.

For locomotion, inspect a complete stride plus starts/stops at actual speed,
without effects. Match cycle travel to root travel; identify support and swing,
pelvis weight and foot roll. `motion-proof.ts` measures declared contacts relative
to their moving support. Low sliding error does not prove convincing weight.
Do not use a short pose loop to imply an unverified performance.

For parallax, establish camera travel and each plane's depth. For a translating
camera and fixed projection, screen displacement is proportional to inverse
depth; `depthTranslation` implements that relation. Attached props move with
their surface. If a camera track already translates the scene, compensate the
entity by the difference instead of applying displacement twice. Zoom, rotation
and changing perspective need their own projection, not this shortcut.

Review anticipation, contact, impact, follow-through and aftermath in order.
Track hands, held props, silhouettes, crop boundaries, occlusion and attention
across cuts. Add effects after the action reads, subordinate to its purpose.
Match a meaningful musical event; distinguish BPM metadata, estimated phase and
human-confirmed musical interpretation.

When an actor draws, erases, pulls or catches, derive the visible change and the
contact point from the same path progress and clock. A correct endpoint cannot
repair an eraser traveling against its removal front, or support arriving after
a catch. Inspect silhouette continuity across source swaps and retain intensity
and source phase when replacing an occluded effect. A motivated cut may omit a
landing; document that editorial choice instead of claiming a continuous motion
proof. Handoffs name the exact approach/contact/release frames and decoded evidence.

Contact belongs to each shot's visible geometry. A planted wide-shot figure does
not certify a separately drawn close-up. Measure the support, wheel axle or weapon
axis in the actual insert; a blade touching a grip can still bend away from its
hilt. Carry subject topology across cuts: leaf side, hand ownership, aperture shape
and attachment points must survive a change of scale. Give branches of a flow
their upstream arrival times instead of restarting every branch simultaneously.

Check preparation cues in the final composite, not just the underlying tracks.
An opaque insert can hide the action the next scene depends on. Use explicit
visibility intervals for covered action and deliberate holds where motion has no
visible purpose. The verifier writes `exposure-diagnostics.json`, binding quiet
decoded transitions and contributing entities to project/video hashes. Inspect
those ranges to distinguish occlusion, tiny motion and a frozen render. Keep the
delivery thresholds; deleting meaningful action to improve a ratio defeats the
review. Neither a visibility pass nor numerous moving layers establishes density,
pacing or a compelling highlight.

## Sequence review and handoff

Creation persists `narrative-contract.json` and includes causal cue neighbors
in native preview requests. Verification binds the canonical project and MP4.
Inspect the full sequence at 1×; use the highlight strip to locate a sequence,
not certify its motion. Record what visibly changes, exact frame ranges and
unresolved objections. Keep technical correctness, rendered observation and
owner taste separate in the [handoff](handoff.md).

Collections vary narrative mechanism as well as medium: withholding/sharing,
mistaken observation, exchange, pursuit, repair and sacrifice imply different
progressions. Ten transformations into luminous landscapes remain one recipe.
Each film needs its own subject, action, staging, cadence and consequence.

## Executable narrative examples

These recipes use the [native creation and review commands](visual-score.md#branch-specific-production-packages).
They are authored examples, not asset-free generators or approved styles. Supply
their archived source inputs and a new music selection, then review the resolved
timing and complete sequence. Reusing the code does not transfer a prior verdict.

| Recipe under `scripts/music-video/score-film/narrative/` | Preparation becomes consequence | Critical review interval |
| --- | --- | --- |
| `cinema/floodgate.ts` — The Floodgate | Discarded drops fill a counterweight; private supply becomes shared access | Bucket accumulation, gate clearance, connected street flow |
| `cinema/sun.ts` — A Place for the Sun | A warm window and binding tab become a physical invitation | Hinge projection, feet on moving ledges, greeting contact |
| `cinema/platform.ts` — The Last Platform | A ticket's pattern returns through train windows as a remembered home | Arrival occlusion, window mask, memory reveal and departure |
| `play/borrowed-moon.ts` — The Borrowed Moon | Failed alignments teach a release that changes the tide | Crank grip, visible notch failure, separated ring clearance |
| `play/ink-takes-wing.ts` — Ink Takes Wing | An erased flight path becomes an opening through paper | Shared drawing/erasing progress, yielding beak contact, tear |
| `play/ninth-panel.ts` — The Ninth Panel | Incomplete reaches accumulate into support across panel borders | Attached grips before border travel, free fall before catch |
| `signal/dead-air.ts` — Dead Air | Repeated failed contact prepares a relay connecting an audience | Mechanical contact, signal route and audience response |
| `signal/room-404.ts` — Room 404 | Surveillance clues reveal the observer inside the watched room | Spatial correspondence, door occlusion and reveal timing |
| `signal/afterimage.ts` — Afterimage | Destructive ink strokes teach a deflection that becomes shelter | Anticipation, planted support, shared grip/blade clock, recoil |
| `weather/small-weather.ts` — Small Weather | A leaf's spent protection returns through the seed it saves | Droplet absorption, landing coverage, canopy/rain continuity |

Choose the mechanism before its surface treatment. Keep contact clocks and
coordinate relationships when adapting a recipe; re-author them when the action
changes. Musical retiming must move props, exposures, camera and consequences
together, and the archived contract must describe the final resolved cue frames.

## Research translated into production decisions

These are bounded production references, not claims to have watched every work
in the owner's list. The applications are our inferences from their methods.

| Primary source | Observed method | Workflow application |
| --- | --- | --- |
| [Sony Imageworks: Spider-Verse](https://www.imageworks.com/our-craft/feature-animation/movies/spider-man-spider-verse) | Stepped performance coordinated with camera/simulation, linework and designed speed cues | Judge cadence with the moving camera; crisp poses still need readable trajectories |
| [Disney Family Museum: multiplane](https://www.waltdisney.org/blog/machine-imagination-walt-disneys-pinocchio-and-multiplane-camera) | Painted planes and camera movement create depth and texture | Derive layer movement from spatial relationships and inspect attached contacts |
| [ASC: John Seale on Fury Road](https://theasc.com/video/john-seale-asc-acs-framing-mad-max-fury-road/) | Center framing supports rapid edits | Preserve attention targets through action; symmetry is a means, not a universal look |
| [OK Go: The One Moment](https://okgo.net/2016/11/23/background-notes-and-full-credits-for-the-one-moment-video/index.html) | Precisely timed events reveal structure; speed changes allow human contact | Work backward from the highlight's meaning and timing; preserve breathing room |
| [Playdead: Huddle Up](https://www.gdcvault.com/play/1024126/Huddle-up-Making-the-SPOILER) | A concluding creature integrates animation, physical behavior and shading | Build the reveal as an integrated action, not an isolated impressive still |

Research access: production pages, official stills and talk descriptions/slides;
not complete sound-on viewing of the referenced films or talks.
