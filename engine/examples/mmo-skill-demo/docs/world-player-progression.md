# World Player Progression

This is the primary player-progression record for the MMO Skill Demo. It links world density, faction identity, quest proof, crafting, travel, and mastery pacing into one readable loop plan.

Related context: ./docs/world-building.md, ./docs/world-travel.md, ./docs/future-quest-ideas.md, and ./docs/world-gathering-and-crafting.md.

## Current Design Inputs

Target genre and hook: Browser-playable MMO action sandbox where faction ideology, local ecology, skills, gathering, crafting, and travel routes make progression readable.

Target audience: Mid-core players who can learn layered systems, but still need one reachable goal, clean in-play feedback, and low-friction retry.

Centered mechanic: Faction-bound world progression through skill use, local quest proof, material mastery, and route unlocks.

## 1. The Progression Matrix

| Band | Key Systems Introduced | Active Player Goal | Source of Friction / Challenge | Core Reward / Metric of Progress |
| --- | --- | --- | --- | --- |
| 10s | Movement, aiming, skill use, hit feedback, gathering taps, interaction prompts, nearby creature and landmark reads. | Make the next input obvious and satisfying: move, strike, gather, dodge, talk, or inspect. | Input certainty, focal clutter, danger cue timing, and whether the player understands what changed after an action. | Clean impact readback, item pickup, material gain, damage response, visible route or ecology clue. |
| 10m | Starter quest steps, contracts, local harvesting, basic combat pockets, vendors, stations, recipe picker, short route markers. | Complete one local errand or route task, bank a useful reward, and see the next reachable goal. | Session pacing, menu time, travel ambiguity, local threat sequencing, and readable quest handoff. | Quest step completion, faction reputation, materials, crafted item access, route confidence. |
| 10h | Faction questlines, reputation tiers, zone ecology, travel gates, rare materials, recipe families, dungeon preparation. | Choose which faction values and survival loops to strengthen, then build enough mastery to cross harder regions. | Build planning, faction tradeoffs, route costs, creature ecology pressure, material scarcity, capstone checks. | Trusted or respected faction status, durable gear paths, route unlocks, capstone quest completion, visible world change. |
| 100h | Cross-faction optimization, elite routes, dungeon mastery, rare economy loops, optional party roles, world-event and seasonal bridge hooks. | Master a build and social role while choosing how the wider faction network changes under repeated pressure. | High-skill execution, long-term economy pressure, faction consequences, endgame route risk, boredom from solved loops. | Exalted identity, optimized loadouts, hard-route clears, prestigious cosmetics or titles, social proof, lasting world consequences. |

## 2. Onboarding vs. Mastery Strategy

10s to 10m gate: First Field Proof. The player should prove basic movement, one attack or skill, one gather or inspect action, one danger read, and one reward readback before contracts, recipes, or faction planning take focus.

10m to 10h gate: Faction Trust Proof. The player should complete local intro and field work, understand one faction motive, earn a useful unlock, and read one route or crafting dependency before multi-faction tradeoffs expand.

10h to 100h gate: World Pressure Proof. The player should clear a capstone, survive a harder route or dungeon-prep loop, and choose a faction or build consequence before long-term optimization opens.

Early stages should hide or simplify detailed reputation math, multi-faction consequence trees, advanced recipes, rare material chains, premium travel optimization, dungeon role planning, and social comparison. Those systems should appear when the player has already mastered the lower loop they depend on.

## First-Hour Streamline Research Snapshot - 2026-06-06

External MMO onboarding scan points to one core rule: give new players one strong next action, keep deeper help recoverable, and let locked systems appear as tempting world objects instead of up-front menu lessons.

Market signals:

- World of Warcraft and Guild Wars 2 use directed early routes, level rewards, and helper surfaces to reduce first-session drift, but player pain appears when a streamlined starter path jumps into high-context campaign lore too quickly.
- Final Fantasy XIV separates gradual active help, role training, unlock icons, and mentor support so core play can continue while optional explanations stay available.
- The Elder Scrolls Online preserves open exploration with quest tracking, compass markers, and optional guide material; freedom works better when the player can ask for the next coherent thread.
- New World: Aeternum narrows early weapon choice through archetypes while still advertising later weapons, trade skills, factions, and solo or group routes.

