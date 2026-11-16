# Hyperfocus performance evidence

Repository-only benchmark helpers shared by engine, application, and UI spikes.
`@hyperfocus/performance/browser-gpu-timer` provides bounded asynchronous WebGL2
timer queries for the standalone worker diagnostic and scene-ceiling probe.
Timers sharing a context propagate disjoint invalidation even when the underlying
GL flag has already been consumed by another timer. They still require sequential,
non-overlapping elapsed queries.
It imports no Node modules and performs no GPU wait or readback. Dispose it with
the owning canvas; unsupported contexts report `supported: false`. The root
entry retains machine/report helpers and is not a browser dependency.
Rows carry explicit GPU query status, including unresolved and invalid samples;
`statistics()` reports lifetime query counts, including warm-up. Never interpret
a missing GPU duration as zero. Tests use the timer's narrow WebGL operation
contract to verify unavailable-query handling and invalidation without a GPU wait.
`createPerformanceEvidenceReport` keeps portable structural facts separate from
calibration-only timing samples. `comparePerformanceEvidence` permits timing
comparison only when benchmark config and the complete machine/runtime context
match. `record-history.ts` rolls reports into a bounded 104-entry-per-benchmark
history and records whether each adjacent timing pair is actually comparable.
Report creation and comparison reject non-finite numbers, cycles and non-JSON
values rather than silently coercing failed measurements to null. Retention also
normalizes and trims imported groups when no new report is appended.

Set `HYPERFOCUS_BENCH_POWER_PROFILE`, `HYPERFOCUS_BENCH_THERMAL_STATE`,
`HYPERFOCUS_BENCH_CONTENTION`, `HYPERFOCUS_BENCH_DEVICE_PROFILE`, and
`HYPERFOCUS_BENCH_ACTIVE_AGENTS` when known. Unset conditions are recorded as
`unrecorded`, making cross-run timing comparison ineligible. Add freeform context
with `HYPERFOCUS_BENCH_NOTES`. CPU clocks and free memory are observations, not
portable gates.

Run `bun test packages/performance` from the repository root for report comparison
and bounded-history contracts. See [package testing](../../docs/package-testing.md)
for the repository-only coverage route.

`@hyperfocus/performance/swarm` supplies paired trial planning, exclusive-lane
callbacks and candidate comparison. The host provides a durable fenced lease;
the helper runs AB/BA pairs serially, aborts on lease loss and persists each
partial trial before advancing. Release waits for the aborted command to stop.
The default gate needs eight pairs across two sessions, no more than 5% control
spread, and a paired 95% log-ratio interval entirely above a 5% useful effect.
Inference uses trial medians, never individual frames as independent trials.
The workload hash includes warmup and sampling policy; observed elapsed duration
may differ for a fixed-operation workload. Latency comparisons require p95 in
every trial (at least 20 samples). p99 needs 100 samples; it may be omitted only
when unavailable in every trial. Once any trial supports p99, every baseline and
candidate trial must support it. Both percentiles enforce the tail allowance;
`tailEffect` retains p95 and `p99TailEffect` reports p99. Higher-is-better metrics
retain median qualification without imposing latency-tail requirements.
Correctness failures, tail regressions, mismatched context and duplicate
receipts prevent promotion. Overlapping candidate intervals require a direct
comparison; noisy evidence returns `INCONCLUSIVE — ENVIRONMENT NOISE`.
Shared cloud hardware remains shared: a measurement-worker lease excludes other
swarm work on that worker and does not establish exclusive physical CPU cores.

Latency allowances mean increases in elapsed time, not decreases in inverse
speedup. `pairedEffect` reports `baseline / candidate - 1` for latency;
`latencyRegressesBeyond` translates that effect for an allowance on
`candidate / baseline - 1`. Use it for tail and enclosing-duration guards rather
than comparing the speedup percentage directly with a negative allowance.

## Improvement loop

Use this procedure for a named consumer and operation. The
[Muratori research](../../docs/research/casey-muratori.md) explains the rationale;
the [audit](../../docs/audits/casey-muratori.md) records current findings. This
package owns evidence mechanics, not game quality, device policy or a second
optimization backlog. Keep each decision beside the owning workload's existing
plan. A rejected hypothesis is useful output when its cause and reopening trigger
are saved.

1. **Define the outcome.** Name the observable completion, representative input,
   correctness oracle and supported device/network conditions. Ask the user only
   for product decisions that code and existing evidence cannot answer. A mobile
   viewport does not establish performance on a phone; a fast-machine diagnostic
   does not set a universal budget. Include startup and interrupted-network cases
   when availability is part of the requested outcome.
2. **Account for the work.** Trace a real caller through its expensive boundaries.
   Record useful elements versus visited elements, copies/bytes, allocations,
   representation changes, queues and resource lifetimes. Identify the authority
   for each state value and who owns timing. Find existing counters and profilers
   with `inspect:impact` and the local README before adding instrumentation.
3. **Find the constraint.** Profile the representative operation and estimate the
   least work that could preserve its output. Use a direct kernel or controlled
   ablation to locate headroom, not to claim a production improvement. Minimum
   repetition time estimates favorable execution; median/tails describe the user
   workload. Nested CPU stages and overlapping CPU/GPU work are not additive.
   Repeat with observers disabled to expose their overhead.
4. **Change one demonstrated cause.** Prefer eliminating work or data movement
   before accelerating it. Derive a primitive from actual operations: a selective
   read, batch, caller-owned result or controlled borrowed view may fit. Preserve
   the convenient API over the same owner and specify identity, capacity,
   invalidation, cancellation and lifetime. Do not extract a generic framework
   solely for possible consumers. Include packing, scheduling, cleanup and the
   fallback in the cost of pooling, WASM, SIMD or workers.
5. **Qualify the real consumer.** Predeclare control/candidate, source/artifact
   hashes, correctness, primary metric, useful effect and resource/tail allowances.
   First check equivalent behavior; then run matched serial alternating trials.
   Reuse this package's reports and the workload's runner. Independent trials are
   the inference unit, not correlated frames from one run. Record cold and warm
   state, power, thermal state, contention and missing observations honestly.
6. **Promote or retain the negative result.** A kernel win needs a useful full-loop
   effect without unacceptable tails, memory, startup, network or quality loss.
   Higher-is-better comparisons do not automatically guard latency, and resource
   observations do not enforce budgets: supply explicit workload guards for both.
   Default-enable only after the owning acceptance checks pass. Record rejected
   candidates and the evidence required to reconsider them; remove abandoned
   machinery when it has no continuing experiment owner.
7. **Close the loop.** Promote a recurring correctness failure into its owning
   regression or deterministic lint rule. Save the accepted primitive contract
   once, migrate real consumers and select the next measured constraint. Compare
   time to a verified user outcome, not changes in LOC, test count or agent output.

The working question record can be this small:

```text
Outcome / owner / completion:
Device, browser, network, cold/warm state; unknown product decisions:
Representative workload and correctness/quality oracle:
Current call path, authority, useful vs visited work, bytes and lifetimes:
Evidence / source hashes / missing observations:
Hypothesis and smallest candidate; enclosing operation it must improve:
Primary metric, useful effect, tails and resource limits:
Existing instrument / serial trial plan / observer control:
Result and raw receipt / decision / next question or reopening trigger:
```

Answer fields from code before asking. If timing cannot be qualified, retain
structural findings and the missing measurement instead of manufacturing a win.
No static lint can establish cache locality, good abstraction or target-device
performance; lint should enforce an observable contract, not ban classes,
callbacks, allocations or long functions indiscriminately.
