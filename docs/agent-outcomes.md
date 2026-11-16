# Outcome engineering

The objective is the user's intended outcome at the required quality, with minimal
human attention, inference, compute and elapsed time. For substantial work, keep
the following in the existing task/plan or owning TODO. Trivial edits need only
their focused check. Optional receipts are evidence, not another backlog.

## Select the outcome

Use short answers, not seven new documents:

| Contract | Meaning |
| --- | --- |
| Request | What the user explicitly asked for; preserve its reference |
| Intent | Why they want it; label consequential assumptions |
| Outcome | What successful use accomplishes and the completion threshold |
| Experience | What the result should feel like or enable for its audience |
| Evidence | Available observations, independent evaluator and disconfirming case |
| Constraints | Authorized scope, accepted properties and invariants to preserve |
| Budget | Justified effort and checkpoints; known token, inference, compute, elapsed-time and human-review limits |

Define success before seeing the candidate. A changed threshold needs an explicit
reason; it cannot erase a failed attempt. Unknown costs stay unknown. Use available
host budgets rather than inventing arbitrary limits or adding another scheduler.

| State | Evidence required |
| --- | --- |
| Code written | Candidate files exist; no behavioral claim |
| TECHNICALLY VERIFIED | Declared executable or observed behavior checks pass |
| OUTCOME VERIFIED | The intended next use succeeds under an independent domain oracle |
| HUMAN / DOMAIN ACCEPTANCE REQUIRED | Consequential quality remains unevaluated; identify the missing judgment |
| Human-accepted quality | Actual approval of the identified version and qualities within its scope |

An existing regression, held-out fixture, runtime observation or instrument can
provide independent evidence when its expected result comes from the requirement,
reference or external invariant. Another model is advisory, not ground truth.
Self-authored tests remain useful, but need another oracle for the outcome. A human
review can establish its stated scope; silence and generated ratings cannot.

## Supervise at existing boundaries

Before delegation or expensive execution, after a failed repair, and before
completion, record one decision in the current task: **continue, redirect, stop,
or escalate**. State the original outcome, current activity, observed limiting
factor, relevant evidence, expected improvement and remaining cost. Ask: if this
work succeeds perfectly, does it materially advance the outcome? If uncertain,
inspect the scene, user journey or workload before implementing another local fix.

Continue when evidence supports the intervention. Redirect to the responsible
causal level when it does not: intent/domain knowledge, decomposition/composition,
interaction/temporal/perceptual behavior, implementation, verification or evaluator.
Preserve accepted properties and check the repair at both its boundary and the
parent experience. Stop a low-value branch when its approach is falsified, repeated
repairs show no meaningful gain, its evaluator cannot judge quality, or its budget
is exhausted. Preserve useful artifacts and the unresolved outcome. Escalate only
a consequential missing judgment or authorization; stopping a branch does not
authorize replacing the user's mission. No recurring model discussion is required.

Substantial child handoffs carry the parent outcome reference, specific contribution,
required context/constraints, expected evidence, completion criteria, effort budget
and escalation conditions. Use the existing handoff envelope. Add agents only for
distinct hypotheses, evidence, expertise, useful parallel work or independent
evaluation. The parent owns integration and outcome acceptance. Child completion,
compilation, generated artifacts, screenshots and model scores are supporting
evidence, never automatic parent success. Unobservable context delivery is UNKNOWN.

## One execution path for every agent

Execution policy is project-owned. T3, Codex, Claude, Editor automation and Harness
use the same constraints and domain checks; a different host is not an exemption.
Harness calls `@hyperfocus/ai-runtime/quality/execution` directly. External agents
wrap substantial bounded work with the existing CLI, which calls that same runtime:

```powershell
bun run inspect:outcome --execute .local/task.json '--' bun path/to/owning-workflow.ts arguments
# From another working directory, address the repository CLI and select the task root:
bun /path/to/hyperfocus/scripts/context-audit/outcome/cli.ts --execute .local/task.json --root /path/to/project '--' bun workflow.ts
```

Use the existing task JSON; do not create a parallel task database. It carries:

- `supervision`, `prerequisites` and `contracts`, using the existing
  [execution-plan schema](../packages/ai-core/src/harness/protocol/conversation.ts).
  These fields may be at the root or under `executionPlan`. Supervision is required
  for this explicit execution mode. A single-agent task can use one contract.
- The optional `outcomeContract` below, at the root, for evidence-bound domain
  acceptance. Its request and outcome must exactly match supervision. Without it,
  command success cannot clear parent outcome acceptance.

In PowerShell, quote the `'--'` separator so the shell passes it to the CLI.
Other shells may use unquoted `--`. Keep command arguments separate; do not
remove the separator to work around shell parsing.

