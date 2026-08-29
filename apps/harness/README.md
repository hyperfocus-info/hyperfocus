# Hyperfocus Harness

Local-first coding harness built around a Bun full-stack server, a SolidJS UI, local SQLite persistence, and a pi SDK integration that can run through GPT or Gemini.

This README owns shipped harness behavior, runtime shape, local workflow, and
testing commands. [docs/harness](../../docs/harness/README.md) owns roadmap,
user-story, coverage, audit, and research evidence.

## What It Is

- A same-origin web app and compressed websocket server started through Bun, with a per-launch capability required by centralized admission for every privileged loopback HTTP and WebSocket route
- A multi-project workspace where each project root keeps its own local chat history and multiple switchable threads
- Empty workspace startup with no synthetic default project
- Multiple agent runtimes: `pi`, `GitHub Copilot CLI`, and `Codex CLI`
- Spotlight-style project switcher for recent roots, local folder search, and fast project activation from one shared flow
- Bootstrap-first startup path for source users, plus portable Bun launcher packaging for release users
- Browser-backed desktop IDE launches through `ide://` file or folder links, reuses one loopback backend, opens each request in a browser tab, and stops a desktop-owned backend after the last IDE tab closes
- IDE trees, tabs, file buffers, and asynchronous results remain owned by the active project; switching projects clears project-local editor state and stale responses cannot replace current content or save state
- Runtime health visibility so install, auth, browser-tool repair, and degraded interactive support show before a run starts
- Workspace data defaults to `~/.ai-harness-template/harness.db`, with `HARNESS_DB_PATH` still available for explicit overrides
- Shared activation checklist that keeps first-run setup inside the main chat cockpit instead of a blocking wizard
- Guided help tutorials with spotlight overlays for opening a project, connecting provider/runtime, sending the first task, and reviewing plans
- `UploadThing`-backed attachments for screenshots, PDFs, and text or office-doc specs, persisted with chat history and routed into prompts
- Capability-aware model metadata so UI can explain tool, vision, browser, context, speed, and cost expectations before execution starts
- Runtime-aware model selection so Codex CLI sticks to Codex-compatible GPT choices for planning and execution, and stale unsupported picks fall back before a run starts
- Codex CLI noninteractive runs use bundled official Codex SDK and CLI, enable Codex live web search plus writable shell network access, keep review mode prompt-driven inside the harness instead of special native review routing, and on Windows writable runs auto-use full access because bundled Codex currently downgrades `workspace-write` to read-only there while read-only tasks stay sandboxed
- Typed browser session tracking with explicit per-step approval gates when browser-capable tools are active
- Workspace-global pause and resume for execution starts, with deferred planner questions, assistant questions, and browser approvals released on resume
- Local scheduled tasks and background jobs with durable ANSI-free SQLite history, startup catch-up, approval policy defaults, non-blocking assistant question auto-approval, hidden automation threads, concurrent launch, timeout/progress visibility, overload warnings, and a dedicated inbox surface
- Header-level notification inbox for deferred planner questions, assistant questions, browser approvals, and passive background-run status updates
- Local assistant operators with named personas, role prompts, project or global scope, synced routing defaults, pause and resume controls, chat, todo lists, deduped and compacted learnings, open questions, clone-to-project flow, and high-level plus deep-debug logs
- Launcher-bundled skills synchronize into `~/.ai-harness-template/skills` for use
  across opened projects; source-checkout and project `.agents/skills` stay local to
  their repository
