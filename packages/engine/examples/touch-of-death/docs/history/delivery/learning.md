# Touch of Death: learning evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Full-health conversion: physical feasibility (2026-09-24)

The `cd6a0eed` export now has a continuous full-health kill demonstrated with
native keyboard inputs and physical contacts. The fourth bounded attempt hit
for 24, 8, 10, 24, 8, 10 and the final 16 health. After the first launcher and
chase, a second launcher preserved height; the attacker changed chase/aim from
right to up as the trajectory changed, then selected toward Heavy to finish.
No damage, stun, position or resource was injected and no gameplay tuning changed.

Scope matters: this was Neutral Practice, with a defender initially holding
100 health, 100 stamina and one escape charge, but supplying no defensive
inputs. The escape remained unused. This proves a conversion is mechanically
possible; it does not prove a guaranteed route, success against active defense,
or human learnability. Separate randomized lesson trials already demonstrate
successful defender techs. Three earlier attempts here lost the opening at
76, 76 and 34 health and were stopped rather than counting later neutral hits.

Every observed living state after the opening remained in hitstun. The minimum
observed remaining hitstun was five frames; preceding hitstun exceeded each
unobserved simulation interval. At the final transition, frame 231 has 16 health
and 12 hitstun frames; frame 232 is the physical KO. Read-only snapshots guided
this skilled mechanical audit; gamepad input was isolated from the keyboard
test. Browser/request errors and owned browser processes/windows were empty.
Evidence: `.local/touch-of-death/full-conversion-audit/`, including actual inputs,
all failed attempts, continuity verification and the final rendered capture.

Manual exploration: in Neutral Practice, earn a neutral Heavy launch, wait for
recovery, chase and aim the two-Strike string. Choose another neutral Heavy when
height is needed; read the changed trajectory before the next chase. Choose
toward Heavy when its damage can finish. Repeat with steering, tech and escape
presets to see which decisions stop working. The recorded timing is evidence,
not an automatic route or a universal combo prescription.

Remaining core-learning gap: Practice still uses a generic dropped/defended
message. A defender-tech explanation must be bound to the current conversion;
the retained last-attempt record alone can be stale. No speculative attribution
was added. Newcomer execution and adaptive success against active defense remain
open acceptance work.

### Cashout coaching follows the authored string (2026-09-24)

Audit: launch and chase worked in the shipped arena, but the surface prompt
omitted the second Strike. Two physical attempts reached stage 2, requested
toward Heavy during the first Strike, and never started Heavy. The first Strike
only transitions to a second Strike; the defender subsequently teched. This was
a teaching contradiction, not permission to remove attack commitment.

Ranked candidates: (1) correct the cashout instruction: high learning impact,
frequent during this lesson, low implementation risk and directly replayable;
(2) identify defender tech in the dropped-conversion explanation: useful to both
skill levels, but requires reliable event attribution; (3) change buffering or
cancel windows: broad mechanical risk, unjustified by the successful authored
route. Only the first item was selected.

The mapped Practice card and portable lesson hint now explain first Strike →
second Strike → toward Heavy, with both recovery windows and a tech caveat.
No timing, AI, resource, simulation, project data or input permissions changed.
The ordinary-input diagnostic completed the cashout lesson with physical damage
24 + 8 + 10 + 30, reaching stage 3. Earlier defenses still defeated the route;
this is neither an automatic conversion nor proof of a full-health kill.

