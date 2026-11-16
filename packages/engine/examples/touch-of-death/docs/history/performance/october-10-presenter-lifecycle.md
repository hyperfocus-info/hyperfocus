# October 10: presenter continuity audit

**Finding:** combat tick and displacement are insufficient invalidation keys for
the directed presenter. A deterministic standard-game fixture reproduces stale
pose history after same-tick and forward restores. This is correctness evidence,
not a preparation optimization or a browser image acceptance result.

## Reproduction and results

The probe uses the existing editor integration fixture, real gameplay restore,
physics and `createDirectedFighterPresenter`. It advances an idle practice world
to ticks 20/30/40, primes presenter history with the actor facing the opposite
direction, then restores the real tick-30 checkpoint. Each result is compared
with a fresh presenter at that identical checkpoint.

| Restore | Actor rig records differing from fresh history | Explicit presenter recreation | Gameplay mutation |
| --- | ---: | --- | --- |
| Same combat/runtime tick: 30 → 30 | 72 | Exact | None |
| Forward: 20 → 30 | 72 | Exact | None |
| Backward: 40 → 30 | 0 | Exact | None |

Repeated presentation is exact within each branch. This fixture deliberately
changes facing before restore; it does not measure a natural-session failure
frequency. The initial probe omitted the facing vector's `y` field and restore
correctly rejected it; the completed probe preserves the full valid vector.

Run from the repository root:

```powershell
$env:PERF_ROOT='.local/engine-perf/presenter-lifecycle-20261010/retained'
bun.cmd spikes/persistent-world-worker/presentation/presenter-lifecycle.ts
```

The summary retains relevant source hashes; `presenter-lifecycle-samples.json`
retains warm/target gameplay snapshots and expected/retained/recreated rig poses.
Owner: this continuity investigation. Retain until the lifecycle fix is accepted.
The shared integration fixture's nine tests / 2,173 assertions and scoped
TypeScript checking pass. No production source or browser setting changed.

## Writers and missing boundaries

| Owner | State written | Current invalidation / gap |
| --- | --- | --- |
| Directed `present()` | Per-fighter locomotion cycle/speed/weight, action and hand history, transition pose/key, prior tick/position/yaw/health, cosmetic emitter events; evaluated rig, weapon, wardrobe, expression and particle records | New fighter, lower combat tick, horizontal displacement over 3 m, or KO clears fighter memory. Same/forward restores have no explicit epoch. Vertical teleports are not covered by this displacement test. |
| Directed `preview()` | Evaluated rig, flexible-part visibility, wardrobe, expressions, trails and cosmetic preview | Separate presentation writer; it does not reset gameplay presenter memory. Resource/membership bindings are fixed at construction. |
| Standalone photo restore | `gameplay.restore()` | Production source does not reset directed memory. Earlier private reset recipe covers only this path. |
| Standalone world authority / save load | Local restore/reset or ordered remote calls | Local authority has no presenter callback. Remote acknowledgement does not by itself invalidate the remote presenter's history. |
| Worker `world.command()` / local session | Restore/reset, review rewind/retry/watch/leave, saved-exchange load | Input mailbox revision and diagnostic discontinuity change; directed presenter memory does not. Review checkpoint closures restore gameplay internally. |
| Standalone replay / online lifecycle | Replaces gameplay owner, resets local game, restores checkpoints on failure/return | One directed presenter survives these changes. Tick rewind may incidentally reset it; continuity is not explicit. |
| Editor Play and ordinary gameplay actions | Practice/match actions advance or reset gameplay | Same persistent presenter reads resulting snapshots. Broader internal round/reset paths still need an engine-level lifecycle audit. |

The action controller and transition also retain tick-keyed samples. Cosmetic
events have their own tick/displacement heuristics. Resetting only one of those
histories cannot define a complete restore boundary. Existing frame preparation
order is gameplay presentation → appearance/motion → directed body/attachment,
wardrobe/expression/cosmetics → scene application → command compilation.

