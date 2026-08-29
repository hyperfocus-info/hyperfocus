# Discovered Patterns

Living catalog for repeated correctness and product-quality gaps found while using `correctness-scan`.

Update this file when a scan finds a reusable failure pattern, missing probe, or recurring category that future scans should check by default.

## Routing

Search headings before loading historical entries:

- lifecycle and persistence: `state`, `lifecycle`, `bootstrap`, `readiness`, `intent`
- boundaries and security: `path`, `ownership`, `schema`, `metadata`, `credential`
- UI and interaction: `affordance`, `overlay`, `hotkey`, `motion`, `layout`, `draft`
- streams and performance: `stream`, `hydration`, `snapshot`, `DOM`, `accumulation`
- tooling and release: `CLI`, `launcher`, `cleanup`, `scaffolding`, `diagnostic`

Read all entries only when the scan itself is repository-wide.

## 2026-04-24

### Transcript vs runtime drift

- Watch for flows that promise "clean transcript forks" or "runtime-only state" while persistence helpers clone or replay every message row.
- Probe thread fork, retry, restore, and import flows for plan cards, milestone rows, system errors, and other transcript noise leaking into supposedly clean clones.

### Command ownership and state-transition validation

- Typed websocket contracts are not enough by themselves.
- Check that mutating commands validate project ownership, current status, and one-way lifecycle rules before changing persisted rows.
- Background jobs, approvals, retries, stop actions, and notification commands are common drift points.

### Schema-only transport promises

- A contract can validate while the runtime behavior behind it stays under-tested.
- Treat attach or reconnect transport, background control commands, and browser approval flows as risky whenever coverage stops at protocol parsing or UI dispatch.

### Top-level CLI ergonomics as product surface

- Scan `index-main.ts`, launch scripts, and packaging scripts as real user-facing CLI, not only bootstrap glue.
- Verify help text, flag validation, stdout vs stderr, machine-readable modes, and exit-code classes for `--doctor`, `bootstrap`, packaging, and startup recovery paths.

### Disabled affordance vs submit-path drift

- A disabled button is not enough when keyboard shortcuts, form submit handlers, or alternate triggers dispatch the same command through a different path.
- For chat composers, dialogs, approval forms, and schedule editors, verify that `Enter`, hotkeys, and imperative submit use the same eligibility predicate as the visible button state and tooltip reason.

### Thread-owned runtime state stored at project scope

- Watch for transport or runtime overlays that belong to one thread but are cached on whole-project state and then reused after thread activation changes.
- Live CLI sessions, terminal attach state, browser approvals, pending questions, and similar bridge-owned overlays should validate ownership on every command and rehydrate the right thread-scoped surface after reconnect.
- Probe thread switch during active bridge state, then try stop, attach, resize, retry, or capture actions from the new thread. If caller-supplied ids win over persisted ownership, UI and backend can relabel or mutate the wrong session.

### Development instrumentation as hidden product behavior

- Treat dev-only telemetry, debug fetches, local ingest hooks, and prompt or output logging as shipped risk until proven removable or explicitly configured.
- Probe runtime adapters, assistant managers, and launch paths for hardcoded URLs, swallowed debug failures, prompt snippets, terminal tails, cwd, environment data, and provider details.
- Debug code should use one shared logger, avoid sensitive prompt or output content by default, and surface local failures during development.

### Fire-and-forget async boundaries

- `void someAsyncWork()` is only safe when the callee cannot reject or the caller attaches a visible `.catch()` path.
- Probe websocket data planes, scheduler ticks, delayed timers, hot reload builders, assistant bootstrap queues, and process exit handlers.
- Failures should become durable state, toast or command rejection, job or run event, or at least a development console error that includes the triggering operation.

### Repository UI rules without enforcement

- Shared UI rules drift when they are only documented and not linted or tested.
- Probe dense run, trace, inbox, and settings surfaces for raw `title` tooltips, direct button-like markup, margin spacing utilities, arbitrary Tailwind values with canonical equivalents, and duplicated dialog or overlay shells.
- Prefer focused lint rules or small static tests for repo-specific UI bans so reviewers do not rediscover the same style regressions manually.

## 2026-04-25

### Ambient capability namespace vs scoped refs

