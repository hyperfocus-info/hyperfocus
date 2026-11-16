# Touch of Death: combat evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Living city, fair reactions and movement feedback (2026-09-27)

The current local candidate removes level 9 AI access to the human's unexecuted
input. Fresh and buffered jabs after grab-tech release start on equal frames for
both seats; AI still reacts to visible committed attacks. Camera clearance cannot
collapse eye onto target, and winner facing blends through round recovery.

Fast cars, buses and freight now pass between waiting periods, with deterministic
quiet/busy match variants. Swept collisions apply the authored heavy's damage,
stun and impulse to either fighter, including intersecting low jumps; standing on
a vehicle is safe. Saved contact latches prevent repeated damage from one pass.
The city has 264 destructible barrels, crates, statues, benches, tables, ladders
and columns with persistent wreckage. Actual-camera tests check at least five
visible intact or broken groups across starts, rooftop offsets and street samples.
This sampled coverage is not an exhaustive proof of every possible camera pose.
Conservative render-only culling skips distant offscreen props; physics remains active.

Tap jumps are approximately 80% lower and fully held jumps 20% higher than the
previous candidate, measured through the real movement runtime. The 30-frame hold
cap remains. Back + heavy is a forward armored kick: lights still hurt without
interrupting it, while heavies crush its armor. Recovery is vulnerable.

Damage feedback reaches the old peak at 60% damage and triples near death;
low stamina desaturates the scene. Shake is quadrupled. Reduced-motion preferences
still suppress shake/blur. Browser automation is muted by default. Evidence and
the current artifact identity live under `.local/touch-of-death/alive-city/`.
Runtime identity `combat-v16:` separates these rules from prior exports/replays.

### Post-KO flow and controller menu refinement (2026-09-27)

Finishing-hit stop precedes a three-second live post-KO window. Existing attacks
complete their visual recovery before the interlude; ordinary rounds do not
celebrate, and match-winning celebrations blend into the pose. The defeated
fighter still recovers only between rounds. Online round presentation keeps
the fight visible and its earned score in the HUD throughout this sequence.
Runtime identity `combat-v12:` separates these simulation rules from old exports.
Pickup execution, AI decisions, and the selected-object prompt share one reach
and intent check; floor-height tools no longer lose horizontal reach to their
height difference. Dropped tools settle onto current physical support. Online
hosts and browser input now admit the same interaction action.

The Pause hub groups Practice presets into three pages and puts secondary tools
under More options. Controller focus follows visible controls, Back returns to
the originating page, and text fields offer an on-screen keyboard. Online menus
suppress local combat input while the shared simulation continues. Native file
pickers and browser permission prompts remain platform-owned.
Local artifact and focused browser evidence for this pass live under
`.local/touch-of-death/flow-polish/`.

### Movement, impact readability and local profiling (2026-09-27)

The current local canonical project uses separate Cross jump / Circle movement,
30-frame variable jump height, 30% higher movement speeds, 20% stronger air dash
and 10% less dash damping. A paid wall run restores the air dash. Maximum held
jump height is approximately 50% higher; travel poses lean into actual movement.
Empty-handed Grab commits to a visible attempt outside grab range. Direct strikes
can damage eligible structures through the same physical impact thresholds.

Round recovery preserves the arena, while the final defeated fighter stays down.
The recovery camera sweeps against live surfaces. Local results fade over a
blurred arena with a vertical controller action column. Opaque scenery now draws
before blended effects, making guard and parry rings visible rather than
overwritten. Local editor exports include original TypeScript source maps by
default; normal production builds remain minified without maps.

The city frame slowdown included exceptions for every missing optional physics
body and repeated scene-wide searches. The measured fixes and A/B evidence are
owned by [engine performance optimizations](../../../../../docs/engine-performance-optimizations.md).
Task evidence lives in `.local/touch-of-death/response/` and
`.local/touch-of-death/overhaul/`; fixtures and artifact hashes distinguish visual
checks from earned combat and AI pursuit. These local checks do not establish
public-service, physical-controller or Steam release acceptance.

