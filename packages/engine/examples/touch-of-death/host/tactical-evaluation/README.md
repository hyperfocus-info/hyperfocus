# Tactical AI evaluation

Run from the repository root. `build.ts` freezes the existing controller into
`.local/touch-of-death/tactical-evaluation/baseline/controller.js` once. Preserve
that directory before changing engine behavior. It contains the original
controller and its dependencies, separate from later edits. It is local evidence,
not a distributable AI checkpoint. Reusing another checkout's baseline requires
explicitly supplying the matching original source and combat rules.

```powershell
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/build.ts
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject baseline --opponent baseline --pairs 8
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject default --opponent baseline --pairs 32
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject adaptive --opponent baseline --pairs 16
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject no-adaptation --opponent baseline --pairs 16
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject no-compression --opponent baseline --pairs 16
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject adaptive --opponent guard --pairs 16
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject adaptive --opponent held-out --pairs 16
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/run.ts --subject adaptive --opponent baseline --pairs 8 --project .local/touch-of-death/project
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/session.ts --session-seconds 900
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/session.ts --session-seconds 900 --adaptation off
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/session.ts --session-seconds 900 --compression off
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/session.ts --wall-seconds 900 --out .local/touch-of-death/tactical-evaluation/session-15min-wall.json
```

`--subject current` runs the edited controller in its baseline mode.
`--subject default` omits the mode override and exercises the actual current
default, including its contextual adaptation. `adaptive` selects that mode
explicitly. `baseline` uses the first frozen controller with explicit baseline
tuning and is unaffected by current default changes.

Opponents
`rush`, `guard`, and `keepaway` override neutral actions with simple scripts;
committed moves and stun retain the original safety responses. Their behavior
is deliberately disclosed so a gain against a weak script is not confused with
general strength. `held-out` is a fixed space/heavy policy that does not train.
Use other seeds with `--seed` for independent checks. Each seed runs both seats.
Default warmup is one pair, excluded from results. `--cap` limits each set in
ticks; capped sets are reported separately and never scored as draws.

The normal-health arena runs actual `gameplay.advance`, combat inputs, movement,
rigid physics, round interludes and first-to-three sets. It omits city geometry,
weapons and hazards. `--project` loads the real portable project and asset archive
to cover those paths. An evaluation-only Bun bundler shim injects the frozen and
current controllers per seat. No production factory injection API is added.
The arena has a finite 100-by-100 floor and no out-of-bounds damage or reset.
Terminal snapshots showed every capped keepaway set left this floor and fell
indefinitely with living fighters. Higher completion against that script measures
avoidance of this fixture failure; it does not establish better fighting strength.

JSON records seeds, seats, outcomes, hardware, Bun version, request, stage timings,
damage, punish contacts, requested actions and damaging moves. Render cost is zero
in this headless lane; no browser or network cost is estimated. Brain time and
outcome observation time are included inside gameplay wall time. The remaining
wall time includes engine physics, motion, interaction, match handling, audio drain
and host metadata reads, and is not mislabeled pure combat simulation. Stage
timers have overhead; compare serial warmed A/B/B/A runs for performance claims.
`--contention-note <text>` records concurrent work; contended runs are correctness
and outcome evidence only, never isolated performance measurements.
Only the edited instrumented controller produces stage timings.
Full scoring frequency counts selector calls, once per complete candidate pool.
Candidate and scoring timer calls are interleaved per move and do not count decisions.

The session command runs 900 **simulated** seconds, accumulating learned evidence
across completed sets through strict restore while resetting transient attribution.
One opponent changes from rush to guard halfway through. Five-second samples
include observed habit estimates and a fixed equal-prior probability probe using
the executed adjustment and selection functions. The probe isolates learning's
effect while holding context and candidate scores constant. It is hypothetical
legal neutral state, and does not claim outcomes for untried actions. JSON retains
the useful model and its bounded decision traces. `run.ts --learning <session.json>`
freezes updates during evaluation; changing fighter/opponent identity resets its
opponent-conditioned evidence. Ordinary evaluations start with fresh learning.
`--wall-seconds 900` instead trains for fifteen actual minutes and switches the
same opponent at 450 wall seconds. Five-second wall samples and sparse thirty-second
progress keep logging bounded. Both clocks are reported. The final unfinished set
is partial, excluded from win rates, and distinct from an evaluation tick cap.
Sessions cap each set at 12000 ticks (200 simulated seconds); `--cap` changes this.
Capped sets preserve settled learning and reset transient attribution for the next
set. They count separately, with terminal positions and combat state recorded for
stall diagnosis. A frozen earlier wall session without this cap stalled after 656
completed sets, so its late period is not evidence of continued useful training.
JSON SHA-256 identifiers refer to the frozen baseline controller and the exact
bundled evaluation engine; local checkpoint files preserve each evaluated engine.
Supply `--checkpoint <checkpoint.js>` to either command to replay that exact
engine after later source edits. Evidence records its digest and baseline digest.