- Treat linked skills, scripts, modes, templates, connectors, and assistant assets as risky unless they are resolved to scoped capabilities before runtime.
- Probe whether refs are only persisted or printed into prompts, or whether save and launch paths validate existence, provenance, scope, stale deletion, duplicate labels, and clone behavior.
- Broad repo-level discovery should be discoverability, not authority. Runtime prompts should make clear which capabilities are explicitly attached to the actor and which are merely available in the workspace.

### Metadata validation without resource ownership

- Treat payloads that carry remote URLs, attachment refs, session ids, or file keys as risky when schemas validate shape but not server ownership.
- Probe whether clients can bypass intended upload, auth, or attach-token flows by sending plausible metadata directly over the websocket.
- Resource-bearing commands should validate provenance, allowed origin, bounded size, active ownership, stale deletion, and whether the server can resolve the resource from trusted state.

### Unbounded stream accumulation before preview truncation

- Truncating output when persisting events is not enough if stdout, stderr, terminal buffers, or server logs are accumulated fully in memory first.
- Probe CLI runtimes, background shell jobs, screenshot/dev-server helpers, terminal sessions, and build watchers for full-string buffers fed by untrusted or long-running processes.
- Prefer bounded ring buffers, byte caps, temp-file spill for debug artifacts, and explicit failure or detach behavior when caps are exceeded.

### Passive liveness contracts

- A ping/pong schema does not prove zombie detection unless a heartbeat loop drives it and missed heartbeats change state.
- Probe control websockets, PTY attach sockets, browser approvals, and run/session ownership after sleep, network changes, reloads, and reconnects.
- Stale sockets should detach owned runtime state and reconnect should rehydrate from server-owned session identity, not caller-supplied ids.

### Streaming without workload boundaries

- Treat live token, terminal, trace, and status streams as risky unless batching, bounded persistence cadence, and slow-client behavior are explicit.
- Probe whether raw provider deltas, process chunks, or progress events emit one websocket message per tiny chunk and whether each chunk triggers database writes or full markdown rerenders.
- Streaming paths should coalesce by time or byte size, flush final state synchronously, cap per-connection queues, and degrade or detach slow consumers.

### Typed snapshots used as hot-path deltas

- A typed websocket payload can still be too broad for frequent events.
- Probe append, status, trace, and subtask updates for whole-session, whole-project, whole-workspace, or whole-run snapshots that grow with unrelated history.
- Hot events should be narrow id-addressed deltas; full snapshots should be reserved for connection ready, explicit refresh, and recovery.

### Live markdown and dense DOM growth

- Markdown correctness tests do not prove streamed markdown is cheap enough under long code blocks or frequent deltas.
- Probe live markdown surfaces for repeated syntax highlighting, full parse work, and unvirtualized transcript, trace, tool, browser replay, or log rows.
- In-flight markdown can use a cheaper renderer or debounced parse path, then run full highlighting after the message locks. Dense panes need row caps, windowing, or explicit "show more" affordances.

### Actor launch gates split across status fields

- Treat actor-owned execution as risky when pause, circuit breaker, deleted state, global pause, and project ownership are checked in separate places.
- Probe every launch path, not only scheduled work: direct chat, retry, bootstrap, manual run, resume release, scheduler catch-up, and reprioritize timers.
- Prefer one shared launch predicate that blocks on every relevant state field and is used before runtime dispatch, queue release, and background-run start.

### Hidden surface contamination

- A feature can have a dedicated surface while still writing its transcript or logs into the older main surface.
- Probe background jobs, assistants, browser approvals, and automation threads for project-chat writes, persisted prompts, or promoted summaries that later become normal chat context.
- Dedicated surfaces should own their raw transcript. Main chat should only receive explicit user-approved promotions or narrow linked status rows.

### Single-flight bootstrap and retry

- Any retryable setup, bootstrap, or self-repair flow needs an attempt id or in-memory single-flight guard.
- Probe repeated clicks, reconnect release, process reload during `running`, and stale async completions that race with newer attempts.
- Retry should join, reject, cancel, or supersede the active attempt explicitly, then persist enough state to explain which attempt won.

### Overlay stack without ownership

