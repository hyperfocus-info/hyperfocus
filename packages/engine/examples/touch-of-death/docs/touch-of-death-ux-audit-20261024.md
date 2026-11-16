# Touch of Death: navigation and inventory audit

2026-10-24. Audit and proposed design; no game implementation changes.

**Fix the wardrobe first. Its 21-category rail hides the player's destination,
the final theme erases its primary action, and three preview channels do not
animate the directed fighter.** Rewards and friend setup then need consolidation.
The title, ordinary pause and result menus already have useful hierarchy; preserve it.

## Scope and evidence

The owner requested fewer competing options, obvious next actions, shorter paths,
and a deep screenshot/code audit informed by Rocket League and Fortnite. This
report separates observed behavior, source findings and proposed design.

- Inspected **17 recent local screenshots**, spanning title, AI setup, result,
  tutorial pause, wardrobe, reward reveal/mastery/wheel, friend setup/waiting,
  Quick Play, replay entry, settings and practice. The
  [evidence manifest](../.local/ux-streamlining-20261024/evidence.json) identifies
  each exact file and hash. The [earlier persona audit](touch-of-death-user-audit-20261024.md)
  supplies broader journey history; it is not newly rerun user research.
- Measured the October 24 packaged wardrobe at 1280×800, 390×844 and 844×390
  through T3's collaborative browser. Desktop/portrait/landscape geometry and
  two new screenshots are in the manifest. Reused package runtime hash:
  `c02be7e4114e176e9d710c5f65af75539dec85562801eb9d9c1a8a7e80df9eba`.
  The previous audit rebuilt that package; this scan did not rebuild it or
  establish whole-tree freshness. Current source independently exhibits the
  reported CSS, category construction and preview defects.
- The browser displayed roughly 1 FPS and locator clicks timed out at 30s and
  15s. Ordinary DOM button handlers through `preview_evaluate` opened the
  wardrobe; geometry and captures completed. This is layout evidence, **not**
  successful pointer/controller usability or ordinary-device performance evidence.
- A current-source probe reused the existing `directedIntegrationFixture` and
  actual presenter. Movement/loose, hit/snap and recovery/kip-up each produced
  **exactly the idle directed-rig transforms at three phases** (0.1, 0.45, 0.8).
  Salute changed the pose as a positive control. [Probe result](../.local/ux-streamlining-20261024/animation-probe.json),
  [reproducible fixture probe](../.local/ux-streamlining-20261024/preview-probe.ts).
- The isolated host used a new local SQLite file. Logs had no recorded server
  errors; supervisor/host had zero main-window handles. Both processes were
  stopped, and the shared editor/Harness servers were preserved.

Completion for this audit means reproducible findings, traced owners, a concrete
candidate and acceptance criteria. Design acceptance belongs to the owner;
navigation usability must be assessed with returning and new human players.
No retention, satisfaction, animation finish or release acceptance is claimed.

## Findings, in repair order

### UX01 · P1 · The wardrobe has a flat 21-category navigation rail

**Observed:** [desktop capture](../.local/user-audit-20261024/N03/run/05-locked-outfit-preview.png)
shows clothing, colors and identity as peers. The current browser measured a
2045px rail in 1078px of desktop space and 354px of portrait space. At 390px only
Signature looks, Top and Trousers fit completely. Entrance, Victory, Movement,
Get up and saved Outfits are offscreen. The document itself has no horizontal
overflow, so a document-width assertion misses the problem.

**Cause:** [wardrobe-pages.ts](../../../../../apps/engine-editor/src/scene3d/appearance/wardrobe-pages.ts)
lines 9–10 append Signature looks, all 18 catalog slots, Profile and Outfits.
[styles.ts](../../../../../apps/engine-editor/src/scene3d/appearance/styles.ts)
line 35 explicitly makes that rail horizontally scrollable. Every open resets
to category zero. Starting there, Entrance needs 12 forward category steps or
nine backward steps; a direct pointer click is only possible after finding it.

**Repair:** four visible sections with meaningful grouping, described below.
Keep item colors beside their item, restore the last category/selection, and
deep-link reward previews to the exact item. Preserve catalog IDs and saved data.

