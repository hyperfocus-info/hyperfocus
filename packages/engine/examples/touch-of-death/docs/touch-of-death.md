# Touch of Death: design and agent guide

This document owns the game's philosophy, accepted design decisions, and decision
rules for contributors. Implementation details and editor controls belong in
[Fighting games](../../../docs/fighting-games.md). Current implementation was checked on
2026-09-24. Numerical tuning is a snapshot, not a permanent design constraint;
read the authored project and source before changing it.

For bounded parallel research and small-fix triage, use the
[500-investigation backlog](touch-of-death-investigations.md). Its entries are
questions to verify, not confirmed defects or approved feature changes.

## Accepted temporary inventory direction — 2026-09-30

Ship thirty recognizable objects across eleven shared families. Dedicated weapons
retain directional combat roles; simpler tools have two actions, and disposable
props share one action on either attack button. Fragile objects buy an opening
through hitstun rather than high damage. Extinguishers and pepper spray bash on
Light and spend finite charges on Heavy. Ground supplies deploy visible temporary
movement restrictions affecting either grounded fighter; jumping avoids them.
Auto-aim firearms, tranquilizers and new grappling systems remain future work.

Five districts keep distinct inventory pools. Each match selects one of three
arrangements per district, exposing six pickups each from sixty authored objects.
Consecutive matches change stock independently of fighter starts. Items cluster
beside supported household, market, worksite, depot and utility stations. Rounds
preserve consumed items, wear, charges and active effects; no mid-fight replenishment.
Practice stays fixed, and saves, checkpoints and online peers share the selection.
Balance and readability still require human playtesting. See the city README for
authoring and runtime limits, and the delivery document for the verified artifact.

## The player promise

### Combat feel — 2026-10-17

Keep long whiff recovery punishable while reducing wind-down after a real body
hit. Current airborne and grounded hitstun is 5% above the October 1 baseline,
rounded to whole frames. A ten-frame input buffer and eight-to-ten-frame confirmed
Strike follow-up windows make fresh repeated Strikes and launcher routes practical.
Blocked or parried attacks receive no hit-only route or shorter recovery. Armor
absorption confirms the attacker's route without interrupting the defender.
Repeated moves have no arbitrary cap; reach, pursuit, stamina,
defender steering and surface tech still decide whether pressure continues.

These are authored finished frame values. `hitRecoveryFrames` and cancel `hitOnly`
remain editable portable move fields; existing projects retain their authored
behavior when these optional fields are absent. Canonical game migrations apply
tuning once, then save final values rather than applying runtime multipliers.

The current pass reduces hitstop by 20%, rounded to fixed ticks. Launch speed
falls by 10% at damage 4, tapering to 5% at damage 30 and above, including vertical
and downward impulses. Guard and blockstun turn at 60 degrees per second. Dive
kicks halve startup tracking and held steering, with 10% longer startup and
ordinary/confirmed recovery, rounded to frames. Fire deals 10 damage every 30
frames: a 400% increase (five times the prior damage). Fire is the current damage
over time hazard; water and deployed ground supplies slow without damaging.
`src/combat/balance.ts` and `src/combat/physical.ts` own the authored values.
Optional Practice **Combo attempts** records actual input rejection, starts and
completed misses, helping distinguish a failed input from physical spacing.

Touch of Death is a fluid, physical, 3D anime fighter in which one earned opening
can become a full-health kill. The challenge is converting that opening while
both players continue making decisions. Movement, impact steering, defensive
resources, surfaces, and changing trajectories make the next hit a new problem.

The inspirations describe different responsibilities:

- Toribash contributes bodily consequences and physical/environmental interaction.
- Naruto Ninja Storm contributes fluid movement, pursuit, and an approachable spectacle.
- Tekken and Dragon Ball FighterZ contribute committed attacks, punishable recovery,
  launchers, strings, and deliberate combat rhythm.
- Melee contributes situational conversions: the opponent's position and response
  determine the best continuation.

These are influences, not feature-completeness claims. The current game uses
procedural articulated characters, authored attacks, rigid-body movement, and
physical death ragdolls. It does not implement Toribash-style manual joint control.

The editor's [directed fighter integration](../src/presentation/art-direction/integration/README.md)
installs fighter C's models and the reviewed action rig into normal setup and
existing projects. It owns presentation in editor Play and exports while native
movement, collisions and combat remain authoritative. Installation preserves
scoped art approvals; it does not turn the full action set into a GOLDEN.

The design ambition is roughly 70% execution and 30% situation. That is a product
direction, not a damage formula. A skilled attacker should be able to kill a
resource-empty defender who loses a committed launcher interaction, has poor
escape routes, and misses defensive opportunities. Correct steering should force
adaptation; it need not guarantee escape.

## Moving city: approved direction

### Player contract and learning direction (2026-09-28)

Every type of player should have something cool they can become invested in.
Evaluate changes against concrete interests: execution, competitive improvement,
movement, improvisation, spectacle, discovery and social play. These are overlapping
interests, not prescribed player classes or new progression systems. For competitive
players the contract expands to a pure fighting sandbox with world-class systems,
infrastructure and indefinitely useful, clear ways to improve. A new feature must
name the player opportunity it serves and how its consequences can be understood.

Do not rank execution, reads, movement and environmental adaptation into a universal
skill hierarchy. Strong execution can lose to better situational judgment. Consistent
improvement comes from refining strengths and addressing weaknesses. The 70/30
direction is not permission to simplify away fundamental decisions. Preserve the
approved pressure and weapon feel: openings convert when pursued quickly; pressure
ends through attacker error/delay, difficult-to-follow DI or successful recovery.
Items provide a meaningful advantage with defender counterplay. Do not rebalance
these merely to make a tutorial easier to complete.

The first-time prompt is sound control. Offer an optional guided fight with settings
and pause always available, individual phase skipping, whole-guide skipping and
replay from the menu. Use a low-opacity black overlay with focus masks and arrows;
keep the fight readable. Progress from forgiving instruction through credible
resistance to the ordinary game, ending with an AI3 fight. Loss and another attempt
belong in the learning experience; never silently force a defeat by granting the
opponent different rules. A skipped phase is skipped, not mastered. No decision quiz.

AI is an early glimpse of possible meta and high-level play. Preserve its approved
personality and capabilities while auditing legality. All autonomous difficulty
levels should retain bounded observations of decisions and outcomes that can inform
prompt-driven improvement. Separate observed result from inferred cause. Logging
must not change combat decisions or replay state. Bounded move preferences adapt
within a match. The host's bulk learner continuously persists general contextual
knowledge and queues saved revisions for the next ordinary match. Learned action
parameters survive diagnostic-history turnover. A separate frozen, seat-swapped
benchmark measures strength without blocking updates. Legacy score artifacts
retain their independent evaluation and recovery contract.
The [combat AI audit](../../../docs/combat-ai-evolution.md) records current reward behavior,
reproduced fixes and the remaining conversion, ingestion and evaluation gaps.

Human playtests seek blind spots and unexpected pockets of fun, rather than treating
aggregate beginner success as the only goal. Record what each person chose to pursue,
where they became curious, what they repeated voluntarily and what interrupted them.
Use the designer's taste as direction; test whether the intended opportunity is
actually discoverable and enjoyable. Simulation can prove behavior, not human fun.
Use the [external-session guide](touch-of-death-playtests.md) to collect those
observations without turning every loss into an evaluation.

### Inhabited city and signature visual language (2026-09-28)

The surface reads as a believable inhabited city, with unsettling contradictions:
purposeful traps, unexplained transport operation and surveillance concealed in
ordinary infrastructure. It is a hidden exam, not a visible menu of combat rooms.
Retain the elite-run experiment below governments; reference material mentioning
government facilities does not replace that established ownership. No supernatural
explanation, mandatory investigation minigame or new factions are implied.

Use the references by responsibility: Dredd for connected vertical neighborhoods;
Mirror's Edge for momentum and clear routes; The Running Man for manufactured danger
behind ordinary presentation; Hitman for layered public/service spaces and systemic
possibilities; The Raid 2 for fights crossing interiors, streets and transport.
These references do not authorize disguise or multi-enemy systems. The subsequent
owner decision keeps crowds as noncombatant scenery and preserves the current
fighter count; background occupants must not imply additional attackable targets.

Approved visual grammar: charcoal architecture, orange infrastructure/public props,
red danger, blue institutional technology, white markings and deep shadow. Preserve
white pickup outlines and fighter/impact readability. Aim for a recognizable limited
palette and coherent primitive geometry, supported by lighting and particles; do not
copy SUPERHOT's palette, Cruelty Squad's assets or Teardown's voxel technology.

