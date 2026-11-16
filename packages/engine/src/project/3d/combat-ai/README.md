# Combat AI decisions

The policy reads committed state and queues ordinary inputs through each difficulty's reaction delay. It does not manufacture movement permissions or inspect pending opponent inputs.

A queued return to baseline is saved as `queuedPolicy: {}`. Omit the absent
`policy` field when queuing and restoring; explicit `undefined` breaks portable
JSON saves. `policy/trained.test.ts` reproduces this browser-save failure and
checks that the reset remains pending across round boundaries until a new match.

Dash attacks require the motion system's live `dashing` observation. The AI chooses a neutral, forward, or backward attack through its emitted stick direction; launch direction does not lock that choice. Close spacing, observed recovery, incoming movement and airborne targets rank the authored roles. Shared attack reach prediction can reject an unsuitable choice. A delayed command that outlives the dash is subject to the ordinary simulation gate.

The back-hop followup releases Drive before pressing it again in its authored cancel window. Delivered and queued Drive states survive save/rollback. Travel-charge attacks hold Heavy while their active acceleration remains useful, without pausing startup. Held weapons use the shared authored weapon variant resolver; decisions emit ordinary commands rather than private weapon commands.

`dash-attacks.test.ts` covers role selection, live permission, reaction queues, Drive edges, travel charge and held-weapon selection. Existing `../combat-ai.test.ts` covers defensive timing, ordinary attacks, outcomes and traversal input behavior.

High-level retreat pursuit uses the same visible outward velocity as lower settings. It requests sprint before separation becomes extreme and can spend an ordinary dash to close a sustained gap. A seeded, saved tactical state varies short pressure windows, shallow flanks and occasional nearby jab probes. Two observed ended attacks without contact temporarily discourage repeating that commitment; another reachable attack or movement remains available. This is bounded short-term policy state, not training or a learned balance adjustment. Seeds, choice deadlines, failed-move memory and reaction queues restore together.

Spawn preferences weight risk, speed, eagerness, defense, items, positioning, jumping, close fighting, whiff punishment, safe baiting and grappling. The [tactical policy](policy/README.md) scores visible features and samples numeric candidate probabilities; lower settings use more noise instead of a periodic forced-heavy script. Short saved intent windows avoid frame-to-frame movement jitter. Resolved contacts adjust move preferences; repeated parries encourage legal startup feints before a last-frame guard appears. Visible enemy feints encourage sustained blocking. Combo links require predicted contact before hitstun ends, including input delivery delay and the observed DI trajectory. A hit does not guarantee the next attack.

Both Theater seats preserve preference profiles, bounded observed learning and the random-choice stream across rounds. New matches resample independently from the match seed. Blocked movement can request a floor-supported clear lateral exit before retrying navigation; fighters stacked over an opponent step off through normal movement. See [personality](personality/README.md), [pressure regressions](pressure/README.md) and [lifecycle](lifecycle/README.md). No pending input reads or rule exceptions are added. Hosts may inject validated trained score artifacts through the [tactical policy](policy/README.md); observed match memory still resets each match.

The optional shared outcomes recorder supports two independently controlled AI fighters. Insights count actual observed attack starts and resolved contacts, separately reporting damage, blocks, parries and ended attempts without fighter contact. Three-second attack droughts retain observed reasons such as recovery, low stamina, closing distance or movement without progress. They do not infer player intent or declare every whiff a mistake. Storage bounds are 16 move summaries, 16 tracked fighters and 32 completed droughts; completed segment summaries retain their insights. Hosts own durable storage and presentation.

[Exchange evidence](exchanges/README.md) adds actor damage and attack-start totals,
ordered bounded hit-chain samples, deduplicated Theater contacts and explicit
loss counts. Knockouts, recovery, techs, escapes, interruptions and reset-censored
chains remain distinct. These observations do not prove avoidable drops or reward
raw interaction frequency. Report reads preserve pending chains without mutation.

`tactics.test.ts` verifies seeded replay, failed-choice variation and actual level-nine pursuit against continuous backpedaling. `insights.test.ts` verifies the 180-frame boundary, contact attribution, shared recorders and bounded history.

The [improvement audit](../../../../docs/combat-ai-evolution.md) records the
current reward limits and outstanding exchange attribution, persistent training,
and opponent evaluation work. Passing these regressions does not establish
expert human performance.

## Contextual adaptation

Ordinary play uses adaptive mode with adaptation enabled and movement compression
disabled. Advanced hosts may supply `combatAiTuning` per seat to
`createGameplay3D`; the individual controller accepts `tuning`. The policy
adds contact-time punish checks, strict attack availability, a separate lethal
recovery-punish priority, confidence-weighted [contextual evidence](learning/README.md),
and optional short movement-plan reuse. It does not establish stronger general play.
Set `adaptation: false` or `compression: true` for controlled comparisons.
Explicit `mode: 'baseline'` preserves the original scoring path for evaluation.
The adaptation ablation disables the new contextual updates and score adjustments;
the original visible feint, parry-caution and stuck-navigation feedback remains.
`learningFrozen: true` applies supplied evidence without changing it.

`combatAiLearning` supplies validated per-seat initial evidence;
`gameplay.combatAiLearning()` returns detached per-seat copies. The public
`readCombatAiLearning` reader validates persistence. Hosts own content identity,
atomic writes and opponent identity: set `tuning.opponentId` to a stable logical
opponent ID, changing it for a new person/policy. Without it, the target fighter
ID is the compatibility fallback and cannot distinguish different people using
the same seat. The controller's `restoreLearning({ value, opponentId, newOpponent })`
can explicitly reset an opponent. Same-opponent rounds and games retain completed
evidence. Informative partial contacts at boundaries receive quarter-confidence
updates once; unresolved attempts are censored. Routine saves retain all model
rows, habits, pending distributions, reaction queues, tuning and plans for exact
policy continuation, omitting completed debug traces. `combatAiLearning()` and
trusted checkpoints retain full bounded audit history. Legacy saves select the
current adaptive default. Headless training and held-out comparisons are documented
in the [evaluation runner](../../../../examples/touch-of-death/host/tactical-evaluation/README.md).

`combatAiProfile` is an optional stage-duration callback, forwarded to both seats;
disabled profiling reads no clocks. Features, safety, candidate generation,
score arithmetic, selection and report logging are timed separately. Dash-role
sorting and its rank-to-score mapping are counted in candidate generation.
Outcome-event recording and world simulation remain host measurements.

`policy/adaptive.test.ts`, `policy/plan.test.ts` and `learning/controller.test.ts`
cover availability, delayed contact, expiry, lethal priority under adverse
offsets, dash score comparability, probability reversal, emergency interruption,
actual event attribution and portable resets. The original regression suite
continues to exercise the default policy. Authored startup hops participate in
adaptive reach forecasts. A chasing dash can continue its paid movement when no
forward attack reaches, rather than choosing a zero-damage backward hop.