### UX02 · P1 · The theme makes Save and Cancel look equally important

**Measured:** both enabled buttons have computed background
`rgba(21, 26, 23, 0.93)`, equal widths and the same small bold label styling.
The locked-preview state disables Save without making its alternative task
clearly dominant. [Desktop style receipt](../.local/ux-streamlining-20261024/desktop-layout.json).

**Cause:** [fight-screen-theme.ts:43](../../../../../apps/engine-editor/src/scene3d/fight-hud/fight-screen-theme.ts)
styles every button inside network/replay/wardrobe/rewards with a selector more
specific than the wardrobe's intended orange Save/goal styles. A valid primary
declaration in local CSS does not survive the complete theme.

**Repair:** give the action area explicit primary/secondary/utility roles and
scope base theme styling so it cannot override them. In a changed owned draft,
Apply look is primary; in a locked preview, the primary is its goal/unlock action
with truthful price/scope. Do not treat every item tile or tab as a command CTA.
Verify computed appearance with the entire game theme loaded, not panel-only DOM.

### UX03 · P1 · Short screens lose the items and the fighter's face

**Observed:** [390×844](../.local/ux-streamlining-20261024/portrait-wardrobe.png)
places the player-card banner over the fighter's head. At
[844×390](../.local/ux-streamlining-20261024/landscape-wardrobe.png), the options
viewport is **42.6px tall**, too short even for a 44px choice. The fighter is
clipped too. Header, rail, shortcut paragraph, status and footer consume the space.

**Cause:** the fixed-height flex dialog and hidden body overflow in
[styles.ts](../../../../../apps/engine-editor/src/scene3d/appearance/styles.ts)
lines 27–50 compete with preview minimum heights. The narrow rule is width-only;
there is no short-height wardrobe arrangement. The card is absolutely overlaid
on the preview regardless of framing.

**Repair:** keep name/card outside the face rectangle. In portrait use compact
preview plus a normal vertical item list; in short landscape use side-by-side
preview/items with compact chrome and a reachable action bar. Allow deliberate
vertical scrolling instead of shrinking the interactive viewport below a row.
Show only shortcuts for the active input device.

### UX04 · P1 · Movement, hit and get-up previews resolve to idle

**Proved in source execution:** nine sampled preview results are identical to
idle, while the salute positive control differs.

**Cause:** [standalone-3d.ts:327](../../../../../apps/engine-editor/src/standalone-3d.ts)
wires `directedFighters.preview` into the wardrobe. The
[preview adapter](../../../../../apps/engine-editor/src/scene3d/appearance/preview.ts)
decorates the generic rig first, then calls that directed presenter. Its
[runtime.ts:64](../src/presentation/art-direction/integration/runtime.ts)
always samples idle frame zero, rebuilds the art rig and resets expression to
neutral. It handles gestures and particle styles but does not consume movement,
hit or recovery style/progress. This explains a real subset of the reported
animation failures; it does not prove every possible animation failure has one cause.

**Additional friction:** [standalone.ts:43](../../../../../apps/engine-editor/src/scene3d/appearance/standalone.ts)
restarts an active pose on selection changes, but not the style clock. Selecting
an animation does not start playback; a separate preview button is required.
Those style previews expire after 1.8 seconds (particles after 4.8). Salute and
fists-up also ignore gesture settle in the directed presenter; their transition
quality needs a native clip, not just a successful callback.

**Repair:** drive the directed preview through the relevant real motion/recovery
samplers. Preview a selection once automatically and restart at phase zero when
the choice changes; offer one contextual Replay action. Respect reduced motion,
clearly explain suppressed decorative particles, and never advance combat or save
while previewing. Existing panel tests mainly prove callback/persistence behavior;
particle integration tests do not establish these three channels.

### UX05 · P2 · Rewards duplicates decisions and loses the return destination

