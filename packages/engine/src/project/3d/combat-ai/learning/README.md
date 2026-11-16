# Contextual tactical evidence

`model.ts` keeps a compact opponent-specific policy adjustment beside the existing
personality baseline. Ordinary play defaults to adaptive scoring with adaptation
on and decision compression off. Baseline comparisons and frozen evaluations
require explicit tuning; restoring a legacy checkpoint receives the ordinary
defaults with an empty history until actual observations arrive.
Contexts combine near/far spacing, our ground/air state,
their ground/air state, and visible guard/animation commitment/neutral state.
Confirmed public hitstun has a separate `stunned` context: guaranteed combo hits
cannot teach the same action an unsupported free-neutral success rate.
Animation commitment is observed; recovery is not inferred without move metadata.
Habit samples pool the animation state and update at most every 30 frames.
They describe guarding, visible outward opponent displacement and attack
commitment. Our own movement increasing separation cannot count as their retreat.
No hidden input, intended retreat, or untried action outcome is recorded.

Fresh decisions record legal alternatives, scores, supplied selection probabilities,
the chosen action and its probability. Missing alternative probabilities are null.
More than 64 alternatives retain the selected choice and an explicit omitted count.
An attack intention attaches only to an actual matching attack serial, within its
delivery delay plus eight frames. `observedMoveId` associates weapon-derived
executed moves with their authored alternative identity. Post-step snapshots
include contact events at snapshot frame minus one; attachment includes that
boundary. Unexecuted and reset-interrupted attempts are
censored. Pending intentions survive later policy draws until execution or expiry,
so queued delivery does not replace the recorded state or selected probability.
Unrelated attack serials observed before the intention's delivery cannot attach.
An executing action can retain one subsequent attack intention in `next`;
superseding that intention censors its old trace. Only a newly observed matching
attack serial after actual delivery attaches it. The previous action's actual
contact evidence is retained at quarter confidence, and its unknown remainder
is censored, so received damage never belongs to both action windows. Intentions
before the first delayed execution still retain the original decision unchanged.
Queued grapple intentions are censored while another action owns the slot.
Movement intentions have a 12-frame observation window starting at delivery,
rather than selection. Executed attacks
finish at observed animation completion plus 12 frames, capped at 180 frames;
animations still active at that cap are censored rather than declared misses.
Outgoing damage and incoming punish damage share that attribution window. Multiple
contacts are one sample. This bounded policy deliberately
does not assign counterfactual outcomes or claim full combo credit.

Each context/action reward measures damage dealt minus received (30 damage units),
with bounded parry, block and contactless-attempt costs. Rewards stay in [-1, 1].
An eight-attempt neutral prior limits a single hit's score adjustment to 1/6.
Action samples and rewards accumulate for the lifetime of the model; habit evidence
decays by 0.9 per sample, allowing changed opponent habits to replace old evidence. Total
adjustments stay in [-1.5, 1.5]; priority candidates receive no adjustment.
`learningConfidence` returns tried context/action samples divided by samples plus
eight, and zero for untried alternatives. Personality stays independent of this
confidence: a negative outcome cannot increase a score by weakening a style penalty.
Range and displacement miss explanations are predictions, never confirmed dodge
or armor causes. Observed counter contacts support interruption attribution.
Damage with visible armor and zero impulse is labeled `hit-armored-observed` and
still receives its damage reward. Zero-damage post-KO contact attempts are censored.
Grapples do not use attack serials; the interaction system's public
`grapple-teched`/`grapple-not-teched` resolution cause proves execution. A selected
grapple waits for that evidence for at most its delivery delay plus 180 frames,
then receives one throw or tech outcome. A throw retains the actual authored
17-frame release recovery window; a tech retains its 12-frame recovery window.
Failed windups without a public contact are censored: the current controller does
not feed the interaction trace that would distinguish a whiff or interruption.
This retains one bounded attribution slot rather than inventing missing outcomes;
later queued decisions may be censored, so the model deliberately samples fewer
attempts at low difficulty.

