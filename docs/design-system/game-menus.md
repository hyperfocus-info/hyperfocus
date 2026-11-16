# Game-menu composition

Use **intent → menu type → canonical composition → semantic content → validation**.
The first domain is Touch of Death. Its visual theme is not an application-wide
skin. The engine remains independent of DOM, UI packages and player preferences.

## Ownership and selection

| Layer | Owner | Proven use / failure prevented |
| --- | --- | --- |
| Foundation | `@hyperfocus/ui/game-menu` | Semantic action lists in title/mode/pause/results; category panels in Rewards/Settings; modal focus in Rewards/Settings/developer tools |
| Domain composition | `apps/engine-editor/src/scene3d/game-menu` | Title, pause/result/onboarding, settings, online entry/session; `rewards/panel.ts` owns reward composition |
| Product theme | `game-menu/theme.ts`, `rewards/styles.ts` | Touch of Death type, palette, stage scrim, focus/motion and reward visualization |

`createGameActionList` accepts at most six actions, one first primary, unique IDs,
an explicit audience, and explanations for unavailable actions. It owns stable
nodes and focus recovery when an action becomes disabled. Utilities have a lower
visual role. `current` is separate from focus. Developer lists may explicitly
omit a primary; player lists cannot silently do so.

`createGameSections` bounds categories to five and removes inactive panels from
input navigation. `attachGameModal` uses native dialog modality, contains Tab,
consumes Escape, and restores the actual invoking control. Hosts own data, audio,
commands, persistence, availability and controller polling.

```ts
import { createGameMenuShell } from './game-menu/shell';
const menu = createGameMenuShell({ parent: overlay, back: showPlay });
menu.render({ page: 'practice', title: 'Practice', actions: [
  { id: 'practice', label: 'Free practice', priority: 'primary', audience: 'player', run: startPractice },
  { id: 'guide', label: 'Guided first fight', priority: 'secondary', audience: 'player', run: startGuide },
] });
menu.actions.focus(); // On entry; ordinary state refresh preserves current focus.
```

For Touch of Death, extend `navigation.ts` or `context.ts` at the player-intent
route, then use the shell. Do not append launchers to the title rail through DOM
discovery or add a second primary. Unknown capabilities require a deliberate
route/group; they do not become root actions automatically. The earlier optional
`menu-convergence` recipe remains historical experiment tooling, not the shipped
navigation authority.

## Input ownership and navigation

The October 18 owner requirement is one active menu, first-action selection on
menu entry, and Accept activating the visibly focused control. This includes
returning to a parent menu. Ordinary refreshes preserve the user's selection;
closing a modal restores its invoking control within that same menu.

- A host declares one input owner: topmost modal/tool, otherwise the active menu,
  otherwise gameplay. Hide redundant legacy actions and live coaching while a
  menu owns the screen. Hidden or inert controls never enter the target list.
- Entry selects the first enabled action, before Back or supporting fields.
  Focus styling, keyboard activation and controller Accept use the same element.
  Directional movement follows rendered cardinal neighbors. Never use an old
  controller index after pointer or keyboard focus changes.
- Accept and Back fire on a fresh press only. A held button cannot activate the
  next screen or leak into gameplay. An Accept arriving with a direction confirms
  the existing selection. Only directional movement repeats.
