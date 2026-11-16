# Tutorial composition contract

Owner: shared learning presentation in `packages/ui/src/tutorial`; Touch of Death
evidence and demonstrations in `apps/engine-editor/src/scene3d/tutorial`.

Free practice and optional instruments use the [Practice workspace](practice.md).
Its dock yields to this coach while a lesson is active.

The October 4 owner request selects tutorials as the next domain, superseding the
proposed Replay library. The explicit requirements are automatic completion,
clear instructions and timing, a watchable combo, and diagnosis of failed attempts.
These are product requirements, not optional polish. The existing restrained
navigation and game typography direction remains accepted. The owner explicitly
selected “Live arena with compact coaching” over paused instruction screens on
October 4: keep play visible, expand demonstrations and attempt review. Preserve
that composition choice. Individual screenshots remain implementation evidence;
the directional approval is not blanket acceptance of every later revision.

## Authoring path

**Skill to learn → observable steps → canonical coach → evidence adapter → validation.**
Do not begin with a paragraph overlay or implement completion with a Next button.

| Required semantic content | Enforced behavior |
| --- | --- |
| Identity and one objective | One coach owns the lesson; no competing guide and Practice text islands. |
| One to six steps | Each has a short label, instruction, actual input, timing explanation and observable success criterion. Empty instructions and duplicate identities reject. |
| Host evidence | Only player observations complete steps. Stale attempts and demonstrations cannot award progress. |
| Completion message | Success is latched automatically. Active acknowledgement time precedes guide advancement; Pause, watching and background time cannot skip it. |
| Attempt feedback | State what happened and what to change. “Wrong” or “failed” alone is invalid. Never invent timing precision or a score. |
| Demonstration | Use real domain behavior; label Watch distinctly, allow pause/replay/return, restore the attempt, and report a failed example honestly. Unsupported examples explain their absence. |
| Input/timing | Use current bindings and real domain windows. A game uses simulation frames, not a decorative wall-clock countdown. A non-timed app can explicitly say “No time limit.” |

The shared state is DOM-free through `@hyperfocus/ui/tutorial/session`. It imports
no game or application. The shared DOM coach uses native controls, named progress,
stable focus, a timing meter, semantic feedback and a bounded action footer.
Expanded coaching handles keyboard traversal and Back. Button hints have a native
pressed-state toggle; hiding hints preserves the instruction and observed progress.
Hosts own the preference, current bindings/device, gameplay input exclusion,
persistence, evidence and demonstration playback. Optional completion choices and
reward text report host outcomes; the shared coach never grants currency.

```ts
import { createTutorialSession, createTutorialCoach } from '@hyperfocus/ui/tutorial';

const definition = { id: 'save', title: 'Keep your work',
  objective: 'Create an editable copy.', completion: 'Saved', steps: [
    { id: 'saved', label: 'Save', instruction: 'Save the document',
      input: 'Save', timing: 'After naming it; no time limit.',
      success: 'The host confirms durable storage.' },
  ] };
const session = createTutorialSession({ definition });
const coach = createTutorialCoach({ parent, watch: showExample,
  retry: restartAttempt, back: returnToWork });
session.observe({ attempt: session.state.attempt, completed: persisted ? ['saved'] : [],
  source: 'player', deltaMs: activeDelta, suspended: paused });
coach.render({ definition, ...session.state });
```

Hosts must supply meaningful evidence and examples. This contract does not infer
completion from arbitrary DOM or pretend every product shares game mechanics.
`retry()` invalidates earlier attempt identifiers. Never reuse demonstration
observations as the player's next evidence sample.

Authoring preflight can call `validateTutorialDefinition`,
`validateTutorialFeedback` and `validateTutorialTiming` from either public tutorial
entry. The model and coach share these checks. Invalid observations cannot leave
partial progress or consume acknowledgement time; invalid renders preserve the
previous screen/focus. Direct rendering rejects missing required content, unknown
step IDs, premature completion, demonstration credit and blank unavailable reasons.
Timing requires finite values, a positive total and an ordered window; the meter
clips its window to the displayed range. These checks enforce structure and truth,
not the quality of arbitrary instructional prose.

## Touch of Death integration

Both guided first fight and independent technique Practice use this composition.
Movement, first strike, basic guard, combos, parry, tech, launch steering and arena
tools share the coach. The first-fight guide teaches one real hit and one real
block/parry before launcher/chase sequences. Button presses without contact do
not complete those phases; their optional examples restore the exact attempt.
The guide advances after 1.6 seconds of active success acknowledgement. Independent
Practice automatically presents **Next lesson** and **Practice again** after success;
the final lesson offers free practice. Failed combo attempts reset after 1.2 seconds
of active corrective feedback. A recovered attempt cancels that reset. Pause,
expanded coaching, demonstrations and background time suspend the retry clock.

