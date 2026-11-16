# User Stories

## Thread collaboration

US-THREADS-011: Follow a Harness-managed subagent to its parent and children,
  distinguish forks from delegation, and recover the same lineage after restart.
US-THREADS-012: Send an attributed message to another thread and have its
  agent operate automatically, queuing behind busy work and respecting approvals.
US-THREADS-013: Queue a follow-up while thinking with Enter, or use
  Ctrl+Enter/Ctrl-click to steer a supported live session. Rejected delivery keeps
  the draft; queued input survives restart without replaying interrupted work.

US-QUALITY-001: Inspect expected rules, actual delivery, child handoffs and independent
verification in existing Run details, with evidence and reasons for missing checks.
Mandatory gaps cannot claim verified completion; retrying work requires fresh evidence.
Legacy runs and opaque runtimes remain explicitly unknown.
The review names requirements and unresolved decisions before technical IDs;
passed checks and raw receipts remain available in disclosures. Human acceptance
is never inferred from successful automation.
Delegation preserves the host's intent, audience, journeys, compositions, accepted
decision references and verification profile. Passing machine checks cannot clear
qualitative review; nested workers cannot drop their parent's obligations.

US-ATTENTION-001: Return to Projects through the Harness brand and reveal setting
explanations only when needed. [Attention evidence](../design-system/attention.md)
and preference-control tests cover browser behavior; native acceptance is separate.

## Swarm engineering

| ID | User outcome | Acceptance boundary |
| --- | --- | --- |
| US-CONNECTIONS-001 | Connect a remote provider from my phone and resume waiting work without SSH or laptop supervision. | Shared typed adapters, scoped browser authorization, durable operations/events, bounded sign-in, restart reconciliation and cancellation. Live provider authorization is a separate acceptance gate. |
| US-SWARM-008 | Launch an adaptive campaign, close the laptop, follow a conversation from a phone and resume the originating agent from durable results. | Cloud ownership acknowledgement and phone access before launch; shared clock/budgets across rounds; independent stop criteria; persisted callbacks, explicit acknowledgement and verified artifact downloads. Real laptop-off Railway acceptance remains required. |
| US-SWARM-001 | Submit the current project and immutable working snapshot from a thread using Run with Swarm. | Authenticated host proxy, explicit backend, plan, bounded concurrency and budget; unavailable provider never runs locally. |
| US-SWARM-002 | Follow independent candidates, findings, validation and controlled comparisons; cancel or reject work. | Durable tasks/artifacts, lease recovery, isolated workspaces and bounded capture/read progress with learned findings across turns; generic engineering uses independent recipe verification, while performance uses qualified paired comparisons. |
| US-SWARM-003 | Inspect a verified patch and approve integration without overwriting changed work. | Source-tree and hash checks, candidate gates, conflict reporting and repeated remote validation; engineering verifier changes remain proposals until host review and a new immutable baseline. |
| US-SWARM-004 | Monitor work from native status or the authenticated swarm page, steer it and queue bounded follow-up plans. | Live selected-run updates survive closing the dialog; stable controls, explicit completion criteria and usage ceilings; queued plans require separate launch. |
| US-SWARM-005 | Open a short-lived cloud link from Harness or Editor and review or control the authorized run away from the workstation. | One-use bootstrap, scoped cookie session, readonly/control permissions, CSRF checks, revocation, same-source follow-ups and no remote local-patch application. |
| US-SWARM-006 | Inspect the desired outcome, executable methods, competing hypotheses and raw experiments before accepting a result. | Minimal crew selection, trusted falsification before implementation, protected counterevidence, bounded repair/revalidation and separate task/outcome success; missing independent evidence blocks integration. |
| US-SWARM-007 | Reopen a finalized real run in Harness and Editor after its coordinator and cloud workspaces have stopped. | Authenticated read-only archive access, unchanged run/source identities, verified artifact hashes and visible archived status; no execution owner, credentials, mutations or project-memory writes. |

[Swarm ownership and current live acceptance](swarm.md) distinguish implemented
local/fixture behavior from live Railway verification and remaining acceptance gaps.

The [sixth visual batch](../design-system/next25-batch6-harness.md) adds custom-mode
pending/acknowledged/rejected saves, retained drafts across host refresh and
in-editor discard guards. Host exit and browser reload remain explicit debt.

The [fifth visual batch](../design-system/next25-batch5-harness.md) extends
US-MODES-001 with stable custom-mode drafts, searchable choices, associated
required errors, disclosed execution policy and named deletion. US-MODES-007
retains typed callbacks. US-PREFERENCES-001 now rejects empty/unrecognized imports
and preserves custom shortcuts omitted from a partial payload.

The [fourth visual batch](../design-system/next25-batch4-harness.md) adds concrete
task coverage for US-UI-021 (log reading), US-UI-019/US-RUNS-012 (usage/reset),
US-PREFERENCES-001 (shortcut search/edit/conflict and import recovery) and
US-PREFERENCES-004 (provider-key removal confirmation).

The [third visual batch](../design-system/next25-batch3-harness.md) refines
US-UI-021 (readable Trace metadata), US-UI-025 (full conversation context),
US-UI-024 (terminal-history destination), US-THREADS-010 (cleanup errors),
US-ACTIVATION-004 (walkthrough choice), US-PLANNING-004 (latest-plan navigation)
and US-RUNS-003 (subtask identity). The handoff owns task-level evidence and limits.

Canonical product-behavior inventory for the harness. Every shipped capability in the [harness README](../../apps/harness/README.md) and every roadmap bullet in [todo.md](todo.md) maps to one `US-*` entry here. [coverage-matrix.md](coverage-matrix.md) tracks which stories have tests and where the gaps are.

Story IDs are stable. When behavior changes, update the matching story and its coverage entry in the same change.

Format: `US-<AREA>-<NNN>: As a <role>, I <capability> so that <outcome>.`

Shipped stories derive from the harness README; roadmap stories derive from the
TODO. Add a focused source section only when the owner alone is ambiguous.

Roles: `user`, `developer`, `reviewer`.

## Area Index

### Shipped (from [the harness README](../../apps/harness/README.md))

| Area | Count |
|------|------:|
| WORKSPACE | 9 |
| THREADS | 10 |
| PLANNING | 10 |
| RUNS | 16 |
| PROVIDERS | 7 |
| RUNTIMES | 6 |
| WORKTREE | 11 |
| ATTACHMENTS | 4 |
| MODES | 8 |
| ASSISTANTS | 7 |
| JOBS | 4 |
| NOTIFICATIONS | 3 |
| BROWSER | 3 |
| ACTIVATION | 8 |
| UI | 26 |
| PERSISTENCE | 16 |
| PREFERENCES | 3 |
| DEV | 26 |
| SEARCH | 3 |
| MARKDOWN | 2 |

### Roadmap (from [todo.md](todo.md))

| Area | Count |
|------|------:|
| ACTIVATION-ROADMAP | 5 |
| THREADS-ROADMAP | 2 |
| PREFERENCES-ROADMAP | 1 |
| SEARCH-ROADMAP | 1 |
| UI-ROADMAP | 5 |
| RUNS-ROADMAP | 4 |
| WORKTREE-ROADMAP | 1 |
| PROVIDERS-ROADMAP | 14 |
| JOBS-ROADMAP | 7 |
| RUNTIMES-ROADMAP | 5 |
| BROWSER-ROADMAP | 5 |
| ATTACHMENTS-ROADMAP | 5 |
| MARKDOWN-ROADMAP | 1 |
| PERSISTENCE-ROADMAP | 4 |
| MODES-ROADMAP | 4 |
| PLANNING-ROADMAP | 4 |
| WORKSPACE-ROADMAP | 5 |