Punish rate is the share of damaging contacts whose target was in visible move
recovery at the preceding AI observation. This conservative operational definition
does not imply a guaranteed punish. Request entropy includes repeated movement
and guards; damaging move diversity is separately reported.
The diversity count uses damage-attribution keys. City interactions can report
an empty move ID, which contributes one unnamed damage category; inspect
`hitsByMove` before treating this count as distinct authored attacks.
Win-rate intervals use Wilson's binomial interval for descriptive reporting, with seed/seat pairs
correlated; they are not a promotion gate or proof against skilled humans.
Damage differential is total resolved damage dealt minus taken over the reported
sets, including chip and guard breaks; divide by attempted sets for a per-set mean.
`report.ts <artifact.json>` recomputes summaries from raw trials, including the
correct selector-based full scoring count, without changing seeds or outcomes.
`report.ts --first 16 <artifact.json>` prints a matched prefix without rewriting
the artifact. `style-probe.ts` prints actual controller legal distributions with
one personality preference changed and all other state and traits held fixed.
Pass `--out <artifact.json>` to retain these probes and their source hashes.

`freeze-previous.ts` can rebuild the prior adaptive factory from the retained
`.local/touch-of-death/tactical-evaluation/pre-default-adaptive` entry/subtree.
It rejects a changed entry or an existing freeze. `previous-adaptive` then uses
that factory in the same current engine/physics as the subject. Before using it
as a comparator, replay paired seeds against the prior complete engine checkpoint
and run `replay-parity.ts <prior.json> <rebuilt.json>` to compare winners, ticks,
both-seat actions, contacts, observations and decision counts. This check excludes
timings and does not claim every-frame engine checkpoint parity. No previous
factory is fabricated when retained source is unavailable.

`session.ts --mode default` similarly leaves the controller mode unspecified;
the default session CLI mode remains explicit `adaptive` for historical replay.

Run metric regressions with:

```powershell
bun.cmd test packages/engine/examples/touch-of-death/host/tactical-evaluation
```

## City physics experiments

`city-freeze.ts` preserves an immutable bundled dependency graph and selected
source leaves. Labels cannot be overwritten. Pin the control manifest and expose
only the changed leaves with `--live`; other retained leaves come from control
even while AI defaults or host code are edited. Add new dependencies with
`--extra-sources`. Both benchmark seats use the original frozen controller in
explicit baseline mode, so style/default changes cannot confound physical results.

```powershell
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/city-freeze.ts --label control
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/city-freeze.ts --label candidate --pin .local/engine-perf/tod-city-source/control.json --live packages/engine/src/physics/rigid-3d-api.ts
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/city-benchmark.ts --control .local/engine-perf/tod-city-source/control.json --candidate .local/engine-perf/tod-city-source/candidate.json
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/city-traffic-parity.ts --control .local/engine-perf/tod-city-source/control.json --candidate .local/engine-perf/tod-city-source/candidate.json
```

The default isolated order is ABBAABBA, with 200 warmup and 1200 measured city
ticks per trial. Bundle hashes are verified and identical bundles are rejected.
Every 120 ticks, canonical object keys, ordered arrays, signed zero, physics
typed-array bytes, emitted audio and outcome reports must match. The first A/B
trials also rewind and replay exactly. Stop at the first difference; rejected
candidates provide correctness evidence without a qualified speed claim.
Checkpoint construction/comparison is excluded from wall timings; CPU totals
include that evidence work. Rendering is zero. Run serially with other builds,
tests and profiling paused and record any contention explicitly.

CCD culling may explicitly use `--allow-work-counters ccdAngularTests`. This one
counter reports discarded angular samples; a source audit found no policy or
budget consumer. Raw checkpoint hashes and counter values remain in each report.
All other diagnostics, CCD test budgets, body/contact/constraint bytes, save,
audio and outcomes stay exact. Restore/replay compares raw physics hashes even
with this exception. No other counter name is accepted.

The untimed traffic lane checks every frame: a vehicle initially 120 units away
continues moving into the fighter lane and causes a real hit; a struck vehicle
remains a solid wreck and approaching traffic stops behind it. Trusted rewinds
replay both scenarios exactly. This proves those declared scenarios, not arbitrary
rendering-driven sleep/wake behavior. Neither optimization freezes distant traffic
or items. The original CCD cull was rejected after tiny angular velocity changes;
its checkpoint remains retained separately from the corrected candidate.
The traffic lane also crosses with the car rotated 45 degrees. It uses real
40 m/s authored motion and ordinary player movement to clear the wreck lane.
Trusted replay is covered; portable restore of an injected old brain can be
incompatible with the current expanded AI save validator and is not claimed here.

`city-profile.ts` runs one frozen headless city for diagnostic Bun sampling:

```powershell
bun.cmd --cpu-prof --cpu-prof-dir .local/engine-perf/tod-city-source packages/engine/examples/touch-of-death/host/tactical-evaluation/city-profile.ts --manifest .local/engine-perf/tod-city-source/candidate.json
bun.cmd packages/engine/examples/touch-of-death/host/tactical-evaluation/profile-report.ts <profile.cpuprofile>
```

Sampling includes initialization and warmup. Function locations combine repeated
call stacks; inclusive costs overlap their children and must not be summed as
exclusive stage timings. No production profiling API or renderer is introduced.

`city/summary.ts <report.json>... --out <summary.json>` reports aggregate wall
time and the median of each variant's four per-run p95/p99 values. Its five-percent
wall flag is one metric; promotion also requires reviewing tail latency and exact
parity. It never promotes a candidate automatically. Route candidates use a fresh
control directory and pin `combat-environment/obstacle-route.ts`; benchmark them
individually before combining. Preserve repeats separately when initial gains
are borderline. The scratch/envelope route experiments passed correctness but
did not meet the measured promotion target; their snapshots remain local evidence.
Their primary target was at least five percent lower median p95 across isolated
ABBAABBA trials, alongside exact parity and review of p99 regressions. A wall-time
gain or p99 gain alone did not qualify either change.
