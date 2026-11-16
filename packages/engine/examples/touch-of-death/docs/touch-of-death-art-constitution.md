# Touch of Death Art Constitution

Scope: the first two-fighter service-courtyard slice. This owns art decisions;
the [game guide](touch-of-death.md) owns mechanics and narrative. Existing assets
are implementation evidence, not automatic precedent. No GOLDEN exists yet.

Cosmetic generation follows the [cosmetic contract](touch-of-death-cosmetics.md):
four tiers, native rig binding, particle cue isolation and required rendered evidence.
The contract also owns the October 5 owner decision that legendary energy comes
from visible physical technology. On October 6 the owner selected arena-issued
telemetry, visible sensors and equipment status lights as its lore basis. Hardware
finish remains unresolved; the contract owns the exact approval scope.
The [wardrobe and bridge finish evidence](touch-of-death-art-corpus/wardrobe-bridge-finish/README.md)
records the current candidate, rejected iterations and construction checks.

## Accepted direction

Owner answers in the October 4, 2026 art-direction session establish **grounded
stylized anime**: athletic anatomy, strong shoulders/hands, simplified facial
planes; and a **service courtyard** with clear fighting space, layered balconies,
and restrained surveillance clues. The owner then selected **fighter C, Long-line
counter**, and **arena C, Bridge court**, from the native-rendered v2 studies.
Selection approves silhouette/composition development, not finished assets.
The owner subsequently chose **service worker turned fighter**: cropped work
jacket, reinforced trousers, practical boots. This establishes costume identity;
the detailed garment, face, hair and surface treatment still need review.
The owner selected **heavy B, Deep rising strike**, and **impact B, Radial burst**,
from the v8 motion review. Preserve the deeper load, harder release and broader
burst when refining. This selects development directions, not finished GOLDENs.
The owner explicitly rejected the v8 character's oversized forearms and the new
walk/run animation as worse than the baseline. Neither is an approved precedent.
After reviewing v14, the owner said: "forearms fit locomotion needs work compare
to universal animation set". This accepts **v14 forearm proportions and taper
only**. Preserve those meshes during motion work. Locomotion remains unresolved;
use the repository's Quaternius Universal Animation Library as the requested
comparison reference. It does not approve every library clip or the entire slice.
The owner then judged the UAL-based direction "mostly good" but identified
strange running-leg bends in `locomotion-ual-v4`, with an attached frame. Preserve
that overall direction and accepted forearms; running knee mechanics remain a
required repair. This is not complete locomotion approval.
The owner rejected `motion-set-v4`'s return-to-idle arm flips and exaggerated run,
with two screenshots: "the arms flip out on idle and the run animation looks very
exagerated". Ordinary running should stay restrained and grounded; reserve the
deep compression and emphatic displacement for the selected heavy strike.
The owner accepted the `idle-run-v3` repair: "ok that is fixed and this direction
looks way better", then requested the complete animation set. This locks the
repaired idle arms and restrained running direction. The exact scoped
[approval receipt](touch-of-death-art-corpus/idle-run-approval.json) binds the
reviewed versions; it does not approve new attacks or designate a GOLDEN.
After `full-actions-v10`, the owner said "so much better" while requiring stronger
heavy blunt differentiation, nunchaku swings/hand changes using Maxi as a reference,
and distinct traditional-weapon expressions of unarmed tactical intent. Preserve
the broadly liked direction, not the rejected repetition. High-damage blunt blows
must show load, commitment and recovery; weapon families exchange strengths for
real weaknesses. The [scoped feedback](touch-of-death-art-corpus/weapon-direction-feedback.json)
records this correction. New weapon repairs remain candidates.
Evidence: `.local/touch-of-death/art-lab/candidates-v2/`; exact image hashes and
immutable bytes live in its review manifest and adjacent `feedback.sqlite`.
The [durable visual corpus](touch-of-death-art-corpus/README.md) retains selected
qualities, explicit rejections and current repair examples outside local builds.

## Constrained grammar

