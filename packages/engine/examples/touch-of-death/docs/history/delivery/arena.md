# Touch of Death: arena evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

## September 30 arena evidence

Latest local arena candidate: `.local/touch-of-death/touch-of-death.html`, served
at `http://127.0.0.1:8801`. The art-direction pass retains crude primitive geometry
and district inventory while adding restrained district materials, useful orange
accents, observation clues, full-body/pickup cutaways, an eased depth-alignment
camera and Practice-panel avoidance. Rendering shares equivalent fully opaque
city materials without merging independent fades or changing saved state.
The [delivery report (temporary; prune after findings are promoted)](../../../../../../../.local/touch-of-death/art-direction/report.tmp.md) and
[73-image gameplay gallery](../../../../../../../.local/screenshots/touch-of-death/art-direction-2026-09-30/index.html)
record the audit, preserved visual deductions, native routes, tests and timing.
Artifact SHA-256:
`582fb5e3e727179ed11937c6ad60df04840451c09a1d9df229871538830c26a2`.
The canonical pair includes the concurrent thread's newer music metadata/audio
configuration; geometry and non-audio combat data remain intact. Focused camera,
runtime, authoring/HUD checks and implementation typechecks pass. Actual median
draws fall to 273 from roughly 2,180; variable control timing prevents a clean FPS
speedup claim. The broad editor gate retains 50 failures and existing AI pursuit
debt. This is local arena acceptance, not a whole-editor release-wide passing gate.

The September 30 temporary-inventory candidate uses `combat-v34:`. Product:
Touch of Death; local release artifact:
`.local/touch-of-death/district-weapons/touch-of-death.html`. Players find thirty
object types across eleven kits, with five district pools and three arrangements
each. Every new match exposes thirty district pickups; rounds retain finite stock.
The acceptance boundary is editable portable inventory, seeded placement, ordinary
combat/defense for spray, consumable lifecycle, saved state and playable export.

The final command handoff and canonical snapshot live beside the artifact.
173 combat/interaction/layout/presentation tests, 28 focused editor/inventory tests,
editor source/test typechecks and engine test typecheck pass. Owned headless
desktop/narrow checks boot and start the exported game without browser errors or
document overflow. Export verification matches the current standalone runtime.
Artifact SHA-256:
`9c60cfe1fbcf2122ede31eda3dca5ef95dce078d5f48c84ab426176ba95c7081`.

The broad editor ship gate remains failing in this dirty workspace. Four city
AI/jump failures reproduce with weapons/layouts, furniture and neighborhood
geometry removed; `route-attribution.txt` records controls. The source structure
gate reports the unrelated PadPilot evaluator's 38 files against its 36-file
baseline. Process policy passes with zero violations. Public deployment and
human balance/readability acceptance remain outside this local delivery.

The local collision fix uses `combat-v32:`. Already touching fighters can no
longer cross a thin wall or floor and be ejected from its far-side overlap.
The new solver regressions and authored-city wall/street checks pass; stair,
sliding and replay coverage remains intact. Engine and editor typechecks pass.
The broader regression run has 355 passes and three pre-existing movement-test
failures, reproduced with the prior collision logic. Repository style/structure
checks still report existing unrelated debt. Evidence is in
`.local/touch-of-death/collision-fix/`. The verified standalone export and local
host match SHA-256
`275446afa08de1a750296cfa2cd74afee08ce6c49719525c59e93852a22bad45`;
the browser loads without errors. Public deployment was not updated.

The current local combat tuning candidate adds 30% recovery, damage-weighted
hitstun (+20% through −5%) and base launch (−25% through unchanged), 10% weaker DI,
six extra dive startup frames, slower held acceleration, and one 22-damage wheel
contact with restrained motion. Relative closing velocity mildly scales hit
damage, stun and launch. Queued baseline AI resets now omit absent policy data so
ordinary portable saves work. The saved project and local host use `combat-v30:`.
Artifact SHA-256: `d0cd0c48e741631fb8443d9ac038cc8726951cb714aab8ae077ebcae82cbc3a7`.
Evidence: `.local/touch-of-death/tuning-pass/report.json` and `browser.json`.
109 focused tests, physics/replay coverage, engine/test typechecks and 17 real
keyboard checks pass. Tuned sources match the exported source map; unrelated
workspace edits changed whole-runtime identity during export. The separate demo
jump-height assertion and broad repository style/structure gates remain failures;
this tuning evidence is not a release-wide passing gate. Earlier candidates follow.

Current local candidate (2026-09-29) includes a traversable underground passage,
solid vehicle wrecks and traffic queues, a jammed transfer carriage, and damage-
activated fire/shallow-water effects. Fire damages without hitstun or hitstop;
water slows grounded voluntary travel. State survives round recovery and saves.
AI observations now persist locally with bounded export/clear controls. Optional
Practice diagnostics expose hazard contacts and stopped-motion causes. Background
occupants remain scenery; protected galleries now sit within the rooftop camera
view behind the train line. AI7–9 considers locally visible active fire/water in
ground routing, with finite crossing costs. Dedicated nearby-fire and water-entry
audio use bounded one-shots and existing sound controls.