- Product direction currently favors safe background execution, connector health visibility, human-readable rule alignment and intentional pull-based notes, preview-to-fix loops, durable review artifacts, budget-aware long runs, remote review from another device, and cleaner thread retrieval and cleanup over broader assistant surfaces
- Built-in workflow modes for asking, planning, implementing, debugging, and review, plus local custom modes at workspace or project scope
- Brand-aware defaults for GPT or Gemini execution
- Gemini planning defaults to `google/gemini-3-flash-preview`
- Spawned subagents drop to the cheapest runtime-compatible sibling in the same model family, such as `google/gemini-2.5-flash` -> `google/gemini-2.5-flash-lite`, Codex `openai/gpt-5.6-sol` -> `openai/gpt-5.6-luna`, and Codex `openai/gpt-5.4` -> `openai/gpt-5.4-mini`, while inheriting fast mode when the runtime supports it
- Run-only virtual experiment branches through BranchFS-style isolated mounts so risky execution can stay off physical disk until promote
- Intentional project notes with required semantic tags, bounded `memory_search` retrieval for tool-capable Pi planner, main executor, and subagent sessions, retrieval hit logging, and no automatic note injection into prompts
- Same-worktree subagents fan out in parallel when contract-owned paths do not overlap, while ambiguous or overlapping same-worktree tasks stay serialized and broader isolated work can use BranchFS mounts
- Isolated subagent results replay inside a separate BranchFS integration mount, verify there, and flush only after success
- SQLite-backed persistence for projects, active selection, archived threads, and messages across restart
- Interactive planning questions that pause execution until the user answers in chat, with three typed quick options and one recommended path
- Global execution pause does not cancel in-flight work; it only blocks new launches and queues new follow-up asks until resume
- Plan-first execution that persists a full execution plan, posts a durable plan summary into chat, and lets that card execute the stored run by id while it is `ready`
- Obvious low-complexity workspace actions such as direct file or folder requests, plus correction-style follow-ups that refine where the edit should land, can auto-switch into `implement` mode and skip planner turn-taking; simple leading-slash task paths like `/breakout` are normalized to workspace-relative targets when the request is clearly local
- Optional live CLI sessions for Copilot CLI and Codex CLI over Bun-managed piped transport, with thread-owned attach tokens, reconnect, and captured terminal context that can feed the next prompt
- Integrated terminals keep user-created sessions separate from agent-spawned terminals, preserve thread/run terminal history, and keep agent-spawned terminals read-only during active work unless the user overrides input
- Built-in modes now differ on confirmation defaults and execution access: `plan` stays approval-first and read-only by default, `ask` suppresses transcript plan cards for direct Q&A without forcing read-only, and `implement` auto-runs unless the frozen plan fans out to multiple subagents
- Composer input can auto-switch built-in modes when message intent is clear enough, using recent thread context to repair correction follow-ups so direct questions, review requests, debugging prompts, planning asks, and local workspace edits do not depend only on stale sticky mode state; an explicit user mode selection stays pinned for that send
- Formatted markdown rendering across chat, plan, and trace surfaces with safe links, GFM tables and task lists, footnotes, and copyable highlighted code blocks
- Human-readable project `AGENTS.md` guidance plus explicit typed workspace and project rule overrides; recurring constraints belong in docs, types, tests, or CI instead of background memory
- Transcript-level plan summary cards with shared plan modal access from chat and trace panel, plus durable Build now, In progress, Retry, Resume, and Completed action states from SQLite run status by run id
- Global execution preferences for dirty-git chat restriction, dirty change threshold, plan gate mode, countdown delay, subagent isolation strategy, correctness iteration policy, and non-blocking assistant question auto-approval
- Workspace preference for Pi auto-compaction threshold so long runs trim context earlier and continue with current intent intact
- Resumable partial subagent runs that keep completed work after failure or stop
- Persistent retry for full runs and individual subagents, including successful runs
- Manual refresh for active runs and active subagents, with deferred refresh while work is still streaming
- Dirty-git preflight with a configurable chat-run restriction toggle, tracked plus untracked change threshold, and fail-closed handling when git cannot inspect workspace state
- Live context usage meter sourced from runtime stats, with app-session and durable lifetime totals

## Workspace Model

