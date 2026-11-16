# Combat AI improvement audit

Updated 2026-09-30 against the current working tree. Scope: Touch of Death's
combat policy, within-match adaptation, local observations and bulk ingestion.
This is an engineering audit, not evidence of expert human performance.

## What learns by default

The fighter now uses contextual adaptation by default. Legal candidate values,
strong centered personality preferences, host offsets and learned estimates
remain separate. Tried actions update context-specific effectiveness; visible
opponent behavior updates conditional habits. Confidence limits early changes,
and informative partial contacts at round/match boundaries receive quarter-weight
updates once. Unexecuted and unobservable outcomes remain unknown. Contextual
evidence survives same-opponent rounds, matches and saves; an explicit new opponent
resets opponent-specific evidence. Hosts own durable writes and logical identities.
The compact routine save omits completed audit traces, preserving all useful
weights, habits and pending attribution. Full bounded traces remain inspectable.

Default bulk training continuously updates one general action/context model,
persists it, and queues it for the next ordinary match. Training adds explicit
legal-action exploration. Fights and paired investigations submit fresh evidence
without re-adding inherited model totals. Learned actions and journal rows no
longer evict at 64 entries, and new action evidence accumulates without decay.
Opponent habits remain encounter-local. Personality preferences remain stable
while outcome evidence adjusts scores, avoiding the observed negative-reward
probability reversal. Legacy banks migrate without summing overlapping priors.
The benchmark compares a frozen learned snapshot against cold models on matched
seat-swapped seeds; it neither mutates the bank nor gates local updates. Explicit
legacy offset searches and server promotion remain independent. The panel and
export expose evidence, persistence and hypothetical probability changes. These
mechanism checks alone do not establish increased fighting strength.
See [the contextual bank](../../../apps/engine-editor/src/scene3d/bulk-training/adaptation/README.md).
Approved offset updates batch into atomic versioned IndexedDB
transactions and automatically queue the latest revision for the next match.
Reads cache for 30 minutes with commit/cross-tab invalidation; rollback, storage
retry and original-policy recovery are visible controls. Review receipts remain acknowledgements of exact
report digests and never independently train a policy.

| Question | Current behavior | Missing mechanism |
| --- | --- | --- |
| Reward creating interactions? | Attributed outcomes continuously update contextual action effectiveness. | Individual setups receive no separate credit; interaction volume is not a reward. |
| Punish inactivity? | Waiting shifts pressure scores; capped sets retain observed lessons but no invented winner. | No dense penalty that could incorrectly punish recovery, defense or spacing. |
| Reward finishing a TOD? | Lethal cancels take priority; paired response rewards include round outcomes. Actor-tagged chains record lethal endings and initial health. | No arbitrary per-hit/TOD bonus independent of outcomes. |
| Punish dropping a TOD? | Observed misses and punish damage update context-specific evidence; reports distinguish range, dodge, armor, interruption, recovery and censorship. | No counterfactual proof of an avoidable drop; observed recovery is not automatically punished. |
| Evolve across training runs? | Continuous general-model updates, persistence, next-match activation and frozen learned-versus-cold benchmarks. | General fighting-strength gains need broader opponents and human evidence. |

Multiple strikes can land during one attempt. Move preference is a bounded
score, not a hit probability. Ordinary fight reports are observational and must
not be treated as complete counterfactual trajectories. The contextual model records
actual chosen probabilities and alternatives separately.

## Reproduced gaps closed

- The September 30 export exposed FIFO deletion of learned action/context rows
  and negative evidence increasing a move's score through personality attenuation.
  Action parameters and journals now retain all validated identities; action
  samples/rewards accumulate together. Regression coverage spans more than 64
  identities, repeated observations, JSON restoration and stable personality.
  Opponent habits retain their separate recent-data decay.
- Real contacts against a defeated fighter have zero damage. They previously
  earned positive hit evidence and inflated successful-hit summaries. They now
  retain physical contact attribution without positive damage credit.
- A nine-health stunned opponent received a preferred six-damage link instead
  of a legal lethal link. Reachable, affordable lethal cancels now take priority.
  A separate regression proves a five-frame link exploits seven remaining stun
  frames; the old eight-frame cutoff missed it. Expired windows still reject
  links, and the chosen inputs finish through the real simulation.
- Alternating Theater seats defeated a shared report deduplication key. Each
  seat now compares exact input fields and has its own heartbeat. A repeated
  60-frame/two-seat fixture retains six decisions instead of 120 while preserving
  all 120 observations. This measures fixture record reduction, not whole-match
  compression or faster simulation. Changing inputs retain full precision.
