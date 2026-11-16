# Touch of Death: post-repair quality scan

Date: 2026-10-24. Audit only; no gameplay changes or publication.

**The previous interaction repairs held. The remaining gap is a coherent, satisfying loop: rewards still interrupt the player's chosen intent, the first identity payoff is mostly textual, and social and mastery progress remain weaker than the surrounding promises.** The game does not yet demonstrate the requested 90/100 quality bar. This is a qualitative expectation, not a Steam rating or an invented art score.

This scan replays the [previous ten personas](touch-of-death-user-audit-20261023.md#ten-personas-and-four-horizons), then adds four fresh-seed discovery probes. They are simulated users, not recruited people. The 15-minute horizon uses short observed journeys; 1-, 24- and 100-hour conclusions are explicitly projections. The [previous repair ledger](touch-of-death-user-audit-20261023.md#repair-pass) remains the history of implemented fixes.

## Evidence and limits

- A fresh export/package reproduced the repaired runtime and content exactly: runtime SHA-256 `c02be7e4114e176e9d710c5f65af75539dec85562801eb9d9c1a8a7e80df9eba`, content `combat-v39:f8442de34012bed7286b361931156c673feec2b4cf1f723cefaeec79bc80d9f6`. [Comparison](../.local/user-audit-20261024/build-comparison.json), [package receipt](../.local/user-audit-20261024/package-build.json).
- [Ten unchanged persona seeds](../.local/user-audit-20261024/mission.json), FGC familiarity 3–10/10: **76 native flow captures, zero recorded action failures and zero uncaught page exceptions**. [Regression receipt](../.local/user-audit-20261024/regression-summary.json). Execution success does not certify satisfaction or complete each persona's long-term mission.
- Four fresh manifests were saved before discovery: `tod-20261024-reward-return` (FGC 4 lens: tired, touch-preferring, context-sensitive), `tod-20261024-visual` (FGC 5: distracted, dislikes forced guidance), `tod-20261024-mastery` (FGC 7: short screen, literal instructions, wants a next step), and `tod-20261024-friends` (FGC 8: returning coach, short session, shared-device clarity). Computer/AI familiarity was sampled separately; no physical tremor, old-device performance or assistive-technology use was simulated.
- Fresh reward browsing completed 11 flows, reduced-motion/layout completed nine, and the corrected timing-cued mastery journey completed nine. All three final runs had zero action failures and zero uncaught page exceptions. The first three probe attempts raced startup controls; those runner failures remain. A blind-tapping mastery attempt cleared once, then failed to clear again. Following the displayed timing cue produced five native parries and persisted all five after reload; the blind-input failure does not establish a broken control or failed persistence.
- Native two-context invitations, training entry, coaching controls and account reward copy were captured. Both deeper input continuations stalled and were stopped with owned-process cleanup. Background-rendering flags did not resolve the second continuation. No uncaught page errors or host errors were reported. **Sustained multiplayer responsiveness, eligible-time accrual, payout and leaving with progress are not cleared by this scan.** The cause of the input-delivery stall remains unresolved; a same-machine browser fixture is not evidence of WAN or separate-machine behavior. [First run](../.local/user-audit-20261024/discovery/friends/results.json), [retry](../.local/user-audit-20261024/discovery/friends-replay/results.json), [stop reason](../.local/user-audit-20261024/discovery/friends-replay/scan-stop.json).
- Most captures use real 1366×768 windows; the mastery probe used 1024×600. The 390×844 captures explicitly emulate a main-frame viewport, not a physical phone. No horizontal document overflow was recorded in those completed probes. Actual Windows inspection found no visible windows for the owned host and friend browsers; those browser owners were absent after cleanup. The persona runner does not retain the same per-run process inventory.
- The collaborative preview successfully loaded the game. Repeatable isolated journeys used the skill's owned Chrome runner. Static captures and native state checks do not establish animation finish, sound mix, physical-controller access, blind cue comprehension, color-vision accessibility, ordinary frame pacing or actual retention. The prior focused tests were not represented as newly rerun tests for this read-only scan.

Raw evidence owner: this scan, under `.local/user-audit-20261024/`. Prune after findings are superseded and required evidence is promoted. The frozen brief and approved [art direction](touch-of-death-art-constitution.md) were preserved; there is still no whole-slice human quality acceptance.

## Ranked friction

### S01 · P2 · Friend rewards promise the wrong route to the first unlock

**Observed:** inside shared training, account Rewards says the first set milestone pays for the first style and “Finish a set to earn coins. Wins earn a little more.” The same screen's detailed rules correctly describe private sets/shared training as time-based, capped rewards. [Native account view](../.local/user-audit-20261024/discovery/friends-replay/05a-friend-reward-promise.png).

**Cause:** [goal copy](../../../../../apps/engine-editor/src/scene3d/rewards/goal.ts) is generic, while the [panel](../../../../../apps/engine-editor/src/scene3d/rewards/panel.ts) distinguishes account/device without making its leading goal and fallback status specific to the current activity. The [host reward rules](../host/progression/README.md) award ordinary set coins/milestones through eligible modes; private sets and shared training use bounded social progress.

**Impact hypothesis:** Hugo's friend group follows the prominent promise, then sees a different earning rule. The detail paragraph does not repair that first impression. This can cause first-session trust loss or migration away from friend play.

**Repair:** lead with this session's actual next payout, saved amount and chosen cosmetic. Label Quick Play/winner-stays milestones as an alternative route. Preserve the selected bounded social economy.

### S02 · P2 · Rewards abandons the player's selected context

**Observed:** the fresh reward probe selected Mastery, closed Rewards, then reopened it with 100 coins. It reopened **Collection**, emphasizing the random box. Previewing a pinned goal and pressing Escape returned to the main menu, requiring another Rewards entry. [Selected Mastery](../.local/user-audit-20261024/discovery/rewards-replay/09-select-technique-journal.png), [reentry](../.local/user-audit-20261024/discovery/rewards-replay/10-reward-reentry-after-choosing-mastery.png), [preview return](../.local/user-audit-20261024/discovery/rewards-replay/05-escape-from-reward-preview.png).

**Cause:** the [launcher](../../../../../apps/engine-editor/src/scene3d/rewards/panel.ts) selects Collection whenever balance is at least 100; preview closes Rewards without a return destination. The goal persists, but navigation intent does not.

**Impact hypothesis:** unnecessary navigation compounds for returning users, particularly short-session players. It also steers a chosen-style or practice goal back toward a random purchase.

**Repair:** retain the selected category, scroll and focus; return from preview to the originating reward/goal. Use contextual entry only for an explicit result action or newly earned claim, not solely the coin balance.

### S03 · P2 · The first identity reward is still mostly administration

Three directly observed parts of the same loop weaken the payoff:

- The fresh screen advertises a first individual style for 100 coins, but its default selector is **Yard shift**, a coordinated look. Following the default pins a 200-coin next piece / 800-coin complete look. This is not an incorrect charge; the default fails to deliver the prominently advertised path. [Default choice](../.local/user-audit-20261024/discovery/rewards-replay/03-default-goal-chosen-from-first-style-offer.png).
- Ben's earned Reinforced jacket reveal shows its name, rarity and Equip/View buttons without showing the garment on the fighter. The same screen repeats the owned jacket under “Your next signature,” with another preview/equip path. [Reveal](../.local/user-audit-20261024/N02/run/12-first-unlock-reveal.png). The [spotlight](../../../../../apps/engine-editor/src/scene3d/rewards/spotlight.ts) can display a color swatch; a garment requires leaving for its visual payoff.
- The larger wardrobe model is an improvement, but its horizontal category rail and text-led look list still make finding expression/pose options a browsing task. [Wardrobe](../.local/user-audit-20261024/N03/run/05-locked-outfit-preview.png). The new image does not establish completed garment, face, hand or material quality.

**Impact hypothesis:** the player receives currency and ownership but may not feel “my fighter changed.” The first 15 minutes lose a strong identity moment; repeated rewards become less desirable by the first hour.

**Repair:** start with a small visible set of eligible 100-coin choices, show the selected item on the fighter at unlock/equip, and collapse the completed target into its receipt. Offer a clear optional next goal. Group wardrobe categories by body, clothing and expression rather than extending a flat rail. Preserve free identity choices and owned-item checks.

### S04 · P2 · Completed examples retain instructions for an unfinished action

**Observed:** Grace's successful combo example simultaneously displays **“Example complete”** and **“Follow-up opens in 2 frames,”** beneath “Stay with the airborne opponent.” The example really succeeded and gave no player credit. The contradiction is in the presentation of its ending. [Native frame](../.local/user-audit-20261024/N07/run/05-combo-example-outcome.png).

**Cause:** [the tutorial adapter](../../../../../apps/engine-editor/src/scene3d/tutorial/coach.ts) continues passing live sampled timing while marking the demonstration finished. Player completion and demonstration completion are intentionally separate; the ending needs its own display state.

**Impact hypothesis:** Diego/Grace must decide which instruction is current instead of understanding why the combo worked. That is avoidable uncertainty at the lesson's payoff.

**Repair:** end with a brief causal sequence—launch, chase, follow-up—and emphasize Try it yourself. Hide future-action timing once playback finishes; keep frame details available on request.

### S05 · P2 · Narrow live coaching still covers the fighters' lower bodies

**Observed:** at 390×844, the live parry coach occupies the lower fight area and overlaps the fighters' legs/feet. The succeeding parry still has a recognizable radial cue and “Opening denied”; reduced motion does not remove its semantic success signal. [Live lesson](../.local/user-audit-20261024/discovery/visual-replay/06-narrow-live-lesson-and-fighter-framing.png), [reduced-motion consequence](../.local/user-audit-20261024/discovery/visual-replay/07-narrow-reduced-motion-parry.png).

**Cause:** the bottom coaching composition and gameplay camera fit do not fully reserve space for each other. The page has no horizontal overflow, but that does not prove unobstructed combat. See [coach layout](../../../../../apps/engine-editor/src/scene3d/tutorial/coach.ts).

**Impact hypothesis:** recovery/contact near the floor is harder to inspect. This is a narrow-layout finding, not evidence that the desktop composition is unusable.

**Repair:** reserve the coach's occupied rectangle in fight framing or use a smaller action strip during the live attempt. Restore explanation afterward. Validate parry, tech and DI with feet/contact surfaces visible; do not solve this by adding brighter particles.

### S06 · P2 · Social progress still penalizes explanation and interruption

The paused meter is now present and truthful. The [host implementation](../host/progression/social-room.ts) still requires recent varied inputs from both players, stores partial elapsed time in the live room and deletes it on disposal. Native coaching views show the pause explanation; partial loss here is **source-confirmed, not newly measured across a completed native leave/rejoin**. A shared teaching objective, saved session recap and post-cap rivalry/learning recognition were not added by the previous repair.

**Impact hypothesis:** a coach can do something valuable while the reward meter stops; a short-session pair can lose useful partial time. The visible meter improves transparency but does not change that incentive. Temporary interruptions can become permanent drop-off if returning feels like starting over.

**Repair:** save bounded partial progress with clear ownership, recognize host-verifiable training goals, and end with a shared recap: technique learned, best exchange, saved progress and an optional rematch/share action. Keep invitations optional and cosmetic rewards noncompetitive.

### S07 · P2 horizon risk · Recognition grows more slowly than the player's ambition

**Observed:** five real timed parries produced five saved clears and a five-clear milestone, surviving reload. [Journal receipt](../.local/user-audit-20261024/discovery/mastery-cued/09-five-clears-after-reload.png). This proves the new recognition loop works. The [journal](../../../../../apps/engine-editor/src/scene3d/rewards/mastery.ts) counts repetitions of five lessons and recognizes five/twenty clears; it does not yet measure varied-opponent success, consistency, solved situations or transfer into matches. Do not infer a control defect from the failed blind-tapping run.

**Source projection:** the catalog remains 66 earnable items, including 44 color variants. Under the explicit five-minute-set / immediate-milestone / 100-coin-box assumptions, enough coins for all items arrive after 88–139 sets, **7.3–11.6 hours**. This is affordability, not observed collection completion or retention. A 50% win-rate model reaches affordability at 8.3 hours. Daily and lesson rewards are excluded. [Recomputed model](../.local/user-audit-20261024/economy.json).

**Impact hypothesis:** at 24 or 100 cumulative hours, coins and the same drill counters cannot alone sustain the promised sense of discovery. Balance, meaningful opponents, variety and friendship must carry the game; this scan does not establish those qualities.

**Repair:** progress from a learned action to varied execution, match application, a solved replay situation and a recognizable personal achievement. Add visible cosmetic construction and expression over time rather than more palette filler or slower acquisition. Pair personal progress with shared rivalries and teaching records.

## Ten personas across the four horizons

The first column below gives observed anchors; later columns are drop-off hypotheses. Persona seeds remain `tod-20261023-N01` through `N10`, with their original modifiers intact.

| Persona / FGC | First 15 minutes: observed anchor | 1 hour: likely friction | 24 hours played | 100 hours played |
| --- | --- | --- | --- | --- |
| Aria · 3 | Real movement/hit credit and compact next instruction work. First hit saved +25. | Needs earned spectacle and transfer into a fight; fast acknowledgements are easy to miss. | Return depends on recognizable improvement and identity. | Friends, expression and fresh challenges must replace onboarding novelty. |
| Ben · 4 | Loss → readable claim → chosen jacket → equip → exchange retry completed. | Text-led reveal and repeated owned goal weaken the payoff. | Repeated losses need evidence of better decisions. | Fair opponents and meaningful rivalries matter more than accumulated coins. |
| Cora · 4 | Goal, price and locked preview persist; wardrobe is larger. | Default look differs from advertised first-style path; previews lose menu context. | Color-heavy catalog loses novelty or runs out. | Needs distinctive craft and expression, not only another counter. |
| Diego · 5 | Parry result has a distinct cue and consequence label. | Completed examples can still issue future-action prompts. | Must recognize defenses outside isolated demonstrations. | Busy effects, cosmetics and weapons need independent comprehension evidence. |
| Emi · 6 | Motion preference survives reload and is inside Game settings. | Comfort is improved; rendered motion/audio finish remains unaccepted. | Persistent preferences remove a return-session defect. | Sustained frame pacing, camera behavior and sound remain essential quality gates. |
| Felix · 6 | Actual practice remains active while searching. | Discovery is quicker; public queue population/latency were not assessed. | Interrupted sessions need preserved progress and predictable return. | Match quality, fast rematches and reliable online play determine retention. |
| Grace · 7 | Example succeeds, restores the attempt and gives no false credit. | Journal works; demonstration ending and category reset interrupt learning. | Needs varied challenges and evidence of match transfer. | Five/twenty repetitions are insufficient as the whole mastery arc. |
| Hugo · 8 | Invite and shared-training entry work; paused-progress status is visible. | Prominent set-reward copy conflicts with the chosen social mode. | Teaching pauses and room-local partial progress discourage short visits. | Shared stories, rivalry records and meaningful coaching recognition remain missing incentives. |
| Iris · 9 | Empty replay entry reaches expert Theater without needing a file. | Watching is easier; finding, trying and sharing one meaningful moment still needs a cohesive route. | Saved situations/replays need a reason to revisit with a friend. | Creator/community depth and replay learning must continue beyond collection completion. |
| Jun · 10 | Remapping, modal Escape and practice instrumentation work. | Reliable controls help; detailed presentation and advanced replay work still need refinement. | Balance, counterplay and strong opponents remain unassessed. | Competitive depth and sustained multiplayer cannot be inferred from the clean menu replay. |

## What to fix next

1. Make rewards activity-aware, preserve navigation context and show the first earned identity change directly: S01–S03.
2. Give examples a coherent ending and keep live combat clear around coaching: S04–S05.
3. Preserve bounded friend progress and recognize learning/shared sessions: S06. Investigate the repeated two-client input stall before claiming multiplayer acceptance; compare independent machines and retain raw timing/error evidence.
4. Build and validate a richer mastery/identity arc with returning humans: S07. Avoid treating a bigger coin balance or more repetitions as proof of delight.

The prior claim contrast, first chosen purchase, motion persistence, modal dismissal, queue warmup and replay-empty-state repairs remain useful. They should be preserved. This scan found no new confirmed P0 defect, but it is not a clean release verdict: seven meaningful friction clusters and the multiplayer verification blocker remain.