- Independent `Escape`, outside-click, focus, and z-index handling looks fine in single-layer tests but breaks when popovers sit inside dialogs, sheets, tutorials, or header overlays.
- Probe nested overlay priority, focus trap and release, scroll containment, tooltip/toaster layering, and whether only the topmost dismissible surface closes.
- Shared overlay primitives should own layer tokens, active-stack identity, focus cycling, and dismissal routing instead of each surface registering global listeners independently.

### Global hotkeys without input ownership

- Keyboard shortcuts can become hostile when global handlers opt out of input ignoring or only special-case one focused control.
- Probe every global shortcut from chat, assistant, scheduler, notification, preferences, and modal text inputs.
- Submit shortcuts should share the same eligibility predicate as the visible button, avoid duplicate form and hotkey paths, and leave `Shift+Enter` behavior explicit.

### Attachment affordance vs upload lifecycle

- File selection support does not imply drag/drop confidence or unsent upload durability.
- Probe drag-over/drop feedback, blocked drop states, thread or project switching with unsent chips, reload behavior, and orphan cleanup when an upload is removed before send.
- Attachment text drafts and attachment refs need an explicit ownership model so the UI does not preserve one while silently dropping the other.

### Stable test hooks vs style-coupled assertions

- Treat UI tests that assert Tailwind, syntax-highlighter, or DOM-shape classes as drift risk unless the class is itself the contract.
- Probe modal, overlay, markdown, status badge, and dense panel tests for selectors that should use `data-test-*`, accessible roles, or visible text instead.
- Style-coupled tests can make visual refactors noisy while still missing semantic regressions such as focus ownership, disabled reasons, portal clipping, and overlay priority.

### Capability-backed magic affordances

- Treat "magic" UI polish as suspect when it infers product state from local component hints instead of typed backend or store contracts.
- Probe project switchers, setup flows, run visualizations, proof bundles, and file-drop flows for missing metadata, stale ownership, OS/browser capability limits, and recovery after deletion or reconnect.
- Browser drag/drop of local folders is especially risky: without a trusted directory handle or native bridge, it should fall back to browse or explicit path entry instead of pretending an absolute root path exists.

### Motion polish as correctness surface

- Animations, glows, ambient tints, skeletons, confetti, shortcut overlays, smooth-scroll magnets, and selection popovers need shared ownership instead of one-off component state.
- Probe `prefers-reduced-motion`, keyboard focus, editable-target hotkey ownership, non-color status cues, no layout shift, and teardown on fast project/thread switches.
- Add stable hooks and accessibility assertions before treating visual delight as shippable polish.

## 2026-05-12

### Cleanup paths derived from caller cwd

- Treat any cleanup, doctor, reset, or repair command that deletes `dist`, cache, temp, or DB files as risky when the target is derived from `process.cwd()`.
- Probe packaged launchers, shell aliases, nested project cwd, and paths with unrelated build outputs.
- Destructive repair work should resolve against a trusted harness root or a verified workspace-owned path before deleting anything.

### Hidden test shims as product surface

- Hidden `sr-only` controls, duplicate headings, or fake buttons added to satisfy tests still ship to assistive technology and can mask broken visible UI.
- Probe dense panels and refactors for hidden interactive fallbacks that tests target instead of real controls.
- Prefer stable `data-test-*` hooks and accessible names on the real UI; tests should not rely on duplicate hidden controls unless they are genuinely part of the accessibility contract.

### Raw proof artifacts need redaction budgets

- Proof-rich tool details can leak secrets or prompt-like data when raw args/results are persisted and made copyable.
- Probe tool activity, browser replay, MCP payload, provider error, and shell output capture for field-level caps plus aggregate run-level budgets.
- Add shared sanitization before persistence, not only before rendering.

## 2026-06-01

### Public lifecycle commands need state-machine authority

- Treat client-visible lifecycle commands as risky when they can finalize, resume, refresh, retry, archive, or stop work without proving the current runtime owner and status.
- Probe public completion commands, deferred refresh, batch answer, thread archive, retry, and destructive delete for stale-client or forged transitions.
- Final assistant text, terminal status, run status, and notifications should commit atomically or have idempotency keys and recovery tests.

### Optimistic UI sends need acknowledgement-backed draft cleanup

- Clearing drafts or closing inbox rows immediately after dispatch is unsafe when websocket send can queue, fail, or be rejected by backend state.
- Probe disconnected send, stale project/thread rejection, global pause, preflight rejection, quick-choice buttons, and side-surface submit paths.
- Draft text, attachment refs, and expanded inbox state should clear only after an accepted acknowledgement, or restore on command rejection and dropped queues.

