# Touch of Death: first external sessions

The [design guide](touch-of-death.md) owns the player contract. These sessions seek
blind spots and unexpected fun, not approval of a predetermined combo route.

The [October 6 audit of 25 simulated players (temporary; prune after findings are promoted)](../../../../../.local/touch-of-death/reports/player-audit-2026-10-06.tmp.md)
records native interaction evidence from the latest local rc4 candidate and
conditional first-session/day/week journeys. It identifies hypotheses and
reproducible defects for these sessions; it is not participant or retention data.

## October 7, 2026: bounded single-player test

Check the [candidate's readiness and deployment state](touch-of-death-demo.md#october-7-test-candidate)
before inviting a player. A healthy Railway endpoint does not identify the current
local candidate. This session uses a desktop browser and keyboard; physical
controller and mobile acceptance are separate.

The intended path is sound choice → optional guided first fight or Free practice
→ Play → Fight the AI → level 1, first to three → result/cause → Rematch →
Pause → Main menu. In the first 30 seconds the player should recognize the game
and sound choice; by two minutes, move, strike and guard; by five minutes, encounter
real AI combat; within fifteen minutes, finish a set and repeat or return to title.
Online play, accounts, customization, rewards, training AI and exhaustive city
exploration are outside this acceptance slice.

Tell the player only: “Try playing this. I'll mostly watch rather than explain.”
Let the game's controls and guide do their work. Rescue only when progress is
impossible, and record the rescue. Afterwards ask:

- What did you think you were supposed to do?
- What was confusing, and what felt good or bad?
- When did you feel most in control? When did it feel broken or unfair?
- What would you try next if I wasn't here?

Operator reference: WASD moves, Space jumps, J strikes, K uses the heavy attack,
L guards, Q dashes, G grabs/picks up/throws, Escape pauses/backs out. The pause
menu owns the full controls. To reset a fight, use Main menu and start again;
Practice also offers Reset fighters. Reload recovers a stopped client. For a
fresh tester, use a new private browser session; do not erase a returning
player's existing saves or account data.

Morning preflight (under ten minutes): verify the deployed artifact identity,
open a fresh session on the actual test machine, check sound and first-use screens,
move/strike/guard in Practice, complete one AI set, rematch, pause/resume, then
return to title and reload. Stop if framing fails, AI cannot rejoin combat,
controls stick, or visible stutter interferes with timing. Do not turn a failed
performance preflight into a game-feel interview.

Invite different interests: a fighting-game newcomer, an action/movement player,
an environmental sandbox player, a social/spectacle player and a competitive lab
player. These are interests, not rigid categories; ask each person what attracted
them and let their play contradict the label. Include controller and keyboard.

## One session

1. Record build identity, device/input, prior genre experience and their chosen
   interest. Start from the ordinary sound prompt. Let them choose whether to use,
   skip or replay the guide; do not explain the controls before they try.
2. Watch ten minutes without coaching. Note their first intentional action, first
   voluntary repeat, first surprise, first loss and first request for help. Record
   the actual moment or replay frame when possible; distinguish confusion from
   experimentation or deliberate disengagement.
3. Ask what they think caused one exchange and let them use the game's own retry
   or practice tools. Observe whether the next attempt changes. Do not turn it into
   a decision quiz or demand the designer's preferred answer.
4. Leave fifteen minutes open: fights, movement, tools, customization, discovery
   or practice. Record what they voluntarily return to and what they abandon.
5. Ask: “Which moment would you show someone?”, “What did you want to try but
   couldn't?”, “What surprised you?”, and “What would bring you back tomorrow?”
   Request one thing to preserve as well as one thing to change.

## Record observations separately from interpretation

Use a short row: time/frame, player intention in their words, actual input/state,
visible result, player explanation, recovery attempted, and observer hypothesis.
An incorrect explanation is a readability lead; one failed execution is not proof
of unfair tuning. A repeated voluntary action is a possible fun pocket, not yet a
retention metric. Preserve clips of delightful accidents as well as failures.

For AI encounters, export AI observations before ending the session and retain the
content identity with the player's replay. Those observations report decisions and
events; they do not prove the best strategy or why the human acted. Review reported
unfairness through legal inputs, available reaction/DI windows and physical state.

Prioritize reproducible broken interactions first, then misunderstood causes, then
opportunities players actively sought but could not pursue. Keep taste disagreements
and competing player interests visible rather than averaging them into one score.
The designer chooses direction; the evidence reveals where that direction is not
yet reaching the player.