- Use `createMenuNavigationInput` from `@hyperfocus/engine/ui/core` for timed
  analog/digital navigation; its [API contract](../../packages/engine/docs/public-api.md#menu-navigation-input)
  owns thresholds, timing and reset behavior. The host supplies device mappings,
  a monotonic clock, focus scope and reset on page changes, blur and disconnect.
- Verify the complete transition, not isolated menus: first entry, parent return,
  result, nested tools, disabled targets, mixed devices, sustained/diagonal stick,
  simultaneous Accept, held confirmation, reconnect and narrow scrolling. Include
  the composed action count; adding tutorial controls must not overflow results.

Research basis: [Xbox UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)
supports consistent spatial focus and keyboard/controller access;
[Unity's UI input module](https://github.com/Unity-Technologies/InputSystem/blob/develop/Packages/com.unity.inputsystem/Documentation~/ui-input-module-reference.md)
separates initial delay from repeat interval and limits repeat to one event per
frame. Hyperfocus's chosen timings are adjustable defaults, not measured human
preference. Physical-controller feel still requires human playtesting.

## Visual grammar

- Title: large identity left, vertically centered action rail right. The center
  leaves room for the arena; a directional scrim protects text. Narrow and short
  viewports stack and scroll the entire composition, without shrinking targets.
- Identity, heading, action label, body, explanation and metadata have semantic
  theme roles. Use the existing 4/8/12/16/24/32/48/64 spacing scale; item authors
  choose roles, never arbitrary type sizes or spacing.
- Primary: one filled light action; secondary: unboxed text rows; utility:
  smaller restrained label. Borders mark state/category separation, not every row.
- Minimum target: 44px. Safe-area insets surround the menu. Long labels wrap;
  content may scroll vertically, never require horizontal page scrolling.
- Focus: three-pixel contrasting outline and inset marker. Hover uses a subdued
  fill; pressed has a small displacement; current has a check; disabled includes
  a readable reason. Focus cannot disappear when availability changes.
- Motion: 120ms feedback and 180ms entry; reduced motion removes both movement
  and reward particles. Existing audio categories remain focus/confirm/back/
  adjust/denied; no per-button sound invention.

## Product navigation and audience

```text
Play → Fight the AI → difficulty, Start match, Random opponent
     → Invite a friend → private set, invitation entry
     → Online → Quick Play, Play with friends (existing room modes)
     → Watch fights → replay, expert AI
Practice → Free practice, Guided first fight, easy AI opponent
Your fighter → existing appearance and equipment
Rewards → progress/receipt, milestones/collection and optional daily/wheel
Settings → Sound and controls, Motion
```

Pause prioritizes Resume, then contextual Practice setup, Combat controls,
Settings, Player options and Main menu. Results prioritize rematch, then expose
the actual exchange retry or relevant defensive lesson directly. Other analysis
commands live under Review this fight, keeping even a lost random-opponent set
within six actions. Controls starts with player inputs; advanced bindings remain
available through an explicit toggle, with conflict checks across both groups.
Onboarding is not an equal result action.
Practice readouts live in Training setup and the live Practice dock; the
[Practice contract](practice.md) owns their composition. Live online tools remain
contextual player capabilities.
There is no existing same-device two-player mode to expose.
Quick Play declares unavailable service state on the Online page; manual host
connections remain in the invitation flow, where that information is necessary.

| Existing surface / source | Role and placement |
| --- | --- |
| Combat match menu (`combat-match/index.ts`) | Player title/mode intent; AI difficulty belongs to Fight the AI |
| First-fight guide (`tutorial/guided-fight.ts`) | First-save onboarding and a re-openable Practice path |
| Pause and Practice categories (`fight-hud/practice`) | Contextual session setup, reset and resume |
| Match result and final exchange (`replay/local-presentation.ts`) | Outcome, rematch and a bounded review subpage |
| Wardrobe (`appearance/wardrobe-panel.ts`) | Player identity/equipment; existing preview and save/cancel composition |
| Rewards (`rewards/panel.ts`) | Receipt, balance, cosmetic progress and discovered activities |
| Sound/controls (`input/runtime-controls.ts`) | Device preferences, grouped into two settings categories |
| Motion (`playable-controls`) | Player accessibility preference under Settings |
| Replay library / transport (`replay/panel.ts`) | Watch route; transport remains contextual to a recording |
| Private connection (`network/panel.ts`, `hosted`) | Online invitation, room choice, connection/recovery; manual host fields stay here |
| Quick Play, winner stays, shared training (`network/*/panel.ts`) | Existing session-specific lobbies, readiness and leave flows |
| Voice, images, uploads, reports, social controls (`network`, `uploads`) | Current-room/player context; no title shortcuts |
| Combat controls and Practice readouts (`fight-hud`) | Re-openable gameplay help and contextual training feedback |
| Controller keyboard (`input/controller-keyboard.ts`) | Contextual text entry within its invoking field |
| AI history/insights/export and bulk training (`fight-hud/ai-history`, `bulk-training`) | Explicit developer surface, separate from player settings |

The first-time player needs to understand **Play**, then **Fight the AI** to start
a set. Guidance and difficulty are available without becoming prerequisite concepts.
Existing wardrobe, room/lobby and replay internals were inspected and routed;
this pass does not claim a full redesign or live-service certification of those flows.

AI insights, observation export, history deletion and bulk AI training are
developer capabilities. Open the delivered game with `?tools=1` to get a named
Developer tools launcher. This is audience routing, not an authorization boundary.
Observation collection and saved policy behavior are unchanged. No player-menu
path enters those tools. Shared practice with another player is **not** AI training.

## Decisions and evidence

The owner approved the balanced desktop split in the earlier October 3, 2026
comparison, recorded in the [product owner](../../packages/engine/examples/touch-of-death/docs/touch-of-death.md).
The current request explicitly authorizes replacing IA, bounding compositions,
separating developer tools, preserving real mechanics, and enforcing quality.

On October 4, 2026, the owner explicitly answered the taste/product questions and
selected the rendered title composition in this task:

| Approved choice (owner's words) | Scope and default to preserve |
| --- | --- |
| “Restrained navigation; expressive logo” | Touch of Death menu typography: the logo carries expressive lettering; navigation stays restrained. |
| “Play opens a clear mode choice” | Title navigation: Play leads to AI/online choices, alongside Practice, Your fighter, Rewards and Settings. Do not replace it with immediate default-AI launch. |
| “Earned results and cosmetic progress” | Rewards hierarchy: earnings, receipts and cosmetic progress lead; daily bonus and wheel remain supporting activities with existing mechanics. |
| “A — continuous action rail” | Touch of Death title default: candidate A from the three-way comparison, retained in `candidates/2026-10-04T03-44-00.076Z/rail-desktop.png`. Preserve its continuous action order and controller path within the accepted balanced split. |

These choices match the implemented defaults. Future agents should preserve them
without reopening the same questions. Candidate A is now the owner-selected title
composition, not a provisional agent judgment. This approval covers the title
direction and the three stated preferences; it does not imply blanket acceptance
of every secondary screen or subsequent visual revision.

Evidence lives in `.local/touch-of-death/menu-composition/`: immutable `before/`,
three versioned `candidates/`, current `after/`, the real exported `web/`, and validation logs.
Run `bun apps/engine-editor/scripts/menu-composition/verify.ts` after rebuilding
the candidate as described in its [script README](../../apps/engine-editor/scripts/menu-composition/README.md).
Objective gates do not establish taste approval. Headless controller input is
injected through the real controller navigator; physical hardware and browser
chrome zoom remain separate acceptance limits. The harness covers equivalent
reflow and doubled root text size instead of mislabeling those as browser zoom.

## Candidate and visual review

All three candidates use identical content, input handlers, theme and live arena.
Version `2026-10-04T03-44-00.076Z` passes desktop, 390px and 320px geometry.
A (continuous rail) is the owner-approved default: immediate primary, one reading
and controller order, restrained utilities. B (chapter rail) weakens the action
signal by making Play resemble a heading. C (grouped tiles) makes secondary
destinations compete and creates a two-dimensional traversal problem. B and C
remain evidence, not alternate production compositions.

Separate critique passes found and repaired: composition (floating tools and
unbounded result actions), hierarchy (flat root and form-like rewards), identity
(theme/type/scrim shared across title/pause/result), slop (row borders removed,
progress made visible), consistency (legacy settings CSS overrode category tabs),
and interaction (disabled-focus loss, hidden wardrobe return target, held Enter).
No new room modes, economy rules, cosmetics, cinematic assets or reward mechanics
were introduced. The follow-up below exercises **online room/lobby composition**:
joining, waiting, ready, reconnecting and leaving test the bounded hierarchy
against asynchronous multi-person state.

## Verified delivery, October 4, 2026

- The actual local `/game/` document passed 59 browser assertions with zero page
  errors. The run includes real onboarding, daily claim, local fight/pause/return,
  wardrobe/replay/Motion entry and developer opt-in. Deterministic component
  fixtures supply adversarial values and controller samples through the real
  navigator; they do not simulate a successful live matchmaking service.
- 124 focused tests passed (1,046 assertions); 22 affected focus/composition
  regressions passed again after the final focus repair. Editor source and test
  typechecks, the UI package build, guidance and process-policy checks passed.
- Geometry covers 320×280 through 3840×2160, seven representative viewports,
  doubled root text, 640×360 reflow and actual Chrome safe-inset overrides.
  Rendered disabled-action contrast caught a dark explanation on a dark primary;
  inherited modal CSS also overrode safe bounds. Both owners were repaired.
- The managed local host adopted HTML SHA-256
  `08e1376dd1e55ee165d38a74ba50f1857d412a2950b5de1129d03d0fb33b296e`.
  Original HTML/manifest are retained under `original-export/`; all 42 audio
  hashes/sizes match. No project data, review feedback or external deployment changed.
- Browser/host Windows inspection found no visible windows; browser owners closed
  after verification, and the shared game host remains available for review.

The full repository gate is not clean: package-wide typechecking reports existing
errors in `editor-3d-resources/checks.ts` and `input-bindings-checks.ts`;
source-structure reports the unrelated PadPilot evaluator folder count; code-style
reports existing workspace debt. No policy baseline was raised. Physical hardware,
browser-chrome zoom, live multiplayer acceptance and final screenshot approval
remain distinct from this delivered evidence. The title candidate and the three
directional preferences above now have explicit owner approval; final screenshot
approval here refers to secondary surfaces and later revisions.

## Online composition follow-up

The October 4 request, “work on next composition,” selects the online domain
identified above. It retains the approved restrained navigation, player-intent
routes and title rail; the new lobby screenshots do not yet have owner approval.

`game-menu/session.ts` now owns the phase composition for Quick Play, winner stays
and shared training: identity/status/context, one action rail, an optional roster
and supporting tools. Decisions require one first primary; waiting explicitly
permits none and requires an explanation. The rail rejects duplicate controls,
more than six visible actions and unexplained disabled controls. Native controls
keep their command handlers and identity. Tick refreshes preserve focus/drafts;
disappearing or disabled actions recover focus. Tab stays inside the session,
Escape/back follows its declared return action, and held activation is suppressed.
These are domain constraints, not a universal application layout.

```ts
const session = attachGameSession({ element: pane, title, status,
  context: [participants, deadline], body: roster, tools: [chatDisclosure], back: viewArena });
session.setStatus('Your turn to fight'); // Avoid replacing an unchanged live-region message.
session.render({ waiting: false, actions: [
  { button: ready, priority: 'primary' },
  { button: leave, priority: 'utility' },
] });
// Waiting for the host: declare waiting, explain it in status, keep an honest exit.
```

`game-menu/online-entry.ts` composes the existing invitation form into room choice,
invitation/role and supporting host settings. Quick Play retains its own entry;
it is no longer repeated as a friend's-room radio choice. Copying an invitation
before joining lives in Room settings; joined rooms retain Invite friend beside
their supporting tools. Chat and voice/pictures/fighter no longer compete with
Ready. Hosts still own credentials, validation, joins, persistence and deadlines.
The shared modal gained an explicit user-dismissal hook so cancellation can abort
pending issuance while a successful phase handoff closes without canceling it.

Host-confirmed Quick Play acceptance has its own waiting state; sending a request
does not claim acceptance. Confirmed rating is still shown only after a saved
result. A live winner-stays fighter sees **Concede and leave**, while a spectator
sees Leave room. Local reconnect uses the entry recovery boundary and retains
room drafts; another fighter's recovery does not disable connected players' tools.
Opening a live room tool closes the host's online pause menu; its Back action
returns focus to the arena. Entry/recovery dialogs retain native modal return
behavior. Readiness focus also scrolls into view after a long roster or tool pane.
The controller navigator preserves an open panel's native focus across host mode
changes; otherwise leaving Pause could erase the room's just-established focus.

Evidence and repeatable commands are in the
[online verification README](../../apps/engine-editor/scripts/online-composition/README.md).
Immutable baselines and comparable rendered states live under
`.local/touch-of-death/online-composition/{before,after}`. Geometry uses a single
scrolling composition, safe insets, wrapping labels and unchanged target sizes.
The first adversarial pass found doubled-text entry overflow; wrapping belongs
to the composition and repairs every room type. Existing voice/upload/report
internals retain their behavior; their complete redesign is outside this domain.

Final evidence for this follow-up:

- 175 focused tests / 1,407 assertions passed. The source/test typecheck and UI
  package build passed; no shared-engine or protocol changes were needed.
- 82 browser checks passed with zero page errors: ten states across six viewports
  from 320×280 to 3840×2160, safe insets, target bounds, contrast against the
  brightest arena, doubled text, long rosters, reconnect/draft retention, held
  input, simulated controller reconnect/traversal and five real entry/Back loops.
- Two actual exported clients against an isolated local relay passed 11 checks:
  join, waiting, Ready focus/acknowledgement, live fight, explicit concession,
  host-confirmed outcome and room Back returning to the arena. Earlier acceptance
  attempts also exposed the focus race above; it has unit and live coverage.
- The local `/game/` response matches HTML SHA-256
  `80396fe4ae6369d6f9f284b74f62b378ed39a42a0b6098db9909d54828fb9bb1`.
  Original HTML/manifest remain in `original-export/`; all 42 music hashes/sizes
  are unchanged. Browser/host inspection found no visible windows. The isolated
  relay is stopped, while the shared game preview remains running.
- `after/validation.json`, `live-validation.json`, `delivery.json` and the matching
  screenshots retain the evidence. Physical controllers, browser-chrome zoom,
  public matchmaking, microphone capture and final lobby taste approval remain
  outside this evidence. Workspace code-style/source-structure debt still blocks
  the broad repository gate; this work does not raise those baselines.

The owner selected **Tutorials** as the next composition domain, superseding the
Replay library proposal. The [tutorial contract](tutorials.md) owns observable
completion, input/timing, demonstrations, attempt diagnosis and reusable coaching.