### Independent online controllers (2026-09-24)

Nine exported-browser checks pass with independent Standard Gamepad API streams
in two guest browsers: each controller moves only its own seat; remote Guard
absorbs a real strike (integrity 100 to 88, health 100 to 97.2); disconnect releases
Guard; a fresh strike reduces health to 89.2; released Strike does not repeat.
Inputs pass through normal controller polling and networking. Combat snapshots
are read-only, with no injected damage or stun. The tested HTML SHA-256 remains
`71a3788e3b5428437ee2771fba4dfa32e4c658b7141f4097c8e0d4bfcc83f6a8`.
Evidence: `.local/touch-of-death/online-gamepad-audit/`. No browser errors occurred;
owned browser processes were cleaned and the shared host remained running.
This closes the online Gamepad API evidence gap, not physical-controller,
cross-device or internet acceptance. No production or authored-data changes were
needed for this verification.

### First-match choice and stable menu order (2026-09-24)

A seeded simulated beginner audit selected level 1, read the visible controls,
landed a physical hit with a fixed approach/Strike/guard/Heavy rhythm, lost 0–3
and entered Practice from results. No AI tuning was justified. It did reproduce
a P2 choice problem: the adjacent Quickmatch button ignored displayed level 1
and began level 7, without disclosing its random range. Source inspection also
found that retained Practice buttons moved ahead of the intended menu order after
results; a new regression failed on that exact lifecycle before the fix.

Selected changes: Start match now appears first and the menu says it uses the
displayed level, with level 1/Practice guidance for newcomers. The alternative is
named Random AI · levels 3–9. The presentation host now restores authored button
order while retaining node identity, focus and held controls. Default difficulty,
the seeded 3–8/rare-9 ladder, combat rules and project data remain unchanged.
These two small fixes ranked above speculative difficulty changes because both
had concrete reproductions and bounded verification.

The same persona (`tod-first-fight-20260924-a`, beginner computer skill, literal
instruction following and confusion aversion) repeated the mission on the new
export. Selected level 1 remained 1; the first 24 damage occurred by input frame
210; the player lost 0–3 and reached the visible Practice prompt. Initial and
returned menus keep Start first. Native Tab skips disabled Easier at level 1,
and the explicitly labeled random choice selected level 6. Desktop and 390px
screenshots were inspected with no clipping. No browser errors or failed requests
occurred; owned browsers were cleaned up. This is one simulated-user repair check,
not a human learnability, difficulty or retention verdict. Online collaboration,
assistive technology and long-term repeated use were not exercised.

The initial after-run fixture incorrectly expected Tab to focus disabled Easier;
its failure is preserved and reconciled by the corrected native keyboard follow-up.
Discovery also initially misidentified Quickmatch from text alone; screenshot and
native click corrected that inference before disposition. See
`.local/touch-of-death/first-fight-audit/after/findings.tmp.md` and the original persona,
screenshots, action plan and read-only outcome snapshots alongside it.

Validation: 29 focused engine/UI/controller tests passed, 8,586 assertions,
including AI level 9 physical conversions and parry behavior. Engine source/test
and editor test types pass, as do engine/editor builds, validated Build/download,
process policy and changed-file whitespace checks. HTML SHA is
`876266cc6343728c2408e7b3bc40595b6c166b245e51178b5ab6077c80eec9ba`.
The clean package is `.local/touch-of-death/releases/first-fight-20260924/`;
payload digests and empty account-data folder were checked, and its game HTML
matches the refreshed shared host. This pass exercised hosted HTML, not a new
outside-checkout host-install journey. Existing package-size/public-service and
hardware/art release gaps remain unresolved.

Manual check: select level 1, choose Start match and confirm the selected opponent.
Use the displayed movement/attack/guard controls, then enter Practice after a loss.
Return to the menu and check button order by Tab. Choose Random AI only when
intending its advertised levels 3–9. Changelog: clarified selected versus random
AI matches and fixed menu ordering after results/Practice without changing rules.
