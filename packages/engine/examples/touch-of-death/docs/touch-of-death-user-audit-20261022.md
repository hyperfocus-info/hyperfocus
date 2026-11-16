# Touch of Death: ten-player friction audit

2026-10-22 · Audit only · FGC familiarity 3–10/10

**The strongest opportunity is to connect the systems already present: invite →
fight → understand → retry → earn → share → return.** The game has substantial
training, replay and social functionality. Players can still lose the thread at
the transitions, and the current reward economy does not carry a collector to
100 hours.

The first work should be cold invitation handling, truthful combat help, visible
post-loss progress, reliable menu recovery, and recognition for playing with
friends. More particles, currencies or menus would not address those failures.

## Method and limits

These are **ten simulated player perspectives evaluated by one agent**, not ten
human participants, independent agents, or measured retention. Familiarity is
with fighting-game concepts, not general computer skill. Each seeded persona and
mission was persisted before interaction. The 15-minute and one-hour journeys
combine bounded native browser probes with scenario reasoning; nobody played
each complete duration. **24 and 100 hours mean cumulative gameplay time**, and
are projections from current mechanics, content and incentives.

- **O — observed:** native UI, resulting domain state and inspected screenshots.
- **S — source:** current implementation or owning contract; not necessarily a
  fully exercised end-to-end path.
- **H — hypothesis:** expected player reaction or proposed improvement requiring
  human validation. Every dropout prediction is H.

The artifact used current exported standalone runtime and the canonical local
project, packaged with identity verification. Combat identity:
`combat-v39:f8442de34012bed7286b361931156c673feec2b4cf1f723cefaeec79bc80d9f6`.
Native runs used isolated profiles and a disposable local guest host, at
1366×768 plus 390×844 layout probes. Two separate clients joined an actual private
room. One real AI set reached a natural 0–3 result, followed by retrying its
decisive exchange. Parry and surface recovery were observed through the game's
own half-speed demonstrations. No health, victory or reward outcomes were forged.

Human fun, actual comprehension, physical controllers, screen readers, subjective
audio quality, production sign-in, WAN latency, queue population and sustained
retention remain unmeasured. Short captures do not establish clutter-free effects
through a complete crowded fight. No release or performance acceptance is implied.

## Findings, in delivery order

P1 means a major task is misleading or trust/recovery is impaired; P2 means
meaningful friction with a workaround. Strategic hypotheses are labeled as risks,
not promoted into confirmed defects. No P0 crash or data-loss defect was confirmed.