| Domain | Rule and status |
| --- | --- |
| Shape | Preserve C's long leg line, narrow waist, athletic shoulder mass, clear arm/body negative space. Large costume masses precede seams; facial planes precede facial detail. Avoid capsule seams and toy-like ball joints. Direction accepted; finished treatment pending. |
| Proportions | Selected C study: 1.98 m crown, .25 m head, 1.05 m hip height, .57 m shoulder width; approximately 7.9 heads tall. Working envelopes: 7.5–8 heads, hips 51–54% of height, shoulders 28–31%, fist length 8–10%, neck exposure below .35 head. These are candidate tolerances around C, not owner-approved numerical constants. Fixed limb lengths and a grounded stance must survive motion. |
| Palette | Inherit the approved September 28 city meanings: charcoal structure, orange useful infrastructure, red danger, blue institutional technology, white route/pickup markings, deep shadow. Player cyan/teal and opponent coral/rust remain distinct from subdued architecture. A material's role selects its color; no random per-object accents. City swatches remain owned by the city style README. |
| Materials | Candidate family: three broad toon value bands, matte cloth/concrete (.75–.95 roughness), restrained skin (.55–.8), metallic only on actual hardware. No universal grain map, noisy microtexture, full-body gloss, or rim on every seam. Evaluate roughness in the actual shader: a stored PBR field alone proves nothing. |
| Lighting | Separate both torsos, faces and planted feet from their immediate background. One motivated directional key, restrained cool fill and bounded local accents; shadows establish contact. Bridge underside may be dark, but must not silhouette the whole fighter into darkness. No decorative light swarm. |
| Composition | Selected bridge forms the upper frame; preserve an open central fighting lane and visible exits. Work large mass → balcony/service structure → small fixtures. Candidate image-area target roughly 70/25/5 large/medium/small, judged from gameplay rather than entity counts. Keep the bridge above the combat silhouette; no foreground crates across legs. |
| Motion | Read → anticipation → commitment → impact → follow-through → recovery. Light is economical and direct; heavy loads weight, changes torso/hip line, commits and recovers visibly. World-space support feet, bounded limb lengths, curved wrist/elbow paths, continuous transitions. Effects-off motion must communicate the hit. Timing trials precede polish. |
| VFX | Contact-local cream core and short warm fragments along force; foot dust stays at support. Heavy changes duration, shape and reaction before particle count. Preserve existing yellow early/red late/white on-time semantics. Never hide a missing contact pose with a flash. |
| Camera | Show both fighters' hands/feet and the contested space; fit movement before cinematic emphasis. Restrained impulse settles to the same framing. No bridge occlusion, snap across fighters, or dynamic crop of recovery. Fixed evaluation cameras supplement gameplay camera. |
| HUD | Preserve semantic fighter identity and adjacent health/stamina/defense resources. Keep silhouettes and contact corridor clear; quieter plates than the combat focal point. No new decorative status language. |

## Locks and promotion

The [October 26 close-camera decision](touch-of-death-art-corpus/camera-close-framing/README.md)
selects the existing close view over the matched wider 4 m alternative. Preserve
that scoped framing choice and its geometric protections; other camera quality
and the whole scene remain separately assessed.

On October 17 the owner selected arcade tutorial celebrations: particles, punchy
animation and earned currency. Keep the next instruction prominent and the combat
view readable. The [tutorial contract](../../../../../docs/design-system/tutorials.md)
owns behavior and acceptance; this direction does not approve an unreviewed capture.

On October 17 the owner requested more expressive contact/dash, parry, tech and
armor particles, fire with smoke, subtle special-state shader cues and defender
shake during hitstop, citing Guilty Gear, Dragon Ball FighterZ, Soul Calibur,
Street Fighter 6 and Smash Bros. Preserve the selected radial impact and semantic
timing colors. The resulting local rays, armor facets, body rims and fire layers
are a candidate treatment, not approval of new anatomy, costumes or motion.

On October 8 the owner requested outlines for camera-hidden objects and clarified
"Outline the faded scenery." This selects scenery edges with clear interiors,
preserving fighters/items and collision behavior. It does not request x-ray
fighter silhouettes or approve particular edge brightness/width. The city
presentation guide owns implementation and the performance audit owns measured
cost; the current rendered treatment remains a candidate.

Locked now: grounded stylized anime; C's long-line massing; service-worker costume
identity; service courtyard; C's bridge composition; inherited semantic city palette. Unresolved: face, hair,
hands, footwear, garment construction, motion timing, final lighting/materials,
camera framing, HUD refinement. A repair preserves locks unless the owner reopens
that named quality. New rendered bytes create a new version and no inherited grade.