The stamina pass reduces base/air/hitstun recovery 10%, grants idle recovery 25%
above the new base, reduces acceleration 20%, and scales voluntary horizontal
speed/acceleration down by up to 20% with depletion. Low-stamina posture blends
into a hunch. Grayscale is gentler above the critical range. Held weapons now
follow the final blended victory pose rather than overriding the winner's arms.

The dash pass removes Touch of Death's side attack bucket while preserving
neutral attacks. Ground/air dashes cancel into twelve authored forward/back/neutral
roles; direction is sampled when attacking. A directionless dash travels forward.
The back-hop wheel follow-up requires a fresh Drive press, and held Heavy adds
dive acceleration. Weapons receive corresponding tool attacks with preserved
travel and combo roles. Inspector, practice guidance and shared AI inputs follow
the same rules. Core regression:190 tests/8,604 assertions; full engine/editor test
TypeScript checks pass. The design guide owns the move matrix and input semantics.

The action-state pass adds bounded stair climbing with temporary slowdown and a
six-frame dash follow-up grace. The later stair pass halves all seven flights to
half-metre risers and recognizes bounded sphere-corner support. Grabs have
interruptible startup, analog release/DI, 5.2 damage and six-frame Jump/Dash/Grab
techs. Attack recovery increased20% and hitstun15%; implicit special cancels and
pre-armed recovery techs are closed. Core regression:200 tests/8,971 assertions;
interaction regression:67 tests/1,526 assertions. Both authored city traversal and
shared action permissions are exercised in real physics tests.

Theater runs two independent level-nine AIs with spectator controls. Seeded viable
attack choices and high-level retreat pursuit reduce repeated approaches. AI
insights record contacts, misses and three-second attack droughts; the host saves
bounded device-local IndexedDB sessions with query/export/clear and next-match
resume. Controller pages expose all insight text. This is observation for manual
ingestion, not automatic policy training. See the current report for limits.

The AI adaptation pass adds seeded spawn preferences, bounded observed move
success/parry/whiff history retained across rounds, earlier legal feints against
parry habits, and combo checks against remaining hitstun and current trajectory.
Fresh matches resample preferences. Stalled navigation can try a clear supported
side route; fighters stacked above an opponent step off normally. Eight seeded
6,000-tick Theater fixtures show 18–24 move types and 1–8 feints per run; these
flat-physics checks do not establish city-wide pathfinding or human balance.

The spectator/learning pass removes fighter injury and exhaustion effects from
spectators, backs off failed jump attempts, and prioritizes connected stair routes
over unrelated prop jumps. Eleven spawn traits feed numeric action scores and
weighted probabilities; lower levels use more sampling noise. Legal permissions
and reaction delays remain shared. Feedback includes opponent metadata and exact
review receipts. Eight available logs were reviewed, including three retained
browser histories; conservative score priors were adjusted. Automatic training
and indefinite history are not implemented. Final checks: 115 gameplay/UI tests
and seven native receipt/origin tests pass; engine/editor test typechecks pass.

Artifact SHA-256:
`810dbd1908cd41070fae5c847df84cccf0c56d4755430296b9a093f74c4b9c6e`,
runtime identity `combat-v27:`. The corrected flood placement and coplanar-floor
CCD fix are included. Evidence, failed-attempt records and explicit remaining gaps:
`.local/touch-of-death/bulk-training/report.tmp.md`; prior spectator evidence is
in `.local/touch-of-death/spectator-learning/report.tmp.md`; prior adaptation evidence is
in `.local/touch-of-death/ai-adaptation/report.tmp.md`; prior action-state evidence remains
in `.local/touch-of-death/action-state/report.tmp.md`; prior dash evidence remains
in `.local/touch-of-death/dash-attacks/report.tmp.md`; prior stamina evidence remains
in `.local/touch-of-death/stamina-city/report.tmp.md`; prior functional evidence remains
in `.local/touch-of-death/functional-gaps/report.tmp.md`. The full-resolution album is
`.local/touch-of-death/verification-album/index.html`; earlier captures retain their
original build identity. The managed local server serves this candidate; public
deployment was not updated.

The sound-first optional guide, real loss review/retry, ordinary AI3 finale,
district details, roof catwalk, apartment breach and concealed utility clue remain.
Earlier evidence is in `.local/touch-of-death/city-exam/report.tmp.md`. Aerial hazard
planning, broader crowd/city simulation and richer authored scenery remain gaps.
Human learning, competitive balance, real-device performance and final art still
need direct acceptance. The unrelated PadPilot evaluator baseline remains the sole
source-structure failure; no baseline was raised.