### Lexical path guards are not filesystem trust

- `../` checks and normalized strings do not stop symlink escapes, nested-root fingerprint drift, Windows case differences, or repo-relative paths joined under the wrong root.
- Probe IDE file reads/writes, BranchFS materialization, promotion, dirty-state fingerprints, project search/open, and cleanup commands with symlinks and nested projects.
- Prefer one realpath-aware trust helper that knows repo root, selected project root, symlink policy, and nested-project scope.

### Semantic plan invariants need validation beyond schema shape

- Zod shape checks do not prove planner contracts make sense together.
- Probe contradictory `usesSubagents`, difficulty, subtasks, same-worktree paths, prerequisites, verification scope, and isolation strategy.
- Normalize or reject inconsistent LLM plans before they persist as ready execution contracts.

### Post-slice caps can hide unbounded hydration

- UI row caps and protocol array limits do not protect startup when code loads, parses, or stringifies all rows before slicing.
- Probe assistant logs/messages, tool activities, terminal scrollback, markdown streams, and expanded sidebar rows with large single-owner fixtures.
- Move limits into SQL, selectors, virtualization boundaries, and lazy copy/export paths.

### Provider caches need credential and namespace identity

- Model ids and cached remote content are scoped by provider namespace, account, credential, and sometimes model.
- Probe provider brand switches, stale persisted model ids, API key rotation, attachment cache reuse, and provider-specific fallback.
- Cache keys should include account or credential identity when provider resources are not portable across keys.

### Portable launchers need release-specific health contracts

- Source repair commands can become false guidance inside packaged launchers.
- Probe extracted release directories without source `node_modules`, lockfiles, or dev scripts.
- Runtime health should either package native assets or explain launcher-specific reinstall/update repair, not silently run source checkout repair in the release folder.

## 2026-06-15

### Derived readiness snapshots must follow source mutations

- Treat setup health, activation checklists, tutorial progress, and similar readiness sidecars as stale unless every source-state mutation refreshes or invalidates them.
- Probe project add, activate, remove, preference save, runtime refresh, and repair actions for paired source event plus readiness event ordering.
- Dismiss or completion UI should not imply progress when the underlying readiness predicate still fails.

## 2026-06-24

### Browser-layout primitives can outgrow Happy DOM coverage

- Treat virtualizers, resize-driven panes, sticky scroll regions, split panels, and tab-mounted dense lists as risky when tests only assert DOM rows under Happy DOM.
- Probe first browser paint before any tab switch, then compare after tab switch or remount; remounts can hide zero-height, stale measurement, and scroll-anchor defects.
- Browser coverage should assert visible row geometry, scroll canvas height, row non-overlap, and anchor position with deterministic seeded data. Happy DOM tests remain useful for pure helpers and dispatch behavior, but not for layout correctness.

## 2026-06-25

### Collapsed intervention labels

- Treat "approval", "blocked", and "needs input" as risky labels when multiple gates can stop the same run.
- Probe background jobs, assistants, browser tools, global pause, circuit breakers, and planner questions for distinct reason metadata, policy readback, inline actions, and matching filters.
- Auto-run settings should name exactly which gates they bypass and which gates remain human- or reviewer-mediated.

## 2026-06-28

### Missing durable intent contract

- Treat multi-step assistant spawning as risky unless the original user objective is compiled into one durable outcome contract before jobs are created.
- Probe whether spawned assistants, recurring jobs, todos, and memories preserve the inferred objective, artifact class, quality bar, evidence, non-goals, and stop conditions.
- Runtime launch should reconcile local persona/job prompts against that contract so bespoke user phrasing can still produce best-practice deliverables.

### Editable metadata vs executable prompt drift

- Treat any model-facing workflow as risky when similar intent can live in display descriptions, definition prompts, actor prompts, todos, memories, and chat transcripts.
- Probe whether the field edited by UI, scripts, or bulk maintenance is the exact field rendered into the runtime prompt.
- Prompt previews and tests should cover every intent-bearing field separately, then assert the launched prompt contains the current executable mission and excludes stale guidance.

### Todo backlog bloat without acceptance details