---

## Shipped

### WORKSPACE

US-WORKSPACE-001: As a user, I use a multi-project workspace where each project root keeps its own local chat history and multiple switchable threads so that work stays separated by repo or folder.

US-WORKSPACE-002: As a user, I start from an empty workspace with no synthetic default project so that I only see projects I explicitly add.
First-run uses the work area for project opening; contextual navigation and
details appear when populated without resetting the mounted navigation state.

US-WORKSPACE-003: As a user, I map each project to a validated local folder path, and unavailable roots are rejected before recursive creation, so paths are trustworthy before chat or runs proceed.

US-WORKSPACE-004: As a user, I open a project at the repository root or a nested folder inside a larger git repository so that monorepos and subfolders work naturally.

US-WORKSPACE-005: As a user, I return to an empty workspace after removing the final project so that "no project open" is a normal state.

US-WORKSPACE-006: As a user, I activate an already-open project directly through the switcher instead of getting a fresh thread so that context-switching preserves my current thread, hydrates its saved run and questions, and reports the persisted run status before streaming reconnects.

US-WORKSPACE-007: As a user, I browse folders through a typed backend bridge that never puts raw shell commands on the websocket so that browsing stays safe and structured.

US-WORKSPACE-008: As a user, I get project open flows that resolve through one typed result path whether the root is new or already known.

US-WORKSPACE-009: As a user, I see project open responses that say whether a new project was created or an existing project was reopened with a new thread so that UI reflects what actually happened.

### THREADS

US-THREADS-001: As a user, I keep multiple named threads per project with one selected active thread so that I can hold parallel conversations in the same repo.

US-THREADS-002: As a user, I create a blank thread in the same project and switch to it immediately with "New thread" so that starting fresh is one click.

US-THREADS-003: As a user, I reopen an already-known project root and get a fresh thread created and activated instead of an error so that reopen always moves me forward.

US-THREADS-004: As a user, I fork a thread with pi-fork that clones only the source transcript and leaves run state, traces, errors, and drafts behind so that branches are clean.

US-THREADS-005: As a user, I see thread titles auto-generated from the first user message until I rename them so that threads stay identifiable without manual labeling.

US-THREADS-006: As a user, I see the active chat header show the thread title, support inline rename, and expose a copyable thread id so that I can reference threads elsewhere.

US-THREADS-007: As a user, I switch projects and threads while another thread keeps streaming in the background so that long runs do not block navigation; only destructive removal stays blocked during active execution.

US-THREADS-008: As a user, I see high-signal lifecycle run milestones stream through one live tail message during active work and then persist as compact phase rows before the final assistant answer, with raw tool chatter hidden, so that run history is readable in context.

US-THREADS-009: As a user, I see thread badges summarize status as purple User Input, orange Planning, yellow Executing, red Error, green Done so that I can scan a project at a glance.

US-THREADS-010: As a user, I archive and restore threads with optional auto-archive preferences so stale threads leave the active surface without losing history.

### PLANNING

US-PLANNING-001: As a user, I create focused project notes with semantic tags and let tool-capable Pi planner, main executor, or subagent sessions pull at most four relevant notes through `memory_search`, with hit and stale-state audits visible, so prior context is available without entering every prompt. I reuse existing tags and combine text, semantic tag, pinned and archive filters to find notes; reordering requires clearing filters so hidden notes are not moved accidentally. (README What It Is, UI Stack)

US-PLANNING-002: As a user, I answer interactive planning questions that pause execution until I reply, with three typed quick options and one recommended path so that clarification is fast and structured.

US-PLANNING-003: As a user, I rely on plan-first execution that persists a full execution plan, posts a durable plan summary into chat, respects my explicit composer model choice during planning, and lets ready cards execute the stored run by id so that I can review before the agent acts.

US-PLANNING-004: As a user, I open transcript-level plan summary cards and reach the shared plan modal from chat or trace so that the plan stays one click away while I read the thread.

US-PLANNING-005: As a user, I rely on project `AGENTS.md`, types, tests, and explicit workspace or project rule overrides for durable direction so that policy stays human-readable and architectural instead of depending on opaque memory. (README What It Is, Runtime Shape)

US-PLANNING-006: As a developer, I see planner-ready and planner-question transcript messages stop reporting `isStreaming` before the UI accepts refinement or answer input so that composer affordances become enabled at the right moment.

US-PLANNING-007: As a developer, I see repeated clarification turns scope planner-question ids per run so that later runs in the same thread do not collide with older pending or answered questions.

US-PLANNING-008: As a user, I replace a ready plan through a typed `planning.refine` command that starts a fresh planning cycle in the same thread so that I can redirect without losing thread history.

US-PLANNING-009: As a user, I open one execution plan modal from chat or trace that lays out summary, prerequisites, bucket strategy, isolation mode, contracts, verification scope, and correctness history so that I can review the full contract before and during execution.
Review begins with the summary; run metadata and execution brief are disclosed, prerequisites/contracts have counted headings, long paths wrap and empty contracts are explicit. See [plan review evidence (temporary; prune after findings are promoted)](../../.local/design-system/notes/next-plan-review.tmp.md).

US-PLANNING-010: As a user working across stacks, I get planning and execution context derived from project-declared commands and instruction routes, with missing verification explicit instead of invented TypeScript checks. Frozen checks survive corrective plans. Fresh prerequisites start pending and require host-run acceptance before dependent foreground or background work; persisted host completion supports resume. Discovery JSON remains read-only and does not itself certify setup.

### RUNS

US-RUNS-001: As a user, I pause and resume workspace-global execution so that new launches and follow-up asks block until I resume, while in-flight work continues.

US-RUNS-002: As a user, I get resumable partial subagent runs whose plan cards show durable Resume state after failure or stop so that I can continue without redoing work.

US-RUNS-003: As a user, I retry full runs and individual subagents persistently from durable run state, including failed and successful plan cards, so that iteration is cheap.

US-RUNS-004: As a user, I manually refresh active runs and active subagents, with deferred refresh while work is still streaming so that I can pull fresh state on demand.

US-RUNS-005: As a user, I get a dirty-git preflight with configurable chat-run restriction, tracked-plus-untracked threshold, and fail-closed inspection errors so that risky runs fail before they start; nested product folders identify their inherited parent repository and explain how to create an independent project boundary.

US-RUNS-006: As a user, I see a new top-level task or plan refinement clear prior transient traces, plan cards, countdown, and context snapshots for that thread so that follow-up runs do not inherit stale execution noise.

US-RUNS-007: As a user, I see a run cockpit that includes virtual-branch experiment review, promote, and discard actions plus an intentional project-note pane so experiment lifecycle and relevant historical context remain inspectable. (README UI Stack)

US-RUNS-008: As a developer, I trigger plan execution through a typed `run.execute` command after plan presentation, not as an implicit side effect of `chat.send`.

US-RUNS-009: As a developer, I trigger run lifecycle commands (execute, resume, retry, refresh, preflight) through typed websocket contracts.

