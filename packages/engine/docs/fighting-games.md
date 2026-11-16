# Fighting games

For Touch of Death's player promise, controls, accepted design decisions, and
contributor decision rules, read the [game and agent guide](../examples/touch-of-death/docs/touch-of-death.md).

The engine supplies editable combat rules, physics checkpoints, collision queries,
authored roaming routes, and progression records. The editor's local practice path
uses the same portable combat simulation in Play and Build. A finished fighter
still owns character animation, story content, encounter design, networking
transport, and a trusted progression service.

## Start in the editor

1. Create a **3D Action** project and select a character in the 3D scene.
2. Use **Set up Touch of Death** in the Combat inspector for a stylized arena,
   two editable fighters, and the rules below. **Set up practice fight** creates a smaller
   player/opponent practice setup. Existing objects can also become fighters with
   **Make fighter**. There is one local player; other fighters use **Training dummy**
   or **Sparring opponent** control.
3. Press **Play**. Move into reach, use J for jab, K for heavy, hold L to guard, and
   R to restart Practice. Health and stamina appear above fighters; detailed move
   diagnostics are optional in Practice. The basic sparring fixture periodically
   jabs; Touch of Death match opponents use the separate difficulty-based AI policy.
4. Expand **Move timing and advanced rules**, then choose **Move to edit** to tune startup, active and recovery
   frames, damage, stun, reach, directional/Drive selectors, and follow-up windows. Times are
   simulation frames at 60 Hz. Add/remove moves and cancels without editing JSON.
5. Change keys in **Project input**. New custom command names get action entries;
   bind them before expecting keyboard input. Changing the action prefix changes
   the fighter's action namespace.

Combat settings live in `extensions.hyperfocusCombat`. Fighter setup and rule edits
use the same validated DOM-free `scene3d.setup-combat`, `scene3d.set-fighter`, and `scene3d.set-combat`
commands as visible controls, with normal project undo. The scene's fighters share
one combat ruleset. Build preflight rejects invalid rules and fighters without
dynamic bodies. A single fighter remains valid while a scene is being authored.

Drive + forward Heavy is a diving kick. Holding Heavy adds up to 30 anticipation
frames and increases active travel from 14 to 25.2 m/s without increasing damage.
It aims approximately along lock-on elevation; free-running uses a forward ground
launch or a downward airborne pitch. The slam sends the opponent into the ground;
the normal surface bounce and fresh tech determine whether the combo continues.
Drive + back Heavy automatically retreats during startup, then lunges into four
windmill strikes. Ordinary back Heavy retains its armored forward kick.
`startupMovementSpeed`, `activeMovementSpeed`, `chargeFrames`, `chargeSpeedScale`,
`diveAngle`, and `downwardImpulse` are editable in Movement and strike behavior.
Combat hosts provide held command names through `CombatInput.held`; saves and
rollback preserve charge. Charge cannot survive an interrupting hit or parry.

The Touch of Death preset uses gravity scale 1.9, jump speed 10.5, air steering 9,
and coasting deceleration 22. Attack travel no longer replaces vertical velocity:
whiffs and recovery continue falling. Forward chase meets the opponent's ballistic
arc and approaches body spacing; light impacts shed horizontal momentum so repeated
contacts cannot accelerate a target forever. The regression route confirms a
launcher into a chase, Drive string continuation and finishing heavy, while the
same inputs fail against a displaced opponent. Neutral jump returns to the floor
within 1.2 seconds.

Two horizontal decks and two vertical lifts flank the open arena. The lifts
alternate between .5 and 3.7 meters over eight seconds. A descending lift starts
at the upper endpoint because phase motion is relative to its authored position.
Select any scene object and expand
**Motion**, then choose **Moving platform** to create an editable static box deck.
**Travel offset**, **Round trip (seconds)** and **Cycle phase** author a portable
`ping-pong` animation. Standing characters travel with the deck; jumping detaches
immediately. The trip length grows automatically when an edited offset would
exceed eight metres per second. The validated `project.patch` route uses the same
scene data and undo. Absolute simulation ticks preserve platform phase through
pause, round reset and save/restore; no visual-only collision proxy is involved.

The same Motion inspector offers **Traffic circuit**. A horizontal travel leg,
signed **Turn radius**, **Vehicle pivot**, cycle period and phase describe a
continuous two-lane route. All pieces of a vehicle share its pivot and timing;
the renderer and static collision boxes follow the tangent through each turn.
Straight legs ease into the slower semicircular turns. The portable animation
adds `turnRadius` and `turnPivot` to timed `ping-pong` data; omitting them preserves
ordinary reciprocal platforms. `samplePlatformPosition3D` and
`samplePlatformRotation3D` from the runtime entry let scenery-only hosts sample
the same motion without creating combat. Circuit controls use validated project
patches and undo, and malformed vertical or over-speed circuits fail preflight.

Combat movement yields to physical impulses while a fighter is stunned or knocked
out. Advanced hosts can call
`runtime.step(actions, { suppressedControllerIds })` to yield selected movement
controllers to physics for that tick. Portable gameplay saves retain combat state
and held-input edges: reloading a held strike does not add a press, and a held guard
keeps its start frame. Save validation precedes world mutation. These saves retain
world transforms and linear velocities; full physics rollback uses checkpoints.

The project combat adapter pauses combat, AI, movement and physics together after
contact: four ticks for light hits or blocks, fourteen for heavy/launch/counterhits,
seventeen for perfect parries or guard breaks, and nineteen for lethal hits.
Input samples, including releases and
direction/Drive modifiers, queue during the pause and replay in order while input
stays unchanged. A new live intention after the pause replaces older queued
samples, so input latency cannot accumulate. Counterhits do not receive automatic
bonus damage or stun. Simultaneous events use the strongest pause. Portable
saves retain the remaining pause and queue. Hitstop adds real time without
changing authored startup, stun, recovery or cancel windows; execution fixtures
schedule inputs by combat frame rather than wall tick.

## Combat and physical characters

`@hyperfocus/engine/combat` exports `createCombatPreset`, `readCombatConfig`,
`validateCombatConfig`, and `createCombatSimulation`. The simulation accepts
fighters and rules, then receives `step({ inputs, poses, contacts })` once per fixed
tick. `capture()` and `restore({ snapshot })` retain move phases, input history,
guard timing, stun, health, and per-attack target history.