Every observed action/context estimate is retained across exploration, journals,
merge and reload. The authored action catalog and finite context vocabulary define
the useful parameter space; there is no FIFO limit on these learned parameters.
Diagnostic bounds are 16 habit rows, 64 traces, 64 recent contact IDs,
one pending attribution and one waiting attack intention. Old saves lacking
`next` restore it as null; it never contains an outcome before actual execution.
`validation.ts` rejects unknown fields, invalid
contexts, nonfinite values, duplicate identities and oversized collections, then
deep copies all state. Saving pending attribution and event IDs makes restored
continuation deterministic. `compactLearning(memory)` in `capture.ts` creates a
portable copy containing every effectiveness row, habit row, transient event ID,
pending attribution and queued intention. It retains only the audit traces needed
by pending/queued attribution, including their full legal alternatives and
probabilities. Completed audit history is diagnostic data: future scoring and
attribution never read it. The live `learning()` view and ordinary full captures
keep up to 64 traces; hosts can use compact captures for saves and frequent
snapshots without losing useful learned weights or deterministic continuation.
Filtering happens before cloning, so completed distributions are not repeatedly
copied. `capture.test.ts` covers full-versus-compact physical/action/model
continuation, queued handoff, independent copies and a two-controller Touch of
Death fixture under the declared 64 KiB save budget. This fixture does not claim a
universal byte bound for arbitrary authored move names and configurations.
The unchanged-neutral-state, 2,400-tick fixture with seeds 6/7 measured 82,761
bytes for combat plus two full controllers and 29,637 bytes with compact captures.
Each controller retained all three effectiveness rows and its habit row; 64
older diagnostic traces per controller were omitted. These are payload
measurements, not isolated wall-clock timing results. The reproduction and raw
evidence live in `.local/engine-perf/learning-capture/`.
Round and same-opponent game resets retain completed
evidence and censor the unknown remainder of pending attempts. Actual damage,
parry or block evidence from an executed partial attempt receives one quarter
sample confidence, labeled `partial-contact` on a censored trace. No-contact
unfinished attempts receive no miss or success reward; repeated boundaries cannot
credit the same attempt twice. Frozen/off/baseline evaluation boundaries set
`retainPartial: false`. Changing opponent identity clears both
effectiveness and habits; these estimates do not generalize across opponents.
Hosts replacing a policy while retaining the same fighter seat ID must explicitly
request `newOpponent: true` or supply a logical `opponentId` to observations;
a seat ID cannot identify an unseen policy change. Identity changes reset before
frame monotonicity checks, so a new opponent can begin at frame zero. Restored
same-opponent games call `resetLearning({round: true})` to retain completed evidence
and restart the committed observation clock. Frozen evaluation hosts omit update
and record calls while continuing to apply the pure `learningAdjustment` read.
Movement windows retain received-damage safety evidence and never receive positive
credit for a different action dealing damage. Completed zero-reward movement
windows can dilute an old negative estimate as actual safer attempts accumulate.
This policy does not promise an improvement after every game: informative games
can add evidence even when the newest sample has weak or negative value.

Deterministic legal confirm/cancel/finish decisions may supply singleton
`forced:<authoredMoveId>` traces with probability one. Their actually observed
effectiveness shares `attack:<authoredMoveId>` rows while the trace retains its
forced identity; weapon-derived executed move IDs retain their authored source.
No alternatives are fabricated for these deterministic decisions. Branches that
do not supply a decision remain outside contextual action credit. Later choices
overlapping the bounded pending/waiting
slots, no-contact reset fragments, capped active animations, and failed
grapple windups without a public resolution remain censored. These limits avoid
inventing an executed action, missing recovery outcome or causal attribution.

`learning.test.ts` verifies changed selection probabilities, weak single-hit
evidence, outcome reversal after strategy changes, attribution, censorship,
persistence continuation and bounds. Run from `packages/engine`:

```sh
bun test ./src/project/3d/combat-ai/learning/learning.test.ts
```

## Carry learning between training sets

The public `runtime-3d` entry exports `prepareCombatAiLearning`,
`mergeCombatAiLearning`, `readCombatAiLearningEvidence`, `combatAiLearningProbe`,
and their evidence/probe types. Hosts key models by actual opponent policy and
game content. `prepareCombatAiLearning({model, opponentId})` returns a detached
between-set model: actual partial contact evidence is retained once at quarter
confidence, pending/queued intentions are closed, and all transient clocks,
contact IDs and diagnostic traces are cleared. `opponentId` explicitly rebinds
a host-known identical policy to another physical seat; it does not prove that
two opponents are equivalent. Pass `newOpponent: true` to discard old evidence.
Frozen evaluations use `retainPartial: false`.

