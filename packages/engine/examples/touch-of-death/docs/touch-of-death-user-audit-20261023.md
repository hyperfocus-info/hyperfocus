# Touch of Death: ten fresh players, a 90/100 expectation

Original audit: 2026-10-23. The observations below describe the audited baseline. The subsequent implementation and its evidence are recorded in [Repair pass](#repair-pass); partially addressed findings remain open.

**Verdict: the current build has useful learning and recovery systems, but does not yet demonstrate the clarity, visual finish and consistently satisfying rewards these ten personas expect.** The most immediate repair targets are an unreadable claim button, a partly hidden unlock reveal, a motion preference that resets, and a modal that mishandles Escape. The larger quality gap is that earned progress is presented as administration more often than as a desirable change to the fighter.

“90/100, overwhelmingly positive” is the user's quality expectation for every persona. It is not a measured Steam rating, an estimated review percentage or a numerical art grade. These are simulated journeys, not ten recruited people. Long-term enthusiasm and drop-off below are hypotheses.

The [previous audit](touch-of-death-user-audit-20261022.md) owns the original findings and fix ledger. This pass uses new personas and seeds, and emphasizes reward satisfaction, visual causality, fidelity and polish. The [art constitution](touch-of-death-art-constitution.md) supplies the approved direction; the [reward contract](../host/progression/README.md) owns current earning rules.

## Evidence and scope

The [frozen mission](../.local/user-audit-20261023/mission.json) precedes interaction and records nine qualitative criteria: immediate feedback, learning, session rewards, identity, social play, visual clarity, fidelity, polish and sustained play. Every persona expects a finished, highly recommendable game. FGC familiarity is authored separately from sampled computer/AI familiarity.

- Current canonical project exported and packaged locally. Content ID `combat-v39:f8442de34012bed7286b361931156c673feec2b4cf1f723cefaeec79bc80d9f6`; runtime SHA-256 `75c2363053f0d39b526af49b39b4fa4c56b33d4a63bf911c29b67f2864f829fa`. [Package manifest](../.local/user-audit-20261023/package/manifest.json).
- Ten isolated seeded profiles, native pointer/keyboard input, mostly 1366×768; Iris also used a native 1024×720 window. Short first-session journeys were exercised, not fifteen real minutes for every persona. No claim of actual 1-, 24- or 100-hour sessions.
- [126 recorded flow captures](../.local/user-audit-20261023/summary.json), including three recorded failed continuations; zero recorded uncaught page exceptions. Two failures were audit locator assumptions corrected on replay; one exposed the Saved situations dismissal problem. An earlier N02 run retained eight screenshots but no final receipt because its wrong locator threw outside a flow; the corrected run completed twelve flows. Failures remain in the evidence.
- Native two-context friend invitation and coaching entry completed. [Social receipt](../.local/user-audit-20261023/N08/coaching/results.json). Sustained five-minute social coin delivery, WAN quality and hardware controllers were not certified by this pass.
- Four explicitly staged [defense fixtures](../.local/user-audit-20261023/defense-fixtures/capture.json) supplement native parry/tech demonstrations. Fixtures prove rendered vocabulary, not player execution or comprehension.
- The existing native arena workflow produced a [12-second WebM](../.local/user-audit-20261023/arena-motion/01-long-pan-courtyard-drift.webm), with 720 unique decoded frames at 60 fps and validated source-clock/audio-onset checks. [Receipt](../.local/user-audit-20261023/arena-motion/evidence.json). Inspected the complete span at half-second samples and a two-second contact/recovery window at 0.1-second samples. This is a directed Theater capture, not the ordinary camera or live performance; it does not establish smoothness by human playback. Audio was checked mechanically, not listened to for mix quality.
- The collaborative preview timed out twice on snapshot with `Preview automation snapshot timed out after 15000ms.` The repository's owned hidden Chrome workflow supplied the native evidence. Explicit window inspection found no visible windows for the social runs, art captures and isolated host; the short persona runner does not retain equivalent per-run window inventories. Host logs had no reported errors. Owned social browsers were confirmed absent after cleanup.

Raw run owner: this audit. Prune `.local/user-audit-20261023/` after its findings have been resolved or superseded and any still-needed evidence has been promoted. No publication or production operation occurred. Independent human criticism, taste approval and retention evidence remain unavailable; this is not release acceptance.

## Ten personas and four horizons

Seed prefix is `tod-20261023-`; suffixes below identify the exact [persona manifests](../.local/user-audit-20261023/). **O** means directly observed short-journey evidence. **H** means a hypothesis for cumulative gameplay time, informed by the observed loop and source. The 24-hour column means 24 cumulative hours played; calendar-day effects are stated separately.

| Persona / FGC | First 15 minutes: observed anchors | 1 hour: expected friction | 24 hours: return or drop-off | 100 hours: what must sustain play |
| --- | --- | --- | --- | --- |
| N01 Aria, 3/10 — spectacle-seeking newcomer | **O:** movement/jump and first connected strike each earned +25; pause/resume worked. The 350–450 px instruction panel drew more attention than the small fighter. | **H:** curiosity survives if learned actions transfer into a real fight; repeated text-led lessons can feel like homework. | **H:** needs recognizable improvement and appealing identity; completion alone will no longer motivate. | **H:** likely leaves without friends, expressive play or new challenges. More login rewards are insufficient. |
| N02 Ben, 4/10 — loss-sensitive improver | **O:** AI 1 won 0–3. The result explained absent guard, saved +40, exposed a +100 milestone and offered Retry this exchange. Claim contrast was poor; first box was a Moss top color. | **H:** retries can build competence, but repeated losses followed by low-impact color rewards can feel unrewarding. | **H:** return depends on proof that defense improved, not just more sets played. | **H:** needs fair matches, personal records and meaningful rivalries; no guarantee coins retain him. |
| N03 Cora, 4/10 — identity collector | **O:** pinned Yard shift, saw 200 for the next piece/800 total, previewed it, returned and retained the goal. Daily/wheel actions awarded visible currency. | **H:** choosing a look is motivating; text-first selection and a small preview weaken desire. | **H:** box route can already have exhausted the collection. Recolor-heavy rewards lose novelty. | **H:** expressive combinations, recognizable profiles and genuinely new cosmetic craft must carry identity. |
| N04 Diego, 5/10 — visual learner | **O:** parry and tech examples showed result labels and distinct contact/surface effects. Instructions and frame detail required substantial reading. | **H:** needs to recognize the same cue during ordinary combat, without relying on the lesson panel. | **H:** repeated failures become frustrating if only the expert can interpret timing readouts. | **H:** wants an efficient lab and readable high-level play, with optional detail rather than constant explanation. |
| N05 Emi, 6/10 — movement/presentation critic | **O:** searched Game settings/Controls, then found the separate Motion disclosure. Reduced motion became true, then false after reload. | **H:** settings fragmentation interrupts getting comfortable. | **H:** forgotten comfort settings are a concrete return-session failure. | **H:** consistent presentation and reliable preferences are prerequisites; long-run motion quality remains unassessed. |
| N06 Felix, 6/10 — short-session competitor | **O:** entered an empty local Quick Play queue; Leave and practice worked and opened playable practice. | **H:** giving up the search to warm up creates a choice between play and finding play. | **H:** a fragmented schedule magnifies queue and ten-second tab-return constraints. | **H:** reliable opponents, fast rematches and interruption recovery must justify each session. |
| N07 Grace, 7/10 — deliberate practice regular | **O:** found Build a combo; Watch AI combo showed launch/chase/follow-up input and damage, then Try it yourself restored the attempt. Demonstrations correctly granted no lesson reward. | **H:** needs a visible personal learning goal and a concrete sign of improvement after repetition. | **H:** saved situations/routines offer depth, but should connect clearly to her recent failure and progress. | **H:** mastery records, useful practice plans and community learning can outlive cosmetic completion. |
| N08 Hugo, 8/10 — friend-group coach | **O:** created training, shared an invitation, joined from a cold profile and reached mutual reset/side-swap controls. Entry disclosed bounded social coins; the room showed no partial progress meter. | **H:** explaining while one player watches can stop accrual; 20 eligible minutes reaches the daily cap. A session may feel less rewarded than solo grinding. | **H:** wants a saved practice plan, shared accomplishment and a quick route back to the same friend. | **H:** the group needs stories, rivalries and teaching recognition, not repeated recruitment incentives. |
| N09 Iris, 9/10 — replay/highlight sharer | **O:** fresh Watch a replay opened a file-led empty state; Watch expert AI offered an immediate alternative. | **H:** discovery needs an example and a clear path from a cool moment to a shareable replay. | **H:** existing sharing/takeover depth is valuable only if friends reach it easily. | **H:** memorable rivalries, curated moments and discussion support word of mouth. File handling alone does not. |
| N10 Jun, 10/10 — demanding veteran | **O:** rebound Strike to Y; clear binding feedback and practice readouts existed. Saved situations was empty; Escape changed the underlying menu without dismissing it. Return recovered. | **H:** advanced tools earn trust when focus/navigation remain predictable. | **H:** the lab, opponent variety and match quality matter more than rewards count. | **H:** depth is plausible, but balance, network quality and a durable competitive community need real long-term evidence. |

These are conditional drop-off risks, not invented departure rates or quotations from people.

### Sampled reactions actually applied

| Persona | Additional sampled constraints and checks |
| --- | --- |
| Aria | Expert computer/comparison preference: shortcut and value checks. Tired ambition: concrete first step. Distracted private-device use: pause/resume. Reliable-default/high-stakes and powerful-device expectations: saved reward truth and immediate feedback; no performance benchmark claim. Jargon-familiar modifier applies only to terms already known, not expert FGC skill. |
| Ben | New computer user: literal claim/retry labels. Time pressure: short result recovery path. One-handed: single-key actions and remapping route inspected; full one-handed combat ergonomics not certified. Hard of hearing: outcome and reward information were visible; no actual hearing-access test. |
| Cora | Basic/distracted: goal retention after preview. First-session vocabulary: cost/ownership wording. Collaborative expectation: account/device scope and use-with-friends gap evaluated. |
| Diego | Basic/comparison and low energy: discoverability and reading burden. Limited dexterity: watchable examples provide a low-input learning route; independent timed execution remains untested. Low literacy: cue shapes and short consequence labels matter more. Shared-device privacy/account cleanup not exercised. |
| Emi | New computer/mobile-history and time pressure: presentation setting discoverability. Older-adult modifier used only for clarity/stability expectations. Slow/shared-network context: local path and privacy language examined; network impairment not injected. Prior failure: verified persistence rather than trusting a toggle. |
| Felix | Basic/high-stakes: reversible queue exit. Fragmented caregiver availability: practice/pause and interruption policy. Comparison lens: usable play during waiting. |
| Grace | New computer/public-space: plain lab entry; privacy not independently tested. Failure history/low energy: demonstration truth and recovery. Help-seeking/guided preference: watch/try loop. Financial concern: no charge needed for demonstrated practice; no real-money purchasing tested. Design sensitivity: hierarchy and consistency. |
| Hugo | Basic/distracted: cold invitation, clear room state. Non-native-language/time pressure: social earning terminology and buried coaching route. Repeat-use lens: returning to a practice session. |
| Iris | New computer/first-session: file-led replay entry. Vague goal: Watch expert AI as an example. Small-screen constraint: actual 1024×720 window; no phone claim. High-stakes: reversible entry and ownership clarity. |
| Jun | Basic/low energy: remapping and back navigation. Unfamiliar vocabulary means Touch of Death-specific labels despite expert FGC knowledge. Comparison lens: discoverable practice instrumentation. |

All AI-familiarity modifiers are retained in manifests but inapplicable to AI-assistant orchestration: these missions used game opponents and fixed demonstrations, not a generative assistant. Other unexercised constraints above remain explicit limits.

## Findings, ordered for action

### A01 · P1 · A ready reward looks disabled

**Observed:** after Ben lost his first set, the claimable milestone used `rgb(16,22,18)` text on `rgb(41,55,45)`: approximately **1.47:1 contrast**. Unready milestone labels were easier to read. [Screenshot](../.local/user-audit-20261023/N02/corrected/08-earned-milestone-ready.png). The enabled button worked once deliberately selected.

**Cause:** the ready-state ink color in `scene3d/rewards/styles.ts` survives a later, more specific activities-button background rule. **Impact:** a novice can miss the first free unlock and conclude losing gave little reward. **Repair:** make the ready state visibly actionable across default/hover/focus; say “Claim +100” alongside the earned milestone. Verify at the actual result-to-Rewards entry, not only an isolated button.

### A02 · P2 · The first unlock is partly below the fold

**Observed:** the first box produced “Top color: Moss”; its new-style spotlight was beneath the goal chooser, partly clipped by the scroll area at 1366×768. The collection-side Equip action remained reachable. [Reveal](../.local/user-audit-20261023/N02/corrected/11-first-unlock-reveal.png).

**Cause:** `panel.ts` places the goal before the spotlight; the fixed footer preserves navigation but does not prioritize the newly earned item. **Impact:** the emotional high point reads as another row in an account screen. **Repair:** make a new unlock the immediate focal content, show it on the actual fighter, and keep Equip/Keep playing visible together. Preserve the saved receipt and immediate ability to skip animation. Completion: the first reward can be identified and equipped without scrolling.

### A03 · P2 · Comfort preferences do not survive returning

**Observed:** Emi enabled Reduce motion and blur; after a real reload the checkbox was false. [Before](../.local/user-audit-20261023/N05/followup/06-reduced-motion-enabled.png), [after](../.local/user-audit-20261023/N05/followup/07-reduced-motion-after-reload.png). It also lives outside Game settings, in a separate small disclosure.

**Cause:** `standalone-3d.ts` initializes `reducedMotion = false`; the standalone control callback only changes that local variable. **Impact:** repeat setup and lost comfort expectations, potentially a session-ending issue for motion-sensitive players. **Repair:** persist the game preference with other settings, respect the system default when no override exists, and put motion/blur beside the presentation settings. Verify reload and a new match, with semantic defense cues retained.

### A04 · P2 · Saved situations does not own Escape

**Observed:** opening Saved situations from Practice showed its empty dialog over Paused. Escape changed the underlying screen to the title menu while the dialog remained open. Return closed it and allowed Free practice. [Before](../.local/user-audit-20261023/N10/recovery/06-persistent-practice-entry.png), [after Escape](../.local/user-audit-20261023/N10/recovery/07-escape-from-saved-situations.png).

**Boundary:** modal input and the standalone pause/menu owners; `practice-library.ts` opens the library through pause callbacks. The exact event interception needs a focused implementation trace. **Impact:** an expert can no longer predict where Back goes. **Repair:** the topmost modal consumes Escape/controller Back, restores its launch context and focus, and leaves underlying navigation untouched. The visible Return recovery is already usable.

### A05 · P2 quality gap · The fighter is not the visual centerpiece

**Observed judgment:** normal learning/combat captures show fighters roughly 120–150 pixels tall in a 768-pixel viewport, while large wall masses, repeated stairs, outlined faded structures and instruction panels occupy much more space. The Yard shift preview gives the figure only about 150 pixels of height inside a wide mostly empty canvas. [Gameplay](../.local/user-audit-20261023/N04/run/03-parry-lesson-before-example.png), [wardrobe](../.local/user-audit-20261023/N03/run/05-locked-outfit-preview.png).

Identity colors and silhouettes remain distinguishable. The perceived finish falls short of the requested bar because costume construction, expression, contact poses and material differences are difficult to appreciate at that scale. The directed Theater capture is intentionally wider and is not used as normal-camera proof.

**Repair direction:** inspect a close-range camera/framing pass that keeps both fighters and exits visible; give wardrobe a larger, consistently lit model and useful detail views. Strengthen actor/environment value hierarchy and quiet scenery-edge contrast in the combat corridor while preserving the approved faded-scenery outlines. Use matched normal-camera before/after clips and the existing forearm/motion locks. Do not substitute added particle count or arbitrary texture noise for readable form.

### A06 · P2 · Teaching asks the player to read while watching

**Observed:** Diego's parry demonstration combined goal, progress, input frame, instruction, success definition, example status and several buttons in a panel up to about one third of screen width. Grace's completed combo example still showed technical timing details. [Parry](../.local/user-audit-20261023/N04/run/05-parry-observed-consequence.png), [combo receipt](../.local/user-audit-20261023/N07/deeper/results.json).

**Impact:** eyes move away from the action whose timing is being taught; especially costly for low-reading/low-energy personas. **Repair:** during an attempt prioritize one action, one input and a spatial/timing cue; expand explanation after failure or on request. Preserve the excellent Watch/Try loop. Let successful technique recognition remain visible long enough to understand and connect it to the next actual fight. Validate comprehension with players who must identify the cause without reading help afterward.

### A07 · P2 quality gap · Defense vocabulary works best in isolation

**Observed:** parry has a prominent radial effect plus “Opening denied”; tech adds surface recovery feedback; armor uses a gold body treatment plus “Charge spent”; DI is principally clarified by “Launch steered.” Native parry/tech examples and the four staged fixtures are distinguishable with their labels. This is an improvement, not evidence of missing particles.

**Remaining gap:** tiny body treatments and transient HUD captions carry much of the meaning; no blind comprehension test, color-vision test, reduced-motion comparison or crowded weapon/decoration stress test was completed. **Repair direction:** preserve shape/location semantics, distinguish “input attempted” from “defense succeeded,” and show what happened next—e.g. parry denied an opening, while DI may still leave the player under pressure. Test simultaneous effects and cosmetic extremes at gameplay size before adding intensity. Combat information must remain legible with decorative effects reduced.

### A08 · P2 · Collection breadth overstates perceived variety

**Source plus observation:** the current earnable pool contains 66 items; **44 are four sets of eleven color variants**. Six are garment/footwear alternatives. Ben's first random unlock was a top color, not a new silhouette. Exact styles and three coordinated looks provide a meaningful alternative, but choosing them is text-first.

**Impact hypothesis:** a collector can earn frequently and still feel little changed. **Repair direction:** lead the first earned identity moment with an attractive, previewed choice; make coordinated looks visually browsable and show each missing component on the model. Build reward variety around visible construction, entrances, recovery/victory expression and personal achievement, with gameplay readability protected. Existing identity options remain free and cosmetics remain noncompetitive. More currencies or duplicate filler would not improve this loop.

### A09 · P2 · Social rewards are bounded but hard to feel

**Observed/source:** room entry explains 25 coins per five active minutes, capped at 100 per UTC day. Connected training and its coaching controls show no elapsed/eligible progress toward the next grant. The host requires changing active inputs from both players within fifteen seconds; observation/explanation can stop accumulation. Partial minutes are lost when the room closes. [Coaching view](../.local/user-audit-20261023/N08/coaching/05-coaching-controls.png), [host owner](../host/progression/social-room.ts).

**Impact:** “we practiced together” and “the meter counted us” can disagree. A coach can feel unrewarded for doing the activity the mode encourages. The chosen social cap remains appropriate to the authorized direction; the missing experiential feedback is the immediate issue.

**Repair direction:** show discreet shared-session progress, eligibility/paused status and saved payout; summarize both players' contribution on leaving. Evaluate host-verifiable shared training objectives within the existing bounded cosmetic economy. Preserve partial progress where practical. A completed session should still celebrate learning or rivalry after the daily coin cap, without inventing more spendable currencies or rewarding spam invitations.

### A10 · P2 · Reward pace favors claiming and solo sets over teaching

**Model:** the first daily claim plus expected free wheel is 105 coins; a capped social day is 100 coins after twenty eligible active minutes. A one-hour, twelve-set solo model yields 780–1,320 coins with eligible milestones, before daily/wheel/lesson rewards. These are explicit assumptions, not observed player earnings. [Model](../.local/user-audit-20261023/economy.json).

**Impact hypothesis:** a friend-first player sees slower wardrobe access despite meaningful play. **Repair direction:** keep optional daily claims quiet, surface first-session/learning accomplishment, and connect bounded social participation to a desirable existing cosmetic goal. Add recognition for a successful taught technique, a close set or a rivalry milestone. Evaluate perceived fairness before raising currency rates; the catalog already exhausts quickly for solo players.

### A11 · P2 · Local identity progress has a social handoff cost

**Observed/source:** Rewards explicitly says Device rewards are separate from online. The friend room shows the host identity and “Use saved fighter online,” with no saved fighter in a fresh profile. Account balances and ownership are independently validated. This is a truthful boundary, not a save-loss bug.

**Impact hypothesis:** a collector expects the identity they worked on to be the identity friends see; separate progress and publication steps can break that expectation. **Repair direction:** explain the intended home for progress at mode entry, preview what friends will see, remember the selected goal across appropriate contexts and make publishing an eligible saved fighter obvious. Preserve trusted ownership checks; do not import arbitrary local balances as account currency.

### A12 · P2 · Waiting still costs momentum

**Observed:** Felix could leave the empty loopback queue directly into practice, which is a useful recovery. Staying queued and warming up were mutually exclusive. This says nothing about public player population. Entry also warns about the ten-second return allowance when switching tabs.

**Repair direction:** practice while searching, a clear match-ready handoff, preserved setup, and interruption-aware queue controls. For a ten-minute player, time spent navigating or waiting is a large portion of the session. Keep a friend-invite fallback and tell the player what remains active.

### A13 · P2 · Sharing depth is not yet an inviting first experience

**Observed:** Iris's fresh replay entry asks for a file and explains compatible game versions. No replay/example is present there; Watch expert AI is a separate alternative. Existing systems already support private-result sharing, Quick Play sharing, bookmarks, saved situations and replay takeover. They must not be reported as absent.

**Repair direction:** connect the result's meaningful moment to those existing tools: one action to watch it, one to try another answer, one to share. Give recipients a clear moment label, players/outcome and immediate playback/takeover choice. Offer an authored example in an empty library. Evaluate optional clip export/share cards as additions; do not require players to recruit others for core rewards.

### A14 · P2 horizon risk · The economy does not supply a 100-hour identity arc

At five minutes per set, immediately claiming available set/win milestones and buying only no-duplicate 100-coin boxes, all 66 items are affordable after **88–139 sets, about 7.3–11.6 hours** across 100% to 0% win-rate assumptions. The 50% case reaches affordability at 100 sets, 8.3 hours. Three-minute sets multiply those hours by 0.6; ten-minute sets double them. Daily bonuses and lessons make it earlier. Buying exact pieces changes the spending path; this is not a prediction that every player will finish the collection at that time.

After 24 or 100 cumulative hours, the same box model has no remaining catalog reward. Existing milestones reach 1,000 sets, 500 wins and 100 claim days, but many are counters rather than demonstrations of a new skill. Recent rivalry scores, saved situations and replay learning already provide foundations for another kind of progress.

**Repair direction:** reward specific mastery and shared stories: first successful match parry, improved escape consistency, a saved-and-solved situation, a new opponent adaptation, a close rivalry, or teaching a friend. Prefer visible records, profile expression and contextual next challenges over simply slowing cosmetic acquisition. Balance and opponent quality are essential unassessed gates for a veteran's 100 hours.

## What is already worth preserving

- First movement and connected-hit clears gave honest saved +25 receipts. Demonstrations were clearly labeled examples and did not pretend to be player progress.
- A loss gave coins, a concrete mistake explanation and a direct retry of the decisive exchange. The corrected journey reached the retry after claiming and opening a box.
- Goal pinning was free, showed the next 200-coin piece and the 800-coin complete Yard shift cost, survived a preview round trip and prevented saving locked equipment.
- Parry/tech labels pair result names with consequences. Readouts, frame timing, input history, opponent routines and saved exchanges offer real depth.
- Cold friend invitations now open review correctly. Shared training exposes mutual reset and side swap; private results already have rivalry history and sharing.
- Menus generally had readable hierarchy and reachable Back controls. Native remapping worked. The identified exceptions deserve focused repair.

## What players are looking for, and what to build first

| Desired feeling | Existing foundation | Smallest convincing next improvement |
| --- | --- | --- |
| “I made that happen.” | contact, defense captions, native timing | readable anticipation/contact/recovery at gameplay size; brief causal result attached to the action |
| “I am getting better.” | examples, retry exchange, readouts | one chosen skill goal, recent improvement and a recommended next attempt |
| “That fighter is mine.” | wardrobe, signature looks, exact targets | large model preview, visual target browsing, immediate equip reveal and a clear online identity handoff |
| “Losing was still worth it.” | +40 and first-set milestone | legible claim, visible first unlock, improvement recognition beside Rematch |
| “We did something cool together.” | training, rivalries, replay sharing | shared session recap, best exchange, teaching success and bounded-progress visibility |
| “I want to show somebody.” | replays/bookmarks/takeover | contextual shareable moment with a frictionless recipient landing |
| “I can return when I want.” | saved rewards, local practice | persistent comfort settings, consistent Back, no lost partial social progress or pressure to maintain a login streak |

Recommended order:

1. **Repair the earned-reward path and returning-user defects:** A01–A04. Replay first loss → claim → unlock → equip → return, plus motion reload and every modal's Escape/controller Back.
2. **Make the game itself carry the payoff:** A05–A08. Matched camera/lighting/wardrobe evidence; compact teaching; cue checks with crowded effects. Preserve the owner's approved visual and motion qualities.
3. **Make friend sessions visibly worthwhile:** A09–A13. Progress/recap, teaching recognition, practice during queue and contextual replay sharing. Retain the bounded social-cosmetic direction.
4. **Validate the long arc:** A14. Real players spanning 3–10 FGC familiarity should return voluntarily, describe why a fight turned, identify their earned identity change and find a meaningful next goal after the collection is complete.

Do not call the 90/100 expectation met until real-player comprehension, sound-on motion review, hardware/controller access, ordinary live frame pacing, sustained multiplayer and repeat-session satisfaction have evidence. Passing interaction scripts establishes reachable behavior; it does not establish delight.

## Repair pass

Implemented locally following the user's “fix” instruction. The bounded social-cosmetic direction remains unchanged. **Fixed** below means the concrete interaction defect was repaired and replayed; **partial** means useful implementation landed but the broader finding remains open. No human quality acceptance or release approval is implied.

| Finding | Current result | Status and residual gap |
| --- | --- | --- |
| A01 | Enabled claims use dark text on gold, explicit action/amount; sampled contrast improved from 1.47:1 to 9.02:1. | Fixed. |
| A02 | Latest unlock precedes the goal panel; Equip and View on your fighter preserve the exact earned item. | Fixed. First chosen jacket was unlocked and equipped through native input. |
| A03 | Reduced motion lives inside Game settings, starts from the system preference and persists with this game's controls. Celebrations respect it. | Fixed. Reload retained the selected value. |
| A04 | The topmost modal owns Escape/Back even when focus moved to the canvas; gameplay does not consume its dismissal. | Fixed. Saved situations replay and focused keyboard/controller-navigation tests pass. Physical controllers remain untested. |
| A05 | Closer city combat framing retains fit constraints; the wardrobe gives more height to the fighter. | Partial. Matched desktop renders and narrow layout inspected. No new character/environment assets, lighting overhaul or human art approval. |
| A06 | Live coaching prioritizes current action/input/feedback, with Lesson details for expansion; examples are more compact. | Fixed layout defect. Native parry/combo examples replayed; human comprehension remains unmeasured. |
| A07 | Larger fighters and less coaching obstruction improve the existing defense vocabulary; semantic shapes remain intact. Four defense fixtures recaptured. | Partial. Crowded cosmetics, color-vision and matched reduced-motion comprehension still need evaluation. |
| A08 | An empty collection can choose its first individual style for 100 coins, covered by the first-set milestone even after a loss. Later exact styles remain 300; look pieces remain 200. | Partial. Preview/choice/equip works; the 44 color variants and limited silhouette variety remain. |
| A09 | Friend play displays host-reported eligible time, paused/waiting/saving/capped status and saved progress. Rules state the room lifetime. | Partial. The 25-per-five-minutes / 100-per-day cap is preserved. Teaching inactivity still pauses accrual; partial time still ends with the room. |
| A10 | Milestones lead Rewards; optional Daily/Wheel move behind collection and mastery. Successful player drills get saved recognition. | Partial. Currency rates are unchanged. Shared teaching/rivalry recognition and session recaps remain future work. |
| A11 | Online handoff names the saved fighter, shows when it already matches and explains unavailable account-owned styles before publication. | Partial. Ownership authority is preserved; a fully earned device-to-account identity journey was not replayed. |
| A12 | Practice while searching preserves the local checkpoint, keeps the queue active and yields to match-ready/mutual acceptance. | Fixed. A real two-context loopback handoff reached the online match. |
| A13 | Empty replays offer an expert fight; empty saved situations link to creating a routine. Existing sharing/takeover remain. | Partial. Native empty-replay recovery passed; a new moment-focused recipient page or clip export was not added. |
| A14 | A device-saved technique journal records successful player clears, recognizes five/twenty clears and directly starts each drill. Examples do not count; no account currency is invented. | Partial. This is repetition recognition, not proof of competitive mastery or a complete 100-hour progression arc. |

Evidence is owned by `.local/user-audit-fixes-20261023/`; prune it after findings are superseded and necessary evidence is promoted. The previous baseline remains intact for comparison.

- [Ten unchanged persona seeds replayed](../.local/user-audit-fixes-20261023/first-pass-summary.json): 74 recorded flows, zero action failures and zero uncaught page exceptions. Later targeted passes covered the changed reward choice, framing, journal, narrow layout and multiplayer transitions. These are short simulated journeys, not long-duration playtests.
- [First loss → claim → choose → equip → retry](../.local/user-audit-fixes-20261023/N02/final/results.json), [motion reload](../.local/user-audit-fixes-20261023/N05/run/results.json), [modal recovery](../.local/user-audit-fixes-20261023/N10/run/results.json), [390×844 emulated layout](../.local/user-audit-fixes-20261023/N03/narrow/results.json). No horizontal document overflow in the narrow replay; it is not a physical-phone test.
- [Queue handoff](../.local/user-audit-fixes-20261023/N06/handoff/results.json) and [cold friend invitation/coaching/progress](../.local/user-audit-fixes-20261023/N08/final-friends/results.json) completed with no reported errors and owned-browser cleanup. Native friend evidence shows paused progress; real WebSocket tests with a controlled host clock prove active progress and saved payouts. WAN behavior, sustained native five-minute payouts and ordinary frame pacing are unverified. Background two-context captures are not performance evidence.
- The first new journal replay [exposed a shortcut defect](../.local/user-audit-fixes-20261023/N07/mastery/results.json): closing Rewards did not enter practice. Fixed the phase transition, then [replayed the repaired final package](../.local/user-audit-fixes-20261023/N07/mastery-final/results.json): seven flows, no failures, an actual player parry and a count of one after reload. Failed evidence is retained.
- Focused checks: **127 editor tests, 22 reward/host tests and 21 camera/presentation tests passed** (170 total); editor and game typechecks passed. The final reward copy adjustment also passed all 26 reward UI tests. Process-policy check passed (5,271 files, no violations). Source-structure and code-style gates remain red on pre-existing dirty-tree findings; this pass does not claim the repository-wide check is green.
- Final [local package receipt](../.local/user-audit-fixes-20261023/package-build4.json): runtime SHA-256 `c02be7e4114e176e9d710c5f65af75539dec85562801eb9d9c1a8a7e80df9eba`; content ID remains the audited `combat-v39` value above. Profile/community/Quick Play/training protocol versions remain 5/11/10/5. Social activity is an additive validated notification, separate from authoritative saved rewards.

The next quality evidence should come from real players identifying defense consequences in busy combat, a sound-on art/motion review, sustained friend sessions and repeat visits after cosmetic completion. Catalog variety, shared-session recognition and a deeper mastery arc still require product work; this repair pass does not claim the 90/100 expectation has been met.