Each pose can include a finite `velocity: { x, y, z }` in metres/second. Relative
closing speed along the line between fighters scales landed-hit damage, whole-frame
hitstun and full launch by 1% per metre/second, capped at ±10%. Shared or
perpendicular motion leaves impact unchanged. Blocks/parries keep their normal
response. Omitted velocity means stationary for that tick. The 3D gameplay host
feeds both fighters' current physical velocities, including vertical dives;
rollback restores those bodies rather than retaining a separate stale combat velocity.

## Touch of Death

### Practice and defensive clarity

**Learn parry** and **Learn tech** give the player repeated defensive attempts
against an ordinary dummy heavy attack. The dummy approaches to spacing derived
from the authored fighter radius, waits at least 60 simulation frames before
attacking, and resets the fighters every 240 simulation frames. These drills use
the same input, hitstun and collision permissions as matches. Optional **Last
defensive attempt** diagnostics retain press/impact timing across resets and
distinguish unavailable inputs from early or late attempts.

The selected lesson remains visible after closing Practice settings, with current
key/button bindings and a short next action. Defensive results survive automatic
drill resets, while selecting another lesson clears the previous result. Detailed
frame timing remains optional. Physical tech regressions use the delivered 1.9
gravity scale so the launcher reaches a surface during hitstun.

Practice diagnoses the exact first legal guard frame after attack recovery or
hitstun. Retained coaching says **Last attempt**, so a reset cannot imply a live
punish opportunity. Combo lessons classify lateral drift relative to facing and
accept repeated attacks when a new move execution still meets the branch's
contact and trajectory requirements; there is no lesson-only move rotation rule.

Disconnecting a controller cancels unfinished Drive taps and its toggle state.
Losing focus cancels Drive gestures and toggles. Practice navigation exits on
disconnect; Touchpad opens or closes it even when Circle is remapped to confirm.

An unaffordable movement request does not grant movement, but permits the normal
grounded/airborne stamina recovery. Exhausted sprint falls back to walking until
Jump is released, preventing alternating sprint bursts during recovery. The shared
player/AI motion snapshot saves this latch; older snapshots default it to false.

Match AI receives a fallible twelve-frame contact forecast from current arena box
colliders, using the existing rounded-box sweep, live rotation and relative linear
velocity. Its normal difficulty delay and tech lockout still apply. Slow reactions
can miss; other collider shapes use the collision fallback. Pending tech input
suppresses redundant escape only while the predicted contact remains imminent.

**Quickmatch · local AI** selects difficulty 3–8, with a 5% chance of 9. Browser
hosts provide a cryptographic fresh-session seed through `combatQueueSeed`;
engine defaults remain deterministic and snapshots preserve the advancing queue.
Optional `arenaLayouts` declares up to eight structural districts, each with up
to eight arrangements and 512 object placements. Every arrangement in a district
must position the same non-animated scene objects; districts cannot share objects
or claim fighters, weapons or starting-location props. Only position varies.
`combatArenaLayout(definition, matchIndex)` returns selected district/variant IDs
and positions for evidence. Selection is independent of the starting-location
count. Consecutive matches change each district that has multiple arrangements.
The runtime applies these positions to real physics at match boundaries. Rounds,
JSON saves and rollback keep the current structure; Practice resets to index zero.
The editor's District arena arrangements controls author the same portable data
through `scene3d.set-combat`, including all-variant object membership edits.
Rematch retains difficulty and queue state; Next opponent rerolls only Quickmatch.
Results identify the AI level. A loss offers Practice defending directly.
Practice also includes Learn combos: launch, move into a follow-up, then aim another
attack against changing impact steering. Progress observes ordinary hits; Reset fighters
restarts the lesson. The lesson prompt appears only while explicitly selected in Practice.
The surface cashout prompt teaches the authored first Strike → second Strike →
toward Heavy transitions during recovery. Confirmed Strikes can repeat fast follow-ups
or branch into Heavy; a slow Heavy after the opener can still leave a defensive gap.
Steering and tech can interrupt the conversion.

**Game settings** in menus, Practice and pause provides local keyboard/controller
rebinding, explicit conflict swaps, restored defaults, and separate optional Drive
toggles for each device. Menu confirmation and pause follow their bindings.
Touchpad toggles Practice navigation; stick or D-pad moves focus and the confirm
button activates the visible control. Ordinary match shortcuts are excluded from
the remapping list when menu navigation already supplies their visible action.

Ten named layouts cover face attacks, shoulder/trigger attacks, alternative guard
placement and shoulder movement. Choosing a layout replaces controller assignments,
including conflicting auxiliary remaps, while retaining keyboard bindings. Individual
remaps remain available. Master, SFX/voices and Music gains persist locally and apply
to the live audio graph, including tracks already playing. Controller up/down moves
focus; left/right adjusts a focused layout selector or volume slider. Restore defaults
resets controls, Drive toggles and the audio mix. Host tests cover distinct complete
layouts, preserved keyboard edits, persistence, controller range input and bus gains.

Match menus and results offer Practice with neutral, outward/sideways steering,
tech, escape and held-guard presets. These presets supply ordinary defender inputs;
they do not bypass combat permissions. `practice:reset` restores fighters while
retaining the preset; the player's remapped reset action does the same in Practice.
The editor and standalone hosts expose optional frame timing, input history and
hitbox/hurtbox overlays, disabled by default and removed outside Practice.
Shield fractures indicate remaining guard and the ten-second break recovery.
Escape availability appears beneath each fighter's stamina. Parry timing rings
track posed hands; tech rings use the actual collision point. Authored occluding
scenery fades against both fighters' posed silhouettes, including extended limbs.
Supporting floors remain opaque, and shared decorative trim fades as a group
without changing its colors or collision. Foreground collision-edge cages remain
hidden because their bright lines obscured combat.
The city camera retains foreground floor space with a target .10 metres below
the mean fighter root. Secondary cutaways reveal at most four nearby available
loose weapons on the fighters' floor; held, projectile, inactive and depleted
objects do not clear scenery. Camera fitting, collision and inventory state stay
independent of those presentation sightlines.
Pickup-only cutaways apply to local cover with half-extents at most three metres;
fighter sightlines cover scenery of any size. City fights aligned in depth use a
local, eased presentation orbit to separate silhouettes. Its view branch persists
through axis crossings, and its fit uses the rotated horizontal/depth axes.
Controls, combat and saves remain unchanged; the original arena and ordinary
x-separated city fights retain their baseline yaw. `camera-orbit.test.ts` covers
native route/KO positions, portrait fitting and continuous crossing movement.
Equivalent fully opaque city scenery rebatches through evaluated-frame
`renderMaterialId` overrides after fading. Authored IDs and variant materials
remain unchanged; every current render trait must match. Transparent cutaways
retain independent handles. Omitting the override on the next frame restores
the authored/variant handle; batching and runtime regressions cover that boundary.