Districts should contrast through silhouette, material rhythm, dominant existing
hazard, prop family and vertical routes. Traffic, market/transit, residential,
construction, industrial/utility and concealed laboratory spaces are the target.
Each should support several skills and connected fast/exposed, slower/predictable,
and improvised routes. A painted symbol is not a functioning route or hazard. Describe
unsupported excavation, population simulation, spreading fire/flooding, vehicle
redirection and reconfiguration as gaps until their causal rules and counterplay
are built. The owner has approved ongoing hazard damage/status effects. The first
bounded implementation uses visible flame exposure for periodic damage without
hitstun ticks and shallow water for grounded voluntary-movement drag. Exiting the
flames ends exposure; airborne motion and impact steering are not water-dragged.
No hidden lingering burn, electric-water combo or spreading simulation is implied.

Prefer continuity: a breached wall opens into a meaningful adjacent space; a lift
changes access; damage changes later decisions and survives round recovery. Keep
state data-driven, transitions inspectable and AI/humans on the same interactions.

The setting is gritty and grounded, with no supernatural explanation. Subjects
know nothing of their erased lives or the experiment. Wealthy elites above
governments secretly operate the moving urban training environment to find
"1.0 convergence": the perfect specimen for a clone army intended to subjugate
the world. Convey the simple surface premise through the environment; deeper
discovery is optional. Do not invent factions, objectives, recruitment methods,
or the mechanism of memory erasure to fill gaps. Story investigation is roadmap
work, not a launch requirement.

Environmental interaction serves cinematic adaptation (roughly 70% execution,
30% situation), not random item drops. Every interaction needs readable setup,
consistent physics, a meaningful choice, visible consequence, and a response
available to both fighters. Arena memory is concrete changed state, never a
meter. Specific destructible scenery and machinery still need design selection.

Approved combat additions:

- Guard covers 120 degrees centered on facing. Turning is unrestricted outside
  block stun and locked during block stun; cross-ups must work.
- One interaction input derives grapple/pickup intent from facing and movement;
  stick intent wins ties. Holding an item makes this input throw it.
- Grapples beat block, have an initial timed tech, and otherwise cause slight
  damage and repositioning. A thrown fighter uses the existing surface recovery
  window; missing it can permit a combo.
- With no reachable pickup or fighter, Interact still attempts a grab: the arms
  reach in the input direction and commit to 18 frames of recovery. The miss and
  its reason are recorded; held objects still throw immediately.
- Active strikes directly damage authored impact surfaces. A light impact leaves
  chips; a strike meeting the surface's existing impact threshold breaks it.
  Facing, reach and intervening solid geometry apply equally to both fighters;
  logs identify the attacking fighter, and the opening persists like a body impact.
- Authored moving traffic strikes fighters intersecting its swept body using a
  selected heavy move's damage, recoil and impulse. A low jump is not immunity;
  clearing the roof or riding it safely avoids contact. One continuous vehicle
  contact cannot deal damage every tick. Replays identify the vehicle itself,
  and impact effects/audio use the ordinary heavy-contact presentation. Traffic
  contact latches survive saves and rollback; they do not reset damaged scenery.
  Environment authoring supports 512 surfaces and 128 traffic bodies, with one
  contact-stream pass per simulation step regardless of prop count.
- Held items replace light and heavy attacks. Light use wears them, heavy use
  wears them more, and contact adds wear. Material changes durability. Cutting
  a staff shortens actual reach, and exhausted items break. Block contact damages
  the item and admits increased piercing damage.
- Loose-item reach measures the visible shaft; nearby off-axis objects can be
  picked up without pixel-perfect center aim. Vertical reach and solid obstruction
  still apply, with one shared selected target for human, AI and HUD.
- Held light attacks thrust the object; heavies chamber and swing it with both
  hands. Worksite attacks deal 1.5 times the corresponding unarmed damage and
  guard damage. Weapon block chip is 30% and parry chip is 10% of move damage;
  neither chip kills. Parry still grants its usual response and projectile deflect.
- Wood splits to half its current reach on metal contact or crossing half
  durability; metal retains its reach until exhausted. Authored scars show wear,
  and break fragments use the saved impact position. Broken objects stay hidden.
- A successful grapple tech gives both fighters 12 frames to visibly separate;
  it cannot be immediately canceled by another grab in that same tick. Hit-stunned
  bodies cannot be regrabbed; block-stunned opponents remain grabbable. Every
  advertised tech-window frame accepts the defender's fresh interaction press.
- Fresh-press parries deflect thrown items. Catching with the interaction input
  and grappling while armed are explicitly deferred roadmap work.
- Wall runs have a brief maximum duration and consume movement stamina. Wall
  jumps also spend stamina; chaining between walls is permitted while it lasts.
- Correct route reading should let pursuit catch retreat through movement.
  Close observation, feints, and positional pressure are meaningful interaction;
  even two seconds of safe refusal to engage is undesirable. No timers, shrinking
  boundaries, cowardice meters, or retreat damage penalties.

Launch learning should show the decisive exchange, explain the physical reason
it worked, and permit retrying the situation. It must not humiliate players or
use decision quizzes. Existing replay takeover is a foundation, not proof that
automatic decisive-exchange capture and explanations are complete. Intent trails
remain an unapproved prototype. These combat rules apply across existing modes.

## Physical-combat prototype acceptance (2026-09-27)

The portable runtime now implements the directional guard, intent-selected
interaction input, initial grapple tech and surface recovery, held-object attack
mapping, durability and reach loss, projectile parry, and stamina-funded wall
traversal. The canonical local project also places visible construction offcuts
beside the initial fighting area. G / D-pad down interacts; input remapping remains
available. Combat inspector settings and `scene3d.set-combat` share validation.
Practice diagnostics expose weapon state, wall state and a bounded interaction
history; impact events retain causal defense reasons for the defeat summary.
AI rooftop pursuit releases delayed steering before landing and follows live
connecting supports across same-height gaps. It holds buffered jumps through
landing recovery and routes around solid clutter on the way to a drop edge,
using ordinary jump, movement, stamina and collision rules. City routing tests cover ascent, descent and restored
pursuit after a support is removed.
Authored fading vehicles and overhead obstacles preserve the fitted combat
camera instead of retracting it as they cross the view. Static supporting floors
and opaque solids retain near-plane collision protection. Camera obstruction
does not rotate the players' screen-relative movement basis.
Remote districts do not count against the local support-planning budget. At levels
7–9, an impact wall on the direct route is considered against the walking detour:
the AI opens it only when a legal, affordable strike plus traversal is quicker.
It uses ordinary attack input, reach, stamina and the wall's authored break rule.
Grab techs observe the actual grapple window through the normal difficulty delay.
The current six-frame window matches parry and surface recovery; slower reactions
can miss it. No AI-only tech window or guaranteed delayed break is added. Grabs
have nine interruptible startup frames before contact, deal 6.5 damage, and use
analog release direction/strength up to 7.56 m/s. Neutral releases upward at
3.6 m/s; directional throws add 1.8 m/s upward. Defender DI changes the trajectory.
Grab hitstun is 69 frames; thrown objects use 28. Jump, dash or grab can tech;
contact counts as frame one. Release follow-through lasts 19 frames and a missed
grab recovers for 20 frames. The six-frame defender tech window is unchanged.
Ordinary walking preserves analog stick magnitude, allowing either controller to
approach a tight corner precisely. Obstacle routing rejects candidate corners
inside other solids and revalidates routes at the current body height.
Pickup measures the visible shaft using authored interaction reach with the same vertical bound,
a wider front cone than grapple, and a near-foot allowance. Only a supporting
surface at the item endpoint is exempt from obstruction; walls remain blocking.
AI pickup presses and the named HUD target share the execution selector. The
selected object receives one screen-space marker, and controller mode retains
the mapped pickup prompt. Held items still throw on the interaction button.
Grab reach includes the target's hurt surface, making ordinary collision spacing
reachable. Intact walls block grabs and pickups. The live prompt distinguishes
holding, incoming grabs, connected grabs and failed attempts. Neutral/Guard
practice presets do not automatically tech; Attempt tech explicitly does.
The approved hidden premise above is design guidance, not completed story content.

Validation routes: `src/combat`, `src/project/3d/combat-interaction`,
`src/project/3d/combat-motion`, `src/project/3d/combat-rollback`, and
`src/project/3d/combat-practice` under this package. Editor coverage lives in
`apps/engine-editor/src/scene3d/combat` and `src/app/editor-capability-parity.test.ts`.
Local browser evidence and the validated canonical-project handoff are in
`.local/touch-of-death/physical-combat/`.

Remaining gaps owned by Touch of Death combat/environment delivery:

- **Retreat:** equal-speed straight sprint still preserves separation in open
  space. The moving-city prototype proves an actual strike through a shorter
  interior route against an exterior loop, and escape against a wrong cutoff
  prediction. It gives up useful routes without punishing legitimate spacing.
  This bounded result does not establish that adaptive refusal is impossible.
- **Local loss practice:** exact local-AI recording is unfinished. AI currently
  supplies separate movement and impact-influence directions after shared
  hitstop; online recordings store one direction through independent input
  channels. Unify those input paths before recording local losses. Existing
  online replay seek/takeover remains supported; automated decisive-exchange
  capture, sharing and reconstructed local attempts are not complete.
- **Weapon balance/physics:** procedural two-hand thrusts and heavy swings now
  wield the visible object; city tools have damage scars and short-lived break
  fragments. Surface sweeps cover live box colliders. Wood/metal currently models
  splitting under harder material contact, without distinguishing a sharp cut
  from a blunt fracture. Grip timing, chip and damage/durability values need
  playtesting. Grapples reject hit-stunned bodies but can follow a later neutral
  recovery; there is no separate air-grab system.
- **Moving city:** a bounded railway-side demolition building now connects
  street, interior and roof. A launched fighter can pass through its cracked east
  wall or the four cracked plaster panels beside the front/back doorways;
  a signalled cutter removes a marked roof section after five seconds of warning.
  Both changes persist until reset, affect collision/recovery, and survive
  rollback and replay. The opened wall reveals concealed observation equipment.
  Individual fragments fall into persistent rubble, the cutter retracts, and
  warning/collapse sounds have separate editable bindings. Weathered worksite
  detail and moving rail-car parts preserve the original collision geometry.
  A cycling freight lift is actual moving support geometry: ordinary jumps board
  it, riders travel between street-accessible height and the roof, and can jump off.
  AI plans paid jumps between static landings and drops toward lower opponents,
  including replanning after support removal; moving/sloped landing planning is
  not included.
  The September 30 arena pass adds a construction–market–depot rooftop circuit,
  covered street routes and fifteen inventory station locations across five
  districts. Seeded module choices, scenery density, compact footprint, hazard
  frequency and generation budgets are editable. Traffic spends less time parked;
  fast vehicles can crash into stopped wrecks with persistent collision and audio.
  Up to four equipment-triggered fire/flood sites provide local interactions.
  This remains a fixed street backbone with bounded variants, not a fully streamed
  city. Pickups beside furniture, broader AI pursuit and natural multi-cluster
  fight flow need further validation. Rubble, cutter and passing train remain
  visual objects; fire spread, vehicle redirection and cross-match damage are absent.
  See the [city authoring and validation notes](../src/presentation/city/README.md).
- **Deferred:** armed grapples and catching projectiles with grab. No intent
  trails, decision quizzes, supernatural lore or artificial retreat penalties.

## Rules that should survive a rewrite

1. **A touch of death is allowed.** Judge whether the opening was earned, the route
   required adaptation, and the defender had comprehensible decisions. Do not
   automatically solve long combos with an arbitrary hit cap. Owner clarification
   (October 18, 2026): reasonable execution and reactions should convert to death
   when the defender does not DI, tech or use armored escape. Investigate sloppy
   conversions from low-commitment stray hits and openers without a punish window
   on miss or defense; lethality by itself is not a balance defect.
2. **Depth comes from circumstances.** Avoid hidden move staling, arbitrary
   repetition penalties, and a compulsory rotation of attacks. Position,
   trajectory, commitment, resources, and surfaces should change what works.
3. **Few inputs should express many intentions.** Direction, Drive, and string
   context alter familiar buttons. More moves must earn their place through a
   distinct tactical purpose, not a longer command dictionary.
4. **The rules must be visible.** Frame advantage means visible recoil outlasts
   the other fighter's recovery. Guard damage, spent resources, impact steering,
   invulnerability, and defensive timing need readable feedback.
5. **Responsiveness outranks realism.** Input buffering, generous plausible
   contact, takeoff assistance, and readable poses are legitimate. Visual motion
   and collision must still agree.
6. **Commitment matters.** Movement cannot freely cancel attacks. Authored special
   interrupts and a limited Heavy windup feint are explicit exceptions. Neither
   permits escaping ordinary hitstun by starting an attack.
7. **AI follows player mechanics.** Its advantage may be observation, prediction,
   reaction, and execution. It must not obtain free stamina, bypass stun, insert
   hits, teleport, or use a separate damage path.
8. **Presentation serves the next decision.** Use layered sound, pose, particles,
   hitstop, and camera response without hiding spacing or the next interaction.
9. **The baseline must be easy to author.** One setup action creates a playable
   editable example; advanced users can tune the same portable data. Ordinary
   editor actions need visible controls and equivalent validated commands.

## What exists today

Back + heavy is a forward kick with armor through startup and active frames.
Light hits still damage it but cause no recoil or knockback; heavy attacks,
including weapon heavy commands and heavy traffic impacts, break that armor.
Recovery is unarmored. Drive + back heavy keeps its existing launcher behavior.
The once-per-round escape retains its stronger armor and is not consumed by the kick.

The delivered local artifact is `.local/touch-of-death/touch-of-death.html`, served
at `http://127.0.0.1:8800` when the managed preview is running. Its canonical editor
project is `.local/touch-of-death/project/.hyperfocus/`. Assets are embedded in the
export. The arena has two horizontal moving decks and two vertical lifts.

Current modes are local AI matches, a random local-AI queue, and Practice.
The title routes through Play, Practice, Your fighter, Rewards and Settings.
Settings > Game settings > Performance exposes persistent VSync, telemetry, and
experimental match controls from both title and pause. Rendering switches cover
scene submission, shadows, outlines, lighting, material maps, culling, resolution,
post-processing, visible effects, HUD, fighters, and scenery. Simulation switches
cover AI, combat, physics, environment updates, traffic contacts, and hazards.
They apply immediately to local matches. Online play, replays, guided practice,
and worker playback suspend experiments. Changing simulation disables saved AI
learning and rewards until reload, even after resetting controls. The separate
instrumented lab retains its worker ownership and pipeline strategy experiments.
Play separates local AI, online play and watching; local match configuration owns
the difficulty and Start match. Practice groups the guide, free practice and easy
AI entry. Random opponent is explicitly labeled levels 3–9;
it selects levels 3 through 8, with a 5% chance of level 9. It does not use the
selected difficulty and is separate from online Quick Play. Existing Quickmatch
save state and seeded queue behavior are preserved.

The title menu's approved desktop placement is a **balanced split**: a large title
on the left with a vertically centered action rail on the right. The owner chose
“A — balanced split” from three rendered alternatives in the convergence-loop
implementation session on 2026-10-03 (local date). This approves placement for
Touch of Death, not every font size, copy line, or other product's menu. Narrow
layouts may stack and short layouts may scroll to preserve access. The executable
preference and generation constraint live with the
[menu convergence consumer](../../../../../apps/engine-editor/scripts/menu-convergence/README.md).

The active navigation and composition grammar now live in the
[game-menu owner](../../../../../docs/design-system/game-menus.md), including the explicit
developer surface (`?tools=1`), current candidate evidence and unresolved taste
questions. The earlier optional convergence recipe is historical tooling.

Private online fights can be saved as local replay files. Watch a replay supports
pause, rewind and takeover of either fighter through the ordinary controls. The
latest confirmed online recording also survives leaving its room for this page
session: Watch a replay can review it directly or save it afterward. Reloading
clears that recent recording; queue and concession rules are unchanged. The
uncontrolled fighter follows its recorded inputs, then becomes idle when they end;
this is an experiment against that response, not a promise of adaptive AI defense.
Replays require matching game content/runtime identity. The demo delivery ledger
also records catalog outfit/name retention: new replays preserve each fighter's
initial look through seek and takeover; legacy files use defaults. Uploaded
pictures are omitted pending replay-specific hide/revocation handling. It
records browser acceptance and the tested cross-runtime determinism boundary.
Runtime version 6 retains version 3's explicit portable combat arithmetic. Chrome and Bun agree
exactly in the physical-contact and full-set fixtures; other browsers and devices
still require acceptance testing.

