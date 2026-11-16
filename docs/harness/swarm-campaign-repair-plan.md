# Swarm campaign repair plan

Status: repair implementation in progress; **remote acceptance remains unverified**.
Owner: Harness Swarm. Updated October 16, 2026 after the user's failed-run review.
This document owns the repair sequence and its acceptance gates; [Swarm contracts](swarm.md)
remain the current implementation reference. The [roadmap](todo.md) owns priority.

## Outcome contract

The user should describe an engineering outcome, launch it, disconnect their laptop,
and follow or steer useful remote work from their phone. Success is that complete
journey, not the presence of Railway workers or passing orchestration fixtures.

October 16 implementation checkpoint: adaptive rounds, task-scoped budget refusal,
compact evidence handoffs, source reuse, persistent control-service mode, conversation
UI, multi-device sessions and durable agent callbacks are implemented. The
[Swarm owner](swarm.md) describes the contracts. Local tests cover offline completion,
replay/acknowledgement, native MCP waits, independent early success, finalization
reserve, branch exhaustion and checkpoints. Persistent hosting was subsequently
authorized and deployed; campaign execution on that topology remains unverified.

October 17 connection repair: [shared Connections](connections.md) replaces the
SSH workaround with provider adapters, durable operations and scoped phone
authorization. Both native hosts expose it. The browser fixture passed with the
observer closed before simulated authorization, followed by automatic launch and
a retained agent callback. The persistent coordinator is deployed at
`https://hyperfocus-swarm-f4a2e84e-coordinator-production.up.railway.app`.
Its real official Codex device flow issued a code without SSH, and a real phone-size
browser resumed that same authorization after network loss. The live operation's
pending/running/action-required events were retrieved from the durable agent inbox.
The unauthorised attempt then expired at its 15-minute deadline and delivered
`operation.failed` to a server-held agent wait (`connections-agent-wait.json`).
The user subsequently completed the official sign-in. Operation
`2b4f06bf-3365-4f31-a501-bd4fb9483e67` succeeded; both the login and its callback
survived coordinator redeployment. The retained event replay kept the same IDs
(`connections-agent-resumed.json` and `connections-agent-replayed.json`). Actual
Codex inference through every configured subscription profile passed at 09:14 UTC
(`connections-inference-ready.json`), with API fallback disabled and no sandbox
created. The hour-long campaign remains a separate acceptance gate.
The final event-continuation deployment completed at 09:22 UTC with source
`8448b3c2e8e544e09f93208a1fc1302f238e51fa`; remote subscription readiness passed
again at 09:23 UTC (`connections-readiness-final.json`). Its progress-event
regression test proves that acknowledgement preserves the waiting subject across
restart until a terminal callback. Automatic approval review blocked manual
removal of two earlier disposable CLI-test directories under
`packages/ai-runtime/.local/account-tests`; the corrected live test removed its
own directory successfully.

Both native Connections entry points passed through managed Harness/Editor hosts
with simulated providers (`.local/swarm/campaign-repair/native-connections-ui/results.json`).
Real cloud browser evidence is separate (`remote-connections-ui/results.json` in
the same directory). The updated Swarm suite passed 300 tests, with one optional
Node fixture skipped; subsequent focused host/event tests and the opt-in official
CLI fresh-home test passed. Harness/shared-package typechecks and process policy
passed. A later Editor typecheck found unrelated audio-metadata incompatibilities
in `src/standalone/delivery.ts`; these are not hidden by the successful browser check.

A current 7,284-file source measurement retained
[raw timings](../../.local/swarm/campaign-repair/source-timing.json): cold capture
18.781s, acknowledged-revision capture 9.045s, 137,422,946 bundle bytes avoided.
The acknowledgement was a local fixture, with no network upload or cloud execution;
this does **not** meet the cold 15s ownership gate. Both end-to-end startup gates
and the laptop-off hour-long campaign remain delivery requirements.

User-confirmed requirements, October 16:

- An hour means an **adaptive campaign**: keep selecting useful investigations and
  improvements until the deadline approaches. Stop early for independently verified
  outcome success, a hard blocker (including a hard budget), or cancellation.
  Finishing an initial task list is not completion. Reserve time to verify and save.