### DualSense controls

The setup includes keyboard and standard-layout gamepad bindings. Connect the
controller, focus the game and press a button. Editor Play and offline Build poll
the same binding reader. `Gamepad.ButtonN` selects the first connected standard
controller, including one in a nonzero browser slot; `Gamepad2.ButtonN` explicitly
selects slot 2. Remap either form in Project input. Unmapped/raw devices require
explicit indexed bindings rather than assuming standard button order.

| Control | Action |
| --- | --- |
| Left stick | Move / strafe / steer attacks |
| Cross | Ground: neutral press jumps immediately, short directional tap jumps on release, direction held ¼ second steps into sprint. Airborne direction + fresh press dashes immediately. Fresh press in hitstun techs. |
| Square | Strike |
| Triangle | Directional heavy; neutral launches |
| Circle | Evasive special |
| L1 | Hold block; release/repress to parry |
| R1 | Heavy windup feint / feint after parry |
| L2 | Spend armored escape |
| R2 | Hold Drive to modify Strike or Heavy |
| L3 | Ground / air dash |
| R3 | Toggle lock-on |
| D-pad up | Quick reply after parry |
| D-pad down | Unassigned |
| D-pad left | Sidestep after parry |
| D-pad right | Evasive strike after parry |
| Options | Pause / resume |
| Create | Restart practice round |
| Touchpad | Practice controls |
| Right stick, PS, microphone button | No game action assigned |