| ID | Priority / evidence | Trigger and impact | Smallest useful response | Evidence |
| --- | --- | --- | --- | --- |
| F01 | **P1 · O+S** | A fresh friend opens a valid room link, sees Sound check, skips the guide, and reaches the ordinary main menu with no invitation. The invite appears only after **Play → Invite a friend**. A newcomer may conclude the link failed. | Preserve incoming invitation as startup intent through sound/onboarding/sign-in. Show room identity and an explicit Join action without requiring menu discovery. | [Two-client receipt][E-friends]; [lazy panel][S-lazy] and [hash handling][S-invite]. Both clients joined after manual recovery. |
| F02 | **P1 · S** | Combat help says **“Block stun locks your facing.”** Current tuning permits turning at 60°/second while guarding or blocked. Experienced players can build the wrong defensive model. | Generate this explanation from the active rule; demonstrate slow turning and a cross-up with actual input timing. | [Help, line 32][S-help]; [preset][S-preset]; [simulation, lines 92–95][S-simulation]. |
| F03 | **P2 · O+S** | A natural lost AI set shows useful causal feedback and Retry, but no earned coin amount or newly claimable milestone. The 40-coin award exists; the result screen does not make that progress visible. | Show saved earnings, nearest chosen cosmetic, and ready milestone on the result; allow a quick claim/equip without losing Rematch focus. | [Loss result][E-result]; [reward rules][S-rewards]. |
| F04 | **P2 · O** | Escape pauses a live AI match; a second Escape leaves it paused at the same simulation tick. Clicking Resume works. The footer advertises “Esc Back.” | Give pause-root Escape a consistent resume behavior; preserve nested Back and focused input behavior. Recheck keyboard and controller separately. | [Pause/retry run][E-combat]; [menu key routing][S-menu-input]. Exact event-routing cause remains a diagnosis, not a repaired fact. |
| F05 | **P2 · O+S** | The room creator sees “Joining your friend”; Return to local play visually dominates Invite friend. Quick Play also tells the player to create a private set. These screens contradict the selected task. | Use host/join/search-specific state copy. Make Invite the host's primary waiting action, with leave secondary. | [Host screenshot][E-host]; [Quick Play capture][E-queue]; [discovery copy, line 51][S-entry]. |
| F06 | **P1 product-alignment risk · S+H** | Private friend sets and shared training earn no set coins, while eligible AI/Quick Play/winner-stays sets do. A novice can spend an evening learning with a friend and see less external progress than grinding AI. | Introduce bounded, verified social or learning recognition. Keep competitive currency integrity; do not import untrusted results or reward win trading. Clearly state eligibility before play. | [Progression contract][S-rewards]. The mismatch is established; its retention effect is projected. |
| F07 | **P1 longevity risk · S+H** | The initial 66 earnable cosmetics cost 6,600 coins through duplicate-free boxes. A simple 50%-win model clears the pool in 100 sets. High-count milestones then grant currency with fewer meaningful choices remaining. | Develop mastery and social goals plus meaningful cosmetic variety. Test the cadence before increasing prices or grind. | [Economy arithmetic][E-economy]; [model][S-model]. |
| F08 | **P2 · S** | “Visit on three days” and other return-day milestones advance on the **daily claim command**, not merely visiting or playing. Players can return without receiving the expected credit. | Either count qualified visits automatically or name the requirement accurately. Prefer removing claim administration from recognition of attendance. | [Model, lines 77–80][S-model]. |
| F09 | **P2 · O+H** | Rewards and Controls use internal scrolling at 390×844; Back is below the initial viewport. Combat help is sequential pages rather than an indexed answer to a specific question. | Keep Back/Close available, preserve focus, and add direct topics or loss-to-drill links. Avoid more root-menu entries. | [Narrow Rewards][E-narrow-rewards]; [narrow Controls][E-narrow-controls]; [combat reference][S-reference]. Scrolling is usable, not a demonstrated unreachable control. |
| F10 | **P2 social risk · S+H** | Active fighters suspend/disconnect when their tab becomes hidden, with a ten-second recovery allowance. Switching to chat to coordinate or share may cross this boundary. | Offer safe sharing between bouts and clear recovery status. Test chat switching with two real machines before changing competitive grace rules. | [Connection contract][S-network]. Not reproduced in this audit. |
| F11 | **P2 · O+H** | A search on the deliberately empty local host offers Cancel and Leave, with no visible practice-while-waiting path. A short-session player has no useful in-game waiting activity. | Let the player warm up while queued, with an unmistakable match-ready handoff; offer friend/AI alternatives without disguising bots as people. | [Search capture][E-queue]. This is not a claim about production queue time or population. |

## Ten players across four horizons

Names are fictional handles, not demographic claims. Seed format is
`tod-20261022-P01` through `P10`; complete sampled constraints are in the
[persona manifests][E-root]. Cells describe simulations and projections, not
recorded participant statements. “Exit” describes a plausible dropout trigger.