- Both startup milestones matter: a cloud-owned run and phone-accessible link within
  **15 seconds**, and the first useful remote agent work within **30 seconds**.
  Measure from launch submission; a queued run or spawned process is not useful work.
- After source upload is durably acknowledged, the laptop may disconnect. No local
  inference, coordinator, browser experiment, or cleanup loop may be required.
- Default to a readable progress conversation: current activity, findings, decisions,
  uncertainty and requests. Detailed experiments, graphs, logs and artifacts are drill-downs.
- Keep the existing scope and financial boundaries: no separately billed inference,
  at most three investigation workers by default, exclusive measurement, and bounded
  cloud spend. The original $10 initial-experiment ceiling does not authorize an
  ongoing hosting commitment. The user subsequently authorized persistent hosting
  and usage measurement. Do not reset limits through campaign rounds.

Existing authorized official Codex sign-in belongs to the cloud coordinator.
Ephemeral workers should be temporary; the control service, authenticated access and
evidence should outlive workers and runs. The earlier temporary coordinator was a
bounded demonstration lifecycle, not a requirement of the desired product.

Acceptance uses external cloud receipts, independent correctness/measurement tools,
and the real laptop-off/phone journey. User review establishes visual usefulness;
screenshots and component tests alone do not. Deployment follows the user's later
explicit authorization; no SSH key registration was authorized or performed.

## What failed, with evidence

The primary remote run is `cd17ec69-1b2d-4b6c-96fc-32f9a5c0bb18`, demonstration
`a6c82d36-f9b2-4ed9-a571-ff4cccf5aa07`. Its [raw archive](../../.local/swarm/live-hosted/a6c82d36-f9b2-4ed9-a571-ff4cccf5aa07/run.json),
[verification](../../.local/swarm/live-hosted/a6c82d36-f9b2-4ed9-a571-ff4cccf5aa07/verification.json)
and [budget/artifact audit](../../.local/engine-perf/swarm-shape-20261016/cloud-audit.tmp.md)
support the findings below. All 24 retained artifacts were independently checked
against their recorded SHA256 and byte length during this review.

| Observed failure | Actual evidence and cause |
| --- | --- |
| Laptop remained necessary | Manifest topology is `laptop-coordinator-railway-workspaces`. `live/hosted.ts` starts the bridge, Codex coordinator and optional Harness monitor locally, owns their process lifetimes, polls the run and performs cleanup. Only repository execution was remote. |
| No usable phone link | The delivered monitor was `127.0.0.1:8788`; the additional performance page was a separate localhost sidecar on port 8806. Neither provides away access. A public site implementation exists, but this run did not exercise its cloud deployment. |
| Confusing progress | The retained [actual monitor screenshot](../../.local/engine-perf/swarm-shape-20261016/monitor.png) puts completion criteria and review disclosures before activity. `TaskReviewEvents` is a closed disclosure below tasks/candidates, showing raw messages and identifiers. The public site reuses this layout; changing only the URL will not fix observability. |
| Early remote stop | Remote execution ran 07:37:45.944–07:46:44.502 UTC: **8m59s**, ending `BLOCKED` at `MODEL_BUDGET_EXHAUSTED`. The requested subrun was 45 minutes, within a 50-minute deployment lifetime, inside the user's separate 60-minute window. These mismatched clocks did not cause this stop, but obscure the contract. |
| Very little completed investigation | One causal probe was reused for three experiment records. Three investigators started; two were cancelled and one failed admission. There were zero completed candidate implementations, independent candidate validations or paired comparisons. One interrupted patch capture timed out; its workspace cannot be claimed unchanged. |
| Slow useful start | Baseline took **67.656s**, then the planner took **211.946s**. First experiment began **283.073s** after run start; first implementation investigator **315.741s** after start. Serial source/preflight/monitor setup occurred before these clocks. |
| Token cost without clear diagnosis | 29 model calls reported **506,060 input/output tokens**. The reservation ledger held **651,059/750,000**. Admission reserves UTF-8 context bytes plus 36,000 per subscription call; the failed request size and exact limiting predicate were not recorded. Actual usage and reservations were different quantities, while the UI did not explain the difference. |
| No adaptive hour | `planSwarm` builds a finite baseline → plan → experiment/investigation/validation → benchmark/review graph. Follow-ups create another READY run requiring launch and fresh per-run inference accounting. Neither implements a single continuing campaign. |

