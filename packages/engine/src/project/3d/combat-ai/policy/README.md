# Weighted tactical decisions

`candidates.ts` scores ordinary attacks, short safe whiffs, grabs, approach, sprint, dash, flank, jump, spacing and stamina recovery from committed observations. Startup, recovery, range, projected reach, weapon length, stamina, target motion, visible punish time and bounded match evidence contribute numeric features. Personality weights shape those scores; they never grant an action permission. Held items exclude unarmed grabs, and emitted attacks still resolve through ordinary weapon synthesis.

`selection.ts` converts scores into probabilities with temperature `.45 + (9 - level) * .25`. Lower settings sample more suboptimal choices from the same legal pool instead of following a periodic heavy-attack script. The random stream, chosen intent and deadline are saved and validated. Movement holds for 12 decision ticks, attacks for six; invalid choices, changed attack serials and a visibly much better opportunity interrupt this cadence. Incoming defense, actual hitstun and confirmed combo timing remain separate safety/commitment gates.

Dash-role rankings enter a weighted draw with observed move outcomes and the same difficulty temperature. Jump requests still pass through the failed-jump observation policy. Safe whiffs account for the retreating attack's travel and the opponent's immediate punish envelope; a long held weapon can remove that option.

`tuning.ts` records conservative reviewed score priors and the local ingestion report that motivated them. These are not estimated win rates or automatic training. Current-match observations continue to change move preferences independently. Waiting contributes positive approach pressure, while post-knockout stillness remains outside this neutral policy.

`policy.test.ts` verifies probability normalization and difficulty distributions, trait effects, real punish-window changes, safe-whiff weapon counterplay, learned move odds, stable intent, malformed-save rejection and exact replay. Parent AI tests exercise actual physics, shared legality gates, backpedaling pursuit and Theater rounds.

`trained.ts` validates portable version-one learned score offsets: up to 64 candidate
IDs, bounded to [-2, 2], with a host-owned policy ID. `createGameplay3D` accepts
`combatAiPolicies: [playerPolicy, opponentPolicy]`; omitted seats use the current
adaptive policy without host offsets. Policies adjust freshly generated neutral and dash candidate scores once,
after legality filtering. Defense and confirmed combo gates remain authoritative.
The artifact survives rounds, matches, saves and rollback, while observed match
personality feedback resets normally; contextual evidence retains the same opponent.
Legacy saves without an artifact use the current default without host offsets.
`trained.test.ts` proves action changes, baseline equivalence, validation, per-seat
injection and replay into a differently configured controller.

For isolated scenario experiments, `createGameplay3D` accepts optional
`combatAiDecisionOverride(seat, frame, candidates)`. After ordinary legality and
scoring, the callback may return an ID from the detached, frozen legal candidate
view. An unavailable ID throws; undefined follows the unchanged ordinary draw.
A forced choice records one-hot decision probabilities and consumes no selector
random number. Safety, animation and confirmed-combo branches still run before
the candidate selector; this hook cannot force a choice when no selector runs.
The callback belongs to the host and is absent from checkpoints. It must be
deterministic from its supplied seat/frame/candidate inputs for reproducible
restore experiments. `override.test.ts` covers legal gating, immutability,
one-hot traces, unchanged defaults and actual gameplay seat propagation.
Hosts can read `gameplay.combatState()` for the small committed fighter snapshot
while locating a decision frame, avoiding a complete scene/save clone per tick.

After restoring an older match, hosts can call
`gameplay.queueCombatAiPolicies({ policies: [playerPolicy, opponentPolicy] })`.
The queued artifacts are validated and checkpointed; rounds keep the restored
policy, and the next fresh match consumes the queue. An explicitly undefined
seat queues no host offsets. Current-match replay stays exact.

Adaptive mode keeps the dash mapping `3 - rank * .45`; the 5–105
numbers in `dash-attacks.ts` only sort a separate dash pool. They never enter
the ordinary softmax. Host offsets are added exactly once after availability
filters. Contextual adjustments follow those offsets and are bounded to
[-1.5, 1.5]. Adaptive mode replaces the original unconditional move-outcome
modifier with the contextual estimate, avoiding duplicate reward from both
models; explicit baseline mode keeps the original formula.

