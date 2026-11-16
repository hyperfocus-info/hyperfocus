# Development servers

Hyperfocus uses one repository-managed development command for each first-party
surface. The command finds a healthy server for the current worktree before starting
one, records ownership in SQLite, captures structured errors, and returns the actual
URL chosen after port negotiation.

```powershell
bun run dev:harness
bun run dev:editor
bun run dev:pad-pilot
bun run dev:status
bun run dev:errors -- editor
bun run dev:stop -- editor
```

`bun run dev:pad-pilot-marketplace` is an alias for the PadPilot browser and service
runtime. App-local `bun run dev` scripts route through the same manager.
The editor's Website workspace shares `dev:editor` at `/website/builder`; its published preview is `/website/`.
Website exports are checked through the isolated `site-preview` surface;
`SITE_BUILDER_ARTIFACT_DIR` points to the extracted app and `SITE_DATA_DIR` to its
owned persistent fixture. See [the website guide](../apps/engine-editor/website/README.md).
Root `bun run dev` defaults to Harness and dispatches explicit operations such as
`bun run dev status --json` or `bun run dev editor`. Extra positional arguments,
unknown flags and malformed ports fail before registry or process changes; a status
request cannot be silently interpreted as a launch. Status also accepts a surface
or exact server ID to filter its results.

## Lifecycle and isolation

Shared servers in the main worktree are detached, durable, and reused by later user
or agent work. The registry lives at `.local/dev-servers.sqlite` in the main Git
worktree, including when a command originates in a linked worktree. A health check,
not merely a PID, establishes reuse eligibility.

Linked worktrees automatically use isolated mode. An isolated server gets a separate
port, remains attached, and must be closed when its invoking experiment ends. Stale
rows are reconciled by closing the exact recorded child process tree; broad Bun or
browser kill commands are not part of this workflow.
PadPilot isolated runtimes also own separate build output, locks, SQLite state and
uploads below `.local/dev-server/runtimes/<server-id>`. A child that exits during
startup is reported immediately rather than consuming the health-check timeout.
Editor isolated runtimes receive a separate output root there for UI and WASM
builds, avoiding concurrent copies over another running editor's assets.
Backend watches ignore access-only filesystem notifications and log the actual
source paths that trigger replacement; reading code does not restart a server.

## Process and browser lifecycle

Background commands are invisible desktop work. An empty Bun or cmd window is a
product defect even when the server underneath works. Piped output, `unref`, and a
hidden parent do not prove that its descendants are hidden. The installed Bun
process API does not enforce `windowsHide`; passing that unsupported property led
to visible `bun --hot` children beneath hidden supervisors.

Use `@hyperfocus/desktop-runtime/process` for commands, tests, build workers, CLI
adapters, and cleanup helpers. Its named-options API uses the supported
`node:child_process` Windows hiding option. The host captures output in its normal
terminal or log; a new desktop terminal is never a progress surface. An in-app PTY
remains an explicit interactive surface. A browser or native app intentionally
opened by the user is a separate action; its console launcher is still hidden.

Use `@hyperfocus/desktop-runtime/automation` for owned headless Chrome. Each browser
is muted and gets a private disposable profile and loopback CDP endpoint. Muting
prevents automated game/media tests from playing through the user's speakers;
Web Audio processing remains available for signal assertions. Ownership is established
before waiting for startup; success, startup failure, timeout, scenario exceptions,
and owner death must all close the browser tree and release its profile. A guardian
handles Windows forced owner termination, which does not run JavaScript `finally`
or signal handlers. Its hidden detached process survives the owner's Windows job
teardown just long enough to clean up; its stdin lease bounds that lifetime. Chrome
must not de-elevate/relaunch outside the owned tree. Never attach to or terminate
the user's everyday Chrome profile.

Process inspection records creation times as well as PIDs. Children must have been
created after their recorded parent; a recycled PID cannot claim an older unrelated
process. For final cleanup verification, pass the captured process records as
`expectedProcesses` to `inspectWindowsProcessTrees` so reused root PIDs are excluded
and surviving original children can still be identified.
The PowerShell inspector emits UTF-8 explicitly: legacy console encoding can turn
Unicode quotation marks in window titles into unescaped JSON quotes. The Windows
inspection regression exercises that case through a hidden child process.