The [Touch of Death shape audit](../../packages/engine/examples/touch-of-death/docs/touch-of-death-swarm-shape-audit.md)
records a **separate local** browser campaign: six ABBA contrasts, 24 timed trials,
and a summary at 08:25:45 UTC. That work continued after the remote stop. It neither
proves remote autonomy nor supplies missing cloud candidate results. Source revisions
and CPU/browser measurements must remain separate. The cloud compute estimate was
$0.375, not a provider-settled charge; separately billed inference was reported as $0.

## Preserve the working foundation

Reuse SQLite task claims/fences, durable artifact hashes, source isolation, the
Railway bridge, prepared-workspace/fork capabilities, official Codex runtime,
trusted recipes, deterministic validators, exclusive benchmarking, cleanup, and
the existing streaming/review contracts. No second coordinator or separate dashboard.

The cloud deployment path already separates coordinator and bridge, with persistent
storage and a static public Swarm site. Its default expiring demonstration lifecycle
and access policy need a product mode. Existing one-use phone bootstrap codes expire
after ten minutes; sessions default to one hour and require the trusted host for a
new link. That policy cannot support reliable later phone access with the laptop away.

Apply the [ambition article](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/)
to the repairs: **Altitude** is sustained pursuit of the user's outcome; **Depth**
is raw evidence and independent evaluators; **Range** is methods chosen because they
resolve distinct uncertainty; **Speed** is measured time to useful work and verified
result. Adding agents, prompts or experiment records does not establish any of these.

## Implementation sequence

### 1. Make cloud ownership and phone continuity real

Extend the existing deployment/service path and native launch clients. Keep
`live/hosted.ts` as a diagnostic harness, not the default user launch path.
Introduce a reusable cloud control-service lifecycle independent of short-lived
workers. Persist run state, artifacts, auth and session records in their existing
owners; worker cleanup must not delete the review surface or require a local parent.

Return an explicit source hash/receipt, cloud ownership acknowledgement, durable run
URL and effective deadline. Show setup/auth/capability blockers before accepting a
campaign; never silently switch to laptop execution. Retain the current official
Codex credential boundary and prohibit paid API fallback.

Extend scoped browser access to enroll the phone and support bounded, revocable
session renewal/reauthentication through the cloud. A stable URL is not a permanent
bearer credential. Separate enrollment codes from bookmarks; opening the laptop page
must not consume the phone's only access. Preserve CSRF protection and run/project
scope. Phone steering and cancellation stay remote; integration still verifies the
developer's current source and requires its existing approval boundary.

Owners: `apps/harness/scripts/swarm/{deploy,provision,site}.ts`,
`apps/harness/cli/src/swarm/{service,http,browser/*}.ts`, existing public-site host,
Harness launch path, and `apps/engine-editor/src/swarm/`.

Gate: accept a source, terminate the launcher and disconnect the laptop. On a phone
using another network, inspect evidence, send steering, observe its application and
cancel. A new remote task must actually start after disconnection. Reopen the same
run later without a running laptop. Restart the coordinator and prove recovery;
destroy all workers and prove retained artifacts remain readable.

### 2. Put a useful conversation on the first screen

Create a shared Swarm campaign presentation for the public page, Harness and Editor,
using `packages/ui` transcript/composer patterns and existing review details. Keep
the request form for launch and detailed review for inspection, not as the running
campaign's main screen. Keep credentials and persistence in hosts.

The first viewport should show:

- Goal, state, elapsed/remaining time, active work, and any action needed from the user.
- A chronological conversation of concise findings, decisions and experiment results,
  with readable worker responsibility and evidence links. Raw JSON/tool logs expand.
- A persistent composer for steering, acknowledgement that it was received, and a
  later event identifying which work applied it. Cancellation remains easy to reach.