- Treat assistant or job prompts as risky when they include large todo lists but omit todo descriptions, acceptance notes, or ranked stop conditions.
- Probe bulk-generated todos for duplicate titles, stale completed work, blocked rows that outrank app-code work, and token-heavy lists that hide the top executable target.
- Runtime prompt builders should cap, dedupe, rank, and include bounded details for the top work instead of dumping every active row.

### Bulk selection without bulk command authority

- Treat multi-select UI as risky unless the same selected set can be previewed and applied through typed backend commands and chat/script handoffs.
- Probe delayed selection gestures, Shift range selection, Ctrl/Cmd toggles, right-click selected-set menus, filter changes, reconnects, stale ids, mixed project scope, active runs, and deleted assistants/jobs.
- Bulk operations need scoped target resolution, destructive confirmation, idempotency, per-item results, and durable partial-failure readback instead of repeated single-row command dispatch.

## 2026-08-22

### Always-on legacy transforms can collide with current state

- Idempotent-looking startup normalization becomes destructive when a later feature gives an old sentinel or status new meaning.
- Probe every unconditional migration update against current writable states, especially archive, delete, retry, pause, and completion fields.
- Use ordered schema versions for one-time transforms, keep current-state repair separate, and cover close/reopen boundaries with file-backed databases.

### Green tests can leave red resource residue

- Retried cleanup that silently gives up hides open handles, watcher leaks, child processes, and database ownership gaps.
- Inspect ignored temp roots by count, age, and size; check whether they live under source include or search roots.
- Test scopes should dispose owners before deletion, report retained artifacts, and use one run-owned temp root outside the repository when possible.

### Type-safe hubs still need domain ownership

- Exhaustive schemas and switches prevent malformed shapes but do not make a ten-thousand-line router or repository easy to reason about.
- Measure file size, command-branch count, method count, import cycles, duplicate blocks, and recent co-change hotspots before proposing extraction.
- Split by product domain with thin typed boundaries; avoid replacing one hub with a generic framework that hides lifecycle rules.

### Self-tested scaffolding can masquerade as coverage

- A file imported only by its own test can pass forever without any production entrypoint or user path.
- Probe benchmarks, compatibility helpers, environment adapters, scripts, and primitives for real consumers, documented entrypoints, and measured behavior.
- Static reachability needs explicit allowances for workers and script entrypoints, plus direct-dependency checks for runtime imports.

### Diagnostic probes must fail closed

- Treat preflight, health, dirty-state, credential, and capability checks as unsafe when command failure is converted into a clean or available result.
- Probe nonzero exits, unreadable metadata, lock contention, timeouts, malformed output, and missing tools separately from valid negative results.
- Failure should block the guarded action with actionable detail unless the user explicitly disabled that guard.

### Owned process cleanup must span startup failure and shutdown

- A `finally` block only helps after ownership reaches its outer scope; child startup can fail after spawn but before returning the handle.
- Probe readiness timeout, early exit, catchable signals, abrupt parent loss, process-tree descendants, stale PID reuse, and idempotent repeated cleanup.
- Keep ownership metadata narrow enough for safe recovery and never replace it with broad executable-name killing.

## 2026-08-23

### Negative environment checks can enable destructive recovery in releases

- Treat `ENV !== "production"` as unsafe authorization for deletion, purge, migration repair, or malformed-row pruning; unset and unknown environments satisfy the check.
- Probe compiled and packaged artifacts with ambient environment variables absent, not only source development and explicitly production-tagged tests.
- Pass an explicit recovery capability or launch mode, default unknown contexts to fail closed, and keep user-data repair behind an intentional command.

### Parent-table rebuilds can cascade-delete dependent history

- With SQLite foreign keys enabled, renaming a parent rewrites child references; dropping the renamed parent can trigger `ON DELETE CASCADE` before later child-table repair runs.
- Probe migrations with populated parents, children, and optional references, then inject failure between every DDL phase and reopen the file-backed database.
- Version and transaction-wrap schema changes, rebuilding parent and dependent tables as one atomic unit with row-count and foreign-key checks before commit.

### Exhaustive transport schemas can still have unowned UI events

- A typed event union is not end-to-end coverage when broad dispatch sends every event to several reducers with silent defaults.
- Probe each server event for exactly one authoritative consumer, visible acknowledgement where required, and exhaustive `never` handling after domain routing.
- Preview, result, rejection, progress, and lifecycle events are highest risk because backend tests can prove their shape while the product silently ignores them.