| Player / motivation | First 15 minutes | At 1 hour | At 24 gameplay hours | At 100 gameplay hours |
| --- | --- | --- | --- | --- |
| **P01 Maya · FGC 3** · spectacle newcomer; keyboard; distracted/noisy context | Movement lesson gives a clear 25-coin success; an out-of-range strike receives actionable correction. Needs an early successful exchange she caused. Exit: repeated failure before that moment. | A real loss explains that guard was absent; Retry works. H: a long loss sequence still feels helpless if the one controllable mistake is not made prominent. Show a saved reward and one attainable defense goal. | H: recognizable improvement must replace introductory novelty. Offer a personal challenge based on a recurring loss cause, not just more sets. | H: stays for expressive play and friends; likely leaves if the loop remains “lose, collect coins, repeat.” Keep opt-in goals and satisfying defense moments. |
| **P02 Eli · FGC 3** · joins an expert friend; controller interest | F01 blocks the obvious invitation path. Recovery needs the friend to explain the menu. Exit: “the link didn't work,” before the first bout. | H: repeated losses plus no private-set coins make the session feel like helping the expert have fun. Shared training and a cooperative learning objective should be easy to reach. | H: returns when both players can pursue something together and show individual improvement. A bounded shared challenge can reward participation without fabricated equal skill. | H: belonging and a recognizable rivalry matter more than rank. A recurring friend-night ritual and teaching tools can sustain play; no reason to insist on competitive grinding. |
| **P03 Noor · FGC 4** · collector; keyboard/pointer | Pinning a look, previewing it and buying the next piece already exist. The four-piece Yardshift target is 800 coins, with a 200-coin next step. The first step should be visible after play. | H: a box often giving a color variation can feel smaller than the celebration implies. Offer predictable choice and a useful equip preview; keep random boxes optional. | H: collection exhaustion is credible under the arithmetic below. Exact purchases change pacing, so exhaustion time is not universal. More palette variants alone may not create a new aspiration. | H: currency without valued items loses meaning. Needs identity, mastery display and meaningful new choices, not an inflated cost for the same pool. |
| **P04 Jules · FGC 5** · movement explorer; controller interest; low general computer fluency | Training categories are navigable and the recovery example shows a real TECH cue. H: FGC experience does not remove the need to explain this game's spatial movement and dual-purpose inputs. | H: wants to reproduce a launch, steer and surface recovery without guessing what changed. Link a failed attempt to timing/path evidence and a short retry. | H: route discovery and environmental variations can hold interest. Needs saved situations and challenges that expose alternatives; the existing practice library is a foundation. | H: stays for expressive routes and rivals who force adaptation. A solved dominant route or visually unreadable scramble would end experimentation; neither is established here. |
| **P05 Ren · FGC 6** · traditional fighter; keyboard | Can skip familiar tutorial phases. F02 is especially damaging: transferred guard knowledge is tested against misleading help. | The parry example explains fresh press versus held guard and shows a readable cue. H: wants the same causal precision for armor, guard angle and missed conversions. | H: trusts the game if input, collision and recovery explanations agree. Provide comparable saved exchanges, not a generic “try harder” tip. | H: balance trust, matchup depth and precise training sustain play. Claims of unfairness need replayable evidence; this audit did not establish a balance defect. |
| **P06 Sam · FGC 6** · short sessions; keyboard; sampled blind/screen-reader constraint | Keyboard menu controls were exercised; **nonvisual combat was not validated**. May be unable to begin meaningful play. A semantic menu is insufficient proof of an accessible fighter. | Mission completion remains unassessed until spatial/audio information and assistive technology are tested. Independently, F04 and queue idling waste a short session. | No responsible retention forecast for this constraint without accessible combat evidence. If that prerequisite is met, fast return to a chosen mode and durable goals matter. | Same prerequisite. Do not count this persona as successfully served. Test with a blind player; preserve concise optional spoken cues and user control over repeated announcements. |
| **P07 Inez · FGC 7** · combo lab specialist; keyboard | Reaches Free practice and Training setup. There are already timing, inputs, defensive-attempt and combo diagnostics; the issue is discovering the right instrument. | H: wants “why this route dropped” and immediate repetition under the same conditions. Local decisive-exchange retry is a strong start; full route reproduction was not demonstrated. | H: saved variants, searchable notes and shareable challenges become more useful than another generic achievement. Keep the original state and input context attached. | H: a reliable laboratory and knowledge-sharing community can justify the hours. Version-incompatible archives or losing valued situations would erode that investment; test migration expectations explicitly. |
| **P08 Dev · FGC 8** · competitive regular; controller interest; tired/time pressured | Quick Play's private-room copy is misleading. Empty-host searching is recoverable, but offers no visible warm-up path. No population verdict can be drawn. | H: needs acceptable real network behavior and matched opponents; neither was established. Useful loss review and progress should remain available after either result. | H: skill trend and recurring matchup problems matter more than attendance counts. Measure actual competitive credibility before adding ranked incentives. | H: stays for opponents, depth and trust. Netcode, matchmaking quality, smurfing, ranking calibration and balance remain important unmeasured gates, not assumed failures. |
| **P09 Ash · FGC 9** · friend-night host and clip maker | Room creation and replay entry work; the first guest's F01 problem becomes the host's support burden. Host copy and action priority add confusion. | H: winner-stays, spectating, room voice and shared training provide a strong party foundation. End-to-end party operation and voice across networks remain unverified. | H: wants moments worth sending and effortless recipient playback. Replay takeover links already exist; promote them consistently and add a broadly viewable clip path as a candidate. | H: group traditions, shared history and newcomer care sustain the room. Existing rivalry is bounded device history, not a complete synchronized season record. Build on it if real groups value more. |
| **P10 Kai · FGC 10** · coach; limited dexterity; keyboard priority despite controller interest | Controls offer remapping, layouts and toggle Drive. Actual physical comfort and conflict recovery were not tested. Prefer the chosen input's labels and show unbound actions clearly. | H: expects exact causal explanations and repeatable examples. F02 damages trust; existing attempt diagnostics and takeover can repair understanding when discoverable. | H: needs reliable teaching links, side swapping and the ability to isolate a student's mistake. Reward mentorship without farming students or exposing their data by default. | H: the product becomes valuable as a trusted training and community tool. Precision, accessible controls, archive continuity and competitive integrity outweigh a large achievement count. |