- Each project maps to a validated local folder path
- A project can be the repository root or a nested folder inside a larger git repository
- Workspaces can start empty and return to empty after removing the final project
- Each project keeps multiple named threads and one selected active thread
- `New thread` creates blank thread in same project and switches to it immediately
- Reopening an already-known project root creates and activates a fresh thread instead of rejecting the action
- Project switcher activates already-open projects directly instead of creating a fresh thread when the user is switching context
- `Pi fork` clones only source transcript into new thread and leaves run state, traces, errors, and drafts behind
- Thread titles auto-generate from first user message until user renames them
- Active chat header uses thread title, supports inline rename, and exposes copyable thread id
- Browser session remembers last active project and each project's last active thread, then restores that context on reopen when targets still exist
- Thread archive and restore controls keep stale threads out of the active surface without losing history, with optional auto-archive preferences for the cases the user wants handled automatically
- Thread badges summarize status: purple `User Input`, orange `Planning`, yellow `Executing`, red `Error`, green `Done`
- High-signal run milestones stream through one live tail message while work is in flight, then persist as compact phase rows before the final assistant answer; raw tool activity stays in the Run pane
- Shell tool activity persists with each run so the Run pane can show command status, concise output previews, and sanitized copyable failure detail while chat stays compact
- Project and thread switching stay available while another thread keeps streaming in background; only destructive removal stays blocked during active execution
- On Windows, OpenAI, Google, and Anthropic API keys persist in a CurrentUser DPAPI-protected local credential file; provider brand remains a normal workspace preference
- On platforms without a native credential-store adapter, newly entered keys remain process-memory-only and must be re-entered after restart or supplied through the provider's environment-variable flow; plaintext disk fallback is intentionally forbidden
- Agent run state, planning questions, and subtask progress persist locally with the active thread
- Plan-summary assistant messages persist with typed plan metadata so restart preserves the frozen plan shown to the user
- Agent runs persist frozen execution plans and correctness reviews, not only loose subtask text
- Completed run metadata persists so retry stays available after refresh or restart
- Completed subagent metadata can persist across partial runs so follow-up work can continue from prior branch commits
- In-flight assistant transcript rows persist incrementally so refresh or reconnect can recover partial answers, while planner traces, status stream buffers, and toasts remain transient runtime state
- Draft text persists per thread in browser localStorage so typed input survives thread switches and reloads
- Preflight warnings, context meter snapshots, and chat status cards remain transient runtime state
- Starting a new top-level task or plan refinement clears prior transient traces, plan cards, countdown state, and context snapshots for that thread so follow-up runs do not inherit stale execution noise
- In development, malformed legacy thread rows are pruned during migration/load recovery instead of blocking workspace startup
- Folder browse uses a typed backend bridge; websocket payloads never carry raw shell commands
- Project open flows resolve through one typed result path whether root is new or already known

## UI Stack

- SolidJS app shell
- Task-first empty-state onboarding with import path before provider setup and a sample-task starting point
- Activation center stays in chat and exposes repair actions for missing project, provider, runtime, git, and browser requirements
- Shared project switcher dialog replaces duplicated add-path inputs across sidebar and first-run onboarding
- Header inbox popover keeps recent background prompts and status notices reachable without leaving current surface
- Bun runtime serves explicit built UI assets; the Solid transform runs through one shared build path
- Build-time StyleX styling extracted through the shared Solid/StyleX Bun compiler, with no Tailwind or browser StyleX runtime
- Shared Solid primitives for buttons, inputs, dialogs, tooltips, sheets, and toast presentation
- Shared popovers render through a portal-backed primitive so compact overlays like the inbox do not get clipped by parent overflow or expand parent layout
- Disabled actions explain their blocking reason in tooltips, and reusable compact overlays route through shared primitives instead of ad hoc markup
- `lucide-solid` icons across project actions and workspace controls
- Tooltips render through a body-level portal so panel overflow does not clip them
- Keyboard project open flow uses TanStack Hotkeys for `Cmd/Ctrl+K` as the reliable shortcut, plus best-effort `Cmd/Ctrl+Space` when the browser receives it
- Left workspace tabs keep `Projects`, `Assistants`, `Jobs`, and `Runs` as the primary navigation, with scheduled work separated from run history
- Project chat keeps transcript first and exposes plan, run, intentional project notes, and events through a compact local pane strip instead of a larger cockpit card
- A browser-local Simple or Advanced interface preference preserves the full technical cockpit in Advanced mode. Both modes use a compact teammate header with selected-agent identity, presence, concise thread context, a quiet stop affordance while working, and new-thread plus secondary actions in one overflow menu; transcript messages use stable speaker identity and calmer, readable surfaces.
- Simple mode removes the permanent pane strip, exposes Chat or Run contextually when a run exists, removes orchestration and tool-call rows from chat, hides trace and capability chrome, and keeps mode, provider, model, and effort controls behind one task-settings action. Advanced retains Plan, Run, Memory, model events, and detailed execution evidence with the same conversation-first hierarchy.
- Chat transcript auto-sticks only when already at bottom and exposes an explicit `Scroll to latest` affordance when the user scrolls away
- Earlier transcript pages load only when requested. The Harness retains at most 1,024 active-thread messages in UI state while the shared Markdown surface owns at most 512 presentation rows, so durable history does not become an eager reconnect or render cost.
- Run cockpit now includes virtual-branch experiment review, promote, discard, run terminal history, and a project-note pane with manual creation, semantic tags, retrieval counts, stale counts, and cleanup candidates
- Jobs and Runs surfaces keep scheduled work, approval-needed runs, failures, and concise execution milestones out of normal project chat threads
- Assistants surface keeps assistant chat, todos, questions, learnings, logs, and on-demand bounded pages of assistant-owned jobs and runs inspectable outside normal project chat
- Header-level help opens guided walkthroughs instead of pushing setup into a separate onboarding funnel
- Composer keeps mode, agent, provider, model, and effort controls in one bottom-left row when space allows; narrow and Simple layouts collapse to the current model plus one ellipsis menu without leaving an orphaned settings control
- Composer also exposes one effort and fast-mode dropdown, persists those selections in browser-local session state, and keeps unsupported choices explained instead of silently hiding them
- Main project-chat composer restores mode, agent, provider, and model from browser-local session state instead of reusing project-persisted backend selections
- Composer supports attachment chips, UploadThing-backed upload flow, vision-aware image gating by selected model, and document ingestion for PDF, DOCX, XLSX, PPTX, and ODT on new top-level tasks
- Transcript, plan, run, and trace surfaces render readable markdown with code fences, tables, blockquotes, and safe external-link behavior
- Chat and trace panel share one execution plan modal that exposes summary, prerequisites, bucket strategy, isolation mode, contracts, verification scope, and correctness history
- Trace panel surfaces browser activity, pending approvals, replay snippets, lightweight verification results, and task plus trace timestamps when a run touches browser tools
- Shared primitives and major shells expose stable `data-test-*` hooks for UI automation and harness tests