US-RUNS-010: As a user, I see workspace-global execution pause and resume propagate to every connected client through a shared execution-control event so that clients stay in sync.

US-RUNS-011: As a user, I get a post-merge structural correctness review that catches known gaps and can queue a corrective plan-first follow-up iteration. Every correction honors the selected iteration policy regardless of difficulty. Its summary explicitly leaves runtime behavior, domain correctness, and full plan completion unverified, including when no structural gaps are found.

US-RUNS-012: As a user, I see runtime usage totals count input plus output, with cached input shown as a subset, and current app-session and durable lifetime totals when providers expose them. Context occupancy is shown as unknown when a runtime provides cumulative usage without a live context measurement.

US-RUNS-013: As a user, I get deferred planner questions, assistant questions, and browser approvals queued during global pause and released on resume so that nothing gets dropped.

US-RUNS-014: As a user, I get a clear non-git repair choice before dirty-git-protected runs so that I can initialize git, disable the preference, or cancel instead of hitting a hidden failure.

US-RUNS-015: As a user, I can launch runs with a typed runtime turn budget that tracks used and remaining turns and fails hard on exhaustion. Pi empty-output recovery cannot issue an unreserved extra prompt, so long work stops predictably. (runtime budget)

US-RUNS-016: As a developer, I rely on execution-owned finalization that atomically persists the final assistant message and terminal state before emitting completion events. Client `run.complete` requests cannot forge success for ready, active, or terminal runs. (run lifecycle)

### PROVIDERS

US-PROVIDERS-001: As a user, I see capability-aware model metadata so the UI explains tool, vision, browser, context, speed, and cost expectations before execution starts.

US-PROVIDERS-002: As a user, I get runtime-aware model selection so Codex CLI sticks to Codex-compatible GPT choices for planning and execution, and stale unsupported picks fall back before a run starts.

US-PROVIDERS-003: As a user, I get brand-aware defaults for GPT, Gemini, or Claude execution so first-run behavior matches the provider I selected.

US-PROVIDERS-004: As a user, I get Gemini planning defaulting to `google/gemini-3-flash-preview` so planning stays fast on that provider.

US-PROVIDERS-005: As a user, I get spawned subagents dropping to the cheapest runtime-compatible sibling in the same model family and inheriting fast mode when supported so parallel work stays aligned with the chosen model while keeping cost in check.

US-PROVIDERS-006: As a user, I persist OpenAI, Google, and Anthropic API keys plus provider brand preference locally for this machine so that setup survives restart.

US-PROVIDERS-007: As a user, I see provider brand switching gated by matching saved key presence so that I cannot enter a broken state.

### RUNTIMES

US-RUNTIMES-001: As a user, I pick from multiple agent runtimes: pi, GitHub Copilot CLI, and Codex CLI so that I can use the agent that fits the task.

US-RUNTIMES-002: As a user, I get Codex CLI noninteractive runs through the bundled official Codex SDK and CLI with live web search plus writable shell network access, keep review mode prompt-driven inside the harness instead of special native review routing, and on Windows writable runs auto-use full access because bundled Codex currently downgrades `workspace-write` to read-only there while read-only tasks stay sandboxed.

US-RUNTIMES-003: As a user, I use optional live CLI sessions for Copilot CLI and Codex CLI over Bun-managed piped transport with attach tokens, reconnect, terminal-drawer visibility, close controls, and follow-up capture so that terminal-style agents stay inspectable.

US-RUNTIMES-004: As a developer, I see thread continuity stay harness-owned even for CLI runtimes so fresh CLI invocations rebuild context from persisted transcript and plan state, retaining the run runtime, provider, reasoning and fast-mode choices through execute, answer, refine, resume and retry.

US-RUNTIMES-005: As a developer, I see live CLI sessions run behind typed lifecycle commands while terminal bytes flow through a separate short-lived attach channel so that control and data planes stay separated.

US-RUNTIMES-006: As a user, I use one composer dropdown for reasoning effort and fast mode, see unsupported options stay visible but disabled, and get runtime-specific honoring across Pi GPT, Gemini effort, and Codex CLI SDK reasoning plus explicit service-tier configuration so that model control stays explicit without guesswork.

### WORKTREE

US-WORKTREE-001: As a user, I run risky work on run-only virtual experiment branches via BranchFS-style isolated mounts so that execution stays off physical disk until I promote. Source symlinks are rejected outside documented passthroughs, and promotion uses the same nested-project dirty scope as preparation.

US-WORKTREE-002: As a user, I rely on isolated BranchFS subagent mounts so that parallel coding tasks do not mutate one checkout in place.

US-WORKTREE-003: As a developer, I replay isolated subagent results inside a separate BranchFS integration mount, verify declared checks there, and flush only after success so that failed integration does not dirty the host checkout. A project without declared checks reports verification as unverified, including projects without a package manifest.

US-WORKTREE-004: As a user, I default to same-worktree subagent mode when contracts path-split cleanly, fan those subtasks out in parallel until owned paths overlap, and upgrade overlapping or unknown ownership to isolated worktrees so execution speed matches real path safety.

US-WORKTREE-005: As a user, I drive subagent work with contracts (prerequisites, owned paths, scoped verification, merge notes). The host runs frozen checks before accepting execution, isolated integration, and individual retries; failing checks prevent completion, while absent checks remain explicitly unverified.

US-WORKTREE-006: As a user, I replay subagent edits inside a separate BranchFS integration mount when isolated mode is selected; same-worktree mode reports observed changes outside each task's scope with unknown authorship, so main review can inspect sibling and external edits without falsely assigning contract violations or discarding useful work.

US-WORKTREE-007: As a user, I keep repo-level context available when my project points at a nested folder while execution stays scoped to the selected project folder so that subagents understand both cwd and repo-root files.

US-WORKTREE-008: As a user, I still fan out subagent work in repositories with no commits yet using ephemeral snapshot state so that greenfield repos are usable.

US-WORKTREE-009: As a user, I see same-worktree scaffold and import-root work run before dependent sibling subagents so parallel work does not read missing files.

US-WORKTREE-010: As a user, I see subagents avoid visible browser or dev-server verification, guessed skill paths, unnecessary media conversion probes, and brittle Windows search quoting so background work stays focused.

US-WORKTREE-011: As a user, BranchFS stays automatic while ignored local data is excluded, old or failed roots are pruned, fresh partial workspaces remain protected from retention limits while materializing, large materialization is quietly surfaced, and manual cleanup is available from Preferences so isolated work remains useful without consuming unbounded disk. Failed removal remains reported and owned until cleanup succeeds. (BranchFS maintenance)

### ATTACHMENTS

US-ATTACHMENTS-001: As a user, I attach screenshots, PDFs, and text or office-doc specs through UploadThing-backed attachments that persist with chat history and route into prompts.

US-ATTACHMENTS-002: As a user, I see composer support for attachment chips, UploadThing upload flow, vision-aware image gating by selected model, and document ingestion for PDF, DOCX, XLSX, PPTX, and ODT on new top-level tasks.

US-ATTACHMENTS-003: As a developer, I see chat message persistence include uploaded attachment metadata while planner and execution stages resolve remote image, text, and supported document context on demand, with the expanded conversation included once per planner prompt, including schema repair.

US-ATTACHMENTS-004: As a developer, I use runtime-safe PDF handling on the server so that Bun development startup does not depend on browser-only globals.

### MODES