## Visibility: explain the causal chain

The observed parry is a white/cyan upright burst with **PARRY / Opening denied**.
The observed surface recovery has a ground effect with **TECH / Recovery timed**.
Both demonstrations identify the actual binding and timing, distinguish an
example from the player's own clear, and provide Try it yourself. These are
strengths, not missing tutorials. [Parry capture][E-parry], [tech capture][E-tech].

The source also defines distinct armor and DI labels, brief retention of defense
messages, and a shape-based particle legend in Combat controls. DI explicitly
means the launch was steered, not that the combo was escaped. The legend exists;
its discovery and transfer into a fast real fight are the open questions.
[Defense signals][S-defense], [particles][S-particles], [help][S-help].

| Event | What the player must understand | Current evidence / remaining test |
| --- | --- | --- |
| Parry | Fresh guard timing denied the opening; merely holding guard is different. | O: example, timing instruction, effect and label. Test recognition at full speed without the lesson panel. |
| Surface tech | A timed surface recovery succeeded; the preceding hit can still have dealt damage. | O: example ends at 76 health with TECH. H: explain this sequence so “successful defense” is not read as “no damage.” |
| Armor escape | A resource was spent; distinguish armor contact, damage and actual escape from pressure. | S: label and gold-facet design. Full live sequence not inspected. |
| DI | Input changed trajectory during the allowed window; it does not promise safety. | S: documented explanation and confirmation. Compare two actual paths with a human player. |
| Guard loss / combo end | Which opening occurred, why guard failed, and which next input could change it. | O: natural result names absent guard and contact frame; retry restores the exchange. Guard-turn help contradicts the active rule. |
| Weapons / environment | Who owns the tool, what hit, what broke, and whether damage came from fighter, item or surface. | S: arena lesson and prompts exist. A crowded full-speed sequence, occlusion and simultaneous effects remain unassessed. |

Recommended progression: **name the result during combat; explain the cause
afterward; offer the relevant retry.** Keep shape, position, text and sound
redundant, with an optional beginner vocabulary. Put an indexed cue glossary next
to a watchable example. Use actual contact/input evidence for explanations.
Avoid celebrating “escape” when the player merely steered into another hit.

Do not increase particle quantity before testing recognition. Have players name
the event and reason from short clips at normal speed, reduced motion and varied
backgrounds. The two inspected demonstrations do not settle color-vision,
screen-reader, motion-sensitivity or audio accessibility.