- Reloading bulk history discarded the original run seed. Valid uint32 seeds
  now survive reload; missing legacy seeds remain unknown.
- Evicted move summaries silently disappeared from bulk totals. Engine reports
  now count evictions; bulk aggregation/export/reload retains
  `droppedMoveSummaries`, including rows omitted at worker/run limits. Missing
  legacy coverage stays unknown. This counts lost summaries, not lost hits.

Implementation and regressions live under
[`combat-ai`](../src/project/3d/combat-ai/README.md) and the editor's
[`bulk-training`](../../../apps/engine-editor/src/scene3d/bulk-training/README.md).

## Implemented learning boundary

Engine owns validated per-seat score artifacts, pending next-match adoption,
checkpoint parity and bounded actor/chain evidence. Editor owns the experiment,
promotion gate, content-scoped durable storage and UI. The learner optimizes set
results, not pooled move counts. Reports retain exact trial seeds and policy IDs;
recent detailed samples keep per-actor aggregates and complete contact sequences
with explicit truncation/censoring. Insights now paginates every retained row.

Persistence uses lossless compact evidence with an integrity checksum, explicit
revision preconditions, and serialized compare-and-swap transactions. Failed or
corrupt refreshes retain the last verified in-memory policy and fail closed for
writes; a fresh client with no verified copy uses the current default without
host offsets. Checksums
detect accidental corruption, not malicious local edits. This is per-browser
storage, not a shared server model database. See the experiment contract for cache,
batching, recovery and migration semantics.

See the [experiment contract](../../../apps/engine-editor/src/scene3d/bulk-training/learning/README.md)
for the exact paired test, cap handling and persistence limits. A real 128-set
one-health arena run completed without caps and rejected its candidate: active
comparison had zero positive, one negative and fifteen tied seed pairs. This
proves the complete rejection path, not improved city fighting strength. Browser
workers and exports passed at 1440px and 390px; recovery controls have DOM/store
regressions. Evidence lives under `.local/touch-of-death/policy-learning/`.

## Remaining work, in dependency order

1. **Prove broad strength.** Engine owns specialist opponents/scenario fixtures;
   product QA owns blind skilled-player trials. The current gate covers active
   and previous/original policies, not a full opponent league or held-out maps.
   Add retreat, parry, grapples, DI/tech, weapons, stamina denial and city traversal
   specialists. Publish weakest-matchup results alongside aggregate improvement.
   Repeated experiment gates do not establish a lifetime false-positive bound.
2. **Validate counterfactual opportunities before dense reward shaping.** Engine
   owns proof that an affordable legal continuation existed. Recovery, enemy tech,
   escape, interruption and censorship are already separate observations; none
   proves an avoidable mistake. Include stamina expenditure and opportunity counts
   before evaluating a drop or passivity penalty. Match outcome remains the
   current optimizer objective, avoiding activity/corpse reward farming.
3. **Expand recovery and experiment throughput when measured.** Editor owns
   resuming unfinished runs after reload (currently exportable but restart-only)
   and deterministic parallel trial scheduling (learning currently uses one
   worker). Approved policies survive reload, and current/restored fights preserve
   their original policy until a new match. External bulk review receipts remain
   separate from the learner's completed evaluation evidence.