### Cross-target packages can smuggle host-native assets

- Compiling for a target triple does not retarget binaries copied from host `node_modules` or names derived from `process.platform`.
- Probe every supported OS/architecture pair for executable name, binary format, permissions, and matching optional-package resolution.
- Pass target identity into asset packaging and verify extracted artifacts on or against the target contract.

### Generic test flags can bypass suite isolation

- Treat test runners that choose segmented versus raw execution from `args.length` as risky; options such as timeout, coverage, or worker count are not test selectors.
- Probe default invocation, generic forwarded flags, explicit files, globs, and delimiters for working directory, target scope, environment setup, and serial/parallel ownership.
- Parse runner options separately from selectors and apply generic flags to the intended isolated segments.

### Self-tested shared packages can be architecture placeholders

- A green package with no production consumer does not own the behavior its name or documentation advertises.
- Probe shared path, preference, UI, protocol, and runtime packages for real imports from every claimed first-party consumer and for parallel local implementations.
- Either migrate production callers to the boundary or remove/defer the package; do not let self-tests create false confidence.

### Release globs can discard directory-shaped artifacts

- Treat a successful packaging step as insufficient evidence that the release contains the artifact, especially when output is a directory and upload inputs use a shallow glob.
- Probe the final expanded upload set, missing-file failure behavior, archive contents, executable permissions, and an extracted-artifact smoke before publication.
- Upload explicit versioned archive files and make an absent match fail the release.

### One command spanning several persistence owners is not atomic by default

- Treat save commands as risky when they mix optional compatibility fields, database metadata, OS credential stores, live adapters, and asynchronous refresh work.
- Probe omitted fields from older clients and inject failure after every owner transition; rejection must not conceal a partially committed snapshot.
- Define patch versus replacement semantics, transaction-wrap one persistence owner, and use staging/reconciliation plus an authoritative acknowledgement across external owners.

### Replaceable asynchronous resources need identity guards

- Treat sockets, readers, saves, searches, and project-scoped caches as unsafe when callbacks outlive the resource or scope that created them.
- Probe replacement with late open, message, close, error, and acknowledgement callbacks; key caches by full ownership identity, not display-relative paths.
- Capture a generation or `(scope, request)` identity and mutate state only when the current registry entry still matches.

### Pointer interactions need a complete cancellation lifecycle

- Treat window-level drag listeners as leaked state unless pointer capture, `pointercancel`, lost capture, blur, replacement drag, and component disposal are owned together.
- Probe mouse, touch, pen, unmount, and keyboard equivalents; a focusable sash without separator/value semantics is not accessible resizing.
- Reuse one tested interaction owner and keep domain-specific size calculation or persistence in thin adapters.

### Failure reporters must be safer than the failure path they describe

- Treat crash logging and fatal diagnostics as best-effort side effects that must never replace the original error or prevent the intended exit path.
- Probe stderr failure, read-only directories, full disks, antivirus locks, malformed paths, and recursive fatal hooks before marking an error captured.
- Capture original failure identity first, guard every output independently, and keep a no-allocation/no-filesystem fallback.

### Durable enqueue needs atomic persistence and recoverable dispatch

- Treat a scheduler as lossy when it advances due time separately from run creation, initial history, and dispatch ownership.
- Probe process exit after every persistence step and reopen with queued rows that have no live worker; an "active" check is not recovery.
- Commit the durable occurrence atomically, then dispatch through an outbox or a startup/tick path that can claim and launch committed work idempotently.

### Focus traps must model tabbability, not selector membership

- Treat a modal trap as leaky when it computes boundaries from selector matches without filtering disabled, hidden, detached, or inert controls.
- Probe immediate reverse traversal while the root itself owns focus, dynamic control removal, nested overlays, and both wrap directions in a real browser.
- Keep one shared focusability and top-overlay authority; `aria-modal` does not enforce containment by itself.

### Compiled launchers cannot self-update by mutating adjacent dependencies

- Treat package-manager success as false evidence when the running launcher statically bundled the dependency being updated.
- Probe source and portable launch modes separately, restart the artifact, and verify the active runtime version rather than a nearby manifest or install tree.
- Portable updates need verified executable replacement and rollback; dependency mutation belongs only to source-style layouts.

