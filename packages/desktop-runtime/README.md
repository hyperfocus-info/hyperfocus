# Desktop runtime

Opt-in `/automation/playwright` provides `setNativeDesktopViewport({page,width?,height?})`
(1440 by 1000 by default) through the canonical native CDP viewport owner, with
session detachment on success or failure and no emulated fallback.
`captureViewportScreenshot({page,path})` brings the page forward, captures only
its viewport and rejects width changes. These APIs use real Playwright types;
install the optional `playwright-core` peer only when using this subpath.
Core entries do not load these adapters.

`/automation/windows-inspection` also provides `inspectBrowserWindows({pid,expectedProcesses?})`.
It labels non-Windows inspection inapplicable and requires the original root
creation identity when a recorded process list is supplied for cleanup.

`/automation/managed-server` provides `startManagedServer({supervisor:{command,cwd},surface,env,healthPath?,inheritEnvironment?,localAuth?})`.
It is a client of the existing supervisor CLI's isolated start/stop JSON protocol;
the host supplies its command and working directory. It waits for health, returns
the owned ID/URL/PID and `close()`, and stops that ID before cleaning its CLI process.
It owns no registry, surface catalog or application environment policy. Website
and Books verification use the repository supervisor through this adapter.
Focused contract tests mock process and health boundaries without starting services.
`localAuth: true` forwards the supervisor's explicit `--local-auth` option on the
isolated start; the selected host must support and validate it. The
[repository supervisor](../../.agents/skills/dev-server/references/surfaces.md#local-auth-startup)
owns environment and auth policy, and omission preserves the default argv.

`/filesystem` exposes `removeOwnedDirectory({directory,parent,timeoutMs?,retryDelayMs?})`
for caller-owned temporary direct children. It checks lexical and resolved parent
boundaries, rejects escaping junctions, and bounds retries for transient Windows
handle locks; other errors propagate. Close owned processes first. Browser profile
cleanup retains its dedicated-name check and shares this implementation with
disposable evaluator-fixture cleanup. This API does not grant ownership of a path.

`/automation/cdp-session` owns the framework-neutral CDP WebSocket command/event
session used by editor automation and video auditing. Each connection owns its
pending requests and timers; callers close it with the browser. Responses and
disconnects clear pending timers/listeners, and timeouts reject only their request.
Disposed sessions reject subsequent commands immediately with the first close
reason and cannot install listeners or deliver late events.

Small, framework-neutral primitives for applications that use a local server and the system browser as their desktop surface.

It provides custom-protocol target parsing, file-or-folder launch resolution,
last-client shutdown leases, opt-in update checks, and a framework-neutral
`@hyperfocus/desktop-runtime/dev-server` HMR batcher. The batcher coalesces rapid
save storms behind a shared 2.5 to 15 second exponential quiet window. Update
sources are injected by consumers; the package does not assume a release host or
install updates without an explicit consumer action.

The injected development reload client dispatches the cancelable
`hyperfocus:before-dev-reload` event. Applications can prevent it during an owned
export or other critical operation; the client retains the pending revision and
retries after 500 ms. Ordinary reloads continue once the application releases it.

Version comparison includes prerelease precedence and ignores build metadata, so a
stable release upgrades its release candidates. It accepts optional `v` tags and
short numeric versions (`1.2` equals `1.2.0`), rejects malformed suffixes and numeric
identifiers with leading zeros, and limits input to 256 characters. File ownership
checks reject parent traversal segments while accepting child names like `..notes`.

The privileged `/process` subpath runs commands with named argv/options, hidden
Windows consoles, captured streams, and explicit tree cleanup. `/automation`
launches muted headless Chrome with an owned disposable profile and a guardian that also
cleans up if the calling process dies. `launchHeadlessBrowser` returns the owned
CDP port and `close`; `connectHeadlessBrowser` also accepts an injected driver
connection callback and closes the process on connection rejection or timeout.
Owned launches default to `extensions: 'disabled'`: ordinary extensions and
background component extensions are suppressed. Hosts with a visible browser
owner share `browserExtensionArguments`; the Touch of Death lab uses it too.
Pass `extensions: 'enabled'` for an explicit extension test. Conflicting raw flags
are rejected before launch. This changes only owned profiles, never an existing
personal Chrome window. Verify observed extension targets/contexts when isolation
is material; browser flags alone are not evidence of suppression.
The caller closes the returned session in `finally`. Playwright and Puppeteer
remain caller dependencies. The process adapter targets Node/Bun; the automation
runner and guardian execute with Bun, including built JavaScript entrypoints.
`setAuditViewport` measures and resizes the owned CDP window with bounded retries.
Its explicit emulated mode labels input evidence as main-frame-only; native mode
never silently falls back to emulation. Editor art verification and user audits
share this implementation.
Hosts that bundle `/automation` also bundle the executable
`@hyperfocus/desktop-runtime/automation/guardian` entry as `browser-guardian.js`
beside their host bundle. The extracted Editor exercises this distribution path.
`/automation/windows-inspection` provides creation-time-aware process-tree and
visible-window inspection to hosts without depending on repository scripts.
Both subpaths stay separate from the portable root exports.
Automation mutes browser output at launch so game and media tests never play audio
on the developer's speakers. Web Audio processing remains available for signal tests.
Async piped output accepts an optional `maxBuffer` byte limit per stream. Reading
beyond it rejects that stream with a `RangeError` and terminates the owned process
tree; output is never silently truncated. Without a limit, streams retain normal
backpressure. The synchronous capture defaults to 64 MiB.
Omitting output modes exposes readable stdout/stderr pipes. A writable stdin
sink is exposed only for `stdin: "pipe"`; byte-array input is sent and closed by
the adapter, so its public stdin is null.
The privileged `/dev-process` subpath runs a backend with scoped filesystem watches,
debounced source changes and awaited process replacement. Watch app-root files with
`{ path, recursive: false }` and list shared source directories separately so large
`.local` materializations never enter the watcher. Watches compare
content-relevant file metadata (identity, size, modification time, permissions) to
ignore access-only notifications and log each changed path before restarting.
The watcher handles creation, deletion and rename without reading source contents.
Dependency filters run only after a relevant metadata change, so a filter may
inspect imports without making file reads trigger more rebuilds. UI build watchers
can share `createDevWatchState({ source, recursive, accepts })` from `/dev-process`:
`accepts` prunes generated paths, including directories; `changes(path)` returns
only modified, added or removed source paths. Ordinary file events compare one
cached signature rather than scanning the tree.
Windows tree replacement uses the process adapter's forced cleanup; finish active
work before backend edits. If the backend fails while source watches are active,
the watcher reports the exit and waits for another edit, so correcting a syntax
error restarts it without creating an automatic crash loop. Successful exits always
finish the wrapper; with no watch paths, any child exit code is returned. Abort or
process signals close every watcher and stop the owned child. The portable
`/dev-server` batcher remains OS independent.
See [process lifecycle](../../docs/development.md#process-and-browser-lifecycle)
for ownership rules and the real Windows verification gate.

Related: [distribution](../../docs/distribution.md), [architecture](../../docs/architecture.md), and [package testing](../../docs/package-testing.md).
