# Swarm engineering runs

Harness owns durable swarm coordination; Editor and Harness remain authenticated
clients of that authority. Portable contracts live in `@hyperfocus/ai-core/swarm`;
privileged execution and artifact adapters live in `@hyperfocus/ai-runtime/swarm`.
The existing AI runtime supplies model discovery, credentials and inference. Roles
and bounded remote tools specialize it without introducing another model provider.

The Railway bridge runs the official SDK on Node 24.22.0. The Bun coordinator owns
Codex subscription authentication; only the bridge holds Railway credentials. Repository commands
run in temporary isolated sandboxes with neither credential. Investigation forks
and the exclusive benchmark workspace are separate. Railway does not promise
exclusive physical cores; comparison must qualify noise before recommending work.

Authoritative coordination uses Harness's existing SQLite storage technology on a
durable volume, with transactional task claims and fencing. One coordinator replica
is supported. Artifacts use content-addressed files or a private S3-compatible
Railway bucket. Sandbox disks are never the durable artifact owner. JSON is the
bounded metadata baseline; no codec migration has been justified by measurements.

Existing boundaries inspected before implementation: Harness's run budgets, Pi
agents, background leases, project notes, loopback admission and SQLite repository;
Editor's embedded AI/task panel and same-origin admission; shared desktop process
ownership; `@hyperfocus/performance` environment qualification; Touch of Death's
deterministic tests and Editor performance-lab runners. Existing gameplay and
benchmark implementations stay with their current owners.

The [first live demonstration](swarm-live-demonstration.md) verified remote Codex
subscription inference, Railway sandbox execution, a fresh game baseline and
three isolated investigations through the native apps. All three hypotheses were
rejected without patches. Competing implementations and paired performance trials
remain unverified in a real tournament; no improvement is claimed.

The [outcome-driven demonstration](swarm-outcome-demonstration.md) records the newer
method registry, experiments, bounded repairs, native outcome review, and separate
local and Railway evidence. Its acceptance record supersedes earlier counts below.

Project capabilities expose the trusted `executionKind`, available investigation
claims and promotion limits. Set `executionKind: "engineering"` for verification,
repair and audit requests, or `"performance"` for a controlled performance study.
The launch command checks an explicit kind before capturing or uploading source;
the coordinator also checks it before planning. A request cannot override its
project's trusted recipe. Older callers may omit the field, retaining the selected
project's behavior; an older host that omits capability kinds cannot preflight an
explicit-kind request.

`touch-of-death` remains the CPU preparation study. `touch-of-death-lab` is an
opt-in engineering project for portable material/configuration/oracle and saved-run
checks, with engine declarations and browser types prepared. The service must
explicitly allow that project before use. Those checks do not establish rendered
image repeatability or GPU performance; browser evidence remains a separate
requirement. Generic repository work uses an authorized engineering project.

The [campaign repair plan](swarm-campaign-repair-plan.md) audits the October 16 shape
run and owns the user's clarified phone access, adaptive-hour and startup requirements.
The implementation and remaining delivery gates are recorded there. Campaign and
agent-event fixtures do not establish laptop-off cloud acceptance or startup SLOs.

## Campaign ownership and agent continuation

`bun run swarm launch --file request.json --root . --agent <thread-id>` captures
current source, reuses an acknowledged immutable revision when possible, issues
phone access, starts a cloud-owned campaign and returns. It starts no local
coordinator, monitor or cleanup loop. A failed phone-link request leaves a READY
run. Remote campaign admission rejects a laptop coordinator and paid inference.
The receipt includes the cloud run, deadline, event recipient and startup stages.

`executionMode: campaign` appends bounded investigation rounds to the existing
DAG. They share the initial clock, source, budgets, baseline and evidence. Failed
hypotheses inform the next selection; repeating a contradicted probe on the same
source is rejected. Independent outcome success stops early for review. Exhausted
iterations, instruments or resources retain an explicit blocker. Finalization
reserves protect independent review and checkpoint capture. `bounded` retains
the existing finite comparison workflow.