Defaults follow the [W3C standard gamepad layout](https://w3c.github.io/gamepad/#remapping).
Tests cover all combat bindings, trigger threshold, release/repress and disconnect.
Browser checks exercise simulated standard-layout input in Play and offline HTML,
including pause/resume. Physical DualSense hardware is unverified; rumble,
adaptive triggers and touchpad gestures are not implemented.

### Rules

The example's `@hyperfocus/touch-of-death/combat/preset` supplies
`createTouchOfDeathPreset()` for current game tuning. The engine combat export
retains a deprecated, frozen 0.0.x fixture. A launcher
has a long windup and recovery; its hitstun supports precise follow-up routes.
Attacks travel with bounded steering. Authored follow-up windows permit ordinary
string branches; explicitly marked specials can interrupt eligible actions.
Ordinary movement cannot cancel an attack. The demo
uses authored root movement and stylized pose cues rather than articulated
joint-motor attack animation.

While airborne, authored attack movement follows the attack's initial 3D aim;
ground attacks retain gravity. Lock-on aims at the opponent's height, and movement
input steers committed attacks gradually. Dash direction stays fixed for its
duration; one air dash refreshes on landing. The demo dash starts at 14 m/s and
tapers to 65% over its active frames (`dashEndSpeedRatio`), then coasts with
22 m/s² deceleration. Accepted air dashes lean into travel with
four short streaks; a spent attempt shows crossed shoulder strokes, and landing
briefly shows upward ankle chevrons. These saved cosmetic cues never grant movement
or override attack, hit or block poses. Movement tuning is editable under
advanced rules. The demo camera tracks both fighters, including launch height.

A fresh neutral jump press grants one extra jump per airtime (`airJumps: 1`),
spending the ordinary jump cost. A Drive tap keeps its existing jump meaning.
Holding jump never repeats it; attacks and hitstun retain their normal commitment.
Air jump and air dash have separate allowances, refreshed only by ground support.
While falling freely against a wall, holding toward that actual contact limits
descent to `wallSlideSpeed` (3 m/s in the demo); releasing the direction resumes
the normal fall. Wall sliding never refreshes either air allowance or overrides
hitstun. A foot burst marks the air jump, and short scrape streaks mark wall slide.
Other projects retain prior behavior when these optional fields are absent:
zero air jumps, disabled wall slide, and a constant dash speed ratio of one.

Strike and Heavy accept neutral, toward, away or side input. Direction is relative
to the opponent while locked on; locomotion is relative to the camera. The core
samples direction and Drive when a button is pressed, including buffered presses.
Toward attacks advance or carry, away attacks retreat or intercept, side attacks
redirect, and neutral Heavy launches. Drive spends more stamina for pursuit,
flurries or stronger launch, with additional commitment. A short Strike → Strike
→ Heavy string branches through authored follow-up windows. Branches keep their
real reach and trajectory; the runtime never moves an opponent into a combo.
The October 2026 preset buffers fresh attack presses for ten frames. A landed
Strike opens eight recovery frames for fast repeated Strikes or Heavy; dash and
Drive Strikes open ten. Each continuation needs another fresh press. Whiffs,
held blocks, parries and armor absorption retain their longer committed recovery.
There is no repetition cap: physical spacing, steering, stamina and surface recovery
determine whether the next contact connects.
The same directional purpose works in the air through 3D attack travel. Authors
can additionally restrict individual moves to ground or air.

Drive + Strike is a four-hit flurry in every direction: sixteen startup frames,
four strikes six frames apart, and thirty-eight recovery frames on whiff/block,
or ten after a confirmed hit. It costs 28 stamina
and returns 12 once on contact. The linked flurry starts in ten frames and costs
the same amount. Startup turns toward the closest opponent by at most .045 radians
per tick (`startupTracking`); release fixes its heading. The defender can parry
each strike, while a blocked flurry leaves a clear gap before another opener.
Side Drive redirects; forward Drive advances; backward Drive gives ground.

Drive + Heavy uses a broad rising swing. Neutral launches upward, backward
intercepts airborne approaches, side redirects, and forward cashes out damage.
`hitHeight` extends the attack sphere upward into a capsule, matching the rising
sweep; zero retains the ordinary sphere. Heavy startup has an authored Feint
cancel window ending six frames before release. Feint costs six stamina and
recovers for nineteen frames; active attacks remain committed. Optional per-move
`hitRecoveryFrames` shortens recovery after a body hit, including a hit absorbed by
armor. Armor still prevents the defender's interruption and launch. It defaults
to `recoveryFrames` and cannot exceed it. Optional cancel `hitOnly` gates a route
on that attack's confirmed hit; omitted preserves existing cancel behavior. Save
and rollback retain `hitConfirmed`, and old snapshots default it to false.

`combatMoveDuration(move, fighter)` and `combatRecoveryFrames(move, fighter)`
report the current committed timing for hosts, AI and presentation.
`inspectCombatInput({ config, fighter, frame })` explains the latest unconsumed
command through the same command selection and cancel rules used by simulation.
Practice uses it for input expiry, cancel timing, missing hit confirmation and
insufficient stamina; a completed attack with no physical contacts reports a miss.

Optional `hitArcDegrees` changes a move's contact shape to a finite horizontal
sector, with `reach` as its range, `hitRadius` as vertical thickness, and
`hitHeight` as upward extension. The defender's hurt sphere rounds the boundary.
The normal contact path still resolves damage, one hit per target, block and
fresh parry. Hosts can supply `attackArcDegrees` per fighter and an
`attackVisibility(from, to)` geometry query; that query occludes sector contacts
without changing legacy capsule attacks. Touch of Death spray kits derive the
angle and range from the held item's effect declaration.

`landingRecoveryFrames` defaults to zero; Touch of Death uses five. Landing delays
attacks, jumping and dashing while guard and parry remain available immediately.
Fresh commands and accepted jump taps survive this short landing commitment;
expired inputs are not revived. Saved `landingFrames` and `wasAirborne` keep the
same behavior after restore, including saves made before these fields existed.

Stamina gates attacks, steps, jumping and sprinting without changing their frame timings.
Grounded neutral recovery is .759375 per frame (`idleStaminaRegen`), only when
stationary, grounded, out of commitment/stun, and without movement, guard or action
input. Omitted idle recovery inherits base recovery. Hitstun recovery is .405 per
frame; it never receives the idle bonus. Hosts derive the optional `idle` input
from physical velocity so coasting does not count as standing still.
Voluntary horizontal movement and acceleration scale linearly from 100% at full
stamina to 80% at empty (`exhaustedMovementScale`). Attack travel, impact momentum
and jump height are unchanged. `accelerationScale: .8` blends grounded
walking/sprint velocity toward its target at 80% of the former instantaneous
response and scales air steering once. Ground deceleration remains unchanged;
legacy projects omit both fields and retain their previous response.

A hit or block returns part of the attack's cost once; a parry denies that contact's
refund. Flurry hits cannot multiply the refund. Idle time and ordinary walking
regenerate stamina. Touch of Death recovers .6075 per grounded frame and .2025 per
airborne frame (`airStaminaRegen`; omitted inherits `staminaRegen`). A neutral
jump spends 12.6 stamina once and sprinting spends 1.12 per frame; `jumpCost` defaults
to zero for projects that retain free jumps. Walking, guarding and impact tech remain
available when exhausted; the armored escape uses its separate charge. There is
no move-staling penalty. The practice HUD describes attack phase and available
string follow-ups; matches use overhead stamina bars and visual move cues.
Drive windup has an additional visual cue.

While locked on, a forward step toward a launched opponent in hitstun becomes a
physical rising chase. It spends the normal step stamina and air step, aims once
at takeoff, and keeps the existing dash speed and duration. Defender steering and
tech still change the situation. Press forward + Dash after
the launcher, then R2 + Square (H + J) when you reach the opponent. Directional
steps pressed during the final input-buffer frames of recovery wait until the
attack finishes; they never cancel its commitment.

On the ground, direction + Cross reserves the first fifteen fixed frames for a short tap: releasing
inside that window jumps, even while direction remains held. Neutral Cross still
jumps immediately, and its release never queues another jump. Holding direction
past the window steps into sprint; dedicated Dash remains immediate for a chase.
While airborne, direction + a fresh Cross press air-dashes on that first tick,
without the ground hold delay. It spends the same stamina and single air-dash
charge as Dash, respects attack recovery and hitstun, and never repeats on release.
Releasing sprint decelerates gradually, so a jump preserves its momentum. Normal
air steering changes travel gradually. During hitstun,
defender direction retains analog stick magnitude. Touch of Death accepts live
steering during hitstop and for three simulation ticks afterward, correcting the
existing launch without stacking forces or rewinding positions through geometry.
Surface impacts, techs and escapes close that window. `lateInfluenceFrames` is
editable under Defense and stamina; omitted values retain impact-only behavior.
Influence preserves each impulse magnitude and cannot instantly reverse it.
Chase takeoff assists initial approach; later links retain their heading
until the attacker aims with the stick. Vertical aim remains assisted.

The physical Practice regression runs the same launcher/Drive string against
neutral, outward and sideways steering. Neutral reaches a twelve-hit ToD by spending
Drive on the second launcher to clear the moving lift, followed by a second chase.
The first flurry starts during the rising approach, so its longer windup reaches
the defender before the launch falls too low;
sideways drops unless the attacker adjusts aim between attack beats
and redirects that second chase. Manual aim restores an unbroken ToD. Neutral
Drive flurry hits deal five damage, its string follow-up six; the legacy flurry
shortcut also deals five per hit. Side Drive Strike redirects away from a side wall;
forward Strike into forward Heavy cashes out 84 damage earlier than the full
route, with stage collision limiting its final pushback. These are existing
move inputs, with no injected contacts or hidden repetition penalties.

Impact pauses freeze both fighters, physics, combat and AI together: four ticks
for light hits/blocks, fourteen for heavy hits/counters, seventeen for parries/guard
breaks, and nineteen for a newly lethal hit. Corpse contacts do not retrigger the
lethal pause. Input samples survive these pauses. Camera shake has twice its
previous horizontal/vertical amplitude, while impact dolly and bloom retain
their curves; reduced motion removes shake.

Hold the guard input to block. Release and press close to impact to parry,
including during blocked recoil; unblocked hitstun and attacks prevent normal
parry. Chip stops at one health. Guard damage can break guard, disabling both
guard and parry for 600 frames (ten seconds at 60 Hz). Successful parries create
separation, 20 frames of attacker recoil, and a 24-frame window for fast strike,
sidestep, feint or evasive attack. The parried attack and its queued string are
cleared, so later flurry strikes cannot reclaim the turn. `parryRecoveryFrames`
defaults to zero for other projects that retain a neutral reset. Touch of Death
accepts guard presses up to five frames before impact (`parryFrames: 6`).
Guard wear persists until a successful parry restores 25% of maximum guard,
capped at full (`parryGuardRestore`, configurable from 0 to 1). Waiting does not
repair guard. A broken shield returns at full guard after its ten-second lockout.
Each multi-strike offset is a distinct contact opportunity that can be parried.

Fresh guard takes priority over older buffered offense on the first legal tick,
including after hitstop. It does not cancel a committed attack or bypass hitstun.
Touch of Death neutral Strike opens in 14 frames; its linked Strike remains five.
`hitstunStaminaRegen` restores .3 stamina per simulation frame while the living
defender is in hitstun; `parryStaminaRestore` grants 6 on a confirmed parry. Both
cap at maximum stamina and default to zero for existing projects. Frozen hitstop
does not regenerate stamina. Both fields are editable in Defense and stamina.

Tech timing circles use the collision point and normal, sitting just outside
the ground or wall instead of intersecting it. Their yellow/red/white timing
colors are unchanged; locomotion dust yields while that cue is visible. Saved
feedback retains the normal, including a late press after a bounce. Faded stage
solids omit the opaque toon hull and retain their authored collision edges.
Overhead resources avoid both fighter silhouettes and use a subtle colored
tether when displaced, without rotating the camera or changing movement input.

One armored escape per round interrupts hitstun immediately and starts a
committed swing. Armor prevents interruption, not damage or death; an attacker
can evade it and punish recovery. A landed escape recovers in eight frames and
opens hit-only linked Strike and Heavy routes; a whiff retains 67-frame recovery.
Collision techs are free, edge-triggered and
directional. The six-frame input window accepts a press up to five frames before
a ground/wall/object collision and recovers with
brief protection; a failed attempt locks out retries for twelve frames. A missed
tech rebounds at 60% of measured impact speed, capped at 10 m/s; small falls no
longer receive a fixed 4 m/s launch. Advanced hosts feed collision normals and optional world-space
`contactPoint` anchors through `step({ collisions })`.
Cross must be freshly pressed during hitstun; holding it from a jump or sprint
does not automatically tech a later impact. E remains a dedicated keyboard tech.

The optional `extensions.hyperfocusCombat.movement` object configures run/jump
speed, dash speed/duration and recovery. The preset enables free ground motion,
jump, one air dash per airtime and lock-on. Editor disclosures expose every move
and defense setting, including strike offsets, guard damage, vertical impulse,
armor, attack travel, steering and special/parry-follow-up eligibility. Generated
models, arena props and materials remain ordinary project assets and objects.

Default controls: WASD movement/attack direction, Space tap jump in any direction
(neutral press is immediate), grounded direction + Space held fifteen frames steps into sprint,
and airborne direction + fresh Space dashes immediately,
fresh Space in hitstun techs. Q dashes/chases, F locks on, J strikes, K attacks heavy;
H taps jump or holds Drive, U flurries, L guards/parries,
E tech, I armored escape, Shift evasive special,
O fast parry follow-up, Z sidestep, X feint, C evasive parry follow-up, R restart.
Rebind actions in Project input. The command equivalent is
`{ type: "scene3d.setup-combat", entityId, preset: "touch-of-death" }`; an asset
host stores generated models and the macro commits as one undo operation.

This is a local combat demo and configurable foundation. A lethal route's
execution difficulty, camera readability and competitive balance still need
playtesting. It does not add hosted rollback matches, roaming story content,
automatic navmesh generation, progression servers or sustained flight.

Without explicit contacts, the baseline tests an attack sphere placed along the
fighter's facing against each opponent's hurt sphere. This is useful for a first
practice scene. Advanced games pass their own `contacts` array; an empty array
means no contacts and disables automatic overlap detection for that step. This
lets bone/capsule queries or physical contact telemetry decide who touched whom
while shared combat rules still decide active windows, guarding, damage, and
one-hit-per-attack behavior. Step results have stable event ids and impulses;
the host applies physical impulses and owns presentation.

For an articulated fighter, use the existing editor **Auto-build full physical
rig**, then **Full physical action** to author motor drives, support, contact, and
recovery. Custom game behavior must connect combat phases to those authored motor
targets and feed solved poses/contacts back into the simulation. Making an object
a fighter does not automatically bind move ids to rigged attack animation.
See [rigid 3D](rigid-3d.md) and [the editor workflow](../../../apps/engine-editor/docs/project-workflow.md).

## Rollback composition

For two human input sources, construct `createGameplay3D` with
`independentCombatInputs: true`, then call `step(hostActions, fighterInputs)`.
Supply every fighter in authored roster order as `{ actions: new Set(['guard']),
direction: { x: 0, y: 0, z: 0 } }`. Commands are unprefixed; direction is a finite
planar world vector of length at most one. Resolve camera direction before this
boundary. Peer-to-roster assignment belongs to the authenticated host, not the
input payload. Missing or invalid samples reject before scripts/world mutation.
Independent mode disables AI and Practice policy substitution, but retains local
match menus and phases; a network host must provide a shared match lifecycle.
With `externalCombatMatch: true`, the host owns that lifecycle and local match
menus are bypassed; independent inputs are required. `createNetworkCombatSession`
sets both options and releases audio on confirmed frames. Its binary codecs live
in the optional `@hyperfocus/engine/combat/net` entry, with the server relay in
`@hyperfocus/engine/server`. These APIs do not yet provide an exported-game lobby.

The default local AI path remains `step(actions)`. Independent channels retain
fresh guard edges, Drive, buffered jump direction and lock-on through hitstop and
portable saves. This host capability is not yet an editor multiplayer mode.

`gameplay.checkpoint()` now composes complete runtime, combat, input, hitstop and
knockout state with local presentation restoration. It rejects custom behavior
closures, whose external mutable state cannot be captured. See
[Combat rollback](combat-rollback.md) for ownership, configuration restrictions,
confirmed audio and tests. Use plain action arrays or binary-decoded values in
rollback inputs, converting to sets at the gameplay boundary: the default input
comparison uses JSON and cannot distinguish `Set` contents.

`@hyperfocus/engine/net` exports `createRollbackParticipant`,
`createCombatRollbackSession`, and `hashRollbackState`. Wrap each owned state
source in a participant: combat capture/restore, rigid-world
`checkpoint`/`restoreCheckpoint`, ragdoll checkpoints, and game-owned state such as
RNG, input edges, and temporary transformations. Participants must collectively
cover everything that affects the next tick.

Supply a fixed peer roster, local input reader, default input, and an update
callback. Deliver remote inputs through `receiveInput` and drive `tick()` at the
simulation rate. The session replaces speculative events during replay and emits
them through `onConfirmedEvent` only after every peer's input for that frame is
known. Use stable event ids for sounds, hit flashes, and rewards; avoid playing
those effects directly inside a replayed update.

The default rollback history is 120 frames. Exhausting unconfirmed history raises
an explicit error; pause advancement until inputs arrive or let your host handle
disconnect recovery. Compare retained confirmed `stateHash` values with
`compareStateHash` to diagnose desyncs. Hashes are diagnostics, not authentication.

Peer membership and physics body/constraint topology stay fixed within a session.
Create a new session for roster or topology changes. Checkpoints support replay
within the tested JS numeric environment, not bit-identical results across
unrelated engines or platforms. The session does not supply matchmaking,
signaling, relay hosting, accounts, reconnect UI, or a production resimulation
budget for your full game.

## Collision queries

`@hyperfocus/engine/physics/3d` adds `capsuleIntersectsSphere3D`,
`capsuleIntersectsBox3D`, and `capsuleIntersectsTriangle3D` for explicit geometric
tests. `createStaticTriangleQueries3D` owns a validated copy of world-space
triangles and provides nearest two-sided raycasts and capsule intersection tests.
`createHeightfieldQueries3D` builds that same query surface from a regular height
grid. Query constructors default to at most 100,000 triangles; queries scan those
triangles linearly, so hosts should partition large worlds.
Coordinates and radii are bounded to magnitude `1e30` to reject large finite
inputs that would overflow geometric intermediates; radii must be nonnegative.

These are query helpers, not new `RigidShape3D` solver shapes. The rigid solver
still uses its supported box/sphere bodies. They do not add convex hull solving,
compound rigid shapes, continuous capsule sweeps, or sleeping/islands. A custom
controller owns collision response when it uses these queries for locomotion.

## Roaming routes

In **Roaming navigation**, mark scene objects as waypoints, choose a destination,
and save a walk/jump/fly link. **Test route from selected object** displays arrival
waypoints and traversal actions. **Advanced link settings** exposes route cost
and one-way travel. Marking captures the current position; choose **Update waypoint
position** after moving an object. Removing a waypoint removes its links.

The graph belongs to one scene and persists in `extensions.hyperfocusRoam3D` through
undoable `project.patch` operations. A game behavior consumes it with
`createRoamNavigator3D` from `@hyperfocus/engine/navigation`. Routes default to
bidirectional walking links and Euclidean costs. Advanced requests supply allowed
`traversals` and dynamic `blockedLinks`. Equal-cost choices are stable across
authoring order. Default limits are 4096 visited nodes and 1024 returned steps;
unreachable routes and exhausted budgets have distinct statuses.

This is an authored graph, not automatic navmesh generation, local avoidance,
or traversal execution. Route tests do not move an actor or prove clearance.
Your behavior follows the returned positions and performs jump/fly actions.

## Progression and match loadouts

In **Starting progression**, enter starting unlocks and loadout names. **Validate
loadout** checks selections before **Save starting progression** persists them.
Optional rules expose starting points, maximum selections, and a rules version.
Defaults unlock and select `jab` and `heavy`, allow eight selections, and start
with zero points. Edits are undoable `project.patch` operations stored in
`extensions.hyperfocusProgression`. This authors starting data; game behavior maps
names to abilities and decides how a profile affects combat.

`@hyperfocus/engine/progression` exports `createProgressionProfile`,
`validateProgressionProfile`, `snapshotProgressionLoadout`, and
`applyProgressionReward`. Snapshot a copied, frozen loadout at match start with the
profile revision and game-owned rules version. Later unlock changes cannot mutate
that bout. Game rules still own slot compatibility, balance, and spending points.

Apply rewards in trusted host code after validating results. A stable reward id
makes identical retries return `duplicate`; changing its content throws. A new
reward against an outdated `expectedRevision` returns `conflict`. An applied
reward returns a new profile with an incremented revision. Persist that profile
atomically using a revision comparison, and retry conflicts against current
durable state. The reducer alone is neither a database transaction nor a trust
boundary. Do not accept client-authored rewards as verified results.

The ledger refuses new rewards after 4096 receipts. A trusted archival policy must
preserve deduplication before replacing it. Player profiles belong in host save
storage, separate from the authored project and from speculative rollback state.

## Verification

### Combat sound

Combat audio is an optional declaration with music, effects and fighter voice
asset assignments. In the inspector, open **Combat audio**, choose imported audio
or generated Character voice takes, then adjust the three levels. The sound-event
picker edits one cue at a time. All changes share the validated set-combat command,
undo and packed-project storage; Build rejects missing audio assets.

Walking and sprinting alternate footstep takes by distance traveled. Faster
movement produces faster, louder steps, with no steps while airborne or stunned.
Landings scale with fall speed. Swings play when attacks become active and on flurry
strikes; hit and wet impact layers require confirmed hits. Block, parry, guard
break, bounce, tech, armored escape, knockout and round countdown have distinct
assignments. Each fighter has attack, heavy attack, hurt, effort and knockout
voice slots. Vocal cooldowns limit overlap; hurt outranks attack/effort and KO
outranks hurt. Cues pan relative to the camera. Optional banks hold up to eight
distinct takes per sound or fighter voice, avoid adjacent repeats, and rewind
their selection with audio checkpoints. Air/wall jumps, wall movement, wet/wood/
metal support, grab connect/miss, counters, tool handling and utility actions have
separate assignments. Heavy finishing hits keep their authored impact weight.

Music loops across rounds and replay. Expanded audio supplies .4-second phase
gain fades, round/match result accents, and optional `musicResult` crossfades;
same-track changes update the active loop. Legacy single assignments retain their
original music lifecycle. Nearby traffic and machinery use quiet bounded grains
only during live combat. See [audio routing](../src/project/3d/combat-audio/README.md)
for cue selection, material detection and checkpoint ownership.
Pause suspends playback alongside the
simulation. Hosts must stop scene audio before restoring/resetting gameplay and
regularly consume `drainAudio()`. Audio presentation does not affect combat state;
restoring restarts the music rather than persisting its playback cursor. Browser
playback requires a click or keyboard gesture. Synthetic Character voice takes
are stylized syllables, not intelligible human voice acting.

`audio-runtime.test.ts` covers music lifecycle, cadence, grounded-only steps,
contact-only effects and voice cooldowns with actual physics. The match browser
check observes decoded Web Audio sources in both offline and locally served HTML.

### AI matches

Touch of Death delivery uses a fixed game viewport: an opaque stationary main
menu, transparent intro/countdown, health and stamina above each fighter and a Controls
disclosure. Pause offers Resume and Main menu. New sessions open on the menu
rather than automatically restoring an old round. Visible energy boundaries
enclose a continuous thick floor, including airborne launches. They remain
ordinary editable scene objects, not invisible position clamps.

The generated arena box mesh spans -1 to +1 on each axis, matching the rigid
box's half-extent convention. The fighter's standing boots end .98 m below its
origin, just above the one-metre sphere support point. The cooked-model regression
checks rendered floor height against collider height; physics-only tests cannot
detect a visible mesh that is larger than its collision body.

Touch of Death expands into a torso model and editable head, hair, arms, thighs,
shins and boots. Runtime poses articulate those parts for locomotion, anticipation,
strikes, recovery and airborne reactions without changing the physical collider.
The generated sphere has radius one; limb lengths and thicknesses account for
that convention. Contact effects use twelve authored spark objects per fighter
and four movement trails, with bounded lifetimes. The camera frames both fighters
as separation and height change, fits narrow viewports, and adds a short contact impulse. These presentation effects
do not modify combat timing or physics state.

Directional attacks use distinct preparation, torso, support-hand and recovery
paths: neutral straight strike/rising heavy, advancing cross/shoulder drive,
retreating backfist/overhead check, and mirrored lateral hooks/wide swings.
Drive exaggerates preparation; linked strikes and flurries alternate hands.
Optional forearm meshes bend at the elbow. Every active striking hand converges
on the actual facing-aligned attack sphere, including vertical lock-on aim.
Knockback angle never rotates the rendered strike away from its hitbox.

Swing audio occurs when the attack becomes active; startup uses the voice cue.
Interrupted windups cannot emit a late swing. Whiffs produce swing audio without
impact effects. Blocks shed a compact burst, parries form a ring, and counterhits
produce a stronger cross-shaped burst and sound accent. Impact particles retain
their world-space contact anchor while the defender is knocked away. Counterhit
metadata means a hit interrupted unstunned startup or active frames, not recovery.
The standalone **Reduce motion and blur** option suppresses motion blur, camera recoil and contact
zoom while preserving the framing needed to see both fighters. Editor Play and
offline Build composite actual pixels for exposure, quarter-resolution bright-pass
bloom and vignette below the HUD. Match HUD text is limited to the score and
functional controls; combat state subtitles are removed.

Recent defensive attempts show two circular particle rings: yellow contracts for early,
red expands with gaps for late, and white expands for successful parries and techs.
No timing text appears. Held blocks receive no timing warning. Shield contact uses
a shallow front disc and small recoil; unblocked hits bend the torso further.
Intro salutes and stretches blend into ready poses during the countdown.
During the three-second KO finish, corpses remain juggleable physical ragdolls;
AI levels 79 attempt reachable airborne followups, then stop when the body settles; lower levels stop attacking.
Footfall dust uses a bounded pool; sprint cadence is faster than running, and
takeoff/landing bursts fire once per grounded-state transition. Motion blur uses
two low-opacity scene samples; low-health red blotches stay at the screen edges.

The playability repair also fixes a separate dynamic CCD bug: a falling fighter
could carry a grounded fighter below the floor at impact. A minimal three-body
regression and 54,000 seeded mixed-input frames exercise that failure. Isolated
static-floor drops alone did not reproduce it.
Resting-contact regressions also cover a falling sphere glancing past another
fighter and crossing a connected rooftop edge. Rounded pairs may leave a shallow
overlap without being pinned at time zero; slab tunneling protection remains.
Time-zero contact nudges retain the surface normal so the ordinary solver can
resolve contact instead of nudging along a tangent.
The floor-retention fixture spans the complete lateral impact trajectory; a
separate finite-platform test expects a fighter to walk off and fall. Shallow
grazing contacts across connected slabs may finish through the ordinary solver
only when the endpoint contact remains on the same face. Thin-wall far-side
overlaps retain swept collision protection.

Touch of Death setup defaults to a best-of-five AI match. In the Combat inspector,
choose Fight mode and Default AI difficulty; advanced projects use the same
`scene3d.set-combat` declaration with `match: { difficulty: 5 }`. Omit `match` for
practice. Matches require two fighters with exactly one player.

The menu supports Left/Right or D-pad difficulty selection and Enter/Cross/Options
to start. Options skips the four-second camera intro; rounds have a three-second
countdown. First to three wins opens Replay and Main menu. Draws repeat the round
without scoring. The lethal strike retains its full impact pause, then the winner
has 180 live simulation ticks to move and attack the ragdolled opponent. Contact
pauses do not consume this window. The corpse remains hittable at zero health and
uses ten constrained physical bodies against the current arena and moving platforms;
it cannot act, guard or tech, and the round winner cannot change after the knockout.
A further 180-tick interlude preserves arena damage, tools and positions. A living
winner recovers stamina at the normal authored grounded idle or airborne pace once
its finishing move completes; recovery caps at maximum and never revives the loser.
Countdown and final-result gaps also permit normal stamina recovery without attacks.
The loser
gets up during its final 90 ticks; round resources refill and combat resumes in
place without another countdown. Only the match winner celebrates, blending into
the equipped gesture over 30 ticks after the live window. A terminal loser stays
fallen. Ragdoll transforms, phase timers and velocities survive portable saves and
rollback; a new match resets the arena and selects its starting location.
The intro's orbit continues through the countdown and settles into the fitted live
camera without a cut. Skipping retains the current cinematic pose for that blend.
During combat Options pauses. Match scores, phase, input edges and AI decision
memory are included in portable saves and deterministic restores.

Level 9 observes committed combat state, has zero policy delay, predicts reach,
parries on contact and pursues physical launcher combos through ordinary combat
and movement inputs. Each lower level adds three simulation ticks of reaction
delay (24 ticks at level 1). Judgment becomes less reliable; levels 5 and below
make increasingly frequent unsafe commitments. This is a deterministic tactical
policy, not a proof of unbeatable play against every authored move or arena.

Run `bun apps/engine-editor/verification/fighter-primitives/match.ts` against the
managed editor for match acceptance. It exports the canonical offline demo,
checks countdowns, a 3–0 result, replay/menu, save/load, narrow layout and owned
browser cleanup. The final focused match/combat run passes 70 tests / 878
assertions; the earlier expanded-combat evidence below describes its own suite.

Run from the repository root:

```sh
bun test packages/engine/src/combat packages/engine/src/runtime/combat-rollback packages/engine/src/physics/collision3d packages/engine/src/navigation/roam3d packages/engine/src/progression
bun test --conditions=browser apps/engine-editor/src/scene3d/combat apps/engine-editor/src/scene3d/roam apps/engine-editor/src/scene3d/progression
```

The actual `3d-action` starter regression exercises cooked physics, damage,
controller knockback, portable reload of held attacks/guard, rejected restore
atomicity, and combat Build preflight. Focused tests also cover delayed-input
replay, query geometry, route determinism/budgets, and reward retry conflicts.
These checks do not certify a complete networked fighting game.

The expanded Touch of Death candidate passes 66 focused tests (936 assertions),
including an unbroken physical launcher/pursuit knockout and the identical route
dropping against a laterally displaced target. Direction/Drive sampling, authored
string windows, fixed timing under stamina gating, one contact refund per attack,
directional influence, sprint-jump momentum, contextual Cross tech and delayed
input replay have regressions. Editor test typechecking passes;
the app source check still reports the unrelated website `batch6/capture.ts`
typing error.

Run `bun apps/engine-editor/verification/fighter-primitives/touch-of-death.ts`
against the managed editor URL after creating the canonical fixture under
`.local/touch-of-death/project`. The saved `create.json` plan uses the same setup
command plus ordinary project edits to remove starter decorations. Evidence
includes visible setup, edit/undo/redo, keyboard movement, pointer guard,
pause/resume, and the downloaded HTML running with HTTP(S) blocked. The final
artifact is `.local/touch-of-death/touch-of-death.html`; the canonical project pair
is retained beside it. Browser evidence covers desktop and 390px layouts.

The repeatable browser check is
`bun apps/engine-editor/verification/fighter-primitives/browser.ts` with
`EDITOR_VERIFY_URL` set to the managed editor URL. It uses an owned headless
browser and a disposable in-browser project. Evidence goes to
`.local/fighter-primitives/`: desktop and 390px inspector screenshots, gameplay,
the exported offline HTML, and an evidence JSON report. It asserts practice setup,
advanced tuning, progression validation/recovery, damage and restart in both Play
and the downloaded HTML with all HTTP(S) traffic blocked. The Windows run checks
actual window visibility and browser cleanup.

When a combat browser fixture overrides `requestAnimationFrame`, resizing the
viewport alone does not render a new camera projection. Before a screenshot,
advance the fixture, require `frameCount` to increase, and check that the canvas
backing aspect matches its CSS bounds with uniform device-pixel scaling. A stale
desktop frame stretched by CSS is not evidence of a portrait renderer failure.
The Touch of Death guest fixture's `resize` helper enforces this boundary; native
animation-frame resize evidence also belongs beside controlled-clock captures.

The 2026-09-22 candidate passed engine compilation, installed
package-consumer acceptance and browser acceptance, including simulated Drive and
contextual sprint input in Play and offline HTML. Broad repository gates remain
separate: unrelated website capture typing, existing code-style/source-structure
debt, and older project/timeline bundle limits prevent claiming a clean repository
gate. The [bundle evidence](bundle-size-evidence.md) records measured feature growth
and the unchanged failing limits.


AI hitstun parity is covered in combat-ai.test.ts: all nine levels retain hitstun
when delayed attacks arrive, observations remain unchanged, and escape/tech inputs
produce the same combat state as manual inputs. Escape consumes its charge; tech
requires a collision. AI decisions never directly clear stun or move physics bodies.

Standalone HTML defaults to `connect-src 'none'`. The editor explicitly enables
combat connections when exporting a supported two-fighter 3D match without custom
behavior modules. Its CSP permits `wss:` and development sockets on
`ws://127.0.0.1:*` or `ws://localhost:*`, plus same-origin requests for hosted
guest discovery and admission. Cross-origin HTTP fetches and other insecure sockets
remain blocked. An HTTP-hosted game reads same-origin demo discovery on load;
credentials and socket admission require the player's join action. Downloaded
file exports skip discovery. Offline play and embedded assets remain local.
Other hosts can request the same policy with `allowCombatConnections: true` in
`createStandalonePlayableHtml`; unsupported projects fail closed. Policy regression
coverage lives in `src/project/standalone/playable.test.ts`; real browser connection
acceptance must use newly generated HTML rather than editing its CSP afterward.


Thrown objects aim toward the living opponent at release, including vertical separation; they do not home in flight. AI observes current weapon ownership, shortened reach, position, and velocity, predicts physical projectile contact, and uses the same guard and fresh-parry inputs as humans. Interaction hitstun is authored separately with `grappleHitstunFrames` and `projectileHitstunFrames` (Touch of Death: 59 and 29); legacy projects retain 36 and 18. These values do not change the 12-frame grapple-tech recovery or projectile blockstun.

Terrain attack contacts use the same reach, radius, and upward capsule height as fighter hit volumes, including shortened weapons. Every active tick can find a newly contacted live box; a solid intervening surface blocks contact behind it. Only authored impact surfaces return contacts for hitstop, including hits too weak to break them. Nonbreakable geometry still occludes attacks; resting floors and scheduled surfaces never steal a destructible contact or pause a whiff. Contact keys persist through rollback and prevent repeated pauses from one strike. A second distinct strike removes an already weakened impact surface; scheduled transformations retain their authored timing. City impact thresholds are 4 for infill walls, 5 for columns/statues, 3 for barrels, and 2.5 for smaller props.