### Roving-focus menus still need Tab-exit ownership

- Arrow navigation and `tabIndex=-1` do not define what happens when Tab or Shift+Tab leaves a menu.
- Probe real-browser default traversal, nested overlays, visible-open state, and the destination of focus after both exit directions.
- Menu primitives should dismiss and transfer focus explicitly; dialog-style focus trapping is a separate behavior contract.

### Loopback binding is not browser-origin authentication

- Treat localhost HTTP and WebSocket control planes as reachable by any browser page unless every privileged handshake enforces origin and capability policy.
- Probe foreign and null origins for initial-state disclosure, mutation commands, token minting, and secondary socket attachment—not only one native HTTP route.
- Centralize admission across all endpoints, require an unguessable per-launch/session capability, and model native non-browser clients explicitly.

### Release asset discovery needs exact product identity

- Treat first-match regex selection as unsafe when one release contains several products, platforms, architectures, or similarly named portable archives.
- Probe every asset order, ambiguous matches, missing targets, and unrelated product names against the same release fixture.
- Publish an exact naming contract or structured manifest and reject ambiguity instead of guessing.

### Reusable input primitives need a stable naming contract

- Treat placeholder-only inputs as unnamed controls; hint text is not a durable programmatic label and disappears as the user types.
- Probe multiple instances and populated values through the accessibility tree, not structural selectors or placeholder queries.
- Make `aria-label` or `aria-labelledby` an explicit shared API requirement and keep placeholder semantics separate.

### Port fallback can create split-brain ownership

- Treat automatic random-port retry as unsafe when processes share a database, scheduler, credential sidecar, or in-memory runtime snapshot.
- Probe two real processes against one home for mutual exclusion, broker reuse, change visibility, concurrent read/modify/write loss, and stale-lock recovery.
- Prefer one authenticated single-writer broker; otherwise isolate storage or build explicit cross-process coordination before permitting multiple servers.

### Release version identity must survive build and comparison

- Treat hardcoded runtime versions, package versions, and tag names as divergent authorities unless the release proves equality.
- Probe prerelease/revision suffix ordering, stale constants, arbitrary accepted tags, and the version reported by the extracted artifact.
- Use one SemVer-compatible source, inject or gate it during packaging, and compare the full identity used to distinguish releases.

### Roving tab stops must reconcile dynamic collections

- Treat a collection widget as inaccessible when controlled selection, disabling, insertion, removal, or filtering can leave every enabled item at `tabIndex=-1`.
- Probe empty-to-populated, selected removal, selected disablement, invalid controlled values, visibility changes, and all-disabled-to-enabled transitions.
- Share the tab-stop invariant while keeping widget-specific selection semantics separate.

### Compressed-byte limits do not bound document extraction

- Treat archive/PDF uploads as unbounded until entry count, expanded bytes, compression ratio, relevant-entry selection, page/node count, output, time, and cancellation are all enforced before eager allocation.
- Probe small hostile archives, page-heavy documents, irrelevant media entries, repeated historical processing, and budget exhaustion before fetch.
- Centralize resource-budgeted extraction, cache by immutable content identity, and isolate hostile parsing from the main server process.

### Overflow ownership cannot rely on guessed geometry

- Treat fixed-width capacity estimates as unsafe for real labels, fonts, density, zoom, localization, icons, gaps, and wrappers.
- Probe content and font changes without container resize, and assert every action appears exactly once in the visible set or overflow menu.
- Measure actual geometry or choose a simpler all-or-menu policy; clipping is never a substitute for overflow ownership.

### Executable instruction sync needs provenance, not mtimes

- Treat timestamp-based directory copying as unsafe for managed skills, scripts, rules, and other model-executable content.
- Probe clock skew, user edits, upstream deletion, partial copy, downgrade, and rollback; recursive copy without replacement preserves stale files.
- Use versioned hash manifests, atomic whole-directory replacement for unmodified managed content, and explicit fork/conflict ownership for edits.

### Form-row titles do not label sibling controls automatically

- Treat a visually adjacent heading as unrelated unless the input uses a real label, `aria-labelledby`, or an equivalent programmatic relationship.
- Probe control lists with several toggles/ranges and assert names remain stable as `On`/`Off`, numeric values, and units change.
- Share stable title/description ids across every rendering branch; current value belongs to value semantics, not the accessible name.