## Rewards: make progress credible before making it larger

The existing economy has useful protections: cosmetics do not affect combat,
losses still earn eligible set coins, boxes exclude duplicates, exact goals are
pinnable, and first lesson clears pay 25 device coins. There are 17 permanent
milestones. Daily claims and the wheel are optional; missing a day does not erase
owned items. [Owning reward contract][S-rewards].

The immediate problems are **visibility, activity eligibility and reward quality**:

1. At the end of a loss, show the saved +40, nearest goal and ready milestone.
   Separate actual saved earnings from a pending claim. Keep Rematch one action.
2. Put device/account scope and earning eligibility next to the chosen mode or
   goal. A small scope label and rules farther down a dialog are easy to miss.
   Preserve the trust boundary; client balances are not trustworthy account proof.
3. Recognize skill and contribution: first successful defense after a recurrent
   mistake, a new route under defined conditions, a personal improvement, or a
   shared practice objective. Avoid paying endlessly for repeated trivial inputs.
4. Make the size of the reward honest. Of 66 initially locked options, 44 are
   color slots: **two thirds of a first uniform box draw**. Six are new top,
   bottom or footwear shapes. A palette choice may be welcome, but it is not
   equivalent to a new silhouette for every collector.

### Economy horizon model

This arithmetic uses actual reward functions and all ready milestone claims,
buying every unlock through 100-coin duplicate-free boxes. It excludes tutorial,
daily and wheel income. Set duration **3–6 minutes is an illustration**, not a
measured human pace. Exact purchases cost more and change the result. Balances
are scoped; this is one eligible reward scope, not combined device/account funds.

| Win scenario | Sets to afford all 66 box unlocks | Illustrative gameplay time |
| --- | ---: | ---: |
| 0% | 139 | 7–13.9 hours |
| Alternating wins/losses, 50% | 100 | 5–10 hours |
| 100% | 88 | 4.4–8.8 hours |

This supports a **content-exhaustion risk before 24 hours**, not a measured median
completion time. A 100-day milestone is not a 100-gameplay-hour retention system.
Do not fix this by making the same palette rewards slower. Test valued new
expression, mastery records, optional varied challenges and social stories.
[Reproducible arithmetic and inventory counts][E-economy].

## UX and input: organize around the next intention

Keep the compact five-entry main menu. The larger opportunity is contextual
continuity:

- **After losing:** Rematch, retry the decisive opening, or inspect its cause;
  show earnings alongside those choices. Link the diagnosis to the relevant
  existing drill rather than sending the player to a generic Practice menu.
- **After inviting:** room identity, who is connected, Invite as the primary
  next action, and an obvious recovery path. Honor the recipient's deep link.
- **When searching:** useful warm-up, understandable cancellation and no invented
  queue estimates. The current range-widening explanation is useful.
- **When adjusting input:** show the active device's bindings, keep conflicts and
  unbound actions visible, retain the existing tester and toggle options, and
  verify a complete flow on real pads. Do not prescribe a new layout from browser
  automation alone.
- **When asking “what was that?”:** an indexed, replayable answer. Sequential
  reference pages are poor retrieval for an exact unknown event.
- **When leaving a panel:** stable Back/Escape behavior, visible close affordance,
  retained scroll/focus and no input leaking into the fight.

“World class” here means the player's intent survives each transition. These
criteria are more actionable than adding navigation layers or visual polish.

## Multiplayer and word of mouth

The foundation already includes private invitations, rematches, spectators,
winner-stays rotation, shared training, room communication/moderation, replay
review and takeover. A shared replay link can open before the decisive exchange,
lets the recipient take either fighter, and expires after seven days. Upload is
explicit and includes names/wardrobe but excludes uploaded pictures. Existing
friend rivalry keeps the latest 128 sets across rivals on the device.
[Network][S-network], [replay][S-replay], [share panel][S-share], [rivalry][S-rivalry].

The opportunity is **play → recognize a moment → keep it → send it → let the
recipient try it → play together again**. Candidate experiments, not approved
roadmap commitments:

| Player wants | Experiment | Evidence of success |
| --- | --- | --- |
| “Look what happened.” | One deliberate Keep moment action for a comeback, clever defense, environmental interaction or funny failure. Offer a watchable clip plus the existing takeover link. | A recipient understands the moment without installation or coaching, then optionally tries it. |
| “Try beating my answer.” | Add a clear challenge prompt to takeover links; preserve the exact situation and distinguish practice results from real match wins. | Recipient attempts and sends back a meaningful alternative. |
| “We made progress together.” | Bounded cooperative practice milestones and mentor recognition, separate from competitive currency where necessary. | Novice and expert both report a worthwhile session; no reward for repetitive surrender or collusive wins. |
| “Our group has a story.” | Build on existing rivalry with an opt-in series recap, shared goals and a clear route from spectator to fighter. | A group voluntarily organizes another night and successfully includes a new member. |
| “Sharing should be easy wherever I played.” | Make the existing Share this exchange affordance consistent across eligible results; Quick Play currently emphasizes Review and Save replay. | Users can find and complete sharing from each result without memorizing different menus. |
| “I want credit without being the strongest.” | Celebrate clutch recovery, a new personal answer, useful coaching or hosting—not just the winner's combo. | Weaker players choose to continue; stronger players still feel performance is represented honestly. |

Start with invitation reliability and existing share-tool discovery. Do not add
referral currency before recipients can enter smoothly. Never auto-upload a replay
or spam contacts. Preserve explicit sharing and a private session option.

## Likely dropout points and recovery

| Moment | Plausible temporary stop | Plausible permanent stop | Response |
| --- | --- | --- | --- |
| First invitation | Asks friend for help. | Concludes the link/game is broken. | F01: carry invitation intent to Join. |
| First repeated losses | Takes a break after frustration. | Believes defense is arbitrary or nothing was learned. | Truthful cause, one relevant retry, visible earned progress. |
| First settings detour | Loses the session's momentum. | Input or accessibility needs cannot be met. | Consistent recovery; actual pad and assistive-technology validation. |
| First friend evening | Stops when expert leaves. | Feels punished for choosing the social mode. | Shared goals, recognized learning, clear eligible rewards. |
| Quiet queue | Tries another mode/game. | Stops checking if waiting repeatedly wastes sessions. | Practice while waiting, honest availability and a quick friend fallback. |
| Collection mostly complete | Takes a healthy break. | Sees no meaningful aspiration left. | Mastery/expression/social depth; easy return after time away. |
| Long-term trust incident | Reviews a disputed exchange. | Believes rules, inputs or results are inconsistent. | Reproducible evidence, precise wording, stable saved situations and real network validation. |

A temporary break is not automatically a product failure. Make re-entry easy and
retain the player's goals; avoid turning streak preservation into an obligation.

## Next validation and completion threshold

The requested simulation is complete; player acceptance is not established. These
are proposed thresholds for the next **real** ten-person study, not results:

1. Fresh invite recipient reaches a reviewable Join action after any required
   sound/sign-in step, without visiting the mode menu; no lost invite on reload.
2. At least 8/10 can explain five of six sampled combat events in their own words,
   including a failure cause; evaluate low-familiarity players separately rather
   than letting experts hide their confusion.
3. After a loss, every participant can find an appropriate next action; at least
   8/10 can identify what progress was saved and reach a relevant retry unaided.
4. Keyboard and actual controllers can pause, resume, back out of nested panels,
   remap and return to combat without a focus trap or unintended combat input.
5. A mixed-skill pair can join, play, learn, keep a moment and send it to a fresh
   recipient. Ask both whether the session felt worthwhile; reward count alone
   is not that evidence.
6. Recruit assistive-technology users for nonvisual/spatial cue acceptance; do not
   count generic keyboard automation as satisfying P06.
7. Validate 24/100-hour hypotheses with longer play and opt-in longitudinal
   observation. Track return after actual sessions, chosen goals, reward use and
   voluntary sharing. A day-one return is different from 24 hours played.

No gameplay or production files were changed. The managed isolated host was
stopped, its ID disappeared from active status, and its runtime error list was
empty. Owned browser probes retained cleanup evidence. No deployment occurred.