The export also supports private online first-to-three sets through the local
development relay. Two separate browsers have completed physical-contact rounds,
confirmed results and mutual rematches. This proves the local transport and set
lifecycle, not internet performance or public release readiness. A friend can choose
Watch, join an ongoing fight and catch up from confirmed inputs. Watching never
takes a fighter seat or permits combat/rematch input; leaving keeps the fight going.
The local relay permits six viewers with ten minutes of retained viewing history.
An opt-in same-origin demo host serves the unchanged editor-exported game and
offers guest entry without manually handling server addresses or tokens. The
host persists guest profiles under an expiring browser cookie; per-connection
credentials refresh during connection recovery. Supporting hosts let players
download and activate a private recovery key before joining; importing that file
restores the same identity after cookie loss or expiry and signs out its other
sessions. Without an activated key, cookie loss still loses guest access.
The saved device fighter initializes a new host profile before joining. Existing
host profiles stay unchanged until the player explicitly publishes a replacement;
unsaved wardrobe drafts are never shared automatically.
This local hosting path does not establish public deployment, email recovery or
passkey support. Recovery keys are host-specific bearer credentials, kept outside
authored projects, invitations and replays.
The [portable local host builder](../host/package/README.md)
packages the same host, prebuilt moderator UI and untouched editor export for
running outside the checkout with Bun. An external installation has passed two
guest fighters and physical contact, plus guest identity recovery after restart.
It retains loopback binding and requires a separate writable account database.
Winner stays rooms now add durable queue order, ready checks, capped rotation and
host-judged results on the local service. Members change fighter/viewer roles on
one connection; deliberate rejoin during grace preserves queue intent. Public
hosting remains unqualified; trusted online set rewards are implemented as described
in the progression section below. Live clients now reserve
their seat during a ten-second transport outage and resume the retained input
timeline; page reload and host restart are outside this recovery contract.
Online Quick Play now pairs local service users by stored MMR, compatible content
and measured latency, with mutual acceptance and host-judged durable results.
Four exported browser clients demonstrate isolated fights, persisted ratings and
completed replay download/takeover. This remains development-service acceptance:
public accounts and public-network acceptance are missing. Explicit leave,
duplicate live login and recovery timeout during play now concede through durable
results. An already judged result wins the race; ready cancellation and unfinished
host shutdown stay unrated. First terminal departure in host order resolves a
simultaneous departure once. Hidden fighter tabs get the same ten-second return
window as a connection interruption; longer absence concedes. Lobby members and
viewers keep their connection while hidden. Other terminal client close codes
cannot turn a played match into an unrated host interruption.
Room text chat now includes persistent mute, bilateral communication blocking and
reports that retain host message evidence. Blocking does not change match rules
or evict fighters. Reports are saved locally and visibly unreviewed; operational
moderation remains unfinished. Winner stays rooms now include opt-in voice for
eight people, muted on entry, with explicit microphone/deafen/leave controls and
room mute/block enforcement. Voice follows membership through fighter/spectator
rotation and is excluded from combat recordings. Local browser acceptance uses
synthetic microphones and real WebRTC; public TURN infrastructure, physical audio
device coverage remain unfinished. Supporting hosts accept explicit participant
voice reports with fixed reasons and durable metadata-only receipts. Audio is
never recorded; acknowledgement does not imply human review. Mute/block remain
independent, and an open report survives blocking a previously visible participant.
The free demo wardrobe adds interchangeable tops, trousers, footwear, hair and
faces plus independent palettes on the existing procedural articulated rig.
Entrance and Victory slots offer Respect bow, Salute and Fists up, with explicit
preview controls. Entrance poses use the existing introduction; victory poses
appear for round and match winners, after confirmation online. Get up offers
Stand up by default; Roll up, Kip up and Materialize unlock through the existing
cosmetic collection. These presentation choices never change combat timing or rules.
Your fighter previews choices and saves three named outfits locally. A lobby
action publishes the saved name, icon and choices to the host; approved profiles
persist and appear in room/chat labels and fighter nameplates. Choices affect
render variants, colors and presentation poses only. The evolving procedural art
style is accepted; replacing it with imported characters is not a release requirement.
Replay files preserve catalog
choices, including poses; older recordings without appearance use authored
defaults. Uploaded-image replay appearance remains unresolved; movement/hit styles,
particle variants and player cards are implemented in the seventeen-slot catalog.
Uploaded pictures now have bounded local previews, shared durable
submissions and room gallery controls with block/hide/revocation handling.
An opt-in local moderator screen now previews, approves/rejects images and
resolves durable player reports. Shared unreviewed pictures can be worn as a saved
Top print and as a Profile emblem beside the fighter's name in community,
Quick Play, private fights and shared training. Clothing color tints the print;
the emblem preserves its pixels.
Hide, block, removal and rejection restore the authored appearance and fixed icon.
Community equipment changes require the waiting queue; Quick Play requires its
idle/result phase. Private fights and training allow cosmetic image changes
continuously through Pictures, which warns that combat continues.
Quick Play exposes opponent-image block/unblock during fights and paired
offers/results. This durable content preference also applies to community
communication; it does not prevent matchmaking. Blocking hides immediately,
unblocking waits for host confirmation, and failures allow retry.
Quick Play also exposes Report opponent image during a fight and paired screens.
The chooser lists equipped images without fetching pixels, so local Hide can stay
enabled. Sending requires an explicit image/reason and host acknowledgement.
The fight continues; closing returns controls to the arena. Pair changes,
disconnects and image invalidation discard the old selection. Blocked images
remain inaccessible; reporting never silently unblocks someone.
Private spectators explicitly choose a current fighter before blocking/reporting.
Training swaps preserve image ownership and clear requests from the old attempt.
Cosmetic replay recording and public moderator operations remain unfinished.
The editor Wardrobe inspector and semantic commands author
the same portable catalog used by the export.
Shared training now connects two humans to the same unscored combat rules. Both
must agree within fifteen seconds to reset to authored starting positions or
swap sides; each acceptance replaces the whole attempt and fences old inputs.
Damage, stamina, guard and KO behave normally. A KO remains until agreed reset.
Training recordings preserve mode for playback and takeover. Arbitrary situation
bookmarks and shared drill presets remain unfinished. Live transport recovery
preserves the active attempt; reloading the page does not.
Story is outside the demo scope. See [Combat rollback](../../../docs/combat-rollback.md) and the
[demo delivery evidence](touch-of-death-demo.md) before networking work.

## Accepted demo direction (2026-09-24)

See [demo delivery](touch-of-death-demo.md) for dependency order, implementation
gaps and the evidence required before calling each online journey complete.

The next milestone targets an exciting playable browser demo by September 30,
2026. This expands the earlier local-only scope; it does not claim that online
features below already work. The combat identity and commitment rules remain.
Community participation and personal expression must reward people who lose.
Source availability invites contributions, but delivery must not assume volunteers.

- Freemium is the long-term model. All demo cosmetics are free; pricing comes
  later. Permanent challenges and earnable currency must not expire. The owner
  wants expensive individual purchases and cheaper randomized cosmetic boxes
  (confirmed 2026-09-27). Payment integration remains outside the free demo.
  Daily login bonuses/streaks, reward wheels, achievements and one-at-a-time
  unlocks are accepted progression direction: frequent progress without presenting
  every system at once. Research Rogue Legend's onboarding and engagement loops;
  current reward tuning and reveal order are implemented below and still need
  human pacing acceptance.
- Use one shared rig with curated faces, hair, skin tones, clothing slots and
  palettes. Martial-arts cohesion permits playful accessories. Inspirations for
  expression include OSRS, Tekken, League of Legends, Everskies and Highrise.
- Cosmetics include outfits, cards, icons, particles, intros, victories and
  movement/hit animation variants. Variants must preserve mechanical timing,
  displacement, collision and readable defensive cues; their presentation cannot
  change combat outcomes.
  All remaining categories are in demo scope, confirmed 2026-09-27. Preserve the
  evolving art style while completing expression; an art-style replacement is not
  a prerequisite. Uploaded replay artwork retains its separate unresolved policy.
- Small rooms show fighters, spectators and one active match. King of the hill
  defaults to a configurable streak cap and AFK skipping. Start with a polished
  room screen. Quick Play uses MMR; separate ranked queues follow population
  evidence. Include text and opt-in voice with mute, block and report journeys.
- Both replay takeover and live two-player training are desired demo scope.
  Shared situations should teach actual combat rules, not guaranteed solutions.
  Arbitrary situation bookmarks and shared drill presets are roadmap work.
- Allow uploaded emblems/textures with bounded validation and community controls.
  Submitted images are shared immediately with other players, before moderation
  approval, with hide, block and report controls. Local file previews remain local
  until the player explicitly shares. Unreviewed status must remain truthful;
  moderator rejection removes shared pixels and equipment afterward.
  Supported private fights and shared training carry the same account images.
  Their Pictures controls allow cosmetic changes during play and explicitly warn
  that combat continues; Quick Play retains its equipment commitment window.
  Full community-made clothing and a creator marketplace belong on the roadmap.
- Browser is the acceptance platform, including phones with connected controllers.
  On-screen touch gameplay controls are roadmap work. Preserve portable authored
  data and export paths; supported phone/browser/controller combinations still
  require real-device validation. Native platforms require separate acceptance.