**Observed:** [first unlock](../.local/user-audit-20261024/N02/run/12-first-unlock-reveal.png)
shows the same jacket as both the new unlock and the next signature, each with
equip/preview actions. [Mastery](../.local/user-audit-20261024/discovery/mastery-cued/02-find-a-practice-goal-on-short-screen.png)
still spends half the screen on a cosmetic goal. Daily and Wheel are separate
top-level tabs; a garment reveal has no garment image.

**Cause:** [panel.ts](../../../../../apps/engine-editor/src/scene3d/rewards/panel.ts)
composes spotlight and goal concurrently, preserves the cosmetic hero across
all activities, selects Collection whenever balance is at least 100, and closes
Rewards before opening a preview without a return context. The wardrobe also
resets its page. [spotlight.ts](../../../../../apps/engine-editor/src/scene3d/rewards/spotlight.ts)
can show a color swatch, but no garment thumbnail. The default goal selector
offers a coordinated look while the lead promise describes a 100-coin item;
the previous audit documents the mismatch.

**Repair:** one claim/reveal card with the item visible on the fighter; one Equip
action and a quieter Continue. Collapse the completed goal into a receipt.
Group daily claims; put mastery under Practice with a contextual link from earned
progress. Let Your fighter own item discovery and goal selection through the
existing reward authority. Preserve category, filter, scroll and focus through
preview/back; do not redirect based on coin balance. No economy or account/device
ownership change is required for these presentation fixes.

### UX06 · P2 · Friends setup hides the task under competing setup work

**Observed:** [setup](../.local/user-audit-20261024/N08/run/03-friend-setup-and-rewards.png)
shows create/join concerns, three room modes, two roles, reward rules and account
recovery before the submit action, which is below the captured fold. In
[waiting](../.local/user-audit-20261024/N08/run/04-shared-room-waiting-state.png),
Invite friend is visually weaker than the surrounding status/profile administration.

**Cause:** [online-entry.ts](../../../../../apps/engine-editor/src/scene3d/game-menu/online-entry.ts)
disables the form's bounded layout (`display:block; max-height:none`) and lets
fields flow before its footer. Waiting states intentionally allow no primary
in [session.ts](../../../../../apps/engine-editor/src/scene3d/game-menu/session.ts),
even when the useful next task is inviting a partner.

**Repair:** default to a private set with Create invitation visible; Join with
code is an adjacent secondary path. Show a pasted invitation's mode before
joining. Room variants, spectating, connection settings and recovery remain
contextual. Once created, Copy invitation is the primary, then Ready/Resume
when the room permits it. Keep concise reward status, with earning details on demand.

### UX07 · P2 · Some paths are deeper than the decisions justify

[navigation.ts:34–40](../../../../../apps/engine-editor/src/scene3d/game-menu/navigation.ts)
routes Quick Play through Play → Online → Quick Play before the queue's search
action. Settings → Game settings is a page with one destination. Watching goes
through Play → Watch fights → Watch a replay before opening a file. These
intermediate screens add little useful choice.

**Repair:** Play offers AI, Quick Play and Friends directly, with Watch as a
utility. Settings opens its settings surface directly. Preserve the current
five-entry root menu. For returning players, offer an explicitly labeled
Play again for the last mode; keep Change mode discoverable and never silently
queue online. Result Rematch and Retry this exchange already provide useful
direct actions; keep them.

### UX08 · P2 · Practice overlays compete with the subject being taught

[Narrow coaching](../.local/user-audit-20261024/discovery/visual-replay/06-narrow-live-lesson-and-fighter-framing.png)
covers legs/contact space and keeps Watch example, Button hints and Lesson
details visible during the attempt. Result prose exposes frame numbers before
the user asks for detailed analysis. In contrast,
[Practice readouts](../.local/user-audit-20261024/N10/run/08-practice-instrumentation.png)
already has three clear groups and one Return action; it does not need a broad redesign.