### Bundled skills must execute in the packaged working layout

- Treat copied instruction text as broken until every documented command resolves from both its source default working directory and extracted release layout.
- Probe script registration, implementation inclusion, runtime dependencies, and capability advertising after packaging—not only whether skill files were copied.
- Ship a launcher-owned entrypoint or exclude repo-only workflows from the portable skill bundle.

### Optional child environment objects can invert least privilege

- Treat `env: undefined` as full parent-environment inheritance and a sparse `env` object as baseline replacement; neither automatically means “only requested refs.”
- Probe unrequested sentinel secrets, required PATH/system/temp/home variables, missing refs, intentional empty values, and the authority shown in approval UI.
- Build one documented safe baseline, add explicit authorized refs, and derive risk from the effective child environment.

### Global skill scripts cannot assume project-relative installation

- Treat `.agents/skills/...` commands as ambiguous when instructions are globally installed but execution cwd belongs to an arbitrary user project.
- Probe every scripted example from a foreign project in source and extracted layouts, separating implementation location from output cwd.
- Resolve through the selected skill resource or a host-owned runner instead of hard-coded project-relative paths.

### Reactive targets and long-lived subscriptions need one identity

- Treat mounted editors/readers as unsafe when a subscription captures the initial prop but mutation/save callbacks dereference the latest prop.
- Probe A-to-B target changes, late A notifications, dirty state, saves, and read-only changes without relying on incidental parent remounting.
- Rebind all lifecycle parts atomically under one generation, or enforce immutable identity in the component API.

### Copied scripts do not inherit workspace dependency closure

- Treat bare imports in bundled/global scripts as missing until packaging carries a manifest, lock, modules, or compiled artifact reachable from the installed location.
- Probe execution from an isolated extracted home with repository and hoisted `node_modules` unavailable.
- Bundle dependencies into a launcher-owned command or give the skill an explicit reproducible managed install boundary.

### Hiding a focused region requires focus handoff

- Treat collapse/hide as incomplete when the active element can remain inside an `aria-hidden`/hidden ancestor or fall back to the document.
- Probe internal controls, external state changes, fullscreen transitions, and multi-panel collapse with real subsequent Tab order.
- Transfer owned focus to the surviving reveal handle or a documented workspace fallback, while preserving focus outside the collapsed region.

### Per-record caps do not define aggregate retention

- Treat insertion-order slicing as unsafe when active and historical records share one collection; oldest-first maps can permanently exclude all new work.
- Probe beyond every storage/history limit with mixed active/closed recency, restart, layout references, orphan payload keys, and aggregate serialized bytes.
- Define retention before serialization, prioritize live/newest records, and prune every dependent payload to the retained identity set.

### Same-named instruction sources need one precedence registry

- Treat concatenated global/project skill paths as ambiguous when documentation promises override semantics.
- Probe identical names, provenance, malformed metadata, case normalization, and parity across prompts, capability resolution, and UI inventory.
- Resolve collisions once through an explicit project-over-global registry and expose diagnostics instead of letting the model choose.

### Disabled reasons need a keyboard-reachable trigger

- Treat native disabled controls wrapped by an unfocusable tooltip span as pointer-only explanations.
- Probe tab order, stable `aria-describedby` targets, Enter/Space/click suppression, form behavior, and overflow-menu variants.
- Model disabled-with-reason explicitly, usually with `aria-disabled` plus centralized activation suppression and persistently mounted description content.

### Persisted relative paths need an explicit semantic base

- Treat `path.resolve(value)` as ambient-process behavior unless the owning project/workspace base is passed explicitly.
- Probe source and portable cwd, multi-project operation, restart, symlinks, nested roots, and absolute/out-of-project authority.
- Persist scoped path intent and resolve it through one project execution boundary shared by every subprocess owner.

### Maintenance tools must consume authoritative storage paths

- Treat duplicate environment/path resolvers as dangerous when one process serves data and another script can mutate it.
- Probe absolute, relative, tilde, empty, source/portable, and differing-cwd values for exact identity before any write.
- Canonicalize once in the owning runtime and pass the authoritative path to managed tools instead of reinterpreting ambient configuration.
