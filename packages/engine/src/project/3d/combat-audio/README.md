# Combat audio routing

`combat-audio.ts` owns portable play events, with no browser or audio graph access.
`emitter.ts` owns the bounded queue, per-bank deterministic variation and voice
priority. `movement.ts`, `routing.ts` and `environment.ts` select semantic sounds
from accepted motion, confirmed contact and fresh interaction transitions.

Optional `variants[cue]` and `voiceVariants[fighter][cue]` contain one to eight
distinct asset IDs. A bank replaces that slot's single assignment; include the
single take in the bank when it should participate. Selection never repeats the
previous take when the bank has at least two. Checkpoints retain bank cursors,
pending sounds, voice cooldowns, movement distance and ambient cadence. Legacy
single assignments and movement/interaction fallbacks remain valid.

Resolved hit events carry optional `hitstunFrames` for that contact's duration,
independent of accumulated remaining stun, plus `armored` when damage lands but
interruption and launch are prevented. Body, grab, projectile and traffic paths
provide this metadata; legacy events preserve their existing sound. Normal hits
map zero to 180 resolved frames to bounded gain (.72–1 times authored SFX) and
playback rate (1.04–.86). Armor uses its separate cue and never adds normal
impact/blood/counter layers. Block/parry chip retains its defensive identity.

Weapon `acousticProfile` selects wood, metal, glass, ceramic, soft, liquid or
scatter independently from mechanics material. Profiles choose contact, drop,
break and liquid/scatter deployment cues with legacy material fallbacks.
Environmental surface profiles choose masonry, wood, metal or glass fracture;
motors without a traffic actor stop with `motorShutdown`, while fire supply
removal adds one causal `hazardIgnition` cue. UI cue assignments (`uiFocus`,
`uiConfirm`, `uiBack`, `uiAdjust`, `uiDenied`) are consumed by host menu actions.

Combat vocals use the SFX bus with `category: 'voice'`, retaining their cooldown,
priority and same-frame replacement identity while sharing the SFX volume.
Portable sound events carry bounded `playbackRate` and `impactStrength`; hosts
own DSP and category-aware queue admission. Authored `audio.mix` defaults each
Master/Music/SFX/Ambient level to .5. `readCombatAudioMix3D` and
`readCombatAudioEffects3D` resolve validated host settings; effects default to
music compression, reactive music, .05048 room send, .15 impact saturation,
−35-cent low-health music pitch and 160 Hz stamina high-pass maximum. The city
impulse response is an ordinary optional protected audio asset reference.

Air/wall jumps use accepted motion cue kinds 4/5. Availability kinds 2/3, wall
slide entry and wall travel have optional separate cues. Ordinary steps, sprint
and landings use the current physical support: wood/timber material IDs identify
wood, material metallic values of at least .5 identify metal, and active flood
overlap uses the same box and fighter bounds as hazard mechanics. A floor below
a roof cannot classify its footsteps. Concrete keeps the existing generic cues.
An upward-normal bounce or tech already voices that fighter's floor impact, so
it suppresses the ordinary landing cue on the same step. Grounded memory still
advances; wall impacts and another fighter's landing remain separate sounds.

Generated weapon moves retain `weaponBaseMoveId`; initial swing wear cannot
produce a contact cue. Heavy contacts use authored damage or launch magnitude,
so a finisher removing two remaining health points still has its heavy impact.
Grab acquisition/miss, counter, pickup/throw, material terrain drop, spray,
consumption and successful ground-zone deployment have independent assignments.
Loose drops occur only when falling/throwing objects physically hit terrain;
resting objects and portable restoration never reannounce old contact.
Drop sounds use the transition's actual impact position for panning and squared
falloff within 16 metres. Personal swings, hits and pickup feedback retain their
authored levels.

Attack/effort, hurt and KO voices have priorities 45, 80 and 100. Hurt replaces
queued attack/effort from the same fighter and may interrupt their cooldown;
repeated hurt still respects its own cooldown. Strong impact/result accents and
voice events supply bounded music-duck metadata for the host.
Steps/swings have priority 15; ordinary hit/block 50; parry/tech/escape 65;
heavy impacts 70; counter/guard break 80; round/match results 90 and KO 100.
Defensive feedback ducks music to .82 for .12 seconds; strong accents use .65
for .18 seconds. Movement and ambience never request ducking.

Traffic pass grains run every 30 live frames within 16 metres while moving.
Braking is a moving-to-stopped transition, with 90-frame debounce; crash sounds
require a vehicle break transition or confirmed traffic impact. Machinery
grains run every 60 live frames within 12 metres, only from moving nontraffic
surface roots with linked `stopMotionIds`. Decorative animations do not qualify;
stopped roots and disabled collision bodies stay silent. No global `cityBed`
grains emit. At most two combined traffic/machinery grains start per step, with
squared falloff over full three-dimensional distance, quiet gains and priority 5
on the Ambient bus. These are finite one-shots; interludes, menus and match
results emit no ambient grains. Environmental break/warning/ignition/crash
one-shots fade over 16 metres; personal combat, weapon and direct wall-contact feedback keep
their authored levels. Fire retains its nearest-two 24-frame hazard cadence.

Hosts call `gameplay.setAudioListener({ fighterId })` before stepping to select
the local online or controlled replay fighter. The listener defaults to the
authored player; passing `{}` restores that default. City sources, world
one-shots, panning and hazards share this selection. Listener ownership is host
presentation state and survives simulation checkpoint restoration.

Result assignments or variation banks enable music phase dynamics. Meaningful
phase changes emit the same looping asset with a new gain and .4-second fade;
hosts update its active voice rather than restart it. Optional `musicResult`
crossfades to a result track. Expanded audio starts at its phase's gain immediately
(menu .7, intro .85, countdown .95, combat/practice 1, round result .65, match
result .8, each multiplying authored Music gain). Legacy audio without these additions retains its
single music start. Round/match wins and losses emit one accent per transition.

From `packages/engine`, run `bun test src/project/3d/combat-audio
src/project/3d/combat-rollback/audio.test.ts
src/project/3d/combat-environment/hazards/audio.test.ts
src/project/3d/combat-environment/vehicles/vehicle-audio.test.ts`. Tests cover the
silent air-jump and generated-whiff reproductions, finishing impact weight,
same-frame vocal precedence, checkpoint parity, support height, near/far/height
falloff, stopped and undeclared machinery, listener changes, ambient bounds,
validated banks and causal drop/deployment transitions. The editor's
`src/scene3d/combat/audio-runtime.test.ts` additionally covers real sprint/jump
cadence and three controlled KOs through the complete match lifecycle.
