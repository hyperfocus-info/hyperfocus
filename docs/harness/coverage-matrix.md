# Coverage Matrix

## Thread collaboration

| Story ID | Covered by | Depth | Gap |
| --- | --- | --- | --- |
| US-THREADS-011 | `cli/src/server-tests/thread-collaboration.test.ts`; `scripts/thread-collaboration/verify-ui.ts` | SQLite reopen, retry identity, fork ancestry, rendered navigation | Provider-internal children without normalized events |
| US-THREADS-012 | `cli/src/server-tests/thread-collaboration.test.ts` | WebSocket recipient execution, attribution, idempotency, project isolation, selection preservation | Native model tools are Pi-only |
| US-THREADS-013 | `cli/src/server-tests/thread-collaboration.test.ts`; `cli/src/pi-agent/execution-controller.test.ts`; `scripts/thread-collaboration/verify-ui.ts` | Busy queue, pause/restart, controller steering, draft retention | CLI live steering unavailable; real-provider inference not part of deterministic coverage |

## Quality obligations

| Story ID | Covered by | Depth | Gap |
| --- | --- | --- | --- |
| US-QUALITY-001 | `packages/ai-runtime/src/quality/session.test.ts`; shared `quality-review.test.tsx`; Harness verification, WebSocket, persistence and Pi SDK tests; `scripts/quality/demonstrate.ts` and `scripts/quality/verify-ui.ts`; [foundation repair](../design-system/foundation-repair-2026-11-01.md) | unit + WebSocket + SQLite reopen + rendered requirement hierarchy + real Books/browser mutations | Supported SDK and declared verifiers only; live model attention, opaque CLI delivery and human taste acceptance remain separate |

US-QUALITY-001 also covers outcome admission in `verification/outcomes.test.ts`:
stop before prerequisite model work, replaced parent outcomes, expired admission
budgets, missing/failing prerequisite checks despite completed flags, and corrective
plan preservation. Quality-session tests reject old parent checks after late child
work. Books demonstration uses real domain checks with fixture workers; the media
replay rejects historical production before dispatch. Neither establishes live
agent judgment, full-film quality, or interception of external T3 shell commands.

US-QUALITY-001 negative controls also cover purpose/profile drift with unchanged
rule hashes, nested accepted-decision omission, mutable returned envelopes,
rejected-parent dispatch, corrected retries, and machine-only qualitative passes.
The current Books orchestration/browser/reopen demonstration preserves technical
VERIFIED with REVIEW REQUIRED; no model attention or human identity is attested.

## Attention

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ATTENTION-001 | apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/components/project-sidebar.test.tsx; [attention evidence](../design-system/attention.md) | unit+browser; native launcher acceptance separate | GAP-MED |

## Swarm engineering

US-CONNECTIONS-001: `packages/ai-runtime/src/connections.test.ts`,
`cli/src/connections/http.test.ts`, `cli/src/swarm/connection-gate.test.ts` and
`scripts/verify-connections.ts` passed, including phone/desktop browser closure
before completion and subsequent launch. `scripts/swarm/verify-workflow.ts
--connections-only` also passed both native entry points with simulated providers.
`scripts/verify-remote-connections.ts` observed a real official Codex device code
on Railway and resumed the same operation after browser/network disconnect.
Its deadline failure also reached a real server-held agent wait without polling.
The user completed official authorization; the account, successful operation and
stable event replay survived redeployment. All configured subscription inference
profiles passed on Railway (`connections-inference-ready.json` in the repair
evidence directory). A real campaign automatically released from a connection wait
and the hour-long laptop-off journey remain unverified; they are not inferred from
successful authentication.

| Story | Evidence | Depth / remaining gap |
| --- | --- | --- |
| US-SWARM-001 | `cli/src/swarm/http.test.ts`, `packages/ai-runtime/src/swarm/proxy.test.ts`, `ui/src/components/swarm/swarm-dialog.test.tsx`, `scripts/swarm/verify-workflow.ts` | HTTP + UI integration using explicitly simulated workload; live Railway submission pending. |
| US-SWARM-002 | `cli/src/swarm/{store,coordinator,task-context,runner}.test.ts`, `cli/src/swarm/execution/benchmark-receipt.test.ts`, `packages/performance/swarm/*.test.ts`, real both-host workflow browser fixture | Scheduling, failures, cancellation, persistence, missing-tail evidence, p95/p99 regressions, latency-allowance boundaries (including enclosing CPU) and noise covered; real cloud tournament pending. |
| US-SWARM-003 | `cli/src/swarm/execution/integration.test.ts`, `packages/ai-runtime/src/swarm/proxy.test.ts` | Both hosts approved real disposable Git integration, preserved unrelated work and repeated approval safely; remote workload and performance were explicitly simulated. Live cloud checks pending. |
| US-SWARM-004 | `packages/ai-core/src/swarm/review-controller.test.ts`, `ui/src/components/swarm/{swarm-dialog,swarm-launcher}.test.tsx` (scoped-owner isolation, borrowed-controller disposal, late refresh and project-keyed launcher), shared task-form/select tests; `.local/swarm/ui-enhancements-final/{live-streams,real-controls}.json` | Actual Railway run streams into website and Editor; website persisted steering and created/cancelled a READY follow-up with exact criteria, zero model calls/workspaces/compute. Native launch and responsive review captured separately; no performance result inferred from these UI checks. |
| US-SWARM-005 | `cli/src/swarm/browser/*.test.ts`, `ui/src/components/swarm/public-swarm-page.test.tsx`, `scripts/swarm/verify-public-ui.ts`, `scripts/swarm/verify-workflow.ts --link-only` | Real session/CSRF/static/coordinator handlers and both managed native hosts verified against explicit simulated workloads: issuance, streaming, steering, artifacts, queue/cancel, readonly, revocation and no broad browser credentials. Evidence `.local/swarm/{public-ui,native-link-ui}/results.json`; public Railway deployment remains unverified. |
| US-SWARM-006 | `cli/src/swarm/outcome/outcome.test.ts`, `packages/ai-core/src/swarm/outcome-review.test.ts`, `scripts/swarm/verify-workflow.ts`, Touch of Death `src/swarm/probe.test.ts` | Executable graph tests cover minimal worker selection, falsification, shared constraint evidence, uncertainty, independent gates and bounded repair. Trusted game probes challenge unchanged-input assumptions. Browser and cloud run evidence are recorded separately from deterministic fixtures. |
| US-SWARM-007 | `cli/src/swarm/archive.test.ts`, `packages/ai-runtime/src/swarm/proxy.test.ts`, both native dialog tests, `scripts/swarm/verify-live.test.ts`, `scripts/swarm/live/review-archive.ts` | WAL serialization, original hash preservation, project scoping, integrity failures, every mutation rejected, no host source/memory writes and explicit archived UI covered. Both managed native hosts inspected real archived run `b9038333-a8a6-445d-85ff-f32de2072a23`, its three experiments and a raw receipt. The archived run is blocked; game outcome acceptance is not inferred. |