The command runs admission, every prerequisite acceptance command, the supplied
argv, contract verification and the project's frozen quality profile, then all
command criteria in `outcomeContract`. It stops on failure. Prerequisite setup must
already be prepared (`status: completed`); that flag never skips its actual checks.
There is no skip-verification flag. A task with no executable acceptance is rejected
before work. Choose an authorized timeout with `--timeout-ms` (default two minutes,
maximum one hour); this is a bounded work invocation, not an entire open-ended project.

The task is frozen for the invocation: work cannot remove its checks or change its
goal. Start a new invocation for an intentional revision and preserve prior evidence.
The command receives `HYPERFOCUS_OUTCOME_CONTEXT`, a file containing the parent
contract and selected obligations. This proves a file/environment handoff, not a
model read: context delivery remains UNKNOWN without an observable adapter receipt.
Commands and input files remain subject to the task's existing authorization.

Exit 0 means the declared threshold passed; it does not broaden that threshold.
Exit 1 means admission/execution failed. Exit 2 means execution finished but acceptance
remains unverified or requires review. Existing human receipts can be supplied with
`--receipt`; no human approval is generated. A failed criterion stops further evaluation.
One concise result points to raw logs, check receipts and quality coverage in the
existing `.local/agent-outcomes/receipts` location. No new agent service is involved.

For repeated work, put the relevant baseline and known failure in supervision's
evidence and constraints, and bind the actual domain/pilot check as a prerequisite.
Use the owning workflow command, not another one-off implementation. This boundary
enforces declared checks; it cannot infer an omitted domain obligation or prevent a
fully privileged agent from deliberately running raw commands. Direct shell bypass
violates the project guidance and makes no supervised-execution claim. Quality and
domain receipts still distinguish generated artifacts from accepted experiences.

## Evidence discovery

When the instrument is unclear, use `bun run inspect:outcome --methods <domain>` for `performance`, `ui`, `animation`,
`architecture`, `defect`, `release` or `orchestration`. The small
[method catalog](../scripts/context-audit/outcome/methods.json) routes existing
instruments; it does not execute them or require loading every discipline.

Use the rawest relevant input and a method that could falsify the hypothesis.
Prefer cheap deterministic checks, then domain verification, calibrated critics,
and selective human review. A specialist method earns its cost by changing the
decision; it is not a mandatory research exercise. If evidence cannot be accessed,
record the failed access and consequence. Tool availability does not prove use.

