# Correctness Review

Static review date: 2026-04-24.
Last merged targeted CLI scan: 2026-04-24.
Last merged targeted UI thread-state scan: 2026-04-24.
Last merged targeted UI/CLI bridge scan: 2026-04-24.
Last merged targeted harness anti-pattern scan: 2026-04-24.
Last merged targeted assistant skill-scope scan: 2026-04-25.
Last merged targeted harness slop-category scan: 2026-04-25.
Last merged targeted websocket and streaming performance scan: 2026-04-25.
Last merged targeted assistant surface scan: 2026-04-25.
Last merged targeted overlay, hotkey, and attachment-affordance scan: 2026-04-25.
Last merged targeted UI rendering, OS/CLI, websocket continuity, execution, and test-strictness scan: 2026-04-25.
Last merged targeted UI-magic affordance scan: 2026-04-25.
Last merged targeted reliability diagnostics and background ownership closeout: 2026-05-01.
Last merged working-tree branch scan: 2026-05-12.
Last merged deep harness scan: 2026-06-01.
Last merged targeted onboarding flow scan: 2026-06-15.
Last merged targeted virtual-list first-paint scan: 2026-06-24.
Last merged targeted chat file-link affordance scan: 2026-06-24.
Last merged targeted assistant/background approval flow scan: 2026-06-25.
Last merged targeted bulk-action audit and market scan: 2026-06-28.
Last merged deep vestigial-code and complexity audit: 2026-08-22.
Last merged robustness, persistence, process, and orchestration audit: 2026-08-22.
Last merged repository-wide correctness and architecture scan: 2026-08-23.
Last clean post-merge convergence scan across runtime, tooling, and UI: 2026-08-23 (no distinct findings beyond CR-114).
Current working-tree release-blocker closeout: 2026-08-28 (CR-074, CR-083, CR-085, and CR-094 closed with focused and full-suite evidence).
Last merged measured streaming and timer audit: 2026-09-04 (CR-050 reopened for recurring flush scheduling and per-character allocation).
Last merged automation-integrity audit: 2026-09-19 (current working tree; task contracts, completion authority, verification, uncertainty, and runtime outcomes).

Source of truth: [user-stories.md](user-stories.md), [coverage-matrix.md](coverage-matrix.md), [root README](../../README.md), and harness implementation under [harness](../../apps/harness).

This review focuses on correctness gaps outside the expected happy path. It does not replace `bun test`; it maps shipped stories to likely edge failures and extraction opportunities.

Recent closeout note: assistant summary/detail and assistant-owned job/run loading now use scoped SQL-backed pages, assistant bootstrap and reprioritize JSON is schema-validated with one repair attempt, background job deletion stops active runs before deleting durable rows, and the scheduler honors the assistant congestion-control preference. The remaining gaps below stay focused on overlay behavior, lifecycle setup refresh, and other dense rendering surfaces.

Virtualized transcript, trace, and sidebar lists now depend on responsive row measurement: dynamic-height rows must be allowed to grow and shrink after container reflow, while reverse lists must continue opening at the latest content and preserve browsing position when older rows load.

Virtual-list first paint now has primitive-level browser coverage for real geometry, visibility, and scroll anchoring before and after tab switches. Keep extending it when app-specific tab surfaces add new virtualized panes.

Project chat path linking now uses a shared modifier-click contract for rendered chat, tool, trace, assistant, and execution-log text. Future non-chat file path surfaces should reuse the same project-owned link adapter.

Bulk actions add a new cross-surface risk: the same selected set must be understood by the UI, websocket commands, project-chat handoffs, assistant maintenance scripts, and durable readback before destructive or live mutations are safe.

## Automation Integrity Assessment — 2026-09-19

Scope: current working-tree Harness runtime, shared AI contracts/runtime, foreground and background completion, task inference, question policy, and acceptance evidence. Three independent read-only subagent investigations covered foreground verification, background reliability, and primitive/provider boundaries; the main review examined intent inference and diagnostics. Existing unrelated changes were preserved. Only this review document was edited for the audit.

Verdict: the repository has substantial assistance and execution infrastructure, but the examined paths do not establish a dependable autonomous task-success boundary. Typed plans, durable intent, process cleanup, capacity limits, isolated integration, cancellation, and recovery states are valuable foundations. Several paths still promote model prose, inferred guidance, or the absence of an exception into host-owned facts. The immediate work is to repair those transitions and enforce existing contracts, not replace the model or add another orchestration layer.

The supplied assistance-versus-automation argument is a design lens, not evidence about why these models behave as they do. This audit did not test training objectives, compare RLHF with other training, or establish that removing post-training would improve reliability. Its findings concern observable software contracts and control flow.

| Principle | Current evidence | Assessment |
| --- | --- | --- |
| Optimize verifiable task outcomes | Plans contain verification commands and intent evidence requirements; completion can bypass execution (CR-042), checks can be skipped (CR-115), and a resolved question can become success (CR-117). | Completion is not yet a trustworthy task-acceptance signal. |
| Preserve uncertainty and truthful failure | Structural-review summaries expressly leave runtime/domain/plan completion unverified. In contrast, question reuse can bypass blockers (CR-116), and Pi results omit terminal provider status (CR-119). | Honest limits exist, but are not enforced consistently across boundaries. |
| Select bounded, suitable tasks | Frozen contracts, prerequisites, path ownership, and project discovery provide task structure. Inference adds unwanted deliverables (CR-060), and planners can pre-certify prerequisites (CR-046). | Structure alone does not preserve the right task or establish its preconditions. |
| Enforce reliability in software | Runtime budgets, staging, capacity governance, and owned cancellation exist. Internal continuation bypasses budget reservation (CR-120); correction routing bypasses iteration policy (CR-118). | Strong primitives are weakened by alternate execution paths. |

Capability limits, distinct from newly confirmed bugs:

- `US-RUNS-011` deliberately promises structural heuristics, not semantic acceptance. Its regression fixture allows startup-throwing JavaScript to pass with the unverified disclaimer. Keep that truthful scope; do not relabel it a complete correctness oracle.
- [Diagnostics](../../apps/harness/cli/src/run-diagnostics.ts) and their [repository query](../../apps/harness/cli/src/persistence/workspace-repository/operations/background-1.ts) aggregate classified failures, backoff, and prompt sizes. They do not measure accepted outcomes against attempted tasks, false success, or decision calibration. The failure query excludes `partial-complete` and unclassified successes. A healthy operational report cannot establish automation accuracy.
- The [selected roadmap item](todo.md#selected-next-todo) already calls for a run ledger and proof bundle. Treat proof/acceptance as unfinished capability, rather than claiming its absence violates a shipped full-verification promise.
- Partial retry creates a fresh job/agent run rather than restoring an effect-aware checkpoint (see CR-062). Source inspection identifies repeat-effect risk; this audit did not reproduce a duplicate external side effect. Do not advertise exactly-once execution or safe replay for arbitrary jobs.

Recommended delivery order: first prevent false success and blocker bypass (CR-042, CR-116, CR-117, CR-119); then make existing task/prerequisite/check contracts authoritative (CR-060, CR-046, CR-115); close alternate-path policy and budget bypasses (CR-118, CR-120). Use one initial automation acceptance boundary: a scoped change in one package, producing a reviewable patch plus independent test evidence, with no external publication or non-idempotent effects. Reuse current isolation and command/process owners. Persist check identity, input/target revision, outcome, and evidence; invalidated or missing evidence remains unverified. Expand task classes only when each has an observable acceptance condition and recovery behavior.

Evaluation should include tasks with known outcomes and deliberate failure injection: unsupported task, unmet prerequisite, failing declared check, partial provider text plus error, duplicate unanswered blocker, stale evidence after correction, interrupted execution, and replay after partial effects. Report verified acceptance, false-success frequency, unresolved/abstained outcomes, recovery success, and cost per accepted task separately from conversational quality and infrastructure health. This is a proposed acceptance boundary, not a measured model benchmark.

Verification: 70 existing tests passed across seven files (238 assertions): intent contracts, diagnostics, orchestrator, assistant question policy, background executor, portable runtime contracts, and bounded JSON extraction. Direct probes reproduced intent expansion, skipped verification, overwritten corrective checks, blocking-policy bypass, false background success, accepted planner completion status, and Pi controller terminal/budget defects. The Pi probes used exact production controller source transpiled in memory with simulated sessions because the installed SDK import could not resolve `@mariozechner/pi-ai`; they do not establish live-provider behavior. The correction-policy finding is source-confirmed, not integration-reproduced. `bun run check:process-policy` passed with 3,075 files and zero violations. No full Harness suite, browser, packaged launcher, live provider, or external side-effect workflow was exercised; earlier full-suite statements elsewhere in this document are historical.

## Story To Code Map

| Story area | Main implementation surfaces | Highest edge risk |
| --- | --- | --- |
| WORKSPACE, SEARCH | [server](../../apps/harness/cli/src/server.ts), [workspace repository](../../apps/harness/cli/src/workspace-repository.ts), [project search](../../apps/harness/cli/src/project-search-service.ts), [project switcher](../../apps/harness/ui/src/components/project-switcher-dialog.tsx) | Project open flows are repeated across add, create, and browse; validation behavior can drift. |
| THREADS, PERSISTENCE | [workspace repository](../../apps/harness/cli/src/workspace-repository.ts), [runtime store](../../apps/harness/cli/src/workspace-runtime-store.ts), [UI store](../../apps/harness/ui/src/harness-store.ts), [chat panel](../../apps/harness/ui/src/components/chat-panel.tsx), [sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx) | Always-on legacy migration work can overwrite valid current thread state during restart; runtime and persisted overlays can then disagree. |
| PLANNING, RUNS | [server lifecycle](../../apps/harness/cli/src/server.ts), [planner](../../apps/harness/cli/src/pi-planner.ts), [orchestrator](../../apps/harness/cli/src/pi-orchestrator.ts), [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx), [chat panel](../../apps/harness/ui/src/components/chat-panel.tsx) | Repeated run lifecycle guards and controller state make stale or cross-thread commands risky. |
| WORKTREE | [BranchFS manager](../../apps/harness/cli/src/branchfs-manager.ts), [subagent integration](../../apps/harness/cli/src/branchfs-subagent-integration.ts), [orchestrator](../../apps/harness/cli/src/pi-orchestrator.ts), [subagent scheduler](../../apps/harness/cli/src/pi-subagents.ts) | Same-worktree ownership now covers Windows case and already-dirty drift; remaining risk is broader BranchFS promotion and integration behavior. |
| PROVIDERS, RUNTIMES | [runtime registry](../../apps/harness/cli/src/agent-runtimes/runtime-registry.ts), [Codex adapter](../../apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.ts), [Pi adapter](../../apps/harness/cli/src/pi-agent-adapter.ts), [protocol](../../packages/ai-core/src/harness/protocol/index.ts), [CLI session manager](../../apps/harness/cli/src/agent-runtimes/cli-session-manager.ts), [UI store](../../apps/harness/ui/src/harness-store.ts) | Live CLI session ownership is now thread-checked; remaining risk is liveness and slow-client transport behavior. |
| ATTACHMENTS | [attachment prompt builder](../../apps/harness/cli/src/chat-attachment-prompt.ts), [document extractors](../../apps/harness/cli/src/document-extractors), [attachment UI](../../apps/harness/ui/src/components/chat-panel-attachments.test.tsx) | Attachments now bind to trusted upload metadata; remaining risk is remote object expiry and richer upload cleanup UX. |
| ASSISTANTS, JOBS, NOTIFICATIONS | [assistant manager](../../apps/harness/cli/src/assistant-manager.ts), [background scheduler](../../apps/harness/cli/src/background-job-scheduler.ts), [background executor](../../apps/harness/cli/src/background-job-executor.ts), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx) | Assistant pause, circuit-breaker, bootstrap, job routing, and linked assets cross several paths and can drift from the dedicated assistant surface contract. |
| UI, MARKDOWN | [UI store](../../apps/harness/ui/src/harness-store.ts), [run status helpers](../../apps/harness/ui/src/lib/run-status.ts), [markdown content](../../apps/harness/ui/src/components/markdown-content.tsx), [primitives](../../apps/harness/ui/src/components/primitives), [app shell](../../apps/harness/ui/src/app.tsx) | Overlay dismissal, focus isolation, hotkey ownership, and live markdown workload can drift across dense surfaces. |
| BULK ACTIONS | [context menu primitive](../../apps/harness/ui/src/components/primitives/context-menu.tsx), [project sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [protocol](../../packages/ai-core/src/harness/protocol/index.ts), [server](../../apps/harness/cli/src/server.ts) | Selection gestures, right-click menus, chat handoffs, assistant maintenance, and backend mutations can drift unless one operation contract owns preview, apply, partial failure, and readback. |
| DEV, ACTIVATION | [launch harness](../../apps/harness/cli/src/launch-harness.ts), [CLI entry](../../apps/harness/cli/src/cli-entry.ts), [scripts](../../apps/harness/scripts), [setup health](../../apps/harness/cli/src/setup-health.ts), [setup checklist](../../apps/harness/ui/src/components/setup-checklist-card.tsx), [tutorials](../../apps/harness/ui/src/components/tutorial-definitions.ts) | Top-level CLI parsing is covered; remaining activation risk is end-to-end first-run recovery plus keeping setup readiness paired with project lifecycle and local tutorial state. |
| MAGIC UI AFFORDANCES | [project switcher](../../apps/harness/ui/src/components/project-switcher-dialog.tsx), [composer](../../apps/harness/ui/src/components/chat-panel.tsx), [setup checklist](../../apps/harness/ui/src/components/setup-checklist-card.tsx), [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx) | High-polish interactions need typed state, OS capability checks, reduced-motion paths, and stable test hooks before they can feel magical without lying. |
| SHARED CLIENT, DESKTOP OPEN | [AI core client](../../packages/ai-core/src/client.ts), [desktop transport](../../apps/harness/cli/src/server/transport/bun-server.ts), [desktop runtime](../../packages/desktop-runtime/src/deep-link.ts) | Reconnect generations and native project activation can bypass the event ownership used by normal websocket commands. |
| SHARED UI, PREFERENCES | [shared UI](../../packages/ui/src), [harness primitives](../../apps/harness/ui/src/components/primitives), [harness store](../../apps/harness/ui/src/harness-store.ts), [editor preferences](../../apps/engine-editor/src/app/editor-preferences.ts) | Parallel primitives, overlay stacks, and storage adapters make supposedly shared behavior diverge between first-party apps. |

## Findings

### CR-026: Closed - assistant launch gate is shared

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-004`, `US-RUNS-013`, `US-JOBS-003`.

Status: Closed. Assistant chat, bootstrap, reprioritize, scheduler launch, and manual background launch now use the shared assistant launch gate. Paused, deleted, and circuit-tripped assistants are rejected before runtime work starts.

Remaining watch item: keep new assistant-owned runtime entry points behind the same gate instead of adding local pause checks.

### CR-027: Closed - assistant-owned background output stays out of normal project chat

Stories: `US-ASSISTANTS-002`, `US-ASSISTANTS-004`, `US-JOBS-002`, `US-JOBS-003`.

Status: Closed. Assistant-owned background work is routed through assistant/job state and the assistant Jobs surface instead of appending routine automation transcripts into normal project chat.

Remaining watch item: any future "promote to chat" behavior should be explicit user action with a compact linked summary.

### CR-028: Closed - bootstrap retry is single-flight

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-PERSISTENCE-007`.

Status: Closed. Bootstrap attempts now join in-flight work unless force retry starts a newer attempt. Attempt ids prevent stale completions from winning.

Coverage: [assistant manager regressions](../../apps/harness/cli/src/assistant-manager.test.ts) verify duplicate bootstrap calls join one promise and an older completion cannot replace a forced retry's state.

Remaining watch item: keep stale persisted `running` recovery aligned with the same attempt-id model.

### CR-029: Closed - project and job deletion stop active background runs first

Stories: `US-WORKSPACE-005`, `US-JOBS-001`, `US-JOBS-004`.

Status: Closed. Job deletion and project removal now cancel active background runs, stop linked agent runs, emit run/job/notification updates, and abort live controllers before durable rows are removed.

Coverage: [background run control regressions](../../apps/harness/cli/src/server-tests/preferences/background-run-control-tests.ts) exercise deletion of an active job through direct and bulk commands, including durable job/run removal when post-commit project rehydration fails.

Remaining watch item: future destructive lifecycle commands should use the same stop-first helper.

### CR-030: Closed - assistant inbox answer ownership is enforced

Stories: `US-ASSISTANTS-002`, `US-NOTIFICATIONS-001`, `US-RUNS-013`.

Status: Closed. Assistant question answer updates now require matching assistant ownership and fail when no matching row transitions.

Remaining watch item: stale already-answered question transitions are tracked under CR-053.

### CR-031: Closed - assistant prompts and asset refs use structured runtime input

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-MODES-001`, `US-PROVIDERS-002`.

Code map: [assistant prompt builder](../../apps/harness/cli/src/assistant-manager.ts), [assistant capabilities](../../apps/harness/cli/src/assistant-capabilities.ts), [assistant factory](../../apps/harness/cli/src/assistant-factory.ts), [runtime registry](../../apps/harness/cli/src/agent-runtimes/runtime-registry.ts).

Status: Closed. Assistant prompts now render structured identity, operational logic, active mission, and bounded context sections. Asset refs resolve to scoped capabilities before persistence and launch, and runtime/model selection passes through supported runtime capability checks.

Coverage: [assistant capability tests](../../apps/harness/cli/src/assistant-capabilities.test.ts), [assistant factory tests](../../apps/harness/cli/src/assistant-factory.test.ts), and [assistant manager tests](../../apps/harness/cli/src/assistant-manager.test.ts).

Remaining watch item: keep future provider-brand additions in the ordered schema migration path covered by CR-074 instead of relying on fresh-schema-only constraints.

### CR-032: Closed - assistant jobs and runs load through scoped pages

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-002`, `US-ASSISTANTS-003`.

Code map: [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [assistant workload state](../../apps/harness/ui/src/assistant-workload-state.ts), [background-job source state](../../apps/harness/ui/src/background-job-source-state.ts), [assistant protocol](../../packages/ai-core/src/harness/protocol/client-command-assistants.ts), [backend paging and workload SQL owner](../../apps/harness/cli/src/assistant-pagination.ts), and the [workspace repository facade](../../apps/harness/cli/src/workspace-repository.ts).

Status: Closed. Opening an assistant's Jobs tab now requests independently optional job and run pages through an assistant-scoped command. Backend paging binds every assistant cursor to its owner and collection, scans bounded raw SQLite rows past invalid persisted records, and derives deterministic continuation positions from the raw sort keys. The UI owns workload results separately from the broad background-jobs snapshot, tracks request ownership and retryable failures, and requests continuation pages explicitly.

Coverage: [protocol tests](../../packages/ai-core/src/harness/protocol.test.ts), [assistant paging tests](../../apps/harness/cli/src/assistant-pagination.test.ts), [websocket tests](../../apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts), [assistant workload store tests](../../apps/harness/ui/src/store/tests/assistant-workload-pages.test.ts), [background-job source state tests](../../apps/harness/ui/src/background-job-source-state.test.ts), and [assistant panel tests](../../apps/harness/ui/src/components/assistants-panel.test.tsx).

Remaining watch item: `connection.ready` still carries the broad background-jobs snapshot for the first-party Jobs and Runs surfaces; this closeout is intentionally limited to the independently bounded Assistant Jobs tab.

### CR-033: Closed - overlay dismissal and focus behavior has a stack owner

Stories: `US-UI-002`, `US-UI-005`, `US-ACTIVATION-004`, `US-NOTIFICATIONS-003`.

Code map: [dialog primitive](../../apps/harness/ui/src/components/primitives/dialog.tsx), [sheet primitive](../../apps/harness/ui/src/components/primitives/sheet.tsx), [popover primitive](../../apps/harness/ui/src/components/primitives/popover.tsx), [tutorial overlay](../../apps/harness/ui/src/components/tutorial-overlay.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx), [chat composer popovers](../../apps/harness/ui/src/components/chat-panel.tsx).

Status: Closed for shared `Dialog`, `Sheet`, and `Popover` primitives. They now register with a shared overlay stack, route topmost Escape handling through it, trap focus in modal surfaces, restore prior focus, and have nested popover-in-dialog plus popover-in-sheet tests.

Remaining watch item: keep tutorial, tooltip, toaster, IDE, and terminal overlays on the same stack as those surfaces evolve.

### CR-034: Global hotkeys and composer submit paths do not fully respect input ownership

Stories: `US-SEARCH-001`, `US-THREADS-007`, `US-PLANNING-006`, `US-UI-016`, `US-UI-017`.

Code map: [app shortcuts](../../apps/harness/ui/src/app.tsx), [chat composer shortcuts](../../apps/harness/ui/src/components/chat-panel.tsx), [assistant panel textareas](../../apps/harness/ui/src/components/assistants-panel.tsx), [notification inbox answers](../../apps/harness/ui/src/components/notification-inbox.tsx), [chat panel tests](../../apps/harness/ui/src/components/chat-panel.test.tsx).

Impact: The project switcher shortcuts register with input ignoring disabled and only guard the project-switcher input itself. That means `Mod+K` or `Mod+Space` can open navigation while the user is typing in chat, assistant, notification, preferences, or scheduler inputs. The chat composer also has both a TanStack `Enter` hotkey and a textarea `onKeyDown` submit path, while the actual submit handler still does not consume the full disabled-state predicate.

Edge cases:

- A user typing in a textarea hits `Mod+K` and loses flow to the project switcher.
- The focused composer can submit through two keyboard paths that are harder to keep aligned than one form-level path.
- `Enter` submit can still bypass disabled button state for streaming, setup-gated, or attachment-gated sends unless every path shares the same eligibility helper.
- Tests cover shortcut registration and happy-path keyboard submit, but not shortcut suppression across all text inputs or double-path submit prevention.

Fix direction: Centralize hotkey ownership with an `isEditableTarget` guard or TanStack input-ignore configuration, then opt in only where a shortcut is explicitly meant to work inside text input. Make composer `Enter`, form submit, and send button use one authoritative submit-state helper and add tests for input-owned `Mod+K`, `Shift+Enter`, disabled `Enter`, and no duplicate dispatch.

### CR-035: Attachment drag-and-drop has no visible affordance or durable unsent state

Stories: `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, `US-PERSISTENCE-008`, roadmap upload hygiene stories.

Code map: [chat attachments UI](../../apps/harness/ui/src/components/chat-panel.tsx), [attachment guardrail tests](../../apps/harness/ui/src/components/chat-panel-attachments.test.tsx), [attachment prompt builder](../../apps/harness/cli/src/chat-attachment-prompt.ts), [draft persistence](../../apps/harness/ui/src/harness-store.ts).

Impact: The composer supports file selection and per-thread text draft persistence, but there is no drag-over or drop-zone state for files and unsent attachment chips are component-local. A user can drag files over the chat surface without visual confirmation, or switch threads and lose unsent uploaded attachment context even though the text draft survives.

Edge cases:

- Dragging an image or PDF over the app gives no target feedback before release.
- Switching project, thread, or active surface clears component-local attachment chips while the text draft remains restored.
- Removed or abandoned unsent uploads have no visible cleanup lifecycle yet.
- Tests cover attachment gating and upload guardrails, but not drag-over UI, thread-switch preservation, or abandoned-upload cleanup.

Fix direction: Add an explicit composer drop-zone overlay with clear enabled, blocked, and uploading states. Decide whether unsent attachment refs belong in per-thread browser draft state or need server-side orphan cleanup; then cover drag/drop, thread switch, reload, and removal flows.

### CR-036: Project switcher polish lacks typed project metadata and activity signals

Stories: `US-WORKSPACE-002`, `US-WORKSPACE-006`, `US-SEARCH-001`, `US-SEARCH-003`, `US-JOBS-002`, `US-NOTIFICATIONS-001`, `US-PROVIDERS-ROADMAP-003`.

Code map: [project switcher](../../apps/harness/ui/src/components/project-switcher-dialog.tsx), [project search service](../../apps/harness/cli/src/project-search-service.ts), [sidebar thread badges](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx), [workspace repository](../../apps/harness/cli/src/workspace-repository.ts).

Impact: The switcher currently distinguishes recent projects, filesystem matches, exact paths, and git folders, but it does not carry framework metadata, active background job counts, pending approval counts, or thread previews. Sidebar cards know thread badge state, and the inbox knows pending prompts or approvals, but the spotlight flow cannot show that activity before switching. A folder dragged from the OS into the browser also cannot be treated as a trustworthy local project root unless the browser or launcher provides a real directory handle or native path bridge; normal web drag/drop exposes files, not a safe absolute folder path.

Edge case: A user opens `Cmd/Ctrl+K` while another project has a paused approval or failing background job. The switcher shows only name, path, and `Git repo`, so the user must switch projects or open the inbox to discover the action item. If folder drag/drop is implemented as plain browser `DataTransfer` file handling, it can silently degrade to file uploads, lose the absolute root path, or create a project from an untrusted synthetic name.

Fix direction: Add a server-derived project metadata summary for switcher rows: root type, detected frameworks or runtimes, active run state, pending approval or question counts, and recent user-thread previews. Treat drag-to-open folder as capability-gated: prefer the File System Access API when available, otherwise fall back to the existing typed `project.browse` or exact path flow instead of pretending browser drop can reveal trusted local paths. Add keyboard tests for right-arrow peek behavior, stale previews after thread deletion, and activity badges after background job or notification updates.

### CR-037: Composer "magic" is local polish without a complete draft contract

Stories: `US-MODES-001`, `US-MODES-004`, `US-RUNTIMES-006`, `US-PROVIDERS-001`, `US-PROVIDERS-ROADMAP-012`, `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, `US-PERSISTENCE-008`, `US-MARKDOWN-ROADMAP-001`.

Code map: [composer controls](../../apps/harness/ui/src/components/chat-panel.tsx), [model capabilities](../../packages/ai-core/src/harness/capabilities.ts), [capability schema](../../packages/ai-core/src/harness/protocol/index.ts), [browser draft store](../../apps/harness/ui/src/harness-store.ts), [markdown renderer](../../apps/harness/ui/src/components/markdown-content.tsx).

Impact: The composer has useful typed controls, but several polish affordances are not backed by enough state. Placeholders are based mostly on run state and selected agent, not the selected workflow mode. Model metadata has tags and summaries, but no normalized speed, quality, or cost scores for compact tradeoff visuals. Draft attachments are component-local while text drafts persist per thread. The textarea resizes to eight lines, not a viewport-bound 50% cap, and live draft code-fence formatting would require a real editor model instead of styling a plain textarea.

Edge case: A user selects Debug mode and gets a generic "Ask agent to work inside path" placeholder instead of stack-trace-oriented guidance. They upload attachments, switch threads, and return to a restored text draft with missing unsent chips. They compare GPT Mini and Gemini Flash but see only prose summaries, so "fast" and "expensive" tags cannot support a compact sparkline without hardcoded UI guesses.

Fix direction: Define one draft state model covering text, attachments, mode, selected runtime, selected model, and upload lifecycle per `(projectId, threadId)`. Add mode-specific placeholder copy through the mode contract, numeric or bucketed model tradeoff metadata in the capability schema, and a viewport-bound composer height policy with internal scroll. Keep draft syntax highlighting as a deliberate editor upgrade with accessibility and performance tests, not textarea CSS.

### CR-038: Run and trace surfaces do not yet provide proof-level visual review

Stories: `US-THREADS-008`, `US-RUNS-002`, `US-RUNS-003`, `US-RUNS-007`, `US-RUNS-011`, `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-003`, `US-RUNS-ROADMAP-001`, `US-RUNS-ROADMAP-002`, `US-RUNS-ROADMAP-003`.

Code map: [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx), [chat run pane](../../apps/harness/ui/src/components/chat-panel.tsx), [run milestone protocol](../../packages/ai-core/src/harness/protocol/index.ts), [BranchFS manager](../../apps/harness/cli/src/branchfs-manager.ts), [server experiment commands](../../apps/harness/cli/src/server.ts).

Impact: Subagents and tool activity render as lists, while the plan has prerequisite and contract data that could drive swimlanes or dependency state. BranchFS experiment review opens a dialog with one whole diff block, not a per-file, side-by-side diff with changed-path navigation. Copy actions cover messages and plan summaries, but not a structured share bundle that combines environment, recent logs, run state, and failing commands. This keeps the system inspectable, but not yet proof-rich enough for fast trust decisions.

Edge case: A parallel run stalls because one prerequisite or subagent is waiting. The user sees subtask cards and latest status text, but cannot visually distinguish queued, blocked, running, and completed lanes over time. After an isolated experiment finishes, the user can inspect a monolithic diff, but large changes are hard to review without file navigation or side-by-side context before promote.

Fix direction: Model run visualization as typed evidence, not decorative animation. Add prerequisite and subagent timing events, per-file diff summaries or hunks, and a share-context formatter fed by bounded run artifacts. Keep full snapshots for recovery, but add narrow UI deltas for live swimlanes, roll-up milestone pills, and structured proof bundles that survive refresh.

### CR-039: Motion-heavy polish needs a shared accessibility and state contract

Stories: `US-UI-002`, `US-UI-005`, `US-UI-016`, `US-UI-017`, `US-NOTIFICATIONS-001`, `US-NOTIFICATIONS-003`, `US-RUNS-005`, `US-MARKDOWN-ROADMAP-001`.

Code map: [app shell](../../apps/harness/ui/src/app.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx), [chat transcript](../../apps/harness/ui/src/components/chat-panel.tsx), [project sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx), [UI primitives](../../apps/harness/ui/src/components/primitives), [store event reducer](../../apps/harness/ui/src/harness-store.ts).

Impact: Several requested "magic" effects would currently be one-off UI state: notification bounce, ambient transcript tint, dirty-git caution tape, thread-swap skeletons, hold-to-reveal shortcuts, confetti, smooth scroll magnet, deterministic avatars, and quote-reply selection. These are attractive fit-and-finish ideas, but adding them independently would duplicate overlay, hotkey, animation, color-status, and focus behavior that is already a known drift point.

Edge case: A bounce or confetti animation ignores `prefers-reduced-motion`; ambient tint becomes the only visible state cue; a shortcut overlay appears while a textarea owns `Ctrl`; a quote tooltip fights browser text selection or markdown code-copy buttons; thread-swap skeletons render stale shapes after a quick project switch.

Fix direction: Create shared primitives for reduced-motion-aware attention animation, status tinting with non-color labels, skeleton surfaces, selection popovers, and shortcut overlays. Each should have `data-test-*` hooks, keyboard and focus rules, and tests for nested overlays, editable targets, reduced motion, fast thread switching, and no layout shift.

### CR-040: Portable launcher still assumes source-style dependency repair

Stories: `US-DEV-007`, `US-DEV-002`, `US-ACTIVATION-001`.

Code map: [CLI entry](../../apps/harness/cli/src/index-main.ts), [doctor cleanup](../../apps/harness/cli/src/doctor-cleanup.ts), [dependency health](../../apps/harness/cli/src/dependency-health.ts), [launcher packaging](../../apps/harness/scripts/package-launcher.ts), [launcher assets](../../apps/harness/scripts/launcher-assets.ts), [runtime health](../../apps/harness/cli/src/setup-health.ts).

Impact: Doctor cleanup now resolves against a harness root sentinel instead of caller cwd, which closes the earlier arbitrary `dist` deletion risk. The remaining activation gap is that the packaged launcher copies `dist/ui`, the monorepo root `package.json`, agent rules, and skills, but not a release-owned repair manifest. Cross-target packaging also copies the build host's `@vscode/ripgrep` binary and names it from `process.platform`; the target triple is never passed to asset packaging. Portable repair is therefore source-shaped, and `--all` or cross-architecture output can contain an incompatible native executable.

Edge case: A release user runs `pi-harness --doctor` from the portable folder and receives source-checkout repair guidance. Or Windows x64 builds Linux ARM64 and packages `bin/rg.exe` containing a Windows x64 executable, while the target launcher expects `bin/rg`.

Fix direction: Treat portable runtime assets as a target-specific contract. Pass the compile target into asset packaging, resolve and validate the matching native package, and generate a minimal release repair manifest or show launcher-specific reinstall/update guidance. Cover doctor, Codex, ripgrep, and browser-tool checks from extracted release directories across the supported target matrix.

### CR-041: Closed - preferences panel uses the visible controls as test and accessibility surface

Stories: `US-PREFERENCES-001`, `US-PREFERENCES-002`, `US-UI-005`, `US-UI-017`.

Code map: [preferences panel](../../apps/harness/ui/src/components/preferences-modal.tsx), [preferences tests](../../apps/harness/ui/src/components/preferences-modal.test.tsx), [UI store](../../apps/harness/ui/src/harness-store.ts).

Status: Closed. The hidden interactive shim is gone; real controls carry accessible labels and stable hooks. Focused coverage asserts that hidden test-only controls are not exposed.

Coverage: [preferences tests](../../apps/harness/ui/src/components/preferences-modal.test.tsx).

### CR-042: Run lifecycle transitions can be forged, partial, or no-op

Stories: `US-RUNS-004`, `US-RUNS-009`, `US-RUNS-016`, `US-PLANNING-002`, `US-THREADS-010`, `US-PERSISTENCE-007`.

Code map: [run commands](../../apps/harness/cli/src/server.ts), [managed execution](../../apps/harness/cli/src/managed-agent-execution.ts), [planning answer persistence](../../apps/harness/cli/src/workspace-repository.ts), [shared protocol](../../packages/ai-core/src/harness/protocol/index.ts).

Impact: Several lifecycle commands validate shape but not enough state. Public `run.complete` can finalize a `planning`, `awaiting-user-input`, or `ready` run with arbitrary assistant text. Final assistant message append and run status update are not one transaction. Active `run.refresh` reports a deferred refresh, but the deferred path records completion without actually restarting or reconciling. Batch planning answers validate only supplied ids, so a stale client can answer one question and resume while sibling required questions remain pending. Thread archive persists before live CLI or run activity is stopped.

Edge case: A ready plan waiting for approval receives stale `run.complete`; the run becomes completed and a final assistant answer is persisted without execution. Or a refresh during streaming shows "refresh after current stream" while no refresh happens after completion.

Fix direction: Make run lifecycle transitions state-machine driven and transaction-backed. Restrict completion to execution-owned active states, commit final message plus status atomically, store and execute deferred refresh intent, require all required pending questions before resume, and stop live activity before archiving or expose a failed-archive state.

2026-09-19 partial closeout: [client run commands](../../apps/harness/cli/src/server/commands/runs.ts) reject client-authored completion, and [foreground finalization](../../apps/harness/cli/src/server/execution/completion.ts) requires the current non-aborted owner. [Persistence](../../apps/harness/cli/src/persistence/run/complete-agent-run.ts) commits final text and terminal status atomically from active execution states. [Websocket tests](../../apps/harness/cli/src/server-tests/runtime-budget-tests.ts) reject ready/active/terminal client completion and prove normal execution completion; [transaction tests](../../apps/harness/cli/src/persistence/run/complete-agent-run.test.ts) cover wrong-thread, unexecuted, repeated, and injected-failure rollback. Remaining historical refresh, partial-answer, and thread-archive observations above are not closed by this change.

### CR-043: Background `partial-complete` is terminal in one layer but not in command policy

Stories: `US-JOBS-001`, `US-JOBS-002`, `US-JOBS-004`, `US-RUNS-003`.

Code map: [background command guards](../../apps/harness/cli/src/background-job-command-guards.ts), [background executor](../../apps/harness/cli/src/background-job-executor.ts), [background job panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [shared protocol](../../packages/ai-core/src/harness/protocol/index.ts).

Impact: Repository and protocol treat `partial-complete` as terminal, but stop and retry guards do not share that policy. Stop can pass guard and then no-op in persistence, while retry rejects the exact partial run that should be recoverable.

Edge case: A background AI run partially succeeds after subagent failure. The UI shows a recoverable-looking terminal run, but Retry is unavailable or rejected and Stop appears possible even though the row is already terminal.

Fix direction: Move background run status predicates into one shared policy. Mark `partial-complete` terminal, decide whether it is retryable, and make UI affordances, command guards, and repository transitions use the same helper.

### CR-044: Draft, attachment, and inbox submit paths clear or close before backend acceptance

Stories: `US-PERSISTENCE-014`, `US-THREADS-007`, `US-PLANNING-002`, `US-ATTACHMENTS-002`, `US-RUNS-013`, `US-NOTIFICATIONS-001`.

Code map: [websocket queue](../../apps/harness/ui/src/harness-websocket.ts), [UI store command dispatch](../../apps/harness/ui/src/harness-store.ts), [chat composer](../../apps/harness/ui/src/components/chat-panel.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx).

Impact: Chat send clears text and attachment chips immediately after dispatch even when the websocket only queued the command while disconnected. `command.rejected` is a no-op in the store, so stale project, stale thread, preflight, or backend rejection does not restore the draft. Planner quick-choice buttons bypass the attachment-disabled send predicate, and notification inbox assistant answers can be submitted while global pause is active even though the backend rejects them.

Edge case: A user sends during reconnect and closes the tab before queued commands flush; the text draft and unsent attachment chips are gone. Or they attach a file, click a planner quick option, and the answer sends without the attachment context the UI still appears to hold.

Fix direction: Add a pending-send draft contract keyed by request id. Clear drafts only after accepted message or run-start acknowledgement, restore on reject or dropped queue, and make quick choices, inbox answers, Enter, and send buttons share one eligibility helper with pause and attachment reasons.

### CR-045: BranchFS and IDE nested-root and symlink trust — repaired 2026-10-07

Stories: `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-003`, `US-WORKTREE-007`, `US-WORKSPACE-003`, `US-UI-022`.

Code map: [BranchFS manager](../../apps/harness/cli/src/branchfs-manager.ts), [BranchFS integration](../../apps/harness/cli/src/branchfs-subagent-integration.ts), [IDE project service](../../apps/harness/cli/src/ide-project-service.ts), [server experiment commands](../../apps/harness/cli/src/server.ts).

Impact: BranchFS baseline dirty fingerprints are gathered from the repo root, but promotion can recompute hashes from the selected project root and join repo-relative paths under that nested root. Tracked symlinks are recreated in isolated mounts while hashing and diffing skip symlink targets, so writes through a symlink can pierce isolation or vanish from review. The IDE blocks lexical `../` paths, but file reads and writes follow symlinks inside the project. Isolated subagent integration also assumes root `package.json` exists before it can decide which verification steps to skip.

Edge case: A nested project has an unchanged dirty file outside its selected subfolder. Promotion says "Base dirty state changed" even though the user changed nothing. A symlink inside the project points outside the root; IDE preview or BranchFS execution can touch the external target.

Fix direction: Canonicalize project root, repo root, and real target paths through one filesystem trust helper. Include symlink metadata in BranchFS materialization and diff review, reject or sandbox writable symlinks, and let integration skip package-script verification when no package file exists.

Filesystem failure handling repaired 2026-10-07: the shared BranchFS filesystem
helpers distinguish missing paths from denied/failed I/O. Integration propagates
read failures and cleans its lease; disposal retains ownership until deletion
succeeds. Manual retention waits for removal and canonicalizes Windows path aliases.
[Filesystem lifetime tests](../../apps/harness/cli/src/branchfs/filesystem.test.ts)
and [integration tests](../../apps/harness/cli/src/branchfs-subagent-integration.test.ts)
exercise denied reads, failed deletion, retry, lease retention and real removal.
Nested-root and symlink repairs now use one dirty-state reader for preparation and
promotion, with repository-relative hashing and identical project scope and
generated-path exclusions. Source symlinks are rejected; mount-created links are
included in inspection and rejected before integration or promotion writes.
IDE reads, writes and directory access validate resolved ancestors against the
selected root. Real junction fixtures verify that external files remain unchanged.
Integration without `package.json` reports verification as unverified when no
checks were declared. Evidence: `branchfs-manager.test.ts`,
`branchfs-subagent-integration.test.ts`, and `ide-project-service.test.ts`.

### CR-046: Planner plan schemas validate shape but not semantic invariants

Stories: `US-PLANNING-003`, `US-PLANNING-010`, `US-WORKTREE-004`, `US-WORKTREE-005`.

Code map: [planner schema](../../packages/ai-core/src/harness/protocol/index.ts), [orchestrator plan parser](../../apps/harness/cli/src/pi-orchestrator.ts), [planner](../../apps/harness/cli/src/pi-planner.ts).

Impact: The planner prompt describes invariants such as difficulty thresholds for subagents, empty subtasks for non-subagent plans, prerequisite ordering, and non-overlapping same-worktree paths. The schema accepts contradictory plans, and the orchestrator can route from `difficultyScore` and contracts while ignoring `usesSubagents`.

Edge case: Model output says `usesSubagents: false` but includes conflicting subagent contracts, or says same-worktree while owned paths overlap. The plan persists as valid and later execution chooses surprising fan-out or isolation behavior.

Fix direction: Add semantic `superRefine` or normalization before persistence. Fail or repair contradictory `usesSubagents`, difficulty, contracts, prerequisites, and worktree strategy fields before any plan reaches the ready card.

2026-09-19 partial closeout: fresh model prerequisites normalize to pending; only frozen persisted host completion survives resume. Foreground and background execution run declared prerequisite checks, persist completion after passing, and block dependent work on failed/missing acceptance. The shared execute-ready gate rejects pending prerequisites even if a caller omits the setup phase. [Outcome tests](../../apps/harness/cli/src/verification/outcomes.test.ts) and [background websocket scenarios](../../apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts) cover forged completion and prerequisite failure. Other plan invariants described above remain a separate open scope.

### CR-047: Closed - browser approval commands validate run and thread ownership

Stories: `US-BROWSER-001`, `US-BROWSER-002`, `US-BROWSER-003`, `US-NOTIFICATIONS-001`.

Code map: [browser approval command](../../packages/ai-core/src/harness/protocol/index.ts), [browser approval handler](../../apps/harness/cli/src/server.ts), [browser session state](../../apps/harness/cli/src/browser-session-state.ts), [notification sync](../../apps/harness/cli/src/server.ts).

Status: Closed for stale foreground approval resolution. The server now requires the payload thread id to match the target run, the pending approval lookup includes run id plus session and tool ids, and websocket coverage proves a wrong-thread approval leaves the pending approval untouched before the owning-thread command succeeds.

Remaining watch item: keep future background-run browser approval notifications on the same durable locator, including assistant-owned and subagent-owned browser sessions.

### CR-048: Debug artifacts bypass the normal redaction and budget path

Stories: `US-UI-020`, `US-DEV-020`, `US-RUNS-011`.

Code map: [tool artifact writes](../../apps/harness/cli/src/server.ts), [tool activity redaction](../../apps/harness/cli/src/tool-activity-state.ts), [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx).

Impact: Normal tool activity persistence has redaction and bounded previews, but debug-mode artifact files write raw tool args and results with JSON serialization. Browser, shell, MCP, or provider payloads can persist secrets or prompt-like data under debug artifacts even when the UI trace is sanitized.

Edge case: A browser tool result includes cookies, auth headers, or a page payload with an API token. The trace view hides sensitive fields, but `.local/debug/tool-artifacts` keeps the raw value on disk.

Fix direction: Reuse the same sanitizer and aggregate budgets before debug artifact persistence. Store artifacts under a trusted harness or project debug root and add tests that raw secrets are redacted before disk write.

### CR-049: Provider model namespace and cache identity can drift after user choice changes

Stories: `US-PROVIDERS-001`, `US-PROVIDERS-002`, `US-PROVIDERS-006`, `US-RUNTIMES-006`, `US-RUNS-012`, `US-ATTACHMENTS-003`.

Code map: [model resolver](../../apps/harness/cli/src/server.ts), [Claude defaults](../../apps/harness/cli/src/pi-planner.ts), [Gemini cache persistence](../../apps/harness/cli/src/workspace-repository.ts), [Gemini cache helper](../../apps/harness/cli/src/gemini-cached-contents.ts).

Impact: Pi model availability accepts OpenAI ids by default and Google ids for Gemini, but Claude provider mode does not accept `anthropic/*` ids in the same path. A user-selected Claude model can be treated as unavailable and silently replaced by the default. Gemini cached content lookup is keyed by attachment/model/cache metadata but not by credential or account, so an API key rotation can reuse a cache name created under the old key.

Edge case: User selects a specific Claude Opus model and execution falls back to Sonnet. Later they replace the Google key and the next run reuses an old `cachedContents/...` name that the new account cannot access.

Fix direction: Centralize provider namespace mapping and fallback policy: `gpt` to `openai/*`, `gemini` to `google/*`, `claude` to `anthropic/*`. Include a credential/account fingerprint in Gemini cache identity or clear provider caches on key change.

### CR-050: High - stream flush timers stop recurring after the first batch

Stories: `US-THREADS-008`, `US-RUNTIMES-003`, `US-RUNTIMES-005`, `US-UI-023`.

Code map: [terminal session manager](../../apps/harness/cli/src/terminal/terminal-session-manager.ts), [CLI session manager](../../apps/harness/cli/src/agent-runtimes/cli-session-manager.ts), [terminal store](../../apps/harness/ui/src/terminal/terminal-store.ts), [stream pump](../../apps/harness/cli/src/stream-pump.ts).

Status: Closed on 2026-09-04. Timer ownership is released for timed and size-triggered flushes, so later short output schedules another window. UTF-8 widths no longer allocate a buffer per code point. Serial drain ownership also survives synchronous callback failure and reentrant output.

Coverage: [stream pump tests](../../apps/harness/cli/src/stream-pump.test.ts) cover successive timer-only windows, size-flush rearming, UTF-8 boundaries and lone surrogates, a constant encoding-allocation count, serial async draining, reentrant callbacks, output bounds, and terminal cleanup. Existing terminal manager, CLI session, and terminal store tests retain their lifecycle coverage.

Serial A/B/B/A replay of 1 MiB ASCII measured 40.9 to 21.0 ms median and 95.6 to 48.4 million thread cycles, including drain, with chunk parity. These local measurements are diagnostic; portable tests gate behavior and allocation count. Raw samples and replay scripts are under `.local/engine-perf/2026-09-04-audit/` (`fix-stream.json`, `fix-stream-bench.ts`).

Remaining watch item: whole-process shutdown and owner disposal remain under CR-070; duplicated stream-reader cancellation helpers remain an extraction opportunity.

### CR-051: Dense UI and state loaders still do unbounded work before visual caps help

Stories: `US-THREADS-001`, `US-THREADS-010`, `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-UI-010`, `US-UI-015`, `US-UI-020`, `US-UI-023`.

Code map: [assistant state loading](../../apps/harness/cli/src/workspace-repository.ts), [project sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar-view.tsx), [markdown renderer](../../apps/harness/ui/src/components/markdown-content.tsx), [streamed tool block](../../apps/harness/ui/src/components/streamed-tool-block.tsx), [terminal renderer](../../apps/harness/ui/src/terminal/renderers/xterm-renderer.tsx).

Impact: The September 5 source recheck confirms that collapsed tool activity blocks still render every activity row, derive a key from the entire activity list, and build the complete copy string during rendering. Collapse changes CSS height rather than bounding work. Assistant detail now has SQL paging; the current sidebar uses flattened rows and Markdown uses coalesced text with a stable renderer, so the earlier sidebar/remount descriptions should not be treated as current failures without new evidence.

Edge case: A chat with thousands of collapsed tool activities still creates all activity rows and formats their complete copy payload even when only a small portion is visible.

Fix direction: Bound mounted activity rows and upstream retained data, lazily build copy/export payloads on user action, and add DOM-node and formatting-work budgets across increasing activity counts. Revalidate the other consumers before carrying forward their older descriptions.

### CR-052: IDE and terminal controls bypass shared overlay and button primitives

Stories: `US-UI-002`, `US-UI-022`, `US-UI-023`.

Code map: [IDE workbench](../../apps/harness/ui/src/ide/ide-workbench.tsx), [terminal tabs](../../apps/harness/ui/src/terminal/terminal-tabs.tsx), [dialog primitive](../../apps/harness/ui/src/components/primitives/dialog.tsx), [button primitive](../../apps/harness/ui/src/components/primitives/button.tsx).

Impact: The IDE command palette is a bespoke fixed overlay without dialog semantics, focus trap, or shared overlay-stack ownership. IDE editor tab close is a clickable icon inside a tab button rather than a named keyboard-reachable control. Terminal tabs put a `span role="button"` inside a `button`, which is invalid nested interaction and lacks normal Enter/Space handling.

Edge case: Keyboard focus can leave the command palette into the background, or land on a terminal close span where keypress does not close the tab and may activate the parent tab instead.

Fix direction: Route command palette through shared dialog or overlay-stack primitives. Split tabs into label and close sibling controls, use real button derivatives with tooltip and accessible labels, and add keyboard and focus tests for IDE and terminal tabs.

### CR-053: Assistant question and retry paths still bypass shared launch and question-state gates

Stories: `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-ASSISTANTS-004`, `US-JOBS-001`, `US-JOBS-003`, `US-NOTIFICATIONS-001`.

Code map: [assistant manager](../../apps/harness/cli/src/assistant-manager.ts), [assistant question persistence](../../apps/harness/cli/src/workspace-repository.ts), [assistant commands](../../apps/harness/cli/src/server.ts), [background run launch](../../apps/harness/cli/src/server.ts), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx).

Impact: The single assistant-question answer path can overwrite stale, resolved, or dismissed questions, while batch answer paths check pending or deferred state. Assistant-owned background retry creates a new run before checking pause or circuit-breaker state, so the launch gate later cancels a doomed run and leaves noisy history. The inbox also exposes answer actions under pause differently than the dedicated assistant panel.

Edge case: A stale inbox command answers an already answered assistant question, appends durable learning again, and reprioritizes the assistant. Or a circuit-tripped assistant job retry creates a fresh cancelled run instead of rejecting before history changes.

Fix direction: Make assistant question transitions require `(assistantId, questionId, status in pending/deferred)`. Run the shared assistant launch gate before retry-run creation, and feed the same pause and circuit-breaker reasons into assistant panel, jobs panel, and notification inbox affordances.

### CR-054: Setup health can go stale across project lifecycle changes

Stories: `US-WORKSPACE-005`, `US-ACTIVATION-003`, `US-ACTIVATION-006`.

Code map: [project lifecycle commands](../../apps/harness/cli/src/server.ts), [setup health](../../apps/harness/cli/src/setup-health.ts), [setup checklist](../../apps/harness/ui/src/components/setup-checklist-card.tsx), [project lifecycle tests](../../apps/harness/cli/src/server-tests/projects/workspace-project-tests.ts).

Impact: Setup state is meant to be server-derived per machine, but project lifecycle events do not all recompute and emit it. `project.add`, `project.create`, `project.browse`, and `project.activate` refresh setup after mutation; `project.remove` broadcasts `project.removed` and related surfaces without refreshing setup. After deleting the active or final project, clients can keep a stale `project-selected` ready check and ready-count summary.

Edge case: A first-run user opens a project, then removes it. The workspace returns to empty, but the activation center or help dialog can still report that the project requirement is ready until a manual refresh or reconnect.

Fix direction: Route project add, create, browse, activate, and remove through one lifecycle helper that updates repository/runtime state, emits the workspace/project event, recomputes setup, and broadcasts `setup.updated`. Add integration coverage that final-project removal emits `project-selected` as action-required.

### CR-055: The setup checklist exposes a Hide action that can be a no-op

Stories: `US-ACTIVATION-003`, `US-UI-017`.

Code map: [setup checklist](../../apps/harness/ui/src/components/setup-checklist-card.tsx), [chat onboarding surface](../../apps/harness/ui/src/components/chat-panel.tsx), [setup visibility predicate](../../apps/harness/ui/src/harness-store.ts).

Impact: The setup card always shows `Hide` when the parent passes `onDismiss`, but the visibility predicate forces the card to stay mounted whenever any required first-task check is not ready. During first-run blockers, clicking `Hide` sets local state false but the card remains visible, making the onboarding surface feel broken.

Edge case: A user with no project or no usable agent clicks `Hide` to focus on the empty-state sample task. The card immediately remains visible because required checks still block first task readiness.

Fix direction: Only show the hide control when it can actually hide the card, or add a dismissed-until-setup-version state with an explicit restore path. Cover the forced-blocker case in store and component tests.

### CR-056: Closed - tutorial completion is tied to actual onboarding progress

Stories: `US-ACTIVATION-004`, `US-ACTIVATION-003`, `US-ACTIVATION-007`.

Code map: [tutorial definitions](../../apps/harness/ui/src/components/tutorial-definitions.ts), [tutorial overlay](../../apps/harness/ui/src/components/tutorial-overlay.tsx), [tutorial progress store](../../apps/harness/ui/src/harness-store.ts), [tutorial tests](../../apps/harness/ui/src/components/tutorial-overlay.test.tsx).

Status: Closed. Tutorial goals now map to settled project selection, usable-agent health, a sent user message, or execution having started. Intermediate steps require an interaction with the highlighted target, missing targets cannot be clicked through, and `finishTutorial` defensively rejects unresolved goals. Help distinguishes `Available`, `Goal reached`, `Dismissed`, and `Completed`.

Edge case: A user starts `Connect provider or runtime` before opening a project. The agent selector target is missing, the fallback text appears, and the user can click through to completion without connecting any provider or CLI runtime.

Coverage: [tutorial goal tests](../../apps/harness/ui/src/lib/tutorial-progress.test.ts), [overlay tests](../../apps/harness/ui/src/components/tutorial-overlay.test.tsx), and [help dialog tests](../../apps/harness/ui/src/components/help-tutorial-dialog.test.tsx) guard missing targets, unresolved goals, setup-derived progress, and status wording.

### CR-057: Virtualized lists can pass Happy DOM tests while first browser paint is blank or stale

Stories: `US-THREADS-008`, `US-UI-015`, `US-UI-017`, `US-DEV-017`.

Code map: [virtual list primitive](../../apps/harness/ui/src/components/primitives/virtual-list.tsx), [chat panel](../../apps/harness/ui/src/components/chat-panel.tsx), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx), [UI test harness](../../apps/harness/ui/src/utils/tests/test-harness.ts).

Status: Closed for the primitive, project chat transcript, websocket-hydrated app first load, and assistant chat transcript. `VirtualList` now has a real-browser first-paint smoke that mounts reverse and forward lists, delays viewport height stabilization, asserts visible row geometry and anchoring before any tab remount, then repeats the checks after tab switches. Project chat also has browser coverage for delayed workspace hydration and a no-`ResizeObserver` path; assistant chat now has its own first-paint fixture. The main work surface explicitly fills its measured panel height, preventing an 85,085px auto-height transcript viewport from defeating virtualization; the app browser smoke guards the bounded viewport.

Impact: Happy DOM tests prove that virtualized transcript, trace, assistant, jobs, and run-detail lists render expected rows in a stubbed DOM, but they do not prove real browser first paint. Happy DOM has no layout engine, and several tests stub scroll metrics or row rectangles. A list can therefore pass because fallback estimates produce DOM rows, while the real browser first mount can still render an empty, clipped, or stale scroll window until a tab switch remounts or remeasures it.

Edge case: A user opens a tab whose active pane contains a virtual list. The pane mounts before its flex/grid height and row geometry are stable, so the virtualizer calculates the wrong visible window or scroll anchor. Switching away and back remounts the pane after layout has settled, making the content appear and hiding the first-load defect.

Fix direction: Keep the primitive, project-chat, app-hydration, and assistant-chat browser smokes as required guards for virtualization behavior. Extend browser coverage to memory/events, jobs/runs, and trace surfaces if a surface adds custom wrappers, scroll ownership, or anchoring rules that these fixtures no longer represent.

### CR-058: Closed - project chat file paths share one modifier-click contract

Stories: `US-UI-010`, `US-UI-022`, `US-THREADS-008`, `US-RUNS-009`.

Code map: [chat file-link parser](../../apps/harness/ui/src/lib/chat-file-links.ts), [markdown renderer](../../apps/harness/ui/src/components/markdown-content.tsx), [project chat panel](../../apps/harness/ui/src/components/chat-panel.tsx), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [streamed tool block](../../apps/harness/ui/src/components/streamed-tool-block.tsx), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [trace panel](../../apps/harness/ui/src/components/trace-panel.tsx), [execution plan dialog](../../apps/harness/ui/src/components/execution-plan-dialog.tsx), [IDE store](../../apps/harness/ui/src/ide/ide-store.ts).

Status: Closed for rendered project chat, assistant chat, assistant memory/todos/questions/learnings/logs, background job run events/details, streamed tool rows/details, trace summaries/peek/tool/browser rows, execution plan text, and execution-log rows/details. File references use primary-color underlined link styling with pointer cursor and open the IDE on Ctrl/Meta-click.

Remaining watch item: keep future path-bearing surfaces, such as new inspector cards and experiment diff sidebars, on the same project-owned file-link adapter instead of adding local path parsing.

Test coverage now includes known root-level files, log rows, tool rows, markdown content, assistant/background path surfaces, and IDE-open modifier-click behavior.

### CR-059: Background approval, input, and browser gates collapse into one unclear stop

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-002`, `US-JOBS-001`, `US-JOBS-002`, `US-JOBS-003`, `US-RUNS-013`, `US-BROWSER-001`, `US-NOTIFICATIONS-001`.

Code map: [scheduler](../../apps/harness/cli/src/background-job-scheduler.ts), [background executor](../../apps/harness/cli/src/background-job-executor.ts), [server lifecycle](../../apps/harness/cli/src/server.ts), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [notification inbox](../../apps/harness/ui/src/components/notification-inbox.tsx), [run navigation](../../apps/harness/ui/src/source-navigation.ts), [preferences](../../apps/harness/ui/src/components/preferences-modal.tsx).

Impact: The background approval preference only controls scheduled and startup launch approval. Manual run-now already queues as approved, and background AI jobs execute after planning. Other stops still exist: assistant or planner input, browser per-tool approval, global pause, assistant pause, and circuit breaker. The UI now separates launch approvals from user-input stops in run filtering and notification navigation, but broader stop reasons still need one shared intervention descriptor.

Edge case: A user sets background approval to allow all, an assistant-owned job runs, then the planner asks for missing input or a browser step needs approval. The Jobs pane or toast still feels like "approval required" without showing which gate stopped the run, why the auto-run setting did not apply, or the smallest next action.

Fix direction: Replace the remaining ad hoc stop wording with a typed intervention model such as launch approval, user input, browser permission, pause, circuit breaker, and failure. Every stop should carry `why`, `scope`, `risk`, `affected job/run`, `blocking setting`, and `next action`. Make background-run launch approvals interactive in the inbox and add a local "why did this stop?" explanation surfaced from the same backend state used by guards.

Partial closeout note: non-blocking assistant questions now have an explicit auto-approval preference, and run filters split `Approval` from `Input` so `awaiting-user-input` no longer lands in the approval bucket. The broader typed intervention model remains open for launch approvals, browser permissions, pause, circuit breaker, and failure readback.

### CR-060: Closed - inferred intent preserves explicit task scope

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-004`, `US-JOBS-001`, `US-JOBS-002`, `US-MODES-004`.

Status: Closed 2026-09-19. The [intent compiler](../../packages/ai-core/src/harness/intent-contract.ts) excludes generated labels and negative clauses, conservatively classifies authored task text, and treats inferred artifacts as advisory. Research does not imply implementation. [Generated assistant jobs](../../apps/harness/cli/src/assistant-job-bootstrap.ts) respect the declared artifact scope, and the [launch prompt](../../apps/harness/cli/src/prompts/background-job.ts) recompiles inferred intent from current authored fields instead of retaining obsolete inferred requirements.

Former failure: a plain summarizer received automation-code deliverables; a read-only audit excluding implementation/deployment received code and release requirements.

Coverage: [intent cases](../../packages/ai-core/src/harness/intent-contract.test.ts), [assistant factory](../../apps/harness/cli/src/assistant-factory.test.ts), [job bootstrap](../../apps/harness/cli/src/assistant-job-bootstrap.test.ts), and [launch prompt](../../apps/harness/cli/src/prompts/background-job.test.ts) exercise positive coding intent, read-only and documentation tasks, negative constraints, display labels, and stale stored contracts. This bounded classifier is not a general natural-language authorization parser; explicit user requirements remain authoritative.

### CR-061: Assistant todo prompt context can grow while losing the strongest instruction text

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-ASSISTANTS-004`, `US-JOBS-001`, `US-RUNS-012`.

Code map: [assistant prompt builder](../../apps/harness/cli/src/assistant-manager.ts), [background executor](../../apps/harness/cli/src/background-job-executor.ts), [assistant todo policy](../../apps/harness/cli/src/assistant-todo-policy.ts), [assistant state APIs](../../apps/harness/cli/src/workspace-repository.ts).

Impact: Background prompts include active todo id, state, work kind, target, title, and blocker, but omit todo descriptions. That means repeated bulk todo rewrites can create many similarly titled rows while the strongest intent translation lives in a field not sent to the planner. Large todo sets also make planning noisy and can bias work toward local maintenance over the top-level outcome contract.

Edge case: A project assistant accumulates dozens of open app-code todos with the same title and nearby targets. The planner sees a long duplicate list but not the acceptance details, then chooses a small documentation or catalog reconciliation because the assistant job prompt still rewards catalog maintenance.

Fix direction: Cap and rank prompt todos before launch, deduplicate equivalent generated todos, include bounded todo descriptions for the top few items, and separate "research", "implementation", and "blocked" lanes in the prompt. Add a fixture with hundreds of active todos proving the prompt stays small and still contains the top work implied by the durable intent contract.

### CR-062: Partial assistant job completion hides deterministic subagent setup failures behind useful-looking summaries

Stories: `US-ASSISTANTS-004`, `US-JOBS-001`, `US-JOBS-002`, `US-JOBS-004`, `US-WORKTREE-002`, `US-WORKTREE-004`, `US-WORKTREE-010`.

Code map: [background executor](../../apps/harness/cli/src/background-job-executor.ts), [subagent orchestration](../../apps/harness/cli/src/pi-subagents.ts), [BranchFS integration](../../apps/harness/cli/src/branchfs-subagent-integration.ts), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx).

Impact: Recent assistant-owned background runs can fail all subagents immediately, retry the same setup failure, then let aggregation produce a final summary and mark the run `partial-complete`. This preserves some progress, but the user-facing readback makes the run look like a partial product pass instead of a deterministic subagent infrastructure failure.

Edge case: Every subagent fails with a local workspace or BranchFS read/setup error before doing task work. The aggregator still writes docs or small changes, so the job is not marked failed. The user later sees many partial-complete runs and cannot tell whether product work was incomplete, subagent setup was broken, or the final summary came from fallback aggregation.

Fix direction: Distinguish "subagent setup failure before first activity" from normal partial product work. Surface a typed failure reason, suppress expensive aggregation when every subagent failed before useful output unless main fallback is explicit, and make retry target the failing setup condition instead of re-running identical subagent attempts. Add coverage for non-git project roots, BranchFS mount/read errors, and all-subagent-failed aggregation behavior.

2026-09-19 recovery risk: [automatic partial recovery](../../apps/harness/cli/src/server/automation/background-runs.ts) creates a fresh queued run without the previous linked agent-run/checkpoint, and the [executor](../../apps/harness/cli/src/background-job-executor.ts) creates a fresh plan. Completed non-idempotent effects may repeat during that whole-job retry. This is source-confirmed replay risk, not a reproduced external duplicate. Distinguish safe re-execution from checkpointed recovery and require effect identity or reconciliation before automatically replaying tasks with external effects.

### CR-063: High - bulk operation authority exists but the UI discards preview and result state

Stories: `US-WORKSPACE-001`, `US-THREADS-010`, `US-ASSISTANTS-001`, `US-JOBS-002`, `US-RUNS-009`, `US-UI-006`, `US-UI-ROADMAP-005`, `US-WORKSPACE-ROADMAP-005`.

Code map: [context menu primitive](../../apps/harness/ui/src/components/primitives/context-menu.tsx), [project sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [jobs panel](../../apps/harness/ui/src/components/background-jobs-panel.tsx), [protocol](../../packages/ai-core/src/harness/protocol/index.ts), and [server](../../apps/harness/cli/src/server.ts). The former assistant-maintenance skill references were removed when that project-local skill left the repository.

Status: Backend V1 implemented on 2026-06-28. Projects, assistants, jobs, and background runs share a typed bulk target and `preview` / `apply` command path, and the main UI surfaces support delayed click-to-select, Shift range selection, Ctrl/Cmd toggle selection, selected-set bulk bars, and right-click bulk menus. The end-to-end workflow is not complete.

Impact: The protocol returns per-item `ready`, `blocked`, `applied`, `failed`, and `skipped` state plus destructive/live metadata, but the UI dispatches apply directly and silently ignores both `bulk-operation.previewed` and `bulk-operation.applied`. Destructive toolbar actions can bypass preview and confirmation. A partial mutation is therefore indistinguishable from success.

Edge case: A user deletes ten selected jobs. Six apply, two live jobs are skipped, and two stale ids fail. The UI shows only that ten items were queued, clears no state authoritatively, and provides no per-item recovery path.

Fix direction: Add an operation-id pending adapter, require preview and explicit confirmation for destructive or live targets, render per-item results, retain failed/skipped selection, and clear only confirmed successes. Add idempotency keys for retry-safe apply and deeper project-chat parsing for mixed bulk requests.

### CR-064: Closed - archived threads survive restart

Stories: `US-THREADS-010`, `US-PERSISTENCE-001`, `US-PERSISTENCE-009`, `US-DEV-012`, `US-DEV-016`.

Code map: [workspace repository migration](../../apps/harness/cli/src/workspace-repository.ts), [repository tests](../../apps/harness/cli/src/workspace-repository.test.ts), [thread sidebar](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx).

Status: Closed. Repository startup no longer rewrites archived rows to active, and file-backed coverage preserves status plus archive time across two repository reopen cycles.

Original edge case: A user archived many stale threads, restarted the harness, and saw all of them active again while archive timestamps remained set.

Remaining hardening: Replace startup-wide legacy transforms with ordered transactional schema versions, add pre-migration backup and restore, and add an explicit repository disposal boundary.

### CR-065: BranchFS concurrent preparation is flaky under suite-level git pressure

Stories: `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-004`, `US-WORKTREE-010`, `US-DEV-010`.

Code map: [BranchFS manager](../../apps/harness/cli/src/branchfs-manager.ts), [BranchFS concurrency test](../../apps/harness/cli/src/branchfs-manager.test.ts), [test runner](../../apps/harness/scripts/run-tests.ts).

Impact: The full 1,274-test run failed in the concurrent-lease test because one `git status` could not open the source repository index on Windows. The same test passed alone, identifying a concurrency-sensitive failure rather than a deterministic contract failure. Production subagent fan-out uses the same concurrent lease preparation path, so transient index contention can fail otherwise valid isolated work.

Edge case: Two subagents prepare leases while another harness operation reads or updates git metadata. One preparation gets a transient permission or lock failure and the whole fan-out loses an isolated worker even though retrying immediately would succeed.

Fix direction: Give read-only git snapshot probes bounded retry for known transient Windows index failures and coordinate same-repository snapshot acquisition with a narrow mutex. Keep mount materialization parallel after the shared snapshot is stable. Stress the exact two-manager case alongside other git readers through the normal segmented test command.

### CR-066: High - backend decomposition is real, but persistence and UI remain architectural hubs

Stories: `US-DEV-010`, `US-DEV-011`, `US-DEV-018`, plus every command-backed story.

Code map: [server composition](../../apps/harness/cli/src/server.ts), [server domains](../../apps/harness/cli/src/server), [workspace repository](../../apps/harness/cli/src/workspace-repository.ts), [protocol domains](../../packages/ai-core/src/harness/protocol), [UI store](../../apps/harness/ui/src/harness-store.ts), [assistant panel](../../apps/harness/ui/src/components/assistants-panel.tsx), [chat panel](../../apps/harness/ui/src/components/chat-panel.tsx), [IDE workbench](../../apps/harness/ui/src/ide/ide-workbench.tsx).

Impact: The former server and protocol hubs are substantially fixed: `server.ts` is 107 lines, its router is thin and domain-dispatched, and the protocol is split behind a 10-line compatibility barrel. The remaining concentration is still outside a world-class review bar: the repository is 9,034 lines with a 7,034-line class; the UI store is 4,800 lines; assistant, chat, IDE, jobs, and preferences surfaces range from about 2,200 to 5,800 lines. Every websocket event is also offered to main, IDE, and terminal stores, whose silent defaults allow a new typed event to compile without any owning reducer. CR-063 is a shipped example.

Edge case: A new event is added to the exhaustive protocol and backend router. It reaches three stores, all silently fall through, tests prove only schema shape, and the user sees no result. A persistence change still lands inside one repository constructor that owns schema creation, migrations, codecs, queries, and repair.

Fix direction: Keep the successful backend domain split. Separate versioned migrations, database core, row codecs, and domain repositories; route discriminated event sub-unions to explicit UI domain owners with exhaustive `never` checks; and split large UI components by workflow/view model. Extend source-structure enforcement to UI component declarations instead of indefinitely deferring the entire UI tree.

### CR-067: Medium - dead scaffolding cleanup regressed into production-unreachable shared packages and scripts

Stories: `US-DEV-002`, `US-DEV-006`, `US-DEV-007`, `US-DEV-010`, `US-DEV-011`, `US-DEV-017`, `US-DEV-023`, `US-UI-023`.

Code map: [package manifest](../../apps/harness/package.json), [screenshot scripts](../../apps/harness/scripts), and [markdown renderer](../../apps/harness/ui/src/components/markdown-content.tsx).

Status: Reopened. The earlier dead files and indirect runtime dependencies were reconciled, but source reachability now finds no harness production imports of declared `@hyperfocus/ui`, `@hyperfocus/workspace`, or `class-variance-authority`. Harness-local primitives duplicate the shared UI package, while the workspace package's path policy is tested only by itself and real desktop/IDE consumers implement separate containment logic. `screenshot-adhoc.ts` and `background-job-failures.ts` are unregistered script surfaces.

Edge case: A path-safety fix lands in `@hyperfocus/workspace` while shipped desktop and IDE paths retain divergent code, or a shared overlay fix lands in `@hyperfocus/ui` while Harness uses a second overlay stack. The package graph advertises ownership that production does not have.

Fix direction: Add a repo-aware dead-code, direct-dependency, and entrypoint check with explicit script, worker, and browser-fixture allowances. Remove unused packages and orphan scripts, or complete the production migration into the advertised shared boundary. Do not keep self-tested packages as architecture placeholders.

### CR-068: Closed - harness tests use one visible run-owned temp root

Stories: `US-DEV-007`, `US-DEV-010`, `US-DEV-012`, `US-DEV-017`.

Code map: [git project fixture](../../apps/harness/cli/src/test-support/git-project-fixture.ts), [shared server suite fixture](../../apps/harness/cli/src/server-tests/support/server-suite-fixture.ts), [test runner](../../apps/harness/scripts/run-tests.ts), [TypeScript config](../../apps/harness/tsconfig.json).

Status: Closed for test-root ownership. The segmented runner creates one OS-temp root outside source include trees, fixtures use it, cleanup retries are bounded, and final cleanup failure is visible.

Coverage: [test temp-root tests](../../apps/harness/cli/src/test-support/test-temp-root.test.ts), [test runner tests](../../apps/harness/scripts/testing/test-runner.test.ts), and [git fixture tests](../../apps/harness/cli/src/test-support/git-project-fixture.test.ts).

Remaining watch item: the production server still lacks an owned repository disposal boundary; that remains under CR-070.

### CR-069: Closed - provider credentials stay out of plaintext persistence

Stories: `US-PROVIDERS-006`, `US-PERSISTENCE-011`.

Code map: [credential store](../../apps/harness/cli/src/provider-credential-store.ts), [workspace repository](../../apps/harness/cli/src/workspace-repository.ts), [UI store](../../apps/harness/ui/src/harness-store.ts), [websocket sync](../../apps/harness/ui/src/harness-websocket.ts), and [preferences](../../apps/harness/ui/src/components/preferences-modal.tsx).

Status: Closed on Windows with CurrentUser-scoped DPAPI encryption. Provider keys no longer enter SQLite or browser localStorage. Legacy database values migrate into the credential store, legacy browser values are consumed once into memory and immediately scrubbed, and SQLite secure deletion plus WAL truncation removes old plaintext page frames. Platforms without a native adapter use an explicit process-memory-only store rather than a plaintext fallback.

Coverage: Credential-store tests verify round trips across store instances, absence of sentinel plaintext in the encrypted artifact, provider-specific deletion, and memory-only restart semantics. Repository and UI tests verify legacy SQLite/WAL migration, browser scrubbing, and that subsequent preference saves never persist key values.

Remaining watch item: add native Keychain and Secret Service adapters before advertising persistent credential storage on macOS or Linux; those platforms intentionally require re-entry or provider environment variables today.

### CR-070: High - owned child processes lack one shutdown boundary

Stories: `US-DEV-002`, `US-DEV-023`, `US-RUNTIMES-003`, `US-UI-023`.

Code map: [CLI entry](../../apps/harness/cli/src/cli-entry.ts), [server initialization](../../apps/harness/cli/src/server/runtime/initialize.ts), [server stop decoration](../../apps/harness/cli/src/server/transport/bun-server.ts), [screenshot runner](../../apps/harness/scripts/screenshot-cdp-runner.ts), [process manager](../../apps/harness/cli/src/agent-runtimes/cli-process-manager.ts).

Impact: Explicit server stop repairs run state, but terminal-window signals do not route through it, session managers lack a shared stop-all operation, and failed CDP startup can lose a spawned browser handle. Managed screenshot capture stops draining server stdout after the readiness marker and shares one streaming decoder across stdout and stderr, so a chatty child can block on a full pipe and split multibyte diagnostics can be corrupted. Initialization creates a repository when one is not injected, but stop cleanup has no owned-versus-injected marker and never closes the internally owned SQLite handle. Broad manual kill scripts can also terminate unrelated developer processes.

Edge case: Startup spawns Chrome, CDP readiness fails, a multi-route screenshot server fills its abandoned stdout pipe, or the user closes the harness terminal while terminals and background work remain active. Owned descendants survive, capture stalls, diagnostics corrupt, or durable state never records interruption.

Fix direction: Add one idempotent shutdown coordinator for server, repositories, sessions, schedulers, watchers, and owned child trees; track owned-versus-injected dependencies; register catchable process signals; record owned PIDs for startup recovery; replace global process killers with owner-scoped cleanup. Keep independent stdout and stderr decoder pumps alive for each child's full lifetime and resolve readiness without abandoning either pipe.

### CR-071: High - provider congestion and offline failures are not coordinated

Stories: `US-PROVIDERS-ROADMAP-004`, `US-PROVIDERS-ROADMAP-005`, `US-JOBS-001`, `US-RUNS-002`.

Code map: [Pi adapter](../../apps/harness/cli/src/pi-agent-adapter.ts), [subagent scheduler](../../apps/harness/cli/src/pi-subagents.ts), [background scheduler](../../apps/harness/cli/src/background-job-scheduler.ts), [failure classification](../../apps/harness/cli/src/run-failure-classification.ts).

Impact: Local concurrency caps and bounded retries exist, but simultaneous foreground, background, and subagent calls do not share provider-wide RPM/TPM capacity, `Retry-After`, or cooldown state. Rate-limit and network detail can collapse into generic stream failure, so runs fail independently instead of queueing or pausing coherently.

Edge case: Several subagents and due jobs hit one provider together. Each retries on its own, amplifies the burst, and records opaque failures even when waiting once would have succeeded.

Fix direction: Preserve typed provider failure causes, add a provider/account request coordinator with dynamic capacity and jittered cooldown, then persist network-paused runs for explicit automatic resume. Local-model fallback is a separate provider integration, not an error-handler shortcut.

### CR-072: Medium - cross-environment paths lack target dialect

Stories: `US-WORKTREE-007`, `US-UI-022`, `US-RUNTIMES-003`.

Code map: [workspace path policy](../../packages/workspace/src/path-policy.ts), [desktop deep links](../../packages/desktop-runtime/src/deep-link.ts), [git project service](../../apps/harness/cli/src/git-project.ts), [IDE project service](../../apps/harness/cli/src/ide-project-service.ts), [chat file links](../../apps/harness/ui/src/lib/chat-file-links.ts), [terminal links](../../apps/harness/ui/src/terminal/terminal-links.ts), [path contracts](../../apps/harness/cli/src/workspace-path-intent.ts).

Impact: Host-native path functions receive Windows, WSL, and POSIX-looking strings without an explicit execution target. Mixed separators are normalized in some contracts, but foreign absolute roots can resolve incorrectly or compare with the wrong case rules. The intended `@hyperfocus/workspace` path policy has no production consumer, while desktop, IDE, chat, terminal, search, and persistence code retain separate containment and absolute-path helpers.

Edge case: A WSL runtime reports `/mnt/c/work/app.ts` while the Windows host owns `C:\\work\\app.ts`, or a Windows path reaches a POSIX renderer. Search, file open, ownership, and link activation disagree.

Fix direction: Make one production-consumed workspace path authority carry execution environment and path dialect, then translate only at explicit host/runtime boundaries. It must own realpath, case, separator, nested-root, symlink, and containment policy; otherwise remove the unused package until that boundary is real.

### CR-073: High - packaged launches enable destructive development recovery

Stories: `US-PERSISTENCE-007`, `US-PERSISTENCE-009`, `US-DEV-006`, `US-DEV-007`.

Code map: [repository recovery gate](../../apps/harness/cli/src/workspace-repository.ts), [database recovery](../../apps/harness/cli/src/dev-db-recovery.ts), [launch recovery](../../apps/harness/cli/src/launch-harness.ts), [launcher packaging](../../apps/harness/scripts/package-launcher.ts).

Impact: Safety is inferred from `NODE_ENV !== "production"`. The portable compiler does not define `NODE_ENV`, so an ordinary packaged launch with no ambient variable is classified as development. Startup can delete a malformed thread and its cascading messages/runs, or automatically back up and purge the workspace database before switching to a fresh one.

Edge case: A portable user upgrades with one malformed legacy row. Startup removes the thread or presents a fresh workspace even though the README limits pruning to development and the user did not request repair.

Why tests miss it: Recovery tests exercise the enabled path; none runs the compiled artifact with unset `NODE_ENV` and durable user data.

Fix direction: Pass an explicit source-development recovery capability or launch mode. Unknown and portable environments must fail closed, and destructive recovery must remain behind an explicit doctor/repair action.

### CR-074: Closed - ordered migrations preserve durable history and current provider constraints

Stories: `US-PERSISTENCE-007`, `US-PERSISTENCE-009`, `US-JOBS-001`, `US-PROVIDERS-006`.

Code map: [ordered migrations](../../apps/harness/cli/src/persistence/workspace-repository/schema-migrations.ts), [migration integration tests](../../apps/harness/cli/src/persistence/workspace-repository/schema-migrations.test.ts), [repository facade](../../apps/harness/cli/src/workspace-repository.ts).

Status: Closed. Schema upgrades now run as ordered, recorded transactions. The background-run migration backs up and rebuilds parent and dependent tables as one unit before removing legacy tables, and the assistant migration explicitly upgrades the provider-brand constraint to include Anthropic profiles.

Coverage: Populated legacy runs, events, and notifications survive migration; upgraded legacy assistant schemas accept Claude; injected migration failures roll back without recording a partial version; and reopening safely retries the migration.

Remaining watch item: every future parent-table rebuild or constraint expansion must be a new ordered migration with populated-fixture and rollback/reopen coverage.

### CR-075: Medium - the framework-neutral client accepts stale socket events after reconnect

Stories: `US-UI-022` and the reconnect behavior consumed by editor AI surfaces.

Code map: [AI core client](../../packages/ai-core/src/client.ts).

Impact: Socket listeners have no connection generation or socket-identity guard. A delayed message, close, or error from a disconnected socket can overwrite the snapshot produced by a newer connected socket.

Edge case: Socket B reaches `connected`, then socket A emits a late close and publishes `disconnected`; an old workspace snapshot can likewise replace current state.

Why tests miss it: Protocol parsing is tested, but `createHarnessClient` has no lifecycle or reconnect race tests.

Fix direction: Capture a monotonically increasing connection generation in every handler, ignore stale callbacks, and detach listeners during disconnect.

### CR-076: Medium - native desktop open bypasses connected-client synchronization

Stories: `US-ACTIVATION-008`, `US-RUNS-010`.

Code map: [desktop open transport](../../apps/harness/cli/src/server/transport/bun-server.ts), [desktop server tests](../../apps/harness/cli/src/desktop-server.test.ts), [project lifecycle events](../../apps/harness/cli/src/server/workspace/project-events.ts).

Impact: `/api/desktop/v1/open` activates or creates a project and recomputes setup, but broadcasts no project, workspace, or setup event. Existing control clients remain stale when an `ide://` request reuses their backend.

Edge case: One tab shows project A while a native deep link opens project B. Server-global active state changes to B, but the first tab continues rendering A-derived workspace and setup state.

Why tests miss it: Coverage asserts only the HTTP response and launch URL; it does not keep a websocket client connected during native activation.

Fix direction: Route native opens through the same project lifecycle and event coordinator as websocket commands, then test the HTTP mutation with an already-connected control client.

### CR-077: Medium - advertised harness test and browser-smoke commands drift outside normal validation

Stories: `US-DEV-010`, `US-DEV-017`, `US-UI-022`.

Resolved subset: Default test segments now use explicit `./` targets. A Windows handle-table probe confirmed that bare Bun path filters retain unrelated PadPilot output directories during repository-wide discovery, blocking atomic UI rebuilds; the same explicit-path probe held no such handles. Segment tests preserve scoped targets. The profiling and forwarded-flag issues below remain open.

Code map: [profile runner](../../apps/harness/scripts/profile-tests.ts), [test segments](../../apps/harness/scripts/testing/test-segments.ts), [test runner](../../apps/harness/scripts/run-tests.ts), [IDE positioning smoke](../../apps/harness/scripts/ide-positioning-smoke.ts), [harness package scripts](../../apps/harness/package.json).

Impact: `test:profile` resolves `apps/harness` as the repository root and then appends `apps/harness/cli/src`, so default discovery targets a nonexistent doubled path. It also launches every segment concurrently and ignores `isolateTargets`, defeating the integration process isolation even after root resolution is fixed. Any forwarded Bun flag sends `test:harness` through raw repository-root `bun test`, dropping serial integration/UI isolation and widening scope to the monorepo. The IDE positioning fixture still generates an import from the deleted monolithic protocol file.

Edge case: A developer profiles BranchFS integration tests concurrently with core process and UI suites, or adds `--timeout=30000` to the normal harness suite and unknowingly runs unrelated repositories in parallel. The profile reports runner-induced contention as product slowness; the dedicated IDE positioning smoke fails before it renders anything.

Why tests miss it: Helper tests inject the real monorepo root and test flag construction separately. Generated template-string imports escape typecheck and canonical-import lint.

Fix direction: Centralize repository-root resolution and command orchestration. Share one segment executor between normal and profile modes, preserving segment order and per-target isolation while decorating it with reporters. Distinguish runner options from explicit test targets, preserve segmentation for generic flags, use public package imports in generated fixtures, and smoke-test every advertised package command through discovery/build without running expensive workloads.

### CR-078: Medium - browser discovery is duplicated and disagrees across activation and screenshot paths

Stories: `US-DEV-002`, `US-DEV-023`, `US-ACTIVATION-002`.

Code map: [bootstrap browser discovery](../../apps/harness/scripts/bootstrap.ts), [screenshot browser discovery](../../apps/harness/scripts/screenshot-cdp-runner.ts), [browser health](../../apps/harness/cli/src/browser-tool-health.ts).

Impact: Bootstrap ignores a nonexistent `CHROME_PATH` and tries standard installations. The screenshot runner returns only the explicit value, skips it when missing, and never tries fallbacks. Setup and capture can therefore report contradictory browser availability.

Edge case: A stale `CHROME_PATH` coexists with a valid standard Chrome install. Bootstrap succeeds, then screenshot fails with an empty or misleading candidate list.

Why tests miss it: Screenshot tests cover orchestration, not candidate resolution; each surface tests its own partial assumptions.

Fix direction: Extract one platform-neutral browser candidate and diagnostic resolver used by bootstrap, screenshot, doctor/setup health, and editor checks. Explicit paths should be tried first, followed by consistent fallbacks.

### CR-079: Medium - context menus bypass overlay and menu accessibility ownership

Stories: `US-UI-002`, `US-UI-006`, `US-UI-022`.

Code map: [harness context menu](../../apps/harness/ui/src/components/primitives/context-menu.tsx), [project sidebar menu](../../apps/harness/ui/src/components/project-sidebar/project-sidebar.tsx), [shared action menu](../../packages/ui/src/primitives/action-menu.tsx), [harness overlay stack](../../apps/harness/ui/src/components/primitives/overlay-stack.ts).

Impact: The local context menu owns independent global Escape/outside-click listeners but does not join the overlay stack, move or restore focus, or implement Arrow/Home/End navigation. The project sidebar bypasses even that primitive with imperative DOM construction and overlapping document listeners. Disabled reasons in the action model cannot be surfaced consistently.

Edge case: Shift+F10 opens a menu while focus stays on the row behind it. ArrowDown does nothing, and Escape competes with a dialog or popover from a different stack.

Why tests miss it: Tests assert mouse-visible menu content, not keyboard invocation, roving focus, focus return, nested overlay priority, or disabled reasons.

Fix direction: Promote one point-anchored shared context-menu primitive built on shared `ActionMenu`/Popover ownership, migrate all consumers, and remove imperative DOM plus document listeners.

### CR-080: Medium - shared-user preferences are app-private in Harness

Stories: `US-UI-002`, `US-UI-022`, plus the shared-user preference contract in `DESIGN.md`.

Code map: [shared preference storage](../../packages/ui/src/preferences/storage.ts), [editor preferences](../../apps/engine-editor/src/app/editor-preferences.ts), [harness store](../../apps/harness/ui/src/harness-store.ts), [harness preferences](../../apps/harness/ui/src/components/preferences-modal.tsx).

Impact: The editor consumes the shared preference adapter, while Harness uses private keys for theme and numeric alignment and exposes no shared density or explicit reduced-motion preference. First-party apps can disagree on settings the design contract classifies as shared-user.

Edge case: A user enables reduced motion and compact density in the editor, then opens Harness and receives normal-density chrome plus only OS-derived motion behavior.

Why tests miss it: Each app tests its storage independently; there is no cross-app read/write compatibility or migration fixture.

Fix direction: Compose Harness preferences over the shared adapter, keep richer Harness theme ids as an app extension, migrate legacy keys once, and add cross-app storage tests.

### CR-081: Closed - the reusable transcript bounds Markdown rendering

Stories: `US-THREADS-008`, `US-UI-010`, `US-UI-015`, `US-DEV-017`.

Code map: [shared chat transcript](../../packages/ui/src/transcript/chat-transcript.tsx), [harness virtual list](../../apps/harness/ui/src/components/primitives/virtual-list.tsx).

Status: Closed. Shared `ChatTranscript` now builds one typed prefix-offset table, selects the visible range by binary search, measures variable-height rows, and mounts only that range plus configurable overscan. Pending Markdown rows use reconciliation, stable ids preserve their DOM row, and stick-to-end yields when the reader scrolls away.

Coverage: Unit tests execute GFM, code, table, sanitization, and empty-state rendering against a 10,000-message input. A production-compiled Playwright workload covers 100 and 10,000 starting messages at desktop and narrow widths, five streamed append batches, end pinning, variable measurement, and an in-place pending Markdown update.

Evidence: The 2026-08-28 browser run ended with 10,101 messages but only 11 transcript rows and 114 descendant DOM nodes mounted in both large cases; the 201-message control mounted the same counts. The pending row kept identity and rendered its updated `<strong>` node in all three cases.

Remaining watch item: keep host persistence and pagination outside shared UI, and rerun the browser workload when row presentation or transcript adoption changes.

### CR-082: Low - coverage-document validation accepts non-canonical evidence and stale behavior text

Stories: `US-DEV-007`, `US-DEV-010`, `US-DEV-023`.

Code map: [coverage matrix](coverage-matrix.md), [coverage guard](../../apps/harness/scripts/coverage-matrix.test.ts), [user stories](user-stories.md), [harness README](../../apps/harness/README.md).

Impact: The matrix uses root-looking `scripts/*` paths that do not exist there, while the guard silently remaps them under `apps/harness/scripts`. `US-DEV-007` also says plain doctor trims `.local`, but shipped doctor is read-only and cleanup belongs to repair.

Edge case: A reviewer cannot open canonical evidence from the matrix, and requirement review expects a mutation the product intentionally avoids.

Why tests miss it: The guard checks aliased existence and story ids, not exact repository paths or README/story semantic parity.

Fix direction: Record exact paths, remove the hidden alias, separate doctor from repair in the story, and add a narrow docs parity check for command behavior.

### CR-083: Closed - tagged releases upload a verified Harness launcher archive after its test gate

Stories: `US-ACTIVATION-001`, `US-DEV-008`, `US-DEV-010`.

Code map: [release workflow](../../.github/workflows/release.yml), [release archive verifier](../../apps/harness/scripts/launcher-release.ts), [release tests](../../apps/harness/scripts/launcher-release.test.ts), [workflow contract tests](../../apps/harness/scripts/release-workflow.test.ts), [distribution contract](../distribution.md).

Status: Closed. Tagged releases run `test:harness`, package the complete launcher target into an explicit versioned ZIP, verify the extracted file set, smoke the extracted executable, upload the exact reported artifact path, and fail when an upload path is missing.

Coverage: Workflow contract tests assert the Harness gate and exact upload behavior. The release script integration test builds, archives, extracts, compares, and executes the portable launcher help path.

Remaining watch item: keep update discovery bound to the exact Harness product asset as tracked separately under CR-095.

### CR-084: High - preference saves are not patch-safe or atomic across persistence owners

Stories: `US-PREFERENCES-001`, `US-PROVIDERS-001`, `US-PROVIDERS-006`, `US-PERSISTENCE-007`.

Code map: [preferences command schema](../../packages/ai-core/src/harness/protocol/client-command-runtime.ts), [preferences handler](../../apps/harness/cli/src/server/commands/preferences.ts), [credential store](../../apps/harness/cli/src/provider-credential-store.ts), [preferences tests](../../apps/harness/cli/src/server-tests/preferences/preferences-storage-tests.ts).

Impact: Later preference fields are optional for client compatibility, but an omitted `autoArchiveCompletedThreadsDefault` is written as `false` while neighboring optional fields preserve their current values. The same command performs credential-store writes, live adapter mutations, many independent SQLite writes, runtime refresh, and setup refresh without a transaction or reconciliation contract. A rejected command can therefore silently reset an older-client field or leave partially applied preferences across owners.

Edge case: An older client saves an unrelated preference and disables auto-archive. Separately, a credential write succeeds and several SQLite values commit before refresh fails; the client sees rejection, retries an outdated snapshot, and overwrites more state.

Why tests miss it: Tests send complete current UI snapshots through the successful path. They do not omit newly optional fields, inject failure after each owner/write, reopen the database, or compare credential, adapter, repository, and emitted state after rejection.

Fix direction: Define explicit patch versus replacement semantics and preserve every absent optional field. Transaction-wrap repository preferences, stage external credential/adapter changes behind a reconciliation boundary, return authoritative committed state, and add old-client plus failure-injection/reopen coverage.

### CR-085: Closed - IDE state and asynchronous results have project, request, and revision ownership

Stories: `US-UI-022`, `US-WORKSPACE-005`, `US-WORKSPACE-008`.

Code map: [IDE store](../../apps/harness/ui/src/ide/ide-store.ts), [IDE workbench](../../apps/harness/ui/src/ide/ide-workbench.tsx), [IDE store tests](../../apps/harness/ui/src/ide/ide-store.test.ts), [workbench tests](../../apps/harness/ui/src/ide/ide-workbench.test.tsx), [project commands](../../apps/harness/cli/src/server/commands/projects.ts).

Status: Closed. Project changes atomically clear project-owned tree, tab, buffer, dirty, saving, search, Git, and pending-operation state. Tree/read/write/search/Git responses must match the active project and owning request, reads cannot steal focus, and write acknowledgements must own the current content revision before they can replace content or mark it clean.

Coverage: Same-relative-path project switches, delayed cross-project results, late reads, reversed write acknowledgements, newer edits during saves, persisted project identity, and server rejection request identity are covered.

Remaining watch item: future IDE operations must join the same project/request ownership model before their results enter shared state.

### CR-086: High - terminal socket replacement is identity-unsafe in two duplicated transports

Stories: `US-RUNTIMES-003`, `US-RUNTIMES-005`, `US-UI-023`, `US-UI-024`.

Code map: [terminal transport](../../apps/harness/ui/src/terminal/terminal-transport.ts), [CLI session transport](../../apps/harness/ui/src/harness-websocket.ts), [terminal store](../../apps/harness/ui/src/terminal/terminal-store.ts).

Impact: Both binary transports close an existing session socket, install its replacement, then let every old open/message/close handler mutate current state. A delayed old close blindly deletes the session id from the shared map and marks the replacement disconnected. The two copies also duplicate binary input conversion.

Edge case: Repeated attach-ready replaces socket A with B. A closes late, evicts B, and sets disconnected; B may continue producing output while input fails because registry lookup no longer finds it. Stale A output can still enter the current session.

Why tests miss it: Store and renderer tests do not exercise the real socket registry. There is no two-socket, same-session lifecycle fixture for either transport.

Fix direction: Extract one typed session-socket registry used by terminal and CLI data planes. Every callback must verify `map.get(sessionId) === socket` or a matching generation, and close must conditionally delete. Centralize binary conversion and test stale open/message/close/error callbacks.

### CR-087: Medium - shared protocol consumers have no compatibility handshake

Stories: `US-ACTIVATION-008`, `US-UI-022`, `US-DEV-001`.

Code map: [ready event](../../packages/ai-core/src/harness/protocol/server-event.ts), [shared client](../../packages/ai-core/src/client.ts), [desktop discovery](../../apps/harness/cli/src/desktop-app.ts), [desktop transport](../../apps/harness/cli/src/server/transport/bun-server.ts).

Impact: `connection.ready` begins with the current required state and is parsed against the exact installed schema; no protocol version, supported range, or capability set is exchanged. Desktop discovery exposes an app version but reuses a long-lived backend without checking it. Independently versioned editor/client and launcher processes can therefore fail with a generic invalid-event error or send unsupported commands.

Edge case: An updated editor connects to an older background Harness missing one newly required ready field. The new launcher reuses that broker, and the UI reports only `Invalid harness event` instead of restarting or explaining incompatibility.

Why tests miss it: Same-tree tests always pair matching schemas and freshly created servers. There are no N-1/N+1 fixtures or long-lived desktop-reuse compatibility checks.

Fix direction: Add an explicit protocol version and capability handshake with supported min/max ranges and an actionable mismatch event. Desktop reuse must check protocol compatibility separately from marketing app version.

### CR-088: Medium - three local resizers bypass shared cancellation and keyboard ownership

Stories: `US-UI-002`, `US-UI-022`, `US-UI-023`.

Code map: [IDE workbench](../../apps/harness/ui/src/ide/ide-workbench.tsx), [terminal drawer](../../apps/harness/ui/src/terminal/terminal-drawer.tsx), [terminal split layout](../../apps/harness/ui/src/terminal/terminal-split-layout.tsx), [shared resize interaction](../../packages/ui/src/workbench/panel-resize-interaction.ts), [shared panel group](../../packages/ui/src/workbench/panel-group.tsx).

Impact: IDE sidebar/editor, terminal drawer, and terminal split resizing each install ad hoc window pointer listeners and remove them only on `pointerup`. They do not own pointer capture, cancellation, lost capture, window blur, replacement drag, or component disposal. Their focusable sash buttons expose no separator role, value semantics, or keyboard resizing even though shared UI already implements those contracts.

Edge case: Touch cancellation, Alt+Tab, or unmount during a drag leaves a global listener mutating a hidden or reopened layout. A keyboard user can focus the sash but Arrow/Home/End do nothing. The three copies also disagree on RAF throttling and when persistence occurs.

Why tests miss it: One terminal test covers ordinary drag and release. No surface covers pointer cancellation, lost capture, unmount, second drag, or keyboard operation, and IDE sashes have no interaction coverage.

Fix direction: Consume the shared panel resize interaction and PanelGroup contract, or promote the minimal adapter Harness needs. Expose separator orientation/value bounds and Arrow/Home/End behavior, then cover cancellation, lost capture, unmount, replacement drag, and keyboard operation.

### CR-089: Closed - portable fatal logging preserves the original failure

Stories: `US-DEV-002`, `US-DEV-008`.

Code map: [fatal startup logger](../../apps/harness/cli/src/fatal-startup-log.ts), [CLI entry](../../apps/harness/cli/src/cli-entry.ts), [fatal logger tests](../../apps/harness/cli/src/fatal-startup-log.test.ts).

Closed 2026-10-23: the normalized original record is captured before output.
Stderr and crash-file writes are independently best effort. Failed writes leave
`logPath` unset and later fatal handlers return the captured record. Tests inject
directory, file-write and stderr failures, verify the original error survives,
and verify deduplication. No fallback file location is implied.

### CR-090: High - scheduled occurrence persistence and restart interruption

Stories: `US-JOBS-001`, `US-JOBS-004`, `US-PERSISTENCE-007`, `US-PERSISTENCE-009`.

Status: Closed 2026-10-23. Schedule advance, run creation, initial event and scheduler
state commit in one immediate SQLite transaction before dispatch. The owner chose
visible failure with manual retry after interruption, rather than automatic replay.
Inherited queued rows without a live controller or valid lease become failed even
when execution is paused. New deferred work, live controllers and lease grace are
preserved. Orphaned ready runs no longer automatically restart. Future scheduled
occurrences remain independent of retrying the interrupted occurrence.

Evidence: [scheduler tests](../../apps/harness/cli/src/background-job-scheduler.test.ts)
inject three persistence failures and reopen the database. A child process exits
at the commit/dispatch boundary; restart records one failure and no dispatch.
[Server tests](../../apps/harness/cli/src/server-tests/preferences/background-run-control-tests.ts)
verify the failure notification and an explicit user retry creating a new run.

### CR-091: Medium - the exported shared Dialog has a leaky focus trap

Stories: `US-UI-002` and future first-party consumers of `@hyperfocus/ui`.

Code map: [shared Dialog](../../packages/ui/src/primitives/dialog.tsx), [shared UI exports](../../packages/ui/src/index.ts), [Harness overlay stack](../../apps/harness/ui/src/components/primitives/overlay-stack.ts).

Impact: Shared Dialog initially focuses its surface, but reverse wrapping only recognizes the first queried control; immediate Shift+Tab can therefore leave the modal. Its focusable query includes disabled and hidden controls, so a non-tabbable computed boundary can also let forward or reverse traversal escape. Harness separately owns the correct root-boundary and visibility/disabled filtering, confirming drift across the intended package boundary.

Edge case: Open a shared dialog and immediately press Shift+Tab, or place a disabled footer button after the last enabled action. Focus reaches background chrome despite `aria-modal=true`.

Why tests miss it: The exported shared Dialog has no package-level interaction test. Existing overlay tests exercise the stronger Harness-local implementation instead.

Fix direction: Promote one tested focusable-element and focus-trap owner into shared UI, use it in shared Dialog, and migrate Harness overlay behavior to it when package adoption is repaired. Cover initial reverse traversal, both wrap directions, hidden/disabled boundaries, dynamic removal, nested top-overlay ownership, and real-browser focus.

### CR-092: Medium - portable CLI update reports success without replacing bundled runtimes

Stories: `US-DEV-008`, `US-DEV-011`, `US-PROVIDERS-006`.

Status: Closed 2026-10-23. Portable Pi and Codex package updates are rejected before
any mutation and cannot emit an installed acknowledgement. The notification opens
settings with guidance to download a new Harness release and restart its launcher.
Source installs and independently installed Claude/Copilot tools retain their
existing update paths. Full launcher replacement is a separate follow-up.

Evidence: [updater tests](../../apps/harness/cli/src/cli-update-checker.test.ts),
[websocket integration](../../apps/harness/cli/src/server-tests/preferences/preferences-storage-tests.ts),
and [notification interaction tests](../../apps/harness/ui/src/components/notification-inbox.test.tsx).
A compiled executable probe rejected both bundled targets using real launch-mode
detection with no package manager on PATH. Browser verification uses the existing
preferences fixture's `surface=portable` case; it is not full release acceptance.

### CR-093: Medium - shared ActionMenu lets Tab escape while remaining open

Stories: `US-UI-002`, `US-UI-006`, `US-UI-022`.

Code map: [shared ActionMenu](../../packages/ui/src/primitives/action-menu.tsx), [shared Popover](../../packages/ui/src/primitives/popover.tsx), [ActionMenu tests](../../packages/ui/src/primitives/tests/action-menu.test.tsx).

Impact: Menu items are removed from sequential tab order and the menu handles Arrow/Home/End, Escape, pointer dismissal, and item selection, but neither ActionMenu nor Popover owns Tab or focusout dismissal. Real-browser Tab/Shift+Tab can move into background chrome while the portaled menu remains visible and registered on the overlay stack. This weakens the very shared primitive proposed as CR-079's context-menu owner.

Edge case: Open an actions menu from the keyboard, press Tab, and continue through unrelated page controls while a stale menu remains open. A later Escape closes an overlay that no longer appears to own focus.

Why tests miss it: DOM tests cover roving arrows, Home/End, selection, and focus restoration. Synthetic Tab does not perform browser default traversal, and there is no browser-backed forward/backward Tab test.

Fix direction: Give ActionMenu explicit Tab/Shift+Tab dismissal and a defined focus destination consistent with surrounding trigger order; keep dialog-like Popover behavior separate. Cover both directions and nested dialog/sheet ownership in a real browser before adopting it universally.

### CR-094: Closed - loopback control and data planes require centralized origin and capability admission

Stories: `US-DEV-001`, `US-DEV-018`, `US-WORKSPACE-007`, `US-RUNTIMES-005`, `US-UI-022`, `US-UI-023`, `US-PERSISTENCE-010`.

Code map: [request admission](../../apps/harness/cli/src/server/transport/request-admission.ts), [Bun transport](../../apps/harness/cli/src/server/transport/bun-server.ts), [browser session token](../../apps/harness/ui/src/transport/harness-session.ts), [real server admission tests](../../apps/harness/cli/src/server-tests/support/server-test-harness.test.ts), [desktop route tests](../../apps/harness/cli/src/desktop-server.test.ts).

Status: Closed. Each launch creates a random URL-safe capability that is injected into the served UI and preserved across hot reload. Central admission rejects foreign, null, wrong-scheme, wrong-host, and wrong-port browser origins and requires the capability for every privileged HTTP or WebSocket route. Explicit native no-Origin clients remain supported only when they present the capability.

Coverage: Real control-plane handshakes prove rejected clients receive no ready state, terminal attach token, or mutation authority. Same-origin browser and explicit native-client success paths, desktop status/open rules, terminal transport, and authenticated UploadThing requests are covered.

Remaining watch item: new privileged loopback routes must use the same admission owner before reading state, upgrading a socket, or mutating the workspace.

### CR-095: Medium - Harness update discovery can select the editor archive

Stories: `US-ACTIVATION-001`, `US-ACTIVATION-008`, `US-DEV-008`.

Code map: [desktop update discovery](../../apps/harness/cli/src/desktop-app.ts), [release workflow](../../.github/workflows/release.yml), [distribution contract](../distribution.md), [desktop tests](../../apps/harness/cli/src/desktop-app.test.ts).

Impact: Windows update discovery chooses the first asset matching `bun-windows-x64`, `windows.*portable`, or `pi-harness`. The separately documented editor archive is named `hyperfocus-editor-windows-portable.zip`, matches the broad middle alternative, and is listed before the Harness asset. Once CR-083 restores both uploads, discovery can return the wrong product archive.

Edge case: A Harness user checks for an update after a normal release containing both products. Asset ordering selects the editor zip, so update/open behavior downloads an archive that contains no Harness launcher.

Why tests miss it: Desktop tests cover running-server discovery and launch behavior, not release asset selection with both products or reversed asset order.

Fix direction: Define exact product/platform/architecture asset names or structured release metadata, reject ambiguous/missing matches, and test both asset orders plus unrelated portable archives.

### CR-096: Medium - shared and Harness chat composers expose unnamed textboxes

Stories: `US-UI-002`, `US-UI-009`, `US-UI-011`.

Code map: [shared composer](../../packages/ui/src/composer/chat-composer.tsx), [editor AI consumer](../../apps/engine-editor/src/editor-ai-panel.tsx), [Harness composer](../../apps/harness/ui/src/components/primitives/chat-composer.tsx).

Impact: The public shared composer API has no label, label-id, or textarea-props contract and renders only a placeholder. Its shipped editor AI consumer supplies no external relationship, so screen-reader and voice-control users encounter an unnamed multiline textbox. The parallel Harness-local composer repeats the omission, showing the accessibility contract has drifted at the intended abstraction boundary.

Edge case: Multiple AI/composer panels are present and a draft contains text, removing the placeholder's visible hint. Assistive technology can identify only an ambiguous `textbox`, not its purpose.

Why tests miss it: Shared composer has no primitive test, and app tests locate textareas structurally or by placeholder instead of querying a stable accessible name before and after draft changes.

Fix direction: Require a stable accessible name in the shared composer API (`aria-label` and/or `aria-labelledby`), pass it directly to the textarea, and migrate the Harness adapter to the same owner. Keep placeholder as separate transient instruction and test both consumers by role and name.

### CR-097: High - automatic port fallback creates split-brain servers over one global home

Stories: `US-DEV-001`, `US-DEV-002`, `US-WORKSPACE-001`, `US-PERSISTENCE-001`, `US-PERSISTENCE-010`, `US-PERSISTENCE-011`.

Code map: [CLI startup](../../apps/harness/cli/src/index-main.ts), [port fallback](../../apps/harness/cli/src/launch-harness.ts), [global paths](../../apps/harness/cli/src/harness-paths.ts), [server initialization](../../apps/harness/cli/src/server/runtime/initialize.ts), [runtime store](../../apps/harness/cli/src/workspace-runtime-store.ts), [credential store](../../apps/harness/cli/src/provider-credential-store.ts).

Impact: A normal second launch retries an occupied default port on port zero instead of identifying or reusing the existing Harness. Both processes then open the same global SQLite workspace, run schedulers and child-process ownership independently, and keep private runtime snapshots with no database change feed. Credential storage adds cached per-process whole-file read/modify/rename updates without a cross-process lock, allowing lost updates or key resurrection.

Edge case: Server A clears OpenAI while fallback server B saves Google from a stale sidecar snapshot; B's rename restores the deleted OpenAI ciphertext while each UI reports its local outcome. Project/thread mutations and scheduler guards likewise diverge between startup snapshots.

Why tests miss it: Fallback tests inject start/stop fakes and assert telemetry/port choice. Repository and credential tests use one owner at a time; no two-process same-home fixture checks mutual exclusion or coherence.

Fix direction: Establish single-writer ownership for each Harness home/database with an OS lock plus authenticated broker discovery. Reuse the existing compatible Harness or fail precisely instead of random fallback. If simultaneous instances are required, isolate homes or add revision feeds, transactional claims, and locked/vault-owned credential mutation. Cover concurrent launches, mutations, schedules, credentials, and stale-lock recovery.

### CR-098: Medium - packaged update identity ignores the release tag and revision suffix

Stories: `US-ACTIVATION-001`, `US-ACTIVATION-008`, `US-DEV-008`.

Code map: [embedded app version](../../packages/ai-core/src/harness/app-version.ts), [desktop update check](../../apps/harness/cli/src/desktop-app.ts), [version comparison](../../packages/desktop-runtime/src/version-update.ts), [release workflow](../../.github/workflows/release.yml).

Impact: The launcher embeds a hardcoded suffixed version, while the release accepts any `v*` tag without injecting or validating it. Update comparison parses only the leading numeric sequence, so revision suffixes such as `-r5` and `-r6` compare equal. Package manifests carry a third version. A stale constant/tag mismatch can publish successfully and affected launchers report current forever.

Edge case: A corrective `v0.55.455-yoruichi-r6` release follows r5. The r5 launcher compares only `0.55.455`, decides no update exists, and never offers the corrected artifact.

Why tests miss it: Comparison tests explicitly accept suffix erasure, but no test links tag, embedded artifact version, package metadata, and updater semantics.

Fix direction: Establish one canonical SemVer-compatible product version, inject or equality-check the release tag at build time, compare prerelease/revision identity correctly, and smoke the extracted artifact's reported version before upload.

### CR-099: Medium - shared collection widgets can lose every keyboard tab stop

Stories: `US-UI-002` and first-party editor navigation/accessibility.

Code map: [shared Tabs](../../packages/ui/src/primitives/navigation/tabs.tsx), [shared SegmentedControl](../../packages/ui/src/primitives/segmented-control.tsx), [shared Tree](../../packages/ui/src/primitives/navigation/tree.tsx), [shared primitive tests](../../packages/ui/src/primitives).

Impact: Tabs synchronizes focus to an externally selected value even when that item becomes disabled or disappears; SegmentedControl makes only the selected enabled option tabbable; Tree repairs an initial tab stop only once on mount. Controlled selection changes, disabled state, filtering, insertion, or removal can leave every rendered enabled item at `tabIndex=-1`, so keyboard users cannot enter the widget.

Edge case: Capability state disables the active editor tab, an empty tree populates asynchronously, or filtering removes the selected segment. Enabled choices remain visible, but Tab skips the entire control.

Why tests miss it: Tests use fixed children and valid enabled initial selections. They cover arrow navigation, not empty-to-populated, active removal, selected disablement, invalid controlled value, or all-disabled-to-enabled transitions.

Fix direction: Extract one roving-tabstop controller invariant for collection widgets: prefer enabled selection, otherwise retain enabled focus, otherwise choose the nearest/first enabled item. Recompute on value, disabled state, insertion, removal, visibility/filtering, expansion, and orientation while leaving semantic selection policy to each widget.

### CR-100: High - attachment limits bound compressed bytes, not extraction work

Revalidation note (2026-09-05): The original description below predates current extraction budgets. Office extraction now limits input, entries, expanded bytes, entry bytes, compression ratio, duration, and output, filters irrelevant entries, and has budget regression tests; PDF extraction also checks a resource budget. The original unbounded-inflation claim is therefore superseded. Remaining prompt-level caching, cancellation, and process-isolation concerns need a focused recheck before this entry can establish current severity or be closed.

Stories: `US-ATTACHMENTS-002`, `US-ATTACHMENTS-003`, `US-RUNS-001`, `US-RUNS-010`.

Code map: [upload limits](../../apps/harness/cli/src/uploadthing-router.ts), [attachment prompt ingestion](../../apps/harness/cli/src/chat-attachment-prompt.ts), [office extraction](../../apps/harness/cli/src/document-extractors/extract-office-zip.ts), [PDF extraction](../../apps/harness/cli/src/document-extractors/extract-pdf.ts), [planner](../../apps/harness/cli/src/pi-planner.ts), [orchestrator](../../apps/harness/cli/src/pi-orchestrator.ts).

Impact: Office/PDF upload limits cover compressed bytes, but prompt construction eagerly fetches and extracts full documents before applying the 48k text budget. Office extraction inflates every archive entry—including irrelevant media—into memory with no entry-count, aggregate expanded-byte, ratio, time, or abort budget; PDF extraction walks and retains every page. A small valid upload can consume gigabytes or block the single Harness process, and historical attachments are reprocessed on later prompts.

Edge case: A <=16 MB spreadsheet contains a highly repetitive multi-gigabyte `sharedStrings.xml`, or a PDF contains extreme page counts. Validation accepts it and planning freezes or exits before final text truncation can help, interrupting unrelated runs.

Why tests miss it: Fixtures are tiny and assert final text truncation. They do not exercise compression ratio, aggregate expanded bytes, entry/page counts, timeout/abort, memory bounds, irrelevant entries, or historical reprocessing.

Fix direction: Establish one resource-budgeted ingestion/extraction owner. Stream and verify fetched bytes, preflight archive metadata, read only format-relevant entries, enforce expanded bytes/nodes/output/pages/time with AbortSignal, stop before fetch when prompt budget is exhausted, and cache bounded results by immutable upload identity. Run hostile fixtures in an isolated worker/process and prove graceful rejection.

### CR-101: Medium - shared ButtonGroup guesses widths and can hide unowned actions

Stories: `US-UI-002`, `US-UI-003`, `US-UI-011`; currently a pre-adoption blocker because the exported primitive has no production consumer.

Code map: [shared ButtonGroup](../../packages/ui/src/primitives/button-group.tsx), [shared exports](../../packages/ui/src/index.ts), [shared ActionMenu](../../packages/ui/src/primitives/action-menu.tsx).

Impact: Capacity uses fixed estimated action and overflow widths regardless of label length, icon layout, font metrics, density, zoom, translation, gaps, or tooltip wrappers. The guessed visible prefix is rendered inside `overflow: hidden`; an actually overflowing action—and even the trailing overflow trigger—can be clipped while the clipped action is absent from the overflow list. Measurement reacts only to root size, not content/font changes.

Edge case: A narrow toolbar has several long localized labels. The estimate says they fit, real buttons do not, and keyboard focus reaches visually clipped controls while no menu contains them. Font loading or zoom can trigger the same loss without a container resize.

Why tests miss it: ButtonGroup has no package test or real-browser geometry fixture, and DOM emulators cannot provide trustworthy intrinsic measurements.

Fix direction: Measure item widths, gaps, and a reserved trigger, recomputing on content/font/density changes; alternatively use a simpler all-or-menu/container-query policy. Every action must appear exactly once in visible or overflow ownership, with no clipping. Compose through ActionMenu after CR-093 repairs its keyboard exit.

### CR-102: Medium - bundled global skills synchronize executable instructions by mtime

Stories: `US-MODES-008`.

Code map: [startup sync](../../apps/harness/cli/src/index-main.ts), [global skill sync](../../apps/harness/cli/src/global-skills.ts), [assistant capability discovery](../../apps/harness/cli/src/assistant-capabilities.ts), [subagent environment](../../apps/harness/cli/src/subagent-environment.ts), [sync tests](../../apps/harness/cli/src/global-skills.test.ts).

Impact: Every launch compares the newest source/destination timestamps, skips the entire skill when destination is newer, or recursively force-copies source without replacing the directory. Future-dated or locally edited files can suppress required bundled updates; newer launcher timestamps can overwrite user edits; files removed upstream remain executable. These skills feed assistant capabilities and subagent instructions, so stale/conflicted content changes model behavior.

Edge case: A user customizes `SKILL.md`, then installs a launcher with newer archive timestamps and loses the edit. Conversely, clock skew keeps an obsolete vulnerable script forever, and a file removed from the bundle continues to run because copy does not delete it.

Why tests miss it: Tests cover empty-destination copying and source selection, not modification conflicts, clock skew, removed files, rollback, or exact post-sync provenance.

Fix direction: Ship a product-owned manifest with version and hashes. Atomically replace unmodified managed skills as whole directories, delete stale managed files, preserve/fork user edits with explicit conflicts, and provide rollback plus provenance tests.

### CR-103: Medium - shared preference toggles and ranges are named by their values

Stories: `US-UI-002` and the shared-user preferences/accessibility contract.

Code map: [shared Preferences surface](../../packages/ui/src/preferences/preferences.tsx), [editor preference consumer](../../apps/engine-editor/src/app/editor-preferences-view.tsx), [preference tests](../../packages/ui/src/preferences).

Impact: Preference titles render in a separate `<strong>` without label association. Toggle labels contain only the checkbox plus changing `On`/`Off` text, while range labels contain only the changing output and slider. The shipped editor preferences therefore expose several indistinguishable `On`/`Off` checkboxes and sliders named `1x` or `280px` rather than by purpose; slider names change during adjustment. Select, segmented, and text branches already use the title, confirming branch drift.

Edge case: A screen-reader control list contains several `On` checkboxes and value-named sliders for motion, panels, scale, sizes, and volume. The user cannot identify which setting will change.

Why tests miss it: Preference tests cover model normalization, not rendered accessible names or name stability after value changes.

Fix direction: Generate stable title/description/control ids per row and connect every input with `aria-labelledby` and `aria-describedby` (or a consistent title label). Associate output with the slider while keeping unit/value out of its name, and test every control by definition title before and after changes.

### CR-104: Medium - the bundled screenshot skill documents a command absent from source and release

Stories: `US-DEV-023`.

Code map: [bundled screenshot skill](../../apps/harness/.agents/skills/screenshot/SKILL.md), [Harness scripts](../../apps/harness/package.json), [root scripts](../../package.json), [launcher assets](../../apps/harness/scripts/launcher-assets.ts), [asset tests](../../apps/harness/scripts/launcher-assets.test.ts).

Impact: The globally advertised skill tells agents to run `bun run screenshot`, but the repository root has no such script; only the Harness package registers it. Portable packaging copies the root manifest and bundled skills, not the Harness manifest or screenshot implementation, so the documented workflow is dead in both its default source working directory and the extracted launcher.

Edge case: An agent follows the shipped skill exactly. Source mode returns `Script not found "screenshot"`; portable mode has neither the script registration nor implementation, despite setup advertising the capability.

Why tests miss it: Asset tests assert file copying with placeholder manifests. Coverage marks the story OK without executing documented skill commands in source or extracted layouts.

Fix direction: Make screenshot a packaged launcher subcommand or self-contained bundled script, or keep the repo-only adapter out of release skills. Correct the source invocation and execute documented commands through source and extracted-launcher smoke tests.

### CR-105: High - shell-job environment references invert least-privilege behavior

Stories: `US-JOBS-001`, `US-JOBS-003`, `US-JOBS-004`, `US-PERSISTENCE-011`.

Code map: [job protocol](../../packages/ai-core/src/harness/protocol/jobs-and-notifications.ts), [job editor](../../apps/harness/ui/src/components/background-job-editor-dialog.tsx), [job executor](../../apps/harness/cli/src/background-job-executor.ts), [risk classification](../../apps/harness/cli/src/server/workspace/preferences.ts).

Impact: Shell jobs expose explicit `envRefs`, but no refs passes `undefined` to spawn and inherits the entire Harness environment, including provider/cloud/upload/proxy credentials and arbitrary secrets. Adding one ref instead replaces the whole child environment with only requested truthy variables, stripping PATH, system roots, temp, locale, and home. The lower-risk default therefore has more secret authority, while opting in to one value can break tool resolution; empty authorized values silently disappear.

Edge case: An assistant schedules `bun run report` with no refs/network flag and receives every launcher secret despite review calling it only slightly unsafe. Adding `REPORT_TOKEN` raises the visible risk yet makes `bun` or subprocesses fail because baseline environment disappears.

Why tests miss it: Executor coverage has no real shell-definition environment fixture, and risk tests do not spawn a child to compare effective authority.

Fix direction: Centralize a least-privilege background-process environment builder. Start from a documented safe process baseline, add only normalized explicitly authorized refs (including intentional empty values), deny or flag internal Harness secrets, reject missing refs visibly, and compute approval risk from the effective environment plus executable/network capability.

### CR-106: Medium - bundled scripted skills hard-code project-relative install paths

Stories: `US-MODES-008`.

Code map: [assistant actions](../../apps/harness/.agents/skills/assistant-actions/SKILL.md), [tag snapshot](../../apps/harness/.agents/skills/agi-tag-snapshot/SKILL.md), [data harnessing](../../apps/harness/.agents/skills/db-data-harnessing/SKILL.md), [global sync](../../apps/harness/cli/src/global-skills.ts), [subagent discovery](../../apps/harness/cli/src/subagent-environment.ts), [assistant launch](../../apps/harness/cli/src/assistant-manager.ts).

Impact: Multiple launcher-bundled skills instruct agents to execute `.agents/skills/<name>/...` relative to the current project, but production installs/discovers those skills under the global Harness home while project-bound assistants execute from the project root. The agent can read the global instructions yet every exact scripted command resolves to a nonexistent project path.

Edge case: A project assistant selects global `db-data-harnessing` or `assistant-actions`, follows its documented Bun command, and immediately fails because the user's project has no matching `.agents/skills` tree.

Why tests miss it: Tests prove copying and discovery, not execution of every documented command from an unrelated project cwd in the extracted launcher layout.

Fix direction: Resolve scripts relative to the selected `SKILL.md`/global root through a Harness skill runner or safely quoted absolute path, while preserving project output cwd separately. Smoke every executable example from a foreign project and packaged layout.

### CR-107: High - shared SourceEditor can write the displayed document into a different prop target

Stories: `US-UI-002`, `US-UI-022`, and the shared first-party source-editor boundary.

Code map: [shared SourceEditor](../../packages/ui/src/source-editor/source-editor.tsx), [editor consumer](../../apps/engine-editor/src/editor-source-surface.tsx), [shared exports](../../packages/ui/src/index.ts), [source-editor tests](../../packages/ui/src/source-editor).

Impact: SourceEditor initializes CodeMirror and subscribes once to document A, but edit and save handlers dereference the latest reactive `props.document`. If a parent changes the prop without remounting, the view still displays/subscribes to A while typing calls B's `setText` and save calls B's `save`; a late A notification can replace the visible buffer again. `readOnly` is also frozen at mount. The current editor masks this with keyed remounting, but the public component does not require immutable identity.

Edge case: A consumer switches from A to B without recreating the component. The user sees A's bytes, edits them into B, and saves B; later A activity rolls the view back while B remains corrupted.

Reproduced in Chromium on 2026-09-05: after switching the prop from `a.ts` to `b.ts`, the view still showed `Document A`. Typing `!` and pressing Ctrl+S saved `Document A!` through B's save callback; A remained unchanged. No browser errors occurred. Replay and JSON evidence are in `.local/engine-perf/2026-09-04-audit/gap-source-editor.ts` and `gap-source-editor-browser/result.json`. This proves the shared component failure; the current application's keyed remount remains a mitigation.

Why tests miss it: Tests cover the standalone document model, not component document/readOnly prop transitions, stale subscription notifications, or save ownership.

Fix direction: Reactively own document identity: unsubscribe A, reconfigure/replace editor state from B, subscribe B, and generation-guard callbacks. Reconfigure read-only state as it changes. Alternatively enforce and internally key an immutable-document API. Test A-to-B edits/save, late A updates, dirty A preservation, and read-only transitions.

### CR-109: Medium - collapsing a shared Workbench panel discards owned focus

Stories: `US-UI-002` and first-party workbench accessibility.

Code map: [shared Workbench](../../packages/ui/src/workbench/workbench.tsx), [editor shell view](../../apps/engine-editor/src/editor-shell-view.tsx), [editor shell state](../../apps/engine-editor/src/editor-shell.ts), [workbench tests](../../packages/ui/src/workbench/workbench.test.tsx).

Impact: Workbench hides panel ancestors without checking whether they contain the active element or transferring focus to a surviving control. The editor ships collapse controls inside inspector/sidebar panels and already renders focusable reveal separators, but hiding a focused ancestor lets browser focus fall back to the document. External layout/fullscreen collapse follows the same path.

Edge case: A keyboard user activates `Hide inspector` and presses Tab expecting nearby workbench navigation; focus restarts at unrelated page chrome instead of the adjacent `Show inspector` handle.

Why tests miss it: Coverage checks layout, resizing, collapse state, and persistence, but never collapses while focus is inside a panel or checks subsequent real-browser Tab order.

Fix direction: Centralize collapse focus ownership. Before hiding, detect active-focus containment; after layout application, focus that panel's surviving reveal handle or a documented workspace fallback. Preserve focus when collapse does not own it and cover internal, external, fullscreen, and multi-panel collapse.

### CR-110: Medium - terminal persistence favors oldest sessions and retains orphan scrollback

Stories: `US-UI-023`, `US-UI-024`, `US-PERSISTENCE-007`, `US-PERSISTENCE-009`.

Code map: [terminal manager](../../apps/harness/cli/src/terminal/terminal-session-manager.ts), [terminal persistence](../../apps/harness/cli/src/workspace-repository.ts), [terminal protocol](../../packages/ai-core/src/harness/protocol/workspace.ts).

Impact: Persisted sessions occupy an insertion-ordered Map; new sessions append, closed sessions remain for history, and serialization writes the first 64 entries. After 64 lifetime sessions, every newer or active terminal is excluded on restart, while all scrollback keys and layout still serialize. This can restore stale oldest history, lose current session metadata, leave layout references dangling, and grow one frequently rewritten metadata blob indefinitely despite per-session text caps. It reopens CR-050's aggregate-retention claim.

Edge case: With 64 closed sessions, terminal 65 becomes the active split. Restart drops 65, restores the oldest 64, keeps a split pointing to a missing id, and retains 65's orphan output in storage. Repetition grows write amplification without bound.

Reproduced on 2026-09-05 through the production metadata serializer with isolated in-memory metadata: 64 stopped sessions followed by one running session restored only the oldest 64, omitted the running session, and retained all 65 scrollback keys. Replay and JSON evidence are in `.local/engine-perf/2026-09-04-audit/gap-terminal-retention.ts` and `gap-terminal-retention.json`. No user database or terminal process was used.

Why tests miss it: Tests cover one session, per-session rollover, and coalesced writes. They never cross 64/256 sessions, mix active and closed recency, reopen layouts, assert orphan pruning, or bound aggregate serialized size.

Fix direction: Apply one retention policy before serialization: always retain active/running sessions, then newest closed history to one canonical limit; prune layout and scrollback to retained ids; bound aggregate bytes; and persist deterministically by timestamps rather than insertion order. Prefer normalized/versioned storage and cover 65+/256+ reopen behavior.

### CR-111: Medium - project/global skill collisions bypass documented override precedence

Stories: `US-MODES-008` and project-local instruction ownership.

Code map: [subagent skill discovery](../../apps/harness/cli/src/subagent-environment.ts), [execution prompt](../../apps/harness/cli/src/pi-orchestrator.ts), [subagent prompt](../../apps/harness/cli/src/pi-subagents.ts), [assistant capability resolution](../../apps/harness/cli/src/assistant-capabilities.ts), [runtime instructions](../../apps/harness/runtime-agents.md).

Impact: General skill discovery concatenates global and project paths and sorts them without deduplicating by skill identity, so prompts can advertise two same-named skills. Explicit assistant capability resolution separately prefers project skills, while documentation says project/user instructions narrow or override shipped defaults. These consumers therefore implement contradictory precedence rules.

Edge case: A project provides a safer customized `assistant-actions` while the bundled global skill remains installed. Execution prompts expose both identically named `SKILL.md` files and leave the model to choose or blend conflicting workflows.

Why tests miss it: Discovery tests cover globals alone, not name collisions, provenance, malformed metadata, or parity with assistant capability resolution.

Fix direction: Build one canonical skill registry keyed by normalized declared/directory name with explicit project-over-user/global precedence, provenance, and collision diagnostics. Use it for capability resolution, UI inventory, and every execution/subagent prompt.

### CR-112: Medium - disabled shared Buttons hide blocking reasons from keyboard users

Stories: `US-UI-002`, `US-UI-003`, and the design-system disabled-state contract.

Code map: [shared Button](../../packages/ui/src/primitives/button.tsx), [shared Tooltip](../../packages/ui/src/primitives/tooltip.tsx), [shared ButtonGroup](../../packages/ui/src/primitives/button-group.tsx), [editor shell](../../apps/engine-editor/src/editor-shell-view.tsx), [editor AI panel](../../apps/engine-editor/src/editor-ai-panel.tsx).

Impact: Disabled-with-tooltip renders a natively disabled button inside a plain unfocusable tooltip span. Native disabled controls receive no focus and the wrapper has no keyboard entry path, so only pointer users can discover the required blocking reason. `aria-describedby` targets a tooltip node mounted only during the unreachable hover/focus state. Shipped editor Undo/Redo and already-applied AI actions use this path, and ButtonGroup routes disabled reasons through it.

Edge case: A keyboard user tabs across enabled and disabled actions; the disabled action disappears from the sequence and its reason is never announced, despite the product requiring explained blockers.

Why tests miss it: Shared Button/Tooltip lack component tests; the imperative DOM tooltip test covers a different adapter. No browser test tabs through disabled sibling actions and checks explanation reachability plus activation suppression.

Fix direction: Make disabled-with-reason a first-class Button state. Prefer focusable `aria-disabled=true` with centrally suppressed click/Enter/Space, reserving native disabled for required form semantics, or expose one separately focusable named reason trigger. Keep descriptive content mounted whenever referenced and cover keyboard, pointer, screen-reader, form, and overflow behavior.

### CR-113: Medium - subprocess working directories depend on ambient launcher cwd

Stories: `US-JOBS-001`, `US-JOBS-003`, `US-UI-023`, `US-PERSISTENCE-010`.

Code map: [portable startup cwd](../../apps/harness/cli/src/index-main.ts), [job cwd protocol](../../packages/ai-core/src/harness/protocol/jobs-and-notifications.ts), [job editor](../../apps/harness/ui/src/components/background-job-editor-dialog.tsx), [job executor](../../apps/harness/cli/src/background-job-executor.ts), [terminal manager](../../apps/harness/cli/src/terminal/terminal-session-manager.ts).

Impact: Job and terminal cwd values are unqualified strings. Both subprocess owners use `path.resolve(value)` against `process.cwd`, while portable startup changes that ambient cwd to the executable directory. The same persisted relative value therefore changes meaning between source invocation directories and release mode; terminal containment checks also resolve relative input against the wrong base before comparing it to the project.

Edge case: A project saves cwd `scripts`; it works only when source Harness started from that project, then resolves to `<launcher-dir>/scripts` after portable install. A multi-project terminal requesting `src` resolves under the server cwd and is rejected or targets the wrong directory.

Why tests miss it: Fixtures pass absolute temp/project roots. They do not run relative cwd from a foreign process directory, reopen after portable `chdir`, or compare source/package behavior.

Fix direction: Extract one project execution-cwd resolver. Define relative paths against the owning project root, normalize/realpath through the workspace path authority, and explicitly forbid or elevate absolute/out-of-project cwd. Persist scoped intent rather than an ambient string and cover relative, absolute, symlink, nested project, restart, and source/portable parity.

### CR-114: Medium - maintenance scripts resolve the Harness database differently from production

Stories: `US-MODES-008`, `US-PERSISTENCE-007`, `US-PERSISTENCE-010`.

Code map: [production Harness paths](../../apps/harness/cli/src/harness-paths.ts), [skill DB path helper](../../apps/harness/.agents/skills/assistant-actions/scripts/harness-db-path.ts), [assistant maintenance](../../apps/harness/.agents/skills/assistant-actions/scripts/assistant-maintenance.ts), [path tests](../../apps/harness/cli/src/harness-paths.test.ts).

Impact: Production returns `HARNESS_DB_PATH` verbatim, while the bundled maintenance helper expands `~` and resolves every override against its own cwd. Relative and tilde overrides can therefore identify different databases in the server and its mutation/inspection tooling, especially when a project agent runs from a different cwd.

Edge case: The server opens a literal or launcher-relative override while `assistant-maintenance --execute` resolves the same environment value to a different existing database and mutates the wrong workspace.

Why tests miss it: Production path tests use absolute overrides; maintenance tests inject fixture paths and never compare the two resolvers across cwd or tilde behavior.

Fix direction: Define one portable path contract, canonicalize the authoritative database path once, and expose it to managed scripts rather than reinterpreting ambient environment. Test absolute, relative, tilde, empty, and differing-cwd parity.

### CR-115: Closed - frozen acceptance checks gate execution and integration

Stories: `US-WORKTREE-005`, `US-WORKTREE-006`, `US-PLANNING-009`, `US-PLANNING-010`.

Status: Closed 2026-09-19. [Orchestration](../../apps/harness/cli/src/pi-orchestrator.ts) runs frozen checks after main/subagent work, [isolated integration](../../apps/harness/cli/src/branchfs-subagent-integration.ts) checks before flush, and [individual retries](../../apps/harness/cli/src/server/execution/lifecycle.ts) use the same host gate. Corrections retain explicit checks instead of inventing Bun/TypeScript commands.

The [shared command runner](../../packages/ai-runtime/src/quality/commands.ts) uses argv without shell expansion, resolves bundled Bun, limits execution time and output, and cleans up on cancellation/failure. Multi-step shell expressions belong in project scripts. Missing checks remain explicitly unverified in milestones and final output; a completed execution does not certify unspecified domain behavior.

Coverage: [command lifecycle tests](../../apps/harness/cli/src/verification/commands.test.ts), [outcome regressions](../../apps/harness/cli/src/verification/outcomes.test.ts), [integration tests](../../apps/harness/cli/src/branchfs-subagent-integration.test.ts), and [retry websocket regression](../../apps/harness/cli/src/server-tests/subagents/retry-verification-tests.ts). Failing sentinel checks now prevent success; custom checks, missing checks, deadlines, cancellation, output limits, and corrective-plan preservation are exercised.

### CR-116: Closed - question reuse cannot bypass blocking policy

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-ASSISTANTS-005`, `US-JOBS-001`, `US-JOBS-003`, `US-RUNS-013`.

Status: Closed 2026-09-19. The [question policy](../../apps/harness/cli/src/assistant-question-policy.ts) applies forced blocking, risk, and autoapproval preferences before guidance reuse. Unknown and unanswered duplicate questions require answers; deferred questions participate in policy context. New default assumptions have low confidence. [Planning consumption](../../apps/harness/cli/src/background-job-executor.ts) preserves unanswered questions instead of turning notification deduplication into permission to continue.

Former failure: unrelated prose guidance auto-answered a destructive question despite forced blocking and disabled autoapproval. A pending duplicate could also become a fabricated planning answer.

Coverage: [policy tests](../../apps/harness/cli/src/assistant-question-policy.test.ts), [executor tests](../../apps/harness/cli/src/background-job-executor.test.ts), and [assistant background websocket scenarios](../../apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts) exercise these combinations and mixed resolved/unresolved batches.

### CR-117: Closed - clearing input no longer completes unfinished background work

Stories: `US-JOBS-001`, `US-JOBS-002`, `US-ASSISTANTS-004`, `US-RUNS-013`.

Status: Closed 2026-09-19. [Background lifecycle](../../apps/harness/cli/src/server/automation/background-runs.ts) no longer reclassifies arbitrary question-shaped exceptions as input requests or invokes the false-success finalizer. Typed planner input remains waiting and recoverable through its existing answer/notification path. Execution exceptions remain failures and contribute to assistant failure tracking.

Former failure: `Connection refused. Is the service running?` became `succeeded` and a done notification without retrying the task.

Coverage: [assistant background websocket scenarios](../../apps/harness/cli/src/server-tests/preferences/assistant-background-job-tests.ts) assert failed error readback, absence of done state, and preserved pending input; [executor tests](../../apps/harness/cli/src/background-job-executor.test.ts) retain cancellation and late-result ownership coverage.

### CR-118: Closed - all corrections obey the chosen iteration policy

Stories: `US-RUNS-011`, `US-PREFERENCES-001`, `US-PERSISTENCE-012`.

Status: Closed 2026-09-19. [Correction lifecycle](../../apps/harness/cli/src/server/execution/lifecycle.ts) no longer auto-runs low-difficulty corrections before checking policy. `ask-before-iterate` presents the next plan, `auto-once` permits one correction, and `auto-until-clean` retains the existing iteration ceiling.

Coverage: the [websocket policy matrix](../../apps/harness/cli/src/server-tests/correctness/correction-policy-tests.ts) exercises all three policies against low/high difficulty and repeatedly unchanged gaps, asserting actual executor counts and the persisted waiting plan. [Review ownership regressions](../../apps/harness/cli/src/server-tests/correctness/review-ownership-tests.ts) prove a stopped run cannot resume when a delayed review returns, and that a review requiring iteration without a corrective plan fails visibly.

### CR-119: Closed - Pi enforces fresh successful terminal output

Stories: `US-RUNTIMES-001`, `US-RUNS-004`, `US-RUNS-015`.

Status: Closed 2026-09-19. The [Pi controller](../../apps/harness/cli/src/pi-agent/execution-controller.ts) reads canonical SDK message state for the current invocation, checks terminal status, and rejects provider error, abort, truncation, unfinished tool output, stale prior text, and success arriving after cancellation. It does not depend on asynchronous event listeners finishing before the prompt promise.

Coverage: [direct production controller tests](../../apps/harness/cli/src/pi-agent/execution-controller.test.ts) inject SDK sessions for every terminal outcome, delayed listener delivery, stale text, and cancellation; [adapter tests](../../apps/harness/cli/src/pi-agent-adapter.test.ts) cover integration. SDK imports resolved during implementation without install/lock changes. No live provider run was used to certify these fixes.

### CR-120: Closed - empty Pi output cannot issue an unreserved prompt

Stories: `US-RUNS-015`, `US-PERSISTENCE-007`.

Status: Closed 2026-09-19. The [Pi controller](../../apps/harness/cli/src/pi-agent/execution-controller.ts) no longer issues a hidden `continue` on empty output. Recovery must cross the normal [budget reservation boundary](../../apps/harness/cli/src/run-budget-agent-adapter.ts), and empty output fails visibly.

Coverage: [controller/budget regression](../../apps/harness/cli/src/pi-agent/execution-controller.test.ts) proves a one-turn empty response issues one prompt and one reservation, and exhausted continuation issues no second prompt. This counts explicit prompt attempts; it makes no new claim about the SDK's internal tool-loop accounting.

## Critical Duplicate Logic To Extract

1. Project lifecycle and setup refresh path.

Repeated across `project.add`, `project.create`, `project.browse`, `project.activate`, and `project.remove`. Extract one helper that owns repository/runtime mutation, workspace or project event emission, active skill discovery, and setup refresh. This reduces drift across `US-WORKSPACE-005`, `US-WORKSPACE-008`, `US-WORKSPACE-009`, `US-SEARCH-003`, and activation setup state.

2. Run lifecycle wrapper.

`chat.send`, `planning.refine`, `planning.answer`, `run.execute`, `run.resume`, and `run.retry` repeat: assert not paused, set streaming, create abort controller, call lifecycle, handle abort, handle failure, clear streaming/controller. Extract a typed `runWithProjectExecutionController` that takes target `(projectId, threadId, runId?)` and owns cleanup.

3. Run status policy.

Working, blocking, refreshable, retryable, resumable, badge, and phase mappings are spread across server, repository, UI store, and UI status helpers. Move shared predicates into [the canonical AI core package](../../packages/ai-core/src/harness) so UI affordances and backend rejection logic stay aligned.

4. Local storage parsing and persistence.

Composer, provider, trace, execution defaults, background notifications, tutorial progress, and browser UI state all live in one large UI store file. Extract a small typed browser preferences adapter so malformed values, bounds, and defaults stay testable outside the global store.

5. Background run terminal and retry policy.

`partial-complete`, timeout, cancelled, failed, succeeded, stale, and awaiting-input behavior is repeated across scheduler, command guards, repository updates, notifications, and UI actions. Extract one shared background-run transition helper so stop, retry, delete, and display state cannot drift.

6. Filesystem trust and path canonicalization.

BranchFS, IDE file service, project open, and promotion code each normalize paths differently. Extract one helper that owns repo root, project root, realpath, symlink, Windows case, and nested-project scope checks.

7. Draft and command acknowledgement lifecycle.

The UI currently mixes optimistic command dispatch, websocket queuing, local draft persistence, attachment chip state, and backend rejection handling. Add a request-id based pending-command adapter that owns when drafts clear, restore, or remain pending.

8. Provider model namespace and cache identity.

Provider brand, model ids, cached attachment content, and credential changes need one resolver. Keep namespace validation, fallback choice, and cache invalidation together instead of duplicating provider-specific checks.

9. Stream and dense-render budgets.

Terminal, CLI session, markdown, tool activity, assistant logs, and sidebar lists each enforce caps differently. Extract shared cadence, row-window, copy-export, and redaction budgets so large hidden data does not still load or render eagerly.

10. Project file-link ownership.

Chat, assistant, trace, terminal, IDE, and experiment-review surfaces each resolve or display local paths differently. Extract one project-owned file-link adapter that covers detection, visible affordance, click behavior, and IDE open target so relative path links do not drift by surface.

11. Intervention reason ownership.

Launch approvals, planning questions, assistant questions, browser permissions, global pause, circuit breakers, and failed background runs each shape their own status text and UI bucket. Extract one shared intervention descriptor so notifications, filters, detail panes, toasts, and backend rejection messages all explain the same stop with the same action.

12. Bulk operation ownership.

Selection state, project-chat handoffs, assistant maintenance scripts, websocket commands, and per-row UI buttons should not each compute target sets and safety gates independently. The new bulk operation path covers core action authority; keep extracting kind-specific edit dialogs, destructive confirmation, and retryable partial-failure readback into that path.

13. Versioned database migration ownership.

Schema creation, legacy column discovery, one-time data transforms, current-state repair, and seed updates all run from one repository constructor. Move them into ordered transactional migrations with an explicit version, then leave repository construction with only current-schema validation and bounded recovery.

14. Domain command handlers.

The central server switch should retain exhaustive protocol dispatch but delegate each product domain to a small handler module with typed dependencies. This keeps project/thread, run/planning, assistant/job, terminal, IDE, and preference lifecycle rules reviewable without introducing a generic command framework.

15. Test resource ownership.

File-backed repositories, git fixtures, servers, sockets, watchers, and subprocesses need one disposable test scope. Cleanup should close owners before deleting a run-owned temp root and should report any retained artifact rather than silently accepting it.

16. Editable-target and selection guards.

Input ownership is reimplemented with nearby but different `closest(...)`, tag-name, role, and content-editable predicates while the intended shared helper is unused. Replace local copies with one event-target policy that can be extended for menus, selection surfaces, markdown actions, and global hotkeys.

17. Reasoning-option presentation.

The same reasoning description, strength label, and default-option label functions are copied across chat, assistant editor, background-job editor, and assistant panel. Move the copy and default policy beside the canonical reasoning contract so adding a level or changing the default cannot drift across four consumers.

18. Hotkey tooltip formatting.

`lib/hotkey-hints.ts` already owns display formatting, but app, assistant, and jobs surfaces keep local copies. Route all shortcut labels through the shared helper so platform display and preference changes remain consistent.

19. Readable-stream reader shutdown.

Background shell execution, CLI process management, and terminal sessions repeat identical `read`, `releaseLock`, and cancellation-error handling. Extract one low-level stream-reader lifecycle helper; keep decoding and domain-specific buffering at each owner.

20. Browser executable discovery.

Bootstrap, screenshot capture, and setup health each enumerate browsers and explicit overrides differently. One resolver should return ordered candidates plus structured diagnostics, with host adapters around filesystem probing.

21. Point-anchored menu and selection mechanics.

Project, assistant, jobs, runs, and IDE surfaces repeat selection toggles, Shift-range merging, interaction-ignore selectors, context positioning, Escape, and outside-click handling. Shared menu/selection primitives should own mechanics while domain adapters own actions and safety gates.

22. Shared first-party preferences and primitives.

Harness duplicates buttons, dialogs, popovers, overlay stacks, chat composition, and shared-user storage already present in `@hyperfocus/ui`. Migrate behavior contracts incrementally and keep only thin product adapters locally.

23. Test command orchestration.

Repository-root discovery, target selection, forwarded Bun flags, segmented isolation, generated fixture imports, and browser-build setup are split across scripts. One command runner should distinguish tool flags from selectors and expose testable discovery/build phases for every package command.

## Coverage Priorities

Use [coverage-matrix.md](coverage-matrix.md) as the baseline. Highest-value additions:

1. `US-JOBS-001`, `US-JOBS-003`, and `US-JOBS-004`: background job commands reject stale, cross-project, and invalid-state transitions.
2. `US-RUNTIMES-003` and `US-RUNTIMES-005`: websocket integration for CLI attach, reconnect, wrong-thread command rejection, resize fidelity, stop behavior, and capture-to-follow-up flow, plus direct `CliSessionManager` lifecycle coverage.
3. `US-DEV-002` and `US-DEV-007`: explicit tests for bootstrap and doctor CLI contract, including exit codes and flag behavior.
4. `US-UI-016` and `US-UI-017`: assert `Enter` cannot bypass disabled composer states during active streaming or setup-gated top-level sends.
5. `US-RUNTIMES-002`, `US-RUNTIMES-003`, and `US-ASSISTANTS-001`: ensure development instrumentation cannot leak prompt or output snippets through hardcoded network calls.
6. `US-SEARCH-001`: prove project search cannot block unrelated websocket traffic under slow filesystem conditions.
7. `US-RUNTIMES-005` and `US-JOBS-001`: cover rejected PTY writes and failed background scheduler launches as durable visible events.
8. `US-UI-005`, `US-DEV-017`, and `US-DEV-022`: add a focused guard against native `title` tooltips, non-exception margin utilities, and UI tests that assert arbitrary CSS classes instead of stable `data-test-*` hooks.
9. `US-ASSISTANTS-001` and `US-MODES-ROADMAP-003`: cover assistant asset refs as scoped capabilities rather than ambient prompt text.
10. `US-ASSISTANTS-001` and `US-ASSISTANTS-004`: prove every assistant launch path rejects paused, deleted, or circuit-tripped assistants, including direct chat, retry bootstrap, reprioritize, manual job release, and scheduler catch-up.
11. `US-ASSISTANTS-002` and `US-JOBS-003`: assert assistant-owned background AI output stays out of normal project chat unless explicitly promoted.
12. `US-ASSISTANTS-003` and `US-PERSISTENCE-007`: cover bootstrap retry as single-flight with stale attempt cleanup after reconnect or duplicate retry.
13. `US-WORKSPACE-005`, `US-JOBS-001`, and `US-JOBS-004`: prove project and job deletion reject or cancel active owned background runs before cascading durable rows.
14. `US-NOTIFICATIONS-001` and `US-RUNS-013`: reject assistant question answers when `(assistantId, questionId)` ownership does not match, and archive only after a successful answer transition.
15. `US-ASSISTANTS-002` and `US-UI-017`: add large assistant todo, learning, job, and log fixtures that prove empty states, caps, and raw log detail expansion stay bounded.
16. `US-ATTACHMENTS-001` and `US-ATTACHMENTS-003`: reject untrusted attachment URLs and large `data:` payloads at the websocket boundary.
17. `US-RUNTIMES-002`, `US-RUNTIMES-003`, `US-JOBS-001`, and `US-DEV-023`: enforce bounded stdout and stderr buffers for spawned processes.
18. `US-RUNTIMES-003`, `US-RUNTIMES-005`, and `US-RUNS-010`: cover missed websocket heartbeat, PTY stale detach, unused attach-token invalidation after control disconnect, and reconnect recovery.
19. `US-THREADS-008`, `US-RUNTIMES-002`, and `US-MARKDOWN-001`: assert assistant and PTY streams are coalesced, persisted at bounded cadence, and fail or detach slow websocket clients before queues grow without limit.
20. `US-RUNS-009` and `US-PERSISTENCE-007`: add long-thread payload-size regression tests for append, run-status, subtask, and trace events.
21. `US-UI-010`, `US-UI-015`, and `US-MARKDOWN-ROADMAP-001`: add a large streamed-code and large-trace UI fixture that proves live markdown and dense panes stay bounded.
22. `US-UI-002`, `US-UI-005`, and `US-NOTIFICATIONS-003`: shared dialog, sheet, and popover coverage now guards nested Escape priority and focus trapping; extend the same stack coverage when tooltip, toaster, and tutorial surfaces add new behavior.
23. `US-SEARCH-001`, `US-UI-016`, and `US-UI-017`: prove global shortcuts do not fire from editable controls unless explicitly opted in, and that composer keyboard submit cannot bypass disabled state or dispatch twice.
24. `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, and `US-PERSISTENCE-008`: cover drag/drop affordance, unsent attachment preservation or cleanup, and attachment chip behavior across thread switch and reload.
25. `US-SEARCH-001`, `US-JOBS-002`, and `US-NOTIFICATIONS-001`: cover switcher framework metadata, pending approval or job activity badges, and right-arrow thread preview with stale project/thread deletion.
26. `US-MODES-001`, `US-RUNTIMES-006`, and `US-PROVIDERS-ROADMAP-012`: cover mode-specific placeholders and normalized model tradeoff metadata without hardcoded provider assumptions.
27. `US-RUNS-007`, `US-WORKTREE-001`, and `US-RUNS-ROADMAP-001`: cover per-file BranchFS diff inspection, changed-path navigation, and promote disabled states while diff inspection is stale or failed.
28. `US-UI-002`, `US-UI-016`, `US-RUNS-005`, and `US-MARKDOWN-ROADMAP-001`: cover reduced-motion behavior, status-tint non-color cues, skeleton teardown on fast thread switches, smooth-scroll affordance state, and quote-reply focus ownership.
29. `US-DEV-007` and `US-ACTIVATION-001`: run doctor and runtime health from an extracted portable launcher folder and prove it does not depend on source-checkout `node_modules`.
30. `US-PREFERENCES-001` and `US-UI-017`: ensure preferences tests target visible, real controls and that no hidden interactive controls are exposed only for tests.
31. `US-RUNS-004`, `US-RUNS-009`, and `US-RUNS-016`: stale-thread `run.complete` rejection is covered; keep hardening terminal-state authority, final message plus status atomicity, and deferred `run.refresh` after active streaming.
32. `US-PLANNING-002` and `US-RUNS-013`: reject partial planning-answer batches when other required questions remain pending.
33. `US-THREADS-010` and `US-RUNTIMES-003`: archive threads only after live run and CLI activity stop succeeds, including stop-failure rollback tests.
34. `US-JOBS-002` and `US-JOBS-004`: cover `partial-complete` as terminal and retryable or explicitly non-retryable across guards, repository, UI, and notifications.
35. `US-PERSISTENCE-014`, `US-THREADS-007`, and `US-ATTACHMENTS-002`: preserve or restore chat drafts and unsent attachments when commands queue, reject, or fail to flush.
36. `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-007`, and `US-UI-022`: add nested-project dirty fingerprint, BranchFS symlink, IDE symlink escape, and missing `package.json` integration tests.
37. `US-PLANNING-003`, `US-PLANNING-010`, and `US-WORKTREE-004`: validate semantic plan invariants beyond schema shape before ready plans persist.
38. `US-BROWSER-001`, `US-BROWSER-002`, and `US-BROWSER-003`: foreground browser approvals now validate run/thread/session/tool ownership; extend the same durable locator to background-run inbox notifications.
39. `US-UI-020` and `US-DEV-020`: prove debug artifact files pass through the same redaction and budget path as persisted tool activity.
40. `US-PROVIDERS-002`, `US-PROVIDERS-006`, `US-RUNTIMES-006`, and `US-RUNS-012`: cover Claude model namespace acceptance and Gemini cache invalidation on Google key rotation.
41. `US-UI-023` and `US-RUNTIMES-003`: cover terminal spawn failure, high-output chunk cadence, scrollback rollover, and xterm append behavior.
42. `US-UI-010`, `US-UI-015`, `US-UI-020`, and `US-ASSISTANTS-002`: add large fixtures proving assistant loads, markdown streaming, collapsed tool blocks, and sidebar thread lists stay bounded before render.
43. `US-UI-002`, `US-UI-022`, and `US-UI-023`: test IDE command palette focus containment plus keyboard-accessible IDE and terminal tab close controls.
44. `US-WORKSPACE-005`, `US-ACTIVATION-003`, and `US-ACTIVATION-006`: assert final-project removal emits fresh setup state with `project-selected` action-required, and that project add, activate, and remove keep setup and workspace state paired.
45. `US-ACTIVATION-003` and `US-UI-017`: prove setup checklist hide behavior is either unavailable while blockers force display or persists until the next setup-version change.
46. `US-ACTIVATION-004` and `US-ACTIVATION-007`: keep the tutorial goal, missing-target, and defensive store completion tests current as onboarding workflows evolve.
47. `US-THREADS-008`, `US-UI-015`, `US-UI-017`, and `US-DEV-017`: keep browser-backed first-paint virtual-list coverage current when tab-mounted transcript, assistant, jobs, runs, memory, or trace wrappers diverge from the primitive fixture.
48. `US-UI-010`, `US-UI-022`, `US-THREADS-008`, and `US-RUNS-009`: keep browser coverage for Ctrl/Meta-click IDE open from transcript, streamed tool, trace, log, and assistant-chat surfaces with pointer affordance and project-owned target scope.
49. `US-ASSISTANTS-001`, `US-JOBS-002`, `US-RUNS-013`, and `US-BROWSER-001`: approval and input run filters are split; next prove allow-all background launch policy does not suppress required planner, assistant, or browser interventions, and prove each remaining intervention renders with a distinct reason, inline action, and matching backend rejection rule.
50. `US-ASSISTANTS-001`, `US-ASSISTANTS-004`, and `US-JOBS-001`: assert that dialog-created assistant description/job prompt, assistant-from-thread purpose, assistant-owned job description, definition prompt, assistant job prompt, todo title, and todo description updates reconcile to one coherent inferred-intent contract in the executable background prompt.
51. `US-ASSISTANTS-003`, `US-JOBS-001`, and `US-RUNS-012`: add large assistant-todo fixtures proving prompt todo selection is capped, deduplicated, ranked by contract value, and includes bounded acceptance details for the top work.
52. `US-JOBS-004`, `US-WORKTREE-002`, and `US-WORKTREE-010`: cover all-subagent setup failure as a distinct background-run outcome with clear retry/readback behavior.
53. `US-UI-ROADMAP-005` and `US-WORKSPACE-ROADMAP-005`: cover delayed click-to-select, Shift range selection, Ctrl/Cmd toggle selection, right-click selected-set menus, stale/deleted ids, mixed-scope rejection, dry-run preview, live apply, per-item partial failures, and UI/project-chat/script parity.
54. `US-THREADS-010`, `US-PERSISTENCE-001`, and `US-PERSISTENCE-009`: archive an inactive thread in a file-backed database, close, reopen twice, and prove status plus archive timestamp remain consistent through restore.
55. `US-WORKTREE-001`, `US-WORKTREE-002`, and `US-DEV-010`: stress concurrent BranchFS preparation with same-repository git readers on Windows and prove transient index contention is retried without pruning in-flight roots.
56. `US-DEV-010`, `US-DEV-012`, and `US-DEV-017`: prove every file-backed test owner disposes before cleanup, fail visibly on exhausted cleanup retries, and keep test roots outside source include trees.
57. `US-DEV-002`, `US-DEV-006`, `US-DEV-011`, and `US-DEV-023`: validate direct runtime dependencies and intentional non-import entrypoints from a clean install and portable package.
58. `US-UI-023`: replace percentile-helper coverage with an executed renderer workload or remove the benchmark from coverage evidence.
59. `US-PERSISTENCE-007`, `US-PERSISTENCE-009`, and `US-DEV-007`: run the packaged artifact with unset `NODE_ENV` and prove malformed state fails closed without thread or database deletion.
60. Closed by CR-074: populated legacy background-run history survives migration, injected failures roll back, and reopen retries atomically.
61. Closed by CR-074: upgraded legacy assistant schemas accept Claude profiles.
62. `US-UI-022`: reconnect the AI core client while the old socket emits late message, close, and error events; assert the new generation remains authoritative.
63. `US-ACTIVATION-008` and `US-RUNS-010`: issue a native desktop open while a websocket client is connected and assert workspace, project, and setup events arrive in order.
64. `US-WORKSPACE-001`, `US-ASSISTANTS-001`, `US-JOBS-002`, and `US-RUNS-009`: consume bulk preview/apply events in UI tests, including destructive confirmation, partial failure, stale ids, live targets, retained selection, and retry-safe ids.
65. `US-DEV-010` and `US-DEV-017`: smoke default `test:profile`, forwarded generic test flags, and explicit target selection without executing unrelated monorepo suites.
66. `US-UI-022` and `US-DEV-010`: build the generated IDE positioning fixture against the public protocol export.
67. `US-DEV-002`, `US-DEV-023`, and `US-ACTIVATION-002`: exercise stale explicit browser paths with valid fallback installations through bootstrap, screenshot, and health paths.
68. `US-UI-002`, `US-UI-006`, and `US-UI-022`: cover Shift+F10, Arrow/Home/End, disabled reasons, focus return, and nested Escape ownership for every context-menu consumer.
69. `US-UI-002` and `US-UI-022`: prove shared-user preference changes and legacy migrations round-trip between editor and Harness.
71. `US-DEV-007`, `US-DEV-010`, and `US-DEV-023`: require exact coverage paths and keep doctor/repair story text aligned with shipped command semantics.
72. Closed by CR-083: the tagged-release contract requires the Harness suite, exact archived asset upload, missing-file failure, extraction verification, and executable smoke.
73. `US-PREFERENCES-001`, `US-PROVIDERS-001`, `US-PROVIDERS-006`, and `US-PERSISTENCE-007`: omit every optional preference field from an older-client fixture and inject failure after each credential, adapter, SQLite, and refresh phase; assert one authoritative committed snapshot after reopen.
74. Closed by CR-085: shared-relative-path project switches, delayed tree/read/Git replies, and reversed save acknowledgements prove project plus content-revision ownership.
75. `US-RUNTIMES-003`, `US-RUNTIMES-005`, `US-UI-023`, and `US-UI-024`: replace a terminal and CLI session socket while the old socket emits late open, message, close, and error callbacks; prove the replacement remains registered and authoritative.
76. `US-ACTIVATION-008`, `US-UI-022`, and `US-DEV-001`: exercise N-1/N+1 shared-client and long-lived desktop-server combinations with supported and rejected protocol ranges.
77. `US-UI-002`, `US-UI-022`, and `US-UI-023`: exercise all resizers through pointer cancellation, lost capture, unmount, replacement drag, and Arrow/Home/End keyboard resizing.
78. `US-DEV-002` and `US-DEV-008`: inject stderr, directory creation, file write, full-disk, and read-only-path failures into fatal startup logging and prove the original error plus intended process exit remain authoritative.
79. `US-JOBS-001`, `US-JOBS-004`, `US-PERSISTENCE-007`, and `US-PERSISTENCE-009`: inject failure between every schedule/run/event/dispatch step, close and reopen, and prove each due occurrence is either durably dispatchable or visibly terminal without suppressing future schedules.
80. `US-UI-002`: exercise the exported shared Dialog with initial Shift+Tab, both wrap directions, hidden/disabled boundary controls, dynamic removal, nested overlays, and real-browser focus containment.
81. `US-DEV-008`, `US-DEV-011`, and `US-PROVIDERS-006`: accept a runtime update from an extracted portable launcher, restart, and prove the executable actually uses the acknowledged version; reject or redirect package-manager mutation in portable mode.
82. `US-UI-002`, `US-UI-006`, and `US-UI-022`: Tab and Shift+Tab out of shared ActionMenu in a real browser, including nested dialog and sheet cases, and assert dismissal plus the intended focus destination.
83. Closed by CR-094: real control and terminal handshakes cover foreign, null, wrong-port, same-origin, and explicit native clients; rejected clients receive no state, mutation authority, or attach token.
84. `US-ACTIVATION-001`, `US-ACTIVATION-008`, and `US-DEV-008`: discover updates from releases containing both editor and Harness archives in either order and reject ambiguous or wrong-product matches.
85. `US-UI-002`, `US-UI-009`, and `US-UI-011`: query shared and Harness composer textareas by stable accessible name before and after draft entry, including multiple composer panels.
86. `US-DEV-001`, `US-DEV-002`, `US-WORKSPACE-001`, `US-PERSISTENCE-001`, `US-PERSISTENCE-010`, and `US-PERSISTENCE-011`: launch two processes against one Harness home and prove broker reuse or mutual exclusion across workspace, scheduler, credential set/delete, and stale-lock recovery.
87. `US-ACTIVATION-001`, `US-ACTIVATION-008`, and `US-DEV-008`: build from mismatched tags and adjacent revision suffixes, require release failure on mismatch, and verify the extracted artifact plus updater preserve full version ordering.
88. `US-UI-002`: transition shared Tabs, SegmentedControl, and Tree through empty/populated, active removal, selected disablement, invalid controlled value, filtering, and all-disabled/enabled states; prove real Tab entry always reaches an enabled item when one exists.
89. `US-ATTACHMENTS-002`, `US-ATTACHMENTS-003`, `US-RUNS-001`, and `US-RUNS-010`: process hostile compression ratios, entry/page counts, irrelevant archive media, abort/time limits, and repeated historical attachments in isolation; prove bounded rejection without server loss.
90. `US-UI-002`, `US-UI-003`, and `US-UI-011`: verify shared ButtonGroup geometry across long/localized labels, icons, font load, density, zoom, and resize; assert every action appears exactly once and the overflow trigger remains reachable.
91. `US-MODES-008`: synchronize managed skills across clock skew, user edits, upstream deletion, partial failure, and rollback; assert exact manifest hashes and explicit conflict behavior.
92. `US-UI-002`: query every shared preference toggle, range, select, segment, and text control by definition title and assert its accessible name remains stable after value changes.
93. `US-DEV-023`: execute the screenshot skill's documented command from repository-root and extracted-launcher working directories, asserting either a real packaged entrypoint or explicit capability absence.
94. `US-JOBS-001`, `US-JOBS-003`, `US-JOBS-004`, and `US-PERSISTENCE-011`: spawn real shell fixtures with no refs, selected refs, empty/missing refs, and sentinel Harness secrets; assert safe baseline retention, no unrequested secret inheritance, and risk parity with effective authority.
95. `US-MODES-008`: execute every scripted bundled skill from an unrelated project cwd after global install and launcher extraction, resolving implementation relative to the selected skill rather than the project.
96. `US-UI-002` and `US-UI-022`: change SourceEditor document and read-only props without relying on parent remounting; prove displayed content, edits, saves, subscriptions, and late callbacks all share one current document generation.
97. `US-MODES-008`: execute every bundled script with repository `node_modules` hidden from resolution, proving an explicit portable dependency closure or clear capability exclusion.
98. `US-UI-002`: collapse sidebar, inspector, and bottom panels from internal controls and external/fullscreen state while focus is inside; assert transfer to the surviving reveal handle and correct subsequent Tab order.
99. `US-UI-023`, `US-UI-024`, `US-PERSISTENCE-007`, and `US-PERSISTENCE-009`: persist and reopen 65+/256+ mixed active/closed sessions; prove active/newest survival, valid layout, old eviction, scrollback pruning, and bounded aggregate blob size.
100. `US-MODES-008`: collide project and global skill names across prompt, assistant capability, and UI inventory consumers; prove one documented project override with provenance and diagnostics.
101. `US-UI-002` and `US-UI-003`: tab through disabled-with-reason shared Buttons and ButtonGroup actions, assert a stable accessible explanation, suppress all activation paths, and preserve native form semantics where required.
102. `US-JOBS-001`, `US-JOBS-003`, `US-UI-023`, and `US-PERSISTENCE-010`: resolve persisted relative cwd from foreign source and portable process directories, restart, and prove one project-relative identity with explicit absolute/symlink policy.
103. `US-MODES-008`, `US-PERSISTENCE-007`, and `US-PERSISTENCE-010`: compare production and maintenance database resolution for absolute, relative, tilde, empty, and differing-cwd overrides, then prove mutation targets the authoritative database only.
104. `US-ASSISTANTS-001`, `US-JOBS-001`: preserve read-only, summarization, documentation, and explicit negative constraints through intent compilation and rendered launch prompts (CR-060).
105. `US-PLANNING-003`, `US-WORKTREE-005`: reject planner-owned prerequisite completion, retain pending state on failed setup, and resume only from host-owned evidence (CR-046).
106. `US-WORKTREE-005`, `US-PLANNING-010`: require execution receipts for declared failing checks, custom scripts, and non-JavaScript projects; preserve frozen checks through corrections (CR-115).
107. `US-ASSISTANTS-005`, `US-JOBS-003`: combine unrelated durable answers, pending duplicates, force-blocking, high-risk wording, and disabled autoapproval; assert no unanswered blocker becomes an answer (CR-116).
108. `US-JOBS-001`, `US-RUNS-013`: auto-resolve input after interruption and prove success remains impossible until execution resumes and acceptance completes; preserve question-shaped infrastructure errors as failures (CR-117).
109. `US-PREFERENCES-001`, `US-RUNS-011`: exercise every correction policy against low/high difficulty and repeated gaps (CR-118).
110. `US-RUNTIMES-001`: preserve error, aborted, stale, and truncated provider outcomes after partial assistant text (CR-119).
111. `US-RUNS-015`: exhaust a one-turn budget with an empty Pi response and prove the internal recovery issues no unreserved prompt (CR-120).

## Review Status

The 2026-09-19 implementation closes CR-060 and CR-115 through CR-120, plus the completion-authority/atomicity and prerequisite-trust portions of CR-042/CR-046. Reproduced counterexamples are now regressions against production functions or websocket flows. The remaining review backlog is not implied closed: broader lifecycle/semantic issues, whole-job side-effect replay, the proof ledger, and task-specific domain correctness retain their explicit limits. Historical audit test totals above describe the pre-fix investigation.

Implementation validation: `bun run test:harness` passed, including backend integration, UI, and browser tests; `bun run typecheck:harness` and `bun run check:process-policy` passed. Four Windows lifecycle/inspection tests passed, covering visible-window suppression and descendant cleanup. Repository-wide source structure remains blocked by the unrelated PadPilot evaluator directory count; code style remains blocked by unrelated review-store, UI inspector, and artifact-review changes in the shared worktree. No packaged-launcher or live-provider acceptance was performed for this closeout.
