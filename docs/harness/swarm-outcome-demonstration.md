# Outcome-driven Swarm demonstration — October 16, 2026

This record separates implemented behavior, deterministic verification, native UI
journeys and actual Railway execution. The current contracts and commands belong
to [Swarm engineering](swarm.md). No gameplay optimization or publication follows
from orchestration tests.

## Architecture delta

The existing Harness coordinator, SQLite store, official Codex adapter, Railway
bridge, source snapshots, candidate isolation and controlled benchmark runner were
extended. No second orchestration service or model provider was introduced.

New portable contracts represent outcome analysis, executable methods, hypotheses,
bounded experiments, attributed evaluations and scoped findings. The coordinator
now runs trusted probes before admitting implementations, shares their immutable
evidence, withholds contradicted or uncertain directions, and permits distinct
candidate strategies against one supported hypothesis. Failed correctness can
trigger a bounded repair with explicit cause, allowed files, protected assertions
and independent revalidation. Previous patches and failed command evidence remain
available without exposing competing candidates' private patches.

The repository audit distinguished functioning owners from the missing outcome path:

| Area | Present before this extension | Delta or remaining boundary |
| --- | --- | --- |
| Coordinator, jobs and scheduling | SQLite task DAG, bounded retries, leases/fences, source identity | Analysis/experiment/repair stages; global measurement admission; durable attempt failures |
| Model provider and authentication | Official Codex CLI adapter, subscription-only profile and quota admission | Honor task/run response deadline; retain failed output and retry context |
| Railway execution | Node SDK bridge, prepared immutable baseline, isolated forks | Idempotent concurrent create/fork recovery; bounded laptop-hosted execution driver |
| Messaging and context | Attributed messages, compact handoffs, incremental status streams | Shared experiment evidence and protected findings; candidate patches remain private |
| Benchmarking | Paired AB/BA trials, replication, distribution/tail/drift guards | Exclusive diagnostic profiling; no claim of dedicated physical CPU |
| Artifacts and persistence | Hash-addressed durable files/S3 and SQLite metadata | Structured experiment/evaluation receipts and retained raw profiles |
| Evaluation | Fresh correctness workspace, controlled comparison, model review | Task/outcome distinction and explicit trusted criterion binding |
| Security | Source capture exclusions, scoped auth, private credentials, patch policy | No new credential sharing; explicit archive mutation denial |
| Cancellation and budgets | Abort propagation, cleanup, orphan recovery, token/time/compute admission | Shared attempt ledger/expiry, failure diagnosis and finite repair loops |
| Harness and Editor | Real native request/review/control/integration paths | Shared outcome details and evidence-first review |

The missing path was primarily evidence-gated investigation before implementation,
followed by explicit outcome judgment. Generic multi-domain evaluators and a proven
live winning candidate were not found and are not implied by these changes.

## Altitude, depth and range