| Evidence needed | First route |
| --- | --- |
| Runtime logs, stacks, recurrence | `dev:status`, then `dev:logs` / `dev:errors` with the returned server ID; [failure records](development.md#failure-record) |
| Browser, screenshots, interactions | [Managed server skill](../.agents/skills/dev-server/SKILL.md), available host preview, existing surface capture; [design evidence index](design-system/evidence-index.md) |
| Profiles, allocations, frame samples | [Performance owner](../packages/performance/README.md), owning benchmark/capture; preserve environment and raw trials |
| Ownership, callers, validation candidates | `inspect:impact --summary --path <file>` (omit `--summary` for source evidence), `inspect:project --root <directory>`, focused `rg`, `git log -- <path>` and `git show` |
| Artifact and release acceptance | `ship-check --list`, selected `--plan`, then actual gate and [artifact journey](shipping.md#close-the-final-delivery-gap) |
| Approved taste and negative examples | Owning design/product document, [game-art references](../.agents/skills/game-art-direction/SKILL.md), existing [versioned review store](../packages/review-store/README.md) |

## Optional executable contract

The seven distinctions above may remain task prose. Do not add unsupported fields
to a machine contract. `inspect:outcome` accepts the following JSON, directly or under an existing
plan's `outcomeContract` key. Paths and commands resolve from the selected repository
root. List all candidate inputs relevant to the claim, including verifier/fixture
files; omitted dependencies cannot be freshness-checked. Directories are rejected.
Unknown contract fields are rejected so a misspelled assertion cannot silently
weaken a check. Other metadata in the enclosing plan remains separate.

```json
{
  "schema": "hyperfocus-outcome-v1",
  "requested": "Repair guidance discovery",
  "outcome": "Agents can follow the selected guidance without missing local references",
  "next": "An independent agent executes a representative task using those routes",
  "scope": ["Guidance discovery and its regression checks"],
  "constraints": ["Preserve packaged-scope isolation and unrelated edits"],
  "evidenceAvailable": ["Current guidance catalog and existing checker"],
  "limits": ["Structural validation does not establish agent behavior or taste"],
  "assumptions": [{"claim": "The failure is a missing local route", "disproveWith": "A valid route still fails in the real task"}],
  "candidate": {"description": "Current guidance", "paths": ["AGENTS.md", "scripts/context-audit/guidance.ts"]},
  "threshold": "behavior-verified",
  "criteria": [{
    "id": "routes", "stage": "behavior-verified", "metric": "Zero broken routes or metadata failures",
    "evaluator": {
      "kind": "command", "origin": "existing", "method": "Run the repository guidance validator",
      "independence": "Existing filesystem/metadata invariants, independent of task prose",
      "command": ["bun", "run", "check:agent-guidance"]
    }
  }]
}
```

```powershell
bun run inspect:outcome --check .local/task.json
bun run inspect:outcome --run .local/task.json --criterion routes
bun run inspect:outcome --check .local/task.json --receipt .local/agent-outcomes/receipts/<returned-file>.json
```

`--check` is read-only and exits nonzero below the selected threshold, with missing
criteria and invalid receipts in JSON. `--run` explicitly executes one predeclared
argv through the hidden process adapter, captures stdout/stderr, timeout,
exit code and hashes in `.local/agent-outcomes/receipts/`. Default timeout is two
minutes; `--timeout-ms` permits up to one hour. It neither discovers arbitrary
commands nor authorizes their side effects. Inspect the command and apply the
task's existing authorization before running it. Keep secrets out of captured logs.
Output is monitored and rejected above 8 MiB per stream; polling may overshoot
that limit on disk. Hashing streams files and inspection bounds JSON reads. This
is not a disk quota or a supervisor for commands that abandon their descendants.

A command evaluator uses exit zero; optionally `expect` specifies exact top-level
JSON scalar fields, e.g. `{"status":"automated-checks-passed"}` for `ship-check
<target> --json`. This rejects a successful plan response. Treat a no-op command
as a bad evaluator, not proof. Human/model criteria use `kind`, `method` and
`independence` without a command; models never advance a state. Command origins
are `existing`, `held-out`, `runtime`, `instrument` or `self-authored`. The latter
alone cannot satisfy an outcome criterion. Every stage through the threshold
needs a non-model criterion; all applicable non-model criteria must pass.

Receipts bind the whole contract and candidate manifest hashes. Changes invalidate
old receipts. Raw artifacts must still exist with matching hashes; duplicate or
contradictory attempts cannot silently override each other. Preserve failed
attempts, then explicitly select the applicable rerun for the current check.

A human receipt uses schema `hyperfocus-outcome-receipt-v1`, `kind: "human"`,
`criterionId`, `contractSha256`, `candidateSha256`, `actor`, `recordedAt`, `scope`,
`decision: "approved" | "rejected"` and `artifacts: [{"path": "...", "sha256": "..."}]`.
Import actual feedback from its existing owner; do not manufacture approval text.
The checker validates record consistency, not human identity, honest execution,
metric relevance or completeness of listed inputs. It is a local evidence aid,
not signed attestation, a sandbox or a replacement for domain evaluators.

## Report the outcome first

Every substantial task ends with a concise executive summary first, normally no
more than 150–250 words, using these headings in order:

- **Outcome:** ACHIEVED / PARTIALLY ACHIEVED / NOT ACHIEVED / UNVERIFIED.
- **What changed:** at most three high-value bullets.
- **What improved:** demonstrated outcome improvements and evidence.
- **What did not improve:** unresolved goal-level failures or uncertainty.
- **Next decision:** exactly one highest-value action; say **STOP** if no further work is justified.

Keep resource accounting in task evidence; omit a Cost section from the user-facing
summary unless requested. Link detailed evidence after the summary when needed.
An engineering report does not replace it. Do not turn unavailable outcome evidence into a technical success
claim. Apply this format to substantial reviews as well as implementation.

## Retain learning and measure overhead

Start the next substantial attempt from the strongest relevant prior result, not
the newest filename or a fresh generic template. Retrieve the owning implementation,
approved qualities and one relevant failure/counterexample. In the existing task,
identify what is reused, what must remain unchanged and the next unresolved gap.
Missing or rejected baselines remain labeled; do not invent approval or carry a
project's taste into unrelated work. This is targeted retrieval, not a requirement
to reread every audit or thread.

Close the loop in the actual caller: a documented check that the normal production
path skips is not an enforced improvement. Exercise one representative result and
a known failure before expensive expansion. Use existing task prerequisites and
domain checks; state explicitly when an external runner cannot enforce them.

Promote a reproduced failure into its owning test/tool before adding instructions.
When a repair works, preserve its scoped reference and regression with that owner;
the next attempt must use that implementation. Claim transfer only after a second
real consumer or held-out case. Separate improved generation from improved defect
detection: stopping a bad batch does not establish that the next batch is good.
Keep scoped taste decisions with the [existing approval owner](documentation-governance.md#subjective-decisions):
local, project-level or shared, with the alternatives/tradeoff, exact accepted
qualities, source/date and version. Consult it before asking again. One local
preference does not establish a shared default.

Use targeted checks tied to actual entrypoints, negative controls for claimed
failure detection, and a second real consumer when feasible. Separate demonstrated
transfer from assumed transfer; do not manufacture a broad evaluation campaign.
Measure time to verified result, not report/test/agent count. The
[behavior evaluation](audits/agent-outcomes.md) separates baseline behavior,
executed repairs, confounds and remaining evidence gaps.

This workflow applies the outcome, instrument and external-judge principles in
[Felix Rieseberg's article](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/)
to the repository's existing owners; it does not import model-specific prompting.