## Evidence and reproduction

Raw inputs, screenshots, transcripts and manifests are under [the audit bundle][E-root].
Owner: this audit. Retain until findings are resolved or superseded by human
playtests; this report is the durable record.

Accepted persona-entry runs: `P01/chrome`, `P02/chrome`, `P03/chrome`,
`P04/chrome`, `P05/defense`, `P06/run`, `P07/chrome`, `P08/queue`, `P09/run`,
`P10/chrome`. Additional focused runs: `P01/combat`, `P04/tech`,
`friend-session-2`. These executed their bounded scenarios with no action
failures or uncaught exceptions; that does **not** mean all persona goals passed.

Initial selector failures and `friend-session`'s join timeout are retained, not
erased. Initial Playwright-shell captures used software WebGL; their 1–3 FPS is
excluded from a product-performance conclusion. Chrome was used for the deeper
combat/visual probes. Two simultaneous local clients also showed severe
slowdown, so multiplayer performance remains unaccepted and needs a controlled
two-machine test. P06/P09's initial menu-only runs cannot prove gameplay quality.

The existing `native-set` smoke failed because it inspected fighter visibility
while the game was paused after Escape failed to resume. This is not evidence of
a camera/culling defect. The targeted `P01/combat` probe isolated the pause
behavior and then completed the set through the visible Resume action.

T3 preview opened and navigated but twice returned
`Preview automation snapshot timed out after 15000ms.` The audit then used the
repository's owned hidden CDP runner. The package/runtime identity check passed;
the first export attempt from the wrong runtime working directory was rejected
and rerun from the editor directory. Broad code tests were not needed for an
audit-only report, and no unexecuted checks are claimed.

Reproduce a persona with the existing
[runner][S-runner], `--base-url <managed-host-url>`, `--scenario <bundle>/scenario.ts`,
`--surface touch-of-death`, its exact manifest goal, `--persona
<bundle>/Pxx/persona.json`, a new `--out`, `--enable-gpu` and installed Chrome.
`AUDIT_PROBE=combat` selects the natural set/retry probe;
`AUDIT_PROBE=defense` selects the parry example; adding `AUDIT_LESSON=tech`
selects surface recovery. [Mission][E-mission] owns the frozen scope.

## Fix replay — 2026-10-22

The requested fix pass preserves the audit above as before-state evidence. The
user selected **bounded social progress toward existing cosmetics**; the
[reward owner][S-rewards] records its rules, starting pace and compatibility.
Raw replays, captured before-files, test logs and extracted packages are in
[the fix bundle](../.local/user-audit-fixes-20261022/). Nothing was deployed.

| Finding | Change and evidence | Status |
| --- | --- | --- |
| F01 | Cold invitation acquires its review screen without visiting a menu or automatically joining. Two isolated clients enter private and training rooms (`friend-replay`). | Replayed |
| F02 | Guard help derives turning allowance from the preset; topic selection jumps directly to the particle legend (`P10-help`). | Replayed; no VFX art changes |
| F03 | Natural local loss shows +40 saved device coins and the ready +100 first-set claim, only after persistence (`P01-combat`). Account summaries avoid presenting an old receipt as this set's grant. | Replayed locally; persistence failure tested |
| F04 | Escape and controller Back resume the composed pause root once and retain nested Back navigation (`P01-combat`, menu tests). | Replayed; controller tested through input adapter |
| F05 | Correct mode/host wording; Invite friend is primary and Return is secondary. Hover contrast is repaired in `P02-host-verified`. | Replayed |
| F06 | Private sets/training earn capped participation coins. Idle/held controls, spectators, reconnects, partner changes, retries, restarts, midnight and private spectator-first ordering are tested. A real WebSocket pair receives saved receipts under a controlled host clock. | Mechanism verified; full browser grant acceptance blocked below |
| F08 | Day achievements now explicitly count daily-bonus claim days. Existing progress is retained. | Corrected |
| F09 | Rewards/Controls scroll their content while Back stays visible at 390×844 (`P03-rewards`, `P10-controls`). Help has a topic index. | Replayed at desktop and emulated narrow widths |
| F10 | Before-join guidance explains the ten-second tab-return window and sharing after the set; Quick Play results expose Share replay. | Mitigated; grace/reconnect policy unchanged |
| F11 | Empty queue offers Leave and practice, which exits the queue and enters playable local practice (`P08-queue`). | Mitigated; practice while still queued remains open |
| F07 | No artificial grind or speculative content was added. | Retention/content hypothesis remains open |