US-MODES-001: As a user, I use built-in workflow modes for asking, planning, implementing, debugging, and review, plus local custom modes at workspace or project scope. Custom-mode saves distinguish pending, accepted and rejected outcomes; failed saves retain the draft. Workspace/project drafts survive in-session host navigation with explicit restore/discard, while external removal requires deliberate recreation. Browser unload warns about retained drafts; accepting unload does not persist them.

US-MODES-002: As a user, I see obvious low-complexity workspace actions such as direct file or folder requests, plus correction-style follow-ups that refine where the edit should land, auto-switch into implement mode and skip planner turn-taking, and simple leading-slash task paths like `/breakout` normalize to workspace-relative targets when the request is clearly local.

US-MODES-003: As a user, I get built-in modes with different confirmation defaults: plan waits for Build now even when my global plan gate is immediate, ask suppresses transcript plan cards for direct Q&A, and implement auto-runs unless the frozen plan fans out to multiple subagents.

US-MODES-004: As a user, I see composer input auto-switch built-in modes when message intent is clear enough, using recent thread context to repair correction follow-ups, so direct questions, review requests, debugging prompts, planning asks, and local workspace edits do not depend only on stale sticky mode state, while an explicit manual mode selection stays pinned for that send.

US-MODES-005: As a developer, I see mode selection and rule sources travel through typed contracts while project notes use explicit typed commands and pull-based retrieval instead of ambient prompt injection. (README Runtime Shape)

US-MODES-006: As a developer, I see built-in modes as policy presets, not separate pipelines: ask and plan bias toward read-heavy planning, execution access is configured separately from that intent, implement biases toward delivery, debug biases toward root-cause, and review biases toward findings-first.

US-MODES-007: As a developer, I see the UI send typed project and chat commands only so that modes stay behind a narrow contract.

US-MODES-008: As a user, I use shared skills from a global harness skill root across any opened project while project-local skills can still customize behavior. Bundled skill copying excludes generated Python caches. Synchronization does not prune existing global files, so older installations may retain retired skills. (README What It Is)

### ASSISTANTS

US-ASSISTANTS-001: As a user, I use local assistant operators with named personas, role prompts, project or global scope, synced routing defaults, action-runbook guidance, chat-addressable actions from project chat, assistant-owned background job creation, non-blocking question auto-approval preferences, pause and resume controls, chat, todo lists, learnings, open questions, clone-to-project flow, and high-level plus deep-debug logs.
Assistant creation starts with identity and required prompts before disclosed execution/scope and asset configuration. Detail uses a secondary action menu; chat, Todos and Learnings retain readable content and reachable controls in constrained panes.

US-ASSISTANTS-002: As a user, I get a dedicated Assistants surface with search and filters so assistant chat, todos, questions, bounded learnings, logs, and on-demand bounded pages of assistant-owned jobs and runs stay inspectable outside normal project chat.

Question answers have a visible accessible label and reject blank drafts. Questions,
Jobs, Runs and Config fit the actual pane width; complete routing identifiers wrap.
Working memory is disclosed beside conversation; Todo entry is named with empty-state guidance, and learning confidence/actions remain legible without competing with the summary. See [assistant surface evidence](../design-system/next-assistants.md).

US-ASSISTANTS-003: As a developer, I see assistant state persist locally in SQLite, including canonical thread memory summaries, active todo list, deduped and compacted learnings, pending questions, structured logs, assistant intent contracts, and assistant-linked background jobs.

US-ASSISTANTS-004: As a user, I see assistant-owned jobs share the same scheduler path while assistant circuit breakers can auto-pause failing assistants and surface blocking questions for user intervention.

Recovery explains the failure before optional state diagnostics and recovery actions.

US-ASSISTANTS-005: As a user, assistant operators reuse appropriately scoped guidance for non-blocking questions while blocking/risk policy takes precedence. Unknown and unanswered duplicate questions remain blocking, and inferred assumptions do not become high-confidence user decisions.

US-ASSISTANTS-006: As a user, a newly idle assistant asks whether to bootstrap default research, todo maintenance, and implementation jobs, and those jobs push toward market research, reusable skills, TypeScript scripts, and concrete product implementation.

US-ASSISTANTS-007: As a user, build-oriented assistants keep structured todo work categories and targets, bias generated todos toward coding after early discovery, ask once for a coding-project stack preference, and default to TypeScript, Bun, `bun test`, SQLite when persistence is needed, SolidJS plus StyleX when UI is needed, Happy DOM frontend tests, and useful documentation comments for new functions and variables when no existing stack or user preference overrides it.

### JOBS

US-JOBS-001: As a user, I use local scheduled tasks and background jobs with durable ANSI-free SQLite history, intent contracts, startup catch-up, approval policy defaults, non-blocking assistant question auto-approval, hidden automation threads, renewable ownership leases, visible due, blocked, stale, concurrent launch, timeout, progress, congestion/capacity scheduler state, and a dedicated health view for recent reliability. Interrupted runs fail visibly after controller/lease checks; I review their activity and retry manually.

Scheduled-task authoring preserves literal shell arguments through save/reload,
offers an explicit single-empty-argument choice, validates timeout and environment
reference bounds locally, confirms draft/template replacement, and lets me repair
unavailable project/mode selections without losing other fields. Embedded-newline
arguments are preserved but require explicit replacement to edit in the line editor.

The Jobs roster prioritizes name, status, project and next run, with full metadata in selected detail, separate bulk selection and keyboard-accessible command menus. Search and filters keep detail and trace on the same visible job; empty results clear the context. Narrow pane navigation retains the Jobs label and selection.

US-JOBS-002: As a user, I use searchable and filterable Jobs and Runs views to inspect scheduled work, approval-needed runs, failures, and concise execution milestones outside normal project chat threads. I open Health from either workspace to inspect backoff-blocked jobs, dominant failure classes, and prompt repetition, change the time window, and refresh diagnostics. (README: UI Stack)
Job detail names the latest loaded outcome and pause reason before logs. Task editing discloses optional AI execution settings and explains blocked Save; evidence can copy its complete payload and disclose raw data. See [next Jobs evidence](../design-system/next-jobs.md).

Job detail prioritizes the next run, actions and execution evidence; schedule and
ownership remain in a keyboard disclosure. Health keeps labeled columns in a
local horizontal viewport on narrow screens. See the [browser acceptance](../design-system/harness-debt.md).

US-JOBS-003: As a user, I see background AI runs that need clarification pause in awaiting-user-input instead of failing and surface their prompts through the shared inbox flow.

US-JOBS-004: As a user, I see scheduled jobs persist separately from user chat and can promote finished AI runs into reusable routines with explicit schedules. Creating, editing and promoting tasks waits for matching server persistence acknowledgement; rejection retains editable fields, and retries preserve job identity without duplicating the routine.

### NOTIFICATIONS

US-NOTIFICATIONS-001: As a user, I use a header-level notification inbox for deferred planner questions, assistant questions, browser approvals, and passive background-run status updates that route to the matching run status view.
Response-needed items precede passive updates. Readable kinds/severity, expanded semantics and named answer fields preserve keyboard use. See [project-flow evidence](../design-system/next-project-flows.md).

US-NOTIFICATIONS-002: As a developer, I see notification inbox state travel as a typed websocket payload with durable local persistence, unread counts, and explicit read or archive commands.