## Local Workflow

- `bun run bootstrap` installs missing dependencies, checks for a CDP-capable Chrome or Edge browser, builds the UI, starts the server, and opens the browser by default
- `bun run dev` starts the Bun server with hot reload, opens the browser only on first ready boot, waits for a 30s quiet window before applying dev UI or backend reloads, auto-reloads the browser after successful debounced UI rebuilds, and keeps backend state best-effort across same-process hot reloads
- `bun run dev:cli` starts the websocket server without the UI route through the same Bun hot-reload path
- When `HARNESS_PORT` is unset, dev and bootstrap retry on a random open port if `8787` is already occupied
- Development startup now prints a temp startup log path immediately, then streams current boot phase, weighted progress, ETA updates, and slow-phase hints to stdout
- `bun run build:ui` builds the browser bundle through `Bun.build(...)` with the shared Solid/StyleX compiler and extracted atomic CSS
- `bun run doctor` performs a read-only setup inspection, prints the shared activation and runtime health report, supports machine-readable JSON output, and exits non-zero when required first-task checks fail
- `bun run repair` performs the same inspection after repairing dependencies, removing `dist`, and trimming the oldest files from `.local` when it exceeds 1 GiB; the equivalent CLI form is `--doctor --repair`
- `bun run package:launcher` builds a portable Bun launcher folder for the current OS target
- `pi-harness --register-ide-protocol` registers the Windows release for the current user's `ide://` links; `--desktop` opens the IDE directly, and `--check-app-update` explicitly opts a desktop launch into a release check
- Portable launcher startup failures now write a timestamped crash log under `logs/` next to the executable and print that path before exit
- Development UI builds emit external source maps for browser debugging
- `bun run test` runs core tests in parallel, capped at 12 workers by default and overridable with `HARNESS_TEST_WORKERS`; UI-sensitive tests run serially for browser preload stability
- `bun run typecheck` validates TypeScript contracts
- `bun run bench:websocket-batch` compares individual and batched control websocket frame throughput
- `bun run bench:subagent-scheduler` records queue scans, shifted slots, retained queue capacity, and active-worker bounds for 100 to 10,000 queued subagents; elapsed time is environment-labeled diagnostic evidence