Adaptive punish value requires a predicted contact strictly before recovery
ends, including delivery delay. Visible invulnerability lasting through contact
excludes the move. A lethal recovery punish receives a separate priority only
when the target cannot guard, has no escape charges and has no cancel before
contact; host offsets and personality cannot assign a nonpriority choice a
positive probability in that pool. This is a forecast against continuing visible
motion, not knowledge of future inputs. Confirmed combo and defense gates still
run before neutral scoring.

The charge restriction follows the actual combat core: an explicit armored
escape command can interrupt recovery even without hitstun. The action-state
regression checks both available and exhausted charges; ordinary cancel metadata
alone cannot prove that the target is committed.

Movement reuse is restricted to ordinary movement/recovery at distance >=3.5,
for at most six decision ticks. Its bounded signature includes movement,
resource thresholds, defensive state, weapon identity, grounded state and enemy
phase. Safety, hitstun, charge, cancel, landing, navigation and projectile checks
run each tick before reuse. Changed discrete events or relevant quantized state
invalidate the plan. Full scoring remains immediate at close distance.

## Personality exploration

Adaptive candidates retain neutral tactical values, then add a separate centered
style score in [-1.4, 1.4]. Base preferences equal to one contribute zero style;
0.3 and 1.7 span the extremes. The original personality multipliers remain in
explicit baseline mode. This changes action preferences without changing the
difficulty temperature or admitting illegal commands.

Quick moves respond to `fast`; damage and commitment respond to `reckless` and
`defensive`. `eager` favors closing, `positioning` favors flanking, `jumping`
favors legal jumps and air attacks, and its derived `grounded` weight favors
ground attacks. `dogfighter` favors fighting nearby, `whiffPunisher` favors
visible recovery opportunities, `bait` favors safe probes and spacing, and
`grappler` favors available grabs. `items` favors attacks with a held weapon;
the controller admits safe pickup opportunities with probabilities 2%, 50% and
98% at item preferences 0.3, 1 and 1.7. Existing interaction safety and legality
gates still decide whether pickup is available. Trait contributions share the same bound,
so adding several preferences cannot multiply the allowed style magnitude.

`style.test.ts` holds observed state and every other weight fixed, then changes
one preference from 0.3 to 1.7. These examples use the full authored legal attack
and movement pool for level 9 stationary grounded fighters, unarmed commands
including directional and Drive attacks, no enabled grab adapter, other weights
equal to one, and no contextual or host offsets:

| State and changed preference | Probability at 0.3 | Probability at 1.7 |
| --- | --- | --- |
| Distance 1.6, stamina 100/100; `fast`: jab | 4.54% | 27.89% |
| Same state; `fast`: heavy | 23.97% | 1.89% |
| Distance 1.6, stamina 12/100; `defensive`: retreat | 6.41% | 99.42% |
| Same tired state; `defensive`: jab | 93.34% | 0.55% |
| Distance 4, stamina 12/100; `defensive`: recover | 33.20% | 99.93% |

The quick/heavy relative odds change about 78-fold. Other attacks and movement
consume the remaining mass. Changing a preference leaves available IDs unchanged;
unaffordable moves remain excluded. Tests cover all eleven authored preferences,
including contexts with grabs enabled and held items. Every preference leaves
guaranteed lethal-punish priority intact, with zero probability for nonpriority
choices. These examples establish causal style differences, not match strength
against every opponent.

Personality scores remain stable as contextual outcome evidence contributes its
bounded score. Confidence no longer weakens negative style preferences: a poor
outcome must not make an action more attractive by removing its personality
penalty. Regression coverage records actual executed parries lowering jab odds,
and a negative heavy outcome lowering its score and probability. Untried actions
receive no invented outcome; habit evidence still tracks recent opponent behavior.

Training hosts may set `combatAiTuning.exploration` in [0, 1] (default zero).
The selector mixes that fraction of uniform legal-action probability into the
scored distribution. At .08 every eligible action receives at least .08 divided
by the eligible pool size, so poor initial scores cannot prevent repeated trials.
Lethal-priority pools still assign zero probability to nonpriority actions.
Exploration consumes the same saved random stream and is recorded in selector
probes, allowing replay and model comparisons to reproduce the actual distribution.