US-NOTIFICATIONS-003: As a user, I see shared popovers (including the inbox) render through a portal-backed primitive so compact overlays do not get clipped by parent overflow or expand parent layout.

### BROWSER

US-BROWSER-001: As a user, I use typed browser session tracking with explicit per-step approval gates when browser-capable tools are active.

US-BROWSER-002: As a user, I see the trace panel surface browser activity, pending approvals, replay snippets, and lightweight verification results when a run touches browser tools.

A globally paused approval explains why approval is unavailable while keeping
rejection available. Streamed tool invocation and output use readable semantic
states and a named detail action.

US-BROWSER-003: As a developer, I see browser approval decisions use a typed websocket command and persist on the active run record.

### ACTIVATION

US-ACTIVATION-001: As a user, I get a bootstrap-first startup path for source users plus portable Bun launcher packaging that serves its executable-adjacent UI without source watchers.

US-ACTIVATION-002: As a user, I see runtime health visibility so install, auth, browser-tool repair, and degraded interactive support show before a run starts.

US-ACTIVATION-003: As a user, I use a shared activation checklist that keeps first-run setup inside the main chat cockpit instead of a blocking wizard, shows first-task blockers before ready or optional diagnostics, and includes repair actions for missing project, provider, runtime, git, and browser requirements.

US-ACTIVATION-004: As a user, I open Help from Workspace actions for guided tutorials with spotlight overlays for opening a project, connecting provider/runtime, sending the first task, and reviewing plans, and I can dismiss the active tutorial with Escape.

US-ACTIVATION-005: As a user, I use a shared project switcher dialog that replaces duplicated add-path inputs across sidebar and first-run onboarding.

US-ACTIVATION-006: As a developer, I see setup health be server-derived per machine while tutorial progress and dismissal state stay local to the current browser profile.

US-ACTIVATION-007: As a user, I can complete onboarding when at least one agent path is usable, whether that is Pi with a provider key or an authenticated CLI runtime.

US-ACTIVATION-008: As a user, I open an `ide://` folder as a project or a file in the IDE through one reusable desktop backend, receive a browser tab for each request, and have a desktop-owned backend stop after its last IDE tab closes; standalone update checks remain explicit opt-ins. (README What It Is, Local Workflow)

### UI

US-UI-001: As a user, I use a SolidJS app shell whose project, work, and Run details panes use the shared measured panel system, preserve the primary work pane, and persist bounded resize and collapse state without changing project data.

Project-row actions collapse into a visible menu when their row is narrow, keeping
project names and paths readable. Composer selectors reappear when their option
sets grow after loading or an agent change.

The command bar retains current context and execution control on narrow screens.
IDE search exposes full file/line destinations and distinct search states;
terminal rename has a visible keyboard action and restores session focus after
Enter/Escape. See the [second surface batch](../design-system/next25-batch2-surfaces.md).

US-UI-002: As a user, I rely on shared Solid primitives for buttons, inputs, descriptive selection controls, dialogs, tooltips, sheets, and toast presentation so that small option sets stay complete and large sets can add accessible search and filters consistently. (README UI Stack)

US-UI-003: As a user, I see disabled actions explain their blocking reason in tooltips, and reusable compact overlays route through shared primitives instead of ad hoc markup.

US-UI-004: As a user, I see lucide-solid icons across project actions and workspace controls so that iconography stays coherent.

US-UI-005: As a user, I see tooltips render through a body-level portal so that panel overflow does not clip them.

US-UI-006: As a user, I use left workspace tabs for Projects, Assistants, Jobs, and Runs so the selected tab controls both left list content and center detail content.

US-UI-007: As a user, I see project chat keep transcript first, expose fast project-title and active-thread transcript search, and show plan, run, memory, and events through a compact local pane strip instead of a larger cockpit card.

US-UI-008: As a user, I see the chat transcript auto-stick only when already at bottom and expose an explicit Scroll to latest affordance when I scroll away.

US-UI-009: As a user, I see the composer keep mode, agent, provider, and model controls together in a wrapping bottom row outside the text input, so long drafts and placeholders cannot overlap controls at narrow widths. Empty states and composer surfaces use the active theme's panel and text colors.

US-UI-010: As a user, I see the transcript, plan, run, and trace surfaces render readable markdown with code fences, tables, blockquotes, and safe external-link behavior. Optional syntax highlighting loads for completed fenced code; plain code and copy remain usable if it fails.

US-UI-011: As a developer, I see shared primitives and major shells expose stable `data-test-*` hooks for UI automation and harness tests.

US-UI-012: As a user, I see thread badges render with consistent status colors (purple/orange/yellow/red/green) per thread state.

US-UI-013: As a user, I see caught UI and command errors surface through toast notifications, with identical active failures coalesced, so failures become visible without covering recovery controls in duplicate noise.

US-UI-014: As a user, I open a Cmd/Ctrl+K keyboard project open flow via TanStack Hotkeys with best-effort Cmd/Ctrl+Space when the browser cooperates.

US-UI-015: As a developer, I keep developer traces out of the user-visible transcript, hide aggregation-only trace stages from user-facing status surfaces, and surface only significant orchestration milestones through the live tail and finalized phase rows.

US-UI-016: As a user, I see all in-flight status and assistant text stay in one final-position live tail message until the run completes, then become finalized transcript rows.

US-UI-017: As a user, I see the run cockpit expose virtual-branch experiment review, promote, and discard actions plus project-note creation, semantic tags, retrieval history, stale counts, and cleanup candidates. (README UI Stack)

US-UI-020: As a user, I inspect shell tool activity from a run pane with command status, human-readable action summaries, visible failure recovery detail, and copyable raw evidence behind an explicit details action while chat keeps only interpreted progress and blocking failures.

US-UI-021: As a user, I see Run details follow the selected project thread, assistant, or background job and show unified execution evidence, including task and trace timing, without exposing implementation booleans that merely repeat available actions, and with current and total running-agent counts.

Jobs ignores a remembered Runs selection and shares its effective filtered selection with trace. A hidden Jobs controller cannot overwrite Runs navigation.

US-UI-022: As a user, I load earlier active-thread messages explicitly while transcript rendering and client state remain bounded, so long durable histories do not make reconnect or Markdown work grow without limit. (README UI Stack)

US-UI-018: As a user, I see shared popovers render through portal-backed primitives so that compact overlays (inbox, quick replies, interaction panels) stay well-positioned.

US-UI-019: As a user, I open Codex usage from the header to see account quota remaining and reset times, local session/lifetime tokens, and observed sources by project/thread/role/model/runtime. Tooltips explain cache and scope; confirmed local reset waits for acknowledgement and never changes provider quota. Missing account data and unknown attribution remain explicit. Growing source histories retain bounded details plus explicit overflow totals, and reconnect remains available.

US-UI-022: As a user, I open an IDE workbench with real project file navigation, read-only file previews, content search, Git status, editor tabs, command palette, resizable panes, terminal file-link handoff, status context, custom menus, themes, shortcut handling, notifications, and loading placeholders, while project switches cannot leak stale files or asynchronous results into the active project.

US-UI-023: As a user, I open a project-scoped terminal drawer with persistent integrated-terminal tabs, splits, scrollback, search, shell choice, and reconnectable live CLI sessions from chats and jobs so coding workflows stay in the harness. Optional terminal and IDE interfaces load on first use, with visible loading/failure recovery; closing the terminal preserves its mounted state. (integrated terminal)