Focused verification: 191 editor tests and 105 game/host tests pass; one PostgreSQL
integration test is skipped without its disposable database URL. Game typecheck
and editor test typecheck pass. Editor-wide typecheck remains blocked by existing
`scripts/tutorial-composition/swarm*.ts` errors. Repository style/structure checks
also fail outside this change; their raw logs are retained. Exact-runtime portable
packaging passes. The 31 successful replay flows have no action failures or uncaught
exceptions. These are simulated-user regressions, not ten human participants or
measured 24/100-hour retention.

New verification limit: repeated two-client training runs stalled on native
keyboard input before five active minutes. The same timeout reproduces against
the unchanged original package (`social-baseline`), with no page exception or
host error. One paused stack was in material presentation; another renderer did
not respond to debugger inspection. This does not isolate the cause or establish
performance on two separate machines. Retain `social-replay`, `social-diagnose`
and `social-baseline`; the five-minute in-browser grant and sustained friend-play
acceptance remain unproven. Owned browsers and isolated servers were stopped.

[E-root]: ../.local/user-audit-20261022/
[E-mission]: ../.local/user-audit-20261022/mission.json
[E-friends]: ../.local/user-audit-20261022/friend-session-2/results.json
[E-host]: ../.local/user-audit-20261022/friend-session-2/01-host-invitation.png
[E-combat]: ../.local/user-audit-20261022/P01/combat/results.json
[E-result]: ../.local/user-audit-20261022/P01/combat/06-natural-set-result.png
[E-parry]: ../.local/user-audit-20261022/P05/defense/04-observed-parry-cue.png
[E-tech]: ../.local/user-audit-20261022/P04/tech/04-observed-tech-cue.png
[E-queue]: ../.local/user-audit-20261022/P08/queue/dom-text.tmp.md
[E-economy]: ../.local/user-audit-20261022/reward-horizon-model.json
[E-narrow-rewards]: ../.local/user-audit-20261022/P03/chrome/06-narrow-rewards-layout.png
[E-narrow-controls]: ../.local/user-audit-20261022/P10/chrome/04-narrow-controls-layout.png
[S-rewards]: ../host/progression/README.md
[S-model]: ../src/rewards/model.ts
[S-preset]: ../src/combat/preset.ts
[S-defense]: ../src/presentation/feedback/defense.ts
[S-particles]: ../src/presentation/feedback/particles.ts
[S-simulation]: ../../../src/combat/simulation.ts
[S-lazy]: ../../../../../apps/engine-editor/src/standalone/lazy/panels.ts
[S-invite]: ../../../../../apps/engine-editor/src/scene3d/network/invite-panel.ts
[S-entry]: ../../../../../apps/engine-editor/src/scene3d/network/hosted/entry.ts
[S-help]: ../../../../../apps/engine-editor/src/scene3d/fight-hud/control-hint.ts
[S-reference]: ../../../../../apps/engine-editor/src/scene3d/fight-hud/combat-reference.ts
[S-menu-input]: ../../../../../apps/engine-editor/src/scene3d/input/gamepad-menu.ts
[S-network]: ../../../../../apps/engine-editor/src/scene3d/network/README.md
[S-replay]: ../../../../../apps/engine-editor/src/scene3d/replay/README.md
[S-share]: ../../../../../apps/engine-editor/src/scene3d/replay/share-panel.ts
[S-rivalry]: ../../../../../apps/engine-editor/src/scene3d/network/rivalry.ts
[S-runner]: ../../../../../.agents/skills/user-audit/scripts/run-cdp-audit.ts