US-SWARM-002 engineering extension: `cli/src/swarm/execution/engineering.test.ts`
covers goal-derived tasks without timing, failed baselines with partial retained
artifacts, independent verification/review and unchanged performance approval.
These new fixtures require remote execution; deployment and the source-authored
Touch of Death tutorial browser journey remain separate acceptance evidence.
US-SWARM-002/003 proposal-policy regressions in `execution/patch-policy.test.ts`,
`execution/engineering.test.ts`, `execution/integration.test.ts` and
`outcome/repairs.test.ts` cover retained verifier proposals, independent promotion
blocks, unchanged performance restrictions and complete repair receipts. These
follow-up changes also require remote execution before verified status.
US-SWARM-002 evidence-progress regressions in `execution/evidence-progress.test.ts`
exercise fresh SQLite connections after intervening turns, capture reuse only for
unchanged bytes, read continuation/counts, findings/checkpoints, ownership and
bounded handoffs. The new fixtures and actual worker improvement require remote
verification; persisted receipt code alone does not establish reduced model usage.
`execution/engineering-failure.test.ts` adds interrupted-baseline capture, original
error preservation, bounded readback and cancellation/recovery publication fences.
These fixtures also await remote execution; they do not change an already deployed
coordinator's behavior.

US-SWARM-008: `campaign.test.ts`, `model-budget.test.ts`, `continuation.test.ts`,
`http.test.ts`, `browser/access.test.ts`, `scripts/swarm/launch.test.ts`, shared
source/client/controller tests and `packages/ai-runtime/src/agent-events.test.ts`
cover durable rounds, limits, offline replay, native event waits, access, launch
ordering and cached source identity. Both managed app workflows and the public
browser/download flow passed against explicitly simulated workloads. Evidence:
`.local/swarm/campaign-repair/{native-ui,public-ui}/results.json`. Disposable Git
integration is real; model/cloud/performance workloads are simulated. The new
Railway deployment, originating Codex's live MCP callback, laptop-off campaign
and 15s/30s startup gates are not yet verified.

Explicit execution-kind admission is covered by `coordinator.test.ts` and
`scripts/swarm/launch.test.ts`: a mismatch cannot allocate work or start a source
upload, while legacy omitted-kind requests retain their selected recipe.
`http.test.ts` checks advertised recipe kind/scope through the typed client.
These local fixtures do not establish deployment or live-cloud acceptance.

The [owning acceptance record](swarm.md) retains provider and game scope limits.

The [fifth visual batch](../design-system/next25-batch5-harness.md) owns 42 focused
tests / 169 assertions and 28 four-profile task checks for custom modes and partial
preferences import. Intercepted callbacks establish UI intent and payloads, not
server save acknowledgement; those limits remain explicit in the handoff.

The [fourth visual batch](../design-system/next25-batch4-harness.md) owns 43 focused
tests / 174 assertions and four-size recovery checks for log reading, shortcuts,
usage/reset, preferences import and provider-key removal. Its handoff distinguishes
intercepted UI commands from actual provider, counter and credential mutations.

The [third visual batch](../design-system/next25-batch3-harness.md) records
94 focused tests and four-size browser coverage for US-UI-021/-025/-024,
US-THREADS-010, US-ACTIVATION-004, US-PLANNING-004 and US-RUNS-003.
Its [host-shell report](../../.local/design-system/evidence/next25-batch3-shell/report.json)
also verifies context-dialog focus return and terminal-history navigation.
These checks do not close unrelated provider, reconnect or native runtime gaps.

Maps every shipped user story from [user-stories.md](user-stories.md) to covering tests under `apps/harness/**/*.test.{ts,tsx}` and `packages/ai-core/**/*.test.ts`.

**Depth legend**