Native agent events use `@hyperfocus/ai-core/agent-events` contracts and a host-owned
SQLite inbox from `@hyperfocus/ai-runtime/agent-events`. Swarm persists result-ready,
terminal and blocked events in the run transaction. Delivery is at least once;
an agent acknowledges only after storing the event in durable context. Closing a
connection cancels its wait, never the cloud run or subscription. Immutable IDs
make replay identifiable; artifacts remain authorized, hash-checked downloads.

`swarm continue --project <id> --agent <thread-id>` retrieves the inbox once.
`swarm wait` with the same arguments awaits one server-held callback for up to
55 seconds. Neither polls run state or starts work. `swarm acknowledge` adds
`--event <id>` after incorporation. Harness's **continue/resume** chat path retrieves
events for that thread before inference and acknowledges after persisting its run
prompt. Its Codex SDK adapter configures official HTTP MCP tools
`agent_events_resume`, `agent_events_wait`, and `agent_events_acknowledge` at
`/api/agent-events/v1/mcp` (the earlier Swarm route remains compatible); the host supplies its credential through an
environment variable, never the model prompt. This uses Codex's
[supported MCP configuration](https://developers.openai.com/codex/mcp).
External agent hosts must connect this endpoint or consume the client callback;
Swarm cannot wake a disconnected third-party application itself.

Persistent hosting is a separate deployment mode: `swarm:deploy --provision
--service --allow-provision --allow-persistent-hosting`. It retains the coordinator,
official Codex login and bridge volumes across campaigns. Workers still expire and
are cleaned automatically; their cumulative admission ledger remains bounded across
restarts. Hosting costs continue independently of worker limits, requiring explicit
authorization. No Railway workspace-wide usage limit is changed.

## Access and retention handoff

Return the verified run URL as soon as launch succeeds, repeat it with material
progress updates and in the final answer, and link the current viewable artifact
when one exists. Identify its version/configuration and whether the link is a
cloud run page, artifact download or workstation-only preview. State access expiry
and any availability limitation; a filesystem path alone is not the URL handoff.
An unavailable link is an explicit blocker, never an invented address.

Preserve immutable artifacts and partial evidence before workers stop. Reuse the
existing coordinator/storage and issue fresh authorized view links when sessions
expire; do not keep benchmark sandboxes or agents running just to serve results.
Persistent hosting must stay within existing authorization and cost limits.
Stopping compute and expiring access do not themselves authorize artifact deletion.
Existing authenticated download and HTML sandbox policies remain in force.

For an explicitly local Touch of Death lab run, use its
[saved-run sharing command](../../spikes/persistent-world-worker/lab/README.md#saved-native-runs).
Saved bytes survive browser/worker shutdown; the managed local server can restart
without rerunning measurements. Such a link requires that workstation and server
to be running and must not be described as phone-accessible cloud hosting.

The final handoff also distinguishes production changes from experimental patches,
names failed promotion gates, and gives the next implementation/test decision.

## Use from the apps

Harness's thread header and Editor's project-assistant composer offer **Run with
Swarm**. The dialog captures a goal, source, strategy, concurrency, time, compute
and model limits. It prepares a reviewable plan, launches, displays dependencies
and attributed workers, inspects messages and immutable artifacts, compares
candidates, cancels, rejects, and approves verified patches after inspection.
Missing configuration is an explicit unavailable state. [Connections](connections.md)
supports official remote authorization and a durable launch wait before workers
or the execution clock start. Both native dialogs expose **Manage remote connections**.

The native entry points retain the latest phase and task counts while the review
dialog is closed. **Cloud link** issues view or control access to the selected run.
`bun run swarm site --public --run <id> [--access control]` provides the same path
for skill invocation. The coordinator serves the compact static `/swarm` site, so
an issued link needs no running development workstation or additional service.
Public hosting is implemented and locally browser-verified; the completed cloud
demonstration predates it. A new authorized deployment is needed to publish it.

Links exchange a one-use fragment code for an HttpOnly session and remove the code
from the address. Access is scoped to the run and same-source follow-ups, expires
after seven days by default (maximum 30 days), and is revocable. Control permits steering, queueing,
launch, cancellation and rejection. **Connect another device** pairs another browser
with the same grant and expiry; it does not extend authority. Source upload and
integration stay in the trusted host. Follow-ups inherit the source, model mode and
ceilings; a public page cannot upload a different repository from the laptop.
`bun run swarm site --project <id> [--run <id>]` remains the managed local setup
page. Opening either page starts no workload. The shared conversation puts phase,
elapsed/remaining time, findings and steering before expandable evidence and task
details. Artifact lists and previews offer verified downloads, including text/patches.

Both interfaces and CLI requests accept `mode` (`auto`, `value`,
`max-intelligence`), difficulty, explicit `doneCriteria`, concurrency and ceilings.
The trusted planner refines hypotheses from the fresh baseline. Auto mode resolves
bounded implementation to GPT-6.1 Sol high and complex work to GPT-6 Astra x-high;
planning and independent review use Astra x-high. Value keeps Sol implementation;
maximum intelligence uses Astra throughout. Profiles are host configuration,
verified by subscription calls before compute admission, with no silent fallback.
The actual remote subscription accepted both requested model/effort pairs.

The independent reviewer checks every exact completion criterion against retained
artifact IDs. An honest rejected hypothesis can complete an investigation;
accepting a patch still requires its recipe's deterministic correctness and
evidence gates; performance recipes additionally require their performance gate.
Steering is bounded, attributable and consumed on the next reasoning turn. It
cannot change source, authorization or budgets. Follow-up work creates a linked
READY plan on the same immutable source and inherited ceilings, requiring launch.
It retrieves compact parent findings without copying a full conversation.
These inference ceilings apply per run; a separately launched follow-up starts its
own accounting. The deployment's compute reservation and absolute expiry remain
shared across runs. A control link is not an aggregate subscription allowance.

Editor tasks target its configured development repository, not unsaved portable
scene edits. Harness uses its registered project root. `SWARM_PROJECT_IDS` must
authorize these host project IDs. Other projects supply trusted recipes through
`SWARM_RECIPES_FILE`; browser requests cannot supply validation/benchmark commands.

The host uploads non-ignored working files in an immutable Git bundle using a
separate index and temporary ref. Original HEAD, index and files are retained.
Known credential paths and escaping symlinks fail closed. Limits are 256 MiB
compressed and 512 MiB before packing. Ignored/generated assets are not implicitly
included. A changing source must be recaptured.

## Durable orchestration

### Outcome analysis and experiments

Trusted recipes select `executionKind: engineering` for bulk implementation,
tests, builds and user audits. The planner derives work from the requested goal;
this lane has no CPU hypothesis or timing task. Recipe commands run against the
immutable baseline and each independently reconstructed candidate. A failing
baseline records a repair target instead of preventing investigation. Declared
`artifactPaths` retain reports and captures individually, including partial failure
evidence; missing required artifacts fail candidate verification.

Engineering candidates receive `VERIFIED` only after independent correctness and
review of every explicit completion criterion. A passing command does not prove
untested behavior or human taste approval. Artifact-only investigations may finish
without patches. Campaign rounds share the existing source, deadline and budgets;
patches remain alternatives requiring human integration. Performance recipes retain
their executable instruments, paired comparisons and `IMPROVED` gate by default.
The [tutorial recipe](../../packages/engine/examples/touch-of-death/src/swarm/tutorial-recipe.ts)
is the first engineering consumer. Real deployment/browser evidence is separate
from the deterministic orchestration fixtures.

The registered repository/Editor host IDs use the generic engineering recipe and
`bun run check`; `touch-of-death` retains the performance recipe. Workers can
explicitly capture bounded generated reports, images, video and other files before
cleanup. This does not add accounts, GPUs, physical input hardware, publication or
unlimited execution: project scope, patch protections, provider capabilities and
the accepted budgets still apply. A specialized recipe supplies narrower trusted
validation and required output paths when the generic repository gate is unsuitable.
Each candidate must cover the whole requested batch; selecting one isolated batch
item cannot complete the run. Engineering may retain changes to existing tests,
manifests, swarm infrastructure and recipe `validationPaths` as proposals. Their
checks remain diagnostic: independent validation and integration both block
promotion until host review and a new immutable verifier baseline. Approval cannot
override that boundary on the old source. Performance recipes retain their stricter
patch policy. Sensitive paths, explicit protection and repository scope remain hard
limits for both modes. The generic recipe names supported root configuration and
documentation files explicitly; it grants no blanket root-directory access.
Patches and unfinished patch evidence are bounded to 256 KiB; larger transfers use
bounded command chunks with a hash check before applying to the immutable tree.

Trusted recipes can bind executable investigation instruments to the method
registry in `cli/src/swarm/outcome/methods.ts`. Current methods cover causal runtime
probes, sampled CPU profiling, independent correctness and controlled experimental design. A method names
its instruments, required raw evidence, responsibility, deliverable and acceptance
criteria. Unsupported browser, animation or GPU capabilities are not advertised.

The proposed outcome contract appears in both native review dialogs. After the
current baseline, the planner records symptoms, falsifiable assumptions, exact
completion criteria, downstream consequences and the smallest useful set of
hypotheses. It can select fewer workers than the reserved candidate slots. Source,
scope, spending and the user's criteria remain fixed. Model claims must match a
trusted instrument's declared claim; browser input cannot supply commands or
weaken predicates.

Experiments execute fixed recipe commands against the immutable source before
implementation. They retain objective, expected information, resource/time/cost
ceilings, raw observations, evaluator identity, limitations and support/contradiction
predicates. Missing, conflicting or failed observations are inconclusive. A
contradicted or inconclusive hypothesis spends no implementation calls. A supported
constraint is shared counterevidence and cannot authorize an implementation.
Diagnostic instruments acquire observations without authorizing implementation;
profiler artifacts retain the raw sampled graph alongside bounded attribution.
All selected experiments finish before implementation; workers can retrieve their
shared raw artifacts while competing patches remain private. Identical source-bound
probes reuse a hash-verified observation, explicitly identified as reuse rather than
independent replication. Instrument definitions and raw command identities are
fingerprinted; changing a command, predicate or required artifact invalidates reuse.
Distinct implementation strategies can share one supported hypothesis while keeping
their patches and validation workspaces isolated.

Failed candidate correctness can trigger one bounded repair by default (at most two,
or zero through `budget.maxRepairRounds`). The worker must diagnose the defect
before editing, remain within the original implementation files, preserve existing
and added regression assertions, and return to a fresh independent validator.
Wrong primitives, missing evidence and incompatible requirements stop repair.
Original patches and failed validations remain inspectable; retries cannot enlarge
the round budget.

Task completion and outcome demonstration are separate persisted states. A model
review cannot establish outcome success: independent correctness and controlled
comparison receipts, distinct evaluator identity and no unresolved promotion
blockers are required. Every exact completion criterion also needs a host-owned
`outcomeCriteria` binding to an executable evaluator; model assertions cannot turn
CPU evidence into display acceptance. Missing bindings block recommendation and
approval. Recipes without investigation instruments keep their existing task flow.
Each run retains
scoped invariants, contradicted assumptions, missing validators and measured
techniques; none are automatically promoted to global instructions.

Runs pass CREATED, PLANNING, READY, RUNNING, VALIDATING, COMPARING and
AWAITING_APPROVAL before COMPLETED. FAILED, CANCELLED, TIMED_OUT and BLOCKED retain
evidence. A bounded recipe creates baseline preparation, independent candidate
work, fresh validation forks, serialized comparison and human review. Agents
cannot add recursive tasks. A hypothesis may be rejected without a patch.

SQLite transactions claim tasks with leases and increasing fencing numbers.
Expired work restarts in a fresh environment within its retry bound; completed
tasks and comparison artifacts remain durable. Workspace ownership is recorded
before execution, while the bridge records it before dependency preparation.
Heartbeats, absolute expiry and orphan cleanup bound abandoned compute.
One coordinator and one bridge replica are supported per volume.

Messages identify run, task, agent, source, time and linked artifacts. Agents can
retrieve compact relevant findings, including prior project runs. After a
disposition through Harness, existing project notes receive one deduplicated,
unpinned run summary with artifact hashes. Raw findings stay with the run.

Metadata lives in the database; content-addressed bytes use a private S3 bucket or
durable coordinator volume. Retrieval verifies hashes through the authenticated
host proxy. HTML receives a sandboxed content policy. Public previews are disabled.

## Comparison and integration

The benchmark resource has an exclusive durable lease and dedicated workspace.
Durable scheduling waits for other Swarm tasks before baseline measurements or
benchmark-capability instruments, then withholds new tasks until they finish,
including across concurrent runs. This does not reserve physical provider CPUs.
Sequential commands alternate AB/BA pairs across sessions. Receipts identify
worker, fence, source, scenario, workload hash, CPU, runtime, warmup, duration,
samples, available memory/GC and raw artifacts. CPU preparation measurements also
compare deterministic final state, structural counts and total CPU cost.

Defaults require eight pairs in two sessions, a 5% useful effect, bounded baseline
drift, confidence intervals and [tail evidence qualification](../../packages/performance/README.md).
The total CPU guard checks median, p95 and measurable p99 independently of the
primary metric. Noisy or incomplete evidence is **INCONCLUSIVE —
ENVIRONMENT NOISE**. Overlapping candidate intervals do not produce a winner.

The host applies a reviewed patch only if its working snapshot matches the run's
source tree. Patches have bounded paths and size; modified existing tests,
benchmark infrastructure, manifests, symlinks and binary/rename patches are
excluded. Added tests run in validation. After application, the host captures the
integrated tree, verifies it matches the candidate, and requests fresh remote
correctness checks. Failure leaves integration incomplete and changes visible.
Nothing publishes or performs production operations automatically.

## Costs and trust

Run limits cover time, concurrency, retries, model calls/tokens, model cost and
conservative sandbox reservations. Tasks reserve full possible compute lifetime
before provisioning. Model turns reserve conservative bounds and settle reported
usage. Estimates and reported charges are separate. A persistent deployment ledger
also reserves 65 minutes of full CPU/RAM per sandbox plus $1 for hosting and
egress, across retries, probes and runs, with a two-hour deployment expiry.
Admission stops at $10. This is an estimated admission ceiling, not an enforceable
provider invoice ceiling: Railway does not expose a per-sandbox egress quota here.
Account-wide limits remain unchanged.

Auto settings suggest one worker, 30 minutes and 250,000 total/per-agent tokens for
a bounded investigation; comparison work gets three workers, one hour, one million
total tokens and 400,000 per agent. Explicit settings survive goal edits and request
parsing. Both retain 24 calls per agent and 20 percentage points of observed weekly
subscription usage.
The form exposes overrides, including one million tokens or up to 24 hours; a
temporary host's approved absolute expiry always takes precedence. The weekly
allocation is measured from the first verified weekly-window observation, carries
observed consumption across resets, and fails closed without reset metadata.
It includes concurrent usage elsewhere on the account. Provider reporting lag and
in-flight model calls prevent an exact token/quota cutoff; admission and subsequent
dispatch stop at the observed limit. Report these limits as admission controls.

Compact handoffs contain the source, completion criteria, relevant steering,
artifact references, verified command receipts and remaining budgets. Successful
preparation and baseline checks are explicit so workers can reuse their evidence.
Baseline context is sent once per turn; only bounded prior tool results/actions
are retained. Task/source-scoped capture and read receipts preserve artifact hashes,
paths and page offsets; bounded recent findings and unvalidated checkpoint references
preserve learned causes after earlier turns leave the prompt. Capturing unchanged
bytes reuses that task's artifact ID after reading and hashing the current file;
changed bytes retain a new artifact. Repeated-page counts help workers resume at
the next offset instead of rediscovering evidence. Older authorized logs can be
paged on demand. Interrupted engineering baselines get up to 15 seconds to read
already-written declared artifacts and one second to persist a failed partial
receipt before cleanup. They retain the original error; cancellation, a terminal
run or lost source/task ownership prevents publication. Recipes must declare
partial-report paths when those outputs should survive an interrupted verifier.
Command previews bound stdout and stderr before JSON serialization, retaining
status, both ends of output and omitted-character counts. When the normal context
cannot fit the remaining token allowance, the investigator saves its evidence
before attempting one compact report-only turn through the same budget admission.
Neither a refused turn nor an incomplete final report qualifies a candidate or
starts an automatic retry. Timeout recovery retains the bounded findings and
command receipts without requesting more inference; it preserves the original
failure and existing ownership/deadline checks.
Trusted scripts own
preparation, validation, patch extraction and paired measurement. Artifact bytes
are retrieved on demand rather than embedded in agent messages or status streams.

Run streams begin with an authoritative snapshot, then send ordered changes keyed
by task, candidate, artifact and message ID. Reconnects start from a new snapshot;
slow readers coalesce updates. The reader accepts the live demonstration's older
full-snapshot stream. `bun apps/harness/scripts/swarm/stream-evidence.ts` reproduces
the representative local byte comparison: 496,602 bytes for a full snapshot versus
744 for a delta (8,369 versus 390 with equal gzip). Validation/reconstruction took
more local CPU, 3.95 ms versus 1.45 ms median. Negotiated gzip flushes each event
without waiting for stream completion; real loopback HTTP verifies decoding and
cancellation. With this helper, the two-frame snapshot/delta stream was 11,429
bytes versus 22,303 for two full snapshots. This is a measured bandwidth tradeoff,
not a cloud latency improvement; the new compression path has not been deployed.

Defaults are Railway execution, a $5 sandbox allowance capped at $10, and $0
separately billed inference. Codex uses ChatGPT subscription authentication in
the trusted coordinator's private `/data/codex`, never inside execution sandboxes.
Its child environment excludes API keys and Railway credentials; user configuration,
shell, plugins, apps, browser and delegation tools are disabled. The existing AI
adapter returns bounded actions to the coordinator's remote execution bridge.
Before dispatch (including after restart), official Codex account/usage checks and
a small real inference probe must pass. Dispatch checks run only when the shared
store eligibility check finds work; idle dependency, capacity and measurement
waits do not poll account status. The transactional claim rechecks eligibility,
and each model call still requires fresh admission. Failures retain a bounded,
allowlisted diagnostic without native output or credentials.
Missing quota information, unavailable
authentication or any reported usage window at 90% blocks new work; paid providers
remain a future explicitly configured alternative. Token usage is reported by
Codex. Its $0 cost is a subscription estimate, never a reported invoice. Included
quota is finite; the service does not purchase credits or switch to API billing.
The local Pro login and inference probe passed. A harmless canary also challenged
the pinned CLI's native tools and observed no tool execution or host-file read.
These configuration controls and post-call audits are not an OS security boundary.
Authentication, the canary and one subscription inference call also passed on the
temporary Railway coordinator. This verifies the intended remote credential path;
the tournament's model budget and remaining subscription quota still apply.
The Codex CLI does not provide a verified hard per-response output-token cap;
admission reserves native instruction/output headroom and stops further calls at
the cumulative reported agent limit. Call count and elapsed time are bounded.

Existing local host admission authenticates users. The remote owner API has a
separate bearer secret and project allowlist; direct cross-origin access is denied.
The optional public browser API instead uses durable hashed, run-scoped sessions,
exact origin checks, Secure SameSite cookies and CSRF validation. Revocation and
expiry terminate active streams. Public links convey authority to their holder;
they provide scoped access, not a multi-user identity system. The broad owner token
never enters the public frontend. Read-only links cannot mutate a run.
The private bridge owns another secret and the Railway token. Sandboxes receive
repository content and bounded command environment only. Command logs include the
executed command and explicitly mark truncated output. The existing Harness
redactor removes recognizable credentials from persisted logs and messages; it
cannot identify every secret embedded in arbitrary source. ISOLATED networking still
permits outbound internet and does not prevent malicious repository exfiltration.
Explicit local execution lacks cloud isolation. This is a single-owner service,
not multi-user tenant isolation.

## Commands and deployment

```powershell
bun run swarm help
bun run swarm site --project <project-id>
bun run swarm site --public --run <run-id>
bun run swarm site --public --run <run-id> --access control --expires-minutes 60
bun run swarm site-revoke --access-id <access-id>
bun run swarm status
bun run swarm list --project touch-of-death
bun run swarm submit --file .local/swarm/request.json --root .
bun run swarm inspect --run <run-id>
bun run swarm start --run <run-id>
bun run swarm compare --run <run-id>
bun run swarm artifacts --run <run-id>
bun run swarm cancel --run <run-id>
bun run swarm steer --run <run-id> --text "Prioritize the measured preparation stage"
bun run swarm follow-up --run <run-id> --goal "Investigate the retained blocker" --done "Retain a reproducer and validated diagnosis"
bun run swarm cleanup
bun run swarm:test
bun run swarm:auth
bun run swarm:auth --probe
bun run swarm:auth --canary
bun run swarm source-check --root .
bun run swarm:verify-workflow
bun apps/harness/scripts/swarm/verify-workflow.ts --link-only
bun apps/harness/scripts/swarm/verify-public-ui.ts
bun apps/harness/scripts/swarm/build-site.ts
bun run swarm:deploy --plan
bun run swarm:deploy --billing --railway-cli <railway-executable>
bun run swarm:cloud-test --allow-provision
```

`submit` validates `CreateSwarmRequest` in `@hyperfocus/ai-core/swarm`; app forms use
the same request. Provider variables, Dockerfiles, resource ceilings, Node support
and the bounded live probe belong to the [deployment guide](../../apps/swarm-worker/README.md).

### Laptop authority with Railway execution

An explicitly selected laptop topology keeps official Codex subscription inference
in the existing authenticated local account, durable SQLite/artifacts on the laptop,
and Railway credentials in an owned Node bridge. Repository work still executes in
real Railway sandboxes; this does not enable local execution fallback or publish a
coordinator. The laptop must stay running. Both topologies use the same coordinator,
provider contracts and shared deployment budget ledger.

```powershell
bun apps/harness/scripts/swarm/verify-live.ts --topology laptop `
  --demonstration-id <new-uuid> --credential-id <existing-authorized-credential-id> `
  --railway-cli <railway-executable> --node-executable <node-24-executable> `
  --project-root . --project-id touch-of-death --request-file .local/swarm/request.json `
  --compute-usd 10 --run-minutes 60 --allow-launch --provider-smoke
```

The request needs explicit `goal`, `doneCriteria` and budgets; this runner requires
zero separately billed inference, at most three workers and at most $9 run compute
after the shared $1 overhead reserve. It checks current included usage, captures
immutable non-ignored source, verifies subscription/provider readiness, runs bounded
work and cleans up on completion, cancellation, timeout or parent exit. Reusing a
demonstration ID retains its original ledger and expiry. Reports, source bundle,
hash-verified artifacts, archived SQLite and cleanup receipts remain in
`.local/swarm/live-hosted/<demonstration-id>/`. No settled sandbox price is inferred
from reservation estimates or account-wide billing changes.

Add `--monitor` to start an isolated managed Harness view of this live run. The
runner prints its URL and saves `monitor.json`, registers the selected project
through the owned desktop host, and stops the view during cleanup. The live URL
expires with the run; archived artifacts remain available in the evidence folder.

After a completed, cleanup-verified prior attempt, `--attempt 2` or `--attempt 3`
permits a bounded repair-verification rerun with a new immutable source snapshot.
It retains the original ledger, expiry and request ceilings, stores separate
receipts, and rejects parallel drivers or a fourth attempt. This does not reset
cloud authorization; per-run token admission and
shared-account weekly quota checks remain separate from the compute ledger.

The deployment target is project `13527ca6-cda6-4341-8d8a-9ab70d7bcdf5`, environment
`e46fa18a-61c0-4cc4-9379-45b8dfde47a6`. Temporary coordinator and worker services use
one replica, 1 vCPU / 4 GB each. Existing services and workspace-wide limits remain
outside deployment ownership. Durable artifacts use the existing private
`hyperfocus` bucket. The demonstration report records actual deployment and cleanup.
`codex login --device-auth` supports browser-assisted subscription sign-in on the
trusted coordinator without an API key. Remote sign-in and the native tool canary
succeeded. Deployment configuration standardizes Node on 24.22.0, including the
prepared sandbox toolchain; the application's existing Bun runtime is retained.

## Acceptance status

The final focused swarm suite passed 164 tests / 979 assertions. Separate contract
and deployment-script checks passed 63 tests / 286 assertions. Focused UI/core
checks passed 32 tests / 203 assertions with `--conditions browser` (shared contract
coverage overlaps).
Harness and Editor type checking, the Harness production build and standalone
public build passed. Changed swarm files passed ESLint and scoped code-style
checks. Guidance and process-policy checks passed. The broad source-structure gate
still fails on unrelated existing engine/editor/spike files; no exception was
added for this feature.

Deterministic coverage includes graph scheduling, retries, cancellation, stale
workers, durable reopen, duplicate messages, invalid transitions, budgets,
independent candidates, correctness failures, noise, selection, provider ownership,
artifact integrity and explicit disposable local Git execution. Browser evidence
includes both real host entry points and labelled simulated coordinator workloads.
Both hosts also exercised approval against disposable Git repositories, verified
the uploaded source tree, retained unrelated index/working changes and safely
repeated approval after subsequent developer edits. Workload and performance
results in those browser runs were explicitly simulated. These do not certify
Railway execution or game correctness.

The public page was exercised against the real session, static and coordinator
HTTP handlers with a labelled deterministic workload. It streamed state, inspected
hash-verified artifacts, steered, queued and cancelled follow-ups, rejected results,
denied read-only writes, rejected missing CSRF/unrelated runs and closed revoked
sessions. A separate read-only page observed another page's launch and completion
without refreshing. Waiting plans retain streams; terminal runs release them after
worker cleanup. Thirty-second SSE comments keep idle connections alive without
resending run state, and service shutdown closes streams before database teardown.
Both native apps issued links through their actual authenticated host
proxies and opened the public page. No broad host tokens or Harness WebSocket
connections entered that page. Receipts and screenshots are in
`.local/swarm/public-ui/` and `.local/swarm/native-link-ui/`; both explicitly record
`cloudVerified: false`. The standalone build is about 187 KB JavaScript plus 33 KB CSS.

Read-only billing confirmed the upgraded Pro subscription with $20 included usage,
about $3.52 consumed and $16.48 remaining at 03:55 UTC on October 16, 2026; sandbox
usage qualifies. This workspace-wide observation is not the tournament's invoice.
Other services continue to consume it. Run the billing command again before
provisioning. Pro capacity is an entitlement, not an allocation: the tournament
retains its $3–5 target, $10 ceiling, three investigation workers and exclusive
benchmark lane. Neither workspace-wide limits nor existing services are changed.

Actual Railway builds, service resource caps, HTTPS health, rejected unauthenticated
requests, and both local hosts connected to the remote API have been verified.
Remote subscription inference and its native-tool canary passed. A real two-sandbox
probe verified creation, immutable upload, execution, independent forks, patch
preservation, nonzero exits, timeouts and cancellation. Both owned sandbox IDs are
provider-confirmed DESTROYED; the report and patch passed bucket hash readback.
The actual tournament's 237 baseline tests, rejected hypotheses, native review,
cost observations and cleanup evidence are separated in the demonstration report.
Linux Docker builds ran on Railway; Docker remains unavailable on the workstation.
The [Touch of Death owner](../../packages/engine/examples/touch-of-death/docs/swarm.md)
tracks CPU scope and unresolved full browser/image acceptance. Those gates remain
visible instead of being weakened to manufacture a successful demonstration.

## Next verification and provider roadmap

The first run exposed repeated preparation and missing attribution receipts.
Compact verified handoffs and avoiding validation forks for absent patches address
that waste before another tournament. The remaining live acceptance boundary is
viable independent patches followed by correctness and controlled paired timing.
The temporary demonstration exports metadata before deleting its services;
restoring that archive to a coordinator is currently an operator procedure.
The public site removes the workstation dependency for viewing and controlling an
existing cloud run. Low-setup onboarding for another developer still needs a
guided provider/project/storage configuration and an approved persistent hosting
policy. The current two-hour deployment and manually authenticated subscription
remain explicit; issuing a public link does not extend either.

The next game boundary is the portable canonical project/assets and Linux browser
adapter described by the game owner. Current evidence does not justify a WASM,
GPU, multi-cloud or model-hosting expansion.

Other inference providers remain an explicit roadmap option through the existing
AI runtime. OpenAI API, Anthropic and Google adapters require separately authorized
credentials, metering and budgets; none is a fallback for this subscription-only
deployment. A future multi-user hosted product needs an appropriate hosted sign-in
integration rather than reuse of this single owner's Codex CLI authentication.