Ordinary children retain cleanup ownership until they exit; `unref` only releases
the event-loop reference. Only an explicitly recorded reusable service may set
`keepAliveAfterParentExit` (the IPC-leased browser guardian is the bounded cleanup
exception). Isolated tests and browsers never acquire durable status
merely because a dev server can be shared. Stop the exact owned process tree and
await exit; cancel queued builds before shutting down so cleanup cannot respawn work.
Always clear deadline timers on success as well as failure; a forgotten timeout can
leave a successful Bun command silently alive. Drain captured output until exit,
not merely until a readiness line. OS process exit and pipe closure are distinct:
cleanup must not wait forever on an output stream its consumer has abandoned.

`bun run check:process-policy` scans owned code, tests, scripts, and skill runners
for raw Bun spawning and Node calls missing explicit hiding. Regression tests under
`scripts/process-policy` enumerate actual visible Win32 windows and all descendants
of recorded process roots. Verification must include managed servers: filtering
only names such as `user-audit` misses hot-server grandchildren. Preserve the
before/after PID, parent, HWND, and cleanup evidence; report unavailable window
inspection as unverified instead of claiming zero windows from launch flags alone.
Both Windows release lanes run the process policy and repository/window regressions
before packaging; a test prevents those release gates from silently disappearing.

The pinned Codex, Pi, and Playwright dependency patches are part of this contract: those libraries
also launch command processes. The dependency policy test checks their installed
JavaScript, so upgrades must preserve hidden execution or fail the gate.
Remove a patch only after the installed upstream version passes the same gate and
the Windows behavior regression. Never treat a dependency boundary as an exemption.
The root Node type override keeps process/stream declarations on one version;
mixed Node 24/25 types broke `ChildProcess` inheritance when sharing these adapters.

## Hot reload

Windows backend entrypoints use `@hyperfocus/desktop-runtime/dev-process` with
explicit application and shared-package source roots. Bun 1.4's native `--hot`
watcher repeatedly panicked during large BranchFS materialization in this worktree;
the scoped watcher excludes that generated state. Other platforms retain Bun soft
reload. Windows backend changes stop and await the owned process tree before
starting its replacement. This restarts in-memory backend work; finish active runs
before editing backend source, and use persisted recovery after an interruption.
UI-only edits rebuild without restarting the backend. Managed Harness development
prints its URL without opening a browser, including after backend restarts.
A failed backend keeps its scoped watcher alive so correcting the source can
restart it; failures remain recorded instead of triggering an automatic crash loop.

Frontend build watchers share the framework-neutral
`@hyperfocus/desktop-runtime/dev-server` batcher and reload only
after a successful build. The first save waits 2.5 seconds; continued saves reset the
quiet window and back off through 5, 10, and at most 15 seconds. A completed reload
resets the next delay to 2.5 seconds.

## Failure record

Supervisor output is retained in full in `.local/dev-servers/*.log`. Error records
keep adjacent stack frames and source excerpts together, with build, network,
persistence, process, runtime, and unknown categories. `dev:errors` shows the latest
20 matching records with bounded summaries; `--limit <count>` expands the list,
`--full` includes retained context, and `--json` returns all matching records unless
an explicit limit is supplied. The raw log keeps context beyond the 8 KB record
budget. Investigated and fixed timestamps are explicit; recurrence reopens a fixed
fingerprint. Existing historical records retain their original shape; context-only
rows are omitted from summaries and remain available through `--full` and `--json`.

## Research basis

The design follows several proven developer-experience patterns:

- Bun distinguishes process-preserving server hot reload from hard watch restarts,
  which avoids dropping server state and connections during ordinary backend edits
  ([Bun watch mode](https://bun.sh/docs/runtime/watch-mode)).
- Mature monorepo runners model development servers as persistent or continuous
  tasks instead of ordinary one-shot commands
  ([Turborepo configuration](https://turborepo.dev/docs/reference/configuration),
  [Nx continuous tasks](https://nx.dev/docs/getting-started/tutorials/configuring-tasks)).
- Dependency-aware watchers should ignore irrelevant changes and expose which files
  triggered a rebuild ([Tilt file-change guidance](https://docs.tilt.dev/file_changes.html)).
- SQLite WAL permits concurrent readers and a writer on one machine, while
  `busy_timeout` provides bounded lock waiting for short-lived CLI and supervisor
  connections ([SQLite WAL](https://www.sqlite.org/wal.html),
  [SQLite pragmas](https://www.sqlite.org/pragma.html#pragma_busy_timeout)).

Related: [repository guidance](../AGENTS.md), [desktop runtime](../packages/desktop-runtime/README.md),
and the [`dev-server` skill](../.agents/skills/dev-server/SKILL.md).