**Repair:** during a live attempt show one instruction, cue and progress; put
explanation/replay controls in a compact expand action. Reserve its rectangle
in combat framing. Show deeper frame data in review/readouts. Preserve expert
access and current configurable bindings. Existing
[coach findings](touch-of-death-user-audit-20261024.md#ranked-friction) retain the
separate completed-example contradiction.

## What to borrow from the reference games

Sources inspected on 2026-10-24. Older patch notes establish a pattern's history,
not the exact current layout or current capacity. No authenticated game-client
session was performed.

| Reference | Verified pattern | Application to Touch of Death |
| --- | --- | --- |
| [Rocket League presets/search (2016)](https://www.rocketleague.com/news/patch-notes-v1-22) | Named whole-car presets, quick switching, inventory search/filter | Make the whole fighter look the reusable unit; retain the existing three presets but show thumbnails rather than three blank forms. |
| [Rocket League favorites](https://www.epicgames.com/help/c-37599050/c-Trending_0/hur-markerar-jag-foremal-som-favoriter-i-rocket-league-a14318331) | Favorites rise to the top and have a controller shortcut | Favorites and recently used items shorten repeat tasks; keep management secondary to selection. |
| [Rocket League archive (2019)](https://www.rocketleague.com/news/patch-notes-v1-70-blueprint-update?lang=es-mx), [filter persistence (2020)](https://www.rocketleague.com/news/patch-notes-v1-74-march-update?lang=en) | Archive removes unwanted items from ordinary browsing; filters survive previews | Preserve browsing state first. Add Archive only if collection size justifies another feature. |
| [Fortnite Locker improvements (2024)](https://www.fortnite.com/news/fortnite-chapter-2-remix-run-it-back-with-snoop-eminem-ice-spice-and-juice-wrld-in-battle-royale) | Bundled saved loadouts and more visible loadout cards | The official screenshot pairs visual whole-look cards with a large character preview. Use native thumbnails and whole-look recall. |
| [Fortnite favorites](https://www.epicgames.com/help/c-34254770/c-33726977/a11274791), [equipping](https://www.epicgames.com/help/c-34254770/c-33726977/a15811836?lang=en-US) | Category selection, search-adjacent favorites, select-and-back equip flow | Keep the object and its options together. Immediate equip is an alternative, not a requirement: this game's draft/cancel and locked-preview behavior favors one explicit Apply. |

Fortnite's official favorites screenshot also shows a partially clipped category
rail with explicit arrows. It is not evidence that copying a long rail will
solve this game. Copy useful task organization, not another game's entire shell,
store, currency presentation or number of categories.

[Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
supports showing common actions first and deferring specialized options.
[Tab guidance](https://www.nngroup.com/articles/tabs-used-right/) supports clear,
related categories and unambiguous selection. Neither establishes a universal
maximum number of clickable things. A grid of 12 comparable jackets can be
appropriate; 12 unrelated commands competing to be next is different.
[Navigation research](https://www.nngroup.com/articles/3-click-rule/) rejects an
arbitrary three-click law: measure successful task time, backtracking and errors
alongside clicks. Hiding every choice in another menu can reduce clutter while
making the actual task worse.

## Proposed wardrobe and navigation

The [interactive structural candidate](../.local/ux-streamlining-20261024/audit-review.html)
proposes changes to the current
[appearance contract](../../../../../apps/engine-editor/src/scene3d/appearance/README.md).
Its category layout and visual treatment remain proposals.

**Approved interaction (2026-10-24):** selecting an owned item previews it;
one Apply button commits the whole look. The owner explicitly selected this
behavior in the inventory audit follow-up. Preserve the existing draft/cancel
behavior when implementing it.

| Visible section | Contents | Contextual detail |
| --- | --- | --- |
| Looks | Saved outfits first; curated Signature looks as a separate collection | Select whole look, inspect it, Apply. Save as look reveals its name field only when needed. |
| Clothing | Top, Trousers, Footwear | Item thumbnails; its color swatches beside the selected item. Belt color stays in clothing detail. |
| Identity | Hair, Face, Skin tone, player identity/card | Hair color beside Hair; name/icon/card in Profile detail. Human identity choices remain free/unranked. |
| Motion | Entrance, Victory, Movement, Hit reaction, Get up, movement effects | One selected channel, automatic one-shot preview and contextual Replay. |

- Four section labels remain visible. Secondary slots use a compact labeled
  selector or a bounded set of slot cards, never another overflowing rail.
- Keep a large native fighter preview and a visual grid for the active slot.
  Use appropriate item framing: hair/face close-up, boots lower-body, motion full-body.
  Native thumbnails must be generated from the real catalog, not invented art.
- Owned choices are the ordinary editing view. A visible Browse unlocks control
  exposes locked items with their price/status; reward links open that exact item.
  Add favorites/search where actual catalog size warrants them, not on a three-item list.
- Preview on selection, with ownership and dirty state distinct. Apply is
  the single commit for the draft; Cancel restores the saved look. Purchases use
  a separately explicit priced action and the existing authoritative reward path.
- Put name/card above or beside the model, not over its face. Rotate through drag
  with accessible keyboard/controller equivalents; angle presets can be secondary.
- Preserve last section, slot, filters, scroll, item and return destination.
  Cross-panel Back restores the caller; only deliberate exit goes to the title.
- Use the existing shared menu action roles for command areas. Their six-action
  limit and one-primary rule already exist in
  [actions.ts](../../../../../packages/ui/src/game-menu/actions.ts); they currently
  do not govern the wardrobe/reward composition. Do not cap inventory tile count at six.

Indicative interaction targets, counted from the title after onboarding, excluding
text entry and loading; these are design budgets, not measured improvements:

| Task | Current route | Candidate target |
| --- | --- | --- |
| Start default AI set | Play → Fight AI → Start (3) | Same for first choice; explicit last-mode Play again (1) thereafter |
| Open Game settings | Settings → Game settings (2) | Settings (1) |
| Reach Quick Play | Play → Online → Quick Play (3), then search | Play → Quick Play (2), retaining explicit search/accept where needed |
| Wear a saved look | Your fighter → find Outfits → Wear → Save (4 plus rail search) | Your fighter → saved-look card → Apply (3) |
| Inspect an earned jacket | Rewards → View → default Signature looks page | Reward reveal shows it immediately; Edit opens its exact clothing slot |
| Return from a reward preview | Escape → title → Rewards → find previous activity | Back once restores the exact activity and focused item |
| Compare motion choices | Find tab → choose → Preview; repeat Preview per choice | Motion → channel; each selected choice previews automatically |

## Implementation slices and acceptance

1. **Repair trust first:** CSS primary-role conflict, short-height/portrait layout,
   card occlusion and directed motion previews. Keep appearance save schemas,
   ownership, combat and approved fighter geometry unchanged.
2. **Recompose the wardrobe:** four groups, contextual colors, whole-look tiles,
   item-target routing and remembered context. Preserve existing saves/presets.
3. **Join the journeys:** reward reveal/return state, friend create/join hierarchy,
   remove empty routing layers, then compact live coaching.

For each changed flow, inspect 1366×768, 1024×600, 390×844 and 844×390, plus zoom
and long names. Verify pointer, keyboard and physical controller separately.
Every command surface must have an obvious next action or a truthful waiting
state; no required primary or slot may depend on discovering horizontal scrolling.
The face/feet/contact surfaces and at least one complete selectable item must
remain visible. Test actual hit targets and focus order, not only `scrollWidth`.

Motion acceptance needs full clips through selection changes, finish/replay,
category switching, close/reopen and reduced motion. Demonstrate distinct native
movement/hit/get-up poses, finite transforms, scene restoration and unchanged
simulation/save state. A callback assertion cannot close UX04.

Record baseline and candidate task completion, time, unnecessary category steps,
backtracks, wrong selections and accidental saves. Ask new and returning players
to find a hairstyle, change one color, compare get-ups, equip a saved look and
return from a reward preview without coaching. The owner must accept the exact
candidate; the audit's proposed grouping is not a usability pass.

Before implementation, obtain focused validation candidates through
`bun run inspect:impact --summary --path <changed-owner>` and the owning project
tasks through `bun run inspect:project --root apps/engine-editor`. Use the existing
wardrobe, rewards, menu/session and directed-rig test owners. Run the real exported
game for rendered acceptance; do not infer it from isolated CSS or fixture success.