Focused validation: 22 tests / 184 assertions pass, including engine physical
drill success/failure, lesson observations and keyboard/controller/remapped copy.
Editor source types, engine/editor builds and process policy pass. Validated
editor commands and Build/download produced export
`cd6a0eed026e8c39f7f701fa13fa780635f0e739be1a712abb0eb0985a0a0737`;
complete runtime comparison passes (1,201,646 bytes), canonical project hash
remains `1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.
The idle shared guest host was restarted and serves those exact bytes.

Evidence: `.local/touch-of-death/conversion-cashout-audit/`. Initial trials with
unexpected controller-mode prompts/directional attacks were excluded; their
device cause is unconfirmed. Valid trials isolate keyboard input and inspect
snapshots for skilled mechanical verification, not a human-newcomer study.
The corrected audit uses actual buttons, attack phases and contacts throughout.
Final-export replay passes ten browser checks with zero page/request errors:
the same third defense reaches cashout completion, while the first two defeat
the conversion. Desktop and 390px captures show the full corrected prompt.
Owned browser processes/windows are empty after cleanup. These checks establish
mechanical feasibility and readable copy, not novice execution or retention.

Manual check: Learn combos, neutral Heavy at range, wait for recovery, dash
toward the airborne opponent and land Strike. Read the selected branch. For
cashout, link a second Strike during recovery, then aim toward + Heavy during
that Strike's recovery. Confirm the learned response only after real contact;
retry against changed steering/tech rather than expecting guaranteed success.

Changelog: corrected Practice cashout instructions to teach the required second
Strike; preserved all combat commitment and defensive opportunities.

### Tech lesson: learning from visible feedback (2026-09-24)

The current `3c2de941` export passes a bounded simulated-newcomer tech mission:
two early attempts, then successful left- and right-directed techs. Later input
timing was chosen only from visible failure feedback; snapshots were inspected
afterward to verify ordinary Heavy damage, floor contact and recovery direction.
All four attempts retained 76 health. No damage, stun, position or resource was
injected. This validates the existing coaching without changing combat rules.

Manual check: Practice → Learn tech, close controls, let Heavy launch you, then
tap E or Space near floor contact while holding A or D. Use R to retry, adjust
from the retained timing result, and repeat in the opposite direction. Controlled
render timing is an automation aid; human novice timing and full adaptive
conversion learning remain unproven. Evidence and four attempt captures:
`.local/touch-of-death/tech-learning-audit/`. No browser/request errors; owned
browser cleaned. No source, project or export changes were required.

The companion skilled-input audit on the same export proves an ordinary Heavy
launch (24 damage), recovery, immediate dash and Strike (8 damage), reaching
lesson stage 2 while the target remains airborne and hitstunned. Other timings
missed or lost the conversion. Full cashout completion remains unproven. A
surface-associated recovery suggests a defender tech, but no defender attempt
event was captured, so that attribution is not confirmed. The generic “dropped
or defended” message is a candidate for more specific Practice feedback; no
mechanical change is justified by this evidence. Three owned browser runs had
no page errors and cleaned up successfully. Evidence:
`.local/touch-of-death/conversion-reliability-audit/`.

Loop closeout: 75 focused UI/upload/Practice tests pass (609 assertions), including
physical-contact engine drill success and failure cases. The
served guest demo matches the validated export byte-for-byte. Full adaptive
conversion learning and public deployment acceptance remain open.

### Practice discovery and factual missed-attempt feedback (2026-09-24)

The prior novice audit found lessons below a dense control reference and silent
missed defensive attempts. Selected two low-risk improvements: (1) first-step
guidance and lesson ordering, encountered by every newcomer; (2) factual
Practice-only feedback for unclassified contacts. Broader combo-failure diagnosis
remains deferred until contact evidence distinguishes aim, range and defense.

Free Practice now shows current movement/strike/Heavy/Guard bindings. Guided
lessons lead the choices, and choices precede the reference. The same preset
actions, ordinary dummy inputs and save data remain. Failed parry/tech coaching
uses existing press/contact timestamps without changing eligibility, rings or
save schemas. Precise results and latest rejected-input explanations take
precedence; new contacts can replace stale success, reset retains the result and
changing lessons clears it.

Validation: 37 focused tests / 295 assertions, editor source/test typechecks,
engine build and process policy pass. Source structure retains only the unrelated
PadPilot directory violation. Desktop and 390px entry checks passed 15 browser
assertions on `fc5d5168`; final export
`803905323c8d8ccfc43bc55e48a3dca7db8cb984d3b7f34c77fbd7b729abda59`
passed 20 additional checks. Real guard input at frame 7 preceded a hit at 88;
real Tech at 103 preceded a floor bounce at 152. Both produced factual feedback.
A real parry retained precise success. An active AI match dealt damage with no
Practice subtitles. Owned browsers cleaned; no page/request errors. Canonical
project data is unchanged. Evidence: `.local/touch-of-death/practice-entry-audit/`.

Manual check: enter Practice at desktop and narrow widths; read the short prompt,
open settings and choose a first-row lesson without scrolling the reference.
Close settings, move and strike, then release direction and Heavy to launch.
Try an early released Guard, no Guard, an on-time parry and an early Tech before
real floor contact. Check truthful feedback, reset retention and lesson clearing.
Enter a normal AI fight and confirm teaching text disappears.

Changelog: surfaced guided lessons and mapped first-step controls; added factual
missed-attempt feedback without changing combat rules. Full novice tech/conversion
learnability and public demo acceptance still require further evidence.

### Practice control handoff and upward coaching (2026-09-24)

The seeded novice audit on export `05c68304` achieved real movement, jab, block,
launcher and parry contacts, but did not achieve a tech or aimed continuation.
Its bounded score was 59/100; this is a simulated journey, not a human playtest.
Closing Practice controls left the summary focused and silently suppressed combat
keys. The same guard input worked after an extra canvas click.

Ranked candidates: (1) repair control focus handoff, high impact on every settings
visit and low implementation risk; (2) correct upward Jump coaching, high impact
on the affected conversion branch and low risk; (3) move first-step lessons ahead
of the dense reference, frequent novice benefit but requiring a separate layout
pass; (4) diagnose missed defensive/conversion attempts, substantial learning value
but requiring contact-aware evidence to avoid inventing a failure reason.

Selected the first two. Explicit disclosure closure now returns focus to the
arena if the summary still owns focus; opening, programmatic closure, focus moved
elsewhere, hidden presentation and disposal do not steal focus. Upward coaching
now says release direction, press mapped Jump, then aim. Direction plus airborne
Jump still dashes; repeated attacks remain valid when their contacts support them.
No authored values or canonical project data changed.

Focused app and engine tests cover focus recovery/exclusions, current keyboard
and controller bindings, neutral jump versus directional dash, commitment and
existing repeated-Heavy lesson completion. Browser follow-up evidence lives in
`.local/touch-of-death/novice-practice-audit/`; the original failures are retained.
The export uses validated editor commands and Build/download. Full novice
acceptance, human timing and the original public demo release boundary remain open.

Validation: 68 focused tests / 2,329 assertions pass, including AI permissions
and real surface contacts; editor source/test types and engine build pass.
Fresh export `c4d20311c42ae65664ae572a78bdf2d0e303e07bf07e2177a1430ba493ff8b99`
passes 20 browser assertions: pointer, native Enter and Space closure each permit
immediate guard, movement and a physical jab without explicitly focusing the canvas.
Open controls retain keyboard ownership. Runtime is 1,195,352 bytes; canonical
project hash remains `1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.
Browser errors and remaining owned processes/windows are empty. Process policy
passes; source structure still reports only the existing unrelated PadPilot
38-file directory against its 36-file baseline. Package size release limits and
public deployment gaps remain as previously recorded.

Changelog: fixed keyboard control recovery after closing Practice controls;
clarified neutral Jump before aiming upward follow-ups, using current bindings.

Manual check: enter Practice, open controls, choose a lesson and close using mouse,
Enter or Space. Immediately move/guard without clicking the arena. Reopen controls
and check native keyboard interaction. Launch with released-direction Heavy; after
recovery chase, release direction for an upward Jump, then aim the next attack.
Compare direction plus Jump, which must still dash. Try early and on-time parries
and techs against actual contacts; record missing feedback rather than assuming
every failed press has a diagnosed cause.