US-UI-024: As a user, I see agent-spawned terminals categorized separately, read them while a run is active, override input deliberately, and open terminal history from a project chat or run so terminal evidence stays tied to the work that created it. (README What It Is)

US-UI-025: As a user, I choose a browser-local Simple or Advanced interface mode so both chats have clear agent identity, presence, readable messages, a quiet stop affordance, and new-thread plus secondary actions in one overflow menu; the composer keeps selectors bottom-left, collapsing to the current model and one ellipsis menu in Simple or narrow layouts; Simple removes the permanent specialist-pane strip and exposes Run contextually while hiding orchestration, tool cards, trace UI, capability badges, and secondary composer controls without changing execution policy, and Advanced preserves the full cockpit. (README UI Stack)

### PERSISTENCE

US-PERSISTENCE-001: As a developer, I use SQLite-backed persistence for projects, active selection, archived threads, and messages so that local state survives repeated restarts.

US-PERSISTENCE-002: As a developer, I see agent run state, planning questions, and subtask progress persist locally with the active thread.

US-PERSISTENCE-003: As a developer, I see plan-summary assistant messages persist with typed plan metadata so that restart preserves the frozen plan shown to the user.

US-PERSISTENCE-004: As a developer, I see agent runs persist frozen execution plans and correctness reviews, not only loose subtask text.

US-PERSISTENCE-005: As a developer, I see completed run metadata persist so that retry stays available after refresh or restart.

US-PERSISTENCE-006: As a developer, I see completed subagent metadata persist across partial runs so that follow-up work can continue from prior branch commits.

US-PERSISTENCE-007: As a developer, I persist in-flight assistant transcript rows for refresh recovery while keeping planner traces, status stream buffers, and toasts as transient runtime state.

US-PERSISTENCE-008: As a user, I see draft text persist per thread in browser localStorage so that typed input survives thread switches and reloads.

US-PERSISTENCE-009: As a user, I see the browser session remember last active project and each project's last active thread, restored on reopen when targets still exist.

US-PERSISTENCE-010: As a developer, I keep SQLite persistence local-first and single-machine.

US-PERSISTENCE-011: As a developer, I keep provider API-key values out of SQLite and browser localStorage, migrate legacy plaintext copies once, and use OS-protected persistence where a native adapter exists. (README credential storage and persistence)

US-PERSISTENCE-012: As a developer, I see browser localStorage mirror execution gate, isolation strategy, countdown, and correctness iteration defaults for the current browser profile.

US-PERSISTENCE-013: As a developer, I see browser localStorage mirror background-job approval defaults, non-blocking assistant question auto-approval, and local notification opt-in.

US-PERSISTENCE-014: As a developer, I see browser localStorage store per-thread draft text keyed by project and thread id.

US-PERSISTENCE-015: As a developer, I see browser localStorage store chat-composer session state including current trace panel open state as a session override separate from the saved default-open preference.

US-PERSISTENCE-016: As a user, I keep workspace and assistant state in a cwd-independent local database so every opened project reads the same harness state. (README What It Is)

### PREFERENCES

US-PREFERENCES-001: As a user, I set global execution preferences for dirty-git chat restriction, dirty change threshold, plan gate mode, countdown delay, subagent isolation strategy, correctness iteration policy, and non-blocking assistant question auto-approval. Explicit Plan mode retains its Build now gate regardless of the global plan gate preference.

All preference sections fit their available width and text scale. Selecting a
section on a narrow screen reveals Work, including a repeated selection.
Categorical choices use shared radio controls with arrow-key selection. Header
context remains readable at enlarged text; Workspace actions contains Help and
Trace while notifications and execution pause/resume remain directly reachable.

US-PREFERENCES-002: As a user, I set a workspace preference for Pi auto-compaction threshold so long runs trim context earlier and continue with current intent intact.

US-PREFERENCES-003: As a user, I see the main project-chat composer restore mode, agent, provider, and model from browser-local session state instead of reusing project-persisted backend selections. Model pickers in project chat, assistant chat and assistant settings share browser-local favorites and filter the available runtime catalog by actual capability metadata.

US-PREFERENCES-004: As a user, I publish compatible provider/reasoning defaults to Editor and PadPilot while keeping explicit app overrides. Design context follows task intent rather than a preference: unspecified app creation receives compact defaults, explicit stacks and references take precedence, and only relevant interface requirements add guidance. Game-menu and interactive-learning requests receive composition, audience/focus, observed completion and correction constraints even without UI vocabulary; prose tutorials and headless/internal tasks remain excluded. API-key drafts require explicit per-provider Save, testing never persists a draft, and unrelated settings do not discard it. Narrow preferences keep the final setting reachable without project trace or terminal overlays.

### DEV

US-DEV-001: As a developer, I run a same-origin web app and per-message-deflate websocket server started through Bun, with centralized origin and per-launch capability admission protecting every privileged loopback route. (README What It Is, Runtime Shape)

US-DEV-002: As a developer, I run `bun run bootstrap` to install missing dependencies, check for a CDP-capable browser, build the UI, start the server, and open the browser by default.

US-DEV-003: As a developer, I run `bun run dev` to start or reuse the managed Bun server without automatic browser windows, coalesce source edits behind a 2.5s to 15s quiet window, and reload attached pages after successful UI builds. Windows backend source edits restart the owned process through scoped watchers; other platforms retain soft reload. (README: Local development)

US-DEV-004: As a developer, I run `bun run dev:cli` to start the websocket server without the UI route through the same managed backend watcher. (README: Local development)

US-DEV-005: As a developer, I see dev and bootstrap retry on a random open port when `HARNESS_PORT` is unset and `8787` is occupied.

US-DEV-006: As a developer, I run `bun run build:ui` which builds the browser bundle through `Bun.build` with the shared Solid/StyleX compiler and extracted atomic CSS.

US-DEV-007: As a developer, I run `bun run doctor` which prints the shared activation and runtime health report, trims oversized `.local` artifacts, and exits non-zero when required first-task checks fail.

US-DEV-008: As a developer, I run `bun run package:launcher` which builds a portable Bun launcher folder for the current OS target, release packaging launches the extracted executable and verifies packaged UI routes, bundled Pi/Codex updates direct me to a new launcher release, and startup failures preserve the original error while attempting a timestamped crash log beside the executable.

US-DEV-009: As a developer, I see development UI builds emit external source maps for browser debugging.

US-DEV-010: As a developer, I run `bun run test` to execute the Bun test suite in parallel with a tuned worker cap and simple local override.

US-DEV-011: As a developer, I run `bun run typecheck` to validate TypeScript contracts.

US-DEV-012: As a developer, I see development startup back up then purge broken local SQLite artifacts, retry delete on transient Windows file locks, then retry boot once if legacy migration drift makes the dev DB unloadable.

US-DEV-013: As a developer, I see dev DB recovery log the triggering startup error first and only auto-purge on concrete corruption or schema-drift signatures instead of generic SQLite failures.

US-DEV-014: As a developer, I see ordered transactional SQLite migrations preserve populated background-run, event, and notification history across failure and reopen while explicitly upgrading assistant provider constraints.

US-DEV-015: As a developer, I see dev DB recovery fall back to a fresh sibling DB path when corrupted local SQLite artifacts stay locked, instead of failing on the busy file.