## First implementation requirement

The private `runtime-continuity.ts` prototype now observes successful runtime
restore and checkpoint-restore calls through a facade. The source runtime is
frozen; the initial attempt to replace its methods failed, so it remains untouched.
All experimental consumers use the facade, including gameplay construction.
This covers internal practice reset through `runtime.restore`, as well as host
restore and checkpoint closures. Multiple low-level restores may increment the
counter during one logical reset; it is not a simulation-tick counter.

An epoch-aware presenter recreates its complete history only when that counter
changes. All three restore cases above then match the cold reference exactly,
with one recreation each; repeated rendering adds none. Actual gameplay reset,
internal fighter-reset action and checkpoint restore also match. Rejected restore
preserves both state and epoch; three ordinary simulation steps preserve epoch.
Facade lifecycle tests cover frozen-source ownership, live getters, rejected
operations, checkpoint capture and observer disposal.

Real local review services add seven operation checks. Load, watch/retry rewinds
and leave change the epoch; ordinary playback and pause do not. Leaving restores
the original gameplay exactly. **Saving a review over-invalidates:** its two
temporary checkpoint restores increment the epoch twice although the final
gameplay hash is unchanged. State equality alone is not an invalidation rule.
The transaction prototype below addresses this case without comparing snapshots
to decide whether continuity changed.

Evidence for the initial epoch extension lives under
`.local/engine-perf/presenter-lifecycle-20261010/epoch-review-validated/`, using the
same command above with that root. It retains source hashes, real pose samples,
epoch counters and review operation hashes. Earlier `epoch` and `epoch-review`
results remain separate. Scoped TypeScript checking passes.

The subsequent `readRestoredState(game, read)` prototype captures a complete
gameplay checkpoint, defers epoch increments during an owned synchronous read,
and restores that checkpoint itself. Epoch access, nesting and disposal are
rejected during the transaction. A read failure still restores the checkpoint;
rollback failure invalidates once and propagates the original and rollback errors.
Promise results are rejected; callers must not start asynchronous work or perform
uncheckpointed resource changes. This is an internal experiment, not a general
transaction API or a guarantee against callers bypassing the facade.

The real review-save candidate leaves its epoch unchanged and returns the exact
same saved exchange and gameplay state as the control. A separate moving-fighter
case first establishes accumulated motion that differs from a cold presenter;
after a temporary restore transaction its rig records remain exact, with no
presenter recreation. Thus the result preserves real history rather than merely
recreating an equivalent idle pose. Raw states/poses and the eight review-operation
records are retained under
`.local/engine-perf/presenter-lifecycle-20261010/transaction/`.
Six lifecycle tests / 37 assertions and scoped TypeScript checking pass. The
additional checkpoint/copy cost is unmeasured and no production change is promoted.

Complete a successful-state-change continuity epoch, separate from input-clock
rebasing. Deliver it to the presenter and interpolation history before either
reads a restored state. Include snapshot and checkpoint restores, owner swaps,
explicit teleports and resource/topology replacement. Failed operations must not
claim successful replacement; the temporary transaction experiment still needs
efficient owner integration. Suspend/resume and a repeated render must preserve
continuous motion.
Do not invalidate on every `teleport` command: the play motor and knockout tracking
also use it for ordinary movement. Combat recovery without runtime restore,
source-runtime aliases, pre-existing checkpoint handles and resource replacement
remain outside this facade's coverage. A runtime counter also cannot by itself
prove completion of a larger gameplay transaction.

Acceptance must cover these three deterministic cases, hidden review checkpoint
paths, reset/owner changes, unchanged gameplay, and existing production-AA images.
Recreation is the cold reference here, not a proposed per-frame implementation.
The [submission investigation](october-10-submission-parity.md) still owns the
independent draw-order and residual-AA failures. No earlier failed optimization
is promoted by this lifecycle result; 165 Hz fresh gameplay remains unproven.