The September 4 frontend fixes for responsive project-row actions and changing
composer option counts received code review only; no tests or browser verification
were run for those fixes at the user's request.

September 5 secondary-surface browser checks opened Health from Jobs and Runs,
changed its time window, refreshed diagnostics, and captured desktop/narrow Health
and Assistants/Runs empty states. These fresh-build screenshot and interaction
checks did not rerun the test suites or change the coverage grades below.

- `unit` — colocated unit test at the component or function level
- `integration` — backend websocket or cross-boundary integration
- `unit+integration` — both layers
- `schema-only` — payload shape validated but behavior not asserted
- `none` — no test file touches it

**Gap legend**

- `OK` — covered at appropriate depth
- `GAP-LOW` — thin but exercised indirectly; raise only if behavior drifts
- `GAP-MED` — happy path only; edge / corner cases untested
- `GAP-HIGH` — no test file touches the story; highest priority to close

Roadmap stories are tracked in [user-stories.md](user-stories.md) and excluded from the coverage matrix until they ship.

The 2026-09-04 timer audit closed [CR-050](correctness-review.md#cr-050-high---stream-flush-timers-stop-recurring-after-the-first-batch). Stream-pump tests now cover successive timer-only windows, size-flush rearming, UTF-8 allocation counts, and drain callback failures.

New `US-*` stories start as `GAP-HIGH` here until at least one colocated or integration test covers them. Update the matching story and coverage row together.

US-RUNS-011 scope regression coverage includes runtime-throwing JavaScript that passes static heuristics while explicitly remaining unverified, plus the existing classic-script module mismatch and corrective-plan assertion. The projects integration suite checks that persisted milestones retain the review limitations after a corrective follow-up. This does not add runtime or domain verification to the review.

The 2026-09-19 automation closeout adds adversarial coverage for intent exclusions, pending prerequisite trust, frozen acceptance execution, question guard ordering, interrupted background runs, execution-owned atomic completion, correction policy, and Pi terminal outcomes/turn bounds. Tests distinguish absent checks from passed checks; these gates do not certify arbitrary domain correctness.

---

## WORKSPACE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKSPACE-001 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-WORKSPACE-002 | Workspace repository/runtime/store tests; `ui/src/app.test.tsx`; [foundation repair](../design-system/foundation-repair-2026-11-01.md) | unit + integration + first-run browser journey | Local browser scope; human composition review separate |
| US-WORKSPACE-003 | apps/harness/cli/src/git-preflight.test.ts, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit+integration | GAP-MED |
| US-WORKSPACE-004 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | GAP-MED |
| US-WORKSPACE-005 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-WORKSPACE-006 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx, apps/harness/ui/src/components/project-sidebar.test.tsx (two mounted provider command isolation), apps/harness/cli/src/server-tests/recovery/launch-profile.test.ts, apps/harness/ui/src/store/workspace-page/project-shell-hydration.test.ts, apps/harness/ui/src/components/chat-panel/experience-mode.test.tsx | unit+integration | OK |
| US-WORKSPACE-007 | apps/harness/cli/src/project-search-service.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts | integration | OK |
| US-WORKSPACE-008 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/ide/ide-store.test.ts, apps/harness/ui/src/ide/ide-workbench.test.tsx | unit+integration | OK |
| US-WORKSPACE-009 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |

## THREADS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-THREADS-001 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-THREADS-002 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | GAP-MED |
| US-THREADS-003 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-THREADS-004 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-THREADS-005 | apps/harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-THREADS-006 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts | unit+integration | OK |
| US-THREADS-007 | apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/ui/src/components/project-sidebar.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/cli/src/stream-pump.test.ts | unit+integration | OK |
| US-THREADS-008 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/run-milestone-windows.test.ts, apps/harness/cli/src/run-progress-heartbeats.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts, apps/harness/cli/src/stream-pump.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/chat-panel.browser.test.ts, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit+integration | OK |
| US-THREADS-009 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | OK |
| US-THREADS-010 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/ui/src/components/project-sidebar.test.tsx, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |

## PLANNING

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PLANNING-001 | apps/harness/cli/src/memory-bank.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-storage-tests.ts, apps/harness/ui/src/memory/memory-model.test.ts, apps/harness/ui/src/memory/memory-pane.test.tsx, apps/harness/scripts/selection/capture.ts | unit+integration+browser | OK |
| US-PLANNING-002 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | GAP-MED |
| US-PLANNING-003 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/cli/src/verification/outcomes.test.ts | unit+integration | OK |
| US-PLANNING-004 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx | unit | OK |
| US-PLANNING-005 | apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-PLANNING-006 | apps/harness/ui/src/components/chat-panel.integration.test.tsx | unit | OK |
| US-PLANNING-007 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/execution/execution-main.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PLANNING-008 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PLANNING-009 | apps/harness/ui/src/components/execution-plan-dialog.test.tsx, apps/harness/scripts/design-plan-review/capture.ts | unit+browser | OK |
| US-PLANNING-010 | scripts/context-audit/outcome/execute.test.ts, apps/harness/cli/src/project-discovery/inspect.test.ts, apps/harness/cli/src/project-discovery/workspace-manager.test.ts, apps/harness/cli/src/project-discovery/planning.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/verification/outcomes.test.ts, apps/harness/cli/src/verification/commands.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts | unit+integration | OK |

## RUNS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNS-001 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-002 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-003 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-004 | apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-RUNS-005 | apps/harness/cli/src/git-preflight.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-RUNS-006 | apps/harness/ui/src/components/followup-reset.integration.test.tsx, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-RUNS-007 | apps/harness/cli/src/branchfs-manager.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/memory/memory-model.test.ts | unit+integration | OK |
| US-RUNS-008 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-009 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-010 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-011 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/cli/src/server-tests/correctness/correctness.test.ts | unit+integration | GAP-MED |
| US-RUNS-012 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/server-tests/execution/execution-main.test.ts, apps/harness/cli/src/server-tests/execution/execution-main-1.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/prompt-cache.test.ts, apps/harness/cli/src/gemini-cached-contents.test.ts, apps/harness/cli/src/usage/token-usage.test.ts, apps/harness/ui/src/lib/tests/context-usage.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-013 | apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-RUNS-014 | apps/harness/cli/src/git-preflight.test.ts, apps/harness/cli/src/server-tests/execution/execution-main.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-015 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/pi-agent/execution-controller.test.ts | unit+integration | OK |
| US-RUNS-016 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/persistence/run/complete-agent-run.test.ts | unit+integration | OK |

## PROVIDERS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PROVIDERS-001 | packages/ai-core/src/harness/capabilities.test.ts, apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PROVIDERS-002 | apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts | unit | OK |
| US-PROVIDERS-003 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PROVIDERS-004 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PROVIDERS-005 | apps/harness/cli/src/subagent-defaults.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit+integration | OK |
| US-PROVIDERS-006 | apps/harness/cli/src/provider-credential-store.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/persistence/workspace-repository/schema-migrations.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/harness-websocket.test.ts | unit+integration | OK |
| US-PROVIDERS-007 | apps/harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |

## RUNTIMES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNTIMES-001 | apps/harness/cli/src/agent-runtimes/codex-installation.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/agent-runtimes/cli-health.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/pi-agent/execution-controller.test.ts | unit | OK |
| US-RUNTIMES-002 | apps/harness/cli/src/agent-runtimes/codex-installation.test.ts, apps/harness/cli/src/agent-runtimes/codex-sandbox-policy.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-live.test.ts, apps/harness/cli/src/agent-runtimes/cli-process-manager.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit/integration | OK |
| US-RUNTIMES-003 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/agent-runtimes/cli-session-manager.test.ts, apps/harness/cli/src/agent-runtimes/cli-process-manager.test.ts, apps/harness/cli/src/stream-pump.test.ts, apps/harness/ui/src/terminal/terminal-drawer.test.tsx | unit | OK |
| US-RUNTIMES-004 | apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/server-tests/recovery/launch-profile.test.ts | unit+integration | OK |
| US-RUNTIMES-005 | apps/harness/cli/src/stream-pump.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/agent-runtimes/cli-session-manager.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNTIMES-006 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/protocol.test.ts | unit | GAP-MED |

## WORKTREE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKTREE-001 | apps/harness/cli/src/branchfs/filesystem.test.ts, apps/harness/cli/src/branchfs-manager.test.ts, apps/harness/cli/src/ide-project-service.test.ts | integration | OK |
| US-WORKTREE-002 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-003 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-004 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts, apps/harness/cli/src/pi-planner.test.ts | unit+integration | OK |
| US-WORKTREE-005 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/verification/commands.test.ts, apps/harness/cli/src/verification/outcomes.test.ts, apps/harness/cli/src/server-tests/subagents/subagents-1.test.ts | unit+integration | OK |
| US-WORKTREE-006 | apps/harness/cli/src/branchfs-subagent-integration.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/prompts/subagent-results.test.ts | unit+integration | OK |
| US-WORKTREE-007 | apps/harness/cli/src/branchfs-subagent-integration.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts | unit+integration | OK |
| US-WORKTREE-008 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-009 | apps/harness/cli/src/pi-subagents.test.ts | unit | OK |
| US-WORKTREE-010 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts | unit | GAP-MED |
| US-WORKTREE-011 | apps/harness/cli/src/branchfs/filesystem.test.ts, apps/harness/cli/src/branchfs-cleanup.test.ts, apps/harness/cli/src/branchfs-manager.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |

## ATTACHMENTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ATTACHMENTS-001 | apps/harness/cli/src/chat-attachment-prompt.test.ts, packages/ai-core/src/harness/chat-attachments.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts, apps/harness/cli/src/protocol.test.ts | unit+integration | OK |
| US-ATTACHMENTS-002 | apps/harness/ui/src/components/chat-panel-attachments.test.tsx, apps/harness/cli/src/document-extractors/document-extractors.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts | unit+integration | OK |
| US-ATTACHMENTS-003 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/chat-attachment-prompt.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/protocol.test.ts | unit+integration | OK |
| US-ATTACHMENTS-004 | apps/harness/cli/src/document-extractors/document-extractors.test.ts | unit | OK |

## MODES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MODES-001 | apps/harness/ui/src/components/visual-review/batch8/tasks.test.tsx, apps/harness/ui/src/components/visual-review/batch8/capture.ts, apps/harness/ui/src/store/modes/mode-save-requests.test.ts, apps/harness/ui/src/components/visual-review/batch6/tasks.test.tsx, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts | unit+integration+browser; session draft retention and unload warning, no crash recovery | OK |
| US-MODES-002 | packages/ai-core/src/harness/mode-intent.test.ts, apps/harness/cli/src/workspace-path-intent.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit+integration | OK |
| US-MODES-003 | apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-MODES-004 | packages/ai-core/src/harness/mode-intent.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit+integration | OK |
| US-MODES-005 | packages/ai-core/src/harness/protocol.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/protocol.test.ts | unit+schema | OK |
| US-MODES-006 | apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit+integration | OK |
| US-MODES-007 | apps/harness/cli/src/protocol.test.ts | schema-only | OK |
| US-MODES-008 | apps/harness/cli/src/global-skills.test.ts, apps/harness/cli/src/assistant-capabilities.test.ts, apps/harness/cli/src/pi-subagents.test.ts | unit | OK |

## ASSISTANTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ASSISTANTS-001 | packages/ai-core/src/harness/protocol.test.ts, packages/ai-core/src/harness/intent-contract.test.ts, apps/harness/cli/src/assistant-capabilities.test.ts, apps/harness/cli/src/assistant-intent.test.ts, apps/harness/cli/src/assistant-chat-actions.test.ts, apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/assistant-pagination.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/server-tests/assistant-chat-actions.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts, apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/background-job-source-state.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/assistants-panel.test.tsx, apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/store/tests/assistant-workload-pages.test.ts, packages/ui/scripts/design-system/next-project-flows/capture.ts, apps/harness/ui/src/components/assistants/design-capture.ts | unit+integration+browser | OK |
| US-ASSISTANTS-002 | packages/ai-core/src/harness/protocol.test.ts, apps/harness/cli/src/assistant-pagination.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts, apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts, apps/harness/ui/src/background-job-source-state.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx, apps/harness/ui/src/components/chat-panel.browser.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/store/tests/assistant-workload-pages.test.ts, apps/harness/ui/src/components/assistants/design-capture.ts | unit+integration+browser | OK |
| US-ASSISTANTS-003 | packages/ai-core/src/harness/protocol.test.ts, packages/ai-core/src/harness/intent-contract.test.ts, apps/harness/cli/src/assistant-pagination.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts, apps/harness/ui/src/store/tests/assistant-workload-pages.test.ts | unit+integration | OK |
| US-ASSISTANTS-004 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/server-tests/assistant-chat-actions.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx | unit+integration | GAP-MED |
| US-ASSISTANTS-005 | apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/server-tests/assistant-chat-actions.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts | unit+integration | OK |
| US-ASSISTANTS-006 | apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-job-bootstrap.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx | unit+integration | OK |
| US-ASSISTANTS-007 | packages/ai-core/src/harness/protocol.test.ts, apps/harness/cli/src/assistant-todo-policy.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-job-bootstrap.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx | unit+integration | OK |

## JOBS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-JOBS-001 | apps/harness/cli/src/server-tests/preferences/background-run-control-tests.ts, apps/harness/ui/src/components/visual-review/batch7/tasks.test.tsx, apps/harness/ui/src/components/visual-review/batch7/capture.ts, apps/harness/cli/src/persistence/workspace-repository/shell-arguments.test.ts, packages/ai-core/src/harness/intent-contract.test.ts, apps/harness/cli/src/ansi-storage.test.ts, apps/harness/cli/src/background-job-schedule.test.ts, apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/run-diagnostics.test.ts, apps/harness/cli/src/run-failure-classification.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts, apps/harness/ui/src/components/background-jobs-panel.test.tsx, apps/harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-JOBS-002 | apps/harness/ui/src/app.test.tsx, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/ui/src/components/background-jobs-panel.test.tsx, apps/harness/ui/src/components/chat-panel.browser.test.ts, packages/ui/scripts/design-system/harness-debt/capture.ts, apps/harness/ui/src/components/background-jobs/job-editor.test.tsx, apps/harness/ui/src/components/primitives/execution-log.test.tsx, packages/ui/scripts/design-system/harness-debt/capture-next-jobs.ts | unit+browser | OK |
| US-JOBS-003 | apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts | integration | OK |
| US-JOBS-004 | apps/harness/ui/src/components/visual-review/batch8/tasks.test.tsx, apps/harness/ui/src/store/background-jobs/job-save-requests.test.ts, apps/harness/cli/src/server-tests/job-save-acknowledgement.test.ts, apps/harness/cli/src/background-job-schedule.test.ts, apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts | unit+integration | OK |

## NOTIFICATIONS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-NOTIFICATIONS-001 | apps/harness/cli/src/server-tests/background-run-notifications.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx, packages/ui/scripts/design-system/next-project-flows/capture.ts | unit+browser | OK |
| US-NOTIFICATIONS-002 | apps/harness/cli/src/notification-ids.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx | unit+integration | OK |
| US-NOTIFICATIONS-003 | apps/harness/ui/src/components/primitives/overlay-stack.test.ts, apps/harness/ui/src/components/primitives/portal-scale.test.tsx, apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx | unit | OK |

## BROWSER

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-BROWSER-001 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/cli/src/server-tests/browser-approvals.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-BROWSER-002 | apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-BROWSER-003 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/cli/src/server-tests/browser-approvals.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit+integration | OK |

## ACTIVATION

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ACTIVATION-001 | apps/harness/cli/src/server/runtime/ui-serving.test.ts, apps/harness/cli/src/ui-build.test.ts, apps/harness/scripts/launcher-release.test.ts, apps/harness/scripts/release-workflow.test.ts | unit+integration+executable | GAP-MED |
| US-ACTIVATION-002 | apps/harness/ui/src/components/setup-checklist-card.test.tsx, apps/harness/cli/src/setup-health.test.ts | unit | OK |
| US-ACTIVATION-003 | apps/harness/ui/src/components/setup-checklist-card.test.tsx, apps/harness/ui/src/lib/tutorial-progress.test.ts, apps/harness/cli/src/setup-health.test.ts | unit | OK |
| US-ACTIVATION-004 | apps/harness/ui/src/app.test.tsx, apps/harness/ui/src/components/help-tutorial-dialog.test.tsx, apps/harness/ui/src/components/tutorial-overlay.test.tsx, apps/harness/ui/src/lib/tutorial-progress.test.ts | unit | OK |
| US-ACTIVATION-005 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-ACTIVATION-006 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | GAP-MED |
| US-ACTIVATION-007 | apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/lib/tutorial-progress.test.ts | unit+integration | OK |
| US-ACTIVATION-008 | packages/desktop-runtime/src/desktop-runtime.test.ts, apps/harness/cli/src/desktop-app.test.ts, apps/harness/cli/src/desktop-server.test.ts, apps/harness/ui/src/ide/ide-launch.test.ts | unit+integration | OK |

## UI

Terminal lifetime evidence supplements US-RUNTIMES-003 and US-UI-023/-024:
`ui/src/terminal/renderers/xterm-renderer.test.tsx` and drawer tests cover equal
buffer/version session switches, project identity, live input locks, pending paste,
stale handles and disposal. The controlled real-renderer fixture in
`apps/harness/.local/code-standards/terminal-tutorial-runtime.json` exercises
keyboard/clipboard routing and tutorial target/goal gates. It has no PTY or
backend transport; it does not close existing live-terminal acceptance gaps.
`tutorial-overlay.test.tsx` also proves independent tutorial provider commands
and progress for US-ACTIVATION-004.

October 17 startup loading evidence supplements US-UI-010/-022/-023:
`cli/src/ui-build.test.ts` verifies split-module output and contained chunk serving;
`ui/src/components/markdown-content.test.tsx` covers deferred highlighting and copy.
`.local/engine-perf/startup-fix-20261017/apps/harness-browser-final.json` records
the real isolated managed host loading terminal, IDE and swarm only on navigation,
retaining terminal state after close, with no page errors. This checks surface
loading and computed styles after CSS consolidation, not new shell execution or cloud submission. The prior shared-backend
probe failed websocket compatibility and is retained separately. Production static
JS closure measurements are build evidence, not readiness timings.

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-UI-001 | apps/harness/ui/src/app.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.browser.test.ts, packages/ui/src/workbench/panel-group.test.tsx | unit+browser | OK |
| US-UI-002 | packages/ui/src/primitives/selection/select-control.test.tsx, apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx, apps/harness/ui/src/components/primitives/dropdown.test.tsx, apps/harness/ui/src/components/primitives/overlay-stack.test.ts, apps/harness/ui/src/components/primitives/portal-scale.test.tsx, apps/harness/ui/src/components/modal-dismiss.integration.test.tsx, apps/harness/ui/src/toast-store.test.ts | unit+integration | OK |
| US-UI-003 | apps/harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |
| US-UI-004 | — | none | GAP-LOW |
| US-UI-005 | apps/harness/ui/src/components/ui-primitive-guard.test.ts | unit | OK |
| US-UI-006 | apps/harness/ui/src/app.test.tsx | unit | OK |
| US-UI-007 | apps/harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-008 | apps/harness/ui/src/components/chat-panel.test.tsx | unit | GAP-MED |
| US-UI-009 | Chat/chat-integration, theme/apply and Preferences tests; `hyperfocus/ui-foundation`; [foundation repair](../design-system/foundation-repair-2026-11-01.md) | actual selected/sent effort state, theme-state contrast, invalid custom-theme recovery, rendered host controls | Local browser scope; automated checks do not establish taste |
| US-UI-010 | apps/harness/ui/src/components/markdown-content.test.tsx, packages/ui/src/transcript/chat-transcript.test.tsx, packages/ui/src/transcript/chat-transcript.browser.test.ts | unit+browser | OK |
| US-UI-011 | apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx | unit | OK |
| US-UI-012 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | OK |
| US-UI-013 | apps/harness/ui/src/toast-store.test.ts, apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-UI-014 | apps/harness/ui/src/app.test.tsx | unit | OK |
| US-UI-015 | apps/harness/cli/src/run-milestone-windows.test.ts, apps/harness/cli/src/server-tests/subagents/subagents.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit+integration | OK |
| US-UI-016 | apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-017 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/memory/memory-model.test.ts, apps/harness/ui/src/memory/memory-pane.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit | OK |
| US-UI-018 | apps/harness/ui/src/components/notification-inbox.test.tsx | unit | GAP-MED |
| US-UI-019 | apps/harness/ui/src/components/usage/usage-summary.test.tsx; apps/harness/ui/src/store/usage-requests.test.ts; apps/harness/ui/src/components/preferences-modal.test.tsx; apps/harness/cli/src/usage/codex-usage.test.ts; apps/harness/scripts/usage/verify-ui.ts | component + SQLite reopen + multi-client commands + browser | Historical and externally consumed tokens cannot be attributed |
| US-UI-020 | apps/harness/cli/src/tool-activity-state.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/streamed-tool-block.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-UI-022 | apps/harness/ui/src/store/workspace-page-state.test.ts, packages/ui/src/transcript/chat-transcript.test.tsx, packages/ui/src/transcript/chat-transcript.browser.test.ts | unit+browser | OK |
| US-UI-021 | apps/harness/ui/src/lib/trace-panel-model.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx (project switch without remount preserves retry availability and target), apps/harness/ui/src/components/background-jobs/jobs-roster.test.tsx, apps/harness/ui/src/app.test.tsx, packages/ui/scripts/design-system/capture-jobs.ts, packages/ui/scripts/design-system/harness-debt/capture.ts | unit+browser | OK |
| US-UI-022 | apps/harness/cli/src/ide-project-service.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts, apps/harness/ui/src/ide/ide-store.test.ts, apps/harness/ui/src/ide/ide-workbench.test.tsx, apps/harness/ui/src/app.test.tsx | unit+integration | OK |
| US-UI-023 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts, apps/harness/cli/src/terminal/terminal-session-manager.test.ts, apps/harness/ui/src/app.test.tsx, apps/harness/ui/src/terminal/terminal-drawer.test.tsx, apps/harness/ui/src/terminal/terminal-links.test.ts | unit+integration | GAP-MED |
| US-UI-024 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/terminal/terminal-session-manager.test.ts, apps/harness/cli/src/terminal/terminal-ws-mock-client.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/terminal/terminal-drawer.test.tsx, apps/harness/ui/src/terminal/terminal-store.test.ts, apps/harness/ui/src/terminal/terminal-keybindings.test.ts | unit+integration | OK |
| US-UI-025 | apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/chat-panel/experience-mode.test.tsx, apps/harness/ui/src/components/chat-panel.browser.test.ts, apps/harness/ui/src/app.test.tsx | unit+browser | OK |

Jobs visual acceptance supplements US-JOBS-001 and US-UI-ROADMAP-005:
`apps/harness/ui/src/components/background-jobs/jobs-roster.test.tsx` covers
selection and command semantics; `packages/ui/scripts/design-system/capture-jobs.ts`
covers the real rendered roster with intercepted synthetic data. See
[evidence and limitations](../design-system/jobs-roster.md). This does not extend
that browser evidence to live scheduler execution.

The [next-25 Harness handoffs](../design-system/next25-surfaces.md) supplement
US-ASSISTANTS-002/-004, US-BROWSER-002 and the navigation stories. Focused routes:
`primitives/left-pane/left-pane.test.tsx`, `primitives/virtual-list.test.tsx`,
`assistants/question-column.test.tsx`, `assistants-panel.test.tsx`,
`trace-panel.test.tsx` and `streamed-tool-block.test.tsx` under UI components.
Browser scripts are `packages/ui/scripts/design-system/next25-rosters/capture.ts`
and the two `assistants/next25-*-capture.ts` runners documented in the handoff.
These add keyboard, enlarged-text, empty-to-loaded and recovery evidence; they do
not close the broader integration gaps or certify live provider execution.

The [second 25-surface batch](../design-system/next25-batch2-surfaces.md) adds
project-search state/destination checks, terminal rename cancellation/focus,
search keyboard behavior and real command-bar menu/Resume interaction. Focused
tests live in `ide/visual-review/batch2-search.test.tsx` and
`terminal/tests/batch2-controls.test.tsx`. Seven chat task fixtures cover planner
answers, attachment removal, reference insertion, diff selection, Run outcome,
Events metadata and Git preflight consequences. These are browser/callback
contracts; no live provider, Git mutation or terminal execution is certified.

## PERSISTENCE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PERSISTENCE-001 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PERSISTENCE-002 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PERSISTENCE-003 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PERSISTENCE-004 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PERSISTENCE-005 | apps/harness/cli/src/server-tests/runtime-budget.test.ts | integration | OK |
| US-PERSISTENCE-006 | apps/harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-PERSISTENCE-007 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/persistence/workspace-repository/schema-migrations.test.ts, apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PERSISTENCE-008 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-009 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/cli/src/persistence/workspace-repository/schema-migrations.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-PERSISTENCE-010 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts | integration | OK |
| US-PERSISTENCE-011 | apps/harness/cli/src/provider-credential-store.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/harness-websocket.test.ts | unit+integration | OK |
| US-PERSISTENCE-012 | apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-013 | apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PERSISTENCE-014 | apps/harness/cli/src/browser-session-state.test.ts | unit | OK |
| US-PERSISTENCE-015 | apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PERSISTENCE-016 | apps/harness/cli/src/harness-paths.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit | OK |

## PREFERENCES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PREFERENCES-001 | apps/harness/ui/src/app.test.tsx, apps/harness/ui/src/components/preferences/preferences-controls.test.tsx, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/harness-websocket.test.ts, packages/ui/scripts/design-system/harness-debt/capture.ts | unit+integration+browser | OK |
| US-PREFERENCES-002 | apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PREFERENCES-003 | apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/models/model-select.test.tsx, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/assistants-panel.test.tsx, apps/harness/scripts/selection/capture.ts | unit+browser | OK |
| US-PREFERENCES-004 | apps/harness/cli/src/server/commands/preferences-shared-defaults.test.ts, apps/harness/ui/src/components/preferences/providers/preferences-defaults.test.tsx, apps/harness/ui/src/app.test.tsx, apps/harness/cli/src/prompts/design-guidance.test.ts, packages/ai-core/src/runtime/user-preferences.test.ts, packages/ai-core/src/runtime/design-context.test.ts, packages/ui/scripts/design-system/capture-providers.ts | unit+integration+browser; composition routing and planner/execution injection are deterministic tests, not generated-screen acceptance | OK |

## DEV

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-DEV-001 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/websocket-send-guard.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts, apps/harness/cli/src/desktop-server.test.ts | unit+integration | OK |
| US-DEV-002 | apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/cli-entry.test.ts | unit | GAP-MED |
| US-DEV-003 | apps/harness/scripts/dev/start.test.ts, packages/desktop-runtime/src/dev-process.test.ts, apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/ui-build.test.ts, apps/harness/ui/src/mount-app.test.tsx | unit+integration | OK |
| US-DEV-004 | apps/harness/scripts/dev/start.test.ts, apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/server-tests/startup/startup.test.ts | unit+integration | GAP-LOW |
| US-DEV-005 | apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-006 | apps/harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-007 | apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/cli-entry.test.ts, apps/harness/cli/src/doctor-cleanup.test.ts | unit | GAP-MED |
| US-DEV-008 | apps/harness/cli/src/cli-update-checker.test.ts, apps/harness/cli/src/server-tests/preferences/preferences-storage-tests.ts, apps/harness/ui/src/components/notification-inbox.test.tsx, apps/harness/cli/src/cli-entry.test.ts, apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/fatal-startup-log.test.ts, apps/harness/cli/src/server/runtime/ui-serving.test.ts, apps/harness/cli/src/ui-build.test.ts, apps/harness/scripts/launcher-assets.test.ts, apps/harness/scripts/launcher-release.test.ts, apps/harness/scripts/release-workflow.test.ts | unit+integration+executable | OK |
| US-DEV-009 | apps/harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-010 | apps/harness/scripts/testing/test-runner.test.ts, apps/harness/scripts/coverage-matrix.test.ts | unit | OK |
| US-DEV-011 | — | none | GAP-LOW |
| US-DEV-012 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/dev-db-recovery.test.ts | integration | OK |
| US-DEV-013 | apps/harness/cli/src/dev-db-recovery.test.ts, apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-014 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/persistence/workspace-repository/schema-migrations.test.ts | integration | OK |
| US-DEV-015 | apps/harness/cli/src/dev-db-recovery.test.ts, apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-016 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-DEV-017 | apps/harness/ui/src/utils/tests/test-harness.ts, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts, packages/ui/src/transcript/chat-transcript.browser.test.ts | integration+browser | OK |
| US-DEV-018 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts, apps/harness/cli/src/server-tests/support/server-test-harness.test.ts | unit+integration | OK |
| US-DEV-019 | apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts | unit | OK |
| US-DEV-020 | apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts, apps/harness/cli/src/trace-timestamps.test.ts, apps/harness/ui/src/lib/trace-panel-model.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-DEV-021 | apps/harness/cli/src/development-telemetry.test.ts | unit | OK |
| US-DEV-022 | apps/harness/ui/src/components/ui-primitive-guard.test.ts | unit | OK |
| US-DEV-023 | apps/harness/scripts/screenshot.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts | unit | OK |
| US-DEV-024 | apps/harness/cli/src/startup-telemetry.test.ts, apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/server-tests/runtime-budget.test.ts | unit+integration | OK |
| US-DEV-025 | apps/harness/cli/src/agent-runtimes/toolchain.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts | unit | OK |
| US-DEV-026 | apps/harness/scripts/dev/start.test.ts, packages/desktop-runtime/src/dev-process.test.ts, apps/harness/cli/src/server-tests/startup/startup.test.ts | unit+integration | GAP-MED |

## SEARCH

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-SEARCH-001 | apps/harness/cli/src/project-search-service.test.ts, apps/harness/ui/src/components/project-switcher-dialog.test.tsx, apps/harness/ui/src/app.test.tsx, packages/ui/scripts/design-system/next-project-flows/capture.ts | unit+integration+browser | OK |
| US-SEARCH-002 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-SEARCH-003 | apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts, apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit+integration | OK |

## MARKDOWN

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MARKDOWN-001 | apps/harness/ui/src/components/markdown-content.test.tsx, packages/ui/src/transcript/chat-transcript.test.tsx, packages/ui/src/transcript/chat-transcript.browser.test.ts | unit+browser | OK |
| US-MARKDOWN-002 | apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |

---

## Priority gaps

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|

### Very high priority left open

- **US-ACTIVATION-001 / US-DEV-002 / US-DEV-007** - the portable release path is covered, while bootstrap and doctor still need end-to-end activation coverage.

### Other GAP-MED (happy path only)

- US-WORKSPACE-003 / -004, US-THREADS-002 / -005, US-PLANNING-002, US-RUNS-011, US-PROVIDERS-001 / -007, US-RUNTIMES-006, US-WORKTREE-010, US-MODES-001, US-ASSISTANTS-004, US-BROWSER-002, US-ACTIVATION-006, US-UI-003 / -008 / -018 / -020 / -022 / -023, US-PERSISTENCE-006 / -013 / -015, US-DEV-020 / -026

### GAP-LOW (exercised indirectly, raise only on drift)

- US-UI-004 (lucide icon consistency), US-DEV-011 (`bun run typecheck` invocation)