[Rieseberg's four dimensions](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/)
were applied as execution contracts: altitude separates the requested user outcome
from task completion; depth requires raw instruments; range assembles only available
methods; speed avoids unsupported work and redundant evidence acquisition.

The planner preserves exact completion criteria and source/scope/budget boundaries.
It records symptoms, assumptions and falsification, consequences, metrics and
missing evaluators. Trusted acceptance bindings are required for outcome success;
a model cannot certify display freshness from a CPU benchmark. Proposed contracts
are visible before launch; refined hypotheses follow the paid-compute baseline.

The executable registry currently covers causal runtime probes, sampled CPU
profiling, unchanged correctness fixtures and paired experimental comparison.
Each method names instruments, required evidence, responsibility, deliverables and
validation criteria. These are configured capabilities, not character personas.
Browser/GPU, animation and general UI-quality specialists are not registered as
available autonomous evaluators.

## Coordination and independent evaluation

Experiments retain objective, expected information, resources, deadline, cost,
predicates, raw artifacts, source, evaluator and limitations. Host fingerprints bind
the planned instrument and command identity. Missing observations, conflicting
predicates, failed transport or failed durable evidence upload yield uncertainty.
All selected probes finish before implementation. Reused raw evidence is explicitly
labelled reuse rather than replication.

Candidate implementation, validation and measurement use separate task identities
and workspaces. Trusted fixtures and the existing paired AB/BA runner judge results;
an additional model review cannot override them. Measurement admission quiesces
other Swarm tasks across runs, then holds an exclusive lane. Shared Railway physical
CPU variability remains a qualification concern.

Task success and demonstrated outcome success are persisted separately. Both
recommendation and approval reject unsupported outcomes. Findings remain scoped to
the run; existing project-memory integration retains a deduplicated disposition
summary without promoting observations into global instructions.

## Harness and Editor

Both real hosts use the shared outcome review composition: interpretation, methods,
hypotheses, experiments, evaluations, findings and decision. The existing request,
dependency graph, budget, cancellation, candidate comparison and approval paths
remain the owning workflow. Disclosure controls are keyboard accessible and retain
expansion through streamed refreshes.

The browser journey in `.local/swarm/outcome-ui/results.json` passed in both hosts:
Tab/Enter, real refresh, all three experiment verdicts, hash-verified artifact
inspection, intermediate/narrow layouts, 200% text, touch targets, disposable Git
approval/rejection/cancellation and dirty-work preservation. Its candidate workload
is explicitly **simulated**. It establishes UI behavior, not cloud or performance
results. T3 preview returned explicit unavailability; the owned headless browser
fallback recorded no visible windows or browser errors and cleaned up its hosts.

The final **actual Railway run** was then reopened in both native hosts from its
hash-verified SQLite archive, using the existing read routes without constructing
a coordinator or provider. Both displayed four methods and three experiments and
opened the actual raw probe and outcome-analysis artifacts. All 27 artifact hashes
passed; the archive remained unchanged. Browser and capture errors were empty,
25 observed process-tree entries had no visible windows, and both managed hosts
were stopped. Execution, approval and integration writes are denied in archive
mode. This proves durable review after sandbox destruction, not live failover.
The reusable CLI launched the real cloud demonstration; the native apps reviewed
its archive. Native launch and integration journeys used the labelled disposable
fixture, so a live cloud launch-to-approved-candidate browser journey remains open.

The final UI packet is
`.local/swarm/live-ui/ebf0b043-5d3c-4ed9-b196-01bfb34c7a4e/b9038333-a8a6-445d-85ff-f32de2072a23/50851274-0dec-4720-92cf-9fa48717c464/`.
It contains both hosts' experiment, evidence and decision screenshots plus the
verification receipt. The blocked checkpoint preserves pending judgments; no
approval or demonstrated outcome is implied. Planner limitations are historical
analysis text, distinct from later experiment receipts.

Reproduce the two native archive-review captures without cloud execution:

```text
bun apps/harness/scripts/swarm/live/review-archive.ts --verification .local/swarm/live-hosted/ebf0b043-5d3c-4ed9-b196-01bfb34c7a4e/attempt-3/verification.json --project-id touch-of-death --project-root .
```

The command owns and closes its managed hosts; its new screenshots and verification
receipt remain under the run's UI packet directory. The live launch procedure and
configuration remain in the [Swarm owner](swarm.md#commands-and-deployment).

## Local Touch of Death evidence

Current-source evidence is retained under
`.local/engine-perf/swarm-current-20261016/`, including source texts/hashes, three
serial baselines, CPU profiles, structural interventions and verification receipts.

| Observation | Result | Interpretation |
| --- | --- | --- |
| Producer presentation p95, three local baselines | 4.208 / 3.474 / 4.809 ms | Variable baseline, no candidate contrast |
| Total CPU p95 | 10.340 / 9.254 / 10.289 ms | Do not pool these with remote timing |
| Unchanged detached frame | 3,202 transform comparisons, zero writes | Repeated traversal exists |
| One changed input | 3,202 comparisons, one write | Work count alone does not prove timing benefit |
| External live-coordinate edit, unchanged producer | One repair write; state restored | Blanket unchanged-input skipping is invalid |
| Separate validated profiler instrument | 359 samples / 334 nodes / 2,803.620 ms attributed | Sampled CPU evidence, including startup/warmup |

The profiler reuses the existing analyzer and validates graph identities, cycles and
timings before reporting success. Its raw profile and workload output are retained;
profiled timing never participates in acceptance. Existing actor-slot/material-alias
optimizations were already present. No new default was changed merely to produce a
candidate. Current browser graph preflight passed, but representative browser/GPU,
display freshness and exact-image acceptance were not established by these probes.

## Railway and inference

Actual execution uses a laptop Bun coordinator and owned local Node bridge with
temporary Railway execution workspaces. Official locally authenticated Codex CLI
inference keeps the existing ChatGPT login local. No credentials are copied into
execution sandboxes and no paid API fallback is enabled. This topology needs the
laptop to remain running; it does not demonstrate a persistent cloud coordinator.
The [official authentication documentation](https://learn.chatgpt.com/docs/auth)
distinguishes ChatGPT subscription sign-in from usage-billed API-key access.

Live demonstration ID: `ebf0b043-5d3c-4ed9-b196-01bfb34c7a4e`.
Raw reports, billing snapshots, immutable bundles, archived SQLite and artifact
bytes are in `.local/swarm/live-hosted/ebf0b043-5d3c-4ed9-b196-01bfb34c7a4e/`.
The original shared ledger expires at `2026-10-16T08:33:53.367Z` and cannot exceed
$10 in admission reservations, including a $1 overhead reserve. Run ceilings are
$9 compute, $0 separately billed inference, three workers and one repair round.

The first actual provider probe passed ten checks, including duplicate create/fork
delivery, isolated files, command failure, timeout, cancellation and retained patch
bytes. Both probe sandboxes were provider-confirmed destroyed. The first actual
Touch of Death baseline passed 240 tests / 83,850 assertions and produced a
240-sample CPU receipt. Planning then hit a hidden two-minute model deadline twice.
The run retained its baseline and stopped without admitting any implementation.
Its three owned sandboxes, including the lifecycle probe, were cleaned up.

The observed failure produced three implementation fixes: model calls use the
remaining task/run deadline, retry errors remain durable, and failed outcome
analysis produces a deterministic blocked review without another model call.
The second attempt used that deadline successfully, but exposed a schema error:
the model correctly returned `evaluatorMethodId: null` for unsupported criteria,
while the contract required a string. Both bounded planner calls failed on the
same field. The fix represents unavailable evaluators explicitly, retains raw
planner responses before parsing, and includes failed-attempt feedback in retries.
A regression proves investigation proceeds while approval stays blocked.

The final repair-verification attempt shared the original ledger, request and
expiry. Three attempts were the hard ceiling; no fourth run was launched.
Earlier attempts and their cleanup/evidence remain separately inspectable.

### Final actual execution

Run `b9038333-a8a6-445d-85ff-f32de2072a23` used immutable source
`f0a6c2c2ff39695be8d9eb4b3429541f11b4762b`. Its baseline and outcome analysis
passed. The planner preserved missing evaluator bindings instead of pretending
that CPU evidence could prove displayed motion quality.

The final unprofiled baseline used Bun 1.4.3 on Linux x64, an AMD EPYC 9655P
reported by the runtime, and a requested 2 vCPU / 2 GB Railway allocation. It
retained 120 warmup frames and 240 measured frames. This allocation does not imply
dedicated physical cores.

| CPU stage | Median | p95 | p99 |
| --- | --- | --- | --- |
| Producer presentation | 5.937 ms | 13.622 ms | 25.385 ms |
| Total CPU preparation | 13.341 ms | 26.959 ms | 51.794 ms |
| Applying the prepared frame | 1.833 ms | 5.010 ms | 10.514 ms |

| Experiment | Actual observation | Decision |
| --- | --- | --- |
| Unchanged application | 3,202 comparisons, zero writes | Structural mechanism supported; CPU benefit unproven |
| External live-state intervention | One repair write, original state restored | Preserve live-state validation; constraint only |
| CPU profiling | 14,625 samples / 1,660 nodes; raw profile and workload retained | Attribution available; diagnostic only |

The first probe took 33,739 ms including workspace and execution overhead. The
second interpretation reused its hash-verified raw evidence in 12 ms, without
another workspace. This is measured evidence reuse, not independent replication
or a gameplay speedup. The separate exclusive profiler took 113,574 ms. The run
used one concurrent task at peak; three is a ceiling, not a measured parallel crew.

An independent review verified five primary artifact hashes and reproduced the
attribution summary exactly from the raw profile. Its 25.320-second sampled span
includes startup and warmup. Inclusive attribution included presentation 10.432 s,
obstruction work 4.709 s, frame sampling 4.143 s, snapshot work 3.638 s and frame
application 1.808 s. Inclusive stacks overlap and cannot be added as disjoint
costs. The profile and unprofiled cloud baseline retain matching structural output
and final-state hashes. The earlier Windows run has a different final-state hash,
so local and cloud timings cannot form a candidate comparison. The review receipt
is `.local/engine-perf/swarm-current-20261016/railway-final-review.json`.

The implementation investigation started, then stopped at the subscription gate:
"Codex subscription verification failed. No paid fallback or new sandbox execution
is allowed." No unfinished patch was present. A later read-only status check found
the existing Pro login available; it did not make another inference call. The
original catch discarded the error cause, so neither an expired login nor a
network failure is established. This observability defect was repaired afterward;
the new diagnosis path has focused tests, not a further live execution receipt.

Review also found that idle scheduler ticks called subscription admission even
when dependencies, worker capacity or the exclusive measurement lane prevented
dispatch. The store now shares eligibility checks between readiness and the actual
transactional claim. Idle ticks make no account checks; each newly eligible task
still requires fresh admission before reservations, and every model call keeps its
own admission gate. Tests exercise 25 idle ticks in each of four waiting cases
with zero additional checks, then verify refusal at the next eligible task. This
removes proven redundant calls in the deterministic test; it is not proof of the
original cloud failure's cause or a measured cloud latency improvement.

The archived run is `BLOCKED`; task and outcome judgments remain pending at that
checkpoint. It has no candidate validation, paired candidate comparison or winner.
No gameplay patch was applied. All 27 final-run artifacts passed hash readback,
including the 490,700-byte raw CPU profile. Serialized SQLite archive SHA-256 is
`9b29603a868bf9ed495efbf9a31de4f1e41ad6000d5a497422733d24d0f0db9d`.
All eight sandboxes admitted across the provider checks and three attempts were
destroyed; the final registry was empty and both owned host processes exited zero
at 07:04:10 UTC. Durable evidence survived their destruction.

### Cost evidence

| Category | Observation | Limit of interpretation |
| --- | --- | --- |
| Separately billed inference | $0; subscription-only official CLI, no API fallback | Runtime cost fields are not a provider invoice |
| Final-run model usage | Five calls; 65,168 input + 6,333 output tokens reported | Earlier attempts and timed-out calls are separate; incomplete calls can lack usage |
| Three-attempt reported usage | Ten admitted calls; 111,266 input + 16,379 output tokens | Excludes unreported interrupted usage and readiness probes; not complete account consumption |
| Final-run compute estimate | $0.351852 | Coordinator admission estimate, not settled charges |
| Shared compute reservations | $3.407407 including $1 overhead reserve | All eight admissions; conservative 65-minute CPU/RAM allocations, not measured spend |
| Railway workspace usage delta | $0.035145 from 06:33:58 to 07:04:14 UTC | Shared account, delayed billing; cannot attribute this entirely to the run |
| Included Railway usage remaining | $16.410634 at the final observation | Pro's $20 included usage; other applications also consume it |

Settled, run-attributed compute charges remain unavailable. The $10 ceiling is
enforced by Swarm admission reservations; provider egress has no independent hard
cap. Workspace-wide limits and existing applications were not changed. Exact
time-to-verified-improvement and candidate speedup are unavailable because the
candidate stage did not complete.

## Failure coverage and limits

Deterministic tests cover worker failure, restart/reopen, cancellation, budgets,
stale fences, failed preparation, duplicate delivery, conflicting/source-mismatched
patches, benchmark contention/noise and artifact integrity. Added injected transport
and artifact-upload failures retain uncertainty, preserve baseline evidence and
clean up without implementation. These injected failures are not live Railway
network-fault or coordinator-failover demonstrations.

The final full Swarm test report records 199 passed, zero failed and 1,302 assertions
after the timeout, nullable-evaluator, archive, admission and diagnostic repairs.
Raw output is `.local/swarm/outcome-final-tests.log`; PowerShell's redirected
stderr capture returned status 1 despite Bun's zero-failure test report. The final
direct focused readiness/store/control/diagnostic invocation passed 50 tests / 257
assertions. Native archive and
shared review checks passed 46 tests / 432 assertions (some contract coverage
overlaps the Swarm suite). Harness and Editor typechecks, the Harness production
build, scoped lint and process policy passed. Repository-wide style/structure
checks still fail on pre-existing engine/editor/spike debt. No baseline exception
was increased for this work.

The demonstrated architecture is a bounded vertical slice, not a general engineering
organization for arbitrary goals. Trusted instruments and acceptance bindings must
exist for a domain. Representative browser/GPU evaluation, a successful live
candidate tournament, persistent cloud hosting and live coordinator failover remain
separate acceptance boundaries until their receipts establish otherwise.