Design direction: the first hour should be a field-trust arc, not a systems tour. The player should begin with movement, one reliable attack loop, one gather or inspect action, one NPC handoff, and one visible locked future payoff. Every deeper system should be discoverable through a person, object, route marker, contract, or lore clue.

| Moment | Player Sees | System Depth Shown | Held Back |
| --- | --- | --- | --- |
| First input | Movement, basic strike, interact prompt, one safe gather target. | Only action feedback and the current local goal. | Catalog breadth, faction math, recipe families, travel menus, advanced loadout choices. |
| First reward | Rowan or a local fixture names what was proved and why it matters. | One concrete unlock preview: a better tool, route pledge, movement lesson, or safe border errand. | Multi-faction consequences and rare material planning. |
| First town loop | Nearby locked objects: root gate, forge permit, dock map, wind marker, rift warning. | Each object gives one diegetic requirement and one place to start. | Full tables of every future reward. |
| First branch | A rumor, contract, or faction notice lets the player pin one curiosity. | Optional "how to unlock that" guidance tied to a visible object or NPC. | Forced tutorial modal, global checklist, endgame optimization. |
| First mastery proof | A completed local task opens one new action surface. | The new surface explains itself through the task the player just completed. | Any system whose value is still abstract. |

Current scan implication: the authored world already has enough quest gate and payoff readback. The next gain is reveal control. Broad combat, catalog, crafting, faction, and travel surfaces should still exist for experienced or debug play, but the default new-player path should expose them through discovered world evidence first.

Recommended first implementation bets:

- Add a novice reveal state that starts with one weapon identity, limited visible loadout pressure, and locked hotbar hints that name the world proof needed for each future action.
- Make the catalog default to discovered or nearby entries, with an explicit all-world view for experienced players.
- Add a reopenable field journal fed by NPC dialog, inspectable fixtures, quest payoff text, and discovered landmarks. It should answer "what is this?" and "how do I unlock that?" without interrupting play.
- Turn Oakhaven's safe ring into an aspiration loop: rootway marker, forge rumor, dock map, wind-step rumor, and Void warning all visible as world lore, not as menu tabs.
- Treat faction introductions as rumors and local chores first. The player should meet ideology through consequences: clean cuts, noisy roads, debt marks, heat permits, oath gates, or wind discipline.

Implementation pass: the client now defaults new players into a field-trust reveal. Skills and hotbar slots name the world proof behind future actions, Codex opens on nearby/discovered knowledge with an optional world view, and the Field Journal keeps rumor and proof threads reopenable without taking control away from active play.

Onboarding improvement pass: the first route now keeps advice contextual and optional, delays desert trial rumors until forge work makes them relevant, pins Captain Marrow and Ironcrag as the next bridge after Rowan's pledge, and lets experienced players open the full combat kit without waiting through the novice reveal.

## Market Research: Five Next Onboarding Bets - 2026-06-09

Research signals: Final Fantasy XIV keeps main-story and duty guidance one click from map or journal context and keeps help recoverable from the guide surface; World of Warcraft's Exile's Reach teaches class fundamentals through a bounded route and mini-dungeon; Guild Wars 2 frames new-player learning around clear direction, staged rewards, and gradual system reveal; The Elder Scrolls Online's Zone Guide turns a zone into trackable next objectives; New World: Aeternum exposes starter archetypes while promising that play style can change later.

Recommended next tasks:

| Task | Player Need | Shape for This Demo |
| --- | --- | --- |
| Return Briefing Strip | Recover after a break without rereading every panel. | On login or revive, show active main quest, nearest interact target, last completed proof, and one button to reopen the related Field Journal note. |
| Reopenable Active Help | Get help for the current confusion without a forced tutorial. | Let Field Journal entries surface from nearby locked objects, failed interactions, empty hotbar slots, and quest handoffs, then stay searchable later. |
| Novice Milestone Ladder | Learn basic MMO verbs with small rewards and no class lecture. | Add optional novice goals for move, strike, gather, inspect, bank, craft, track quest, use route marker, and survive first danger. |
| Zone Proof Guide | Know what a local area still has to teach. | Give each starter area a compact checklist of local proof, route hooks, NPCs, and visible locked payoffs, with one "track next proof" action. |
| Weapon Identity Preview | Pick a combat direction from feel and future route, not stats alone. | At First Arms and later trainers, show each weapon's play style, beginner friction, safe follow-up trainer, and promise that the choice can be changed. |