Add durable typed lifecycle events at admission, tool start/end, findings, decisions,
budget gates and cleanup. Project these into readable text without an extra model
call for every progress update. Reuse sequence/reconnect streaming; distinguish live
work, waiting for inference, stale connection, and stalled work. Show waiting elapsed
time without inventing progress. Preserve scroll position and announce new activity
accessibly; do not expose hidden model reasoning.

Budget detail must distinguish reported use, pending reservations, unknown usage,
limits and estimates. Terminal states explain exactly what stopped, what was saved,
whether workers remain, and the next possible action.

Owners: `packages/ai-core/src/swarm/{contracts,stream,review-model}.ts`, coordinator
event writers, `packages/ui`, Harness `components/swarm/`, Editor `src/swarm/`.

Gate: a 390px phone viewport answers “what is happening, what was learned, do I need
to act?” without opening details. Exercise streaming, reconnect, steering and
cancellation against real cloud work. Obtain user review of the composition before
calling its quality accepted. Existing simulated public screenshots are not that proof.

### 3. Meet startup targets and make model work affordable

Instrument launch before any capture or preflight: source scan/upload/ack, admission,
public access, workspace readiness, inference start, first domain tool, baseline and
first finding. Record wall time, cache status, source size, context bytes, actual
tokens, call purpose and cost provenance. Report stage overlap rather than summing it.

The previous source bundle was **137,358,721 bytes across 7,256 files**. Reuse verified
remote source objects and prepared workspaces; upload changed content with integrity
checks instead of blindly rebuilding/uploading the entire snapshot. Cache keys must
cover source, lockfiles, runtime/toolchain and recipe/instrument versions. Existing
fork/checkpoint support is a starting point, not evidence that every install is cached.

Move service provisioning and device authentication into visible reusable setup.
Remove local monitor construction from launch's critical path. Begin a cheap trusted
domain probe and relevant source investigation immediately; run independent baseline
work concurrently where safe. Baseline correctness still gates candidate promotion;
measurement still owns its exclusive lane. A multi-minute planning call must not gate
all useful work. Record an initial bounded outcome contract, then refine from evidence.

Replace repeated large handoffs with a versioned task brief: outcome, invariant,
responsibility, source identity, evidence IDs, next action and remaining budget.
Give agents a small context index with paths for scoped guidance and instrument
details. Fetch relevant context on demand, cache shared guidance, and reuse compact
observations. Audit one-action-per-model-turn overhead before changing runtime
semantics; supported official Codex execution remains the inference path.

Make reservation rejection structured: dimension, task, requested reservation,
settled use, outstanding reservations, ceiling and remaining capacity. A per-worker
limit should checkpoint/stop that branch, not automatically abort every sibling.
Aggregate exhaustion remains a hard stop. Reserve resources for patch persistence,
independent validation and final reporting; an LLM-free report must remain possible.
Never fix efficiency by silently raising ceilings or understating unknown usage.

Owners: source capture/upload adapters, `apps/swarm-worker/src/service.ts`,
`outcome/planning.ts`, `reasoning/{reasoning,model-turn}.ts`, `store.ts`,
`coordinator.ts`, and the existing `packages/ai-runtime` Codex adapter.

Gate: both **15s cloud ownership/link** and **30s first useful remote work**, measured
from user launch on the configured service with representative current/changed source.
Test warm and cold workspace cases; disclose one-time provisioning separately and
report target misses honestly. Do not silently redefine success to exclude upload,
call “thinking” useful work, or claim performance from a tiny fixture. Compare prompt
volume, time and tokens for equivalent retained evidence before claiming savings.

### 4. Extend the existing scheduler into an adaptive campaign

Add campaign mode to the existing run contract. Preserve finite tournament mode for
bounded comparisons. One campaign owns the original outcome, start/deadline, total
compute/inference/iteration limits, evidence, steering and durable next-work queue.
Rounds append tasks to the existing DAG transactionally with unique IDs, leases and
idempotency; creating a round cannot reset accounting or the clock.