US-DEV-016: As a developer, I see malformed legacy thread rows pruned during migration or load recovery in development instead of blocking workspace startup.

US-DEV-017: As a developer, I see Solid UI tests live next to core components as sibling `*.test.tsx` files, sharing one Bun plus Happy DOM harness.

US-DEV-018: As a developer, I see the backend authenticate every privileged loopback HTTP and WebSocket handshake before state access, then validate every websocket payload before processing it. (README Runtime Shape)

US-DEV-019: As a developer, I see pi tool use stay behind the backend adapter boundary.

US-DEV-020: As a developer, I see subagent startup timing captured in debug logs plus developer trace events, with started-task timing visible in trace UI, so slow spawn phases are measurable.

US-DEV-021: As a developer, I see development builds re-surface swallowed UI and command errors after toast display so local debugging keeps mapped stacks visible.

US-DEV-022: As a developer, I see StyleX boundary checks, compiler extraction, and focused linting prevent utility-class regressions and browser runtime transforms. (README Direction)

US-DEV-025: As a developer, I see bundled ripgrep added to the agent toolchain path so subagent search does not depend on the user's global shell PATH.

US-DEV-026: As a developer, I see frontend edits leave the backend process intact, and Windows backend watchers ignore BranchFS and generated output while retaining application and shared-package source coverage. Backend source changes restart only after the quiet window and owned-process cleanup; non-Windows soft reload preserves runtime state best-effort. (README: Local development)

US-DEV-023: As a developer, I run `bun run screenshot` to capture CDP PNGs from an already-running UI by default, with optional flags for managed server startup and BranchFS isolation, and outputs written to `.local/screenshots/<runId>/`.

US-DEV-024: As a developer, I see debug and dev startup telemetry stream current boot phase, weighted progress and ETA, slow-phase hints, and a temp startup log path so stalled boots stop looking dead.

### SEARCH

US-SEARCH-001: As a user, I open a spotlight-style project switcher for recent roots, local folder search, and fast project activation from one shared flow.
Search has a stable accessible name and announces the Enter destination; complete paths remain readable. Exact absolute-path intent still wins over nearby asynchronous results.

US-SEARCH-002: As a user, I activate an already-open project from the switcher without creating a fresh thread when the exact path matches.

US-SEARCH-003: As a user, I create and open a folder-only project from an absolute path in the project switcher, and Enter preserves that exact intent when nearby asynchronous discovery results arrive, without requiring a full template or git repository.

### MARKDOWN

US-MARKDOWN-001: As a user, I see formatted markdown rendering across chat, plan, and trace surfaces with safe links, GFM tables and task lists, footnotes, and copyable highlighted code blocks.

US-MARKDOWN-002: As a user, I see code fences in markdown surfaces include a copy affordance and surface copy failures through toast notifications.

---

## Roadmap

### ACTIVATION-ROADMAP

US-ACTIVATION-ROADMAP-001: As a user, I install and update the harness through signed installers and update channels while portable launcher distribution improves.

US-ACTIVATION-ROADMAP-002: As a user, I repair stale auth, broken local config, and launcher drift through deeper doctor and reset flows after the first successful run.

US-ACTIVATION-ROADMAP-003: As a user, I see typed setup and repair coverage for MCP servers, remote targets, and local scripts so unsupported placeholders become real health surfaces.

US-ACTIVATION-ROADMAP-004: As a user, I keep first-task activation centered on project-open plus task-send flow instead of a separate blocking wizard.

US-ACTIVATION-ROADMAP-005: As a user, I keep current approval and autonomy defaults while setup clarity and recovery improve.

### THREADS-ROADMAP

US-THREADS-ROADMAP-001: As a user, I archive and restore threads, with optional auto-archive preferences for stale threads, so the active surface stays focused without losing history. (todo.md Daily Coding Loop)

US-THREADS-ROADMAP-002: As a user, I rely on strong thread sorting and recent-thread trimming so long-lived projects stay navigable.

### PREFERENCES-ROADMAP

US-PREFERENCES-ROADMAP-001: As a user, I save thread-scoped or project-scoped composer presets for mode, agent, provider, and model while browser-global restore stays the default and preset scope stays obvious.

### SEARCH-ROADMAP

US-SEARCH-ROADMAP-001: As a user, I open a global search surface with `Cmd/Ctrl+F` via TanStack Hotkeys, debounced input, and tiered streamed results.

### UI-ROADMAP

US-UI-ROADMAP-001: As a user, I use a terminal-first workflow with embedded terminals, project scripts, command palette actions, and keyboard shortcuts.

US-UI-ROADMAP-002: As a user, I hand off one step into my editor with active thread or run context attached.

US-UI-ROADMAP-003: As a user, I send selected UI elements, screenshots, console errors, and runtime failures back into the active thread through a tight preview-to-fix loop without manual copy-paste.

US-UI-ROADMAP-004: As a user, I keep inspectability high without forcing trace-heavy UI on every normal coding task.

US-UI-ROADMAP-005: As a user, I use shared bulk selection in Projects, Assistants, Jobs, and Runs with delayed click-to-select, Shift range selection, Ctrl/Cmd toggle selection, right-click bulk menus, keyboard access, and kind-specific dialogs so high-volume management stays fast. (todo.md Daily Coding Loop)

### RUNS-ROADMAP

US-RUNS-ROADMAP-001: As a user, I review step-level diffs, incremental change views, and checkpoint restore so I can inspect or roll back agent work before trust is lost.

US-RUNS-ROADMAP-002: As a user, I keep durable proof bundles per run or checkpoint so diffs, tests, review notes, browser evidence, and follow-up prompts stay inspectable after refresh or restart.

US-RUNS-ROADMAP-003: As a user, I see run heartbeats, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries so quiet agents feel inspectable instead of broken.

US-RUNS-ROADMAP-004: As a user, I inspect a thread or run ledger with progress, broken states, next steps, learned rules, context used, and notable token or cost spikes so continuity survives across sessions. (todo.md Daily Coding Loop)

### WORKTREE-ROADMAP

US-WORKTREE-ROADMAP-001: As a user, I use disposable experiment branches with fast compare, promote, and discard so risky ideas do not pollute my main checkout or trusted thread.

### PROVIDERS-ROADMAP

US-PROVIDERS-ROADMAP-001: As a user, I bring more of my own agent backends so I can use existing subscriptions and quotas without switching tools.

US-PROVIDERS-ROADMAP-002: As a user, I see provider auth state, runtime availability, discovered models, and capability differences before execution starts.

US-PROVIDERS-ROADMAP-003: As a user, I see tool and connector health as honestly as model capabilities so missing MCP, browser, git, or runtime dependencies fail before execution instead of mid-run.

US-PROVIDERS-ROADMAP-004: As a user, I use provider failover and credential rotation so long-running work survives quota, auth, and transient provider failures without losing session state.

US-PROVIDERS-ROADMAP-005: As a user, I get clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors.

US-PROVIDERS-ROADMAP-006: As a user, I see honest provider selection and model switching when tools are missing, features degrade, or approval semantics differ.

US-PROVIDERS-ROADMAP-007: As a developer, I keep one typed provider contract path instead of provider-specific UI forks.

US-PROVIDERS-ROADMAP-008: As a user, I see per-thread or per-run usage when providers expose it so I understand cost and token burn.