Sources: [Final Fantasy XIV HUD guide](https://na.finalfantasyxiv.com/uiguide/know/know-hud/hud-name.html), [Final Fantasy XIV Hall of the Novice](https://na.finalfantasyxiv.com/uiguide/party/party-how/party_practice.html), [World of Warcraft Exile's Reach](https://worldofwarcraft.blizzard.com/en-us/news/23380363/shadowlands-adventure-awaits-in-the-new-starting-experience), [Guild Wars 2 new player experience](https://www.guildwars2.com/en/news/a-fresh-start-the-new-player-experience-in-guild-wars-2/), [The Elder Scrolls Online Zone Guide](https://www.elderscrollsonline.com/en-us/news/post/55747), and [New World: Aeternum archetypes](https://www.newworld.com/en-us/game/about).

## Gameplay Loop Audit - 2026-06-10

The new loop audit script (`bun.cmd run audit:loops`) checks authored quest steps, recipe support, reputation rewards, material use, and lifecycle risk in one deterministic pass. It writes its detailed report to `./.local/gameplay-loop-audit.md`.

Current result: the biggest gap is no longer faction coverage. The game has eight factions, twenty-four authored quest steps, fourteen recipes, thirty-two reputation rewards, and one hundred materials. The gap is proof depth: the demo has many designed gates, but not enough deterministic evidence that each loop remains satisfying after the player returns, unlocks a recipe, crosses a route gate, or retries a capstone.

| Band | Current Risk | Evidence | Gap |
| --- | --- | --- | --- |
| 10s | Medium | Only Oakhaven has a true instant-action proof. | Other faction entries begin at 10m, so their first feel is still carried by shared combat, gathering, and prompts instead of faction-specific proof. |
| 10m | Low | Twelve authored steps, nine supported recipe outputs, and five unlock rewards. | Route recovery after quest completion is the remaining first-hour risk. |
| 10h | Medium | Eight authored steps, six route or survival steps, and several recipe or travel hooks. | Five recipe outputs are still future-facing, so some mid-loop goals are inspectable before they are truly playable. |
| 100h | High | Three authored capstone steps and three route or survival proofs. | Endgame reads as capstone intent, not repeatable mastery. It needs retry metrics, mastery deltas, and loop benches before more lore is added. |

Priority: build loop-proof benches before adding more world breadth. The next scripts should simulate first-hour return, quest handoff, recipe unlock, route gate, and capstone retry states. The next runtime pass should convert at least two future recipe outputs into supported rewards before adding more materials.

## Zero-Risk 10s/10m Pass - 2026-06-10

Strict "zero risk" means deterministic model proof only: every covered first-10-second and first-10-minute row rounds to 0% quit risk, raw risk stays at or below 0.004, and no blocker flag appears. It is not a claim that real players cannot churn.

The early route now follows one-action discipline. Spawn, first movement, first gather, First Cut, Second Cut, Wolf Culling, Final Cut, and route registration each expose one primary action, one fallback action, immediate proof or reward readback, and a recovery line that rebuilds the route after a break.

First Arms remains optional. It can reward weapon sampling and a starter purse, but it does not replace the normal First Cut route unless the player chooses to focus it; the fallback remains cutting Ash trees.

Verification commands:

- `bun.cmd run audit:early-zero`
- `bun.cmd run simulate:onboarding -- --strict-zero`
- `bun.cmd run audit:loops`

## Additional Onboarding Research Passes - 2026-06-06

Pass 1: context-aware help should answer the player's current confusion, not a generic FAQ. Modern MMO onboarding is moving toward help that uses where the player is, what they recently did, and what they are trying to understand. For this demo, that means the Field Journal should eventually answer "what is this?" and "what do I do next?" from current route, quest, nearby NPC, and locked slot context.

Pass 2: directed paths work best when they preserve agency. Strong examples provide one suggested route, milestone rewards, and activity recommendations while still letting experienced or curious players ignore the path. For this demo, nearby Codex, hotbar unlock hints, and route rumors should be default guidance, while the full world view and veteran bypass remain opt-in.

Pass 3: gradual help must be recoverable. Temporary tutorial prompts are weak if the player cannot reopen them after a break or after returning from a different game. For this demo, critical learning should stay in persistent surfaces: objective readback, hotbar hints, Field Journal entries, Codex rumors, map markers, and NPC flavor.

Simulation direction: onboarding should be tested against player knowledge states, not just level. A beginner who reads in-game notes, an advanced player who already knows where to go, and an ignorant player with low patience need different risk checks. The current priority is to reduce quit risk for the ignorant state without boring advanced players or forcing curiosity into a lecture.

## Rewarded Opt-In Tutorial - 10 Passes - 2026-06-06

Verdict: do it, but frame it as a paid proving contract, not a mandatory tutorial. The default world path should still work without it. The tutorial path should feel like a local guild is buying evidence of competence, loaning gear for field tests, and paying the player enough starter resources to pursue the weapon or trade route they liked.

| Pass | Decision | WHY |
| --- | --- | --- |
| 1. Entry | Offer the contract through Rowan, the Field Journal, and a visible practice-yard board after login. | The player can start normal play immediately, but a confused or reward-driven player sees a clear paid path. |
| 2. Starting State | Start weaponless only inside the contract instance; outside it, keep the normal starter weapon or safe fallback. | Weaponless play makes choice feel earned, but should not punish players who skip the tutorial. |
| 3. Weapon Sampler | Loan several weapons in short combat pockets: mace, bow, staff, wand, twin blades, and blade. | The player learns feel through action instead of reading a class menu. |
| 4. Ability Sampler | Each weapon shows one simple baseline and one future-looking locked slot. | The player sees "that looks cool" plus one readable "how do I unlock that" without seeing every build tree. |
| 5. Demo Combat | Use low-risk enemies with clear roles: slow target, ranged nuisance, shielded target, pack pressure, and status dummy. | The player learns target priority, spacing, and status meaning before real field pressure. |
| 6. Reward Choice | Let the player keep one reward weapon, then give enough gold/materials to start another weapon path soon. | Choice matters immediately, but the player is not trapped by a first-pick mistake. |
| 7. Local Journey | The chosen weapon pins a nearby follow-up trainer or faction contact. | The reward becomes a route, not just an inventory item. |
| 8. Follow-Up Lessons | Unlock optional paid lessons for statuses, buffs, gathering, crafting, city identity, and travel. | Deeper systems become self-selected contracts with strong rewards, not front-loaded explanations. |
| 9. Reward Economy | Pay with starter acceleration: common materials, tool vouchers, gold, route tickets, consumables, and faction intro tokens. | High rewards should remove early friction without handing out rare/endgame identity. |
| 10. Recovery | Every completed lesson writes a Field Journal note with the next local step and one future payoff. | Players returning later can recover what they learned and why it matters. |

First contract shape:

| Beat | Player Action | Reward | Follow-Up Path |
| --- | --- | --- | --- |
| Empty Hands | Inspect the practice rack and accept loaner gear. | Small gold stipend and visible weapon choices. | Normal world path remains available. |
| Sparring Ring | Try three to six weapon loadouts against safe enemies. | Combat consumables and a chosen weapon voucher. | Chosen weapon pins one local trainer. |
| Status Table | See bleed, poison, slow, stun, shield, burn, and cleanse in controlled fights. | Status-resist consumables and one recipe hint. | Opens optional status contract. |
| Work Yard | Gather one wood, one ore, one herb, and one salvage object. | Common material bundle and tool voucher. | Opens gathering survey routes. |
| Craft Order | Turn materials into a starter item or weapon support piece. | Crafting discount token and bonus inputs. | Opens local station route. |
| City Ledger | Visit Oakhaven, Ironcrag, Port Marrow, Bazaar, Aetheria, High-Reach, Outcasts, and Sanctum as brief lore cards or travel previews. | Route ticket bundle and faction intro notes. | Opens city intro contracts gradually. |

Simulation result: the rewarded proving contract model currently scores 4% average quit risk, compared with 7% for current field reveal, 27% for wide-open baseline, and 34% for forced systems tour. The gain comes from opt-in reward pull, weapon novelty, and follow-up lessons; it depends on keeping the contract optional.

## 3. Red Flags & Frustrations

10-second fun-killers:

- The player presses a button and cannot tell whether it worked.
- Critical danger is only readable from tiny text or color.
- Effects hide movement, hit timing, or interact prompts.

10-minute fun-killers:

- Menu or travel management takes more time than active play.
- The next goal disappears after a quest step completes.
- Local rewards are only bigger numbers with no new route, recipe, or world read.

10-hour fun-killers:

- Faction systems unlock before the player understands faction values.
- Crafting asks for rare inputs before the player knows where they come from.
- Capstones test grind volume instead of route, build, or ecology mastery.

100-hour fun-killers:

- Endgame is only repeated chores with no new mastery question.
- Social or meta pressure becomes mandatory before solo identity is stable.
- Optimization erases faction meaning because every path converges on the same answer.

## 4. Interactive Refinement Prompts

- Which 10-minute session should be the default satisfying loop when a player has only one short play window?
- What single mastery proof should unlock the first real cross-faction tradeoff without overwhelming the player?
- What should a 100-hour player still be practicing: execution, route planning, economy mastery, faction politics, or social role leadership?

## Living World Rule

Every progression change needs a clear WHY. Strong changes explain what belongs in the local place, why that pressure exists now, what the player can read on screen, what gameplay goal it supports, and which future quest or mastery throughline it can bridge.

Example: a sparse forest edge near predator signs can gain a watering hole because prey movement naturally attracts hunters, wolves, gatherers, and patrol quests. The point is not to fill space; the point is to make ecology, danger, and route choice readable.

## Current Maintenance Loop

Use progression scans to find the weakest lifecycle link, then make one bounded pass. Prefer one loop band plus one faction, route, zone, questline, or mechanic at a time.

When a change creates quest potential, update ./docs/future-quest-ideas.md. When a change alters physical world meaning, update ./docs/world-building.md. When a change alters travel routes, gates, costs, or movement unlocks, update ./docs/world-travel.md.

## Five-Pass Progression Loop - 2026-06-05

This loop focused on the current scan gaps: dense early-world reads, dense High-Reach/Bazaar edge reads, and sparse Void distance. Each pass adds a visible reason for the next progression beat instead of only adding more objects.

| Pass | Loop Band | Change | WHY |
| --- | --- | --- | --- |
| Rootway Forager Hut | 10m | Adds a forager hut, forage pocket, and wolf warning farther east of the Overgrown Thicket. | Dense starter reads need to spread outward so the player can follow a short forest errand from safety into border risk. |
| Glider Aery Edge | 10h | Adds a far aery edge, thermal proof crystal, and quiet landing grove beyond the current High-Reach cliff step. | Wind mastery needs an in-world practice line before glider travel feels earned. |
| Rot-Safe Shelter Rib | 10h | Adds a shelter rib and recall lamp in the near far-Void route. | The first long Void stretch should teach that distance is survivable only through marked recovery pockets. |
| Route-Pull Gravity Cairn | 100h | Adds a gravity cairn and relay scar deeper into the Void route. | Mid-route mastery should test reading pull, drift, and portal scars instead of repeating the same warning sign. |
| Bloom Spread Warning | 100h | Adds a warning sign and unstable sample near the third crossing pocket. | The far route should show cause and effect: the Void is not just present, it is spreading and can be studied or exploited. |

## Five-Pass Gate Readback Loop - 2026-06-06

This loop turns existing quest and route dressing into player-facing gate and payoff readback. Daily faction work can now show what mastery is being tested and what world access or understanding the proof earns.

| Pass | Loop Band | Change | WHY |
| --- | --- | --- | --- |
| Mill Channel Trust | 10m | Adds a visible gate and payoff to the Oakhaven mill field step. | Clean gathering and spider control should prove the player can protect a short local route before rootway errands expand. |
| Prism Seam Proof | 10h | Adds a gate and payoff to the Ironcrag fissure step. | Deep Fissure should test stress reading and prism ecology before deeper drilling feels like more than an ore quota. |
| Vault Echo Appraisal | 10m | Adds a gate and payoff to the Bazaar vault field step. | Market trust should come from preserving value under pressure, not just clearing enemies from a ruin. |
| Amalgam Route Proof | 100h | Adds a gate and payoff to the Void capstone step. | Far Void travel should become shelter, pull, and rot-study mastery instead of repeated survival chores. |
| Thermal Line Discipline | 10h | Adds a gate and payoff to the High-Reach thermal step. | Glider aery travel should feel earned by reading eagle motion and collecting feathers without panic or nest raiding. |

## Seven-Pass Gate Readback Loop - 2026-06-06

This loop extends gate readback across earlier first-field proof, stronger faction field work, and long-term capstone identity. The goal is not to add more tasks; it is to explain why existing tasks prove readiness.

| Pass | Loop Band | Change | WHY |
| --- | --- | --- | --- |
| Soft Root First Proof | 10s | Adds gate and payoff to Oakhaven's first gathering step. | The first readable reward should teach neutral impact before contracts, recipes, or faction math appear. |
| Thicket Route Steward | 10h | Adds gate and payoff to Oakhaven's thicket capstone. | Forest capstone work should test route stewardship and diplomacy, not just predator removal. |
| Slag Cleaner Discipline | 10m | Adds gate and payoff to Ironcrag's forge field step. | Smelter access should come from managing useful hazard ecology before becoming a crafting unlock. |
| Written Light Handling | 10m | Adds gate and payoff to Aetheria's archive intro. | Law trust should begin as clear handling discipline before holy combat drills widen the system. |
| Reef Ledger Trust | 10m | Adds gate and payoff to Port Marrow's tide route step. | Private dock access should feel earned through route knowledge and oath-kept salvage work. |
| Bargain Weight Cost | 10h | Adds gate and payoff to Obsidian Sanctum's bargain step. | Void portal access should read as a known life-force cost before premium movement expands. |
| Goliath Wake Control | 100h | Adds gate and payoff to Ashwood Glade's treant capstone. | Outcast mastery should become controlled primal force rather than larger damage numbers. |

## Six-Pass Gate Readback Loop - 2026-06-06

This loop fills more intro-to-capstone meaning without changing objective count. It targets faction proofs that could otherwise read like ordinary chores: work quotas, oath debt, Void exposure, radiant counters, market value, and mirror discipline.

| Pass | Loop Band | Change | WHY |
| --- | --- | --- | --- |
| Quota Ledger Rhythm | 10m | Adds gate and payoff to Ironcrag's first work-order step. | Guild trust should begin as labor rhythm and logistics proof before harder forge output appears. |
| Shadow Purge Preparation | 10h | Adds gate and payoff to Aetheria's Void-border capstone. | Radiant resistance should read as anti-Void preparation earned through border proof. |
| Oath And Bill Accountability | 10m | Adds gate and payoff to Port Marrow's opening debt step. | Free Cove trust should start from personal accountability before route services expand. |
| Void Discount Stabilizer | 10h | Adds gate and payoff to the Bazaar's Rift price capstone. | Bazaar mastery should show money, stamps, and contracts resisting Void distortion. |
| First Decay Exposure | 10m | Adds gate and payoff to Obsidian Sanctum's first exposure step. | Void progression should start as controlled sampling before dangerous bargains appear. |
| Mirror Step Transfer | 100h | Adds gate and payoff to High-Reach's dungeon capstone. | High-Reach mastery should become portable self-control under reflected dungeon pressure. |

## Six-Pass Full Coverage Loop - 2026-06-06

This loop completes authored gate readback coverage for every faction quest step. The remaining passes focus on ordinary-looking steps that needed clearer mastery meaning: combat drill, deep-current route proof, first market debt, hunting boundaries, pack law, and first breath discipline.

| Pass | Loop Band | Change | WHY |
| --- | --- | --- | --- |
| Courtyard Drill Formation | 10m | Adds gate and payoff to Aetheria's field drill. | Holy combat should test disciplined movement before broader radiant powers unlock. |
| Black Current Responsibility | 10h | Adds gate and payoff to Port Marrow's deep route capstone. | Free Cove mastery should turn freedom into owned route responsibility, not lawless travel. |
| Open Ledger Contract | 10m | Adds gate and payoff to the Bazaar's opening debt step. | Market progression should begin with readable contract discipline before rare relic trades expand. |
| Blood Boundary Territory | 10m | Adds gate and payoff to Ashwood Glade's first boundary read. | Outcast trust should start from territory literacy before pack pressure rises. |
| Pack Law Route Control | 10h | Adds gate and payoff to Ashwood Glade's field step. | Pack law should turn pain, scent, and scars into route control rather than raw aggression. |
| First Breath Preparation | 10m | Adds gate and payoff to High-Reach's opening discipline step. | Wind movement should begin with calm preparation before speed and verticality become rewards. |