Subagent execution defaults to four active workers. Set `HARNESS_SUBAGENT_CONCURRENCY`
to an integer from 1 through 256 for an explicitly provisioned host; queued work
uses an indexed FIFO so an unconstrained queue is amortized linear even when
hundreds or thousands of tasks wait. Increasing concurrency raises provider,
process, memory, and thermal pressure, so the benchmark reports capacity bounds
instead of treating the fastest local setting as a default.
Subagents, providers, BranchFS mounts, browser sessions, and document extraction
also share one multi-resource capacity governor. Defaults are configurable through
`HARNESS_CAPACITY_*` environment variables; acquisitions are atomic, queues are
bounded and cancellable, and 100-agent plus 1,000-task tests gate peak counts
instead of assuming one laptop's clock rate.
Foreground, background, assistant, and subagent prompts share global and
provider-account permits. Configure `HARNESS_CAPACITY_PROVIDERS`,
`HARNESS_CAPACITY_OPENAI`, `HARNESS_CAPACITY_GOOGLE`,
`HARNESS_CAPACITY_ANTHROPIC`, `HARNESS_CAPACITY_GITHUB`, and
`HARNESS_CAPACITY_OTHER_PROVIDERS`; browser tools use
`HARNESS_CAPACITY_BROWSERS`. Optional `HARNESS_PROVIDER_<PROVIDER>_RPM` and
`HARNESS_PROVIDER_<PROVIDER>_TPM` limits add rolling account budgets. Typed rate
or network congestion applies one shared cooldown and temporarily reduces only
the affected provider capacity before restoring it.
- Development startup backs up then purges broken local SQLite artifacts, retries delete on transient Windows file locks, then retries boot once if legacy migration drift makes the dev DB unloadable
- Development DB recovery now logs the triggering startup error first and only auto-purges on concrete corruption or schema-drift signatures instead of generic SQLite failures
- SQLite schema upgrades use ordered transactional migrations that rebuild dependent notification and event tables with their parent runs, preserve populated history across rollback/reopen, and explicitly advance assistant provider constraints
- If corrupted local SQLite artifacts stay locked during dev recovery, startup falls back to a fresh sibling DB path instead of failing on the busy file
- `bun run screenshot` captures CDP screenshots from an already-running UI at `http://localhost:8787` by default and writes PNGs to `.local/screenshots/<runId>/`; `--start-server` and `--start-server --branchfs` opt into managed server startup or isolation

## Testing

- Solid UI tests live next to core components as sibling `*.test.tsx` files
- Default local test runs fan out across isolated Bun workers with zero spawn delay so large CLI and UI suites finish faster without extra setup
- UI specs share one Bun plus Happy DOM harness so modal, sheet, chat, sidebar, and trace interactions run in one lightweight browser-like path
- Core UI branching is unit tested directly at the component level, including ready-plan followups, planner questions, retry and resume actions, modal dismissal, and status icon branches
- Store reducer tests lock transient reset rules so follow-up runs clear traces, plan state, stream buffers, and modal selection without losing persisted chat history
- Backend websocket tests remain the authoritative integration layer for planner-ready, planner-question, follow-up, retry, and context-update flows
- Planner-ready and planner-question transcript messages explicitly stop reporting `isStreaming` before the UI accepts refinement or answer input

## Runtime Shape

- The backend authenticates every privileged loopback HTTP and WebSocket handshake before reading or mutating state, then validates every websocket payload before processing it
- SQLite persistence stays local-first and single-machine
- SQLite persistence uses a cwd-independent default path so assistants and projects read the same local workspace state
- Setup health is server-derived per machine, while tutorial progress and dismissal state stay local to the current browser profile
- Assistant state persists locally in SQLite, including canonical thread memory summaries, active todo list, deduped learnings with AI-assisted compaction, pending questions, structured logs, and assistant-linked background jobs
- Browser localStorage mirrors global workspace defaults but never API-key values; old browser key entries are loaded into the current draft once and immediately scrubbed
- Startup migrates legacy plaintext SQLite provider-key rows into the credential store and deletes the old rows
- Browser localStorage also mirrors execution gate, isolation strategy, countdown, and correctness iteration defaults for the current browser profile
- Browser localStorage also mirrors background-job approval defaults, non-blocking assistant question auto-approval, and local notification opt-in for the current browser profile
- Browser localStorage also stores per-thread draft text keyed by project and thread id
- Browser localStorage also stores chat-composer session state, including current trace panel open state as a session override separate from the saved default-open preference
- Provider brand switching is gated by matching saved key presence
- Composer effort maps across runtimes where supported: Pi honors reasoning for GPT and Gemini plus fast mode for OpenAI-backed GPT models, Codex CLI honors reasoning and fast mode with direct SDK controls plus slash-command fallback, and unsupported runtimes keep controls visible but disabled
- Thread continuity stays harness-owned even for CLI runtimes, so fresh CLI invocations rebuild context from persisted transcript and plan state
- Repeated clarification turns now scope planner-question ids per run so later runs in the same thread do not collide with older pending or answered questions
- The UI sends typed project and chat commands only
- Mode selection and rule sources travel through typed contracts, while semantic project notes use typed create, update, retrieval, audit, and deletion paths without becoming ambient prompt content
- Built-in modes are policy presets, not separate pipelines: `ask` and `plan` bias toward read-heavy planning, execution access is configured separately from that intent, `implement` biases toward active delivery, `debug` biases toward root-cause and narrow fixes, and `review` biases toward findings-first analysis
- Chat message persistence now includes uploaded attachment metadata, while planner and execution stages resolve remote image, text, and supported document context on demand
- Server-side document parsing uses runtime-safe PDF handling so Bun development startup does not depend on browser-only globals
- Plan execution starts through a typed `run.execute` command after plan presentation, not as an implicit side effect of `chat.send`
- Ready plans can be replaced through a typed `planning.refine` command that starts a fresh planning cycle in the same thread
- Project open responses report whether a new project was created or an existing project was reopened with a new thread
- Planner and execution prompts include the launcher's runtime `agents.md`, discover
  project `AGENTS.md` files through the runtime resource loader, and apply configured
  workspace and project rule sources without copying those files into newly created
  project folders