After each useful result, assess acceptance criteria and remaining uncertainty.
Choose the cheapest useful next investigation, implementation, replication or repair
using expected information gain, evidence dependencies and remaining resources.
Select only distinct executable methods; three workers is a ceiling, not a target.
Rejected hypotheses open alternative supported directions within the original scope.
Reusing one raw probe creates one observation with multiple interpretations, not
multiple independent experiments. Repetition requires an explicit replication purpose.

Keep implementation separate from independent validation. Benchmark only qualified
candidates; retain rejected work and limitations. A repair declares allowed files,
defect/cause, protected invariants and required revalidation. On repeated failure,
diagnose hypothesis/evidence/evaluator/requirement problems before allocating more work.

Estimate whether new work can finish and be verified before the deadline. Use a
visible finalization reserve; checkpoint instead of starting an unfinishable task.
No admissible useful work is a blocker with an exact explanation, not manufactured
outcome success. Early success requires evidence against the user's original criteria.

Owners: `packages/ai-core/src/swarm/{contracts,outcome,execution}.ts`, `plan.ts`,
`coordinator.ts`, `store.ts`, outcome planning/evaluation and existing recipe registry.

Gate: when the first hypotheses fail and time remains, the same campaign starts a
different justified investigation without human relaunch. Verify early outcome success,
hard budget stop, cancellation, bounded repairs, duplicate delivery, restart and stale
leases. All preserve the same campaign ledger and independently checked artifacts.

### 5. Prove the whole journey before another performance claim

First exercise a small real remote campaign through the complete phone journey.
Then run a full adaptive hour against Touch of Death's current immutable source,
with the laptop disconnected after acknowledgement. Record the two startup milestones,
event gaps, useful experiments, candidates, independent checks, elapsed time and
separate compute/inference/estimated costs. A terminal failed run is not acceptance.

Use the trusted CPU recipe for CPU claims. Displayed motion, GPU behavior and image
quality need a provisioned representative remote browser/GPU evaluator. If unavailable,
report that capability gap before accepting those outcome criteria; do not quietly
run the laptop renderer or treat Railway CPU measurements as display evidence.

Exercise failed sandbox creation, worker loss, artifact-upload failure, network loss,
coordinator restart, stale leases, duplicate delivery, conflicting patches, budget
exhaustion, cancellation, benchmark contention and noisy results. Use focused fixtures
for deterministic cases, plus real cloud disconnect/restart/cleanup receipts. Require
durable partial evidence and a cleanup inventory; tests alone are not live verification.

The first delivery milestone is **cloud launch → phone conversation → laptop off →
new remote work → phone steering → durable result**. Only then claim the longer
adaptive campaign is usable. Deployment should be a concrete reviewed candidate with
actual account/billing readiness and ongoing hosting cost separated from worker costs.

## Remaining uncertainty

The historical rejected model reservation is unrecoverable. New refusals preserve
their exact dimension and values. Adaptive scheduling and source reuse now have
executable coverage; cloud acceptance and the 15s/30s gates remain unproven.
The full native Harness/Editor fixture journeys passed, including independent
disposable Git checks, preserved developer edits and zero remaining verification
workspaces. The public session/download fixture also passed with no page errors.
See `.local/swarm/campaign-repair/{native-ui,public-ui}/results.json` and the
[phone composition](../../.local/swarm/campaign-repair/public-ui/conversation-narrow.png).
These are real browser interactions with simulated engineering workloads, not a
physical phone session or user acceptance of visual quality.

Persistent hosting was authorized after the initial read-only audit. Deployment
`f4a2e84e-1c6a-4fab-8bce-55554b06779a` retains the coordinator and private bridge,
dedicated volumes and initial worker admission ledger. No SSH key was registered.
The latest recorded two-service billing snapshot reports $0.013701 total usage,
with $16.093441 of shared included usage remaining; provider reporting lags.
See `.local/swarm/campaign-repair/connections-billing-final.json` for exact CPU,
memory, storage and egress line items.
No worker compute or separately billed inference was started for the Connections
repair; small official subscription inference probes ran on Railway after login.
Continued hosting is separately authorized and metered. Representative browser/GPU performance,
15s/30s startup and the laptop-off hour-long campaign remain delivery gates.
