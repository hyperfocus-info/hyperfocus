# `@hyperfocus/ai-runtime`

Privileged, app-embeddable AI execution for Hyperfocus first-party applications.

`/quality` provides host-owned rule selection, hashed context receipts and versioned
handoffs over the portable `@hyperfocus/ai-core/quality` contracts. `run` returns an
optional quality trace; existing clients remain compatible. Adapters report delivery
only at their real submission boundary. Proposals carry no rendered-UX pass; hosts
must verify the applied candidate. [Quality lifecycle](../../docs/design-system/agent-workflow.md#observable-quality-obligations)
owns profiles, evidence semantics and unsupported boundaries.

`/quality/execution` owns the common admission, prerequisite replay, frozen project
quality checks and post-work command sequence. Harness and the repository's
agent-neutral `inspect:outcome --execute` CLI consume this same implementation.
`/quality/commands` supplies bounded hidden argv execution and command parsing;
callers retain authorization and cleanup ownership. No model or Harness session is
required. [Outcome execution](../../docs/agent-outcomes.md#one-execution-path-for-every-agent)
owns task-file usage and acceptance limits.

`/connections`, `/connections/codex`, `/operations` and `/browser-grants` supply
host-owned provider adapters, official device authorization, durable operation
state and scoped browser handoffs. [Remote Connections](../../docs/harness/connections.md)
owns lifecycle and security contracts. These extend the existing credential store;
they do not implement a new token broker or copy local credentials.
Hosts may supply `readSubscription` to the Codex connection adapter for serialized
recovery. `readCodexSubscription({ refreshToken: true })` requests official token
renewal; the default remains inspection without a forced refresh. Codex owns the
saved credentials and replacement tokens in the selected provider home.

`@hyperfocus/ai-runtime/agent-events` provides host-owned SQLite subscriptions,
immutable events and explicit acknowledgements. Its `/mcp` subpath exposes bounded
native agent tools; hosts supply authentication, project authorization, body limits
and cancellation. [Swarm continuation](../../docs/harness/swarm.md#campaign-ownership-and-agent-continuation)
is the implemented consumer. Disconnected clients are not execution owners.
It discovers direct-provider models, resolves credentials without exposing them to
browser UI, and accepts additional agent adapters supplied by a host application.
Direct adapters declare installed general-purpose defaults for the three shared
providers; `createDirectProviderAdapter({ defaultModelIds })` lets a host override
those declarations. Missing models never enter a provider's default. CLI adapters
declare their native `default` route. Other adapters own their model semantics.

The package is not an application server. An app may call the runtime directly or
mount `createAiRuntimeHttpHandler` in its own local process. Provider credentials
use the current Windows user's DPAPI vault; other platforms deliberately fall back
to process memory until a native credential-vault adapter exists.

Provider and reasoning defaults use `createSharedAiPreferencesStore` from
`@hyperfocus/ai-runtime/preferences`. It reads the latest machine-user file on each
call and atomically replaces the complete validated preference object on write.
The Windows path is `%APPDATA%/Hyperfocus/ai/preferences-v1.json`; macOS uses
`~/Library/Application Support/Hyperfocus/ai` and Linux uses
`$XDG_CONFIG_HOME/Hyperfocus/ai` (or `~/.config/Hyperfocus/ai`). Missing files mean
no defaults; malformed files report a repairable error. Explicit app profiles win.
The retired design-guidance preference is ignored on read and removed on the next
explicit write; reads never rewrite user files. Design context is derived per task
by the portable AI contracts, independently of these settings.

HTTP `GET`/`PUT /api/ai/v1/preferences` and native `getPreferences`/`setPreferences`
envelopes use the same contract. Tests inject `preferencesStore` or its `filePath`
and never write the user's settings. Run `bun test ./packages/ai-runtime/src/preferences/`
from the repository root for storage and transport checks. Native envelope tests
do not certify a rebuilt PadPilot binary or a live DAW session.

Shared defaults contain no secrets. Editor and PadPilot use this package's shared
credential vault; Harness retains its separate protected credential store.

`@hyperfocus/ai-runtime/swarm` supplies execution providers, immutable source
snapshots and durable artifact storage for the [Harness swarm](../../docs/harness/swarm.md).
`createSwarmS3Client` requires the provider's explicit `path` or `virtual-hosted`
URL style. For virtual-hosted buckets it qualifies the endpoint with the bucket
name before passing it to Bun; credentials stay in the trusted host.

JSON remains the HTTP/native default. The HTTP handler accepts bounded JSON or
`application/vnd.hyperfocus.value+protobuf`; an explicit protobuf `Accept` or request
content type selects a binary response. Native file replies use the request's
encoding. These opt-in comparison paths share validation and cancellation behavior;
the [serialization policy](../../docs/serialization.md) gates any default change.

Unavailable optional CLI adapters remain visible in a valid catalog and do not
block other adapters. Execution checks availability and credentials for the selected
profile; catalog reads reflect subsequent credential changes. Runtime methods may
be passed as standalone callbacks.

Catalog reads accept optional `agentId`, `providerId`, `search`, and `availableOnly`
filters. HTTP `/catalog` accepts the same query parameters; CLI catalog envelopes
accept `query`. Filtered results retain a consistent graph and leave the default
complete catalog available. Codex model discovery reads the installed CLI's
`debug models` result, caches it for five minutes, and retains the agent-default
choice when discovery is unavailable.

CLI adapters send prompts through stdin, keeping project context out of command-line
length limits. Input is capped at 8 MiB of UTF-8; output and process lifetime remain
bounded, and failure or timeout terminates the child before cleanup. Codex uses
`exec -`; Copilot uses piped input without a `-p` argument. See the
[Codex stdin contract](https://learn.chatgpt.com/docs/non-interactive-mode) and
[Copilot programmatic input contract](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically).

`runtime.run(request, { signal })` owns cancellation through adapter cleanup.
Requests may carry `deadlineAt` (Unix milliseconds) across HTTP or native transports;
the runtime caps execution at ten minutes and rejects an expired request before
launch. This deadline includes catalog preflight. `runtime.catalog(query, { signal })`
also cancels discovery; HTTP GET and native catalog requests propagate that signal.
Only completed Codex model discoveries are cached, and canceled discovery reaps
its owned child before allowing retry. HTTP disconnect signals reach the adapter. Direct providers receive the
signal; CLI adapters terminate and reap their process tree before rejecting. A late
successful adapter response cannot turn an aborted request into success. Custom
adapters must observe `run`'s third argument and `listCatalog`'s second argument
(`signal`), and settle only after their owned work stops; the runtime cannot forcibly
stop arbitrary in-process adapters.

For opt-in Windows acceptance against an actual compiled runtime, run from the
repository root:

```sh
bun scripts/ai-runtime/verify-cancellation.ts --executable <runtime.exe> --live-codex --model <installed-model-id>
```

This uses the locally installed Codex account and may incur usage; it does not
install or authenticate a CLI. It sends a fixed harmless reasoning request, owns
a disposable working/data directory, tests cancellation before launch and during
an observed real Codex execution, and checks actual visible windows and surviving
processes. The JSON report binds evidence to the executable SHA-256. No live
execution observed is a failed acceptance result, not inferred authentication.
The probe sends no credential mutations and never writes an application project;
Codex still manages its own account state. Pass only a trusted runtime executable.

On 2026-09-11 this passed against a fresh compile of `src/cli.ts`: both cancellation
cases returned failure, the live process tree had no visible windows or survivors,
and its disposable sentinel was unchanged. This proves the executable file
transport and process cleanup. It does not exercise the C++ cancellation callback,
WebView teardown, DAW editor close/reopen, or live Copilot restrictions. Installed
FL Studio and offline processor captures do not provide that native AI acceptance.

PadPilot's file runner accepts `--cancel <marker-path>`: creating that file aborts
the request and writes failure only after cleanup. The native host owns marker
creation/removal and waits for the original invocation to finish. This is separate
from browser fetch cancellation, which only confirms that the browser stopped waiting.

CLI restrictions are explicit invocation policy, not a claim that prompt text is a
sandbox. Codex uses `--sandbox read-only`, `--ignore-user-config`, and
`--ignore-rules`; local `codex-cli 0.153.4` help verified those switches on 2026-09-10.
Copilot denies `read,shell,write,url,memory` operations and disables built-in MCPs
using [documented CLI controls](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
User-installed CLI extensions remain user-managed; the adapter does not advertise
all tools as disabled. Copilot was unavailable on the validation machine, so its
live enforcement is not certified. Unsupported CLI flags fail visibly rather than
falling back to an unrestricted launch. Invocation tests prove the flags and signal
forwarding; they do not certify third-party sandbox implementation.

Related: [package testing](../../docs/package-testing.md).