The proposed opponent pool is informed by AlphaStar's use of past strategies and
specialist exploiters to expose weaknesses and address forgetting; its results
do not establish that this fighter needs the same architecture or compute scale.
See the [primary research team's explanation](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/).

## Compression without losing meaning

Keep exact committed simulation state, reaction queues, input edges and seeds.
Reports can retain changed inputs plus per-seat heartbeats, one copy of stable
metadata, numeric counters and bounded complete exchange samples. Keep event IDs,
actors, frame ranges, denominators, policy/build versions and dropped or censored
counts. Do not round inputs used for replay, merge both fighters' experiences,
or derive success rates from a rolling sample.

The contextual policy reuses physical move variants and contact
forecasts within one decision. Optional compression reuses distant ordinary movement for at most
six ticks after the per-frame safety checks. These policy changes have separate
ablations; they are not evidence of a whole-engine speed improvement. No inputs
used for replay are rounded. See the measured physics improvement below.

## Earlier tactical experiment: frozen results before default adaptation (2026-09-29)

The following measurements describe the earlier opt-in iteration and its exact
frozen checkpoints. The default and personality changes below supersede its
rollout recommendation; historical match/speed results do not describe the new policy.

The new `combatAiTuning: [{ mode: 'adaptive' }, { mode: 'adaptive' }]` host option
is an experiment. Omitting it retains the original decision rules and reaction
queues. The original controller was frozen before edits. This is not a promoted
browser learning artifact or a claim of perfect play.

### Executed path

`gameplay.advance` calls the combat adapter's input/motion step. The adapter
captures committed combat state, physics bodies, surface forecasts and observed
weapon/projectile state. Each enabled seat calls `createCombatAi3D.step`:

1. Update visible personality/tactic evidence and derive relative displacement,
   velocity, ground state, physical weapon variants and authored animation phases.
2. Check grapple tech, hitstun exits, incoming contacts, feints, terrain routing,
   active cancel windows, hit confirms, landings and item opportunities.
3. Generate an available neutral pool, or rank live dash attacks separately.
4. Compute authored tactical scores and personality terms; add reviewed offsets,
   host artifact offsets once, then optional contextual evidence.
5. Retain a still-valid short intent or sample a seeded softmax distribution.
6. Queue ordinary commands for `(9 - difficulty) * 3` ticks; motion/interactions
   and the combat input resolver validate and execute the delivered commands.
7. Feed actual public contact events and post-step snapshots into outcome reports,
   personality evidence and optional contextual attribution.
8. Capture per-seat state for checkpoints/portable saves. Hosts can retrieve detached
   contextual models and explicitly restore them for the same named opponent.

There is **no LLM, transformer, dense neural network or model inference call** in
this path. The browser bulk learner searches bounded score offsets through full
seeded games. Its version-1 IndexedDB artifact contract remains unchanged. A
future browser promotion of this contextual algorithm requires a distinct version,
algorithm/model identity and matching validation evidence; existing reports must
not silently acquire different semantics.

Dash role values around 5–105 are **ordinal ranking values**. The executed dash
pool maps their order to `3 - rank * .45`, with the original preference term in
baseline mode. They do not compete directly with ordinary neutral scores.
The regression checks this actual controller trace. Ordinary move preference is
logged and added, not multiplied into the final score. Host offsets in [-2, 2]
are additive; two opposing extremes can change a margin by four. The adaptive
policy replaces the global move-preference/failure penalty with contextual
evidence rather than crediting both. Softmax temperature is `.45 + (9-level)*.25`.
At level 9, a one-point margin has odds about 9.23:1; at level 1 about 1.50:1.
Small evidence cannot routinely overturn a large prior, so tests exercise both
weak single-hit updates and a reversal after repeated informative outcomes.

### Observation inventory

| Information | Actual availability and use |
| --- | --- |
| Relative position, velocity, facing, height | Committed fighter positions plus physics bodies; used for reach, incoming contact, pursuit and navigation. Future trajectories are predictions. |
| Ground/air, landing, stun, protection | Supplied ground observations and visible fighter counters; filter unavailable attacks and time defensive opportunities. |
| Startup, active, recovery, cancels | Authored metadata plus current move/frame; contact forecasts include delivery latency. A cancel opportunity removes the lethal recovery guarantee. |
| Attack/hurt geometry | Authored reach, hit radius/height, strikes and core hurt radius. The controller does not receive a complete live skeletal hitbox/hurtbox mesh. |
| Guard, parry, armor, escape, resources | Committed guarding/guard-start, stun kind, followup, armor/protection, escape charges, guard meter, health and stamina. No pending opponent input is consulted. |
| Combo state | Current move/serial, public contacts and hitstun; existing authored links remain. No counterfactual full-combo value model. |
| Weapons/projectiles | Visible ownership, length and projectile trajectory; shared resolver supplies physical attack variants. Items preference is used by pickup decisions. |
| Walls, hazards, terrain | Surface contacts, wall normals, route/breach/blocked-escape observations; environment adapters own physical queries. No hidden future traffic intention. |
| Timer, round score, match score | The host has them, but the tactical observation does not pass them. No invented match-win probability or timer-aware policy is claimed. |
| Opponent history | Public committed animation/guard/separation and actual outcomes. Pending input history is not used. Logical opponent identity must be supplied by the host. |

`personalityWeights.grounded` is an unused derived compatibility field (covered by
an existing schema test); it has no tactical consumer. `items` is not unused.
Candidate `duration` metadata is not consumed by the attribution model; actual
observed animation completion determines its reward window. The step wrapper
also still recomputes its horizontal distance for personality observation.
The old controller retained intent while still regenerating/scoring its pool;
the movement cache now avoids that duplicate work in explicitly safe contexts.
Portable math checks also exposed existing platform `sqrt`, `cos` and `hypot`
calls in policy/jump code. They now use the engine's simulation math; this is a
portability correction, not a change to score weights.

### Implemented boundaries

Adaptive mode filters unavailable ground/air attacks, insufficient stamina,
animation locks, expired parry followups and delivery-expired landing/cancel
windows. A no-command fallback remains available. Zero configured stamina budget
means unlimited resources, matching the combat core. Protection lasting through
predicted contact excludes an ineffective attack. Incoming melee/projectile,
cancel, landing, traversal and stun checks run before movement reuse. A regression
starts with cached movement and then delivers an imminent projectile.

A lethal attack whose predicted contact precedes uncancellable recovery, against
an unguarded target without an escape charge, forms a priority pool. Neither
personality, adverse host offsets, noise nor retained movement can select outside
that pool. This guarantee is conditional on the trajectory forecast; it does not
predict an opponent's unknown future input. Other tactical bonuses remain the
measured original heuristic rather than an untrained match-value rewrite.

The escape-charge restriction was checked against execution, not inferred from
the AI's usual hitstun response. The core accepts an explicit armored escape
command during recovery without hitstun; an action-state regression checks both
available and exhausted charges. Such a target is not guaranteed committed merely
because its ordinary cancel list is empty.

The contextual model stores bounded actual distributions and one attribution
window, context/action effectiveness and conditional guard/retreat/commitment
habits. Neutral priors and bounded adjustments prevent one lucky
contact from rewriting the policy. Actual damage, block, parry, interruption,
armor and received punish damage are distinguished; range/displacement miss
explanations stay explicitly predictive. Unexecuted or interrupted observations
are censored. Later overlapping choices are not assigned fabricated rewards.
Same-opponent rounds/games retain completed evidence; a named new opponent clears
it. Frozen evaluations read without updating. Strict JSON validation, detached
ownership and save/rollback continuation have tests. See the
[learning contract](../src/project/3d/combat-ai/learning/README.md) for exact bounds
and attribution limits.

These learning traces cover fresh neutral/dash selector draws. Retained intents
are deterministic reuse, not new softmax samples. Existing defense, confirmed
combo and traversal gates remain authoritative and retain ordinary outcome
reports; the contextual model does not claim a full counterfactual episode for
every deterministic gate. Its one attribution slot deliberately censors
overlapping choices rather than assigning the same damage to multiple actions.

Concrete personality probes keep every other observation/trait fixed in the
authored legal pool at level 9. At distance 1.6 and full stamina, changing only
`fast` from .3 to 1.7 changes jab probability 32.54% to 50.30% and heavy 39.47%
to 14.81%. At 12/100 stamina, changing only `defensive` .3 to 1.7 changes retreat
55.14% to 90.84% and jab 44.45% to 9.01%. Available candidate IDs remain equal;
lethal priority remains intact. `policy/style.test.ts` and its README retain these
examples. Those fixtures restrict commands to neutral/unarmed variants. The
complete controller probe (same geometry, with a legal grapple and directional/
Drive alternatives) gives jab 11.06% to 19.56% and heavy 13.41% to 5.76% when
changing only `fast`; the tired-state retreat changes 50.91% to 88.81% when
changing only `defensive`. Changing only `grappler` moves grapple .19% to 16.95%.
`packages/engine/examples/touch-of-death/host/tactical-evaluation/style-probe.ts` emits the actual
controller distributions. These are state-specific probabilities, not a
whole-match style score.

### Measurement boundaries

Evidence and frozen builds live in `.local/touch-of-death/tactical-evaluation/`
and `.local/engine-perf/`. The [runner](../examples/touch-of-death/host/tactical-evaluation/README.md)
records seeds, both seats, build digests, caps, damage, request entropy, damaging
move diversity, observations/full scoring per simulated second, staged time and
wall-clock set throughput. Headless rendering is zero; this does not measure
browser rendering. Outcome recording is measured separately from brain decisions;
the remaining gameplay time includes physics, movement, interactions, match
handling and host reads.

Original city self-play: 4/4 completed sets, 418.03 simulated seconds in 116.55
wall seconds, 2.06 sets/minute, 24 damaging moves and 14.92% punish contacts.
Brain plus outcome observation cost was about 0.51% of gameplay time. A CPU profile
instead pointed to CCD (~47%), quaternion normalization (~34%) and loose weapon
surface probes (~15%); sampled categories are diagnostic, not additive stage clocks.
The trusted no-snapshot loop measured only +3.28% aggregate throughput with noisy
runs, so it remains an explicit runner option.

The exact identity quaternion fast path is enabled in the physics leaf. A serial
warmed city A/B/B/A comparison measured **+12.85% aggregate tick throughput** and
15.31% lower median p95 tick time. Control: 182.19/202.31 ticks/s; candidate:
225.10/208.27. Serialized checkpoints and raw physics typed-array byte hashes
matched every 120 ticks, with matching final reports/match state. This is a
1,200-tick measurement at seed 17001, not a confidence interval for every map.
Identity/sign-zero/invalid-quaternion tests and the existing rigid suite pass.

The initial frozen contextual candidate, before the final delayed-delivery,
grapple and dash-availability corrections, won **33/64 sets (51.56%)** against the original;
the descriptive 95% interval is 39.58–63.37%. Damage differential was -288.85,
punish contacts 16.14%, 29 damaging moves and 49.31 arena sets/minute. The damage
differential is the total across 64 sets, not an average. Disabling
adaptation gave 31/64 wins, differential -1118.6 and punish contacts 15.42%.
Seed/seat correlation and shared seeds mean these intervals are not a promotion
gate. They do not establish a general strength improvement.

| Paired league, 16 sets per entry | Original | Contextual candidate |
| --- | --- | --- |
| Scripted rush | 16 wins | 16 wins |
| Scripted guard | 16 wins | 16 wins |
| Scripted keepaway, 12,000-tick cap | 2 completed, 14 caps | 15 completed, 1 cap |
| Frozen held-out space/heavy offsets | 5 wins | 10 wins |

The pursuit result changes completion in the finite-floor fixture. Rush/guard are weak scripts and
cannot prove broad strength. The held-out result is small-sample evidence; there
is no expert human or held-out-city-map validation. Keep the original policy as
the default until a broader league demonstrates a repeatable gain.

### Final source comparison and ablations

The final evaluation engine is
`03bae2d134a6186a7a84e881beff53040315cb7e7d6ad27827d446ef0d0ca51c`;
the original controller is
`a1ecc5b66540ace5d5826aedf7baf9e9bb693dcb18e8e431ac0b49e18b4db21e`.
Final baseline mode matches the frozen original's winners and ticks on both seats
at seed 17001 (5,403 ticks each), and the 16-set instrumented baseline comparison
has paired identical winners/ticks and zero total damage differential. This is
seeded parity, not a claim of exhaustive equivalence of every possible trajectory.

| Final arena comparison | Wins/sets | Total damage differential | Punish contacts | Damaging moves | Full scoring/simulated second | Sets/wall minute |
| --- | --- | --- | --- | --- | --- | --- |
| Contextual vs original | 33/64 | -289.55 (-4.52/set) | 16.29% | 29 | 4.574 | 47.86 |
| Contextual adaptation disabled vs original | 32/64 | -959.95 (-15.00/set) | 15.52% | 29 | 4.798 | 49.39 |
| Contextual, matched first 16 | 8/16 | -243.40 (-15.21/set) | 18.59% | 24 | 5.293 | 48.33 |
| Compression disabled, same 16 | 8/16 | -277.90 (-17.37/set) | 18.36% | 25 | 5.299 | 49.17 |

All these sets completed without caps. Contextual win-rate interval remains
39.58–63.37%. Request entropy was .421 bits/action versus .422 without contextual
adaptation; it is dominated by repeated movement and does not prove broad move
diversity. The ablation disables the new contextual updates/adjustments; original
feint, parry-caution and stuck-navigation feedback remain. Comparing 64 adaptive
sets to 16 uncompressed sets would confound the compression result. The matched
comparison shows negligible scoring reduction and no reliable wall-speed gain;
movement reuse stays experimental. The verified speed gain is the physics leaf.

Final league repetitions retain rush/guard 16 wins each for either policy and
held-out 5/16 original versus 10/16 contextual. Total held-out damage changes
-543.60 to +481.00; punish contacts 15.40% to 15.78%, damaging moves 25 to 26.
Rush damage changes 4102 to 3719 and guard damage 4314.2 to 4100.6 despite equal
wins; these weak scripts do not show a consistent quality improvement.

**The keepaway completion result depends on the fixture.** Capped-trial terminal
snapshots prove all 14 original caps and the one contextual cap have both fighters
alive below the finite 100-by-100 arena floor. For example, seed 17001/seat 0
ends at approximately `[160, -16738, 122]` and `[160, -110873, 126]`. The 2-to-15
completion change therefore measures avoidance of arena escape, not independently
proved chase or punish skill. Do not promote on this matchup. No floor geometry
was enlarged to hide the failure.

Three final 900-simulated-second sessions each completed 14 sets and one partial
against the same opponent changing rush to guard at 450 simulated seconds.
Observed near-context guard fraction rising .2 above its switch-time value is
detected at the 15-second sample afterward with contextual adaptation enabled,
and never with it disabled. On/off compression has identical outcomes/actions in
that session. Wall times 12.82/12.91/13.40 seconds are individual serial samples,
not a qualified speed result. All completed sets beat a weak script, so this
demonstrates evidence and probability changes, not stronger general fighting.

An earlier uncapped actual 15-minute session completed 656 sets, then spent about
25,089 simulated seconds in one unfinished fight. Its retained traces are all
airborne, consistent with floor escape, but that recording lacks terminal
positions and cannot prove the cause. The runner now caps each set at 12,000
ticks, preserves completed same-opponent evidence, censors pending attribution
and starts the next set. It reports caps separately from draws/wins and records
terminal fighter positions, health and match phase. An actual-process regression
forces six consecutive caps and checks continued games and censored attribution.

The final frozen engine also completed an actual **900,001.86 ms** training run:
991 completed sets, zero caps and one partial set, totaling 63,720.07 simulated
seconds. That is 66.07 completed sets per actual wall minute and 5.261 full
scorings per simulated second, with 32 named damaging moves and 5.15% punish
contacts. Early repository verification and a city smoke around wall seconds
400–510 overlapped this run; its throughput is observational, not a controlled
before/after speed claim. All 991 wins were against the disclosed weak switch
script, so they establish continued training rather than general fight strength.

The opponent switched rush to guard at 450 wall seconds. Observed near-context
guard fraction rose from approximately zero to .515 at the 455-second sample,
crossing the specified +.2 criterion in **5.00 wall seconds**. This is evidence
detection latency, not time to a statistically proven win-rate improvement.
Holding an illustrative jab/heavy/space probe's original scores equal isolates
the learned adjustment:

| Wall seconds | Jab probability | Heavy probability | Space probability |
| --- | --- | --- | --- |
| 0 | 33.33% | 33.33% | 33.33% |
| 445, before switch | 32.02% | 32.02% | 35.95% |
| 455, after switch | 34.27% | 30.98% | 34.75% |
| 895 | 34.65% | 31.45% | 33.91% |

These are distributions recomputed from actual recorded evidence in a fixed
hypothetical context; they are not claims about outcomes of untried actions.
Controller regressions separately check that evidence changes a real legal pool
and can reverse its initial ranking. Final memory retains 64 context/action
entries, eight habit contexts and 64 traces, including 26 censored traces rather
than invented rewards. Full data are in
`.local/touch-of-death/tactical-evaluation/session-final-15min-wall.json` and its
`final-session-summary.json`; both identify the same engine digest above.

### Staged profile and validation

The final instrumented baseline city run completed two sets in 43,331.56 ms.
All brain decisions plus outcome observation cost 310.23 ms (0.72%); engine and
host remainder cost 43,021.32 ms. Candidate-seat stages are shown below; these
are stage intervals within brain time, not additive measurements of both seats.
Step-wrapper work and the other seat are included in the all-brain measurement.

| Candidate-seat stage | Wall milliseconds |
| --- | --- |
| Derived features inside the decision | 21.457 |
| Safety/interrupt checks | 40.608 |
| Candidate generation, reach forecasts and dash ranking | 23.536 |
| Score arithmetic | 2.673 |
| Selection | 2.685 |
| Decision reporting | 41.783 |
| Post-step outcome observation | 2.961 |
| Rendering in this headless lane | 0 |

There is no transformer inference cost. Timer intervals include profiling
overhead. Baseline arena all-brain share is 10.29%, illustrating why the city
physics bottleneck must not be inferred from a small flat arena. Pure combat
simulation is not isolated from motion/physics/interaction in the host remainder.
Browser rendering, skilled humans and held-out city maps are not measured here.

The final full-city adaptive smoke also completes four seat-swapped sets against
the original (two wins/two losses, zero caps), total damage differential -27.6
(-6.9/set), 15.69% punish contacts and 24 damaging move types. Staff heavy/light
contacts and jump/interact/navigation requests exercise actual weapon and city
adapters. This is integration evidence with a very small sample. Its 93.15-second
wall time overlaps the final training session and is explicitly disqualified as
a speed measurement. Broader quality/learning evaluations use the open arena;
they must not be presented as held-out-map or expert-human validation.

Final verification: 455 combat/AI/rollback/motion/rigid/learning/evaluation tests
pass, with 69,961 assertions; the final recovery-escape regression passes
separately. Five HTTP tests skipped under the browser preload
pass separately with `HARNESS_TEST_SKIP_UI_PRELOAD=1` (102 assertions). Engine
source/test typechecks, full build, installed-package consumer smoke and targeted
lint pass (six existing/diagnostic ownership warnings, zero errors). Process
policy checks 4,203 files with zero violations; live training HWND inspection
reports no visible owned windows. Repository source structure fails the unrelated
PadPilot directory growth (38 versus baseline 36). Delivered bundle budgets still
fail; [size evidence](bundle-size-evidence.md) records the final values without
raising limits. This experiment is not a release-readiness claim.

## Default adaptation, stronger styles and city tick work (2026-09-29 followup)

Per the product instruction, ordinary play now always enables contextual
adaptation; this rollout is not justified by a demonstrated strength improvement.
Explicit baseline, adaptation-off and frozen modes remain evaluation controls.
Compression remains off by default because its earlier A/B did not qualify.
There is still no transformer or LLM in the tactical runtime.

Each executed, attributable decision can contribute evidence. Contact rewards and
penalties used confidence-weighted context rows with recent-data decay in this
historical September 29 run. September 30 action updates instead accumulate;
habits retain decay. Informative partial contacts at boundaries receive 0.25 sample weight,
once. One partial hit yields confidence 0.0303 and at most about 0.0455 score
adjustment. Unknown outcomes receive no invented reward. An executing attack and
one queued successor have distinct attribution; forced legal safety/combo commands
record probability-one distributions. Movement does not inherit a separately
queued attack's damage. Retreat habits use actual public outward displacement;
hitstun contexts do not generalize confirmed combos into neutral.

All eleven personality preferences affect available choices. Centered style
contributions share a [-1.4,1.4] bound, enough to produce large odds differences at
level nine without overriding lethal-punish priority. This historical run tempered
style with confidence; September 30 removes that coupling because a negative
reward could increase a disfavored action's probability. In the earlier controller probe,
`fast` 0.3→1.7 raises jab 4.15%→27.83% and lowers heavy 21.89%→1.88%.
`defensive` raises low-stamina retreat 5.64%→99.22%; `grappler` raises available
grab 0.03%→56.86%. Pickup preferences span 2%/50%/98%, subject to ordinary safety
and interaction availability. These are style effects, not universal optimality.

Stronger styles exposed a real chase regression: a zero-damage back-hop dominated
the remaining dash pool while a target retreated, and hop-free reach forecasts
admitted attacks at the wrong height. Adaptive forecasts now include authored
startup hop; paid dash movement remains a legal alternative, and backward hops
lose tactical value while the target is visibly fleeing. The retained pursuit
fixture now deals 14 damage by frame 120 (formerly zero by frame 240).
Explicit baseline deals 24 by frame 120; the fix does not imply better pursuit
in every situation. Grab recovery also retains exact twelve-frame fairness;
personality can choose a legal re-grab instead of the old test's assumed jab.

Routine gameplay saves keep models, habits, pending/queued distributions and
reaction state but omit completed debug traces. Full audit reads and trusted
checkpoints retain the bounded history. Two-brain fixture: 82,761→29,637 bytes;
individual brains 28,192/28,227→1,647/1,648. Full versus compact restores reproduce
actual actions, contacts, physics and learned continuation exactly. This is a
payload reduction, not a measured save-time improvement.

Same-opponent games retain evidence in the existing controller and portable saves.
Browser search sets now inherit the separate contextual lesson bank. Fresh
browser held-out and SQL evaluation trials remain independent contextual models,
while numerical-offset approval persists artifacts and trial evidence. Their
baseline means the current default without host offsets. Training-journal hooks
are opt-in and do not alter ordinary AI scoring or the offset evaluation protocol.
Shared combat content namespace `combat-v29` isolates changed simulator evidence;
version-one artifacts and the offset search algorithm remain unchanged.

### Current frozen quality and adaptation evidence

Both comparator seats use the same current physics. Exact engine checkpoint:
`f0e68cfec23aa415524d4233eb2aca02c2d3fded4345f819d3bd493b643305da`.
Previous adaptive factory digest:
`c6020f47323c620b7b37560438c383b533dd22ed5515781b3b26466974fd61b2`.
Its retained source reproduces the earlier `03bae2d…` engine's seed-17001
seat-swapped winners, ticks, decisions, damage and contacts exactly.

| Opponent, 32 seat-swapped seed pairs | Wins | Wilson 95% interval | Damage/set | Punish contacts | Damaging categories | Scores/simulated second |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Frozen original | 30/64 | 35.18–58.93% | -13.85 | 17.57% | 32 | 5.09 |
| Previous adaptive | 31/64 | 36.63–60.42% | +6.79 | 16.48% | 31 | 5.23 |

Neither comparison establishes stronger general play; no sets cap. Observed arena
throughput is 43.88 and 42.33 sets/minute respectively, with other validation
running: these are diagnostic rates, not qualified timing comparisons.

New adaptation on/off sessions each run 900 **simulated** seconds, finish 14 sets
with one partial set and zero caps, and switch rush→guard at simulated second 450.
The on model detects a +0.2 near-context guard-habit increase after 30 simulated
seconds. Its fixed equal-prior jab/heavy/space probe changes 33.33/33.33/33.33%
initially→31.44/32.24/36.32% at second 480→31.90/31.96/36.14% at 900.
Off retains no contexts and leaves the probe unchanged. On retains 64 action and
eight habit contexts; retained traces include 23 partial contacts, seven hits and
one parry, with pending/unresolved entries left unlabeled. Both win all completed
sets against this weak scripted opponent; that does not prove strength. Session
wall timing briefly overlaps and has no speed claim. The earlier actual
fifteen-minute run above belongs to its historical checkpoint.

Artifacts: `.local/touch-of-death/tactical-evaluation/new-default-summary.json`,
`default-v-{original,previous-adaptive}-64.json`, `default-style-probabilities.json`
and `default-session-adaptation-{on,off}-900sim.json`.

Same-checkpoint short league, eight seat-swapped seed pairs per opponent:

| Script | Wins / attempted sets | Caps | Damage / attempted set | Punish contacts | Damaging categories |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rush | 16/16 | 0 | +257.75 | 7.84% | 27 |
| Guard | 16/16 | 0 | +267.58 | 3.10% | 27 |
| Keepaway | 14/16 | 2 | +205.38 | 16.41% | 23 |
| Held-out space/heavy | 7/16 | 0 | -26.94 | 16.70% | 26 |

Rush and guard are weak scripts. Both keepaway caps have living fighters hundreds
of thousands of units below the finite floor; they remain caps, not wins/draws,
and demonstrate the known arena-boundary limitation. Held-out performance exposes
a remaining weakness. Artifacts `default-league-v-{rush,guard,keepaway,held-out}-16.json`
retain terminal state and cap proofs. None establishes universal optimality.

### Qualified city performance and further candidates

Conservative CCD pair pruning, spatial weapon-surface queries and maintained AABB
reuse reduce city tick wall time 42.81% (1.749× ticks/s). Correctness and isolated
serial ABBA, individual ablations, incremental cache validation and active-traffic
fixtures are in [optimization history](engine-performance-optimizations.md).
Distance only removes proven irrelevant tests; it does not freeze moving items
or traffic. Incoming cars and solid wreck queues remain simulated. Body/contact/
constraint bytes, saves, ordered audio, outcomes and rewind replay match; only
the documented discarded-angular-work counter may differ in traffic tests.

Remaining measured route visibility work suggests two next A/Bs: filter global
blockers against a conservative envelope containing every route segment, and
reuse per-call narrowphase buffers with output reset. Preserve body order, exact
actor height, oversized/rotated obstacle checks, hazard invalidation and live
traffic. A remote center alone cannot prove an object's geometry is irrelevant.
The followup tested both independently and combined. Neither produces a repeatable
gain; the initial buffer result reverses on a fresh repeat. Original route code
is restored exactly. See [the rejected-route results](engine-performance-optimizations.md)
for raw timing, traffic parity and retained route regressions. The earlier city
physics gains and default adaptation remain in place.

Final verification: 519 tests pass across 102 files, 62,335 assertions; engine
source/test/editor typechecks, full build, installed-package consumer and targeted
lint pass (five diagnostic ownership warnings, zero errors). Process policy:
4,224 files, zero violations. Repository source structure still fails unrelated
PadPilot directory growth (38 versus baseline 36). Whole dirty-worktree bundle
budgets remain exceeded; [size evidence](bundle-size-evidence.md) records current
values without raising limits. This is not a release-readiness claim.