Implementation order: prove a reliable two-client physical match and recovery;
then room/spectator rotation and Quick Play; then integrated profile/wardrobe and
social journeys; then replay takeover and shared training; finally complete
release journeys and performance/export checks. Authoring and content work can
proceed alongside networking. This is dependency order, not permission to drop
accepted features silently when the deadline approaches.

Engine owns portable simulation, replay/checkpoint contracts and appearance
composition. The game owns combat policy, room rotation and player screens.
Host services own identity, ratings, room discovery, trusted results, uploads
and voice transport. Editor views author and validate outfits, compatible
animation variants, scenarios, match rules and network-condition previews;
ordinary mutations require matching validated editor commands. Live moderation
and service operations are not creative-editor responsibilities.

Release evidence must cover an invited newcomer joining, customizing, fighting,
spectating, rotating, reconnecting, practicing a real exchange and returning
with their profile intact. Simulated tests alone cannot certify network quality,
enjoyment or every export platform. Railway hosting, Clerk OAuth, randomized boxes
and phone browsers with controllers are selected below; deployment, integration
and device qualification remain delivery work. Local recovery keys are implemented.
Immediate upload sharing with hide/report is the accepted policy, not an open decision.

### Hosting, accounts, replay cost and connection quality (2026-09-27)

The owner will host on Railway using the supplied
[project/database service](https://railway.com/project/744f4c37-f27a-4aae-9a25-2fd871ce3a46/service/bf214f94-f917-4b75-bdbe-0fdea64187d0/database?environmentId=f8999666-1835-4441-bf1a-940a1d22c671).
Use Clerk OAuth for public accounts and PostgreSQL for all durable hosted data.
The Railway project contains PostgreSQL 18 and a separate game service. Local runs
without `DATABASE_URL` retain SQLite and guest-key flows; existing local accounts
are not automatically imported into the hosted database. Configuration uses
`PUBLIC_CLERK_PUBLISHABLE_KEY` client-side and `CLERK_SECRET_KEY` server-side;
credential values belong outside repository docs and game exports.

For old replays, prefer the simplest, cheapest existing compatibility model:
require matching content/runtime identity, reject mismatches clearly, and use a
matching retained export when available. Do not build migration, a hosted build
archive or cross-version playback for this milestone. Indefinite old-build
availability is not promised. This resolves the implementation direction for
compatibility, not the separate uploaded-artwork policy.

The initial connection-quality thresholds selected on 2026-09-27 were:

- p95 rollback exceeds 3 frames; or
- p95 packet loss exceeds 1%; or
- p95 ping exceeds 200 ms **and** p95 rollback exceeds 2 frames; or
- repeated stalls or severe visual corrections occur.

The owner subsequently clarified that late inputs and missed acknowledgements
are degradation proxies, not packet-loss equivalents or unilateral ranked
evidence. They support warnings and recovery; automatic no-contest needs bilateral
or server-observed corroboration. Attributed losses (including awarding a would-be
draw to the solid connection) require trusted relay telemetry and are not enabled
from these proxies.

The current host implements independent connection-bound probes and accepted-input
debt with a rolling one-second p95 window, sampled every 250 ms. Ten continuous
seconds of unilateral degradation warns; both peers degrading for that interval
produces an unrated no-contest. Host pauses/recovery reset evidence. It does not
measure physical packet loss or rendered correction severity. See the
[host quality policy](../host/quick-play/README.md) for
exact metrics, thresholds and durable outcomes. Existing terminal disconnect
concessions remain separate from quality warnings and no-contests.

### Implemented progression and public host support (2026-09-27)

Rewards now provides persisted daily bonuses/streaks, a free daily wheel,
randomized cosmetic collection boxes and permanent achievements. Earned milestones
and affordable cosmetics lead; optional daily activities do not gate them.
Completed local AI sets earn device rewards; trusted Quick Play
and winner-stays results earn account rewards for both participants. Account
currency never imports local save data. Collection items equip through the saved
wardrobe. Locked styles can be previewed without changing the saved fighter; the
[cosmetic contract](touch-of-death-cosmetics.md) owns starter and unlock policy. See
[reward tuning and persistence](../host/progression/README.md).

The wardrobe now includes movement style, hit reaction, particles and player-card
style alongside existing outfits, icons, intros and victories. Presentation uses
the evolving procedural rig and preserves combat outcomes. Canonical setup and
editor catalog controls author the same portable choices.

The October 18 mastery candidate adds exact cosmetic goals and coordinated looks
under the contracts above. Successful defense captions name observed parry, tech,
armor-charge and launch-steering outcomes; tech uses surface corner marks, parry
uses a radial burst, and armor retains its gold facets. The controls reference
explains these shapes. DI confirmation is not a promise that pressure ended.
Combat damage, timing and lethal conversion rules are unchanged.

Private results keep Rematch first, add explicit replay sharing and a leave-and-
retry route, and show recent rivalry scores saved on this device. History is
bounded to the last 128 sets across rivals and counts confirmed results once,
using host instance, room, player identities and set index to scope receipts.
It grants no rank or currency. [Replay archives](../src/replay/README.md) own
bookmark, sharing, expiration and compatibility limits.

The host supports Clerk-verified OAuth admission when configured and retains guest
admission for unconfigured local hosts. The portable package supplies a Railway
Dockerfile, database-backed readiness route and single-replica PostgreSQL setup.
Live rooms and matchmaking still require one game replica. Clerk provider/domain
setup and real phone/controller acceptance require separate evidence. See
[Railway packaging and live status](../host/package/README.md#railway).

### Progression research: Rogue Legend (2026-09-27)

The referenced game is treated as PocketHaven's **Rogue Legend - Roguelike RPG**
(the owner wrote "Rouge Legend"). Its
[publisher listing](https://play.google.com/store/apps/details?hl=en-US&id=com.pockethaven.roguelegend)
describes a lobby-to-run loop, a three-choice upgrade after fights, and persistent
gear, talents, pets, heroes and mounts. It lists ads and random-item purchases;
its release notes adjust frustrating event streaks and progression difficulty.
This supports studying small repeated choices and layered progression, but does
not establish its exact first-session unlock sequence or retention effectiveness.

A [community starter guide](https://www.reddit.com/r/RogueLegendRPG/comments/1srvlbj/rogue_legend_staring_guide_tips/)
reports chapter-gated modes, summon-level rarity unlocks, daily arena currency,
task-funded event spins and recurring spending milestones. These are player
reports, not independently played or publisher-verified onboarding observations.
The [game site](https://roguelegend.io/) search result exposes Daily Rewards, but
the fetched page did not expose enough content to verify streak rules. Exact
achievement behavior and the order/timing of early unlocks remain unverified.

Touch of Death's accepted direction is strong mobile-style engagement through
daily login bonuses/streaks, reward wheels, achievements, randomized cosmetic
boxes and one-at-a-time feature/reward reveals. The design inference is to teach
one action, award a visible unlock, then introduce the next system, with frequent
progress even after losses. That sequence is a proposal, not a measured Rogue
Legend funnel. Preserve permanent challenges and non-expiring earned currency;
the implemented streak resets its bonus after a missed day without removing earned
currency or achievements. Research is not measured retention evidence.

## How to play

These are default bindings. Settings offer ten controller layouts, individual
rebinding, device-specific Drive toggles, and Master/SFX/Music volume controls.
Browser-local preferences are separate from authored project defaults.

| Action | Keyboard | DualSense |
| --- | --- | --- |
| Move, aim, impact steering | WASD | Left stick |
| Strike | J | Square |
| Heavy | K | Triangle |
| Drive modifier | H | R2 |
| Drive flurry | H + J | R2 + Square |
| Drive swinging attack | H + K | R2 + Triangle |
| Guard / fresh-press parry | L | L1 |
| Jump; hold for height | Space | Cross |
| Step / chase; hold sprint; airborne dash | Q | Circle |
| Evade | Left Shift | L3 |
| Armored escape | I | L2 |
| Feint | X | R1 |
| Dedicated tech | E | Cross at collision |
| Lock-on | F | R3 |
| Fast parry follow-up | O | D-pad up |
| Parry sidestep | Z | D-pad left |
| Parry evasive attack | C | D-pad right |
| Grab / pick up / throw held object | G | D-pad down |
| Practice reset | R | Create |
| Pause | Escape | Options |
| Skip intro | Enter | Options |
| Practice navigation | Visible controls | Touchpad |

Menus use visible vertical action siblings, horizontal difficulty siblings,
stick/D-pad navigation, Cross confirmation and Circle Back by default. Open
panels own focus; Back returns to their launcher. Touchpad enters/exits Practice
UI navigation without leaking menu presses into combat. Right stick,
PS, and mute have no default gameplay assignment. Browser gamepad
support is not a claim of tested adaptive triggers or native PS5 integration.

### Movement

Jump starts immediately in any direction. Holding Jump adds height for up to
30 frames. Early release shortens the ascent smoothly: the current one-frame tap
rises about 0.58 m, while the full hold rises about 5.18 m at the authored fighter
gravity. AI route jumps hold the same input through the same saved budget.
Movement has a separate button: tap Q / Circle to step immediately,
or hold it past 15 frames to sprint. Sprint momentum carries into jumping, and
release decelerates rather than deleting velocity. Older authored projects can
retain the combined gesture by leaving `separateJump` disabled.

When sprint exhausts stamina, movement falls back to walking and stamina recovers
even if the movement button remains held. Release it before another paid sprint;
recovery cannot alternate free walking and sprint bursts. This gesture state is
saved and applies equally to AI. Rejected jump/dash costs also permit ordinary
ground or air recovery without granting the unaffordable action.

A Drive tap shorter than 250 ms requests a jump even when direction is held or
the tap also selected a Drive attack. It does not cancel the attack: a committed
attack finishes before a legal queued jump. Hitstun clears that queue.

In the air, a fresh Q / Circle press starts an immediate air dash. Jump spends
the additional air jump when available. Normal stamina, commitment, and
per-airtime allowances apply. Landing restores air allowances; an actual paid
wall run also restores the air dash. Merely brushing a wall does not. Hold toward
a wall while falling in an available state to wall-slide. Wall slide is not a
hitstun escape.

A deliberate forward chase near an airborne stunned opponent assists takeoff
and initial approach. Follow-ups require aiming; the chase is not continuous
homing. Landing briefly commits movement/offense while guard remains available.

### Offense

Move selection uses direction relative to fighter facing after camera-relative
movement input is resolved. Stick deadzone selects neutral; outside it, the two
180-degree hemispheres select toward or away. There is no side attack bucket.
Camera-forward is not invariably the toward attack.

| Family | Main question it answers | Cost or risk |
| --- | --- | --- |
| Neutral Strike | Can I check movement or start pressure? | Modest range and reward |
| Toward Strike | Can I close space while attacking? | Commitment into the opponent |
| Away Strike | Can I reposition or redirect? | Retreating reach and trajectory |
| Heavy | Have I earned a launch or large punish? | Visible startup and recovery |
| Toward Heavy | Can I cash out before another escape opportunity? | Committed horizontal conversion |
| Away Heavy | Can I intercept an airborne approach? | Requires a useful angle and timing |
| Drive + Strike | Is spending more stamina on tracking/flurry worthwhile? | Repeated parryable rhythm and recovery |
| Drive + Heavy | Can I commit to a broad launching / anti-air swing? | Higher cost and larger commitment |
| Heavy windup Feint | Can I provoke an early defensive commitment? | Gives up the attack and pays stamina |

Strike, linked Strike, then Heavy is an authored string. String links are timed
cancel opportunities, not permission to cancel any frame. Flurry alternates four
strikes; the defender can release/repress guard to parry the rhythm. Its stamina
refund is paid once per move, not once for every strike. Tracking is bounded
startup turning, not a guaranteed hit or late teleport.

The current four-hit Drive flurry deals 16 damage, or 19.2 for its linked version,
and costs 30 stamina with a twelve-point contact refund. Its hit-only routes remain
available, while ordinary Strikes retain their damage. A landed armored escape
also opens linked Strike and Heavy routes with eight frames of recovery. Hits
absorbed by armor confirm the attacker's routes without interrupting the defender.

City movement uses run speed 6.916 and sprint speed 11.232, with acceleration
scale 0.76. Dashes start at 14.364, last ten frames, and finish at 57.0025% of
their starting speed before stamina
scaling. A dash costs 10.8 stamina, jumping and wall jumping cost 12.6, wall running
costs 0.54 per frame, and sprinting costs 1.12 per frame before normal regeneration.
The forward dive travels at 12.6, or 10.8 from a dash. Failed tech retries lock out
for twelve frames. Low-energy missed techs rebound in proportion to impact speed
instead of receiving the same minimum bounce as stronger falls.

Ground and air dashes can cancel into the following attacks. Direction is sampled
when the attack is pressed, not when the dash starts. A directionless dash travels
forward; releasing the stick before attacking selects a neutral dash attack.
Dash travel blends into the authored attack motion. Simultaneous dash and attack
pay for the real dash first, then execute the buffered attack on the next tick.
The dash attack opportunity lasts six fixed ticks after the dash cue ends; it is
saved with movement state and consumed by an attack or removed by hitstun.
Recovery cannot be canceled by an unlinked Special. Only authored link/feint
windows and the once-per-round armored escape grant their stated exceptions.
Surface tech can be armed during hitstun, never during an attacking animation.

`movement.autoStepHeight` enables grounded traversal over low static box risers
(default zero/off; the city uses 1.05). `autoStepSpeedScale` sets the brief speed
penalty (city 0.85 for six ticks). The full body needs clearance above and through
the lift; tall walls, ceilings, rotated support boxes and unsupported airborne approaches do
not gain an automatic climb. A real static contact below a sphere center also
qualifies, so short stair corners cannot trap walking fighters in upward collision.
Both fighter controls use the same saved state and
collision queries. Regressions live in `combat-motion/auto-step.test.ts`,
`combat-motion/dash-attacks.test.ts` and `combat/action-state.test.ts`.

| Attack | Toward | Away | Neutral |
| --- | --- | --- | --- |
| Strike | Jolt blow with mild tracking | Long retreating jab | Stopping straight |
| Heavy | Slow liver punch, long stun, low knockback | Reel back into an armored forward punch | Rising uppercut |
| Drive + Strike | Fast gazelle punch | Broad retreating hook | Two body blows |
| Drive + Heavy | Forward dive; hold Heavy to accelerate in flight | Fast back hop; release and press Drive again for the anti-air wheel kick | Rising knee |

The back hop ends without a wheel kick unless Drive is pressed again during its
follow-up window. Holding the original press does not trigger it. Weapons retain
these timing, travel and combo roles through authored equivalents; tool thrusts
and swings replace bare limb contact. Heavy variants wear the held item more,
and its current shortened length determines reach. Every variant remains editable
in the combat inspector and uses the same input rules for humans and AI.

An improvised conversion should repeatedly ask: chase upward, redirect sideways,
or cash out now? Read the opponent's impact steering, remaining escape resource,
nearby surfaces, and your own position after almost every hit. Repeating a route
may still work if the situation actually remains suitable.

### Defense

Hold Guard to block attacks from the appropriate facing. Blocking causes light
recoil, significant nonlethal chip, and guard damage. A fresh legal guard input
takes priority over older queued offense; it does not cancel a committed attack.

Parry uses the same button: release and press near impact. It remains available
through block recoil, including between predictable flurry strikes. Do not add a
hidden rule that blockstun prevents fresh-press parrying. Attacking and unblocked
hitstun still prevent ordinary parry. Success creates attacker recoil, pushback,
stamina recovery, guard repair, and follow-up opportunities.

Holding Guard through countdown or an unavailable defensive state may begin
blocking when legal, but cannot manufacture a fresh parry window. Release and
press again for that window. Player and AI inputs obey the same rule. Likewise,
holding an attack through the online countdown does not attack automatically on Go;
short Drive taps during countdown do not queue a delayed jump.

Guard integrity recovers only through successful parries until it breaks. A
break disables guarding for ten seconds; the visibly rebuilding shield then
returns to full. Both fighters show shield condition and their escape-charge pip.

While being hit, hold a direction for the next impact. Directional influence
changes the resulting launch direction at that impact, preserving the impulse's
speed. It is not continuous steering or a way to erase knockback by holding back.

At a qualifying ground or wall collision during hitstun, a timed tech replaces
the bounce with a brief protected directional recovery and ends the true combo.
The attacker may predict the exit and pressure afterward. The one-per-round
armored escape is another costly decision: a committed armored swing rather than
an unconditional instant reset.

### Learning and round flow

Start by moving, guarding, and deliberately whiffing a Heavy to see its recovery.
Then practice a fresh-press parry, launch/chase, and one aimed follow-up. Practice
offers neutral, outward, sideways, tech, escape, guard, and random defender
presets, instant reset, and Learn parry / Learn tech / Learn combos drills.
Free Practice shows a short movement, strike, launcher and guard prompt using
current bindings. Guided lessons come first in the Practice choices, ahead of
defender presets and the advanced control reference.
Optional frame timing, input history, hit volumes, and last-attempt diagnostics
belong in Practice. Normal matches remain free of combat subtitles and timing text.

Selected parry, tech, and combo lessons keep their next action visible when
Practice settings close. Prompts use the current keyboard/controller bindings.
Explicitly closing the controls disclosure returns keyboard focus to the arena;
open controls retain native keyboard interaction. Upward follow-up coaching says
to release direction before pressing Jump, then aim: direction plus airborne Jump
requests an air dash instead. This guidance does not restrict valid repeated moves.
Defensive lesson results distinguish early, late, on-time, and unavailable presses;
the last result survives a drill reset and clears when selecting another lesson.
Retained results are labeled as the last attempt, not a current opening. Tech
and parry drills also report recorded press-to-contact intervals or absence of a
recorded press when precise timing feedback is unavailable. Rejected-input
explanations take precedence; this does not broaden timing windows or colored cues.
Tech prompts list the available bound controls. Combo branches measure sideways drift
relative to the fighter, not an arena axis, and accept a fresh repeated move when
its actual contact still meets the requested response.

Matches are first to three round wins, best of five. An intro can be skipped;
the opening three-second countdown transitions into the playing camera. A lethal
strike keeps its impact pause, followed by three live seconds to attack the
ragdolled opponent. Contact pauses do not consume that window. Between rounds,
a further three-second interlude shows the defeated fighter's local get-up and
particles. If standing clearance needs local separation, the baseline get-up rolls
along a supported, unobstructed route over the full recovery window, easing to rest
instead of snapping sideways. The standing opponent stays in place and turns smoothly
toward the recovered fighter, ending at the next round's facing. Only the match winner celebrates, blending from the finishing pose
over half a second; the terminal loser stays fallen. New attacks stop during this interlude, while
city machinery and loose objects continue. Both fighters refill health, stamina,
guard and escape. Positions, broken surfaces, weapon wear and world clocks persist;
there is no new countdown or arena reset. A completed match opens its result.
New matches cycle through five authored starting courts and restore the arena.
Rematch retains the AI level; Next opponent rerolls Quickmatch.

Falling below the stage is an immediate knockout, including in headless training.
The fixed boundary is four world units below the lowest initial static or
kinematic collider bottom or authored spawn height. Underground rooms and roof
travel remain playable; removed platforms and falling debris do not lower this
boundary. Fallout ignores guard, armor and protection, records an explicit
environment cause, and grants no attack damage credit to the opponent. If both
fighters cross it on the same tick, the round is a draw. A fallen loser returns
to its authored starting pose for the next round; ordinary supported knockouts
keep their existing local get-up behavior.
The archived built-baseline comparison in
`.local/touch-of-death/fallout-baseline.json` starts a fighter at `y=-20`: the old
runtime remains fighting at full health through 1,000 ticks (`y=-1383.86`), while
the corrected runtime knocks the fighter out on the first tick, awards the round,
and resumes the next round safely by tick 362. This reproduces the missing fallout
rule; it does not reproduce the original clipping event.

### Open collision investigation

- **Owner: combat physics.** The September 30, 2026 server-training report
  describes fighters clipping through the stage. The supplied training export
  does not include physical checkpoints or collision contact histories, so it
  cannot establish a particular tunneling cause. Existing deterministic CCD
  regressions in `src/physics/rigid-ccd-resting.test.ts` cover thin floors,
  high-speed impacts, diagonal wall hits, and a falling fighter pushing another
  fighter through a third collider; all pass with the current implementation.
  Capture a failing seed plus the last valid world/physics checkpoint, shapes,
  masks, velocities and contact normals before modifying collision. Preserve
  that reproduction in a regression and close this item when the actual failure
  is fixed. Fallout bounds the consequence while this investigation remains open.

## Visual and audio language

The [Art Constitution](touch-of-death-art-constitution.md) owns the bounded golden-slice
direction, accepted silhouette/composition locks and evidence requirements. The
[visual diagnosis (temporary; prune after findings are promoted)](../../../../../.local/touch-of-death/reports/art-diagnosis.tmp.md) distinguishes current defects
from legacy captures; candidate selection is not final asset approval.

- Yellow rings mean early, red means late, white means on time. Parry feedback
  belongs at the hands; tech feedback belongs at the actual collision surface.
  A gray unavailable mark must not masquerade as a timing failure.
- Guard is a sustained protective posture/shield; parry is a short, distinct
  successful interception. Fractures communicate guard depletion before break.
- Health and stamina appear above both fighters, with defensive resources nearby.
- Startup silhouettes, active motion, contact volumes, and impact positions must
  agree. Directional attacks need genuinely distinct readable poses.
- Hit, block, parry, whiff, counterhit, launch, and death have different feedback
  weight. Stronger feedback is not automatically extra damage or stun.
- Dust originates at feet or landing contact; impact particles follow force.
  Circles and short trails should clarify trajectories instead of covering them.
- Camera spacing and height keep both fighters legible. Occluding scenery fades
  while retaining the translucent physical surface and its shadows. Legacy box
  edge cages stay hidden: their foreground lines crossed the fighters as bright
  bands at ankle height. Intro/countdown motion must
  transition smoothly into play, not snap to a different framing model.
- Low-health red blotches, transparency, vignette, motion blur, bloom, zoom, and
  shake support urgency. Preserve reduced-motion options and the next decision.
- Audio distinguishes footsteps, sprinting, landing, swings, hits, blocks, parries,
  techs, and voices. Critical combat cues must remain audible over music.

## Current timing and economy reference

Combat uses fixed 60 Hz simulation frames. Hitstop freezes simulation progression,
so frame counts and wall-clock ticks are different. Numbers below describe the
current preset/project, not immutable balance requirements.

| Setting | Current value |
| --- | --- |
| Health / stamina / guard | 100 each |
| Ground / idle / airborne / hitstun stamina recovery | 36.45 / 45.5625 / 12.15 / 24.3 per simulated second |
| Stamina on successful parry | 6 |
| Guard repair on successful parry | 25% of maximum |
| Parry window / attacker recoil / follow-up permission | 6 / 20 / 24 frames |
| Tech window / lockout / protection | 6 / 12 / 12 frames |
| Input buffer / command history window | 10 / 20 frames |
| Guard break | 600 frames |
| Landing recovery | 5 frames |
| Neutral Strike startup / active / recovery | 14 / 3 / 16 frames |
| Neutral Heavy startup / active / recovery | 28 / 3 / 47 frames |
| Neutral Strike / Heavy / escape recovery on hit | 8 / 12 / 8 frames |
| Base Strike cost / contact refund | 9 / 6 |
| Base Heavy cost / contact refund | 20 / 12 |
| Drive flurry cost / once-per-move refund | 30 / 12 |
| Drive Heavy cost / refund | 28 / 18 |
| Drive flurry | Four strikes, 4 damage each before contextual changes |
| Sprint drain / jump cost | 67.2 per simulated second / 12.6 |
| Jump speed / fighter gravity scale | 11.615 / 1.9 |
| Jump hold / held gravity fraction / early-release speed fraction | 30 frames / 0.62 / 0.327 |
| Run / sprint speed | 7.28 / 12.48 |
| Dash speed / end-speed ratio / coasting deceleration | 15.96 / 0.5905 / 19.8 |
| Dash duration / stamina cost | 10 frames / 10.8 |
| Wall run drain / wall jump cost | 32.4 per simulated second / 12.6 |
| Dash attack grace after visual travel ends | 6 frames |
| Auto-step maximum rise / temporary speed fraction | 1.05 m / 0.85 |
| Extra air jumps / wall-slide descent cap | 1 / 3 |

The September 29 impact pass adds 30% attack recovery, rounded upward to whole
frames. Per-hit damage from 5 to 30 maps linearly from 20% more hitstun to 5% less
and from 25% less base launch to unchanged launch, with stun rounded to whole
frames. Finished authored values live in `combat/tuning/balance.ts`. Grounded
stun and vertical/downward launch receive the same weighting. DI strength is .495,
10% below .55. Standing/dash dives wind up for 30/10 frames, six more than before,
and held speed gain is .68 instead of .8. Both wheel variants make one 22-damage
contact with a narrow sweep and a bounded lean, replacing four repeated contacts.
Relative velocity along the line between fighters changes landed-hit damage,
stun and full launch by 1% per metre/second, capped at ±10%. Closing increases
impact; separating reduces it. Shared or perpendicular motion leaves it unchanged.
Blocks and parries retain their authored response. Physics hosts supply velocity
on the current pose; omitted velocity is stationary and does not persist stale motion.
Explicit authored links and feints remain legal; an absent cancel list no longer
implicitly permits a special. Idle recovery requires grounded neutral with no
movement, action, guard or stun.
It is 25% above the reduced ground rate. Voluntary horizontal speed and
acceleration scale linearly from 100% at full stamina to 80% at empty stamina.
Ground acceleration uses 80% target response per frame (the old baseline snapped
to target velocity); airborne steering also receives that reduction once.
Deceleration, attack travel, knockback and vertical jumps keep their existing rules.
Below 45% stamina, neutral posture gradually hunches and lowers its hands. Grayscale
retains its critical intensity at 25% and below, easing to 20% less intensity by
35%; blur is unchanged. These settings need human feel validation.

Contact refunds reward engagement on hit or block; parries do not reward the
attacker. Low stamina slows movement; attack startup remains explicitly authored,
not secretly stretched by exhaustion. Lower airborne regeneration and paid
mobility discourage endless disengagement without prohibiting tactical retreat.

Hitstop is 4 ticks for blocks and light hits, 14 for heavy/launch/counterhits,
17 for parries or guard breaks, and 19 for lethal hits. Simultaneous events use
the strongest duration, not a sum. Both fighters, AI, movement, and physics pause.
Inputs are still sampled. New live intent takes precedence over stale queued
intent. Counterhit alone does not add automatic damage or hitstun.

## How the implementation is divided

The architectural reason for separating these layers is to keep rules portable,
AI honest, editor data editable, and Play/export behavior consistent.

| Owner | Responsibility |
| --- | --- |
| `packages/engine/src/combat/` | Portable rules, move selection, phases, resources, hit/block/parry resolution, input history, snapshots |
| `combat/touch-of-death.ts` | Expanded preset and authored move/cancel definitions |
| `combat/config.ts`, `read.ts` | Types, validation, and portable parsing |
| `combat/simulation.ts`, `step.ts`, `input.ts` | Fixed-step state changes, permissions, tracking, direction and impact influence |
| `packages/engine/src/project/3d/combat-gameplay.ts` | Joins inputs, combat, world poses/contacts, AI, Practice, effects, and saves |
| `project/3d/combat-motion.ts` | Paid movement, air resources, wall slide, landing, chase |
| `project/3d/combat-hitstop.ts` | Shared freeze and buffered input edges |
| `project/3d/combat-ai.ts` | AI input policy over the same gameplay rules |
| `project/3d/combat-match/index.ts` | Intro, countdown, rounds, results, seeded Quickmatch |
| `project/3d/combat-practice/` | Defender policies, lessons, seeded random defense, surface decisions |
| `project/3d/combat-visuals/`, `combat-knockout/`, audio modules | Poses, effects, camera, occlusion, ragdolls, sound |
| `project/3d/combat-declaration.ts` | Portable combat/fighter/movement/match/audio project declarations |
| `apps/engine-editor/src/scene3d/combat/` | Setup, editable inspector controls, authoring commands |
| `scene3d/input/`, `scene3d/fight-hud/` | Device mapping, Drive tap interpretation, host settings, Practice UI |
| `apps/engine-editor/headless-editor.ts` | DOM-free project inspection and command plans |

Conceptually: device inputs become semantic commands; permission checks and
fixed-step combat resolve actions; movement and rigid physics provide poses and
contacts; resolved events drive presentation and match state. Input permissions
must have one authoritative path regardless of whether a human, AI, or Practice
policy supplied the input. Presentation must not secretly determine damage.

Level 9 reacts to observable startup without the policy delay used by lower levels.
No level receives pending opponent button presses. Grab-tech recovery lasts twelve
frames for both fighters; the same five-frame input buffer accepts fresh commands
during recovery for human and AI inputs.
Lower difficulty reduces reaction and judgment; level 5 and below increasingly
chooses bad options. Current AI is an expert-policy target, not proof of an
optimal solver. It forecasts authored gravity and velocity, checks affordability,
and must obey exactly the same stun, recovery, collision, and resource constraints.

AI observes imminent contact with live arena boxes over at most twelve frames,
including raised decks, rotated walls and linearly moving surfaces. Reaction delay
still applies before its ordinary tech press; a prediction is not a guaranteed
escape. A queued tech is retained while that surface remains imminent instead of
also spending armored escape. Other collider shapes retain actual-contact fallback.

Engine packages remain framework-agnostic: no DOM, Solid, React, StyleX, or browser
preferences. Hosts own device APIs, visible UI, audio adapters, and persistence.
Do not move a local browser preference into the portable combat simulation.

## Editing the actual game safely

There are three separate things to keep aligned:

1. Source presets establish defaults for new setups.
2. The existing editor project contains its own authored rules and assets.
3. Exported HTML contains the selected project and the runtime built at export time.

Changing a preset does not automatically migrate an existing project. The preset
hurt radius is 0.6, while this authored arena uses 1; such differences are not
automatically corruption. Inspect the actual project before choosing what to edit.

Use the `hyperfocus-editor-agent` skill and validated editor commands for project
mutations. Do not hand-edit `project.json` or `assets.hfp`. `scene3d.setup-combat`,
`scene3d.set-fighter`, and `scene3d.set-combat` share data validation and undo with
the visible editor. Preserve unrelated assets and use project-hash preconditions.
Changing move startup may also require changing cancel windows.

For a new configurable rule, cover types, defaults, parser, validation, simulation,
capture/restore, visible inspector, command parity, and tests. Backward-compatible
optional fields should have deliberate legacy defaults. Keep the easy setup path
complete; JSON editing must not become the ordinary user's only path.

Build the runtime before exporting. A project saved with new values can still be
exported with an older embedded runtime if the editor build has not completed.
Wait for successful build output, export through a fresh host, and bind verification
to the exported artifact hash. Do not patch generated HTML as the source of truth.

Use the `dev-server` skill for server lifecycle and runtime logs. Reuse managed
servers; retain ownership and cleanup for headless automation. Do not kill shared
servers or unrelated dirty-tree work. Local project evidence is indexed from
`.local/touch-of-death/README.tmp.md`; historical reports describe their tested build,
not necessarily the current artifact.

## Evidence required for changes

Choose tests based on the behavior changed, rather than rerunning every audit.

| Change | Important evidence |
| --- | --- |
| Guard, parry, tech, escape | Legal and illegal states, timing edges, blockstun re-press, resource use, clear feedback |
| Inputs or hitstop | Press/release during freeze, fresh intent over stale buffers, no accidental repeat, actual browser gesture |
| Movement | Ground/air distinction, momentum, landing rearm, wall contact, no stun bypass, surfaces and boundaries |
| Moves or combo routes | Real contact, startup/active/recovery, cost/refund, visual volume agreement, adaptive success and fixed-route failure |
| AI | Same permissions as player, legal affordability, gravity-aware forecast, no fabricated hits |
| Practice | Completion from ordinary inputs and contacts, reset behavior, seeded replay |
| Project fields | Parser/validator round trip, save/restore, visible controls and command parity |
| Camera/effects | Both fighters readable during contact, platforms, countdown, low health, and reduced motion |

Relevant test owners are `packages/engine/src/combat`, the nearby
`packages/engine/src/project/3d/combat-*` tests, and
`apps/engine-editor/src/scene3d/combat`, `input`, and `fight-hud` tests.
Run browser-conditioned editor tests from the repository root so its preload is
active. Engine build runs from `packages/engine`; editor typecheck runs from
`apps/engine-editor`. Use `bun.cmd` when PowerShell blocks `bun.ps1`.

Meaningful combo evidence uses public inputs and real physical contacts. A
fixture may explicitly seed a rare starting state, but injected damage, free
resources, or forced stun is not proof that a player can execute a route.
Schedule deterministic sequences by combat frame; hitstop changes wall time.
Test actual device/host gestures as well as semantic inputs, especially Drive tap.

Save/restore must retain every gameplay-affecting timer, input edge, AI queue,
random state, and movement allowance. Validate before mutating the world. Ordinary
portable saves are not equivalent to complete rigid-physics rollback checkpoints.
Rollback must register all mutable simulation owners, manage replayed effects,
and handle desync/recovery. Deterministic intent does not prove cross-platform
floating-point physics equivalence.

Simulated audits, screenshots, and regression tests establish specific evidence.
They do not establish that fifty humans played, that an FGC professional enjoyed
an hour, or that balance is solved. Report those limitations plainly.

## A decision checklist for future agents

Before changing a mechanic, state the failed player interaction and its
reproduction. Then ask:

- What new decision does this create for each player?
- Can they understand the cause through posture, motion, resources, sound, or contact?
- Does the response exist through the same systems for human and AI?
- Does the change preserve committed openings and adaptive full-kill routes?
- Does it improve novice control without removing deliberate expert choices?
- Does it solve an observed problem with less machinery than the alternatives?
- Can a user author it visibly, save it, reload it, and export the same behavior?
- What counterexample would show that the change failed?

Prefer the smallest change that answers these questions. Add a new move when it
answers a missing tactical question. Add a new resource only when an existing
resource cannot express the tradeoff. Expand story, progression, and networking
after the basic empty-room fight is readable, responsive, and worth repeating.