Also locked: B's heavy-motion intent and B's radial impact grammar. Forearms must
preserve the accepted v14 geometry (forearm scope only). Their mass must
be subordinate to the clothed upper arm and taper visibly into the wrist. Do not
reuse the rejected .152 m diameter forearm. Locomotion must be reviewed moving
against the baseline; a planted-foot sample or a frozen neutral clip cannot pass it.

The [durable constraint manifest](touch-of-death-art-corpus/constraints.json) binds
the accepted forearm bytes to the scoped owner receipt and render. The slice builder
enforces geometry, entity binding and scale; animation comparison uses this accepted
version even when comparing against a rejected prior candidate. Rendering still
checks perceived proportions. [Shared tooling](../../../../../scripts/game-art/README.md)
owns the preservation mechanism, not this game's taste.

ROUGH = exploration. CANDIDATE = complete domain evidence and objective checks.
APPROVED = inspected critics repaired plus owner approval of exact current bytes.
GOLDEN = explicit owner reference designation, with no unresolved qualities.
Silhouette selection does not approve an animation or final character. The
consumer's `art-direction/quality.ts` checks completeness and locks; human review
supplies taste. Prefer GOLDEN references, then accepted locks. Do not treat a
prior agent's score as an owner decision.

The expanded animation catalogue must cover actual move IDs, including generated
weapon variants. Unknown moves fail instead of inheriting a generic punch.
Weapon motion follows grip, inertia and attack plane; two-handed poses solve one
shared shaft inside both arms' reach. Rapid follow-ups shorten the wind-up path
to fit native timing, with a separate contact and recoil for each strike. Native
damage, resources, root motion and hit stop remain authoritative. The new action
families are candidates and must preserve the accepted idle/run direction.
The [weapon grammar](../src/presentation/city/weapons/direction/README.md)
now binds each actual source move's intent to a family recipe and native tradeoffs.
Build-time trajectory comparison rejects recycled paths across distinct roles;
flexible weapons additionally preserve handle identity and catch continuity.
These executable gates constrain generation. They do not turn passing geometry,
coverage or frame-data tests into art approval.

Wardrobe variants use native rig frames; sewn layers share their garment's actual
surface. Restrained wear follows contact edges. Combat expressions follow native
state without changing the accepted body motion. The cosmetic contract owns these
construction rules and the candidate telemetry equipment treatment.

Retargeting invariant from the run repair: changing an ankle target invalidates
a positional knee hint. Preserve the forward knee hinge plane through stride
adaptation and start/stop blends; check the full cycle for reversed flexion.

The subsequent full motion pass is still a candidate: source jab/idle transfer,
independent head tracking, B's bent-elbow recovery and rear-toe pivot, separate
light/heavy reactions, and simulation-time state blends. A stop must retain its
current gait while blending to guard; changing gait style and guard together
caused a visible wrist jump. The native sequence now covers actual walk/run,
stopping, turning, attacks and complete-pose hitstop. These are demonstrated
mechanical repairs, not new owner-approved aesthetic decisions.
The subsequent idle/run rejection exposed missing elbow validation: a smooth
wrist path can still flip its elbow when the bend target comes from another pose.
Blend the resolved shoulder/elbow/wrist chain and check stops at multiple stride
phases. Adapt vertical effort as well as stride when using a faster source clip.

## Evaluation contract

Characters: front, three-quarter, side, gameplay distance, black silhouette.
Important animations: neutral clip, gameplay clip, contact clip, five-frame strip
(anticipation, pre-contact, contact, follow-through, recovery). Arena: three
blockouts, normal camera exchange and obstruction sweep. Impact: effects-off,
light/heavy contact, reduced motion. Slice: matched input/spacing before and after,
HUD and audio-onset evidence. Hash images, clips, recipe and source artifact.

The October 4 theater audit established the owner's default of **60 fps arena
captures** and required prevention of low-cadence capture, disappearing scenery
and texture/shadow popping. The [arena acceptance workflow](../../../../../apps/engine-editor/verification/arena-capture/README.md)
owns the enforced source-clock, decoded-cadence, subject, lighting and audio gates.
Normal city generation rejects missing material/fade ownership and unsupported
lighting before committing. These are mechanical requirements, not approval of
new scenery composition or a claim that offline encoding proves live performance.

Critics record **evidence → observation → root cause → repair/reject**, separately
for silhouette, character design, animation, composition, material, lighting and
slop. Never convert these judgments into deterministic artistic scores. Promote
shared infrastructure only after this consumer demonstrates the benefit.