October 17 owner direction: make the next instruction prominent, provide optional
button/timing hints and an AI example, remove manual failure resets, and celebrate
lesson success with arcade particles, punchy animation and earned currency. The
owner explicitly chose both continuation options for standalone success. This
selects behavior and visual direction, not approval of the rendered candidate.
Hints follow the last physical keyboard/pointer or controller activity, including
current remaps; an idle connected pad does not choose the display. Completion uses
a bounded coach-local particle burst and respects reduced motion. First player
clears earn device coins under the [reward rules](../../packages/engine/examples/touch-of-death/host/progression/README.md);
repeat clears still celebrate. Show currency only after the save succeeds; a failed
save remains retryable from Rewards.

The combo example runs ordinary combat inputs in the same engine and arena at
half speed. It owns a temporary checkpoint, uses a repeatable defense seed, and
restores physics, arena, RNG and lesson state on return. Watching never updates
player completion or the learning store. Failed examples remain failed.
Movement, parry, tech and launch steering also have executable examples. The arena
example demonstrates pickup, use and throw through normal inputs and verifies each
against actual interaction traces. Its completion explicitly covers these three
steps; the fourth, breaking a surface, retains live tracking and directs the player
to use Heavy against a cracked panel or wooden prop. Returning restores the attempt
without awarding player completion. The example does not replace exchange review.

Live attack recovery/cancel windows and opponent hitstun explain combo timing.
Misses, expired input, unavailable stamina, interrupted attempts and opponent
recovery map to corrections. Defensive feedback uses the engine's actual early,
late, unavailable and successful classifications. No simulated contact is awarded
just because the player pressed the requested button.

The theme stays local: restrained type, cream primary, amber progress and teal
focus. Desktop coaching uses an edge panel; narrow screens use a bounded scrolling
lower panel. Watching keeps the arena visible. Expanded controls remain reachable
from Pause and return input ownership to the arena.

## Acceptance and evidence

October 17 remote campaign: 235 focused tests pass. Source-authored browser
evidence confirms real AI-combo completion without credit, guided advancement,
automatic failed-combo retry, current-device hints and a saved first-clear reward.
Standalone completion-choice/replay accounting remains incomplete in the browser.
The narrow Watch capture exposed fighter obstruction; its compact-layout repair
and a JSON-order-only verifier correction still need a new rendered baseline.
Full Harness typechecking, the canonical export and human visual approval are not
established by this campaign. Raw reports and persona reactions are retained in
`.local/swarm/tutorial-audit/`; earlier evidence below describes its dated version.

The immutable baseline is `.local/touch-of-death/tutorial-composition/before`.
The real baseline could not reach the combo: tutorial Pause added generic menu
utilities to its own controls, exceeded the six-action contract and stopped the
animation loop. `game-menu/tutorial.test.ts` protects that composition boundary.

The repeatable browser route is
`bun apps/engine-editor/scripts/tutorial-composition/verify.ts` against managed
hosts; its README owns setup and evidence limits. Test observed success without
Next, no premature completion, paused/background time, watching without credit,
checkpoint return, actual failed attempts, live bindings, controller Back and
held confirmation, narrow/short/enlarged text and reachable controls after scroll.

October 4 verification: 80 focused tests pass (497 assertions); the UI package
build and both editor TypeScript configurations pass. The live browser acceptance
covers six viewports from 320×280 to 3840×2160, doubled text, long progress labels,
both real consumers, repeated controls/Back, unavailable examples and real combat
feedback. Its JSON report is the current source for the check count. The canonical
project demonstration runner separately proves all five examples succeed and
restore structurally equal snapshots. Browser text/reflow is not browser-chrome
zoom; controller samples are automated, not physical hardware certification.
Repository-wide code-style and source-structure gates remain blocked by unrelated
dirty-tree violations; the latter is the PadPilot evaluator directory count.
No tutorial paths were reported by those gates. Guidance and process-policy checks
pass. These limits are not waived or recorded as a clean repository-wide check.

Local playable adoption: `http://127.0.0.1:8797/game/`, HTML SHA-256
`c42312837c9a8cc0edd3aa5d18e44d9f1058c5ef309a074fe8dff558905f1690`.
The original HTML/manifest remain in `tutorial-composition/original-export`;
only the local playable HTML/manifest were replaced. The 42 audio tracks and
canonical project/save data are unchanged. `after/adoption.json` records the
served-byte comparison; `after/validation.json` records the actual-host journey.

Bounded visual repairs: give demonstrations more reading space without dimming
the arena, keep navigation restrained, show short progress labels, promote return
after an example, and wrap enlarged progress text inside its own column. Do not
redesign the approved title menu when adding another lesson.

Promoted foundation: evidence-driven completion/attempt isolation and stable
accessible feedback. Promoted composition: the tutorial coach with required
instruction/input/timing/success slots. Kept local: combat diagnosis, scripted
demonstrations, progression choices and Touch of Death appearance.