After restoring a trial's seed model, call
`game.startCombatAiLearningEvidence()` to collect a sidecar journal.
Ordinary play and checkpoint schemas are unchanged; learned parameters grow with
observed action/context combinations rather than losing old lessons.
The journal records only actual action/habit updates. Each row composes an affine
operation, `old * decay + fresh`, including fractional partial-contact samples.
New action updates use decay one; the version-one reader also accepts old decayed
action evidence so existing exports remain usable.
This permits independently seeded parallel trials to contribute fresh evidence
without adding the seeded prior again. Adding their final model totals would
double-count that prior and mishandle its decay.

`game.combatAiLearningEvidence()` returns detached per-seat journals.
`game.finishCombatAiLearningEvidence()` closes live attribution once and returns
`{learning, evidence}` seat tuples. Its model copies retain diagnostic traces for
outcome reports; prepare or merge them before durable storage. Repeated finish
calls add no second partial sample. Same-opponent round resets retain the journal;
opponent changes clear it. Restoring a checkpoint starts a fresh journal on the
new live model; journals are intentionally absent from saves. Baseline, disabled
adaptation and frozen evaluation never start journals or mutate learned estimates.

Use `mergeCombatAiLearning({baseline, opponentId, evidence: [{sequence, evidence}]})`
to apply fresh operations to the current bank. Batches sort by unique supplied
sequence and reject duplicates or opponent mismatches. Hosts own sequence
allocation, revision checks and duplicate suppression across separate merge calls.
They can commit each completed trial without waiting for other workers.
Action rows and action journal aggregates are never evicted. `omittedActions`
remains readable for old exports and is zero in new journals. Habit estimates and
journals retain their 16-row bound; `omittedHabits` reports discarded habit
aggregates. Habit recreation resets that row's operation with decay zero.
Numerical composition is
deterministic for the supplied sequence, with ordinary floating-point rounding.
No trial result is reconstructed by subtracting two already-decayed model totals.

Journals also retain at most four actual legal selector pools, captured after
host offsets and before learned adjustment. Their complete candidate metadata
includes style, priority, action flags and optional exploration probability. Pools larger than
64 alternatives are omitted, and `omittedProbes` counts both oversized pools and
older pools dropped from this bound. Deterministic forced commands create no
invented alternatives. `combatAiLearningProbe({before, after, probe})` replays
the same stable style score, bounded adjustment, priority, difficulty temperature
and exploration mixture as the live selector. It reports per-action probabilities
and their changes, or an explicit unavailable result for opponent mismatch.
The supplied pool is factual; comparing its probabilities never claims outcomes
for choices that were not tried. Hosts can explicitly prepare bank models with
the probe's physical identity after establishing the policy-key correspondence.

Optional `outcomes` journal rows retain exact fresh attribution-window counts for
readable tactical reports. `outcome-evidence.ts` freezes observed decision facts
until the corresponding action completes: target stamina and health bands use
the supplied authored maxima, while motion uses the opponent's own public radial
displacement. Missing maxima remain unknown. Near/far distance, grounded states,
and visible guarding/commitment/hitstun remain the existing context. Opponent
corner state is explicitly unknown: the controller's wall observation describes
our own contact and cannot establish that the target is cornered.

Complete, partial and censored counts are exclusive window counts, distinct from
the scoring model's weighted samples. Raw complete damage/reward totals exclude
partial windows. Partial totals retain actual contacts at quarter confidence,
with the remaining recovery outcome unknown; censored windows carry zero
confidence and no success or failure credit. These descriptive groups do not add
stamina, motion or health to the current scoring context. Hosts must not claim
that a report automatically teaches that finer conditional policy. A maximum of
64 groups is retained per trial; `omittedOutcomes` counts actual windows discarded
when groups are evicted. Legacy journals without these optional fields remain
readable. No inherited model totals enter these counts, and ordinary captures
and selection are unchanged. `outcome-evidence.test.ts` covers frozen facts,
delayed execution, actual outcomes, censorship, fresh counts and strict bounds.

`training.test.ts` covers clean boundaries, no repeated partial credit, fractional
and parallel merge composition, lossless action retention beyond 64 rows, bounded
diagnostics, legacy journals, cumulative samples, identity/reset rules, actual
combat contacts, probability changes from real learned evidence, both gameplay
seats and unchanged frozen/off/baseline behavior.