US-PROVIDERS-ROADMAP-009: As a user, I see account quota, rate-limit, or credit state in a lightweight status area when providers expose it.

US-PROVIDERS-ROADMAP-010: As a user, I set per-run budget caps and soft or hard stop rules with preflight warnings before long-running work burns usage unexpectedly.

US-PROVIDERS-ROADMAP-011: As a user, I see lightweight burn-rate and remaining-headroom hints during execution.

US-PROVIDERS-ROADMAP-012: As a user, I understand model speed, cost, and capability tradeoffs in selection flows without cluttering the main chat surface.

US-PROVIDERS-ROADMAP-013: As a user, I still get a usable experience when providers do not expose usage details.

US-PROVIDERS-ROADMAP-014: As a user, I compare local usage across bundled CLI runtimes and provider-backed runs in one place where session files or providers expose enough data. (todo.md Usage And Quota Visibility)

### JOBS-ROADMAP

US-JOBS-ROADMAP-001: As a user, I optionally bridge to OS-level schedulers so local jobs continue when the desktop harness process is fully closed.

US-JOBS-ROADMAP-002: As a user, I opt into Windows Task Scheduler, macOS LaunchAgent, or Linux systemd user service or cron bridges behind explicit consent.

US-JOBS-ROADMAP-003: As a user, I use away-from-desk approval and review inbox flows so another device can inspect evidence, answer approvals, or resume stopped work without taking over full local control.

US-JOBS-ROADMAP-004: As a user, I complete away-from-desk reviews from summary cards, screenshots, short demos, and diff highlights on a phone-friendly surface instead of raw traces.

US-JOBS-ROADMAP-005: As a user, I define pattern-based output watches so I get notified when long-running jobs hit errors, readiness signals, or other milestones.

US-JOBS-ROADMAP-006: As a user, I see deeper risk summaries around branch, environment, network, and filesystem scope before launch or approval.

US-JOBS-ROADMAP-007: As a user, I keep safeguards around long-running tasks and external side effects.

### RUNTIMES-ROADMAP

US-RUNTIMES-ROADMAP-001: As a user, I target local, WSL, and later headless or SSH-backed environments as first-class backends instead of shell-specific hacks.

US-RUNTIMES-ROADMAP-002: As a user, I pair and reconnect securely so another device can monitor runs, answer approvals, or resume work.

US-RUNTIMES-ROADMAP-003: As a user, I use a low-friction remote observer flow for control, approval, and status checks from another machine without exposing broad remote execution by default.

US-RUNTIMES-ROADMAP-004: As a user, I see target capabilities spelled out in UI copy before path, shell, or toolchain mismatches bite me.

US-RUNTIMES-ROADMAP-005: As a user, I keep local-first source of truth even when the backend runs outside the desktop process.

### BROWSER-ROADMAP

US-BROWSER-ROADMAP-001: As a user, I get an installable browser tool or skill wired into the browser session and approval pipeline by default.

US-BROWSER-ROADMAP-002: As a user, I review richer replay artifacts such as screenshots, DOM snapshots, and step-level verification evidence.

US-BROWSER-ROADMAP-003: As a user, I tune approval policy beyond per-step manual gating with read-only auto-allow and stronger risk buckets.

US-BROWSER-ROADMAP-004: As a user, I use preview handoff controls to point at broken UI state and send structured browser evidence back into planning or implementation.

US-BROWSER-ROADMAP-005: As a user, I run dedicated frontend QA flows so browser verification hands findings back into the coding plan cleanly.

### ATTACHMENTS-ROADMAP

US-ATTACHMENTS-ROADMAP-001: As a user, I get OCR fallback for scan-only PDFs and image-only documents.

US-ATTACHMENTS-ROADMAP-002: As a user, I attach files into `planning.answer` and `planning.refine` flows, not only new top-level sends.

US-ATTACHMENTS-ROADMAP-003: As a user, I get orphan-upload cleanup when I remove unsent attachments or abandon a draft.

US-ATTACHMENTS-ROADMAP-004: As a user, I see attachment lifecycle visibility for expired, deleted, or fetch-failed remote files.

US-ATTACHMENTS-ROADMAP-005: As a user, I see explicit attachment limits and cleanup policy in UI copy and settings docs.

### MARKDOWN-ROADMAP

US-MARKDOWN-ROADMAP-001: As a user, I see less visual churn during long streaming markdown responses so live code and prose updates feel steadier.

### PERSISTENCE-ROADMAP

US-PERSISTENCE-ROADMAP-001: As a user, I back up, export, and import threads, settings, skills, and lightweight memory locally before any multi-device sync work.

US-PERSISTENCE-ROADMAP-002: As a user, I see multi-device sync only evaluated after local workflow and background history feel stable.

US-PERSISTENCE-ROADMAP-003: As a user, I keep local SQLite as source of truth during offline work.

US-PERSISTENCE-ROADMAP-004: As a user, I see reconciliation rules, conflict handling, and visible sync state defined before any remote rollout.

### MODES-ROADMAP

US-MODES-ROADMAP-001: As a user, I expand local modes into reusable skill and playbook distribution.

US-MODES-ROADMAP-002: As a user, I install, import, export, and discover custom workflows across my workspace.

US-MODES-ROADMAP-003: As a user, I rely on skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable.

US-MODES-ROADMAP-004: As a user, I manage updates for installed skills with visible source, version, and review state.

### PLANNING-ROADMAP

US-PLANNING-ROADMAP-001: As a user, I use versioned workspace and repo rules with visible source, last-used signal, and promote-from-chat or review flows instead of opaque auto-memory.

US-PLANNING-ROADMAP-002: As a user, I export, import, and inspect version history for intentional semantic project notes without creating an ambient cross-project cache. (todo.md Memory And Skill Platform)

US-PLANNING-ROADMAP-003: As a user, I review guided bulk-cleanup candidates for never-retrieved and stale notes before archiving or deleting them. (todo.md Memory And Skill Platform)

US-PLANNING-ROADMAP-005: As a user, I get recommendations to compress, pin, or evict stale files and old turns before context bloat becomes cost or quality loss. (todo.md Memory And Skill Platform)

### WORKSPACE-ROADMAP

US-WORKSPACE-ROADMAP-001: As a user, I run issue and pull-request workflows around `pi`.

US-WORKSPACE-ROADMAP-002: As a user, I use diff-aware review summaries, issue execution, and PR follow-up loops.

US-WORKSPACE-ROADMAP-003: As a user, I capture review-specific rules from accepted or dismissed findings so repeated repo feedback improves future review runs without hiding reasoning.

US-WORKSPACE-ROADMAP-004: As a user, I keep repository automation behind explicit opt-in and clear approval points.

US-WORKSPACE-ROADMAP-005: As a user, I apply scoped bulk actions from UI or project chat through one typed preview/apply contract with dry-run, permission and readiness checks, per-item results, and durable failure readback so selection and chat automation cannot drift. (todo.md Bulk Action Market Scan)

### SWARM

US-SWARM-001: From an existing project thread, I choose Run with Swarm, submit the
current engineering goal and immutable source with explicit compute/model budgets,
review the proposed tasks and launch remote workers. I can return to runs, inspect
workers, dependencies, findings, validation and comparison evidence, verify patches
and artifacts, cancel or reject work, and explicitly approve eligible integration.
Provider-unavailable and budget-exhausted states stay visible, and a remote request
never silently falls back to my workstation.