- Routine completed runs do not create notes. Explicit `Remember:` or `Memory:`
  directives always create a tagged pinned note; optional run recording captures only
  corrections, correctness failures, and failed-run recovery context.
- Thread lifecycle, planning answers, resume requests, retry requests, and preflight warnings use typed websocket contracts
- Workspace-global execution pause and resume use typed websocket commands and a shared execution-control event so every connected client stays in sync
- Browser approval decisions use a typed websocket command and persist on the active run record
- Notification inbox state is a typed websocket payload with durable local persistence, unread counts, and explicit read or archive commands
- Refresh requests use a typed `run.refresh` command for active run-level and subagent-level recovery
- Live CLI sessions also stay behind typed lifecycle commands, while terminal bytes flow through a separate short-lived attach channel
- pi tool use stays behind the backend adapter boundary
- Same-worktree subagent mode is the default when contracts can be cleanly path-split, runs in parallel until owned paths overlap, and serializes ambiguous same-worktree work instead of pretending it is parallel
- Same-worktree scaffold and import-root work runs before dependent sibling subagents so parallel tasks do not read files before they exist
- Subagent work is contract-driven with prerequisites, owned paths, scoped verification, and merge notes instead of freeform subtask text
- Subagents avoid visible browser/dev-server verification; browser smoke checks belong to headless main or integration verification
- Shared setup work is modeled as prerequisites that finish before any subagent fan-out starts
- Subagent edits replay inside a separate BranchFS integration mount when isolated mode is selected; same-worktree mode reports contract drift back to main correctness review without discarding useful worker edits
- When a project points at a nested folder, repo-level BranchFS mounts still back execution while edit sync stays scoped to the selected folder
- Repositories with no commits yet can still fan out through ephemeral snapshot state instead of failing on missing git history
- Debug mode can preserve failed isolated mounts locally for inspection while successful mounts are cleaned up automatically
- Developer traces stay out of the user-visible transcript, and aggregation-only trace stages stay hidden from user-facing status surfaces
- Significant orchestration milestones surface in chat through one live tail message during active work, then persist as phase rows; harness connect chatter, aggregation tool calls, and raw shell activity stay hidden from the transcript
- Background AI runs that need clarification pause in `awaiting-user-input` instead of failing and surface their prompts through the shared inbox flow
- Scheduled jobs persist separately from user chat and can promote finished AI runs into reusable routines with explicit schedules
- Assistant-owned jobs share the same scheduler path, while assistant circuit breakers can auto-pause failing assistants and surface blocking questions for user intervention
- Post-merge correctness review checks the delivered workspace against the frozen plan, catches obvious runnable or quality gaps, and can queue a corrective plan-first follow-up iteration
- Subagent startup timing is captured in debug logs plus developer trace events, with started-task timing visible in trace UI, so slow spawn phases are measurable
- Bundled ripgrep is added to the agent toolchain path, and subagents receive repo-root, nested-project, skill-path, Windows search, and browser-native asset guidance so they do not depend on guessed paths or global shell tools
- Caught UI and command errors surface through toast notifications
- Development builds re-surface swallowed UI and command errors after toast display so local debugging keeps mapped stacks visible
- StyleX boundaries, compiler extraction, and focused linting prevent utility-class regressions and browser runtime transforms

## Direction

- Product direction: maximize PMF by reducing setup friction, making capability limits explicit, preserving recoverability, keeping active context inspectable, and making unattended work easier to trust
- Dense UI preference: keep default layouts tight, and require secondary controls or summaries to earn their visual footprint
- [Roadmap TODOs](../../docs/harness/todo.md)
